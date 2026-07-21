import { pathToFileURL } from 'node:url'
import { SqliteMonitorAlertStateStore, type MonitorAlertState } from './monitor-alert-state.js'
import { readMonitorDatabasePath } from './monitor-health-config.js'

export type MonitorAcknowledgeStatus = 'acknowledged' | 'already-acknowledged' | 'not-active' | 'not-found'

export type MonitorAcknowledgeReport = {
  mode: 'read-only'
  generatedAt: Date
  databasePath: string
  alertKey: string
  status: MonitorAcknowledgeStatus
  changed: boolean
  alert: MonitorAlertState | null
  disclaimer: string
}

export function parseMonitorAcknowledgeAlertKey(arguments_: readonly string[]): string {
  const values = arguments_.filter((value) => value !== '--').map((value) => value.trim())
  const [alertKey, ...additionalValues] = values
  if (alertKey === undefined || alertKey.length === 0 || additionalValues.length > 0) {
    throw new Error('monitor:acknowledge requires exactly one non-empty alertKey argument')
  }
  return alertKey
}

export function buildMonitorAcknowledgeReport(
  databasePath: string,
  alertKey: string,
  now = new Date(),
): MonitorAcknowledgeReport {
  if (databasePath.trim().length === 0) throw new RangeError('databasePath must not be empty')
  if (alertKey.trim().length === 0) throw new RangeError('alertKey must not be empty')
  if (Number.isNaN(now.getTime())) throw new RangeError('now must be valid')

  const store = new SqliteMonitorAlertStateStore(databasePath)
  try {
    const existing = store.get(alertKey)
    if (existing === null) return report(databasePath, alertKey, now, 'not-found', false, null)
    if (existing.status !== 'active') return report(databasePath, alertKey, now, 'not-active', false, existing)
    if (existing.acknowledgedAt !== null) {
      return report(databasePath, alertKey, now, 'already-acknowledged', false, existing)
    }

    const changed = store.acknowledge(alertKey, now)
    const alert = store.get(alertKey)
    if (!changed || alert === null || alert.acknowledgedAt === null) {
      throw new Error(`failed to acknowledge active alert ${alertKey}`)
    }
    return report(databasePath, alertKey, now, 'acknowledged', true, alert)
  } finally {
    store.close()
  }
}

export function runMonitorAcknowledgeCommand(arguments_: readonly string[] = process.argv.slice(2)): void {
  const alertKey = parseMonitorAcknowledgeAlertKey(arguments_)
  const result = buildMonitorAcknowledgeReport(readMonitorDatabasePath(), alertKey)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

function report(
  databasePath: string,
  alertKey: string,
  generatedAt: Date,
  status: MonitorAcknowledgeStatus,
  changed: boolean,
  alert: MonitorAlertState | null,
): MonitorAcknowledgeReport {
  return {
    mode: 'read-only',
    generatedAt,
    databasePath,
    alertKey,
    status,
    changed,
    alert,
    disclaimer:
      'Acknowledgement records local operator metadata only. It does not change monitoring severity, send notifications, sign transactions, move funds, or recommend deploying capital.',
  }
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runMonitorAcknowledgeCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
