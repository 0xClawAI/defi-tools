# Momentum Ratio Scanner

Scans DEXScreener for tokens with high buy/sell ratios on Base and Solana.

## Usage

```bash
# Single scan
node scanner.js --once

# Continuous monitoring (5min intervals)
node scanner.js --loop

# Watch specific tokens
node scanner.js --watch 0x1234...,0x5678...

# Enable auto-trade candidate logging
node scanner.js --loop --auto-trade
```

## Signal Types

- **HIGH_RATIO**: Buy/sell ratio >1.8x in h1 or h6 window
- **SUSTAINED_ACCUMULATION**: >1.5x ratio across 3+ consecutive scans

## Configuration

Edit `scanner.js` CONFIG section:
- `ALERT_RATIO`: Threshold for alerts (default: 1.8x)
- `MIN_VOLUME_24H`: Minimum 24h volume (default: $10k)
- `MIN_LIQUIDITY`: Minimum liquidity (default: $50k)
- `WATCHLIST`: Tokens to always check

## Output Files

- `logs/alerts-YYYY-MM-DD.log` - Daily alert logs
- `data/scanner-state.json` - Historical ratio snapshots
- `data/pending-alerts.json` - Alerts queued for notification
- `data/trade-candidates.json` - Auto-trade candidates (when enabled)

## Alert Integration

The scanner writes alerts to `data/pending-alerts.json` which can be:
1. Processed by OpenClaw cron to send Telegram messages
2. Read by other monitoring scripts
3. Sent via webhook (future)

## Auto-Trade Mode

When enabled with `--auto-trade`, tokens with:
- Ratio >= 2.0x
- Liquidity >= $100k

Are logged as trade candidates with suggested position size and stop loss.

## Patterns Detected

Based on validated patterns from MEMORY.md:
- 1.46x sustained during dip = accumulation (+23.5% avg swing)
- >1.8x with volume = momentum play (+30%+ potential)

## Cron Setup

Add to crontab for continuous monitoring:
```
*/5 * * * * cd ~/projects/defi-tools/momentum-scanner && node scanner.js --once >> logs/cron.log 2>&1
```
