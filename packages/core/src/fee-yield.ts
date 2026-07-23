import { formatRatio, type ExactRatio } from './pool-analysis.js'

const Q128 = 1n << 128n
const Q192 = 1n << 192n
const Q320 = 1n << 320n
const SECONDS_PER_DAY = 86_400n
const DEFAULT_REFERENCE_LIQUIDITY = 10n ** 18n

/**
 * A pool fee-growth reading. feeGrowthGlobal0/1X128 are Uniswap v3's Q128.128
 * accumulators of fees per unit of in-range liquidity; the difference between
 * two readings, divided by 2^128, is the fee an unchanged unit of liquidity
 * earned over the interval.
 */
export type FeeGrowthSample = {
  feeGrowthGlobal0X128: bigint
  feeGrowthGlobal1X128: bigint
  sqrtPriceX96: bigint
  observedAt: Date
}

export type FeeYield = {
  windowSeconds: number
  referenceLiquidity: bigint
  feeGrowthDelta0: bigint
  feeGrowthDelta1: bigint
  /** Daily token0 base-unit fees earned by `referenceLiquidity`, while in range. */
  dailyFeesToken0: ExactRatio
  /** Daily token1 base-unit fees earned by `referenceLiquidity`, while in range. */
  dailyFeesToken1: ExactRatio
  /** Daily fees combined into token1 base units, valuing token0 at the pool price. */
  dailyFeesCombinedInToken1: ExactRatio
  dailyFeesToken0Decimal: string
  dailyFeesToken1Decimal: string
  dailyFeesCombinedInToken1Decimal: string
}

export type FeeYieldOptions = {
  referenceLiquidity?: bigint
  decimalPlaces?: number
}

/**
 * Fee yield of a reference amount of liquidity between two pool observations.
 *
 * The result is a per-liquidity daily rate, so it is directly comparable across
 * fee tiers of the same pair (an equal notional and range buys approximately
 * equal liquidity at a shared price). It is only realized while the position is
 * in range; it is an estimate of past fees, not a forward APR.
 */
export function computeFeeYield(
  earlier: FeeGrowthSample,
  later: FeeGrowthSample,
  options: FeeYieldOptions = {},
): FeeYield {
  const referenceLiquidity = options.referenceLiquidity ?? DEFAULT_REFERENCE_LIQUIDITY
  if (referenceLiquidity <= 0n) throw new RangeError('referenceLiquidity must be positive')
  if (later.sqrtPriceX96 <= 0n) throw new RangeError('sqrtPriceX96 must be positive')
  if (Number.isNaN(earlier.observedAt.getTime()) || Number.isNaN(later.observedAt.getTime())) {
    throw new RangeError('observedAt must be valid')
  }

  const windowSeconds = Math.floor((later.observedAt.getTime() - earlier.observedAt.getTime()) / 1_000)
  if (windowSeconds <= 0) throw new RangeError('later sample must be after earlier sample (positive window)')

  const feeGrowthDelta0 = later.feeGrowthGlobal0X128 - earlier.feeGrowthGlobal0X128
  const feeGrowthDelta1 = later.feeGrowthGlobal1X128 - earlier.feeGrowthGlobal1X128
  if (feeGrowthDelta0 < 0n || feeGrowthDelta1 < 0n) {
    throw new RangeError('fee-growth accumulator decreased between samples; expected monotonic non-decreasing values')
  }

  const windowBig = BigInt(windowSeconds)
  const sqrtPrice = later.sqrtPriceX96
  const priceX192 = sqrtPrice * sqrtPrice // token1 base units per token0 base unit, scaled by 2^192

  // dailyFeesTokenN = referenceLiquidity * Δfg / 2^128 * SECONDS_PER_DAY / windowSeconds
  const dailyFeesToken0: ExactRatio = {
    numerator: referenceLiquidity * feeGrowthDelta0 * SECONDS_PER_DAY,
    denominator: Q128 * windowBig,
  }
  const dailyFeesToken1: ExactRatio = {
    numerator: referenceLiquidity * feeGrowthDelta1 * SECONDS_PER_DAY,
    denominator: Q128 * windowBig,
  }
  // combined = token1 fees + token0 fees * price; over common denominator 2^320 * window
  const dailyFeesCombinedInToken1: ExactRatio = {
    numerator: referenceLiquidity * SECONDS_PER_DAY * (feeGrowthDelta1 * Q192 + feeGrowthDelta0 * priceX192),
    denominator: Q320 * windowBig,
  }

  const decimalPlaces = options.decimalPlaces ?? 8
  return {
    windowSeconds,
    referenceLiquidity,
    feeGrowthDelta0,
    feeGrowthDelta1,
    dailyFeesToken0,
    dailyFeesToken1,
    dailyFeesCombinedInToken1,
    dailyFeesToken0Decimal: formatRatio(dailyFeesToken0, decimalPlaces),
    dailyFeesToken1Decimal: formatRatio(dailyFeesToken1, decimalPlaces),
    dailyFeesCombinedInToken1Decimal: formatRatio(dailyFeesCombinedInToken1, decimalPlaces),
  }
}
