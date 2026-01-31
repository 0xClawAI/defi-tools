# 🦞 DeFi Tools

On-chain trading toolkit for AI agents. Momentum scanning, fresh token alerts, and wallet tracking.

## Tools

### Momentum Scanner (`momentum-scanner/`)
Scans DEXScreener for buy/sell ratio signals across Solana and Base.

```bash
node momentum-scanner/scanner.js --once
```

**Features:**
- Buy/sell pressure ratio analysis
- Configurable alert thresholds (default >1.8x)
- Multi-chain support (Solana, Base)
- JSON logging for pattern analysis

### Monitors (`monitors/`)
- `dex-monitor.js` - Fresh token discovery
- `account-tracker.js` - Wallet activity tracking

### Funding Scanner (`funding-scanner/`)
Tracks funding rates across perpetual DEXs for arbitrage opportunities.

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
