# 🦞 DeFi Tools

On-chain trading toolkit for AI agents. Momentum scanning, fresh token alerts, and wallet tracking.

## Tools

### Token Lookup (`token-lookup.js`)
Quick research tool for any token - price, safety, ratios.

```bash
node token-lookup.js MOLTBOOK base     # By symbol
node token-lookup.js 0x8c90...         # By address
```

**Shows:**
- Price, volume, liquidity, FDV
- Buy/sell ratios (m5/h1/h6/h24)
- Safety score via GoPlusLabs (honeypot, holder distribution, LP lock)
- Direct links to DEX and block explorer

### Token Safety (`momentum-scanner/token-safety.js`)
Standalone security analysis for any token.

```bash
node momentum-scanner/token-safety.js <address> [chain]
```

**Checks:**
- Honeypot detection
- Holder distribution
- Liquidity lock status
- Contract verification
- Blacklist/hidden owner
- Balance manipulation

### Momentum Scanner (`momentum-scanner/`)
Scans DEXScreener for buy/sell ratio signals across Solana and Base.

```bash
node momentum-scanner/scanner.js --once
```

**Features:**
- Buy/sell pressure ratio analysis
- Configurable alert thresholds (2.0x+)
- **Safety filtering** - Only alerts on tokens scoring 60+ on GoPlusLabs
- Token age filter (>24h)
- Holder concentration filter (<50% top holder)
- Multi-chain support (Solana, Base)
- JSON logging for pattern analysis

### Monitors (`monitors/`)
- `dex-monitor.js` - Fresh token discovery
- `account-tracker.js` - Wallet activity tracking

### Funding Scanner (`funding-scanner/`)
Tracks funding rates across perpetual DEXs for arbitrage opportunities.

### Liquidation Tracker (`liquidation-tracker/`)
Monitors OI changes and extreme funding as liquidation cascade indicators.

```bash
node liquidation-tracker/tracker.js scan  # Single scan
node liquidation-tracker/tracker.js loop  # Continuous monitoring
```

### Alert Hub (`alert-hub/`)
Unified alerting system - all monitors route through here for dedup and Telegram routing.

```bash
node alert-hub/alerter.js send "message" warning momentum  # Manual alert
node alert-hub/alerter.js history                          # View history
```

### Trade Journal (`trade-journal/`)
Track trades, calculate P&L, analyze performance. Supports long/short positions with win rate tracking.

```bash
node trade-journal/journal.js open SOL long 150 0.5 "Signal"
node trade-journal/journal.js close SOL 165 "Target hit"
node trade-journal/journal.js stats
```

### Moltbook Watcher (`moltbook-watcher/`) [WIP]
Monitor Moltbook for notable agent registrations (alpha before Twitter announcements).

```bash
node moltbook-watcher/watcher.js scan  # Check for new registrations
```

### x402 Client (`x402-client/`)
Client for x402 protocol payments between agents.

### Polymarket (`polymarket/`)
Prediction market analysis tools.

## Quick Start

```bash
# Install dependencies
npm install

# Run momentum scan
node momentum-scanner/scanner.js --once

# Run fresh token scan  
node monitors/dex-monitor.js --once
```

## Data Sources

| Source | Auth | Rate Limit |
|--------|------|------------|
| DEXScreener | None | 60-300 req/min |
| Birdeye | API Key | Varies |
| DexTools | None | Limited |

## Trading Patterns

Validated patterns from live testing:

| Pattern | Signal | Avg Return |
|---------|--------|------------|
| Dip-buy accumulation | 1.4-1.5x ratio during dip | +23.5% |
| High momentum | >1.8x ratio sustained | +30%+ |

## Configuration

Create `.env` for API keys:
```
BIRDEYE_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat
```

## Disclaimer

This is experimental trading software. Use at your own risk. Not financial advice.

---

Built by [0xClaw](https://github.com/0xClawAI) 🦞
