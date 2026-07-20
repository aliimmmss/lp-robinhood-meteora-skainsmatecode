import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import { tickToSqrtPriceX96 } from './lp-vs-hodl.js'
import { analyzePositionHistory, type PositionHistoryInput } from './position-history.js'

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

function isGreater(
  left: { numerator: bigint; denominator: bigint },
  right: { numerator: bigint; denominator: bigint },
): boolean {
  return left.numerator * right.denominator > right.numerator * left.denominator
}

describe('analyzePositionHistory', () => {
  it('computes interval-weighted range time and transitions', () => {
    const result = analyzePositionHistory(input())

    expect(result.observationCount).toBe(3)
    expect(result.elapsedMilliseconds).toBe(1_800_000n)
    expect(result.inRangeMilliseconds).toBe(600_000n)
    expect(result.elapsedSeconds).toBe(1_800n)
    expect(result.inRangeSeconds).toBe(600n)
    expect(result.timeInRange).toEqual({ numerator: 1n, denominator: 3n })
    expect(result.rangeExitCount).toBe(1)
    expect(result.rangeEntryCount).toBe(1)
    expect(result.points.map((point) => point.inRange)).toEqual([true, false, true])
  })

  it('accumulates sub-second intervals before deriving whole seconds', () => {
    const result = analyzePositionHistory(
      input({
        observations: [
          {
            blockNumber: 1n,
            observedAt: new Date('2026-07-20T10:00:00.000Z'),
            sqrtPriceX96: tickToSqrtPriceX96(0),
            tick: 0,
          },
          {
            blockNumber: 2n,
            observedAt: new Date('2026-07-20T10:00:00.600Z'),
            sqrtPriceX96: tickToSqrtPriceX96(150),
            tick: 150,
          },
          {
            blockNumber: 3n,
            observedAt: new Date('2026-07-20T10:00:01.200Z'),
            sqrtPriceX96: tickToSqrtPriceX96(0),
            tick: 0,
          },
        ],
      }),
    )

    expect(result.elapsedMilliseconds).toBe(1_200n)
    expect(result.inRangeMilliseconds).toBe(600n)
    expect(result.elapsedSeconds).toBe(1n)
    expect(result.inRangeSeconds).toBe(0n)
    expect(result.timeInRange).toEqual({ numerator: 1n, denominator: 2n })
  })

  it('tracks cumulative fees, inventory migration, and drawdown evidence', () => {
    const result = analyzePositionHistory(input())

    expect(result.points[2]?.cumulativeFees).toEqual({ amount0: 15n, amount1: 20n })
    expect(result.inventoryTurnover0BaseUnits).toBeGreaterThan(0n)
    expect(result.inventoryTurnover1BaseUnits).toBeGreaterThan(0n)
    expect(result.maximumDrawdownToken1BaseUnits).toEqual(result.maximumAbsoluteDrawdown.amountToken1BaseUnits)
    expect(result.maximumDrawdownRate).toEqual(result.maximumPercentageDrawdown.rate)
    expect(result.maximumAbsoluteDrawdown.troughBlockNumber).toBeGreaterThanOrEqual(1n)
    expect(result.disclaimer).toContain('discrete stored observations')
  })

  it('tracks maximum absolute and percentage drawdowns independently', () => {
    const result = analyzePositionHistory(
      input({
        tickLower: -10_000,
        tickUpper: 10_000,
        observations: [
          {
            blockNumber: 1n,
            observedAt: new Date('2026-07-20T10:00:00.000Z'),
            sqrtPriceX96: tickToSqrtPriceX96(0),
            tick: 0,
          },
          {
            blockNumber: 2n,
            observedAt: new Date('2026-07-20T10:01:00.000Z'),
            sqrtPriceX96: tickToSqrtPriceX96(-10_000),
            tick: -10_000,
          },
          {
            blockNumber: 3n,
            observedAt: new Date('2026-07-20T10:02:00.000Z'),
            sqrtPriceX96: tickToSqrtPriceX96(9_999),
            tick: 9_999,
            cumulativeFees0: 1_000_000n,
            cumulativeFees1: 10_000_000n,
          },
          {
            blockNumber: 4n,
            observedAt: new Date('2026-07-20T10:03:00.000Z'),
            sqrtPriceX96: tickToSqrtPriceX96(0),
            tick: 0,
            cumulativeFees0: 1_000_000n,
            cumulativeFees1: 10_000_000n,
          },
        ],
      }),
    )

    expect(result.maximumPercentageDrawdown.peakBlockNumber).toBe(1n)
    expect(result.maximumPercentageDrawdown.troughBlockNumber).toBe(2n)
    expect(result.maximumAbsoluteDrawdown.peakBlockNumber).toBe(3n)
    expect(result.maximumAbsoluteDrawdown.troughBlockNumber).toBe(4n)
    expect(
      isGreater(
        result.maximumAbsoluteDrawdown.amountToken1BaseUnits,
        result.maximumPercentageDrawdown.amountToken1BaseUnits,
      ),
    ).toBe(true)
    expect(isGreater(result.maximumPercentageDrawdown.rate, result.maximumAbsoluteDrawdown.rate)).toBe(true)
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

  it('rejects duplicate, non-monotonic, and inconsistent observations', () => {
    const base = input().observations
    expect(() =>
      analyzePositionHistory(input({ observations: [base[0]!, { ...base[1]!, blockNumber: base[0]!.blockNumber }] })),
    ).toThrow(/block numbers must be unique/)
    expect(() =>
      analyzePositionHistory(input({ observations: [base[0]!, { ...base[1]!, observedAt: base[0]!.observedAt }] })),
    ).toThrow(/timestamps must be unique/)
    expect(() =>
      analyzePositionHistory(
        input({
          observations: [
            { ...base[0]!, blockNumber: 2n },
            { ...base[1]!, blockNumber: 1n },
          ],
        }),
      ),
    ).toThrow(/increase chronologically/)
    expect(() =>
      analyzePositionHistory(
        input({ observations: [base[0]!, { ...base[1]!, sqrtPriceX96: tickToSqrtPriceX96(149) }] }),
      ),
    ).toThrow(/inconsistent/)
  })
})
