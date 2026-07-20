import type { TokenRef } from './index.js'
import {
  analyzeLpVsHodl,
  MAX_UNISWAP_V3_SQRT_RATIO_X96,
  MAX_UNISWAP_V3_TICK,
  MIN_UNISWAP_V3_SQRT_RATIO_X96,
  MIN_UNISWAP_V3_TICK,
  tickToSqrtPriceX96,
  type LpVsHodlAnalysis,
  type PositionInventory,
} from './lp-vs-hodl.js'
import type { ExactRatio } from './pool-analysis.js'

export type PositionHistoryObservationInput = {
  blockNumber: bigint
  observedAt: Date
  sqrtPriceX96: bigint
  tick: number
  cumulativeFees0?: bigint
  cumulativeFees1?: bigint
}

export type