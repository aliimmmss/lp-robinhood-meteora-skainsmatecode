import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import { analyzeLpVsHodl } from './lp-vs-hodl.js'
import { applyPositionCosts } from './position-costs.js'

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

function accounting() {
  return analyzeLpVsHodl({
    token0,
    token1,
    tickLower: -100,
    tickUpper: 100,
    liquidity: 1_000_000n,
    entrySqrtPriceX96: 1n << 96n,
    exitSqrtPriceX96: 1n << 96n,
    fees1: 100n,
  })
}

describe('applyPositionCosts', () => {
  it('subtracts categorized costs and preserves complete provenance', () => {
    const gross = accounting()
    const provenance = {
      source: 'wallet-reconciliation',
      observedAt: new Date('2026-07-20T10:30:00.000Z'),
      reference: 'tx-set-42',
    }
    const result = applyPositionCosts({
      accounting: gross,
      costs: [
        { category: 'gas', amount0: 0n, amount1: 25n, provenance },
        { category: 'slippage', amount0: 10n, amount1: 0n, provenance },
      ],
    })

    expect(result.grossNetVsHodlToken1BaseUnits).toEqual(gross.netVsHodlToken1BaseUnits)
    expect(result.totalCostToken1BaseUnits).toEqual({ numerator: 35n, denominator: 1n })
    expect(result.netAfterCostsVsHodlToken1BaseUnits).toEqual({ numerator: 65n, denominator: 1n })
    expect(result.evidenceQuality).toBe('complete')
    expect(result.warnings).toEqual([])
    expect(result.costs[0]?.provenance).toEqual(provenance)
  })

  it('marks amount-only costs as partial evidence', () => {
    const result = applyPositionCosts({
      accounting: accounting(),
      costs: [{ category: 'gas', amount0: 0n, amount1: 25n }],
    })

    expect(result.evidenceQuality).toBe('partial')
    expect(result.costs[0]?.evidenceQuality).toBe('partial')
    expect(result.warnings.join(' ')).toMatch(/no provenance/)
  })

  it('rejects negative costs and invalid provenance', () => {
    expect(() =>
      applyPositionCosts({
        accounting: accounting(),
        costs: [{ category: 'gas', amount0: -1n, amount1: 0n }],
      }),
    ).toThrow(/non-negative/)
    expect(() =>
      applyPositionCosts({
        accounting: accounting(),
        costs: [
          {
            category: 'gas',
            amount0: 1n,
            amount1: 0n,
            provenance: { source: '', observedAt: new Date('2026-07-20T10:30:00.000Z') },
          },
        ],
      }),
    ).toThrow(/source/)
  })
})
