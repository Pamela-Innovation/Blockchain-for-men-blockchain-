# Auto Bot Operations Source of Truth

This document is the canonical operations reference for payment policy, chain scheduling, required secrets, governance, and run monitoring for all liquidator auto bots in this repository.

## 1) Payment scope in this repository

For this repository, **payments** includes all of the following controls:

- `SWAP_RECIPIENT`: payout destination for realized bot profits.
- `MIN_PROFIT_THRESHOLD_USD`: minimum profit required before liquidating.
- Relayer gas funding policy for `CUSTOM_RELAYER_PRIVATE_KEY`.

## 2) Owner-approved per-chain payment policy

Default policy for all chains:

- Keep `SWAP_RECIPIENT` blank to pay profits to the relayer account by default.
- Override `SWAP_RECIPIENT` only when a dedicated payout wallet is required.
- Keep relayer wallet balances low and replenish as needed for gas.

| Network | Workflow file | Schedule (UTC) | CHAIN_ID | MIN_PROFIT_THRESHOLD_USD | SWAP_RECIPIENT policy | Required RPC secret |
|---|---|---|---:|---:|---|---|
| Ethereum Mainnet | `.github/workflows/cron.ethereum-mainnet.yml` | `50 * * * *` | 1 | 90 | blank by default | `ETHEREUM_MAINNET_JSON_RPC_URL` |
| Base Mainnet | `.github/workflows/cron.base-mainnet.yml` | `50 * * * *` | 8453 | 0.5 | blank by default | `BASE_MAINNET_JSON_RPC_URL` |
| Arbitrum Mainnet | `.github/workflows/cron.arbitrum-mainnet.yml` | `50 * * * *` | 42161 | 0.5 | blank by default | `ARBITRUM_MAINNET_JSON_RPC_URL` |
| Optimism Mainnet | `.github/workflows/cron.optimism-mainnet.yml` | `50 * * * *` | 10 | 0.5 | blank by default | `OPTIMISM_MAINNET_JSON_RPC_URL` |
| Scroll Mainnet | `.github/workflows/cron.scroll-mainnet.yml` | `50 * * * *` | 534352 | 0.5 | blank by default | `SCROLL_MAINNET_JSON_RPC_URL` |
| Gnosis Mainnet | `.github/workflows/cron.gnosis-mainnet.yml` | `50 * * * *` | 100 | 0.5 | blank by default | `GNOSIS_MAINNET_JSON_RPC_URL` |
| World Mainnet | `.github/workflows/cron.world-mainnet.yml` | `50 * * * *` | 480 | 0.2 | blank by default | `WORLD_MAINNET_JSON_RPC_URL` |

Shared required secrets across all chains:

- `CUSTOM_RELAYER_PRIVATE_KEY`
- `COVALENT_API_KEY`
- Chain-specific `*_JSON_RPC_URL`

## 3) Workflow run standard

All chain workflows use the same standard:

- Manual (`workflow_dispatch`) and scheduled execution.
- Preflight secret check before execution.
- Safe skip behavior when required secrets are missing.
- Consistent status outcomes: `success`, `skipped`, `failed`.
- Automatic issue creation on bot failure.
- Step summary publication with chain and run status.

## 4) Payment governance and change approval

Changes to these values require maintainer approval in PR review:

- `SWAP_RECIPIENT`
- `MIN_PROFIT_THRESHOLD_USD`
- `CONTRACT_JSON_URL`
- Schedule (`cron`)

Approval path:

1. Open PR with rationale and expected impact.
2. Obtain at least one maintainer approval.
3. Validate workflow behavior through run logs after merge.

Threshold adjustment guidance:

- Raise threshold when gas costs rise or low-value liquidations become noisy.
- Lower threshold only when net profitability is still positive after fees and slippage.

## 5) Operational observability

Run status conventions:

- `success`: preflight passed and bot finished successfully.
- `skipped`: preflight failed because required secrets are missing.
- `failed`: preflight passed but bot execution failed.

Where to check:

- GitHub Actions workflow run list and per-run step logs.
- `Open issue on bot failure` issues.
- Workflow step summaries.

Operator checklist:

### Daily

- Confirm scheduled runs exist for each network.
- Confirm no new failure issues.
- Confirm relayer balances are sufficient for gas.

### Weekly

- Review run summaries for repeated skips/failures.
- Re-validate payment thresholds against current gas/market conditions.
- Verify no unauthorized payment parameter changes were merged.

## 6) Security and key hygiene

- Store credentials only in GitHub Actions secrets or an approved vault.
- Never commit plaintext keys or expose them in logs/comments.
- Maintain 90-day standard rotation cadence.
- Rotate immediately on exposure suspicion, role changes, or vendor incidents.

See `/home/runner/work/Blockchain-for-men-blockchain-/Blockchain-for-men-blockchain-/SECURITY_KEYS_POLICY.md` for full key policy details.

## 7) Rollout sequence

1. Keep this document up to date as the policy source of truth.
2. Apply workflow standards consistently to all chain files in `.github/workflows/`.
3. Validate scheduled behavior and payment settings via workflow logs and summaries.
4. Operate from the checklist above for ongoing runbook execution.
