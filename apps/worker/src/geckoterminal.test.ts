import { describe, expect, it } from 'vitest'
import { normalizeGeckoPool } from './geckoterminal.js'

const raw = {
  address: '0xe9713f453adb9245b19559790c96f470a18f2fdf',
  name: 'gme / USDG 1%',
  pool_created_at: '2026-07-10T21:51:30Z',
  market_cap_usd: '629181.738176478',
  reserve_in_usd: '282233.2983',
  volume_usd: { h6: '12443986.01', h24: '25767875.91' },
}

describe('normalizeGeckoPool', () => {
  it('parses the fee tier from the pool name and coerces numeric strings', () => {
    const pool = normalizeGeckoPool(raw)!
    expect(pool.feeTierPercent).toBe(1)
    expect(pool.marketCapUsd).toBe(629181.738176478)
    expect(pool.reserveUsd).toBe(282233.2983)
    expect(pool.volume24hUsd).toBe(25767875.91)
    expect(pool.volume6hUsd).toBe(12443986.01)
    expect(pool.createdAt.toISOString()).toBe('2026-07-10T21:51:30.000Z')
  })

  it('parses fractional fee tiers', () => {
    expect(normalizeGeckoPool({ ...raw, name: 'USDG / WETH 0.01%' })!.feeTierPercent).toBe(0.01)
    expect(normalizeGeckoPool({ ...raw, name: 'nvda / USDG 0.05%' })!.feeTierPercent).toBe(0.05)
  })

  it('returns null when the fee tier cannot be parsed from the name', () => {
    expect(normalizeGeckoPool({ ...raw, name: 'GME / gme' })).toBeNull()
  })

  it('treats a missing market cap as null rather than zero', () => {
    expect(normalizeGeckoPool({ ...raw, market_cap_usd: undefined })!.marketCapUsd).toBeNull()
  })

  it('returns null on malformed reserve or volume', () => {
    expect(normalizeGeckoPool({ ...raw, reserve_in_usd: 'n/a' })).toBeNull()
  })
})
