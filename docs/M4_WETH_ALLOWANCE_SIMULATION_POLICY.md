# M4 WETH allowance-revocation simulation evidence policy

## Status and authority

This document defines an evidence-review policy only for the paper-mode operation:

`revoke-weth-allowance-for-position-manager`

It does not authorize or implement:

- ABI encoding or selector-byte generation
- complete calldata or transaction-request objects
- a state-changing simulation API call
- wallet connection
- signature or approval prompts
- transaction submission
- receipt reconciliation
- live or tiny-live execution
- gas-price, profitability, APR, or capital-allocation recommendations

The companion validator operates only on inert, normalized fixtures. A `policy-conformant` result means the fixture matches this document; it does not authorize implementation, simulation, signing, or execution. Every result sets:

- `implementationAuthorized: false`
- `simulationAuthorized: false`
- `executionEligible: false`

## Pinned operation boundary

| Field             | Required value                                                           |
| ----------------- | ------------------------------------------------------------------------ |
| Operation         | `revoke-weth-allowance-for-position-manager`                             |
| Chain ID          | `4663`                                                                   |
| Token             | WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`                        |
| Spender           | Uniswap v3 position manager `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` |
| Desired allowance | exactly `0`                                                              |
| Native value      | exactly `0`                                                              |
| Owner             | exact owner from the referenced paper report                             |

The referenced paper report must have decision `ready-for-separate-simulation-review`, be fresh, and remain execution-ineligible. `noop` and `blocked` paper reports cannot enter this policy.

The function semantics are restricted to WETH `approve(spender, 0)`. The policy records the function name and typed arguments only. It contains no function selector bytes, raw ABI data, or complete calldata.

## Evidence-source policy

A conformant evidence fixture requires at least two independent sources.

The future implementation design must identify:

1. a primary simulation provider with block-pinned traces, decoded logs, state diffs, and touched-address evidence
2. an independent corroborating provider or evidence source capable of confirming the relevant block, code identity, allowance state, and normalized effects

The normalized fixture must show:

- status `available`
- provider count of at least two
- provider agreement
- the exact paper evidence digest
- the exact paper shared block and block hash
- an observation no more than 300 seconds old
- redaction of provider endpoints, credentials, headers, and internal account identifiers

Unavailable, rate-limited, stale, future-dated, unsupported, undecodable, or disagreeing evidence is blocked. A successful response from one provider cannot substitute for required agreement.

## Contract identity policy

The fixture must pin and match:

- WETH transparent proxy address and runtime hash
- reviewed aeWETH implementation address and runtime hash
- durable Robinhood registry evidence
- durable WETH authority-chain evidence
- zero unresolved authority boundaries
- execution-ineligible registry and authority records

Any proxy, implementation, registry, authority, source-agreement, or eligibility drift blocks the fixture and returns control to paper mode.

## Allowed call tree

Exactly two normalized calls are permitted.

### Root call

- ID: `root`
- parent: none
- depth: `0`
- type: `call`
- sender: exact paper owner
- destination: pinned WETH proxy
- native value: `0`
- function name: `approve`
- spender argument: pinned position manager
- amount argument: `0`

### Proxy implementation call

- ID: `implementation`
- parent: `root`
- depth: `1`
- type: `delegatecall`
- caller: pinned WETH proxy
- destination: reviewed aeWETH implementation
- native value: `0`
- function name: `approve`
- spender argument: pinned position manager
- amount argument: `0`

This single proxy-to-reviewed-implementation delegatecall is the only delegatecall permitted. It is required by the verified transparent proxy architecture and does not authorize arbitrary delegatecall behavior.

The policy blocks:

- additional calls at any depth
- depth greater than `1`
- any unrelated external or internal call
- `staticcall` used as a substitute for the intended effect
- any additional `delegatecall`
- contract creation or CREATE2
- self-destruct behavior
- batching or multicall
- permit or typed-data approval paths
- arbitrary recipients or touched contracts

The touched-contract set must contain exactly the WETH proxy and reviewed WETH implementation.

## Expected state diff

The only acceptable state transition is:

- exact owner/spender allowance before: greater than `0`
- exact owner/spender allowance after: `0`

The fixture must contain no:

- WETH token balance delta
- other token balance delta
- native balance delta
- transfer, mint, burn, deposit, or withdrawal
- position-manager state change
- liquidity-position mutation
- approval for another spender
- nonzero approval
- unrelated storage or ownership change

Hypothetical gas accounting, if a future provider reports it, must be isolated outside asset-state diffs and must never be converted into a recommendation. The inert validator accepts no native balance delta.

## Expected log policy

Exactly one normalized log is accepted:

- emitting address: pinned WETH proxy
- event name: `Approval`
- owner: exact paper owner
- spender: pinned position manager
- value: `0`

Raw topics and data are not stored by this policy fixture. Missing, duplicated, extra, substituted, undecodable, or conflicting logs block the fixture.

## Evidence record

The normalized policy result contains:

- policy version
- all pass/fail checks
- explicit reasons
- a deterministic evidence digest
- non-authorization flags
- a safety disclaimer

The digest covers the complete normalized inert input and result. Canonical JSON sorts object keys, represents dates as ISO-8601 strings, and represents `bigint` values as decimal strings before Keccak-256 hashing.

The record excludes:

- RPC and simulation URLs
- provider credentials or headers
- raw calldata
- transaction destination/value/data objects
- gas price or fee recommendations
- wallet connection state
- signatures
- nonce or submission fields

## Human review fields for a later phase

A later separately reviewed implementation design must present, at minimum:

- operation name
- chain ID
- full owner, WETH, implementation, and spender addresses
- paper evidence digest
- shared block number and hash
- evidence age and provider agreement
- allowance before and expected allowance after
- normalized call-tree summary
- normalized state-diff summary
- normalized Approval-event summary
- all failed checks and warnings
- policy version and evidence digest
- explicit statement that successful simulation evidence is not signing or execution authorization

Critical fields must not be hidden or replaced by symbols and labels alone.

## Invalidation and stop conditions

A policy record is invalidated by any:

- paper digest, owner, chain, token, spender, amount, or native-value change
- allowance drift
- shared-block or block-hash mismatch
- evidence expiry
- provider disagreement or outage
- WETH proxy or implementation bytecode drift
- registry or authority-evidence change
- new unresolved authority boundary
- extra call, touched contract, log, balance delta, or state change
- raw transaction material appearing in the evidence package
- incident-disable or pause state

Invalidation returns the process to paper mode. It must not reuse or mutate the previous evidence record into a new attempt.

## Required negative fixtures

The regression suite blocks:

- wrong operation, chain, owner, token, or spender
- nonzero desired allowance or native value
- `noop`, blocked, stale, or execution-eligible paper evidence
- paper digest mismatch
- unavailable, single-source, stale, future, unredacted, or disagreeing provider evidence
- shared-block mismatch
- registry, authority, proxy, or implementation drift
- raw transaction material
- missing, extra, deep, substituted, create, self-destruct, or unrelated calls
- arbitrary delegatecall behavior
- unexpected touched contracts
- missing, duplicated, extra, or substituted logs
- allowance not changing from nonzero to zero
- token, native, or unrelated state changes

## Remaining gate

Any future code that contacts a state-changing simulation API, encodes a call, creates a transaction request, or presents an operator review screen requires a new separately reviewed issue and pull request.

Nothing in this document authorizes capital deployment or constitutes financial advice.
