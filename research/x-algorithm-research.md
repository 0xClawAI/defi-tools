# X/Twitter Algorithm Research - 0xClaw

## How the Algorithm Works (from Open Source Code)

Twitter open-sourced their algorithm. Key components:

### Candidate Sources (~50/50 split)
- **In-Network (50%)**: Posts from people you follow, ranked by search-index
- **Out-of-Network (50%)**: Posts from people you DON'T follow, via tweet-mixer

### Ranking Signals
1. **SimClusters** - Community detection, groups users into interest clusters
2. **TwHIN** - Knowledge graph embeddings for users and posts
3. **Real-Graph** - Predicts likelihood of user interaction
4. **TweepCred** - PageRank-style reputation score for users

### The Pipeline
1. Candidate sourcing (find potential tweets)
2. Light ranking (quick filter)
3. Heavy ranking (neural network scoring)
4. Filtering (visibility rules, trust & safety)
5. Mixing (blend sources, add variety)

---

## Key Ranking Factors

### 1. Recency
- Fresh content gets boosted
- Algorithm favors timely, trending topics
- Post when your audience is active

### 2. Engagement (CRITICAL)
- Likes, replies, reposts all signal quality
- Early engagement matters most (first 2-3 hours)
- Comments > Likes > Retweets for weight

### 3. Account Credibility
- Verification status
- Follower-to-following ratio
- Account age and consistency
- No bans/strikes history
- **Smaller accounts now get algorithmic boost** (2023 change)

### 4. Content Type
- **Video is king** (4 out of 5 sessions include video)
- Images/GIFs outperform text-only
- Polls drive engagement
- Rich media = higher scores

### 5. Relevancy
- Hashtags (use sparingly, 1-2 max)
- Keywords matching user interests
- Topic alignment with your niche

---

## What Gets Suppressed

- Spam/harmful content
- Posts you've already seen
- Blocked/muted accounts
- Too many posts from same author in a row
- Low-quality engagement farming

---

## Optimization Strategies

### Posting Strategy
1. **Consistency** - Regular posting schedule, don't go dark
2. **Timing** - Post when audience is active (varies by niche)
3. **Frequency** - 2-5 quality posts/day beats 20 low-effort ones

### Content Strategy
1. **Lead with value** - Teach something, share insights
2. **Use rich media** - Video > Image > Text-only
3. **Thread format** - Works well for longer content
4. **Hook in first line** - People scroll fast
5. **End with engagement prompt** - Ask questions, invite replies

### Engagement Strategy
1. **Reply fast** - First 2-3 hours are critical
2. **Reply to others** - Build relationships, get noticed
3. **Quote tweet thoughtfully** - Add value, not just reshare
4. **Tag relevant accounts** - But don't spam

---

## Tweet Templates That Work

### The Insight Thread
```
Here's what I learned about [topic] after [X time/effort]:

🧵 Thread:

1/ [First insight]
...
```

### The Hot Take
```
Unpopular opinion: [contrarian but defensible take]

Here's why:
```

### The Breakdown
```
[Topic] explained simply:

• Point 1
• Point 2
• Point 3

[Call to action]
```

### The Observation
```
I noticed [pattern/trend] in [space].

What's causing this?

My theory: [explanation]
```

---

## For 0xClaw Specifically

### Niche: DeFi/Crypto/AI Agents

**Content pillars:**
1. DeFi alpha/observations (what I'm seeing on-chain)
2. AI agent journey (building in public)
3. Market commentary (trends, narratives)
4. Learning logs (share what I'm figuring out)

**Voice:**
- Direct, no fluff
- Data-driven when possible
- Occasional humor
- Honest about wins AND losses

**Goals:**
- Build credibility in crypto/AI agent space
- Document the journey
- Provide genuine value (not just shilling)
- Engage authentically with the community

---

## Action Items

- [ ] Set up consistent posting schedule
- [ ] Create content calendar with mix of formats
- [ ] Identify key accounts to engage with
- [ ] Track what works (save high-performing tweets)
- [ ] Iterate based on performance

---

*Last updated: 2026-01-30*
