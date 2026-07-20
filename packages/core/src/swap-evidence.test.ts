import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import { analyzeSwapEvidence } from './swap-evidence.js'

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
const hash = (value: number): `0x${string}` => `0x${value.toString(16).padStart(64, '0')}`

describe('analyzeSwapEvidence', () => {
  it('aggregates validated flow, transactions, average inputs, and nominal fees', () => {
    const result = analyzeSwapEvidence({
      poolAddress: '0x0000000000000000000000000000000000000010',
      token0,
      token1,
      quoteToken: 'token1',
      feeTier: 500,
      observations: [
        {
          blockNumber: 2n,
          transactionHash: hash(2),
          logIndex: 0,
          observedAt: new Date('2026-07-20T10:05:00.000Z'),
          amount0: -1_000_000_000_000_000_000n,
          amount1: 2_000_000_000n,
        },
        {
          blockNumber: 1n,
          transactionHash: hash(1),
          logIndex: 0,
          observedAt: new Date('2026-07-20T10:00:00.000Z'),
          amount0: 500_000_000_000_000_000n,
          amount1: -1_100_000_000n,
        },
      ],
    })

    expect(result.swapCount).toBe(2)
    expect(result.distinctTransactionCount).toBe(2)
    expect(result.token0InputSwapCount).toBe(1)
    expect(result.token1InputSwapCount).toBe(1)
    expect(result.token0.inputBaseUnits).toBe(500_000_000_000_000_000n)
    expect(result.token0.outputBaseUnits).toBe(1_000_000_000_000_000_000n)
    expect(result.token1.inputBaseUnits).toBe(2_000_000_000n)
    expect(result.token1.outputBaseUnits).toBe(1_100_000_000n)
    expect(result.token0.averageInputDecimal).toBe('0.500000000000000000')
    expect(result.token1.averageInputDecimal).toBe('2000.000000')
    expect(result.quoteNotionalDecimal).toBe('3100.000000')
    expect(result.token1.nominalGrossFee.floorBaseUnits).toBe(1_000_000n)
    expect(result.token1.nominalGrossFee.ceilingBaseUnits).toBe(1_000_000n)
    expect(result.firstBlock).toBe(1n)
    expect(result.lastBlock).toBe(2n)
    expect(result.disclaimer).toContain('validated canonical input flow')
  })

  it('reports integer floor and ceiling when nominal fees are fractional base units', () => {
    const result = analyzeSwapEvidence({
      poolAddress: '0x0000000000000000000000000000000000000010',
      token0,
      token1,
      quoteToken: 'token1',
      feeTier: 100,
      observations: [
        {
          blockNumber: 1n,
          transactionHash: hash(1),
          logIndex: 0,
          observedAt: new Date('2026-07-20T10:00:00.000Z'),
          amount0: -1n,
          amount1: 1n,
        },
      ],
    })

    expect(result.token1.nominalGrossFee.exactBaseUnits).toEqual({ numerator: 1n, denominator: 10_000n })
    expect(result.token1.nominalGrossFee.floorBaseUnits).toBe(0n)
    expect(result.token1.nominalGrossFee.ceilingBaseUnits).toBe(1n)
  })

  it('rejects zero-sided and same-sign deltas', () => {
    const base = {
      blockNumber: 1n,
      transactionHash: hash(1),
      logIndex: 0,
      observedAt: new Date('2026-07-20T10:00:00.000Z'),
    }
    const analyze = (amount0: bigint, amount1: bigint) =>
      analyzeSwapEvidence({
        poolAddress: '0x0000000000000000000000000000000000000010',
        token0,
        token1,
        quoteToken: 'token1',
        feeTier: 500,
        observations: [{ ...base, amount0, amount1 }],
      })

    expect(() => analyze(1n, 0n)).toThrow(/both be non-zero/)
    expect(() => analyze(1n, 1n)).toThrow(/opposite signs/)
  })
})
