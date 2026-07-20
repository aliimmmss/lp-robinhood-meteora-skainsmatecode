import type { LpVsHodlAnalysis } from './lp-vs-hodl.js'
import type { ExactRatio } from './pool-analysis.js'

export type PositionEvidenceProvenance = {
  source: string
  observedAt: Date
  reference?: string
}

export type PositionCostCategory = 'gas' | 'slippage' | 'rebalance' | 'other'

export type PositionCostEntry = {
  category: PositionCostCategory
  amount0: bigint
 