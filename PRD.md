# PRD — DeFi Tools

> On-chain trading toolkit for AI agents. Momentum scanning, safety analysis, automated monitoring, and trade execution.

## Problem Statement

An AI agent needs a comprehensive toolkit for DeFi trading: discovering tokens, analyzing safety, tracking momentum, managing positions, and receiving alerts — all automated and composable.

## Target User

0xClaw AI agent (autonomous) and its human operator (Deadly) for oversight.

## What EXISTS (Built & Functional)

### Core Scanning & Analysis
- **Token Lookup** (`token-lookup.js`) — Price, volume, liquidity, FDV, safety scores via GoPlusLabs
- **Momentum Scanner** (`momentum-scanner/`) — DEXScreener buy/sell ratio signals, safety filtering (60+ score), multi-chain (Solana, Base), trend filtering, alerting
- **Token Safety** (`momentum-scanner/token-safety.js`) — Standalone honeypot detection, holder distribution, LP lock, contract verification
- **Fresh Token Scanner** (`monitors/fresh-token-scanner.js`, `monitors/dex-monitor.js`) — New token discovery

### Monitoring & Alerts
- **Alert Hub** (`alert-hub/`) — Unified alerting with dedup and Telegram routing
- **Price Alerts** (`price-alerts.js`) — Threshold and percentage-based alerts
- **Monitor Runner** (`monitor-runner.js`) — Runs all monitors together, supports `--quick` and `--json`
- **Account Tracker** (`monitors/account-tracker.js`) — Wallet activity tracking
- **Various monitors** — Signal scanner, ratio alerts, trend analyzer, auto-signals, auto-predict, minute logger

### Trading & Portfolio
- **Paper Trader** (`paper-trader.js`, `paper-trader-v2.js`) — Simulated trading with JSON state
- **Trade Journal** (`trade-journal/`) — Open/close positions, P&L tracking, win rate stats
- **Position Sizing** (`position-sizing.js`) — Risk-based sizing
- **Position Tracker** (`position-tracker.js`) — Track open positions
- **Portfolio Check** (`portfolio-check.js`) — Portfolio overview
- **Risk Manager** (`risk-manager.js`) — Risk controls

### On-Chain Execution
- **Base Swap** (`base-swap.js`) — Token swaps on Base
- **Base Executor** (`base-executor.js`) — Transaction execution
- **ENS Register** (`ens-register.js`) — ENS domain registration

### External Integrations
- **Funding Scanner** (`funding-scanner/`) — Perpetual DEX funding rates for arb
- **Liquidation Tracker** (`liquidation-tracker/`) — OI changes, extreme funding, cascade detection
- **Moltbook Watcher** (`moltbook-watcher/`) — New agent registration monitoring
- **Bounty Hunter** (`bounty-hunter/`) — AgentBountyBoard job claiming
- **x402 Client** (`x402-client/`) — x402 protocol payments between agents
- **Polymarket** (`polymarket/analyzer.js`) — Prediction market analysis
- **OpenWork** (`openwork/`, `openwork-client/`) — Agent marketplace integration
- **Wallet Tracker** (`wallet-tracker/`) — Smart money tracking

### Infrastructure
- **Healthcheck** (`healthcheck.js`) — System verification with `--fix`
- **Daily Digest** (`daily-digest.js`) — Comprehensive daily summary
- **Status Board** (`status-board/`) — Status dashboard
- **CLI** (`claw-cli.js`) — Command-line interface

### Research & Analysis
- **Research docs** (`research/`) — Hyperliquid funding arb, pump.fun mechanics, token watchlists, CT alpha tracking
- **Signal Backtest** (`signal-backtest.js`) — Backtesting signals
- **Alpha Crossref** (`alpha-crossref.js`) — Cross-referencing alpha sources
- **Anomaly Detector** (`anomaly-detector/`) — Pattern detection
- **SPY Gamma Backtest** (`analysis/spy-gamma-backtest.js`)

### Legacy/One-off
- **Atomic Rescue** (`atomic-rescue/`) — Wallet rescue via Flashbots (historical, used for compromised wallet)
- **Pattern Registry** (`pattern-registry.sol`) — Solidity contract for on-chain patterns

## What's REMAINING / Needs Improvement

### R1: Testing & Reliability
- No test suite exists — zero automated tests
- No CI/CD pipeline
- Scripts may have stale API endpoints or broken dependencies

### R2: Code Quality & Architecture
- Flat structure with many top-level scripts — needs better organization
- Duplicate/overlapping functionality (e.g., multiple scanner variants, paper-trader v1 vs v2)
- No shared config module — each script loads its own env vars
- No error handling standardization

### R3: Documentation
- README is comprehensive but may be outdated vs actual code
- Individual module READMEs exist but coverage is inconsistent
- No architecture diagram or dependency map

### R4: Operational Hardening
- Monitor cron jobs may need updating (`monitors/update-crons.sh`)
- Log rotation not implemented — logs grow unbounded
- No metrics or uptime tracking
- Alert fatigue — no smart throttling beyond basic dedup

### R5: Strategy & Automation
- Paper trading exists but no automated strategy execution
- Signal generation exists but no systematic backtesting pipeline
- No automated portfolio rebalancing
- Prediction verification exists but not integrated into feedback loop

## Out of Scope
- Building a web UI (status-board is sufficient)
- Multi-user support
- Mainnet trading automation without human approval

## Tech Stack
- **Runtime:** Node.js
- **Dependencies:** ethers v6, viem v2 (minimal)
- **Data:** JSON files, log files
- **Alerts:** Telegram bot
- **Chains:** Base, Solana
- **APIs:** DEXScreener, GoPlusLabs, Birdeye, Moltbook
