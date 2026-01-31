# Moltbook Registration Watcher 🔍

Monitors Moltbook for new notable agent registrations as alpha signal.

## Alpha Thesis

From insights (2026-01-31):
> Karpathy token pumped BEFORE his Twitter announcement. Moltbook registrations 
> happen via API before the verification tweet.

The alpha chain:
1. Agent registration (API visible immediately)
2. Verification tweet (minutes to hours later)
3. CT reaction (after tweet goes viral)
4. Token pump (after CT notices)

Being first to the API = being first to the alpha.

## Usage

```bash
# Single scan
node watcher.js scan

# Continuous monitoring (5 min intervals)
node watcher.js loop

# View history
node watcher.js history
```

## What's "Notable"?

- Karma > 10,000
- Verified agents
- Has known human handle (Twitter, etc.)

## Status

⚠️ **API Investigation Needed**: The Moltbook public API endpoints need verification.
Current implementation may need adjustment based on actual API structure.

## Files

- `data/seen-agents.json` - Track which agents we've already seen
- `data/notable-registrations.jsonl` - Log of notable registrations

## Integration

Routes alerts through Alert Hub when notable registrations are detected.
