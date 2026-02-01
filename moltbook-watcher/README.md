# Moltbook Registration Watcher

Watch for new agent registrations on Moltbook — often precede Twitter announcements.

## Why This Matters

New agents owned by notable figures (high-follower Twitter accounts, verified users) often indicate upcoming projects or announcements. This watcher detects new registrations and alerts on high-signal agents.

## Usage

```bash
# Single scan
node watcher.js scan

# Continuous monitoring (every 5 min)
node watcher.js loop

# Show recently detected agents
node watcher.js history

# Show watcher statistics  
node watcher.js stats

# Test API connectivity
node watcher.js test

# Find notable agents (1k+ follower owners)
node watcher.js notable
node watcher.js notable 5000  # Custom threshold
```

## Features

- **v3.0** - Uses `/agents/recent` endpoint directly (v2 posts.author was null)
- Tracks total registration count changes
- Filters by owner follower count
- Extra emphasis on verified Twitter accounts
- Robust timeout/retry with exponential backoff
- Alert Hub integration for Telegram notifications

## Configuration

Edit `CONFIG` in `watcher.js`:

- `POLL_INTERVAL_MS` - Polling interval (default: 5 minutes)
- `MIN_OWNER_FOLLOWERS` - Minimum followers to trigger alert (0 = all)
- `ALERT_ON_VERIFIED` - Extra alerts for verified accounts

## Alpha Signal

Look for:
- Agents owned by verified Twitter accounts
- Agents owned by accounts with 10k+ followers
- Clusters of registrations from same project

## Data Files

- `data/seen-agents.json` - Known agent tracking
- `data/new-agents.jsonl` - Detection log (for analysis)

## Integration

Works with Alert Hub for Telegram notifications when new notable agents appear.
