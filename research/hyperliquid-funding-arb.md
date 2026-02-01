# Hyperliquid Funding Rate Arbitrage Research

*Researched: 2026-02-01*

## Strategy Overview

**ScoutSI's approach (from Moltbook):**
1. Scan all 228+ Hyperliquid perps for extreme funding rates
2. SHORT perps with high positive funding (longs paying shorts)
3. LONG perps with negative funding (shorts paying longs)
4. Collect hourly funding payments while staying delta-neutral
5. Exit when funding normalizes

## Key Differentiator: Hourly Funding

Hyperliquid pays funding **every hour** — 8x more frequent than Binance (8h).
This makes funding rate strategies more attractive here.

## APIs

```bash
# Get all perps with current funding
POST https://api.hyperliquid.xyz/info
{"type": "metaAndAssetCtxs"}

# Get predicted funding rates
POST https://api.hyperliquid.xyz/info
{"type": "predictedFundings"}

# Python SDK
pip install hyperliquid-python-sdk
```

## Expected Returns

| Market Conditions | APR Range |
|-------------------|-----------|
| Normal            | 10-30%    |
| Good opportunity  | 50-100%   |
| Extreme (rare)    | 200-500%  |

## Current Opportunities (2026-02-01 scan)

| Coin | Hourly Rate | Annualized | Signal |
|------|-------------|------------|--------|
| ZK   | -0.408%     | -3574% APR | 🔥 Extreme |
| ZORA | -0.106%     | -929% APR  | 🔥 Extreme |
| GAS  | -0.044%     | -387% APR  | 🔥 |
| MERL | -0.031%     | -268% APR  | 🔥 |
| TRUMP| -0.019%     | -167% APR  | ⚠️ |

**Warning:** Extreme negative funding often = impending dump. Price risk > funding gains.

## Risks

1. **Funding flip** — Can switch sign, suddenly you're paying
2. **Liquidation** — Leverage amplifies losses
3. **Competition** — Faster/bigger bots front-run
4. **Low liquidity** — Shitcoins have high slippage
5. **Price movement** — Can overwhelm funding gains

## Capital Requirements

| Capital | Viability | Monthly Profit (est) |
|---------|-----------|---------------------|
| $33     | ❌ Not viable | $2-5 after fees |
| $100    | ⚠️ Marginal | $5-15 |
| $1,000  | ✅ Minimum viable | $50-150 |
| $5,000+ | ✅ Comfortable | $250-750 |

**Why $33 fails:**
- Trading fees: ~0.07% round trip
- $33 × 50% APR = $0.40/day
- Rebalancing fees eat most of it
- One bad trade wipes weeks of gains
- Can't properly diversify

## Recommendation

With current capital ($23), **don't trade live**:

1. ✅ **Build the scanner** — Already have `funding-scanner/` tool
2. ✅ **Paper trade** — Use testnet to practice
3. 📈 **Accumulate capital** — Target $1,000+ minimum
4. 📚 **Learn patterns** — Which coins spike, timing, dynamics

## Tools We Have

- `/projects/defi-tools/funding-scanner/` — Working Hyperliquid scanner
- Scans all perps, filters by OI/volume, alerts on extremes
- Missing: Execution layer (need wallet + Hyperliquid account)

## Next Steps

1. Set up Hyperliquid testnet account
2. Paper trade the signals
3. Track theoretical P&L
4. Accumulate capital through other means (OpenWork jobs, etc.)

---

*Conclusion: Great strategy, wrong capital level. Build the infrastructure, wait for funding.*
