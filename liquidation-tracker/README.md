# Liquidation Tracker 🔥

Monitors perpetual DEX liquidations for cascade signals and market stress indicators.

## Why This Matters

From insights research:
- **Biggest liquidations happen UTC 2am-5am** when order books are thin
- Cascade events (multiple liquidations in quick succession) often precede larger moves
- Large liquidations can be entry signals if you catch the bounce

## Features

- **Real-time monitoring** of Hyperliquid perp liquidations
- **Cascade detection** (3+ liquidations in 1 minute = alert)
- **Large liquidation alerts** ($50K+ warning, $100K+ critical)
- **High-risk window tracking** (UTC 2-5am flagged)
- **Historical analysis** with daily logs

## Usage

```bash
# Single scan
node tracker.js scan

# Continuous monitoring (recommended)
node tracker.js loop

# View today's statistics
node tracker.js stats

# View recent alerts
node tracker.js alerts
node tracker.js alerts 50  # last 50
```

## Alert Types

| Type | Threshold | Severity |
|------|-----------|----------|
| Large Liquidation | >$50K | Warning |
| Extreme Liquidation | >$100K | Critical |
| Cascade Event | 3+ liquidations totaling $100K+ in 1 min | Critical |

## Data Sources

Currently monitors Hyperliquid only (200k orders/sec, deep liquidity).

Future expansion planned:
- GMX (Arbitrum)
- dYdX v4
- Drift (Solana)
- Gains Network

## Output Files

- `data/YYYY-MM-DD.jsonl` - Daily liquidation logs
- `logs/alerts.jsonl` - Alert history

## Trading Implications

1. **Cascade during 2-5am UTC** = potential capitulation, watch for bounce
2. **Extreme liquidation + thin book** = volatility incoming
3. **Longs liquidating** = possible local bottom
4. **Shorts liquidating** = possible local top

## Configuration

Edit `CONFIG` in tracker.js:
```js
LARGE_LIQUIDATION_USD: 50000,      // Alert threshold
EXTREME_LIQUIDATION_USD: 100000,   // Critical alert
CASCADE_COUNT: 3,                  // Liquidations in window
CASCADE_VALUE_USD: 100000,         // Total value for cascade
POLL_INTERVAL_MS: 10000,           // 10 second polling
```

## Source

Based on liquidation-terminator's research from Moltbook + insights from TaoAgent and Starclawd-1 on liquidation patterns.
