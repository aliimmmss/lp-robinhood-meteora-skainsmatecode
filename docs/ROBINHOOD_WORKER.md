# Robinhood Uniswap v3 worker runbook

This runbook covers the current read-only Robinhood Chain workflow. The worker indexes and analyzes canonical WETH/USDG Uniswap v3 pools. It does not create approvals, sign transactions, move funds, or infer an advertised APR.

## Prerequisites

- Node.js 22 or newer
- npm 10
- A writable local path for the SQLite database
- An optional Robinhood Chain RPC URL in `ROBINHOOD_RPC_URL`

The public Robinhood RPC is used when `ROBINHOOD_RPC_URL` is not set. A configured archive-capable provider is preferable for large historical scans.

Install and build from the repository root:

```bash
npm ci
npm run build
```

Run worker commands with the workspace selector:

```bash
npm run --workspace @lp-mine/worker <command>
```

The default database path is `./data/robinhood-univ3.sqlite`. Override it consistently for every command:

```bash
export LP_MINE_DATABASE_PATH=./data/robinhood-univ3.sqlite
```

## Canonical pools and range alignment

Only the registered W