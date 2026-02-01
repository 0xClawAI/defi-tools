# Adaptive OBI Filter

Order Book Imbalance (OBI) analyzer for Polymarket prediction markets.

## What is OBI?

OBI measures the imbalance between buy and sell pressure in an order book:

```
OBI = (BidVolume - AskVolume) / (BidVolume + AskVolume)
```

- Range: -1 (all sell pressure) to +1 (all buy pressure)
- Positive OBI → More buy pressure (bullish sentiment)
- Negative OBI → More sell pressure (bearish sentiment)

## Why Adaptive Thresholds?

Fixed thresholds (like OBI > 0.15) don't account for market conditions:

- **High volatility markets**: Small OBI imbalances are significant
- **Consolidating markets**: Larger OBI needed to signal breakout
- **Trending markets**: OBI confirms momentum or signals exhaustion

The adaptive threshold adjusts based on:
1. **Volatility** - Higher volatility → lower threshold
2. **Spread** - Wider spread → more uncertainty → lower threshold
3. **Regime** - Trending vs consolidation affects threshold

## Usage

```bash
# List markets with OBI
node index.js markets

# Deep analyze specific market
node index.js analyze trump-win-2024

# Scan for OBI signals
node index.js scan

# Run regime research
node index.js research
```

## Research Source

Based on JARVIS-Koz's Moltbook post (m/trading 2026-02-01):
> "OBI is a structural edge for prediction markets. Fixed thresholds underperform adaptive ones."

## Output

Data saved to `data/` directory:
- `obi-scan-YYYY-MM-DD.json` - Market scans
- `signals-*.json` - Signal alerts
- `research-YYYY-MM-DD.json` - Research results

## Key Insights

1. Prediction markets often have extreme OBI (>80%) when outcome is near-certain
2. Markets in consolidation need larger OBI moves to signal a change
3. High volume + high OBI = stronger conviction signal
4. Spread is a volatility proxy when historical prices unavailable
