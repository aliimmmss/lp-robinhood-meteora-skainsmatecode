import { pathToFileURL } from 'node:url'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TOKENS,
  SUPPORTED_FEE_TIERS,
  SqlitePoolObservationStore,
  createRobinhoodPublicClient,
  createViemReadClient,
  readVerifiedPoolSnapshot,
  type PoolSnapshot,
} from '@lp-mine/robinhood-univ3'
import { ensureDatabaseParentDirectory } from './database-path.js'
import { readPoolObserveConfig, type PoolObserveConfig } from './pools-observe-config.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export type PoolObservationRunResult = {
  mode: 'read-only'
  rpcSource: 'configured' | 'public-default'
  chainId: number
  databasePath: string
  snapshotsWritten: number
  totalStoredObservations: number
  skippedFeeTiers: readonly number[]
  observations: readonly {
    poolAddress: `0x${string}`
    feeTier: number
    blockNumber: bigint
    observedAt: Date
    activeLiquidity: bigint
  }[]
}

export async function capturePoolObservations(config: PoolObserveConfig): Promise<PoolObservationRunResult> {
  ensureDatabaseParentDirectory(config.databasePath)
  const publicClient = createRobinhoodPublicClient(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {})
  const chainId = await publicClient.getChainId()
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`Unexpected chain ID: ${chainId}`)

  const readClient = createViemReadClient(publicClient)
  const snapshots: PoolSnapshot[] = []
  const skippedFeeTiers: number[] = []

  for (const feeTier of SUPPORTED_FEE_TIERS) {
    const poolAddress = await readClient.getPool(ROBINHOOD_TOKENS.wrappedNative, ROBINHOOD_TOKENS.usdg, feeTier)
    if (poolAddress === ZERO_ADDRESS) {
      skippedFeeTiers.push(feeTier)
      continue
    }

    snapshots.push(
      await readVerifiedPoolSnapshot({
        client: readClient,
        poolAddress,
        token0: ROBINHOOD_TOKENS.wrappedNative,
        token1: ROBINHOOD_TOKENS.usdg,
        feeTier,
      }),
    )
  }

  const store = new SqlitePoolObservationStore(config.databasePath)
  try {
    const snapshotsWritten = store.saveSnapshots(snapshots)
    return {
      mode: 'read-only',
      rpcSource: config.rpcUrl ? 'configured' : 'public-default',
      chainId,
      databasePath: config.databasePath,
      snapshotsWritten,
      totalStoredObservations: store.countObservations(),
      skippedFeeTiers,
      observations: snapshots.map((snapshot) => ({
        poolAddress: snapshot.value.poolAddress,
        feeTier: snapshot.value.feeTier,
        blockNumber: snapshot.block.blockNumber,
        observedAt: snapshot.block.observedAt,
        activeLiquidity: snapshot.value.activeLiquidity,
      })),
    }
  } finally {
    store.close()
  }
}

export async function runPoolObservationCommand(): Promise<void> {
  const result = await capturePoolObservations(readPoolObserveConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runPoolObservationCommand().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
