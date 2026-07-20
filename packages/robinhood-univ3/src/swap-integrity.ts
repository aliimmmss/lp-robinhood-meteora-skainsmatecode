import { DatabaseSync } from 'node:sqlite'
import type { Address } from 'viem'
import { SqliteSwapIndexStore } from './swap-store.js'

export type SwapEvidenceCoverage = {
  totalRows: number
  timestampedRows: number
  missingTimestampRows: number
  latestTimestamp: Date | null
}

export function inspectSwapEvidenceCoverage(path: string, poolAddress: Address): SwapEvidenceCoverage {
  const initializer = new SqliteSwapIndexStore(path)
  initializer.close()

  const database = new DatabaseSync(path)
  try {
    const row = database
      .prepare(
        `
        SELECT COUNT(*) AS total_rows,
               COUNT(time.observed_at) AS timestamped_rows,
               MAX(time.observed_at) AS latest_timestamp
        FROM swap_events event
        LEFT JOIN swap_block_times time ON time.block_number = event.block_number
        WHERE event.pool_address = ?
      `,
      )
      .get(poolAddress) as {
      total_rows: number
      timestamped_rows: number
      latest_timestamp: string | null
    }

    return {
      totalRows: row.total_rows,
      timestampedRows: row.timestamped_rows,
      missingTimestampRows: row.total_rows - row.timestamped_rows,
      latestTimestamp: row.latest_timestamp ? new Date(row.latest_timestamp) : null,
    }
  } finally {
    database.close()
  }
}
