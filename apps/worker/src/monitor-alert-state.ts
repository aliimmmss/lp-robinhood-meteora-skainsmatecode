import { DatabaseSync } from 'node:sqlite'
import type { MonitorAlert, MonitorAlertCode, MonitorAlertSeverity } from './monitor-health.js'

export type MonitorAlertLifecycleStatus = 'active' | 'resolved'

export type MonitorAlertState = {
  alertKey: string
  severity: MonitorAlertSeverity
  code: MonitorAlertCode
  poolAddress: `0x${string}`
  feeTier: number
  message: string
  status: MonitorAlertLifecycleStatus
  firstSeenAt: Date
  occurrenceStartedAt: Date
  lastSeenAt: Date
  resolvedAt: Date | null
  acknowledgedAt: Date | null
}

type AlertRow = {
  alert_key: string
  severity: MonitorAlertSeverity
  code: MonitorAlertCode
  pool_address: `0x${string}`
  fee_tier: number
  message: string
  status: MonitorAlertLifecycleStatus
  first_seen_at: string
  occurrence_started_at: string | null
  last_seen_at: string
  resolved_at: string | null
  acknowledged_at: string | null
}

type TableInfoRow = {
  name: string
}

export class SqliteMonitorAlertStateStore {
  readonly #database: DatabaseSync

  constructor(path: string) {
    this.#database = new DatabaseSync(path)
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS monitor_alert_state (
        alert_key TEXT PRIMARY KEY,
        severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
        code TEXT NOT NULL CHECK (code IN ('missing-pool', 'stale-observation', 'history-risk', 'source-warning')),
        pool_address TEXT NOT NULL,
        fee_tier INTEGER NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'resolved')),
        first_seen_at TEXT NOT NULL,
        occurrence_started_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        resolved_at TEXT,
        acknowledged_at TEXT
      ) STRICT;
    `)
    this.#ensureOccurrenceStartedAtColumn()
    this.#database.exec(`
      CREATE INDEX IF NOT EXISTS monitor_alert_state_status
      ON monitor_alert_state(status, severity, fee_tier);
      CREATE TABLE IF NOT EXISTS monitor_alert_delivery (
        channel TEXT NOT NULL,
        alert_key TEXT NOT NULL,
        occurrence_started_at TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        provider_message_id TEXT NOT NULL,
        PRIMARY KEY (channel, alert_key, occurrence_started_at)
      ) STRICT;
    `)
  }

  reconcile(alerts: readonly MonitorAlert[], observedAt: Date): readonly MonitorAlertState[] {
    assertValidDate(observedAt, 'observedAt')
    const timestamp = observedAt.toISOString()
    const activeKeys = new Set(alerts.map((alert) => alert.alertKey))
    const upsert = this.#database.prepare(`
      INSERT INTO monitor_alert_state (
        alert_key, severity, code, pool_address, fee_tier, message,
        status, first_seen_at, occurrence_started_at, last_seen_at, resolved_at, acknowledged_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL)
      ON CONFLICT(alert_key) DO UPDATE SET
        severity = excluded.severity,
        code = excluded.code,
        pool_address = excluded.pool_address,
        fee_tier = excluded.fee_tier,
        message = excluded.message,
        status = 'active',
        occurrence_started_at = CASE
          WHEN monitor_alert_state.status = 'resolved' THEN excluded.occurrence_started_at
          ELSE monitor_alert_state.occurrence_started_at
        END,
        last_seen_at = excluded.last_seen_at,
        resolved_at = NULL,
        acknowledged_at = CASE
          WHEN monitor_alert_state.status = 'resolved' THEN NULL
          ELSE monitor_alert_state.acknowledged_at
        END
    `)

    this.#database.exec('BEGIN IMMEDIATE')
    try {
      for (const alert of alerts) {
        upsert.run(
          alert.alertKey,
          alert.severity,
          alert.code,
          alert.poolAddress,
          alert.feeTier,
          alert.message,
          timestamp,
          timestamp,
          timestamp,
        )
      }
      const activeRows = this.#database
        .prepare("SELECT alert_key FROM monitor_alert_state WHERE status = 'active'")
        .all() as Array<{ alert_key: string }>
      const resolve = this.#database.prepare(`
        UPDATE monitor_alert_state
        SET status = 'resolved', resolved_at = ?
        WHERE alert_key = ? AND status = 'active'
      `)
      for (const row of activeRows) {
        if (!activeKeys.has(row.alert_key)) resolve.run(timestamp, row.alert_key)
      }
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
    return this.list()
  }

  acknowledge(alertKey: string, acknowledgedAt: Date): boolean {
    assertNonEmpty(alertKey, 'alertKey')
    assertValidDate(acknowledgedAt, 'acknowledgedAt')
    const result = this.#database
      .prepare(
        `
        UPDATE monitor_alert_state
        SET acknowledged_at = ?
        WHERE alert_key = ? AND status = 'active' AND acknowledged_at IS NULL
      `,
      )
      .run(acknowledgedAt.toISOString(), alertKey)
    return Number(result.changes) === 1
  }

  get(alertKey: string): MonitorAlertState | null {
    assertNonEmpty(alertKey, 'alertKey')
    const row = this.#database.prepare('SELECT * FROM monitor_alert_state WHERE alert_key = ?').get(alertKey) as
      | AlertRow
      | undefined
    return row === undefined ? null : rowToState(row)
  }

  list(status?: MonitorAlertLifecycleStatus): readonly MonitorAlertState[] {
    const rows = (
      status
        ? this.#database
            .prepare(
              `SELECT * FROM monitor_alert_state
               WHERE status = ?
               ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, fee_tier, alert_key`,
            )
            .all(status)
        : this.#database
            .prepare(
              `SELECT * FROM monitor_alert_state
               ORDER BY status, CASE severity WHEN 'critical' THEN 0 ELSE 1 END, fee_tier, alert_key`,
            )
            .all()
    ) as AlertRow[]
    return rows.map(rowToState)
  }

  listPendingNotificationAlerts(channel: string): readonly MonitorAlertState[] {
    assertNonEmpty(channel, 'channel')
    const rows = this.#database
      .prepare(
        `
        SELECT state.*
        FROM monitor_alert_state AS state
        LEFT JOIN monitor_alert_delivery AS delivery
          ON delivery.channel = ?
          AND delivery.alert_key = state.alert_key
          AND delivery.occurrence_started_at = state.occurrence_started_at
        WHERE state.status = 'active'
          AND state.acknowledged_at IS NULL
          AND delivery.alert_key IS NULL
        ORDER BY CASE state.severity WHEN 'critical' THEN 0 ELSE 1 END, state.fee_tier, state.alert_key
      `,
      )
      .all(channel) as AlertRow[]
    return rows.map(rowToState)
  }

  recordNotificationDelivery(
    channel: string,
    alert: MonitorAlertState,
    deliveredAt: Date,
    providerMessageId: string,
  ): boolean {
    assertNonEmpty(channel, 'channel')
    assertNonEmpty(providerMessageId, 'providerMessageId')
    assertValidDate(deliveredAt, 'deliveredAt')
    if (alert.status !== 'active') throw new Error('only active alerts can be recorded as delivered')
    const result = this.#database
      .prepare(
        `
        INSERT OR IGNORE INTO monitor_alert_delivery (
          channel, alert_key, occurrence_started_at, delivered_at, provider_message_id
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        channel,
        alert.alertKey,
        alert.occurrenceStartedAt.toISOString(),
        deliveredAt.toISOString(),
        providerMessageId,
      )
    return Number(result.changes) === 1
  }

  close(): void {
    this.#database.close()
  }

  #ensureOccurrenceStartedAtColumn(): void {
    const columns = this.#database.prepare('PRAGMA table_info(monitor_alert_state)').all() as TableInfoRow[]
    if (columns.some((column) => column.name === 'occurrence_started_at')) return
    this.#database.exec(`
      ALTER TABLE monitor_alert_state ADD COLUMN occurrence_started_at TEXT;
      UPDATE monitor_alert_state
      SET occurrence_started_at = first_seen_at
      WHERE occurrence_started_at IS NULL;
    `)
  }
}

function rowToState(row: AlertRow): MonitorAlertState {
  return {
    alertKey: row.alert_key,
    severity: row.severity,
    code: row.code,
    poolAddress: row.pool_address,
    feeTier: row.fee_tier,
    message: row.message,
    status: row.status,
    firstSeenAt: new Date(row.first_seen_at),
    occurrenceStartedAt: new Date(row.occurrence_started_at ?? row.first_seen_at),
    lastSeenAt: new Date(row.last_seen_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : null,
  }
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new RangeError(`${name} must not be empty`)
}

function assertValidDate(value: Date, name: string): void {
  if (Number.isNaN(value.getTime())) throw new RangeError(`${name} must be valid`)
}
