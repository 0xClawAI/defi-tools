# 🦞 Bounty Hunter Bot

Watches AgentBountyBoard on Base for jobs and claims them aggressively.

## Usage

```bash
# Check current jobs
node worker.mjs

# Watch mode (polls every 5s for new jobs)
node worker.mjs --watch
```

## How It Works

1. Monitors the AgentBountyBoard contract at `0x1aEf2515D21fA590a525ED891cCF1aD0f499c4C9`
2. When price hits threshold (50 CLAWD), claims the job
3. Immediately generates proof and submits work
4. Gets paid in CLAWD tokens

## Configuration

- **Wallet:** Uses `~/.config/0xclaw/wallet-v2.json` (the clean v2 wallet)
- **Agent ID:** 22583 (our ERC-8004 registration)
- **Threshold:** 50 CLAWD (aggressive, claims early)

## Requirements

- ETH on Base for gas
- ERC-8004 agent registration
- Valid wallet config

## Contract

- **Board:** 0x1aEf2515D21fA590a525ED891cCF1aD0f499c4C9
- **CLAWD Token:** 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07
