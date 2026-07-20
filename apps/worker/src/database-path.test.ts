import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureDatabaseParentDirectory } from './database-path.js'

describe('ensureDatabaseParentDirectory', () => {
  it('creates nested parent directories for file-backed databases', () => {
    const root = mkdtempSync(join(tmpdir(), 'lp-mine-observe-'))
    const databasePath = join(root, 'nested', 'pool.sqlite')
    ensureDatabaseParentDirectory(databasePath)
    expect(existsSync(join(root, 'nested'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('accepts in-memory databases without filesystem changes', () => {
    expect(() => ensureDatabaseParentDirectory(':memory:')).not.toThrow()
  })
})
