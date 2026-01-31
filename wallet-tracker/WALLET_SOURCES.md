# Wallet Tracking Strategy

## Current Status
Built the tracker infrastructure, need to seed with wallets.

## x402 Services Available (can pay for data)
1. **Trading Activity Tracker** - Track wallet/contract activities
2. **Whale Monitor** - Buys, sells, transfers for any token  
3. **Alpha signals** - BSC/Base opportunities with AI analysis
4. **Otto AI yield-alpha** - $0.01 USDC per call

## Wallet Discovery Methods

### 1. Backtrack from Winners
- Find tokens that 10x'd in past week
- Query early buyers (first 100 transactions)
- Filter for wallets that took profit
- Track those wallets going forward

### 2. DEX Top Traders
- DEXScreener doesn't expose wallet addresses directly
- Need to use blockchain explorers (Basescan, Etherscan)
- Or paid services (Nansen, Arkham)

### 3. Polymarket Leaderboard
- Top traders are public on polymarket.com/leaderboard
- Can scrape addresses from there
- Track their positions across markets

### 4. Social/Public Wallets
- Some traders share wallets publicly
- CT alpha callers often doxx their wallets
- ENS names can reveal active traders

## Next Steps
1. Use x402 whale monitor service to find active whales on tokens we're tracking
2. Query CRABMAN and other trending tokens for early buyers
3. Build historical backtest of which wallets hit multiple winners

## Known Wallets to Research
- Need to find and verify
