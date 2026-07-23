import { OPPORTUNITY_CRITERIA, rankOpportunities, type ScoredOpportunity } from '@lp-mine/core'
import { pathToFileURL } from 'node:url'
import { fetchRobinhoodOpportunityPools } from './geckoterminal.js'

const DEFAULT_PAGES = 3

export type OpportunityReport = {
  mode: 'read-only'
  source: 'geckoterminal'
  network: 'robinhood'
  generatedAt: string
  criteria: typeof OPPORTUNITY_CRITERIA
  count: number
  opportunities: readonly ScoredOpportunity[]
  disclaimer: string
}

export async function buildOpportunityReport(
  options: { pages?: number; now?: Date; fetchImplementation?: typeof fetch } = {},
): Promise<OpportunityReport> {
  const now = options.now ?? new Date()
  const pools = await fetchRobinhoodOpportunityPools(options.pages ?? DEFAULT_PAGES, options.fetchImplementation)
  const opportunities = rankOpportunities(pools, now)
  return {
    mode: 'read-only',
    source: 'geckoterminal',
    network: 'robinhood',
    generatedAt: now.toISOString(),
    criteria: OPPORTUNITY_CRITERIA,
    count: opportunities.length,
    opportunities,
    disclaimer:
      'Opportunity data is third-party (GeckoTerminal) and unverified on-chain. Screen criteria follow public LP guidance, not deposit-grade evidence. Not a recommendation to deploy capital; tokens and pools require independent verification.',
  }
}

export async function runOpportunityCommand(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const rawPages = environment.LP_MINE_OPPORTUNITY_PAGES
  const pages = rawPages && /^\d+$/.test(rawPages) ? Number(rawPages) : DEFAULT_PAGES
  const report = await buildOpportunityReport({ pages })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runOpportunityCommand().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
