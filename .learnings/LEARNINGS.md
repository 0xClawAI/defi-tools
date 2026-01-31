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
