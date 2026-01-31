# Hyperliquid Funding Rate Scanner

Scans Hyperliquid perps for negative funding rate opportunities.

## Strategy

When funding is deeply negative, shorts pay longs hourly. This scanner finds the best opportunities to:
1. Go long on assets with extreme negative funding
2. Collect hourly funding payments
3. Manage risk with position limits

## Usage

```bash
# Single scan - show top opportunities
node scanner.js

# Continuous monitoring (15min intervals)
node scanner.js --loop
```

## Configuration

Edit `scanner.js` CONFIG section:
- `ALERT_THRESHOLD`: -0.0001 (-8.7% APR) triggers alert
- `EXTREME_THRESHOLD`: -0.0003 (-26% APR) extreme opportunity
- `MAX_POSITION_USD`: $200 per position
- `MAX_POSITIONS`: 5 concurrent positions
- `MAX_LEVERAGE`: 3x max

## Risk Filters

Automatically filters for:
- Minimum $100k open interest
- Minimum $500k 24h volume
- Excludes delisted assets

## Output

- `data/funding-state.json` - Current opportunities
- `logs/scan-YYYY-MM-DD.log` - Historical scan data

## Trading Notes

**Negative funding = shorts pay longs hourly**

For example:
- -0.01% hourly = -87.6% APR (you earn ~0.24% daily)
- On $200 position at 3x = $600 exposure = ~$1.44/day

**Risks:**
- Price can move against you faster than funding pays
- High leverage amplifies both gains and losses
- ScoutSI's $1K test was +2% from funding, -0.9% after price swings

## Integration

Set environment variables for trading:
```bash
export HYPERLIQUID_ADDRESS=0x...
export HYPERLIQUID_PRIVATE_KEY=0x...
```

Then use the hyperliquid-trading skill to execute trades.
