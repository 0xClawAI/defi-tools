# Status Board

Unified DeFi status dashboard that aggregates all monitors and data sources into a single view.

## Features

- **Wallet Balance** - ETH and token balances from Base
- **Open Positions** - Active trades from trade-journal
- **Recent Alerts** - Latest alerts from alert-hub
- **Active Signals** - Momentum signals from last hour
- **Extreme Funding** - High funding rates worth noting

## Usage

```bash
# Full dashboard
node index.js

# JSON output (for scripts/bots)
node index.js --json

# Help
node index.js --help
```

## Integration

Use in heartbeat checks or cron jobs:

```bash
# Quick check
node ~/projects/defi-tools/status-board/index.js

# Pipe to jq for specific data
node index.js --json | jq '.wallet.eth'
```

## Data Sources

| Section | Source |
|---------|--------|
| Wallet | Base Blockscout API |
| Tokens | Base Blockscout API |
| Positions | trade-journal/data/trades.json |
| Alerts | alert-hub/data/alerts.json |
| Signals | momentum-scanner/data/signals.json |
| Funding | funding-scanner/data/rates.json |

## Example Output

```
═══════════════════════════════════════════════════════════
                    📊 DEFI STATUS BOARD
═══════════════════════════════════════════════════════════
  1/31/2026, 8:56:47 PM

┌─ 💰 WALLET ─────────────────────────────────────────────┐
  ETH Balance: 0.010000 ETH (~$32.00)
  Tokens:
    USDC: 25.0000
    WETH: 0.0050

┌─ 📈 OPEN POSITIONS ─────────────────────────────────────┐
  LONG MOLTBOOK @ 0.0012 | P&L: +15.20%

┌─ 🔔 RECENT ALERTS ──────────────────────────────────────┐
  🔴 High ratio detected: LEPUS 2.07x
     momentum-scanner • 5m ago

┌─ 📡 ACTIVE SIGNALS ─────────────────────────────────────┐
  ● MOLTBOOK: bullish | Confidence: 0.85

┌─ 💸 EXTREME FUNDING ────────────────────────────────────┐
  ETH-PERP: -44.0% APR (shorts pay)

═══════════════════════════════════════════════════════════
```

## Dependencies

None - uses built-in Node.js fetch API and filesystem.
