# Deposit runbook — opening a WETH/USDG LP position on Robinhood Chain

This is an operator checklist for the human who owns the wallet. Every step is performed by you, in your own wallet, through the official Uniswap web app. This repository never holds keys, builds transactions, signs, or submits anything. Nothing here is financial advice, and no step tells you how much to deposit — that decision is yours alone.

Read [../README.md](../README.md) principles first: start tiny, manual confirmation only, verified contracts only.

## 0. Before you begin

- A self-custody EVM wallet you control (browser extension or mobile with WalletConnect).
- ETH on Robinhood Chain for gas (the chain's gas token is ETH).
- The two assets you intend to provide: WETH and/or USDG on Robinhood Chain.
- The current fee-tier comparison from this repo (see step 3).

Robinhood Chain facts, pinned in [ROBINHOOD_REGISTRY_EVIDENCE.md](ROBINHOOD_REGISTRY_EVIDENCE.md):

| Item | Value |
| --- | --- |
| Chain ID | `4663` (`0x1237`) |
| Gas token | ETH |
| WETH (token0) | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| USDG (token1) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| Uniswap v3 factory | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` |
| Position manager (NFT) | `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` |

## 1. Add and verify the network

Add Robinhood Chain to your wallet (chain ID `4663`, ETH as native currency). Confirm your wallet reports chain ID `4663` before doing anything else. If your ISP interferes with the RPC (this happened during setup — see project notes), set your system DNS to `1.1.1.1` / `8.8.8.8` first; the wallet needs a working RPC to sign anything.

## 2. Get funds onto Robinhood Chain

Bridge or transfer ETH (for gas) plus your WETH and/or USDG to your wallet on Robinhood Chain using an official, Robinhood-endorsed route. Verify the destination is chain ID `4663`. Do not use a bridge or token address that you have not confirmed against the table above. When the funds arrive, confirm in your wallet that the token contract addresses exactly match the WETH and USDG addresses above — a matching symbol is not enough.

## 3. Choose the pool (fee tier)

Run the repo's fee comparison and read the ranking:

```bash
npm run --workspace @lp-mine/worker pools:fees
```

- The pool listed first has the highest recent combined daily fees per unit of liquidity.
- Ignore any pool with `status: insufficient` (not enough data yet) or `partial` with a zero-active-liquidity warning (the 1.00% pool has been empty — a new position there would earn nothing).
- Prefer a pool whose `status` is `complete` and whose measured `windowSeconds` is not tiny. Re-run after the hourly cloud job has collected more samples for a steadier read.
- The figures are per a reference liquidity unit and are an estimate of *past* fees while in range — not a promised APR.

## 4. Open the position in the Uniswap web app

1. Go to the official Uniswap web app and connect your wallet.
2. Switch the network to Robinhood Chain (chain ID `4663`).
3. Start a new v3 liquidity position on the WETH/USDG pair at the fee tier you chose in step 3.
4. **Cross-check the pool address** the app shows against [ROBINHOOD_REGISTRY_EVIDENCE.md](ROBINHOOD_REGISTRY_EVIDENCE.md) for that fee tier. If it does not match exactly, stop.
5. Choose your price range. A wider range stays in-range longer (keeps earning) but earns less per dollar; a narrow range earns more per dollar but stops earning if price leaves it. WETH/USDG is a volatile-vs-stable pair, so price will move — a position only earns fees while the price is inside its range. Range-width analysis from accumulated observations is a planned addition to this repo; until then, err wide.
6. Enter the deposit amounts. This repo does not recommend an amount; follow the "start tiny" principle.
7. Review the two on-screen transactions your wallet will request: first an ERC-20 approval (approving the position manager to move the exact token amount), then the mint. Read what your wallet shows. The spender on the approval should be the position manager `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3`.
8. Confirm each transaction yourself in your wallet.

## 5. Record the position for monitoring

After the mint confirms, note from the transaction/position details:

- the position NFT token ID,
- the exact lower and upper ticks,
- the liquidity `L` minted,
- the mint block or timestamp.

Keep these — the repo's `position:fee-share`, `position:performance`, and `position:history` commands (see [ROBINHOOD_WORKER.md](ROBINHOOD_WORKER.md)) use them to track realized fees and LP-vs-HODL after the fact. Post-deposit monitoring wiring is the next planned step.

## Safety reminders

- The only place you ever enter approvals or signatures is your own wallet, on the official Uniswap app, after verifying the pool address here.
- Never paste a seed phrase or private key anywhere, including into any tool in this repo.
- Approve exact amounts, not unlimited, when your wallet gives the choice.
- If anything — an address, a chain ID, a contract the app calls — does not match the pinned evidence, stop and re-verify.
