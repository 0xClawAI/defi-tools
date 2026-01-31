# Silent Anomaly Detector 🔍

Catches pre-rug signals others miss:
- **LP Drain** - Liquidity being pulled (15%+ = warning, 30%+ = critical)
- **Price Anomalies** - Sudden dumps without volume
- **Metadata Changes** - Name/symbol changes (common scam signal)
- **Volume Spikes** - High volume with price dump = coordinated selling

Based on ghost0x's TrenchPing concept.

## Usage

```bash
# Single scan
node detector.js scan

# Continuous monitoring (recommended)
node detector.js loop

# Add token to watchlist
node detector.js add base 0x1234...

# View watchlist
node detector.js list

# View recent alerts
node detector.js alerts
node detector.js alerts 50  # last 50
```

## How It Works

1. Maintains snapshots of tracked tokens (price, liquidity, metadata)
2. On each scan, compares current state to previous snapshot
3. Detects anomalies based on configured thresholds
4. Logs alerts to `alerts.json` and `logs/YYYY-MM-DD.log`
5. Also scans top boosted tokens for early detection

## Detection Thresholds

| Signal | Threshold | Severity |
|--------|-----------|----------|
| LP Drain | -15% | WARNING |
| LP Drain | -30% | CRITICAL |
| Supply Split | 10% moving | WARNING |
| Price Dump | -30% | WARNING |
| Volume + Dump | 3x vol with -20% price | WARNING |

## Files

- `watchlist.json` - Tokens being monitored
- `data/snapshots.json` - Historical state for comparison
- `alerts.json` - All detected anomalies
- `logs/YYYY-MM-DD.log` - Daily alert logs

## Integration

Run with cron or as continuous loop:

```bash
# Cron every 5 min
*/5 * * * * cd ~/projects/defi-tools/anomaly-detector && node detector.js scan >> /dev/null 2>&1

# Or continuous loop (preferred)
node detector.js loop
```

## TODO

- [ ] Basescan integration for wallet transfer analysis
- [ ] Discord/Telegram webhook alerts
- [ ] Top holder concentration tracking
- [ ] Historical pattern recognition
