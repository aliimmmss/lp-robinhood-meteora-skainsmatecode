import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import { analyzePoolHistory, type PoolHistoryInput } from './pool-history.js'

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
  decimals: 18,
}

function history(overrides: Partial<PoolHistoryInput> = {}): PoolHistoryInput {
  return {
    poolAddress: '0x0000000000000000000000000000000000000010',
    token0,
    token1,
    feeTier: 500,
    observations: [
      {
        blockNumber: 1n,
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        sqrtPriceX96: 1n << 96n,
        tick: 0,
        activeLiquidity: 100n,
        quality: 'complete',
        warnings: [],
      },
      {
        blockNumber: 2n,
        observedAt: new Date('2026-07-20T10:05:00.000Z'),
        sqrtPriceX96: 2n << 96n,
        tick: 100,
        activeLiquidity: 200n,
        quality: 'complete',
        warnings: [],
      },
      {
        blockNumber: 3n,
        observedAt: new Date('2026-07-20T10:10:00.000Z'),
        sqrtPriceX96: 1n << 96n,
        tick: 20,
        activeLiquidity: 0n,
        quality: 'partial',
        warnings: ['partial sample'],
      },
    ],
    ...overrides,
  }
}

describe('analyzePoolHistory', () => {
  it('derives price, tick, liquidity, and coverage metrics', () => {
    const result = analyzePoolHistory(history(), {
      expectedIntervalSeconds: 300,
      now: new Date('2026-07-20T10:15:00.000Z'),
    })

    expect(result.observationCount).toBe(3)
    expect(result.coverage).toEqual({ numerator: 1n, denominator: 1n })
    expect(result.price.firstDecimal).toBe('1.00000000')
    expect(result.price.maximumDecimal).toBe('4.00000000')
    expect(result.price.relativeChangePercent).toBe('0.00%')
    expect(result.tick.span).toBe(100)
    expect(result.activeLiquidity.nonZeroPercent).toBe('66.66%')
    expect(result.riskFlags).toContain('incomplete-history')
    expect(result.disclaimer).toContain('not fee, APR, or profitability')
  })

  it('flags sparse and persistently empty histories', () => {
    const result = analyzePoolHistory(
      history({
        observations: [
          {
            blockNumber: 1n,
            observedAt: new Date('2026-07-20T10:00:00.000Z'),
            sqrtPriceX96: 1n << 96n,
            tick: 0,
            activeLiquidity: 0n,
            quality: 'complete',
            warnings: [],
          },
        ],
      }),
    )

    expect(result.riskFlags).toContain('insufficient-observations')
    expect(result.riskFlags).toContain('persistent-zero-liquidity')
  })

  it('flags coverage gaps against the expected interval', () => {
    const result = analyzePoolHistory(history(), { expectedIntervalSeconds: 60, minimumCoverageBps: 8_000 })
    expect(result.expectedObservationCount).toBe(11)
    expect(result.riskFlags).toContain('coverage-gap')
  })
})
