# Robinhood WETH upgrade-control chain

## Status

The WETH proxy administration chain is identified and pinned for read-only verification.

The former AccessControl role-membership boundary has also been resolved through the separate durable record `ROBINHOOD_WETH_AUTHORITY_EVIDENCE` and `docs/ROBINHOOD_WETH_AUTHORITY_EVIDENCE.md`.

The combined authority status is:

`authority-chain-resolved-by-weth-authority-evidence`

WETH and the provisional allowance-revocation operation remain execution-ineligible. No wallet connection, calldata construction, state-changing call, signature, transaction submission, or money movement is implemented by either evidence record.

## Proxy-chain evidence method

Audit run `29822600084` traced the WETH ProxyAdmin owner at shared block `15493693` using:

- the official public Robinhood RPC
- the configured monitoring RPC
- ERC-1967 implementation, admin, and beacon storage slots
- runtime bytecode hashes
- official Robinhood Blockscout verified metadata
- verified read-only `owner()` calls only where the explorer ABI exposed the exact function

Both RPC sources agreed exactly. The trace was bounded to six levels and rejected address cycles.

## Identified control chain

### WETH ProxyAdmin

| Field | Value |
| --- | --- |
| Address | `0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF` |
| Contract | verified `ProxyAdmin` |
| Runtime bytes | 1,681 |
| Runtime hash | `0xa4b2186ab82fa36fb4ae158582e5615ea519e757c26c13ba4a33daaaed8902a7` |
| Verified owner | `0x2A153c6A1B66DBc930a8d7017230ab0253005C09` |
| Source-response SHA-256 | `0xe1f18ca464715b24fa20b49ca2b75aff9084a96bd7e726ace63097270719433b` |

### Upgrade-controller proxy

| Field | Value |
| --- | --- |
| Address | `0x2A153c6A1B66DBc930a8d7017230ab0253005C09` |
| Contract | verified `TransparentUpgradeableProxy` |
| Runtime bytes | 2,202 |
| Runtime hash | `0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353` |
| Implementation | `0x3c3E52bC8C181D06A76e2518bBc655C5BB3Ce7Cd` |
| Admin | `0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF` |
| Beacon | none |
| Source-response SHA-256 | `0xbe83b87e6f2dbc5d0dea923bb45092689382f1580893dfda28438452ffa10e88` |

The same ProxyAdmin administers both WETH and the controller proxy. The ProxyAdmin's owner is the controller proxy, forming an intentional governance structure rather than an unknown owner address.

### Controller implementation

| Field | Value |
| --- | --- |
| Address | `0x3c3E52bC8C181D06A76e2518bBc655C5BB3Ce7Cd` |
| Explorer name | `UpgradeExtractor` |
| Source path | `src/UpgradeExecutor.sol` |
| Runtime bytes | 6,204 |
| Runtime hash | `0x0d88feac198ef1b50b99fddf06aa9f6b1050bfe7211d6f04173de9b6d8953bcb` |
| Compiler | `v0.8.16+commit.07a7930e` |
| Source verification | verified, partially verified metadata |
| Source-response SHA-256 | `0x202d0719dbd3588e63a8c3675a63383d739f3438e393740ca61ca768e6abe30c` |

The implementation is not another proxy.

## Resolved AccessControl layer

The verified ABI exposes non-enumerable `DEFAULT_ADMIN_ROLE`, `ADMIN_ROLE`, and `EXECUTOR_ROLE` controls together with `hasRole`, `getRoleAdmin`, `execute`, and `executeCall`.

Because direct enumeration was unavailable, issue #72 reconstructed the complete event history and confirmed every candidate at one shared block through two providers. Downstream timelock and Safe authority was then traced through issues #89, #90, #93, and #99.

The durable authority record now pins:

- the complete 10-event controller role history and digest
- current `ADMIN_ROLE` and `EXECUTOR_ROLE` holders
- timelock proxy, roles, 7-day delay, and open executor policy
- controller executor and timelock governance Safe configurations
- the shared nested Safe and its seven EOA owners
- canonical SafeL2 v1.4.1 singleton and fallback-handler bytecode
- an empty unresolved-authority-boundary set

See `docs/ROBINHOOD_WETH_AUTHORITY_EVIDENCE.md` for the complete map.

## Fail-closed verification

`verifyRobinhoodWethControlEvidence` continues to compare the bounded proxy chain:

- chain ID
- controller proxy address, runtime length, and runtime hash
- controller implementation address, runtime length, and runtime hash
- controller admin address, runtime length, and runtime hash
- empty beacon state
- ProxyAdmin owner relationship

`verifyRobinhoodWethAuthorityEvidence` separately compares the resolved role and downstream authority snapshot.

Any mismatch returns `mismatch`. Successful matches return `verified-read-only`. Both verifiers always return `executionEligible: false`.

## Remaining execution gates

Resolving authority does not approve execution. The remaining gates include:

1. deterministic transaction-intent validation
2. exact contract and function allowlists
3. mandatory simulation with fail-closed provider handling
4. user-controlled browser-wallet confirmation
5. manual submission and receipt reconciliation
6. paper-mode and tiny-live evidence before broader execution discussion

Any controller, role, holder, Safe, canonical dependency, or bytecode drift requires a new review.

## Evidence references

- issue #68 audit comment for run `29822600084`
- issue #72 controller role reconstruction
- issues #89, #90, #93, and #99 downstream authority tracing
- repository evidence objects `ROBINHOOD_WETH_PROXY_EVIDENCE`, `ROBINHOOD_WETH_CONTROL_EVIDENCE`, and `ROBINHOOD_WETH_AUTHORITY_EVIDENCE`
- ERC-1967 proxy storage-slot standard

Nothing in this document authorizes capital deployment or constitutes financial advice.
