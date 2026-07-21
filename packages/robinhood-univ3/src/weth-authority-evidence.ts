import { getAddress, type Address, type Hex } from 'viem'
import { ROBINHOOD_CHAIN_ID } from './registry.js'
import { ROBINHOOD_WETH_CONTROL_EVIDENCE } from './weth-control-evidence.js'

export type AuthorityCodeEvidence = Readonly<{
  address: Address
  byteLength: number
  bytecodeHash: Hex | null
}>

export type SafeAuthorityObservedState = Readonly<{
  sharedBlock: bigint
  deploymentBlock: bigint
  code: AuthorityCodeEvidence
  singleton: Address
  owners: readonly Address[]
  threshold: number
  nonce: bigint
  modules: readonly Address[]
  guard: Address | null
  fallbackHandler: Address
  version: string
  domainSeparator: Hex
  contractOwners: readonly Address[]
}>

export type WethAuthorityObservedState = Readonly<{
  chainId: number
  controllerProxy: AuthorityCodeEvidence
  controllerImplementation: AuthorityCodeEvidence
  controllerAdmin: AuthorityCodeEvidence
  controllerRoles: Readonly<{
    sharedBlock: bigint
    eventCount: number
    eventDigest: Hex
    defaultAdminRole: Hex
    adminRole: Hex
    executorRole: Hex
    defaultAdminRoleAdmin: Hex
    adminRoleAdmin: Hex
    executorRoleAdmin: Hex
    defaultAdminHolders: readonly Address[]
    adminHolders: readonly Address[]
    executorHolders: readonly Address[]
    executorEoa: AuthorityCodeEvidence
  }>
  timelock: Readonly<{
    sharedBlock: bigint
    deploymentBlock: bigint
    eventCount: number
    eventDigest: Hex
    code: AuthorityCodeEvidence
    implementation: AuthorityCodeEvidence
    proxyAdmin: AuthorityCodeEvidence
    proxyAdminOwner: Address
    minimumDelaySeconds: bigint
    openExecutor: boolean
    defaultAdminHolders: readonly Address[]
    proposerHolders: readonly Address[]
    cancellerHolders: readonly Address[]
  }>
  safeSingleton: AuthorityCodeEvidence
  fallbackHandler: AuthorityCodeEvidence
  safes: Readonly<{
    controllerExecutor: SafeAuthorityObservedState
    timelockGovernance: SafeAuthorityObservedState
    nestedOwner: SafeAuthorityObservedState
  }>
  authorityBoundaries: readonly Address[]
}>

export type WethAuthorityCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAuthorityVerification = Readonly<{
  status: 'verified-read-only' | 'mismatch'
  executionEligible: false
  checks: readonly WethAuthorityCheck[]
}>

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex
const ADMIN_ROLE = '0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775' as Hex
const EXECUTOR_ROLE = '0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63' as Hex

const CONTROLLER = getAddress('0x2A153c6A1B66DBc930a8d7017230ab0253005C09')
const TIMELOCK = getAddress('0x560C81fe78FcC276e460524428f1a62057Ca8173')
const CONTROLLER_EXECUTOR_SAFE = getAddress('0x6b9F63817F1442e40Bb9c3C2207758934C323FdC')
const TIMELOCK_GOVERNANCE_SAFE = getAddress('0x4C0360aFedD31e53718e4343F95E40b692402462')
const NESTED_SAFE = getAddress('0x3A0C507Cc7F8785C877359ad49d0476966d17a1C')
const SAFE_SINGLETON = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')
const FALLBACK_HANDLER = getAddress('0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99')

export const ROBINHOOD_WETH_AUTHORITY_EVIDENCE = Object.freeze({
  status: 'read-only-authority-chain-verified' as const,
  chainId: ROBINHOOD_CHAIN_ID,
  sourceAgreement: true,
  reviewedAt: '2026-07-21T16:06:39.306Z',
  auditRuns: Object.freeze({
    controllerRoles: '29837850292',
    timelock: '29843251873',
    parentSafes: '29845750811',
    nestedSafe: '29846927871',
  }),
  controllerProxy: ROBINHOOD_WETH_CONTROL_EVIDENCE.controllerProxy,
  controllerImplementation: ROBINHOOD_WETH_CONTROL_EVIDENCE.controllerImplementation,
  controllerAdmin: ROBINHOOD_WETH_CONTROL_EVIDENCE.controllerAdmin,
  controllerRoles: Object.freeze({
    sharedBlock: 15_624_191n,
    eventCount: 10,
    eventDigest: '0xd880dde31907ed8351ec66af46cc7f96afffbda565e67501b23f4f4dabdabd06' as Hex,
    roleIds: Object.freeze({
      DEFAULT_ADMIN_ROLE,
      ADMIN_ROLE,
      EXECUTOR_ROLE,
    }),
    roleAdmins: Object.freeze({
      DEFAULT_ADMIN_ROLE,
      ADMIN_ROLE,
      EXECUTOR_ROLE: ADMIN_ROLE,
    }),
    holders: Object.freeze({
      DEFAULT_ADMIN_ROLE: Object.freeze([] as Address[]),
      ADMIN_ROLE: Object.freeze([CONTROLLER]),
      EXECUTOR_ROLE: Object.freeze([
        TIMELOCK,
        getAddress('0x663703B4bC1F5e896Af2854548d6380F45F1C5D0'),
        CONTROLLER_EXECUTOR_SAFE,
      ]),
    }),
    executorEoa: Object.freeze({
      address: getAddress('0x663703B4bC1F5e896Af2854548d6380F45F1C5D0'),
      byteLength: 0,
      bytecodeHash: null,
    }),
  }),
  timelock: Object.freeze({
    sharedBlock: 15_664_291n,
    deploymentBlock: 615_454n,
    eventCount: 5,
    eventDigest: '0xb6c5a26b4609847486a3a41ea4b801b2539b6c9653ae58c2a4900245e0bb8631' as Hex,
    code: Object.freeze({
      address: TIMELOCK,
      byteLength: 1_400,
      bytecodeHash: '0xf48156e5fbedbcb08b438f07fd522b4365eab310620cfbcdf8b9e7a788153290' as Hex,
    }),
    implementation: Object.freeze({
      address: getAddress('0x145046bdd5c4bc72338f60dE5d9707BD73ff1843'),
      byteLength: 8_851,
      bytecodeHash: '0x17b6f897444c34a6a4f33c13f8f31bce8219a7d93a498b033559dde2604d8894' as Hex,
    }),
    proxyAdmin: Object.freeze({
      address: getAddress('0x672Da8B43058D1bC78956d71d9A208E168E2a3EF'),
      byteLength: 1_271,
      bytecodeHash: '0x9ffddcec832245e585ed678885669b8db839518300985f387230791e936d6231' as Hex,
    }),
    proxyAdminOwner: CONTROLLER,
    minimumDelaySeconds: 604_800n,
    openExecutor: true,
    defaultAdminHolders: Object.freeze([CONTROLLER, TIMELOCK]),
    proposerHolders: Object.freeze([TIMELOCK_GOVERNANCE_SAFE]),
    cancellerHolders: Object.freeze([TIMELOCK_GOVERNANCE_SAFE]),
  }),
  safeSingleton: Object.freeze({
    address: SAFE_SINGLETON,
    byteLength: 24_421,
    bytecodeHash: '0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff' as Hex,
  }),
  fallbackHandler: Object.freeze({
    address: FALLBACK_HANDLER,
    byteLength: 5_637,
    bytecodeHash: '0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9' as Hex,
  }),
  safes: Object.freeze({
    controllerExecutor: safeEvidence({
      address: CONTROLLER_EXECUTOR_SAFE,
      sharedBlock: 15_683_672n,
      deploymentBlock: 615_414n,
      owners: [
        '0x640BF0B6b8706f35195d6491cbE347c01b967393',
        '0x7957e74a59Af4404f64B454cDfaF08F7047021DD',
        NESTED_SAFE,
        '0x686c4267B9F9868Dff3787CeA38f44868c6DF6eA',
        '0xb89C85BE593e6A8f7e35AC481b5F75Fc4036f31c',
        '0x29631c2da9Ab1C0Ca1935A463842a9484E34Fa17',
        '0x2584fd737d35bE395aa979b18602d0dE65f38b2c',
        '0xe94aCAa305ce4DF3862585AD0B8Ed05C8C808d6A',
      ],
      threshold: 7,
      nonce: 3n,
      domainSeparator: '0xa8ce32f442f51ec8853b18d1d5fc555f0f9af1295e0ce174e2dc68d0ff0db1bb',
      contractOwners: [NESTED_SAFE],
    }),
    timelockGovernance: safeEvidence({
      address: TIMELOCK_GOVERNANCE_SAFE,
      sharedBlock: 15_683_672n,
      deploymentBlock: 615_418n,
      owners: [
        '0x640BF0B6b8706f35195d6491cbE347c01b967393',
        '0x7957e74a59Af4404f64B454cDfaF08F7047021DD',
        NESTED_SAFE,
        '0x686c4267B9F9868Dff3787CeA38f44868c6DF6eA',
        '0xb89C85BE593e6A8f7e35AC481b5F75Fc4036f31c',
        '0xd857d3f06D53d1449E6D2b2A6f61ec33c8577bB1',
        '0xC9514ec78905505B4b3947E586bAeEb88E459353',
        '0xe94aCAa305ce4DF3862585AD0B8Ed05C8C808d6A',
      ],
      threshold: 6,
      nonce: 1n,
      domainSeparator: '0x813eb1a17ecd2f32827556782e8276223b15aa073ca681d385e1e002730b07e6',
      contractOwners: [NESTED_SAFE],
    }),
    nestedOwner: safeEvidence({
      address: NESTED_SAFE,
      sharedBlock: 15_692_744n,
      deploymentBlock: 460_358n,
      owners: [
        '0x582B0cCE0bA332D151998A7cA62Cf12d308b050F',
        '0xBa86e3b54E3Ee00185EccB41ff40FC3d5Ee79ecA',
        '0xFA677559d43856af84E9ceA929E36BF126da4562',
        '0x499b56449Fe624Cc984Ec92F64Be01F9619441B4',
        '0x90a0eb0337224f74D694c04648f0Ab8a80E37029',
        '0x026F0df4b04a258207337fBB05790F0E1283e526',
        '0x9b6488FBa4ed8fD4840F37345311eCCA1B09740C',
      ],
      threshold: 3,
      nonce: 4n,
      domainSeparator: '0x8fabaa1c25be9c1966b8df222228171c9a9218bdebf0106ed8dcd8979e0b10b1',
      contractOwners: [],
    }),
  }),
  authorityBoundaries: Object.freeze([] as Address[]),
  controlStatus: 'authority-chain-verified' as const,
  executionEligible: false as const,
  executionBlockers: Object.freeze([
    'This is a historical read-only evidence snapshot, not an authorization to construct or submit a transaction.',
    'Any role, holder, Safe configuration, proxy, bytecode, or canonical dependency drift requires a new review.',
    'No approved transaction intent, simulation, browser-wallet confirmation, submission, or receipt reconciliation exists.',
    'No profitability or capital-allocation recommendation is approved by this evidence.',
  ]),
  references: Object.freeze([
    'https://github.com/aliimmmss/lp-mine-skains/issues/72',
    'https://github.com/aliimmmss/lp-mine-skains/issues/89',
    'https://github.com/aliimmmss/lp-mine-skains/issues/90',
    'https://github.com/aliimmmss/lp-mine-skains/issues/93',
    'https://github.com/aliimmmss/lp-mine-skains/issues/99',
  ]),
})

export function verifyRobinhoodWethAuthorityEvidence(observed: WethAuthorityObservedState): WethAuthorityVerification {
  const expected = ROBINHOOD_WETH_AUTHORITY_EVIDENCE
  const checks: WethAuthorityCheck[] = [
    scalarCheck('chain-id', observed.chainId, expected.chainId, 'Chain ID'),
    codeCheck('controller-proxy', observed.controllerProxy, expected.controllerProxy),
    codeCheck('controller-implementation', observed.controllerImplementation, expected.controllerImplementation),
    codeCheck('controller-admin', observed.controllerAdmin, expected.controllerAdmin),
    scalarCheck(
      'controller-role-block',
      observed.controllerRoles.sharedBlock,
      expected.controllerRoles.sharedBlock,
      'Controller role snapshot block',
    ),
    scalarCheck(
      'controller-role-event-count',
      observed.controllerRoles.eventCount,
      expected.controllerRoles.eventCount,
      'Controller role event count',
    ),
    hexCheck(
      'controller-role-event-digest',
      observed.controllerRoles.eventDigest,
      expected.controllerRoles.eventDigest,
      'Controller role event digest',
    ),
    hexCheck(
      'controller-default-admin-role',
      observed.controllerRoles.defaultAdminRole,
      expected.controllerRoles.roleIds.DEFAULT_ADMIN_ROLE,
      'Controller DEFAULT_ADMIN_ROLE',
    ),
    hexCheck(
      'controller-admin-role',
      observed.controllerRoles.adminRole,
      expected.controllerRoles.roleIds.ADMIN_ROLE,
      'Controller ADMIN_ROLE',
    ),
    hexCheck(
      'controller-executor-role',
      observed.controllerRoles.executorRole,
      expected.controllerRoles.roleIds.EXECUTOR_ROLE,
      'Controller EXECUTOR_ROLE',
    ),
    hexCheck(
      'controller-default-admin-role-admin',
      observed.controllerRoles.defaultAdminRoleAdmin,
      expected.controllerRoles.roleAdmins.DEFAULT_ADMIN_ROLE,
      'Controller DEFAULT_ADMIN_ROLE admin',
    ),
    hexCheck(
      'controller-admin-role-admin',
      observed.controllerRoles.adminRoleAdmin,
      expected.controllerRoles.roleAdmins.ADMIN_ROLE,
      'Controller ADMIN_ROLE admin',
    ),
    hexCheck(
      'controller-executor-role-admin',
      observed.controllerRoles.executorRoleAdmin,
      expected.controllerRoles.roleAdmins.EXECUTOR_ROLE,
      'Controller EXECUTOR_ROLE admin',
    ),
    addressListCheck(
      'controller-default-admin-holders',
      observed.controllerRoles.defaultAdminHolders,
      expected.controllerRoles.holders.DEFAULT_ADMIN_ROLE,
      'Controller DEFAULT_ADMIN_ROLE holders',
    ),
    addressListCheck(
      'controller-admin-holders',
      observed.controllerRoles.adminHolders,
      expected.controllerRoles.holders.ADMIN_ROLE,
      'Controller ADMIN_ROLE holders',
    ),
    addressListCheck(
      'controller-executor-holders',
      observed.controllerRoles.executorHolders,
      expected.controllerRoles.holders.EXECUTOR_ROLE,
      'Controller EXECUTOR_ROLE holders',
    ),
    codeCheck('controller-executor-eoa', observed.controllerRoles.executorEoa, expected.controllerRoles.executorEoa),
    scalarCheck(
      'timelock-block',
      observed.timelock.sharedBlock,
      expected.timelock.sharedBlock,
      'Timelock snapshot block',
    ),
    scalarCheck(
      'timelock-deployment-block',
      observed.timelock.deploymentBlock,
      expected.timelock.deploymentBlock,
      'Timelock deployment block',
    ),
    scalarCheck(
      'timelock-event-count',
      observed.timelock.eventCount,
      expected.timelock.eventCount,
      'Timelock event count',
    ),
    hexCheck(
      'timelock-event-digest',
      observed.timelock.eventDigest,
      expected.timelock.eventDigest,
      'Timelock event digest',
    ),
    codeCheck('timelock-proxy', observed.timelock.code, expected.timelock.code),
    codeCheck('timelock-implementation', observed.timelock.implementation, expected.timelock.implementation),
    codeCheck('timelock-proxy-admin', observed.timelock.proxyAdmin, expected.timelock.proxyAdmin),
    addressCheck(
      'timelock-proxy-admin-owner',
      observed.timelock.proxyAdminOwner,
      expected.timelock.proxyAdminOwner,
      'Timelock ProxyAdmin owner',
    ),
    scalarCheck(
      'timelock-minimum-delay',
      observed.timelock.minimumDelaySeconds,
      expected.timelock.minimumDelaySeconds,
      'Timelock minimum delay',
    ),
    booleanCheck(
      'timelock-open-executor',
      observed.timelock.openExecutor,
      expected.timelock.openExecutor,
      'Timelock open executor',
    ),
    addressListCheck(
      'timelock-default-admin-holders',
      observed.timelock.defaultAdminHolders,
      expected.timelock.defaultAdminHolders,
      'Timelock DEFAULT_ADMIN_ROLE holders',
    ),
    addressListCheck(
      'timelock-proposer-holders',
      observed.timelock.proposerHolders,
      expected.timelock.proposerHolders,
      'Timelock PROPOSER_ROLE holders',
    ),
    addressListCheck(
      'timelock-canceller-holders',
      observed.timelock.cancellerHolders,
      expected.timelock.cancellerHolders,
      'Timelock CANCELLER_ROLE holders',
    ),
    codeCheck('safe-singleton', observed.safeSingleton, expected.safeSingleton),
    codeCheck('safe-fallback-handler', observed.fallbackHandler, expected.fallbackHandler),
    ...safeChecks('controller-executor-safe', observed.safes.controllerExecutor, expected.safes.controllerExecutor),
    ...safeChecks('timelock-governance-safe', observed.safes.timelockGovernance, expected.safes.timelockGovernance),
    ...safeChecks('nested-safe', observed.safes.nestedOwner, expected.safes.nestedOwner),
    addressListCheck(
      'authority-boundaries',
      observed.authorityBoundaries,
      expected.authorityBoundaries,
      'Unresolved authority boundaries',
    ),
  ]

  return {
    status: checks.every((item) => item.status === 'pass') ? 'verified-read-only' : 'mismatch',
    executionEligible: false,
    checks,
  }
}

function safeEvidence(args: {
  address: Address
  sharedBlock: bigint
  deploymentBlock: bigint
  owners: readonly string[]
  threshold: number
  nonce: bigint
  domainSeparator: Hex
  contractOwners: readonly Address[]
}): SafeAuthorityObservedState {
  return Object.freeze({
    sharedBlock: args.sharedBlock,
    deploymentBlock: args.deploymentBlock,
    code: Object.freeze({
      address: args.address,
      byteLength: 171,
      bytecodeHash: '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c' as Hex,
    }),
    singleton: SAFE_SINGLETON,
    owners: Object.freeze(args.owners.map((owner) => getAddress(owner))),
    threshold: args.threshold,
    nonce: args.nonce,
    modules: Object.freeze([] as Address[]),
    guard: null,
    fallbackHandler: FALLBACK_HANDLER,
    version: '1.4.1',
    domainSeparator: args.domainSeparator,
    contractOwners: Object.freeze([...args.contractOwners]),
  })
}

function safeChecks(
  prefix: string,
  observed: SafeAuthorityObservedState,
  expected: SafeAuthorityObservedState,
): WethAuthorityCheck[] {
  return [
    scalarCheck(`${prefix}-block`, observed.sharedBlock, expected.sharedBlock, `${prefix} snapshot block`),
    scalarCheck(
      `${prefix}-deployment-block`,
      observed.deploymentBlock,
      expected.deploymentBlock,
      `${prefix} deployment block`,
    ),
    codeCheck(`${prefix}-code`, observed.code, expected.code),
    addressCheck(`${prefix}-singleton`, observed.singleton, expected.singleton, `${prefix} singleton`),
    addressListCheck(`${prefix}-owners`, observed.owners, expected.owners, `${prefix} owners`),
    scalarCheck(`${prefix}-threshold`, observed.threshold, expected.threshold, `${prefix} threshold`),
    scalarCheck(`${prefix}-nonce`, observed.nonce, expected.nonce, `${prefix} nonce`),
    addressListCheck(`${prefix}-modules`, observed.modules, expected.modules, `${prefix} modules`),
    addressCheck(`${prefix}-guard`, observed.guard, expected.guard, `${prefix} guard`),
    addressCheck(
      `${prefix}-fallback-handler`,
      observed.fallbackHandler,
      expected.fallbackHandler,
      `${prefix} fallback handler`,
    ),
    stringCheck(`${prefix}-version`, observed.version, expected.version, `${prefix} version`),
    hexCheck(
      `${prefix}-domain-separator`,
      observed.domainSeparator,
      expected.domainSeparator,
      `${prefix} domain separator`,
    ),
    addressListCheck(
      `${prefix}-contract-owners`,
      observed.contractOwners,
      expected.contractOwners,
      `${prefix} contract owners`,
    ),
  ]
}

function codeCheck(code: string, observed: AuthorityCodeEvidence, expected: AuthorityCodeEvidence): WethAuthorityCheck {
  const matches =
    getAddress(observed.address) === expected.address &&
    observed.byteLength === expected.byteLength &&
    nullableHexEqual(observed.bytecodeHash, expected.bytecodeHash)
  return check(code, matches, `${code} evidence matches.`, `${code} address, byte length, or bytecode hash differs.`)
}

function addressCheck(
  code: string,
  observed: Address | null,
  expected: Address | null,
  name: string,
): WethAuthorityCheck {
  const normalizedObserved = observed === null ? null : getAddress(observed)
  const matches = normalizedObserved === expected
  return check(code, matches, `${name} matches.`, `${name} differs.`)
}

function addressListCheck(
  code: string,
  observed: readonly Address[],
  expected: readonly Address[],
  name: string,
): WethAuthorityCheck {
  const normalize = (values: readonly Address[]) => values.map((value) => getAddress(value).toLowerCase()).sort()
  const matches = JSON.stringify(normalize(observed)) === JSON.stringify(normalize(expected))
  return check(code, matches, `${name} match.`, `${name} differ.`)
}

function hexCheck(code: string, observed: Hex, expected: Hex, name: string): WethAuthorityCheck {
  const matches = observed.toLowerCase() === expected.toLowerCase()
  return check(code, matches, `${name} matches.`, `${name} differs.`)
}

function scalarCheck(
  code: string,
  observed: number | bigint,
  expected: number | bigint,
  name: string,
): WethAuthorityCheck {
  const matches = observed === expected
  return check(code, matches, `${name} matches.`, `${name} differs.`)
}

function booleanCheck(code: string, observed: boolean, expected: boolean, name: string): WethAuthorityCheck {
  return check(code, observed === expected, `${name} matches.`, `${name} differs.`)
}

function stringCheck(code: string, observed: string, expected: string, name: string): WethAuthorityCheck {
  return check(code, observed === expected, `${name} matches.`, `${name} differs.`)
}

function nullableHexEqual(observed: Hex | null, expected: Hex | null): boolean {
  if (observed === null || expected === null) return observed === expected
  return observed.toLowerCase() === expected.toLowerCase()
}

function check(code: string, matches: boolean, pass: string, fail: string): WethAuthorityCheck {
  return {
    code,
    status: matches ? 'pass' : 'fail',
    message: matches ? pass : fail,
  }
}
