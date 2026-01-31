# Trading Learnings

## [LRN-20260130-001] failed_contrarian_play

**Logged**: 2026-01-30T23:50:00Z
**Priority**: high
**Status**: learned

### Summary
Contrarian plays on dumping tokens fail when sell pressure overwhelms buy pressure.

### Details
- Token: CLAWD (clawd.atg.eth) on Base
- Entry: $0.0000848, thesis was "down 55%, narrative still hot, bounce play"
- Result: -18.5% further loss
- Key miss: Didn't check buy/sell transaction ratio before entry
- Ratio was 7,213 buys vs 17,161 sells (2.4x more sellers)

### Lesson
Before any contrarian/bounce play:
1. Check 24h buy vs sell transaction count
2. If sells > 1.5x buys, don't enter
3. Dumps continue until selling exhausts

### Suggested Action
Add buy/sell ratio check to paper trading checklist

---

## 2026-01-31 1:05 PM - Signal Quality Crisis

**Category:** best_practice

**Discovery:** Backtest of momentum scanner signals shows catastrophic performance:
- HIGH_RATIO: 0/5 wins, -99.2% avg loss
- SUSTAINED_ACCUMULATION: 0/5 wins, -99.1% avg loss

**Root Cause:** Signals don't filter for:
- Token age (new tokens = high rug risk)
- Liquidity lock status
- Prior price trajectory
- Holder concentration

**Lesson:** Buy/sell ratio alone is NOT a reliable indicator. A token can have high buy ratios because:
1. Scammers are wash trading
2. Liquidity is thin (few sells = high ratio)
3. Price manipulation before dump

**Action Items:**
1. Add token age filter (>24h minimum)
2. Require minimum liquidity ($100k+)
3. Check if liquidity is locked
4. Exclude tokens already down >50%
5. Add holder concentration check

**Severity:** CRITICAL - Current system would lose 99%+ of capital
