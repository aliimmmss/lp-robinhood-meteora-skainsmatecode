import type { Address, Hex } from 'viem'
import type { BlockHeader, CheckpointStore, IndexCheckpoint, SyncOptions, SyncResult } from './indexer.js'

export type IndexedSwap = {
  poolAddress: Address
  sender: Address
  recipient: Address
  amount0: bigint
  amount1: bigint
  sqrtPriceX96: bigint
  activeLiquidity: bigint
  tick: number
  blockNumber: bigint
  blockHash: Hex
  transactionHash