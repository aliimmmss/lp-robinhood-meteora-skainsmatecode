import { pathToFileURL } from 'node:url'
import { buildMonitorHealthReport, type MonitorHealthReport } from './monitor-health.js'
import { readMonitorHealthConfig } from './monitor-health-config.js'
import { buildPoolFeeReport, type PoolFeeReport } from './pools-fees.js'
import { buildOpportunityReport, type OpportunityReport } from './pools-opportunities.js'

const DEFAULT_FEE_WINDOW_SECONDS = 86_400
const DEFAULT_REFERENCE_LIQUIDITY = 10n ** 18n

/**
 * Single read-only snapshot consumed by the static monitoring site. Composes
 * the already-tested health and fee-yield reports so the site has one file to
 * render. schemaVersion lets the site detect an incompatible shape.
 */
export type SiteData = {
  schemaVersion: 1
  generatedAt: string
  health: MonitorHealthReport
  fees: PoolFeeReport
  opportunities: OpportunityReport | { error: string } | null
}

/** DB-only snapshot (offline-safe). Opportunities are attached separately. */
export function buildSiteData(environment: NodeJS.ProcessEnv = process.env, now = new Date()): SiteData {
  const healthConfig = readMonitorHealthConfig(environment)
  const health = buildMonitorHealthReport(healthConfig, now)
  const fees = buildPoolFeeReport(
    {
      databasePath: healthConfig.databasePath,
      windowSeconds: DEFAULT_FEE_WINDOW_SECONDS,
      referenceLiquidity: DEFAULT_REFERENCE_LIQUIDITY,
      limit: healthConfig.historyLimit,
    },
    now,
  )
  return { schemaVersion: 1, generatedAt: now.toISOString(), health, fees, opportunities: null }
}

/** Full snapshot including the best-effort third-party opportunity feed. */
export async function assembleSiteData(
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<SiteData> {
  const data = buildSiteData(environment, now)
  try {
    data.opportunities = await buildOpportunityReport({ now })
  } catch (error: unknown) {
    // A GeckoTerminal outage must not break the site build.
    data.opportunities = { error: error instanceof Error ? error.message : String(error) }
  }
  return data
}

export async function runSiteDataCommand(): Promise<void> {
  const data = await assembleSiteData()
  process.stdout.write(
    `${JSON.stringify(data, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runSiteDataCommand().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
