import { getAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { canonicalJson } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION,
  createWethAllowanceRevocationReviewConfirmation,
  digestWethAllowanceRevocationReviewConfirmationBody,
  type WethAllowanceRevocationReviewConfirmation,
  type WethAllowanceRevocationReviewConfirmationBody,
  type WethAllowanceRevocationReviewConfirmationResult,
} from './weth-allowance-revocation-review-confirmation.js'
import { createWethAllowanceRevocationReviewIntent } from './weth-allowance-revocation-review-intent.js'
import { ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

export const WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_LIFECYCLE_VERSION = '1.0.0' as const

const CONFIRMATION_RESULT_KEYS = [
  'schemaVersion',
  'status',
  'assessedAt',
  'typedIntentId',
  'intentExpiresAt',
  'confirmation',
  'confirmationId',
  'checks',
  'reasonCodes',
  'reasons',
  'transactionBuildAuthorized',
  'implementationAuthorized',
  'simulationAuthorized',
  'walletRequestAuthorized',
  'signingEligible',
  'executionEligible',
  'reusableAuthority',
  'disclaimer',
] as const

const CONFIRMATION_KEYS = [
  'schemaVersion',
  'intentId',
  'intentExpiresAt',
  'phrase',
  'owner',
  'destination',
  'spender',
  'desiredAllowance',
  'nativeValue',
  'confirmedAt',
  'acknowledgesAllowanceRevocation',
  'acknowledgesNoTokenTransfer',
  'acknowledgesNoTransactionSigningExecutionAuthority',
  'confirmationId',
] as const

const REVIEWED_CONFIRMATION_CHECK_CODES = new Set([
  'intent-result',
  'intent-integrity',
  'confirmation-schema',
  'assessment-time',
  'confirmation-intent-id',
  'confirmation-phrase',
  'confirmation-owner',
  'confirmation-destination',
  'confirmation-spender',
  'confirmation-desired-allowance',
  'confirmation-native-value',
  'acknowledges-allowance-revocation',
  'acknowledges-no-token-transfer',
  'acknowledges-no-authority',
  'confirmation-after-generation',
  'confirmation-after-intent-assessment',
  'confirmation-before-expiry',
  'confirmation-not-future',
  'assessment-before-expiry',
])

export type WethAllowanceRevocationReviewConfirmationLifecycleInput = Readonly<{
  intentResult: unknown
  confirmationResult: unknown
  report: unknown
  currentState: unknown
  buildCommit: unknown
  generatedAt: unknown
  assessedAt: unknown
}>

export type WethAllowanceRevocationReviewConfirmationLifecycleCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceRevocationReviewConfirmationLifecycleResult = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_LIFECYCLE_VERSION
  status: 'invalidated' | 'valid-for-offline-review'
  assessedAt: string | null
  confirmationAssessedAt: string | null
  confirmedAt: string | null
  intentExpiresAt: string | null
  originalIntentId: Hex | null
  originalConfirmationId: Hex | null
  currentIntentId: Hex | null
  lifecycleDigest: Hex
  checks: readonly WethAllowanceRevocationReviewConfirmationLifecycleCheck[]
  reasonCodes: readonly string[]
  reasons: readonly string[]
  transactionBuildAuthorized: false
  implementationAuthorized: false
  simulationAuthorized: false
  walletRequestAuthorized: false
  signingEligible: false
  executionEligible: false
  reusableAuthority: false
  disclaimer: string
}>

type ParsedConfirmationResult = Readonly<{
  assessedAt: Date
  typedIntentId: Hex
  intentExpiresAt: Date
  confirmation: WethAllowanceRevocationReviewConfirmation
  confirmationId: Hex
}>

export function evaluateWethAllowanceRevocationReviewConfirmationLifecycle(
  input: WethAllowanceRevocationReviewConfirmationLifecycleInput,
): WethAllowanceRevocationReviewConfirmationLifecycleResult {
  const confirmationResult = parseConfirmationResult(input.confirmationResult)
  const assessedAt = parseDateObject(input.assessedAt)
  const confirmationReplay =
    confirmationResult === null ? null : replayConfirmation(input.intentResult, confirmationResult)
  const currentIntentResult = createWethAllowanceRevocationReviewIntent({
    report: input.report,
    currentState: input.currentState,
    buildCommit: input.buildCommit,
    generatedAt: input.generatedAt,
    assessedAt: input.assessedAt,
  })

  const confirmationReplayValid =
    confirmationResult !== null &&
    confirmationReplay !== null &&
    confirmationReplay.status === 'confirmed-for-offline-review' &&
    confirmationReplay.typedIntentId === confirmationResult.typedIntentId &&
    confirmationReplay.intentExpiresAt === confirmationResult.intentExpiresAt.toISOString() &&
    confirmationReplay.confirmationId === confirmationResult.confirmationId &&
    confirmationReplay.transactionBuildAuthorized === false &&
    confirmationReplay.implementationAuthorized === false &&
    confirmationReplay.simulationAuthorized === false &&
    confirmationReplay.walletRequestAuthorized === false &&
    confirmationReplay.signingEligible === false &&
    confirmationReplay.executionEligible === false &&
    confirmationReplay.reusableAuthority === false

  const checks: WethAllowanceRevocationReviewConfirmationLifecycleCheck[] = [
    lifecycleCheck(
      'confirmation-result',
      confirmationResult !== null,
      'Original deliberate-confirmation result is valid and complete.',
      'Original deliberate-confirmation result is malformed, incomplete, or outside the reviewed boundary.',
    ),
    lifecycleCheck(
      'confirmation-replay',
      confirmationReplayValid,
      'Original deliberate confirmation reproduces exactly from the typed intent.',
      'Original deliberate confirmation does not reproduce exactly from the typed intent.',
    ),
    lifecycleCheck(
      'assessment-time',
      assessedAt !== null,
      'Current lifecycle assessment timestamp is valid.',
      'Current lifecycle assessment timestamp is invalid.',
    ),
    lifecycleCheck(
      'assessment-after-confirmation',
      assessedAt !== null &&
        confirmationResult !== null &&
        assessedAt.getTime() >= new Date(confirmationResult.confirmation.confirmedAt).getTime(),
      'Current lifecycle assessment occurs at or after confirmation.',
      'Current lifecycle assessment precedes confirmation or timestamps are unavailable.',
    ),
    lifecycleCheck(
      'assessment-before-expiry',
      assessedAt !== null &&
        confirmationResult !== null &&
        assessedAt.getTime() < confirmationResult.intentExpiresAt.getTime(),
      'Current lifecycle assessment occurs before typed-intent expiry.',
      'Current lifecycle assessment occurs at or after typed-intent expiry or timestamps are unavailable.',
    ),
    lifecycleCheck(
      'current-intent-valid',
      currentIntentResult.status === 'ready-for-human-review',
      'Current evidence reproduces a valid typed review intent.',
      'Current evidence no longer reproduces a valid typed review intent.',
    ),
    lifecycleCheck(
      'intent-id-stable',
      confirmationResult !== null &&
        currentIntentResult.intentId !== null &&
        currentIntentResult.intentId === confirmationResult.typedIntentId,
      'Current typed intent ID matches the deliberately confirmed intent.',
      'Current typed intent ID differs from the deliberately confirmed intent or is unavailable.',
    ),
    lifecycleCheck(
      'intent-expiry-stable',
      confirmationResult !== null &&
        currentIntentResult.intent !== null &&
        currentIntentResult.intent.expiresAt === confirmationResult.intentExpiresAt.toISOString(),
      'Current typed intent expiry matches the deliberately confirmed intent.',
      'Current typed intent expiry differs from the deliberately confirmed intent or is unavailable.',
    ),
    lifecycleCheck(
      'authorization-disabled',
      currentIntentResult.transactionBuildAuthorized === false &&
        currentIntentResult.implementationAuthorized === false &&
        currentIntentResult.simulationAuthorized === false &&
        currentIntentResult.signingEligible === false &&
        currentIntentResult.executionEligible === false &&
        (confirmationReplay === null ||
          (confirmationReplay.transactionBuildAuthorized === false &&
            confirmationReplay.implementationAuthorized === false &&
            confirmationReplay.simulationAuthorized === false &&
            confirmationReplay.walletRequestAuthorized === false &&
            confirmationReplay.signingEligible === false &&
            confirmationReplay.executionEligible === false &&
            confirmationReplay.reusableAuthority === false)),
      'All intent and confirmation authorization flags remain disabled.',
      'An intent or confirmation authorization flag is not disabled.',
    ),
  ]

  if (currentIntentResult.status === 'blocked') {
    const observed = new Set<string>()
    for (const reasonCode of currentIntentResult.reasonCodes) {
      if (observed.has(reasonCode)) continue
      observed.add(reasonCode)
      checks.push(
        lifecycleCheck(
          `current-intent-${reasonCode}`,
          false,
          'Current typed-intent check passed.',
          `Current typed-intent invalidation remains active: ${reasonCode}.`,
        ),
      )
    }
  }

  const status = checks.some((check) => check.status === 'fail')
    ? ('invalidated' as const)
    : ('valid-for-offline-review' as const)
  const reasonCodes = checks.filter((check) => check.status === 'fail').map((check) => check.code)
  const reasons =
    status === 'valid-for-offline-review'
      ? [
          'The deliberate confirmation remains valid as offline review evidence only. It does not authorize wallet access, transaction construction, signing, execution, or reusable authority.',
        ]
      : checks.filter((check) => check.status === 'fail').map((check) => check.message)

  const digestBody = {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_LIFECYCLE_VERSION,
    status,
    assessedAt: assessedAt?.toISOString() ?? null,
    confirmationAssessedAt: confirmationResult?.assessedAt.toISOString() ?? null,
    confirmedAt: confirmationResult?.confirmation.confirmedAt ?? null,
    intentExpiresAt: confirmationResult?.intentExpiresAt.toISOString() ?? null,
    originalIntentId: confirmationResult?.typedIntentId ?? null,
    originalConfirmationId: confirmationResult?.confirmationId ?? null,
    currentIntentId: currentIntentResult.intentId,
    checks: checks.map((check) => ({ code: check.code, status: check.status })),
    reasonCodes,
  }
  const lifecycleDigest = keccak256(stringToHex(canonicalJson(digestBody)))

  return {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_LIFECYCLE_VERSION,
    status,
    assessedAt: assessedAt?.toISOString() ?? null,
    confirmationAssessedAt: confirmationResult?.assessedAt.toISOString() ?? null,
    confirmedAt: confirmationResult?.confirmation.confirmedAt ?? null,
    intentExpiresAt: confirmationResult?.intentExpiresAt.toISOString() ?? null,
    originalIntentId: confirmationResult?.typedIntentId ?? null,
    originalConfirmationId: confirmationResult?.confirmationId ?? null,
    currentIntentId: currentIntentResult.intentId,
    lifecycleDigest,
    checks,
    reasonCodes,
    reasons,
    transactionBuildAuthorized: false,
    implementationAuthorized: false,
    simulationAuthorized: false,
    walletRequestAuthorized: false,
    signingEligible: false,
    executionEligible: false,
    reusableAuthority: false,
    disclaimer:
      'This offline lifecycle result is historical review evidence only. It contains no provider request, selector, ABI data, calldata, transaction request, wallet state, signature, nonce, gas field, submission field, receipt, money movement, or execution authority.',
  }
}

function replayConfirmation(
  intentResult: unknown,
  parsed: ParsedConfirmationResult,
): WethAllowanceRevocationReviewConfirmationResult {
  const confirmation = parsed.confirmation
  return createWethAllowanceRevocationReviewConfirmation({
    intentResult,
    confirmation: {
      intentId: confirmation.intentId,
      phrase: confirmation.phrase,
      owner: confirmation.owner,
      destination: confirmation.destination,
      spender: confirmation.spender,
      desiredAllowance: confirmation.desiredAllowance,
      nativeValue: confirmation.nativeValue,
      confirmedAt: new Date(confirmation.confirmedAt),
      acknowledgesAllowanceRevocation: confirmation.acknowledgesAllowanceRevocation,
      acknowledgesNoTokenTransfer: confirmation.acknowledgesNoTokenTransfer,
      acknowledgesNoTransactionSigningExecutionAuthority:
        confirmation.acknowledgesNoTransactionSigningExecutionAuthority,
    },
    assessedAt: parsed.assessedAt,
  })
}

function parseConfirmationResult(value: unknown): ParsedConfirmationResult | null {
  if (!isRecord(value) || !hasExactKeys(value, CONFIRMATION_RESULT_KEYS)) return null
  if (
    value.schemaVersion !== WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION ||
    value.status !== 'confirmed-for-offline-review' ||
    value.transactionBuildAuthorized !== false ||
    value.implementationAuthorized !== false ||
    value.simulationAuthorized !== false ||
    value.walletRequestAuthorized !== false ||
    value.signingEligible !== false ||
    value.executionEligible !== false ||
    value.reusableAuthority !== false
  ) {
    return null
  }

  const assessedAt = parseCanonicalIsoDate(value.assessedAt)
  const typedIntentId = parseHex32(value.typedIntentId)
  const intentExpiresAt = parseCanonicalIsoDate(value.intentExpiresAt)
  const confirmationId = parseHex32(value.confirmationId)
  const confirmation = parseConfirmation(value.confirmation)
  if (
    assessedAt === null ||
    typedIntentId === null ||
    intentExpiresAt === null ||
    confirmationId === null ||
    confirmation === null ||
    confirmation.intentId !== typedIntentId ||
    confirmation.intentExpiresAt !== intentExpiresAt.toISOString() ||
    confirmation.confirmationId !== confirmationId ||
    assessedAt.getTime() < new Date(confirmation.confirmedAt).getTime() ||
    assessedAt.getTime() >= intentExpiresAt.getTime()
  ) {
    return null
  }
  if (!validateConfirmationChecks(value.checks)) return null
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.length !== 0) return null
  if (!isStringArray(value.reasons) || typeof value.disclaimer !== 'string') return null

  return { assessedAt, typedIntentId, intentExpiresAt, confirmation, confirmationId }
}

function parseConfirmation(value: unknown): WethAllowanceRevocationReviewConfirmation | null {
  if (!isRecord(value) || !hasExactKeys(value, CONFIRMATION_KEYS)) return null
  if (
    value.schemaVersion !== WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION ||
    value.phrase !== WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE ||
    value.desiredAllowance !== '0' ||
    value.nativeValue !== '0' ||
    value.acknowledgesAllowanceRevocation !== true ||
    value.acknowledgesNoTokenTransfer !== true ||
    value.acknowledgesNoTransactionSigningExecutionAuthority !== true
  ) {
    return null
  }

  const intentId = parseHex32(value.intentId)
  const intentExpiresAt = parseCanonicalIsoDate(value.intentExpiresAt)
  const owner = parseAddress(value.owner)
  const destination = parseAddress(value.destination)
  const spender = parseAddress(value.spender)
  const confirmedAt = parseCanonicalIsoDate(value.confirmedAt)
  const confirmationId = parseHex32(value.confirmationId)
  if (
    intentId === null ||
    intentExpiresAt === null ||
    owner === null ||
    owner === zeroAddress ||
    destination !== ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address ||
    spender !== ROBINHOOD_UNISWAP_V3.positionManager ||
    confirmedAt === null ||
    confirmedAt.getTime() >= intentExpiresAt.getTime() ||
    confirmationId === null
  ) {
    return null
  }

  const body: WethAllowanceRevocationReviewConfirmationBody = {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION,
    intentId,
    intentExpiresAt: intentExpiresAt.toISOString(),
    phrase: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
    owner,
    destination,
    spender,
    desiredAllowance: '0',
    nativeValue: '0',
    confirmedAt: confirmedAt.toISOString(),
    acknowledgesAllowanceRevocation: true,
    acknowledgesNoTokenTransfer: true,
    acknowledgesNoTransactionSigningExecutionAuthority: true,
  }
  if (digestWethAllowanceRevocationReviewConfirmationBody(body) !== confirmationId) return null
  return { ...body, confirmationId }
}

function validateConfirmationChecks(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== REVIEWED_CONFIRMATION_CHECK_CODES.size) return false
  const observed = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, ['code', 'status', 'message'])) return false
    if (
      typeof item.code !== 'string' ||
      !REVIEWED_CONFIRMATION_CHECK_CODES.has(item.code) ||
      observed.has(item.code) ||
      item.status !== 'pass' ||
      typeof item.message !== 'string'
    ) {
      return false
    }
    observed.add(item.code)
  }
  return observed.size === REVIEWED_CONFIRMATION_CHECK_CODES.size
}

function parseAddress(value: unknown): Address | null {
  if (typeof value !== 'string') return null
  try {
    return getAddress(value)
  } catch {
    return null
  }
}

function parseHex32(value: unknown): Hex | null {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : null
}

function parseCanonicalIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) return null
  return parsed
}

function parseDateObject(value: unknown): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  return new Date(value.getTime())
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(record)
  const expectedKeys = new Set(keys)
  return actualKeys.length === expectedKeys.size && actualKeys.every((key) => expectedKeys.has(key))
}

function lifecycleCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceRevocationReviewConfirmationLifecycleCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
