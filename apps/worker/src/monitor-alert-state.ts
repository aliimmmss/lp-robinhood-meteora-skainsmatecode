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
  lastSeen