import type { DataQuality } from '@lp-mine/core'
import { DatabaseSync } from 'node:sqlite'
import { getAddress, type Address } from 'viem'
import type { PoolSnapshot } from './index.js'

export type PoolObservationQuery = {
  fromBlock?: bigint
  toBlock?: bigint
  limit?: number
}

type ObservationRow = {
  chain_id: number
  pool_address: Address
  block_number: string
  observed_at: string
  token0_address: Address
  token0_symbol: string
  token0_decimals: number
  token1_address: Address
  token1_symbol: string
  token1_decimals: number
  fee_tier: number
  sqrt_price_x96: string
  tick: number
  tick_spacing: number
  active_liquidity: string
  quality: string
  warnings_json: string
}

export class SqlitePoolObservationStore {
  readonly #database: DatabaseSync

  constructor(path: string) {
    this.#database = new DatabaseSync(path)
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS pool_observations (
        chain_id INTEGER NOT NULL,
        pool_address TEXT NOT NULL,
        block_number TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        token0_address TEXT NOT NULL,
        token0_symbol TEXT NOT NULL,
        token0_decimals INTEGER NOT NULL,
        token1_address TEXT NOT NULL,
        token1_symbol TEXT NOT NULL,
        token1_decimals INTEGER NOT NULL,
        fee_tier INTEGER NOT NULL,
        sqrt_price_x96 TEXT NOT NULL,
        tick INTEGER NOT NULL,
        tick_spacing INTEGER NOT NULL,
        active_liquidity TEXT NOT NULL,
        quality TEXT NOT NULL CHECK (quality IN ('complete', 'partial', 'stale')),
        warnings_json TEXT NOT NULL,
        PRIMARY KEY (pool_address, block_number)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS pool_observations_block
      ON pool_observations(CAST(block_number AS INTEGER));
    `)
  }

  saveSnapshots(snapshots: readonly PoolSnapshot[]): number {
    if (snapshots.length === 0) return 0

    const insert = this.#database.prepare(`
      INSERT INTO pool_observations (
        chain_id, pool_address, block_number, observed_at,
        token0_address, token0_symbol, token0_decimals,
        token1_address, token1_symbol, token1_decimals,
        fee_tier, sqrt_price_x96, tick, tick_spacing,
        active_liquidity, quality, warnings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pool_address, block_number) DO UPDATE SET
        chain_id = excluded.chain_id,
        observed_at = excluded.observed_at,
        token0_address = excluded.token0_address,
        token0_symbol = excluded.token0_symbol,
        token0_decimals = excluded.token0_decimals,
        token1_address = excluded.token1_address,
        token1_symbol = excluded.token1_symbol,
        token1_decimals = excluded.token1_decimals,
        fee_tier = excluded.fee_tier,
        sqrt_price_x96 = excluded.sqrt_price_x96,
        tick = excluded.tick,
        tick_spacing = excluded.tick_spacing,
        active_liquidity = excluded.active_liquidity,
        quality = excluded.quality,
        warnings_json = excluded.warnings_json
    `)

    this.#database.exec('BEGIN IMMEDIATE')
    try {
      for (const snapshot of snapshots) {
        insert.run(
          snapshot.block.chainId,
          snapshot.value.poolAddress,
          snapshot.block.blockNumber.toString(),
          snapshot.block.observedAt.toISOString(),
          snapshot.value.token0.address,
          snapshot.value.token0.symbol,
          snapshot.value.token0.decimals,
          snapshot.value.token1.address,
          snapshot.value.token1.symbol,
          snapshot.value.token1.decimals,
          snapshot.value.feeTier,
          snapshot.value.sqrtPriceX96.toString(),
          snapshot.value.tick,
          snapshot.value.tickSpacing,
          snapshot.value.activeLiquidity.toString(),
          snapshot.quality,
          JSON.stringify(snapshot.warnings),
        )
      }
      this.#database.exec('COMMIT')
      return snapshots.length
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  listObservations(poolAddress: Address, query: PoolObservationQuery = {}): readonly PoolSnapshot[] {
    const limit = query.limit ?? 1_000
    if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
      throw new RangeError('Observation query limit must be an integer between 1 and 10000')
    }

    const rows = this.#database
      .prepare(
        `
        SELECT chain_id, pool_address, block_number, observed_at,
               token0_address, token0_symbol, token0_decimals,
               token1_address, token1_symbol, token1_decimals,
               fee_tier, sqrt_price_x96, tick, tick_spacing,
               active_liquidity, quality, warnings_json
        FROM pool_observations
        WHERE pool_address = ?
          AND CAST(block_number AS INTEGER) >= CAST(? AS INTEGER)
          AND CAST(block_number AS INTEGER) <= CAST(? AS INTEGER)
        ORDER BY CAST(block_number AS INTEGER), observed_at
        LIMIT ?
      `,
      )
      .all(
        getAddress(poolAddress),
        query.fromBlock?.toString() ?? '0',
        query.toBlock?.toString() ?? '9223372036854775807',
        limit,
      ) as ObservationRow[]

    return rows.map(rowToSnapshot)
  }

  countObservations(poolAddress?: Address): number {
    if (poolAddress) {
      const row = this.#database
        .prepare('SELECT COUNT(*) AS count FROM pool_observations WHERE pool_address = ?')
        .get(getAddress(poolAddress)) as { count: number }
      return row.count
    }

    const row = this.#database.prepare('SELECT COUNT(*) AS count FROM pool_observations').get() as { count: number }
    return row.count
  }

  close(): void {
    this.#database.close()
  }
}

function rowToSnapshot(row: ObservationRow): PoolSnapshot {
  return {
    value: {
      poolAddress: getAddress(row.pool_address),
      token0: {
        chainId: row.chain_id,
        address: getAddress(row.token0_address),
        symbol: row.token0_symbol,
        decimals: row.token0_decimals,
      },
      token1: {
        chainId: row.chain_id,
        address: getAddress(row.token1_address),
        symbol: row.token1_symbol,
        decimals: row.token1_decimals,
      },
      feeTier: row.fee_tier as PoolSnapshot['value']['feeTier'],
      sqrtPriceX96: BigInt(row.sqrt_price_x96),
      tick: row.tick,
      tickSpacing: row.tick_spacing,
      activeLiquidity: BigInt(row.active_liquidity),
    },
    block: {
      chainId: row.chain_id,
      blockNumber: BigInt(row.block_number),
      observedAt: new Date(row.observed_at),
    },
    quality: parseQuality(row.quality),
    warnings: parseWarnings(row.warnings_json),
  }
}

function parseQuality(value: string): DataQuality {
  if (value === 'complete' || value === 'partial' || value === 'stale') return value
  throw new Error(`Invalid stored observation quality: ${value}`)
}

function parseWarnings(value: string): readonly string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Stored observation warnings are invalid')
  }
  return parsed
}
