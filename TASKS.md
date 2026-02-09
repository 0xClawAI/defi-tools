# TASKS.md — DeFi Tools

> Last updated: 2026-02-09T10:30:00-08:00
> Status: Active (migrated from existing codebase)
> Progress: 20/28 tasks complete

---

## Milestones

- **M1: Core Scanning Works** — Tasks: T-001, T-002, T-003, T-004
- **M2: Monitoring & Alerts** — Tasks: T-005, T-006, T-007, T-008
- **M3: Trading & Portfolio** — Tasks: T-009, T-010, T-011, T-012, T-013
- **M4: External Integrations** — Tasks: T-014, T-015, T-016, T-017, T-018, T-019
- **M5: Infrastructure** — Tasks: T-020, T-021, T-022
- **M6: Code Quality** — Tasks: T-023, T-024, T-025
- **M7: Operational Hardening** — Tasks: T-026, T-027, T-028

---

## Phase 1: Core Scanning & Analysis
**Goal:** Token discovery, safety analysis, and momentum signals working reliably
**Exit when:** All scanning tools run without errors and produce valid output

### T-001: Token Lookup
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** none
- **Pass criteria:**
  - [x] `node token-lookup.js <symbol> <chain>` returns price, volume, liquidity, FDV
  - [x] Safety score via GoPlusLabs included in output
  - [x] Supports lookup by symbol and by address

### T-002: Momentum Scanner
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** none
- **Pass criteria:**
  - [x] `node momentum-scanner/scanner.js --once` completes without errors
  - [x] Buy/sell ratio analysis with configurable thresholds (2.0x+)
  - [x] Safety filtering — only alerts on tokens scoring 60+
  - [x] Multi-chain support (Solana, Base)
  - [x] JSON logging for pattern analysis

### T-003: Token Safety Analysis
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** none
- **Pass criteria:**
  - [x] `node momentum-scanner/token-safety.js <address>` returns safety report
  - [x] Checks honeypot, holder distribution, LP lock, contract verification

### T-004: Fresh Token Scanner
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M1
- **Depends:** none
- **Pass criteria:**
  - [x] `node monitors/dex-monitor.js --once` discovers new tokens
  - [x] `node monitors/fresh-token-scanner.js` runs without errors

## Phase 2: Monitoring & Alerts
**Goal:** Unified alerting, price monitoring, and comprehensive monitor orchestration

### T-005: Alert Hub
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** none
- **Pass criteria:**
  - [x] `node alert-hub/alerter.js send "test" warning momentum` sends alert
  - [x] Dedup prevents duplicate alerts
  - [x] Telegram routing works

### T-006: Price Alerts
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** none
- **Pass criteria:**
  - [x] `node price-alerts.js add ETH base 2000 4000` creates alert
  - [x] `node price-alerts.js check` evaluates all alerts
  - [x] Supports threshold and percentage modes

### T-007: Monitor Runner
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** T-001, T-002, T-004
- **Pass criteria:**
  - [x] `node monitor-runner.js` runs all monitors
  - [x] `--quick` and `--json` flags work

### T-008: Account Tracker
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M2
- **Depends:** none
- **Pass criteria:**
  - [x] `node monitors/account-tracker.js` tracks wallet activity

## Phase 3: Trading & Portfolio
**Goal:** Paper trading, position management, and trade journaling

### T-009: Paper Trader
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [x] Paper trading with JSON state persistence
  - [x] V2 exists with improvements

### T-010: Trade Journal
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [x] `node trade-journal/journal.js open SOL long 150 0.5 "reason"` opens position
  - [x] `node trade-journal/journal.js stats` shows P&L and win rate

### T-011: Position Sizing & Risk
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [x] `position-sizing.js` and `risk-manager.js` exist and provide risk calculations

### T-012: Base Swap Execution
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [x] `base-swap.js` can execute token swaps on Base
  - [x] `base-executor.js` handles transaction execution

### T-013: Portfolio Tracking
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M3
- **Depends:** none
- **Pass criteria:**
  - [x] `portfolio-check.js` shows portfolio overview
  - [x] `position-tracker.js` tracks open positions

## Phase 4: External Integrations
**Goal:** Connected to funding rates, liquidation data, Moltbook, bounties, x402, Polymarket

### T-014: Funding Scanner
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M4
- **Depends:** none
- **Pass criteria:**
  - [x] `node funding-scanner/scanner.js` fetches funding rates from perp DEXs

### T-015: Liquidation Tracker
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M4
- **Depends:** none
- **Pass criteria:**
  - [x] `node liquidation-tracker/tracker.js scan` runs single scan
  - [x] `node liquidation-tracker/tracker.js loop` runs continuously

### T-016: Moltbook Watcher
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M4
- **Depends:** none
- **Pass criteria:**
  - [x] `node moltbook-watcher/watcher.js scan` checks for new agents
  - [x] Notable agent filtering (1k+ followers)

### T-017: Bounty Hunter
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M4
- **Depends:** none
- **Pass criteria:**
  - [x] `node bounty-hunter/worker.mjs` checks AgentBountyBoard jobs

### T-018: x402 Client
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M4
- **Depends:** none
- **Pass criteria:**
  - [x] `x402-client/client.js` handles x402 protocol payments

### T-019: Wallet Tracker
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M4
- **Depends:** none
- **Pass criteria:**
  - [x] `wallet-tracker/tracker.js` tracks wallets
  - [x] Smart money detection via `find-smart-money.js`

## Phase 5: Infrastructure
**Goal:** System health, daily summaries, and CLI

### T-020: Healthcheck
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M5
- **Depends:** none
- **Pass criteria:**
  - [x] `node healthcheck.js` verifies all tools
  - [x] `--fix` auto-fixes common issues

### T-021: Daily Digest
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M5
- **Depends:** none
- **Pass criteria:**
  - [x] `node daily-digest.js` produces comprehensive summary
  - [x] `--telegram` and `--brief` flags work

### T-022: CLI Interface
- **Type:** code
- **Status:** ✅ done
- **Milestone:** M5
- **Depends:** none
- **Pass criteria:**
  - [x] `node claw-cli.js` provides command-line access to tools

## Phase 6: Code Quality (Remaining Work)
**Goal:** Automated tests, shared config, cleanup of duplicates

### T-023: Add Test Suite
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M6
- **Depends:** none
- **Pass criteria:**
  - [ ] `npm test` runs and passes
  - [ ] At least 1 test per major module (token-lookup, momentum-scanner, alert-hub, trade-journal, price-alerts)
  - [ ] Tests use mocked API responses (no live API calls in tests)
  - [ ] Test runner is lightweight (tape, node:test, or similar — no jest)

### T-024: Shared Config Module
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M6
- **Depends:** none
- **Pass criteria:**
  - [ ] Single `lib/config.js` loads all env vars and wallet config
  - [ ] At least 5 scripts import from `lib/config.js` instead of inline env loading
  - [ ] Config validates required vars on load and throws descriptive error if missing

### T-025: Consolidate Duplicate Scripts
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M6
- **Depends:** T-024
- **Pass criteria:**
  - [ ] `paper-trader.js` removed; `paper-trader-v2.js` renamed to `paper-trader.js`
  - [ ] `scanner.js` (root) removed or merged into `momentum-scanner/scanner.js`
  - [ ] No two scripts with >50% overlapping functionality
  - [ ] README updated to reflect consolidated tools

## Phase 7: Operational Hardening (Remaining Work)
**Goal:** Production-grade reliability: log rotation, metrics, alert throttling

### T-026: Log Rotation
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M7
- **Depends:** none
- **Pass criteria:**
  - [ ] Log files in `monitors/logs/` are rotated daily (or by size, max 10MB)
  - [ ] Old logs compressed or deleted after 7 days
  - [ ] Rotation runs automatically (cron or built-in)

### T-027: Uptime & Error Metrics
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M7
- **Depends:** T-020
- **Pass criteria:**
  - [ ] `healthcheck.js` writes results to `metrics.json` with timestamp
  - [ ] Metrics include: last successful run per monitor, error count last 24h
  - [ ] `node healthcheck.js --metrics` outputs JSON summary

### T-028: Smart Alert Throttling
- **Type:** code
- **Status:** ⬜ todo
- **Milestone:** M7
- **Depends:** T-005
- **Pass criteria:**
  - [ ] Alert hub implements rate limiting: max 10 alerts per hour per category
  - [ ] Escalation: if >5 alerts suppressed, send summary digest instead
  - [ ] Throttle config is adjustable in `alert-hub/config.json`
