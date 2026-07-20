import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import { analyzePositionHistory, type PositionHistoryInput } from './position-history.js'
import { tickToSqrtPriceX96 } from './lp-vs-hodl.js'

const token0: TokenRef = {
  chainId: 4663,
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'WETH',
  decimals: 18,
}
const token1: TokenRef = {
  chainId: 4663,
  address: '0x0000000000000000000000000000000000000002',
  symbol: 'USDG',
  decimals: 6,
}

function input(overrides: Partial<PositionHistoryInput> = {}): PositionHistoryInput {
  return {
    token0,
    token1,
    tickLower: -100,
    tickUpper: 100,
    liquidity: 1_000_000n,
    observations: [
      {
        blockNumber: 1n,
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        sqrtPriceX96: tickToSqrtPriceX96(0),
        tick: 0,
      },
      {
        blockNumber: 2n,
        observedAt: new Date('2026-07-20T10:10:00.000Z'),
        sqrtPriceX96: tickToSqrtPriceX96(150),
        tick: 150,
        cumulativeFees0: 10n,
      },
      {
        blockNumber: 3n,
        observedAt: new Date('2026-07-20T10:30:00.000Z'),
        sqrtPriceX96: tickToSqrtPriceX96(50),
        tick: 50,
        cumulativeFees0: 15n,
        cumulativeFees1: 20n,
      },
    ],
    ...overrides,
  }
}

describe('analyzePositionHistory', () => {
  it('computes interval-weighted range time and transitions', () => {
    const result = analyzePositionHistory(input())

    expect(result.observationCount).toBe(3)
    expect(result.elapsedSeconds).toBe(1_800n)
    expect(result.inRangeSeconds).toBe(600n)
    expect(result.timeInRange).toEqual({ numerator: 1n, denominator: 3n })
    expect(result.rangeExitCount).toBe(1)
    expect(result.rangeEntryCount).toBe(1)
    expect(result.points.map((point) => point.inRange)).toEqual([true, false, true])
  })

  it('tracks cumulative fees, inventory migration, and drawdown', () => {
    const result = analyzePositionHistory(input())

    expect(result.points[2]?.cumulativeFees).toEqual({ amount0: 15n, amount1: 20n })
    expect(result.inventoryTurnover0BaseUnits).toBeGreaterThan(0n)
    expect(result.inventoryTurnover1BaseUnits).toBeGreaterThan(0n)
    expect(result.maximumDrawdownToken1BaseUnits.numerator).toBeGreaterThanOrEqual(0n)
    expect(result.maximumDrawdownRate.numerator).toBeGreaterThanOrEqual(0n)
    expect(result.disclaimer).toContain('discrete stored observations')
  })

  it('rejects decreasing cumulative fees and insufficient observations', () => {
    expect(() =>
      analyzePositionHistory(
        input({
          observations: [
            {
              blockNumber: 1n,
              observedAt: new Date('2026-07-20T10:00:00.000Z'),
              sqrtPriceX96: tickToSqrtPriceX96(0),
              tick: 0,
              cumulativeFees0: 10n,
            },
            {
              blockNumber: 2n,
              observedAt: new Date('2026-07-20T10:01:00.000Z'),
              sqrtPriceX96: tickToSqrtPriceX96(1),
              tick: 1,
              cumulativeFees0: 9n,
            },
          ],
        }),
      ),
    ).toThrow(/must not decrease/)
    expect(() => analyzePositionHistory(input({ observations: input().observations.slice(0, 1) }))).toThrow(
      /At least two observations/,
    )
  })
})
