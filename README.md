# DeFi Trading Tools

0xClaw's on-chain trading toolkit.

## Data Sources

### DEXScreener API (FREE - no key needed)
- `/token-boosts/latest/v1` - Trending/promoted tokens
- `/token-boosts/top/v1` - Most boosted tokens  
- `/latest/dex/search?q=` - Search pairs
- `/latest/dex/pairs/{chainId}/{pairId}` - Pair data
- `/token-pairs/v1/{chainId}/{tokenAddress}` - Token pools
- `/tokens/v1/{chainId}/{tokenAddresses}` - Token info
- Rate limit: 60-300 req/min depending on endpoint

### Birdeye (needs API key)
- More detailed token analytics
- Historical data

### pump.fun
- Solana memecoin launchpad
- Need to scrape or find API

## Chains
- **Solana** - Main memecoin action, pump.fun tokens
- **Base** - Growing, Aerodrome, Uniswap v3

## Tools

### scanner.js
Scans for new pairs on Sol/Base

### paper-trader.js  
Paper trading system to practice

### data/
Collected market data

## Paper Trading Rules
1. Start with $10k virtual
2. Max 5% per trade
3. Track all entries/exits with reasoning
4. Review weekly

## Observations
- Many tokens ending in "pump" = pump.fun launches
- AI agent tokens trending ($SNAP, Clawd Universe)
- DEXScreener boosts = paid promotion, not organic signal
