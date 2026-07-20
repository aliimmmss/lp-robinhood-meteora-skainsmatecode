import type { PoolHistoryRiskFlag } from '@lp-mine/core'
import { pathToFileURL } from 'node:url'
import { buildPoolHistoryReport, type PoolHistoryReport } from './pools-history.js'
import { readMonitorHealthConfig, type MonitorHealthConfig } from './monitor-health-config.js'

export type MonitorHealthStatus = 'healthy' | 'degraded' | 'critical'
export type MonitorAlertSeverity = 'warning' | 'critical'
export type MonitorAlertCode = 'missing-pool' | 'stale-observation' | 'history-risk' | 'source-warning'

export type MonitorAlert = {
  alertKey: string
  severity: MonitorAlertSeverity
  code: MonitorAlertCode
  poolAddress: `0x${string}`
  feeTier: number
  message