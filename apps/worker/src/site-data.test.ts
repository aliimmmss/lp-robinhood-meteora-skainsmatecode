import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ROBINHOOD_TOKENS, ROBINHOOD_WETH_USDG_POOLS, SqlitePoolObservationStore, type PoolSnapshot } from '@lp-mine/robinhood-univ3'
import { buildSiteData } from './site-data.js'

const Q96 = 1n << 96n
const Q128 = 1n << 128n
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lp-mine-site-data-'))
  directories.push(directory)
  return join(directory, 'observations.sqlite')
}

const pool500 = ROBINHOOD_WETH_USDG_POOLS.find((pool) => pool.feeTier === 500)!

function snapshot(blockNumber: bigint, observedAt: string, feeGrowth0: bigint, feeGrowth1: bigint): PoolSnapshot {
  return {
    value: {
      poolAddress: pool500.poolAddress,
      token0: { chainId: 4663, address: ROBINHOOD_TOKENS.wrappedNative, symbol: 'WETH', decimals: 18 },
      token1: { chainId: 4663, address: ROBINHOOD_TOKENS.usdg, symbol: 'USDG', decimals: 6 },
      feeTier: 500,
      sqrtPriceX96: Q96,
      tick: 0,
      tickSpacing: 10,
      activeLiquidity: 1_000_000n,
      feeGrowthGlobal0X128: feeGrowth0,
      feeGrowthGlobal1X128: feeGrowth1,
    },
    block: { chainId: 4663, blockNumber, observedAt: new Date(observedAt) },
    quality: 'complete',
    warnings: [],
  }
}

describe('buildSiteData', () => {
  it('produces a versioned snapshot with health and fee sections', () => {
    const path = databasePath()
    const store = new SqlitePoolObservationStore(path)
    store.saveSnapshots([
      snapshot(1n, '2026-07-23T00:00:00.000Z', 0n, 0n),
      snapshot(2n, '2026-07-23T12:00:00.000Z', Q128, 2n * Q128),
    ])
    store.close()

    const now = new Date('2026-07-23T12:05:00.000Z')
    const data = buildSiteData({ LP_MINE_DATABASE_PATH: path }, now)

    expect(data.schemaVersion).toBe(1)
    expect(data.generatedAt).toBe(now.toISOString())
    expect(data.fees.pools.some((pool) => pool.feeTier === 500 && pool.status === 'complete')).toBe(true)
    expect(data.health.mode).toBe('read-only')
    // serializes cleanly (no bigint leakage)
    expect(() => JSON.stringify(data)).not.toThrow()
  })
})
