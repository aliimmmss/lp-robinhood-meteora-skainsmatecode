import type { LpVsHodlAnalysis, PositionInventory } from './lp-vs-hodl.js'
import type { ExactRatio } from './pool-analysis.js'

export type PositionCostCategory = 'gas' | 'slippage' | 'rebalance' | 'other'

export type PositionCostEntry = {
  category: PositionCostCategory
  amount0: bigint
  amount1: bigint
}

export type PositionCostBreakdown = PositionCostEntry & {
  valueToken1BaseUnits: ExactRatio
}

export type PositionCostAccountingInput = {
