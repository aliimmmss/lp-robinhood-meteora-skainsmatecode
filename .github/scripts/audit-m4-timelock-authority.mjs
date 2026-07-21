/* global AbortSignal, URLSearchParams, fetch */
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  keccak256,
  parseAbi,
  toBytes,
  toHex,
  zeroAddress,
} from 'viem'

const CHAIN_ID = 4663
const PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CONFIGURED_RPC = process.env.CONFIGURED_ROBINHOOD_RPC_URL
const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com/api/v2'

const TIMELOCK = getAddress('0x560C81fe78FcC276e460524428f1a62057Ca8173')
const EXPECTED_IMPLEMENTATION = getAddress('0x145046bdd5c4bc72338f60dE5d9707BD73ff1843')
const EXPECTED_PROXY_ADMIN = getAddress('0x672Da8B43058D1bC78956d71d9A208E168E2a3EF')
const EXPECTED_PROXY_LENGTH = 1_400
const EXPECTED_PROXY_HASH = '0xf48156e5fbedbcb08b438f07fd522b4365eab310620cfbcdf8b9e7a788153290'

const CONFIRMATIONS = 12n
const INITIAL_LOG_RANGE = 500_000n
const LOG_REQUEST_DELAY_MS = 350
const LOG_MAX_ATTEMPTS = 7
const LOG_MAX_SPLIT_DEPTH = 12
const LOG_MAX_REQUESTS = 500
const LOG_MAX_DURATION_MS = 25 * 60 * 1_000
const BLOCKSCOUT_MAX_PAGES = 500
const BLOCKSCOUT_MAX_ITEMS = 25_000
const BLOCKSCOUT_MAX_DURATION_MS = 10 * 60 * 1_000
const OWNER_TRACE_MAX_DEPTH = 5

const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
const BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'
const ZERO_ROLE = `0x${'00'.repeat(32)}`

const TIMELOCK_ABI = parseAbi([
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function PROPOSER_ROLE() view returns (bytes32)',
  'function EXECUTOR_ROLE() view returns (bytes32)',
  'function CANCELLER_ROLE() view returns (bytes32)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function hasRole(bytes32 role,address account) view returns (bool)',
  'function getMinDelay() view returns (uint256)',
])

const OWNER_ABI = parseAbi(['function owner() view returns (address)'])

const EVENT_ABI = parseAbi([
  'event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)',
  'event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)',
  'event RoleAdminChanged(bytes32 indexed role,bytes32 indexed previousAdminRole,bytes32 indexed newAdminRole)',
])

const EVENT_TOPICS = [
  keccak256(toBytes('RoleGranted(bytes32,address,address)')),
  keccak256(toBytes('RoleRevoked(bytes32,address,address)')),
  keccak256(toBytes('RoleAdminChanged(bytes32,bytes32,bytes32)')),
]

function safeError(error) {
  const value = error instanceof Error ? error.message : String(error)
  return value.replace(/https?:\/\/\S+/gi, '[endpoint omitted]').slice(0, 500)
}

function digest(value) {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function rpcClient(url) {
  return createPublicClient({ transport: http(url, { timeout: 20_000, retryCount: 2 }) })
}

function slotAddress(value) {
  if (!value || value === '0x' || /^0x0+$/.test(value)) return null
  const address = getAddress(`0x${value.slice(-40)}`)
  return address === zeroAddress ? null : address
}

function codeEvidence(bytecode) {
  if (!bytecode || bytecode === '0x') {
    return { hasCode: false, byteLength: 0, bytecodeHash: null }
  }
  return {
    hasCode: true,
    byteLength: (bytecode.length - 2) / 2,
    bytecodeHash: keccak256(bytecode),
  }
}

function comparable(value) {
  return { ...value, label: null }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return { ok: false, status: response.status, value: null }
    return { ok: true, status: response.status, value: await response.json() }
  } catch (error) {
    return { ok: false, status: null, value: null, error: safeError(error) }
  }
}

function abiArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function exactViewFunction(abi, name, inputs, outputs) {
  return abi.some(
    (entry) =>
      entry?.type === 'function' &&
      entry.name === name &&
      ['view', 'pure'].includes(entry.stateMutability) &&
      JSON.stringify(entry.inputs?.map((input) => input.type) ?? []) === JSON.stringify(inputs) &&
      JSON.stringify(entry.outputs?.map((output) => output.type) ?? []) === JSON.stringify(outputs),
  )
}

async function explorerMetadata(address) {
  const [addressResponse, contractResponse] = await Promise.all([
    fetchJson(`${BLOCKSCOUT}/addresses/${address}`),
    fetchJson(`${BLOCKSCOUT}/smart-contracts/${address}`),
  ])
  const abi = abiArray(contractResponse.value?.abi)
  return {
    addressRequestOk: addressResponse.ok,
    contractRequestOk: contractResponse.ok,
    addressSummary: addressResponse.value
      ? {
          isContract: addressResponse.value.is_contract ?? null,
          isVerified: addressResponse.value.is_verified ?? null,
          name: addressResponse.value.name ?? null,
          implementationName: addressResponse.value.implementation_name ?? null,
          creationTransactionHash:
            addressResponse.value.creation_tx_hash ??
            addressResponse.value.creation_transaction_hash ??
            addressResponse.value.creation_transaction?.hash ??
            null,
        }
      : null,
    contract: contractResponse.value
      ? {
          name: contractResponse.value.name ?? null,
          isVerified: contractResponse.value.is_verified ?? null,
          filePath: contractResponse.value.file_path ?? null,
          proxyType: contractResponse.value.proxy_type ?? null,
          implementations: contractResponse.value.implementations ?? [],
          ownerInterface: exactViewFunction(abi, 'owner', [], ['address']),
          functionNames: [...new Set(abi.filter((entry) => entry?.type === 'function').map((entry) => entry.name))]
            .filter(Boolean)
            .sort(),
        }
      : null,
  }
}

async function latest(label, url) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-not-configured' }
  try {
    const rpc = rpcClient(url)
    const [chainId, blockNumber] = await Promise.all([rpc.getChainId(), rpc.getBlockNumber()])
    return {
      label,
      endpoint: 'omitted',
      status: chainId === CHAIN_ID ? 'available' : 'wrong-chain',
      chainId,
      blockNumber,
    }
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', error: safeError(error) }
  }
}

async function deploymentBoundary() {
  const metadata = await explorerMetadata(TIMELOCK)
  const transactionHash = metadata.addressSummary?.creationTransactionHash ?? null
  if (!transactionHash) {
    return { status: 'unavailable', blockNumber: null, transactionHash: null, metadata }
  }
  const transaction = await fetchJson(`${BLOCKSCOUT}/transactions/${transactionHash}`)
  const rawBlock = transaction.value?.block_number ?? transaction.value?.blockNumber ?? null
  return {
    status: transaction.ok && rawBlock !== null ? 'verified' : 'unavailable',
    blockNumber: rawBlock === null ? null : BigInt(rawBlock),
    transactionHash,
    metadata,
  }
}

async function archiveBoundary(label, url, deploymentBlock) {
  if (!url || deploymentBlock === null) {
    return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-or-deployment-unavailable' }
  }
  const rpc = rpcClient(url)
  try {
    const [before, at] = await Promise.all([
      rpc.getBytecode({ address: TIMELOCK, blockNumber: deploymentBlock - 1n }),
      rpc.getBytecode({ address: TIMELOCK, blockNumber: deploymentBlock }),
    ])
    return {
      label,
      endpoint: 'omitted',
      status: 'archive-verified',
      before: codeEvidence(before),
      at: codeEvidence(at),
    }
  } catch (error) {
    const message = safeError(error)
    return {
      label,
      endpoint: 'omitted',
      status: /missing trie node|historical state|archive/i.test(message) ? 'non-archive' : 'unavailable',
      error: message,
    }
  }
}

function assertLogBudget(stats) {
  if (stats.requests >= LOG_MAX_REQUESTS) throw new Error(`log-request-budget-exhausted:${LOG_MAX_REQUESTS}`)
  if (Date.now() - stats.startedAt > LOG_MAX_DURATION_MS) {
    throw new Error(`log-duration-budget-exhausted:${LOG_MAX_DURATION_MS}`)
  }
}

function isRateLimitError(message) {
  return /(?:status:\s*429|too many requests|rate.?limit)/i.test(message)
}

function isRangeLimitError(message) {
  return /(?:block range|range is too wide|query returned more than|too many results|response size|limit exceeded|maximum.*range|free tier.*range)/i.test(
    message,
  )
}

async function rawLogs(rpc, fromBlock, toBlock, stats) {
  for (let attempt = 0; attempt < LOG_MAX_ATTEMPTS; attempt += 1) {
    assertLogBudget(stats)
    stats.requests += 1
    try {
      const logs = await rpc.request({
        method: 'eth_getLogs',
        params: [
          {
            address: TIMELOCK,
            fromBlock: toHex(fromBlock),
            toBlock: toHex(toBlock),
            topics: [EVENT_TOPICS],
          },
        ],
      })
      await sleep(LOG_REQUEST_DELAY_MS)
      return logs
    } catch (error) {
      const message = safeError(error)
      if (!isRateLimitError(message)) throw error
      stats.rateLimitRetries += 1
      if (attempt + 1 >= LOG_MAX_ATTEMPTS) {
        throw new Error(`log-rate-limit-retries-exhausted:${fromBlock}:${toBlock}:${message}`)
      }
      const backoffMs = Math.min(750 * 2 ** attempt + attempt * 137, 12_000)
      stats.backoffMs += backoffMs
      await sleep(backoffMs)
    }
  }
  throw new Error(`log-retry-loop-exhausted:${fromBlock}:${toBlock}`)
}

async function logsAdaptive(rpc, fromBlock, toBlock, stats, depth = 0) {
  try {
    return await rawLogs(rpc, fromBlock, toBlock, stats)
  } catch (error) {
    const message = safeError(error)
    if (!isRangeLimitError(message)) throw error
    if (fromBlock === toBlock) throw new Error(`single-block-range-limit:${fromBlock}:${message}`)
    if (depth >= LOG_MAX_SPLIT_DEPTH) throw new Error(`log-split-depth-exhausted:${depth}:${message}`)
    stats.splits += 1
    const middle = (fromBlock + toBlock) / 2n
    const left = await logsAdaptive(rpc, fromBlock, middle, stats, depth + 1)
    const right = await logsAdaptive(rpc, middle + 1n, toBlock, stats, depth + 1)
    return [...left, ...right]
  }
}

function normalizeLog(log) {
  if (log.removed === true) throw new Error(`removed-log:${log.transactionHash}:${log.logIndex}`)
  const decoded = decodeEventLog({ abi: EVENT_ABI, data: log.data, topics: log.topics, strict: true })
  const base = {
    blockNumber: BigInt(log.blockNumber).toString(),
    blockHash: log.blockHash.toLowerCase(),
    transactionHash: log.transactionHash.toLowerCase(),
    transactionIndex: Number(BigInt(log.transactionIndex)),
    logIndex: Number(BigInt(log.logIndex)),
    eventName: decoded.eventName,
  }
  if (decoded.eventName === 'RoleGranted' || decoded.eventName === 'RoleRevoked') {
    return {
      ...base,
      role: decoded.args.role.toLowerCase(),
      account: getAddress(decoded.args.account),
      sender: getAddress(decoded.args.sender),
    }
  }
  return {
    ...base,
    role: decoded.args.role.toLowerCase(),
    previousAdminRole: decoded.args.previousAdminRole.toLowerCase(),
    newAdminRole: decoded.args.newAdminRole.toLowerCase(),
  }
}

function eventSort(left, right) {
  const block = BigInt(left.blockNumber) - BigInt(right.blockNumber)
  if (block !== 0n) return block < 0n ? -1 : 1
  if (left.transactionIndex !== right.transactionIndex) return left.transactionIndex - right.transactionIndex
  return left.logIndex - right.logIndex
}

function normalizeRawLogs(raw) {
  const byKey = new Map()
  for (const log of raw) {
    const event = normalizeLog(log)
    const key = `${event.transactionHash}:${event.logIndex}`
    const existing = byKey.get(key)
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
      throw new Error(`conflicting-duplicate-log:${key}`)
    }
    byKey.set(key, event)
  }
  return [...byKey.values()].sort(eventSort)
}

async function scanPublicEvents(startBlock, endBlock) {
  const rpc = rpcClient(PUBLIC_RPC)
  const raw = []
  const stats = { startedAt: Date.now(), requests: 0, rateLimitRetries: 0, backoffMs: 0, splits: 0 }
  try {
    for (let from = startBlock; from <= endBlock; from += INITIAL_LOG_RANGE) {
      const to = from + INITIAL_LOG_RANGE - 1n > endBlock ? endBlock : from + INITIAL_LOG_RANGE - 1n
      raw.push(...(await logsAdaptive(rpc, from, to, stats)))
    }
    const events = normalizeRawLogs(raw)
    return {
      label: 'official-public',
      endpoint: 'omitted',
      status: 'complete',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      rawLogCount: raw.length,
      eventCount: events.length,
      eventDigest: digest(events),
      requestStats: { ...stats, durationMs: Date.now() - stats.startedAt },
      events,
    }
  } catch (error) {
    return {
      label: 'official-public',
      endpoint: 'omitted',
      status: 'unavailable',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      requestStats: { ...stats, durationMs: Date.now() - stats.startedAt },
      events: [],
      error: safeError(error),
    }
  }
}

async function blockscoutTransactionPosition(transactionHash, cache) {
  const cached = cache.get(transactionHash)
  if (cached !== undefined) return cached
  const response = await fetchJson(`${BLOCKSCOUT}/transactions/${transactionHash}`)
  const rawPosition =
    response.value?.position ?? response.value?.transaction_index ?? response.value?.transactionIndex ?? null
  if (!response.ok || rawPosition === null) {
    throw new Error(`blockscout-transaction-position-unavailable:${transactionHash}:${response.status ?? 'network'}`)
  }
  const position = Number(rawPosition)
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new Error(`blockscout-invalid-transaction-position:${transactionHash}:${rawPosition}`)
  }
  cache.set(transactionHash, position)
  return position
}

async function blockHashAt(rpc, blockNumber, cache) {
  const key = blockNumber.toString()
  const cached = cache.get(key)
  if (cached) return cached
  const block = await rpc.getBlock({ blockNumber })
  if (!block.hash) throw new Error(`public-block-hash-unavailable:${key}`)
  cache.set(key, block.hash.toLowerCase())
  return block.hash.toLowerCase()
}

async function scanBlockscoutEvents(startBlock, endBlock) {
  const startedAt = Date.now()
  const baseUrl = `${BLOCKSCOUT}/addresses/${TIMELOCK}/logs`
  const topicSet = new Set(EVENT_TOPICS.map((topic) => topic.toLowerCase()))
  const seenCursors = new Set()
  const transactionPositions = new Map()
  const blockHashes = new Map()
  const publicRpc = rpcClient(PUBLIC_RPC)
  const raw = []
  let url = baseUrl
  let pages = 0
  let totalItems = 0
  let skippedAfterBoundary = 0

  try {
    while (url) {
      if (pages >= BLOCKSCOUT_MAX_PAGES) throw new Error(`blockscout-page-budget-exhausted:${BLOCKSCOUT_MAX_PAGES}`)
      if (totalItems >= BLOCKSCOUT_MAX_ITEMS) {
        throw new Error(`blockscout-item-budget-exhausted:${BLOCKSCOUT_MAX_ITEMS}`)
      }
      if (Date.now() - startedAt > BLOCKSCOUT_MAX_DURATION_MS) {
        throw new Error(`blockscout-duration-budget-exhausted:${BLOCKSCOUT_MAX_DURATION_MS}`)
      }

      const response = await fetchJson(url)
      if (!response.ok || !Array.isArray(response.value?.items)) {
        throw new Error(`blockscout-log-page-unavailable:${response.status ?? 'network'}`)
      }
      pages += 1
      totalItems += response.value.items.length
      if (totalItems > BLOCKSCOUT_MAX_ITEMS) {
        throw new Error(`blockscout-item-budget-exhausted:${BLOCKSCOUT_MAX_ITEMS}`)
      }

      for (const item of response.value.items) {
        const topic0 = item?.topics?.[0]?.toLowerCase?.() ?? null
        if (!topic0 || !topicSet.has(topic0)) continue
        if (!item.transaction_hash || item.index === null || item.index === undefined) {
          throw new Error('blockscout-malformed-relevant-log')
        }
        const blockNumber = BigInt(item.block_number)
        if (blockNumber > endBlock) {
          skippedAfterBoundary += 1
          continue
        }
        if (blockNumber < startBlock) throw new Error(`blockscout-log-before-boundary:${blockNumber}`)
        const addressValue =
          typeof item.address_hash === 'string' ? item.address_hash : item.address_hash?.hash ?? TIMELOCK
        if (getAddress(addressValue) !== TIMELOCK) {
          throw new Error(`blockscout-address-mismatch:${addressValue}`)
        }
        const transactionHash = item.transaction_hash.toLowerCase()
        const transactionIndex = await blockscoutTransactionPosition(transactionHash, transactionPositions)
        const expectedBlockHash = await blockHashAt(publicRpc, blockNumber, blockHashes)
        const blockHash = item.block_hash?.toLowerCase?.() ?? null
        if (!blockHash || blockHash !== expectedBlockHash) {
          throw new Error(`blockscout-block-hash-mismatch:${blockNumber}`)
        }
        raw.push({
          removed: false,
          data: item.data,
          topics: item.topics,
          blockNumber,
          blockHash,
          transactionHash,
          transactionIndex: BigInt(transactionIndex),
          logIndex: BigInt(item.index),
        })
      }

      const next = response.value.next_page_params
      if (!next || Object.keys(next).length === 0) {
        url = null
        continue
      }
      const entries = Object.entries(next).sort(([left], [right]) => left.localeCompare(right))
      const cursor = JSON.stringify(entries)
      if (seenCursors.has(cursor)) throw new Error(`blockscout-repeated-cursor:${cursor}`)
      seenCursors.add(cursor)
      const params = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))
      url = `${baseUrl}?${params.toString()}`
    }

    const events = normalizeRawLogs(raw)
    return {
      label: 'blockscout',
      endpoint: 'omitted',
      status: 'complete',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      rawLogCount: raw.length,
      eventCount: events.length,
      eventDigest: digest(events),
      requestStats: {
        startedAt,
        requests: pages,
        rateLimitRetries: 0,
        backoffMs: 0,
        splits: 0,
        durationMs: Date.now() - startedAt,
        pages,
        totalItems,
        skippedAfterBoundary,
        transactionMetadataRequests: transactionPositions.size,
        blockHashChecks: blockHashes.size,
      },
      events,
    }
  } catch (error) {
    return {
      label: 'blockscout',
      endpoint: 'omitted',
      status: 'unavailable',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      requestStats: {
        startedAt,
        requests: pages,
        rateLimitRetries: 0,
        backoffMs: 0,
        splits: 0,
        durationMs: Date.now() - startedAt,
        pages,
        totalItems,
        skippedAfterBoundary,
        transactionMetadataRequests: transactionPositions.size,
        blockHashChecks: blockHashes.size,
      },
      events: [],
      error: safeError(error),
    }
  }
}

function reconstruct(events, roleIds) {
  const membership = new Map()
  const roleAdmins = new Map(roleIds.map((role) => [role, ZERO_ROLE]))
  const candidates = new Map(roleIds.map((role) => [role, new Set()]))
  const anomalies = []

  function accountMap(role) {
    const current = membership.get(role) ?? new Map()
    membership.set(role, current)
    return current
  }

  for (const event of events) {
    if (!roleAdmins.has(event.role)) roleAdmins.set(event.role, ZERO_ROLE)
    if (!candidates.has(event.role)) candidates.set(event.role, new Set())
    if (event.eventName === 'RoleGranted') {
      candidates.get(event.role).add(event.account)
      const accounts = accountMap(event.role)
      if (accounts.get(event.account) === true) anomalies.push({ code: 'duplicate-grant', event })
      accounts.set(event.account, true)
    } else if (event.eventName === 'RoleRevoked') {
      candidates.get(event.role).add(event.account)
      const accounts = accountMap(event.role)
      if (accounts.get(event.account) !== true) anomalies.push({ code: 'revocation-without-known-grant', event })
      accounts.set(event.account, false)
    } else {
      if (!roleAdmins.has(event.previousAdminRole)) roleAdmins.set(event.previousAdminRole, ZERO_ROLE)
      if (!roleAdmins.has(event.newAdminRole)) roleAdmins.set(event.newAdminRole, ZERO_ROLE)
      const expectedPrevious = roleAdmins.get(event.role) ?? ZERO_ROLE
      if (expectedPrevious !== event.previousAdminRole) {
        anomalies.push({ code: 'role-admin-history-mismatch', expectedPrevious, event })
      }
      roleAdmins.set(event.role, event.newAdminRole)
    }
  }

  return {
    candidates: Object.fromEntries(
      [...candidates.entries()]
        .map(([role, accounts]) => [role, [...accounts].sort()])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    membership: Object.fromEntries(
      [...membership.entries()]
        .map(([role, accounts]) => [
          role,
          Object.fromEntries([...accounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
        ])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    roleAdmins: Object.fromEntries([...roleAdmins.entries()].sort(([left], [right]) => left.localeCompare(right))),
    anomalies,
  }
}

async function readTimelockState(label, url, blockNumber, roleIds, candidates) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-not-configured' }
  const rpc = rpcClient(url)
  try {
    const [defaultAdminRole, proposerRole, executorRole, cancellerRole, minDelay] = await Promise.all([
      rpc.readContract({ address: TIMELOCK, abi: TIMELOCK_ABI, functionName: 'DEFAULT_ADMIN_ROLE', blockNumber }),
      rpc.readContract({ address: TIMELOCK, abi: TIMELOCK_ABI, functionName: 'PROPOSER_ROLE', blockNumber }),
      rpc.readContract({ address: TIMELOCK, abi: TIMELOCK_ABI, functionName: 'EXECUTOR_ROLE', blockNumber }),
      rpc.readContract({ address: TIMELOCK, abi: TIMELOCK_ABI, functionName: 'CANCELLER_ROLE', blockNumber }),
      rpc.readContract({ address: TIMELOCK, abi: TIMELOCK_ABI, functionName: 'getMinDelay', blockNumber }),
    ])
    const constants = {
      DEFAULT_ADMIN_ROLE: defaultAdminRole.toLowerCase(),
      PROPOSER_ROLE: proposerRole.toLowerCase(),
      EXECUTOR_ROLE: executorRole.toLowerCase(),
      CANCELLER_ROLE: cancellerRole.toLowerCase(),
    }
    const allRoles = [...new Set([...roleIds, ...Object.values(constants)])].sort()
    const admins = Object.fromEntries(
      await Promise.all(
        allRoles.map(async (role) => [
          role,
          (
            await rpc.readContract({
              address: TIMELOCK,
              abi: TIMELOCK_ABI,
              functionName: 'getRoleAdmin',
              args: [role],
              blockNumber,
            })
          ).toLowerCase(),
        ]),
      ),
    )
    const membershipEntries = []
    for (const role of allRoles) {
      const accounts = new Set(candidates[role] ?? [])
      if (role === constants.EXECUTOR_ROLE) accounts.add(zeroAddress)
      for (const account of [...accounts].sort()) {
        const active = await rpc.readContract({
          address: TIMELOCK,
          abi: TIMELOCK_ABI,
          functionName: 'hasRole',
          args: [role, account],
          blockNumber,
        })
        membershipEntries.push([`${role}:${account}`, active])
      }
    }
    return {
      label,
      endpoint: 'omitted',
      status: 'verified',
      blockNumber: blockNumber.toString(),
      constants,
      minDelaySeconds: minDelay.toString(),
      admins,
      membership: Object.fromEntries(membershipEntries.sort(([left], [right]) => left.localeCompare(right))),
    }
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', error: safeError(error) }
  }
}

function compareReconstruction(reconstruction, state) {
  const mismatches = []
  for (const [role, expectedAdmin] of Object.entries(reconstruction.roleAdmins)) {
    const actualAdmin = state.admins[role]
    if (actualAdmin !== expectedAdmin) {
      mismatches.push({ code: 'role-admin-state-mismatch', role, expected: expectedAdmin, actual: actualAdmin ?? null })
    }
  }
  for (const [role, accounts] of Object.entries(reconstruction.membership)) {
    for (const [account, expected] of Object.entries(accounts)) {
      const actual = state.membership[`${role}:${account}`]
      if (actual !== expected) {
        mismatches.push({ code: 'role-membership-state-mismatch', role, account, expected, actual: actual ?? null })
      }
    }
  }
  return mismatches
}

async function readAddressEvidence(label, url, address, blockNumber, readOwner) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', address }
  const rpc = rpcClient(url)
  try {
    const [bytecode, implementationRaw, adminRaw, beaconRaw] = await Promise.all([
      rpc.getBytecode({ address, blockNumber }),
      rpc.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
      rpc.getStorageAt({ address, slot: ADMIN_SLOT, blockNumber }),
      rpc.getStorageAt({ address, slot: BEACON_SLOT, blockNumber }),
    ])
    const code = codeEvidence(bytecode)
    const result = {
      label,
      endpoint: 'omitted',
      status: 'verified',
      address,
      code,
      slots: {
        implementation: slotAddress(implementationRaw),
        admin: slotAddress(adminRaw),
        beacon: slotAddress(beaconRaw),
      },
      owner: null,
      ownerReadStatus: readOwner && code.hasCode ? 'unavailable' : readOwner ? 'not-applicable' : 'not-requested',
    }
    if (readOwner && code.hasCode) {
      try {
        result.owner = getAddress(await rpc.readContract({ address, abi: OWNER_ABI, functionName: 'owner', blockNumber }))
        result.ownerReadStatus = 'verified'
      } catch (error) {
        result.ownerReadStatus = 'unsupported-or-reverted'
        result.ownerReadError = safeError(error)
      }
    }
    return result
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', address, error: safeError(error) }
  }
}

async function classifyAddress(address, endpoints, blockNumber, requestOwner = false) {
  const explorer = await explorerMetadata(address)
  const shouldReadOwner = requestOwner || explorer.contract?.ownerInterface === true
  const providers = await Promise.all(
    endpoints.map(({ label, url }) => readAddressEvidence(label, url, address, blockNumber, shouldReadOwner)),
  )
  const agreement =
    providers.length === 2 &&
    providers.every((provider) => provider.status === 'verified') &&
    JSON.stringify(comparable(providers[0])) === JSON.stringify(comparable(providers[1]))
  const first = providers.find((provider) => provider.status === 'verified')
  let classification = 'unresolved'
  if (agreement && first) {
    if (!first.code.hasCode) classification = 'eoa'
    else if (first.slots.implementation || first.slots.beacon) classification = 'eip1967-proxy'
    else if (first.ownerReadStatus === 'verified') classification = 'verified-ownable-contract'
    else classification = 'contract-unclassified'
  }
  return {
    address,
    agreement,
    classification,
    providers,
    explorer,
    owner: agreement && first?.ownerReadStatus === 'verified' ? first.owner : null,
  }
}

async function traceProxyAdminOwnership(proxyAdmin, endpoints, blockNumber) {
  const nodes = []
  const seen = new Set()
  let current = proxyAdmin
  let completed = false
  let terminalReason = null

  for (let depth = 0; depth < OWNER_TRACE_MAX_DEPTH; depth += 1) {
    const normalized = getAddress(current)
    if (seen.has(normalized)) {
      terminalReason = 'ownership-cycle'
      break
    }
    seen.add(normalized)
    const evidence = await classifyAddress(normalized, endpoints, blockNumber, true)
    nodes.push({ depth, ...evidence })
    if (!evidence.agreement) {
      terminalReason = 'provider-disagreement'
      break
    }
    if (evidence.classification === 'eoa') {
      completed = true
      terminalReason = 'eoa-owner'
      break
    }
    if (!evidence.owner) {
      terminalReason = 'owner-interface-unresolved'
      break
    }
    current = evidence.owner
  }

  if (!terminalReason) terminalReason = 'max-depth-reached'
  return { completed, terminalReason, nodes }
}

function roleLabel(role, constants) {
  return Object.entries(constants).find(([, value]) => value === role)?.[0] ?? `OBSERVED_${role.slice(2, 10)}`
}

const endpoints = [
  { label: 'official-public', url: PUBLIC_RPC },
  { label: 'configured-alchemy', url: CONFIGURED_RPC },
]

const tips = await Promise.all(endpoints.map(({ label, url }) => latest(label, url)))
const availableTips = tips.filter((tip) => tip.status === 'available')
const minimumTip = availableTips.reduce(
  (minimum, tip) => (tip.blockNumber < minimum ? tip.blockNumber : minimum),
  availableTips[0]?.blockNumber ?? 0n,
)
const endBlock = minimumTip > CONFIRMATIONS ? minimumTip - CONFIRMATIONS : 0n
const endBlocks =
  availableTips.length === 2 && endBlock > 0n
    ? await Promise.all(
        endpoints.map(async ({ label, url }) => {
          const block = await rpcClient(url).getBlock({ blockNumber: endBlock })
          return { label, blockNumber: endBlock.toString(), hash: block.hash, timestamp: block.timestamp.toString() }
        }),
      )
    : []
const endBlockAgreement =
  endBlocks.length === 2 && endBlocks[0].hash === endBlocks[1].hash && endBlocks[0].timestamp === endBlocks[1].timestamp

const deployment = await deploymentBoundary()
const archiveEvidence = await Promise.all(
  endpoints.map(({ label, url }) => archiveBoundary(label, url, deployment.blockNumber)),
)
const configuredArchive = archiveEvidence.find((entry) => entry.label === 'configured-alchemy')
const publicArchive = archiveEvidence.find((entry) => entry.label === 'official-public')
const deploymentAgreement =
  deployment.status === 'verified' &&
  configuredArchive?.status === 'archive-verified' &&
  !configuredArchive.before.hasCode &&
  configuredArchive.at.hasCode &&
  configuredArchive.at.byteLength === EXPECTED_PROXY_LENGTH &&
  configuredArchive.at.bytecodeHash === EXPECTED_PROXY_HASH &&
  ['archive-verified', 'non-archive'].includes(publicArchive?.status)

const historyScans =
  deploymentAgreement && endBlockAgreement && deployment.blockNumber !== null
    ? await Promise.all([
        scanPublicEvents(deployment.blockNumber, endBlock),
        scanBlockscoutEvents(deployment.blockNumber, endBlock),
      ])
    : []
const historyAgreement =
  historyScans.length === 2 &&
  historyScans.every((scan) => scan.status === 'complete') &&
  historyScans[0].eventDigest === historyScans[1].eventDigest &&
  JSON.stringify(historyScans[0].events) === JSON.stringify(historyScans[1].events)
const events = historyAgreement ? historyScans[0].events : []

const preliminaryRoles = [
  ...new Set(
    events.flatMap((event) =>
      event.eventName === 'RoleAdminChanged' ? [event.role, event.previousAdminRole, event.newAdminRole] : [event.role],
    ),
  ),
].sort()
const preliminaryCandidates = Object.fromEntries(
  preliminaryRoles.map((role) => [
    role,
    [...new Set(events.filter((event) => event.role === role && event.account).map((event) => event.account))].sort(),
  ]),
)
const initialStates = historyAgreement
  ? await Promise.all(
      endpoints.map(({ label, url }) => readTimelockState(label, url, endBlock, preliminaryRoles, preliminaryCandidates)),
    )
  : []
const constantsAgreement =
  initialStates.length === 2 &&
  initialStates.every((state) => state.status === 'verified') &&
  JSON.stringify(comparable(initialStates[0])) === JSON.stringify(comparable(initialStates[1]))
const constants = initialStates.find((state) => state.status === 'verified')?.constants ?? {}
const allRoles = [...new Set([...preliminaryRoles, ...Object.values(constants)])].sort()
const reconstruction = reconstruct(events, allRoles)
const roleStates = historyAgreement
  ? await Promise.all(
      endpoints.map(({ label, url }) => readTimelockState(label, url, endBlock, allRoles, reconstruction.candidates)),
    )
  : []
const roleStateAgreement =
  roleStates.length === 2 &&
  roleStates.every((state) => state.status === 'verified') &&
  JSON.stringify(comparable(roleStates[0])) === JSON.stringify(comparable(roleStates[1]))
const authoritativeState = roleStates.find((state) => state.status === 'verified')
const stateMismatches = authoritativeState ? compareReconstruction(reconstruction, authoritativeState) : []

const currentHolders = []
if (authoritativeState) {
  for (const role of allRoles) {
    const accounts = new Set(reconstruction.candidates[role] ?? [])
    if (role === constants.EXECUTOR_ROLE) accounts.add(zeroAddress)
    for (const account of [...accounts].sort()) {
      if (authoritativeState.membership[`${role}:${account}`] === true) {
        currentHolders.push({ role, roleLabel: roleLabel(role, constants), account })
      }
    }
  }
}
currentHolders.sort((left, right) => `${left.role}:${left.account}`.localeCompare(`${right.role}:${right.account}`))

const holderEvidence = []
for (const address of [...new Set(currentHolders.map((holder) => holder.account))]) {
  if (address === zeroAddress) {
    holderEvidence.push({
      address,
      agreement: true,
      classification: 'open-role-sentinel',
      providers: [],
      explorer: null,
      owner: null,
    })
  } else {
    holderEvidence.push(await classifyAddress(address, endpoints, endBlock))
  }
}

const proxyEvidence = await classifyAddress(TIMELOCK, endpoints, endBlock)
const implementationEvidence = await classifyAddress(EXPECTED_IMPLEMENTATION, endpoints, endBlock)
const proxyAdminEvidence = await classifyAddress(EXPECTED_PROXY_ADMIN, endpoints, endBlock, true)
const proxyIdentityAgreement =
  proxyEvidence.agreement &&
  implementationEvidence.agreement &&
  proxyAdminEvidence.agreement &&
  implementationEvidence.providers.every((provider) => provider.code.hasCode) &&
  proxyAdminEvidence.providers.every((provider) => provider.code.hasCode) &&
  proxyEvidence.providers.every(
    (provider) =>
      provider.slots.implementation === EXPECTED_IMPLEMENTATION &&
      provider.slots.admin === EXPECTED_PROXY_ADMIN &&
      provider.slots.beacon === null &&
      provider.code.byteLength === EXPECTED_PROXY_LENGTH &&
      provider.code.bytecodeHash === EXPECTED_PROXY_HASH,
  )
const proxyAdminOwnership = await traceProxyAdminOwnership(EXPECTED_PROXY_ADMIN, endpoints, endBlock)

const roleMembershipVerified =
  availableTips.length === 2 &&
  endBlockAgreement &&
  deploymentAgreement &&
  historyAgreement &&
  constantsAgreement &&
  roleStateAgreement &&
  reconstruction.anomalies.length === 0 &&
  stateMismatches.length === 0

const holderEvidenceAgreement = holderEvidence.every((holder) => holder.agreement)
const ownerTraceAgreement = proxyAdminOwnership.nodes.every((node) => node.agreement)
const authorityBoundaries = [
  ...holderEvidence
    .filter(
      (holder) =>
        holder.address !== TIMELOCK &&
        ['eip1967-proxy', 'contract-unclassified', 'unresolved'].includes(holder.classification),
    )
    .map((holder) => ({ address: holder.address, source: 'timelock-role-holder', classification: holder.classification })),
  ...(!proxyAdminOwnership.completed
    ? [
        {
          address: proxyAdminOwnership.nodes.at(-1)?.address ?? EXPECTED_PROXY_ADMIN,
          source: 'proxy-admin-owner-chain',
          classification: proxyAdminOwnership.terminalReason,
        },
      ]
    : []),
]

const result = {
  mode: 'read-only',
  generatedAt: new Date().toISOString(),
  timelock: TIMELOCK,
  confirmations: CONFIRMATIONS.toString(),
  tips: tips.map((tip) => ({ ...tip, blockNumber: tip.blockNumber?.toString() ?? null })),
  endBoundary: { blockNumber: endBlock.toString(), agreement: endBlockAgreement, providers: endBlocks },
  deploymentBoundary: {
    agreement: deploymentAgreement,
    blockNumber: deployment.blockNumber?.toString() ?? null,
    transactionHash: deployment.transactionHash,
    explorer: deployment.metadata,
    archiveEvidence,
  },
  proxyIdentity: {
    agreement: proxyIdentityAgreement,
    expectedImplementation: EXPECTED_IMPLEMENTATION,
    expectedProxyAdmin: EXPECTED_PROXY_ADMIN,
    proxy: proxyEvidence,
    implementation: implementationEvidence,
    proxyAdmin: proxyAdminEvidence,
  },
  roleHistory: {
    agreement: historyAgreement,
    eventCount: events.length,
    digest: historyAgreement ? digest(events) : null,
    scans: historyScans,
    events,
  },
  roles: {
    constants,
    providerAgreement: roleStateAgreement,
    providers: roleStates,
    reconstruction,
    stateMismatches,
    currentHolders,
    openExecutor:
      authoritativeState && constants.EXECUTOR_ROLE
        ? authoritativeState.membership[`${constants.EXECUTOR_ROLE}:${zeroAddress}`] === true
        : null,
  },
  minimumDelaySeconds: authoritativeState?.minDelaySeconds ?? null,
  holderEvidence,
  holderEvidenceAgreement,
  proxyAdminOwnership,
  proxyAdminOwnershipAgreement: ownerTraceAgreement,
  identifiedOperations: [],
  operationStateQueriesPerformed: false,
  roleMembershipStatus: roleMembershipVerified ? 'verified' : 'unresolved',
  controlStatus:
    roleMembershipVerified && proxyIdentityAgreement && holderEvidenceAgreement && ownerTraceAgreement
      ? authorityBoundaries.length === 0
        ? 'timelock-controls-verified'
        : 'timelock-controls-verified-authority-boundaries-recorded'
      : 'unresolved',
  authorityBoundaries,
  executionEligible: false,
  disclaimer:
    'This audit reads historical role logs, role getters, hasRole, minimum delay, bytecode, EIP-1967 storage, verified metadata, and owner() where supported. It does not hash or encode governance operations, construct calldata, connect a wallet, request signatures, submit transactions, move funds, or recommend capital deployment.',
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
