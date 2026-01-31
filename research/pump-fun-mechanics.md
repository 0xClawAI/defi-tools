# Pump.fun: Mechanics and Fee Structure

## Overview

**Pump.fun** is a cryptocurrency launchpad built on the Solana blockchain that enables anyone to create tokens and trade them immediately. Often described as "the ground zero for launching meme coins" and compared to 4chan for its anonymous, imageboard-style interface.

- **Launched**: January 19, 2024
- **Founders**: Noah Tweedale, Alon Cohen, Dylan Kerler (UK-based entrepreneurs, early 20s)
- **Blockchain**: Solana
- **Initial Funding**: $350,000 from Alliance DAO (Web3 accelerator)
- **Website**: https://pump.fun

### Key Stats (as of Jan 2025)
- Over **6 million meme coins** launched on the platform
- **40,000-50,000** new tokens created daily
- Generated nearly **$800 million** in cumulative revenue
- ICO (July 2025) raised **$1.3 billion** ($600M public sale in 12 minutes + $720M private)

---

## Token Creation Process

Creating a token on pump.fun is remarkably simple:

1. **Upload an image** (token logo/meme)
2. **Choose a ticker** (e.g., JAIL, FART, GOAT)
3. **Pick a name** for the token
4. **Pay creation fee** (~$2 or less in SOL)
5. **Token is live** and immediately tradeable

That's it. No coding, no smart contract deployment, no liquidity provision required from the creator.

### Why This Matters
Traditional token launches required:
- Creating a **liquidity pool** ($1,000-$5,000+ upfront)
- Smart contract development knowledge
- Managing liquidity pair with established tokens (ETH, SOL, etc.)

Pump.fun eliminated all barriers by using a **bonding curve** model instead.

---

## The Bonding Curve Model

### What is a Bonding Curve?

A bonding curve is a mathematical formula that determines token price based on supply. Unlike traditional AMMs that require liquidity pools, pump.fun's bonding curve creates **simulated liquidity**.

### How Pump.fun's Bonding Curve Works

```
Price = f(supply)
```

- **Initial State**: Every new token starts at a market cap of **$5,000**
- **No Real Backing**: This initial "value" is created out of thin air—entirely simulated
- **Dynamic Pricing**: Price adjusts automatically based on buy/sell activity
- **Supply-Demand Mechanics**: 
  - More buys → price increases along the curve
  - More sells → price decreases along the curve

### Key Characteristics

| Aspect | Traditional AMM | Pump.fun Bonding Curve |
|--------|----------------|------------------------|
| Initial Liquidity | $1,000-$5,000 required | $0 required |
| Price Discovery | Liquidity pool ratio | Mathematical formula |
| Creator Risk | Capital at risk | Minimal upfront cost |
| Rug Pull Vector | Liquidity drain | Reduced (no pool to drain) |

### The Curve Shape

Pump.fun uses a **convex bonding curve**, meaning:
- Early buyers get tokens at lower prices
- As demand increases, each subsequent token costs more
- Price acceleration rewards early participants
- Creates strong incentive for early entry

---

## Graduation Mechanics

"Graduation" is the process by which a pump.fun token transitions to a real decentralized exchange.

### Graduation Threshold

A token graduates when it reaches a market cap of **$90,000** on the bonding curve.

### What Happens at Graduation

1. **Liquidity Migration**: Real liquidity (in SOL) accumulated from buys is migrated
2. **Raydium Listing**: Token automatically lists on **Raydium** (Solana's largest DEX)
3. **Real Trading**: Token can now be traded in traditional AMM pools
4. **Fee Payment**: Pump.fun collects 1.5 SOL graduation fee

### Graduation Statistics

- **Graduation rate**: ~1.5% of all tokens created
- **Daily graduates**: Approximately **340 tokens** per day
- **Post-graduation**: Tokens can pursue listings on CEXs like Coinbase, Binance

### The Graduation Funnel

```
Tokens Created (40,000-50,000/day)
        ↓ (~1.5% graduate)
   Raydium Listing (340/day)
        ↓ (very few)
     CEX Listings
        ↓ (rare)
   Mainstream Success
```

---

## Fee Structure

### 1. Token Creation Fee
- **Cost**: Less than $2 (paid in SOL)
- **Purpose**: Covers Solana transaction fees
- **Goes to**: Solana network validators

### 2. Swap Fee (Trading Fee)
- **Rate**: **1%** of all trades
- **When**: Every buy or sell on the bonding curve
- **Goes to**: Pump.fun treasury
- **Volume**: Over $100 million worth of meme coins traded daily

### 3. Graduation Fee
- **Cost**: **1.5 SOL** (~$350 at typical prices)
- **When**: Token reaches $90,000 market cap and migrates to Raydium
- **Goes to**: Pump.fun treasury

### Revenue Breakdown

| Fee Type | Rate/Amount | Trigger |
|----------|-------------|---------|
| Creation | ~$2 | Token creation |
| Swap | 1% | Every trade |
| Graduation | 1.5 SOL | $90K market cap |

### Revenue Performance
- **First half of 2024**: ~$60 million in transaction fees
- **By November 2024**: Over $250 million cumulative revenue
- **Lifetime (as of Jan 2025)**: Nearly $800 million

---

## Risk Factors & Considerations

### Platform-Level Protections
- **No liquidity pools** = reduced rug pull vector (can't drain liquidity)
- **Fair launch model** = all tokens minted at once, no presales
- **Transparency tools** = shows % owned by largest holders

### Remaining Risks

| Risk Type | Prevalence | Description |
|-----------|------------|-------------|
| Pump-and-Dump | ~40% | Coordinated buy/sell schemes |
| Soft Rug Pulls | ~30% | Creators dump holdings after price rise |
| Bot Manipulation | High | AI bots front-running and manipulating |
| Volatility | Extreme | 50x more volatile than Bitcoin |
| Short Lifespan | Average 78 min | Most tokens worthless within hours |

### What Pump.fun Cannot Prevent
- Creators dumping their holdings ("soft rug")
- Coordinated shill campaigns
- Celebrity endorsement exits
- Bot-driven price manipulation

---

## Notable Tokens Launched on Pump.fun

| Token | Peak Market Cap | Notes |
|-------|----------------|-------|
| Fartcoin | $1 billion | One of the most successful graduates |
| GOAT (Goatseus Maximus) | $840 million | AI-promoted meme coin |
| Dogwifhat (WIF) | $3.1 billion | Dog wearing a hat meme |
| MooDeng | ~$500 million | Viral hippo meme |
| PNUT | Varies | Subject of lawsuit in Jan 2025 |

### Celebrity Launches
- **Iggy Azalea** - authorized meme coin
- **Caitlyn Jenner** - authorized meme coin  
- **Jason Derulo** - authorized meme coin

---

## Technical Architecture

### Solana Choice
Pump.fun chose Solana over Ethereum for:
- **Speed**: Sub-second transaction finality
- **Cost**: Fraction of a cent per transaction
- **Throughput**: Handles high-frequency meme trading
- **Ecosystem**: Integration with Raydium for graduation

### On-Chain Components
- **Program ID**: Pump.fun smart contract on Solana
- **Bonding curve logic**: Calculates prices programmatically
- **Migration logic**: Handles Raydium liquidity provision

### Off-Chain Components
- **Web interface**: Token creation wizard
- **Social features**: Comments, profiles (by wallet address)
- **Livestreaming** (suspended Nov 2024, relaunched Apr 2025)

---

## Regulatory Status

### Current Situation
- **UK**: Banned in December 2024 after FCA warning
- **US**: Lawsuit filed in Southern District of NY (Jan 2025)
  - Claim: Operates as unregistered securities exchange
  - Status: Ongoing

### Legal Perspective
Meme coins generally don't qualify as securities because:
- No promises of future profits from developers
- Value based on speculation, not underlying business
- No expectation of managerial efforts

However, this doesn't exempt from:
- Fraud laws
- Misrepresentation claims
- Market manipulation regulations

---

## Comparison: Pump.fun vs Alternatives

| Feature | Pump.fun | Traditional Launchpad | Uniswap/DEX |
|---------|----------|----------------------|-------------|
| Chain | Solana | Various | Ethereum/L2 |
| Creation Cost | ~$2 | $100-$1000+ | $50-$200 |
| Liquidity Required | None | Yes | Yes |
| Time to Trade | Instant | Hours-Days | Minutes |
| Graduation Path | Raydium | Varies | N/A |
| Fair Launch | Yes | Sometimes | No |

---

## Key Takeaways

1. **Democratized Token Creation**: Anyone can launch a token in minutes for under $2
2. **Bonding Curve Innovation**: Eliminates need for liquidity pools and reduces certain rug vectors
3. **Graduation Model**: Creates path from meme to mainstream via Raydium
4. **Fee Model**: 1% swap fee + 1.5 SOL graduation fee = massive revenue at scale
5. **High Risk**: Most tokens fail within minutes; significant fraud/manipulation remains
6. **Regulatory Uncertainty**: Legal challenges emerging, UK already banned

---

## Sources

- Wikipedia: Pump.fun
- Forbes: "Inside the wild money machine fueling crypto's stupidest bubble" (November 2024)
- Bloomberg: Various coverage (2024-2025)
- Wired: "The Madcap Rise of the Memecoin Factory Pump.fun" (January 2025)
- Ars Technica: Coverage of platform growth
- New York Times: "A Digital Coin Based on Baby Trump? Yup" (July 2024)

---

*Last Updated: January 2026*
*Research for: DeFi Tools Project*
