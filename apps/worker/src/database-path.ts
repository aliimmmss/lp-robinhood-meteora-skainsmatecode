import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function ensureDatabaseParentDirectory(databasePath: string): void {
  if (databasePath === ':memory:') return
  mkdirSync(dirname(resolve(databasePath)), { recursive: true })
}
