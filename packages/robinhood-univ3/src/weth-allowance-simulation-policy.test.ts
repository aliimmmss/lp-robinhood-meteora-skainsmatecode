import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_TOKENS, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
  defaultWethAllowanceSimulationIdentityEvidence,
  validateWethAllowanceSimulationEvidencePolicy,
  type WethAllowanceSimulationPolicyInput,
} from './weth-allowance-simulation-policy.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const reviewedAt = new Date('2026-07-21T18:05:00.000Z')
const owner = getAddress('0x640BF0B6b8706f35195d6491cbE347c01b967393')
const paperDigest = `0x${'11'.repeat(32)}` as const
const blockHash = `0x${'22'.repeat(32)}` as const

function validInput(): WethAllowanceSimulationPolicyInput {
  return {
    policyVersion: WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
    paper: {
      operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
      evidenceDigest: paperDigest,
      decision: 'ready-for-separate-simulation-review',
      executionEligible: false,
      chainId: ROBINHOOD_CHAIN_ID,
      owner,
      token: ROBINHOOD_UNISWAP_V3.wrappedNative,
      spender: ROBINHOOD_UNISWAP_V3.positionManager,
      desiredAllowance: 0n,
      nativeValue: 0n,
      sharedBlock: 15_700_000n,
      blockHash,
      observedAt: new Date('2026-07-21T18:04:00.000Z'),
      freshness: 'fresh',
    },
    providers: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: 15_700_000n,
      blockHash,
      observedAt: new Date('2026-07-21T18:04:30.000Z'),
      maximumAgeSeconds: 300,
      metadataRedacted: true,
    },
    identity: defaultWethAllowanceSimulationIdentityEvidence(),
    calls: [
      {
        id: 'root',
        parentId: null,
        depth: 0,
        type: 'call',
        from: owner,
        to: ROBINHOOD_UNISWAP_V3.wrappedNative,
        nativeValue: 0n,
        functionName: 'approve',
        spender: ROBINHOOD_UNISWAP_V3.positionManager,
        amount: 0n,
      },
      {
        id: 'implementation',
        parentId: 'root',
        depth: 1,
        type: 'delegatecall',
        from: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
        to: ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
        nativeValue: 0n,
        functionName: 'approve',
        spender: ROBINHOOD_UNISWAP_V3.positionManager,
        amount: 0n,
      },
    ],
    logs: [
      {
        address: ROBINHOOD_UNISWAP_V3.wrappedNative,
        eventName: 'Approval',
        owner,
        spender: ROBINHOOD_UNISWAP_V3.positionManager,
        value: 0n,
      },
    ],
    stateDiff: {
      allowanceBefore: 1n,
      allowanceAfter: 0n,
      tokenBalanceDeltas: [],
      nativeBalanceDeltas: [],
      otherStateChanges: [],
    },
    touchedContracts: [
      ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
      ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
    ],
    containsRawTransactionMaterial: false,
  }
}

describe('WETH allowance-revocation simulation evidence policy', () => {
  it('accepts the exact inert evidence fixture without authorizing implementation or execution', () => {
    const result = validateWethAllowanceSimulationEvidencePolicy(validInput(), reviewedAt)

    expect(result.status).toBe('policy-conformant')
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(result.implementationAuthorized).toBe(false)
    expect(result.simulationAuthorized).toBe(false)
    expect(result.executionEligible).toBe(false)
    expect(result.evidenceDigest).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('blocks wrong paper intent fields and no-op paper evidence', () => {
    const input = validInput()
    const cases: WethAllowanceSimulationPolicyInput[] = [
      { ...input, paper: { ...input.paper, operation: 'other-operation' } },
      { ...input, paper: { ...input.paper, decision: 'noop' } },
      { ...input, paper: { ...input.paper, executionEligible: true } },
      { ...input, paper: { ...input.paper, chainId: 1 } },
      { ...input, paper: { ...input.paper, owner: getAddress('0x0000000000000000000000000000000000000000') } },
      { ...input, paper: { ...input.paper, token: ROBINHOOD_TOKENS.usdg } },
      { ...input, paper: { ...input.paper, spender: ROBINHOOD_UNISWAP_V3.factory } },
      { ...input, paper: { ...input.paper, desiredAllowance: 1n } },
      { ...input, paper: { ...input.paper, nativeValue: 1n } },
      { ...input, paper: { ...input.paper, freshness: 'stale' } },
    ]

    for (const candidate of cases) {
      const result = validateWethAllowanceSimulationEvidencePolicy(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('blocks unavailable, stale, future, mismatched, or unredacted provider evidence', () => {
    const input = validInput()
    const cases: WethAllowanceSimulationPolicyInput[] = [
      { ...input, providers: { ...input.providers, status: 'unavailable' } },
      { ...input, providers: { ...input.providers, providerCount: 1 } },
      { ...input, providers: { ...input.providers, providerAgreement: false } },
      { ...input, providers: { ...input.providers, referencedPaperDigest: `0x${'33'.repeat(32)}` } },
      { ...input, providers: { ...input.providers, sharedBlock: input.paper.sharedBlock + 1n } },
      { ...input, providers: { ...input.providers, blockHash: `0x${'44'.repeat(32)}` } },
      { ...input, providers: { ...input.providers, maximumAgeSeconds: 301 } },
      {
        ...input,
        providers: { ...input.providers, observedAt: new Date('2026-07-21T17:50:00.000Z') },
      },
      {
        ...input,
        providers: { ...input.providers, observedAt: new Date('2026-07-21T18:06:00.000Z') },
      },
      { ...input, providers: { ...input.providers, metadataRedacted: false } },
    ]

    for (const candidate of cases) {
      const result = validateWethAllowanceSimulationEvidencePolicy(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
    }
  })

  it('blocks registry, authority, proxy, or implementation drift', () => {
    const input = validInput()
    const cases: WethAllowanceSimulationPolicyInput[] = [
      { ...input, identity: { ...input.identity, registryVerified: false } },
      { ...input, identity: { ...input.identity, authorityStatus: 'unresolved' } },
      { ...input, identity: { ...input.identity, authoritySourceAgreement: false } },
      { ...input, identity: { ...input.identity, unresolvedAuthorityBoundaryCount: 1 } },
      { ...input, identity: { ...input.identity, registryExecutionEligible: true } },
      { ...input, identity: { ...input.identity, authorityExecutionEligible: true } },
      { ...input, identity: { ...input.identity, proxyAddress: ROBINHOOD_UNISWAP_V3.positionManager } },
      { ...input, identity: { ...input.identity, proxyBytecodeHash: `0x${'00'.repeat(32)}` } },
      { ...input, identity: { ...input.identity, implementationAddress: ROBINHOOD_UNISWAP_V3.factory } },
      { ...input, identity: { ...input.identity, implementationBytecodeHash: `0x${'00'.repeat(32)}` } },
    ]

    for (const candidate of cases) {
      const result = validateWethAllowanceSimulationEvidencePolicy(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
    }
  })

  it('blocks raw transaction material and any unexpected call-tree behavior', () => {
    const input = validInput()
    const extraCall = {
      ...input.calls[0]!,
      id: 'extra',
      parentId: 'implementation',
      depth: 2,
      to: ROBINHOOD_UNISWAP_V3.positionManager,
    }
    const cases: WethAllowanceSimulationPolicyInput[] = [
      { ...input, containsRawTransactionMaterial: true },
      { ...input, calls: input.calls.slice(0, 1) },
      { ...input, calls: [...input.calls, extraCall] },
      { ...input, calls: [{ ...input.calls[0]!, type: 'delegatecall' }, input.calls[1]!] },
      { ...input, calls: [{ ...input.calls[0]!, functionName: 'transfer' }, input.calls[1]!] },
      { ...input, calls: [{ ...input.calls[0]!, nativeValue: 1n }, input.calls[1]!] },
      { ...input, calls: [input.calls[0]!, { ...input.calls[1]!, type: 'call' }] },
      { ...input, calls: [input.calls[0]!, { ...input.calls[1]!, to: ROBINHOOD_UNISWAP_V3.positionManager }] },
      { ...input, calls: [input.calls[0]!, { ...input.calls[1]!, amount: 1n }] },
      { ...input, calls: [{ ...input.calls[0]!, type: 'create' }, input.calls[1]!] },
      { ...input, touchedContracts: [...input.touchedContracts, ROBINHOOD_UNISWAP_V3.positionManager] },
    ]

    for (const candidate of cases) {
      const result = validateWethAllowanceSimulationEvidencePolicy(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
    }
  })

  it('blocks extra, missing, or substituted logs', () => {
    const input = validInput()
    const cases: WethAllowanceSimulationPolicyInput[] = [
      { ...input, logs: [] },
      { ...input, logs: [...input.logs, input.logs[0]!] },
      { ...input, logs: [{ ...input.logs[0]!, address: ROBINHOOD_UNISWAP_V3.positionManager }] },
      { ...input, logs: [{ ...input.logs[0]!, eventName: 'Transfer' }] },
      { ...input, logs: [{ ...input.logs[0]!, owner: ROBINHOOD_UNISWAP_V3.positionManager }] },
      { ...input, logs: [{ ...input.logs[0]!, spender: ROBINHOOD_UNISWAP_V3.factory }] },
      { ...input, logs: [{ ...input.logs[0]!, value: 1n }] },
    ]

    for (const candidate of cases) {
      const result = validateWethAllowanceSimulationEvidencePolicy(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
    }
  })

  it('blocks unexpected allowance, token, native, or unrelated state changes', () => {
    const input = validInput()
    const cases: WethAllowanceSimulationPolicyInput[] = [
      { ...input, stateDiff: { ...input.stateDiff, allowanceBefore: 0n } },
      { ...input, stateDiff: { ...input.stateDiff, allowanceAfter: 1n } },
      {
        ...input,
        stateDiff: {
          ...input.stateDiff,
          tokenBalanceDeltas: [{ account: owner, asset: ROBINHOOD_UNISWAP_V3.wrappedNative, delta: -1n }],
        },
      },
      {
        ...input,
        stateDiff: {
          ...input.stateDiff,
          nativeBalanceDeltas: [{ account: owner, asset: null, delta: -1n }],
        },
      },
      { ...input, stateDiff: { ...input.stateDiff, otherStateChanges: ['position-mutated'] } },
    ]

    for (const candidate of cases) {
      const result = validateWethAllowanceSimulationEvidencePolicy(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
    }
  })

  it('produces a stable digest for identical fixtures and changes it on drift', () => {
    const first = validateWethAllowanceSimulationEvidencePolicy(validInput(), reviewedAt)
    const second = validateWethAllowanceSimulationEvidencePolicy(validInput(), new Date(reviewedAt))
    expect(second.evidenceDigest).toBe(first.evidenceDigest)

    const drifted = validInput()
    const changed = validateWethAllowanceSimulationEvidencePolicy(
      { ...drifted, stateDiff: { ...drifted.stateDiff, allowanceBefore: 2n } },
      reviewedAt,
    )
    expect(changed.evidenceDigest).not.toBe(first.evidenceDigest)
  })
})
