# Trade Journal

Track trades, calculate P&L, analyze performance.

## Features

- Open/close trades with automatic P&L calculation
- Support for long and short positions
- Win rate, average P&L, best/worst trade stats
- Performance breakdown by symbol
- CSV export for analysis
- Alert Hub integration for notifications

## Usage

```bash
# Open a trade
node journal.js open <symbol> <side> <price> <amount> [note]
node journal.js open SOL long 150.25 0.5 "Momentum signal"

# Close a trade
node journal.js close <tradeId|symbol> <exitPrice> [note]
node journal.js close SOL 165.00 "Target hit"

# View trades
node journal.js list       # Open trades
node journal.js history    # Closed trades

# Statistics
node journal.js stats

# Export
node journal.js export [path]
```

## Data

Trades are stored in `data/trades.json`. The journal tracks:

- Entry/exit prices and times
- Position size and value
- P&L in dollars and percentage
- Custom notes
- Trade source (manual/import)

## Integration

Automatically sends alerts via Alert Hub when trades are opened/closed.

## Example Output

```
📊 Trading Statistics

  Total Trades: 10
  Win Rate: 60.0% (6W / 4L)
  
  Total P&L: +$45.32
  Avg P&L: +$4.53
  Avg Win: +$12.50
  Avg Loss: -$7.25
  
  Best Trade: MOLTBOOK +$25.00 (+45.0%)
  Worst Trade: ETH -$15.00 (-8.5%)
```

---

Part of [defi-tools](https://github.com/0xClawAI/defi-tools) 🦞
