import { describe, expect, it } from 'vitest'
import { computeFeeYield, type FeeGrowthSample } from './fee-yield.js'

const Q96 = 1n << 96n
const Q128 = 1n << 128n

function sample(overrides: Partial<FeeGrowthSample> = {}): FeeGrowthSample {
  return {
    feeGrowthGlobal0X128: 0n,
    feeGrowthGlobal1X128: 0n,
    sqrtPriceX96: Q96, // price = 1 token1 base unit per token0 base unit
    observedAt: new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  }
}

describe('computeFeeYield', () => {
  it('computes exact per-reference-liquidity daily fees at price 1', () => {
    const earlier = sample({ feeGrowthGlobal0X128: 0n, feeGrowthGlobal1X128: 0n })
    const later = sample({
      feeGrowthGlobal0X128: Q128, // Δfg0 = 2^128 -> 1 token0 base unit per unit liquidity over window
      feeGrowthGlobal1X128: 2n * Q128, // Δfg1 = 2 * 2^128
      observedAt: new Date('2026-07-23T12:00:00.000Z'), // 43200s window -> daily scale x2
    })

    const yield_ = computeFeeYield(earlier, later, { referenceLiquidity: 10n ** 18n })

    expect(yield_.windowSeconds).toBe(43_200)
    expect(yield_.feeGrowthDelta0).toBe(Q128)
    expect(yield_.feeGrowthDelta1).toBe(2n * Q128)
    // REF=1e18, Δfg0/2^128=1 -> 1e18 token0 base over window, x2 for daily = 2e18
    expect(yield_.dailyFeesToken0Decimal).toBe('2000000000000000000.00000000')
    expect(yield_.dailyFeesToken1Decimal).toBe('4000000000000000000.00000000')
    // combined in token1 at price 1: 4e18 + 2e18 = 6e18
    expect(yield_.dailyFeesCombinedInToken1Decimal).toBe('6000000000000000000.00000000')
  })

  it('values token0 fees in token1 using the pool price', () => {
    // price = 4 token1 base units per token0 base unit -> sqrtPriceX96 = 2 * 2^96
    const earlier = sample()
    const later = sample({
      feeGrowthGlobal0X128: Q128, // 1 token0 base unit per unit liquidity
      feeGrowthGlobal1X128: 0n,
      sqrtPriceX96: 2n * Q96,
      observedAt: new Date('2026-07-24T00:00:00.000Z'), // 86400s -> daily scale x1
    })

    const yield_ = computeFeeYield(earlier, later, { referenceLiquidity: 10n ** 18n })

    // token0 fees = 1e18 base/day; valued at price 4 -> 4e18 token1 base/day
    expect(yield_.dailyFeesToken0Decimal).toBe('1000000000000000000.00000000')
    expect(yield_.dailyFeesToken1Decimal).toBe('0.00000000')
    expect(yield_.dailyFeesCombinedInToken1Decimal).toBe('4000000000000000000.00000000')
  })

  it('fails closed on a negative fee-growth delta (non-monotonic accumulator)', () => {
    const earlier = sample({ feeGrowthGlobal0X128: 10n * Q128 })
    const later = sample({
      feeGrowthGlobal0X128: 5n * Q128, // decreased -> corruption or reorg
      observedAt: new Date('2026-07-23T01:00:00.000Z'),
    })
    expect(() => computeFeeYield(earlier, later)).toThrow(/monotonic|decreas/i)
  })

  it('rejects a non-positive time window', () => {
    const earlier = sample({ observedAt: new Date('2026-07-23T01:00:00.000Z') })
    const later = sample({ observedAt: new Date('2026-07-23T01:00:00.000Z') })
    expect(() => computeFeeYield(earlier, later)).toThrow(/window|order/i)
  })

  it('rejects invalid price and reference liquidity', () => {
    const earlier = sample()
    const later = sample({ observedAt: new Date('2026-07-23T01:00:00.000Z') })
    expect(() => computeFeeYield(earlier, { ...later, sqrtPriceX96: 0n })).toThrow(/sqrtPrice/i)
    expect(() => computeFeeYield(earlier, later, { referenceLiquidity: 0n })).toThrow(/referenceLiquidity/i)
  })
})
