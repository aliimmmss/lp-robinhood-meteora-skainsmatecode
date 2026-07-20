import type { TokenRef } from './index.js'
import { formatRatio, type ExactRatio } from './pool-analysis.js'

const FEE_DENOMINATOR = 1_000_000n

export type SwapEvidenceObservationInput = {
  blockNumber: bigint
  observedAt: Date
  amount0: bigint
  amount1: bigint
}

export type SwapEvidenceInput = {
  poolAddress: `0x${string}`
  token0: TokenRef
  token1: TokenRef
  quoteToken: 'token0' | 'token1'
  feeTier: number
  observations: readonly SwapEvidenceObservationInput[]
}

export type NominalFeeEvidence = {
  exactBaseUnits