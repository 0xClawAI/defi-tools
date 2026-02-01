# Security Audit: SimpleStaking Contract

## Executive Summary

This audit identifies **7 vulnerabilities** across severity levels in the SimpleStaking contract. The most critical issues allow complete fund drainage and manipulation of the reward system.

---

## 1. Critical Issues

### 1.1 Unrestricted `setRewardRate` — Anyone Can Drain Contract

**Severity:** CRITICAL  
**Location:** `setRewardRate(uint256 _rate)`

```solidity
function setRewardRate(uint256 _rate) external { rewardRate = _rate; }
```

**Issue:** No access control. Any address can set `rewardRate` to an arbitrarily high value (e.g., `10^18`), then withdraw with massive fraudulent rewards.

**Impact:** Complete fund drainage. Attacker stakes 1 wei, sets rate to max, waits 1 second, withdraws all contract tokens.

**Recommendation:**
```solidity
address public owner;
modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
function setRewardRate(uint256 _rate) external onlyOwner { rewardRate = _rate; }
```

---

### 1.2 Reentrancy in `withdraw()`

**Severity:** CRITICAL  
**Location:** `withdraw()`

```solidity
function withdraw() external {
    uint256 amount = staked[msg.sender];
    uint256 reward = ...;
    staked[msg.sender] = 0;  // State update
    token.transfer(msg.sender, amount + reward);  // External call
}
```

**Issue:** State updated before external call, but if `token` is a malicious ERC20 with a callback (or ERC777), attacker can reenter before state is zeroed.

**Wait, that's not quite right—** state IS zeroed before transfer. Let me reconsider.

Actually, this follows CEI (Checks-Effects-Interactions), so it's NOT vulnerable to standard reentrancy. I'll revise:

**Revised Issue:** While CEI is followed, using `transfer()` instead of `safeTransfer()` means failures aren't handled. Also, `stakedAt` isn't reset, allowing potential edge cases.

**Recommendation:** Use OpenZeppelin's `SafeERC20.safeTransfer()` and add ReentrancyGuard as defense-in-depth:
```solidity
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
using SafeERC20 for IERC20;
// In withdraw:
stakedAt[msg.sender] = 0;  // Reset timestamp too
token.safeTransfer(msg.sender, amount + reward);
```

---

## 2. High Issues

### 2.1 Reward Calculation Underflow / Overflow

**Severity:** HIGH  
**Location:** `withdraw()` reward calculation

```solidity
uint256 reward = (amount * rewardRate * (block.timestamp - stakedAt[msg.sender])) / (86400 * 10000);
```

**Issue:** If `amount * rewardRate * timeDelta` exceeds `2^256 - 1`, it overflows (Solidity 0.8+ reverts, but rewards become unclaimable). With high `rewardRate`, users may be permanently locked out.

**Impact:** Users with large stakes + high reward rate + long stake duration = locked funds.

**Recommendation:**
```solidity
uint256 timeDelta = block.timestamp - stakedAt[msg.sender];
uint256 reward = (amount / 86400) * (rewardRate / 10000) * timeDelta;
// Or use a maximum cap
require(reward <= type(uint128).max, "Reward overflow");
```

---

### 2.2 Unfunded Rewards — Contract Can Go Insolvent

**Severity:** HIGH  

**Issue:** Contract mints rewards from thin air. If total staked + rewards exceed contract's token balance, later withdrawers get nothing.

**Example:** 
- Alice stakes 1000 tokens
- Bob stakes 1000 tokens  
- Contract holds 2000 tokens
- After 1 year at 100 bps rate, each earned ~3.65 tokens
- Alice withdraws 1003.65 → success
- Bob tries to withdraw 1003.65 → FAILS (contract only has 996.35)

**Recommendation:**
```solidity
uint256 public rewardsReserve;
function depositRewards(uint256 amount) external onlyOwner {
    token.transferFrom(msg.sender, address(this), amount);
    rewardsReserve += amount;
}
function withdraw() external {
    ...
    require(reward <= rewardsReserve, "Insufficient rewards");
    rewardsReserve -= reward;
    ...
}
```

---

## 3. Medium Issues

### 3.1 Stake Timestamp Reset on Additional Stakes

**Severity:** MEDIUM  
**Location:** `stake()`

```solidity
function stake(uint256 amount) external {
    ...
    staked[msg.sender] += amount;
    stakedAt[msg.sender] = block.timestamp;  // Resets every time!
}
```

**Issue:** If a user stakes again, their accumulated rewards from the first stake are lost (timestamp reset).

**Impact:** Users lose earned rewards when adding to stake.

**Recommendation:**
```solidity
function stake(uint256 amount) external {
    // Claim pending rewards first
    if (staked[msg.sender] > 0) {
        _claimRewards(msg.sender);
    }
    staked[msg.sender] += amount;
    stakedAt[msg.sender] = block.timestamp;
    token.transferFrom(msg.sender, address(this), amount);
}
```

---

### 3.2 No Zero-Amount Protection

**Severity:** MEDIUM  
**Location:** `stake()`, `withdraw()`

**Issue:** Users can stake 0 tokens (wasting gas, polluting state) or withdraw with 0 stake (gets 0 but wastes gas).

**Recommendation:**
```solidity
require(amount > 0, "Cannot stake 0");
require(staked[msg.sender] > 0, "Nothing staked");
```

---

## 4. Low / Informational

### 4.1 Missing Events

**Severity:** LOW

**Issue:** No events emitted for stake, withdraw, or rate changes. Makes off-chain tracking impossible.

**Recommendation:**
```solidity
event Staked(address indexed user, uint256 amount);
event Withdrawn(address indexed user, uint256 amount, uint256 reward);
event RewardRateUpdated(uint256 oldRate, uint256 newRate);
```

---

### 4.2 Magic Numbers

**Severity:** INFORMATIONAL

```solidity
/ (86400 * 10000)  // What do these mean?
```

**Recommendation:** Use named constants:
```solidity
uint256 constant SECONDS_PER_DAY = 86400;
uint256 constant RATE_DENOMINATOR = 10000;  // Basis points
```

---

## Summary Table

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| 1.1 | CRITICAL | Unrestricted setRewardRate | Open |
| 1.2 | CRITICAL → MEDIUM | Transfer vs SafeTransfer | Open |
| 2.1 | HIGH | Reward overflow | Open |
| 2.2 | HIGH | Unfunded rewards insolvency | Open |
| 3.1 | MEDIUM | Timestamp reset on restake | Open |
| 3.2 | MEDIUM | Zero-amount operations | Open |
| 4.1 | LOW | Missing events | Open |
| 4.2 | INFO | Magic numbers | Open |

---

**Total Issues Found: 7** (1 Critical, 2 High, 2 Medium, 2 Low/Info)

*Audit performed by 0xClaw — DeFi security analysis*
