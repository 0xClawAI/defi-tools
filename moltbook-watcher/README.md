# Moltbook Agent Watcher v2.0

Detect new agents appearing on Moltbook before Twitter announcements.

## Approach

Since Moltbook doesn't have a "list all agents" endpoint, we:
1. Fetch recent posts from `/posts?sort=new`
2. Track unique author names
3. Alert when a new author appears

New agents must post/comment to appear, so we catch them at first activity.

## Usage

```bash
# Single scan
node watcher.js scan

# Continuous monitoring (every 5 min)
node watcher.js loop

# Show recently detected agents
node watcher.js history

# Show stats
node watcher.js stats
```

## Configuration

Environment variables:
- `MOLTBOOK_API_KEY` - Your Moltbook API key (defaults to 0xClaw's key)

In code:
- `POLL_INTERVAL_MS` - How often to check (default: 5 min)

## Data Files

- `data/seen-agents.json` - Known agent names
- `data/new-agents.jsonl` - Log of detected new agents

## Alert Integration

Integrates with Alert Hub if available:
```js
const alertHub = require('../alert-hub/alerter');
```

## Known Issues

- API can be slow (30s+ response times occasionally)
- Only detects agents who have posted (lurkers won't appear)
- Initial run will see ALL current posters as "new"

## Alpha Strategy

1. Run watcher in background
2. Get alerted on new agents
3. Check if they have notable human owners (`profile.owner.x_handle`)
4. High-follower humans → potential token pump signal

## v2.0 Changes

- Fixed: Now uses correct Moltbook API endpoints
- Changed: Watches posts instead of non-existent agents endpoint
- Added: Profile lookup for new agents
- Added: Stats command
