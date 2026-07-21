from pathlib import Path
import re

path = Path('.github/scripts/audit-weth-access-control.mjs')
content = path.read_text()


def replace_once(old: str, new: str, name: str) -> None:
    global content
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{name}: expected one match, found {count}')
    content = content.replace(old, new, 1)


replace_once(
    "import process from 'node:process'\n",
    "import process from 'node:process'\nimport { setTimeout as sleep } from 'node:timers/promises'\n",
    'sleep import',
)
replace_once(
    'const INITIAL_LOG_RANGE = 500_000n\n',
    """const INITIAL_LOG_RANGE = 500_000n
const LOG_REQUEST_DELAY_MS = 350
const LOG_MAX_ATTEMPTS = 7
const LOG_MAX_SPLIT_DEPTH = 12
const LOG_MAX_REQUESTS = 500
const LOG_MAX_DURATION_MS = 25 * 60 * 1_000
const EXPECTED_EVENT_DIGEST = '0xd880dde31907ed8351ec66af46cc7f96afffbda565e67501b23f4f4dabdabd06'
""",
    'retry constants',
)

transport = r"""function assertLogBudget(stats) {
  if (stats.requests >= LOG_MAX_REQUESTS) throw new Error(`log-request-budget-exhausted:${LOG_MAX_REQUESTS}`)
  if (Date.now() - stats.startedAt > LOG_MAX_DURATION_MS) {
    throw new Error(`log-duration-budget-exhausted:${LOG_MAX_DURATION_MS}`)
  }
}

function isRateLimitError(message) {
  return /(?:status:\s*429|too many requests|rate.?limit)/i.test(message)
}

function isRangeLimitError(message) {
  return /(?:block range|range is too wide|query returned more than|too many results|response size|limit exceeded|maximum.*range)/i.test(
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
            address: CONTROLLER,
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

function normalizeLog"""
pattern = re.compile(
    r'async function rawLogs\(rpc, fromBlock, toBlock\) \{.*?\n\}\n\n'
    r'async function logsAdaptive\(rpc, fromBlock, toBlock\) \{.*?\n\}\n\n'
    r'function normalizeLog',
    re.S,
)
content, count = pattern.subn(lambda _match: transport, content, count=1)
if count != 1:
    raise SystemExit(f'transport region: expected one match, found {count}')

replace_once(
    '  const rpc = rpcClient(url)\n  const raw = []\n  try {\n',
    '  const rpc = rpcClient(url)\n'
    '  const raw = []\n'
    '  const stats = { startedAt: Date.now(), requests: 0, rateLimitRetries: 0, backoffMs: 0, splits: 0 }\n'
    '  try {\n',
    'scan stats',
)
replace_once(
    'raw.push(...(await logsAdaptive(rpc, from, to)))',
    'raw.push(...(await logsAdaptive(rpc, from, to, stats)))',
    'scan call',
)
replace_once(
    '      eventDigest: digest(events),\n      events,\n',
    '      eventDigest: digest(events),\n'
    '      requestStats: { ...stats, durationMs: Date.now() - stats.startedAt },\n'
    '      events,\n',
    'success stats',
)
replace_once(
    '      events: [],\n      error: safeError(error),\n',
    '      requestStats: { ...stats, durationMs: Date.now() - stats.startedAt },\n'
    '      events: [],\n'
    '      error: safeError(error),\n',
    'failure stats',
)
replace_once(
    '  scans[0].eventDigest === scans[1].eventDigest &&\n'
    '  JSON.stringify(scans[0].events) === JSON.stringify(scans[1].events)\n',
    '  scans[0].eventDigest === scans[1].eventDigest &&\n'
    '  scans[0].eventDigest === EXPECTED_EVENT_DIGEST &&\n'
    '  JSON.stringify(scans[0].events) === JSON.stringify(scans[1].events)\n',
    'known digest',
)

path.write_text(content)
