import { getAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { ROBINHOOD_WETH_AUTHORITY_EVIDENCE } from './weth-authority-evidence.js'
import {
  WETH_ALLOWANCE_REVOCATION_OPERATION,
  canonicalJson,
  type WethAllowancePaperDecision,
} from './weth-allowance-paper.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

export const WETH_ALLOWANCE_SIMULATION_POLICY_VERSION = '1.0.0' as const
export const WETH_ALLOWANCE_SIMULATION_MAX_AGE_SECONDS = 300 as const
export const WETH_ALLOWANCE_SIMULATION_MAX_CALL_DEPTH = 1 as const

export type WethAllowanceSimulationCallType =
  | 'call'
  | 'delegatecall'
  | 'staticcall'
  | 'create'
  | 'create2'
  | 'selfdestruct'

export type WethAllowanceSimulationCall = Readonly<{
  id: string
  parentId: string | null
  depth: number
  type: WethAllowanceSimulationCallType
  from: Address
  to: Address
  nativeValue: bigint
  functionName: string
  spender: Address
  amount: bigint
}>

export type WethAllowanceSimulationLog = Readonly<{
  address: Address
  eventName: string
  owner: Address
  spender: Address
  value: bigint
}>

export type WethAllowanceSimulationBalanceDelta = Readonly<{
  account: Address
  asset: Address | null
  delta: bigint
}>

export type WethAllowanceSimulationPaperReference = Readonly<{
  operation: string
  evidenceDigest: Hex
  decision: WethAllowancePaperDecision
  executionEligible: boolean
  chainId: number
  owner: Address
  token: Address
  spender: Address
  desiredAllowance: bigint
  nativeValue: bigint
  sharedBlock: bigint
  blockHash: Hex
  observedAt: Date
  freshness: string
}>

export type WethAllowanceSimulationProviderEvidence = Readonly<{
  status: 'available' | 'unavailable'
  providerCount: number
  providerAgreement: boolean
  referencedPaperDigest: Hex
  sharedBlock: bigint | null
  blockHash: Hex | null
  observedAt: Date | null
  maximumAgeSeconds: number
  metadataRedacted: boolean
}>

export type WethAllowanceSimulationIdentityEvidence = Readonly<{
  registryVerified: boolean
  authorityStatus: string
  authoritySourceAgreement: boolean
  unresolvedAuthorityBoundaryCount: number
  registryExecutionEligible: boolean
  authorityExecutionEligible: boolean
  proxyAddress: Address
  proxyBytecodeHash: Hex
  implementationAddress: Address
  implementationBytecodeHash: Hex
}>

export type WethAllowanceSimulationStateDiff = Readonly<{
  allowanceBefore: bigint
  allowanceAfter: bigint
  tokenBalanceDeltas: readonly WethAllowanceSimulationBalanceDelta[]
  nativeBalanceDeltas: readonly WethAllowanceSimulationBalanceDelta[]
  otherStateChanges: readonly string[]
}>

export type WethAllowanceSimulationPolicyInput = Readonly<{
  policyVersion: string
  paper: WethAllowanceSimulationPaperReference
  providers: WethAllowanceSimulationProviderEvidence
  identity: WethAllowanceSimulationIdentityEvidence
  calls: readonly WethAllowanceSimulationCall[]
  logs: readonly WethAllowanceSimulationLog[]
  stateDiff: WethAllowanceSimulationStateDiff
  touchedContracts: readonly Address[]
  containsRawTransactionMaterial: boolean
}>

export type WethAllowanceSimulationPolicyCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceSimulationPolicyResult = Readonly<{
  policyVersion: typeof WETH_ALLOWANCE_SIMULATION_POLICY_VERSION
  status: 'policy-conformant' | 'blocked'
  checks: readonly WethAllowanceSimulationPolicyCheck[]
  reasons: readonly string[]
  evidenceDigest: Hex
  implementationAuthorized: false
  simulationAuthorized: false
  executionEligible: false
  disclaimer: string
}>

export function defaultWethAllowanceSimulationIdentityEvidence(): WethAllowanceSimulationIdentityEvidence {
  return {
    registryVerified: true,
    authorityStatus: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.status,
    authoritySourceAgreement: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.sourceAgreement,
    unresolvedAuthorityBoundaryCount: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.authorityBoundaries.length,
    registryExecutionEligible: false,
    authorityExecutionEligible: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.executionEligible,
    proxyAddress: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
    proxyBytecodeHash: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.bytecodeHash,
    implementationAddress: ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
    implementationBytecodeHash: ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.bytecodeHash,
  }
}

export function validateWethAllowanceSimulationEvidencePolicy(
  input: WethAllowanceSimulationPolicyInput,
  reviewedAt = new Date(),
): WethAllowanceSimulationPolicyResult {
  if (Number.isNaN(reviewedAt.getTime())) throw new RangeError('reviewedAt must be valid')

  const expectedProxy = ROBINHOOD_WETH_PROXY_EVIDENCE.proxy
  const expectedImplementation = ROBINHOOD_WETH_PROXY_EVIDENCE.implementation
  const root = input.calls.find((call) => call.id === 'root')
  const implementation = input.calls.find((call) => call.id === 'implementation')
  const providerFreshness = evidenceFreshness(input.providers.observedAt, input.providers.maximumAgeSeconds, reviewedAt)

  const checks: WethAllowanceSimulationPolicyCheck[] = [
    policyCheck(
      'policy-version',
      input.policyVersion === WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
      'Policy version matches.',
      'Policy version differs.',
    ),
    policyCheck(
      'paper-operation',
      input.paper.operation === WETH_ALLOWANCE_REVOCATION_OPERATION,
      'Paper operation is pinned.',
      'Paper operation differs.',
    ),
    policyCheck(
      'paper-decision',
      input.paper.decision === 'ready-for-separate-simulation-review',
      'Paper decision permits policy review only.',
      'Paper decision is not ready for separate simulation review.',
    ),
    policyCheck(
      'paper-execution-disabled',
      input.paper.executionEligible === false,
      'Paper execution eligibility remains disabled.',
      'Paper evidence is not execution-disabled.',
    ),
    policyCheck(
      'paper-chain',
      input.paper.chainId === ROBINHOOD_CHAIN_ID,
      'Paper chain ID is pinned.',
      'Paper chain ID differs.',
    ),
    policyCheck(
      'paper-owner',
      input.paper.owner !== zeroAddress,
      'Paper owner is nonzero.',
      'Paper owner is zero.',
    ),
    policyCheck(
      'paper-token',
      input.paper.token === ROBINHOOD_UNISWAP_V3.wrappedNative,
      'Paper token is pinned WETH.',
      'Paper token differs from pinned WETH.',
    ),
    policyCheck(
      'paper-spender',
      input.paper.spender === ROBINHOOD_UNISWAP_V3.positionManager,
      'Paper spender is the pinned position manager.',
      'Paper spender differs from the pinned position manager.',
    ),
    policyCheck(
      'paper-amount',
      input.paper.desiredAllowance === 0n,
      'Paper desired allowance is zero.',
      'Paper desired allowance is nonzero.',
    ),
    policyCheck(
      'paper-native-value',
      input.paper.nativeValue === 0n,
      'Paper native value is zero.',
      'Paper native value is nonzero.',
    ),
    policyCheck(
      'paper-freshness',
      input.paper.freshness === 'fresh',
      'Paper evidence is marked fresh.',
      'Paper evidence is not fresh.',
    ),
    policyCheck(
      'provider-available',
      input.providers.status === 'available',
      'Simulation evidence sources are available.',
      'Simulation evidence sources are unavailable.',
    ),
    policyCheck(
      'provider-count',
      input.providers.providerCount >= 2,
      'At least two evidence sources are present.',
      'Fewer than two evidence sources are present.',
    ),
    policyCheck(
      'provider-agreement',
      input.providers.providerAgreement,
      'Simulation evidence sources agree.',
      'Simulation evidence sources disagree.',
    ),
    policyCheck(
      'paper-digest-reference',
      input.providers.referencedPaperDigest === input.paper.evidenceDigest,
      'Simulation evidence references the exact paper digest.',
      'Simulation evidence references a different paper digest.',
    ),
    policyCheck(
      'shared-block',
      input.providers.sharedBlock === input.paper.sharedBlock && input.providers.blockHash === input.paper.blockHash,
      'Simulation evidence uses the exact paper block and hash.',
      'Simulation evidence does not use the exact paper block and hash.',
    ),
    policyCheck(
      'provider-freshness-threshold',
      Number.isInteger(input.providers.maximumAgeSeconds) &&
        input.providers.maximumAgeSeconds > 0 &&
        input.providers.maximumAgeSeconds <= WETH_ALLOWANCE_SIMULATION_MAX_AGE_SECONDS,
      'Simulation freshness threshold is within policy.',
      'Simulation freshness threshold is invalid or too broad.',
    ),
    policyCheck(
      'provider-freshness',
      providerFreshness === 'fresh',
      'Simulation evidence is fresh.',
      `Simulation evidence freshness is ${providerFreshness}.`,
    ),
    policyCheck(
      'provider-metadata-redacted',
      input.providers.metadataRedacted,
      'Provider metadata is redacted.',
      'Provider metadata is not confirmed redacted.',
    ),
    policyCheck(
      'registry-verified',
      input.identity.registryVerified,
      'Registry evidence is verified.',
      'Registry evidence is not verified.',
    ),
    policyCheck(
      'authority-verified',
      input.identity.authorityStatus === 'read-only-authority-chain-verified' &&
        input.identity.authoritySourceAgreement &&
        input.identity.unresolvedAuthorityBoundaryCount === 0,
      'Authority evidence is verified with no unresolved boundary.',
      'Authority evidence is unresolved or disagreed.',
    ),
    policyCheck(
      'identity-execution-disabled',
      input.identity.registryExecutionEligible === false && input.identity.authorityExecutionEligible === false,
      'Registry and authority execution eligibility remain disabled.',
      'Registry or authority evidence is not execution-disabled.',
    ),
    policyCheck(
      'proxy-identity',
      input.identity.proxyAddress === expectedProxy.address &&
        input.identity.proxyBytecodeHash === expectedProxy.bytecodeHash,
      'WETH proxy identity matches.',
      'WETH proxy identity differs.',
    ),
    policyCheck(
      'implementation-identity',
      input.identity.implementationAddress === expectedImplementation.address &&
        input.identity.implementationBytecodeHash === expectedImplementation.bytecodeHash,
      'WETH implementation identity matches.',
      'WETH implementation identity differs.',
    ),
    policyCheck(
      'raw-transaction-material',
      input.containsRawTransactionMaterial === false,
      'No raw transaction material is present.',
      'Raw transaction material is present.',
    ),
    policyCheck(
      'call-count',
      input.calls.length === 2,
      'Call tree contains only the proxy call and implementation delegatecall.',
      'Call tree contains an unexpected number of calls.',
    ),
    policyCheck(
      'root-call',
      root !== undefined && validRootCall(root, input.paper),
      'Root call matches the typed paper intent.',
      'Root call differs from the typed paper intent.',
    ),
    policyCheck(
      'implementation-delegatecall',
      implementation !== undefined && validImplementationCall(implementation),
      'Only the expected proxy-to-implementation delegatecall is present.',
      'Implementation delegatecall differs or is absent.',
    ),
    policyCheck(
      'call-depth',
      input.calls.every((call) => call.depth >= 0 && call.depth <= WETH_ALLOWANCE_SIMULATION_MAX_CALL_DEPTH),
      'Call depth remains within policy.',
      'Call depth exceeds policy.',
    ),
    policyCheck(
      'prohibited-call-types',
      input.calls.every((call) => call.type === 'call' || call.type === 'delegatecall'),
      'No prohibited call type is present.',
      'A prohibited call type is present.',
    ),
    policyCheck(
      'touched-contracts',
      sameAddressSet(input.touchedContracts, [expectedProxy.address, expectedImplementation.address]),
      'Only the WETH proxy and reviewed implementation are touched.',
      'Unexpected contracts are touched.',
    ),
    policyCheck(
      'approval-log',
      input.logs.length === 1 && validApprovalLog(input.logs[0], input.paper),
      'Exactly one expected Approval log is present.',
      'Approval logs are missing, duplicated, or unexpected.',
    ),
    policyCheck(
      'allowance-state-diff',
      input.stateDiff.allowanceBefore > 0n && input.stateDiff.allowanceAfter === 0n,
      'Allowance changes from nonzero to zero.',
      'Allowance state diff is not a nonzero-to-zero change.',
    ),
    policyCheck(
      'token-balance-deltas',
      input.stateDiff.tokenBalanceDeltas.length === 0,
      'No token balance delta is present.',
      'An unexpected token balance delta is present.',
    ),
    policyCheck(
      'native-balance-deltas',
      input.stateDiff.nativeBalanceDeltas.length === 0,
      'No native balance delta is present.',
      'An unexpected native balance delta is present.',
    ),
    policyCheck(
      'other-state-changes',
      input.stateDiff.otherStateChanges.length === 0,
      'No unrelated state change is present.',
      'An unrelated state change is present.',
    ),
  ]

  const failed = checks.filter((check) => check.status === 'fail')
  const resultWithoutDigest = {
    policyVersion: WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
    status: failed.length === 0 ? ('policy-conformant' as const) : ('blocked' as const),
    checks,
    reasons:
      failed.length === 0
        ? [
            'The inert evidence fixture conforms to the reviewed policy. This does not authorize a simulation call, transaction construction, signing, or execution.',
          ]
        : failed.map((check) => check.message),
    implementationAuthorized: false as const,
    simulationAuthorized: false as const,
    executionEligible: false as const,
    disclaimer:
      'This policy result validates only an inert normalized evidence fixture. It does not encode calldata, call a simulator, construct a transaction, connect a wallet, request a signature, submit a transaction, move funds, or recommend capital deployment.',
  }

  return {
    ...resultWithoutDigest,
    evidenceDigest: keccak256(stringToHex(canonicalJson({ input, result: resultWithoutDigest }))),
  }
}

function validRootCall(
  call: WethAllowanceSimulationCall,
  paper: WethAllowanceSimulationPaperReference,
): boolean {
  return (
    call.parentId === null &&
    call.depth === 0 &&
    call.type === 'call' &&
    getAddress(call.from) === paper.owner &&
    getAddress(call.to) === ROBINHOOD_UNISWAP_V3.wrappedNative &&
    call.nativeValue === 0n &&
    call.functionName === 'approve' &&
    getAddress(call.spender) === ROBINHOOD_UNISWAP_V3.positionManager &&
    call.amount === 0n
  )
}

function validImplementationCall(call: WethAllowanceSimulationCall): boolean {
  return (
    call.parentId === 'root' &&
    call.depth === 1 &&
    call.type === 'delegatecall' &&
    getAddress(call.from) === ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address &&
    getAddress(call.to) === ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address &&
    call.nativeValue === 0n &&
    call.functionName === 'approve' &&
    getAddress(call.spender) === ROBINHOOD_UNISWAP_V3.positionManager &&
    call.amount === 0n
  )
}

function validApprovalLog(
  log: WethAllowanceSimulationLog | undefined,
  paper: WethAllowanceSimulationPaperReference,
): boolean {
  return (
    log !== undefined &&
    getAddress(log.address) === ROBINHOOD_UNISWAP_V3.wrappedNative &&
    log.eventName === 'Approval' &&
    getAddress(log.owner) === paper.owner &&
    getAddress(log.spender) === ROBINHOOD_UNISWAP_V3.positionManager &&
    log.value === 0n
  )
}

function sameAddressSet(actual: readonly Address[], expected: readonly Address[]): boolean {
  const normalizedActual = [...new Set(actual.map((address) => getAddress(address)))].sort()
  const normalizedExpected = [...new Set(expected.map((address) => getAddress(address)))].sort()
  return canonicalJson(normalizedActual) === canonicalJson(normalizedExpected)
}

function evidenceFreshness(
  observedAt: Date | null,
  maximumAgeSeconds: number,
  reviewedAt: Date,
): 'fresh' | 'stale' | 'future' | 'unavailable' {
  if (observedAt === null || Number.isNaN(observedAt.getTime())) return 'unavailable'
  if (!Number.isInteger(maximumAgeSeconds) || maximumAgeSeconds <= 0) return 'unavailable'
  const ageMilliseconds = reviewedAt.getTime() - observedAt.getTime()
  if (ageMilliseconds < 0) return 'future'
  return Math.floor(ageMilliseconds / 1_000) <= maximumAgeSeconds ? 'fresh' : 'stale'
}

function policyCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceSimulationPolicyCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
