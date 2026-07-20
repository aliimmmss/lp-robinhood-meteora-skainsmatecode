import { describe, expect, it } from 'vitest'
import type { PoolSnapshot } from './index.js'
import { SqlitePoolObservationStore } from './observation-store.js'

const poolAddress = '0x0000000000000000000000000000000000000010'
const baseTime = Date.parse('2026-07-20T10:00:00.000Z')

function snapshot(
  blockNumber: bigint,
  overrides: Partial<PoolSnapshot['value']> = {},
  observedAt = new Date(baseTime + Number(blockNumber)),
): PoolSnapshot {
  return {
    value: {
      poolAddress,
      token0: {
        chainId: 4663,
        address: '0x0000000000000000000000000000000000000001',
        symbol: 'WETH',
        decimals: 18,
      },
      token1: {
        chainId: 4663,
        address: '0x0000000000000000000000000000000000000002',
        symbol: 'USDG',
        decimals: 18,
      },
      feeTier: 500,
      sqrtPriceX96: 1n << 96n,
      tick: 0,
      tickSpacing: 10,
      activeLiquidity: 100n,
      ...overrides,
    },
    block: {
      chainId: 4663,
      blockNumber,
      observedAt,
    },
    quality: 'complete',
    warnings: [],
  }
}

describe('SqlitePoolObservationStore', () => {
  it('persists and restores exact bigint pool snapshots', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n), snapshot(2n, { activeLiquidity: 250n, tick: 12 })])

    const observations = store.listObservations(poolAddress)
    expect(observations).toHaveLength(2)
    expect(observations[1]?.value.activeLiquidity).toBe(250n)
    expect(observations[1]?.value.tick).toBe(12)
    expect(observations[1]?.block.blockNumber).toBe(2n)
    store.close()
  })

  it('is idempotent per pool and block and updates corrected observations', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n)])
    store.saveSnapshots([snapshot(1n, { activeLiquidity: 999n })])

    expect(store.countObservations()).toBe(1)
    expect(store.listObservations(poolAddress)[0]?.value.activeLiquidity).toBe(999n)
    store.close()
  })

  it('supports bounded block and timestamp queries in either order', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n), snapshot(2n), snapshot(3n)])

    expect(store.listObservations(poolAddress, { fromBlock: 2n, toBlock: 3n, limit: 1 })).toHaveLength(1)
    expect(
      store
        .listObservations(poolAddress, {
          from: new Date(baseTime + 2),
          to: new Date(baseTime + 3),
          order: 'descending',
        })
        .map((observation) => observation.block.blockNumber),
    ).toEqual([3n, 2n])
    expect(() => store.listObservations(poolAddress, { limit: 0 })).toThrow(/limit/)
    expect(() => store.listObservations(poolAddress, { fromBlock: 3n, toBlock: 2n })).toThrow(/fromBlock/)
    expect(() =>
      store.listObservations(poolAddress, { from: new Date(baseTime + 3), to: new Date(baseTime + 2) }),
    ).toThrow(/from/)
    store.close()
  })

  it('finds first, last, and strict predecessor observations by time', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n), snapshot(2n), snapshot(3n)])

    expect(store.firstObservationAtOrAfter(poolAddress, new Date(baseTime + 2))?.block.blockNumber).toBe(2n)
    expect(store.lastObservationAtOrBefore(poolAddress, new Date(baseTime + 2))?.block.blockNumber).toBe(2n)
    expect(store.predecessorObservation(poolAddress, new Date(baseTime + 2))?.block.blockNumber).toBe(1n)
    expect(store.predecessorObservation(poolAddress, new Date(baseTime + 1))).toBeNull()
    store.close()
  })

  it('retrieves the newest rows beyond the former 10000-row scan boundary', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    const snapshots = Array.from({ length: 10_005 }, (_, index) => snapshot(BigInt(index + 1)))
    store.saveSnapshots(snapshots)

    expect(store.lastObservationAtOrBefore(poolAddress, new Date(baseTime + 10_005))?.block.blockNumber).toBe(10_005n)
    expect(
      store
        .listObservations(poolAddress, { order: 'descending', limit: 3 })
        .map((observation) => observation.block.blockNumber),
    ).toEqual([10_005n, 10_004n, 10_003n])
    store.close()
  })
})
