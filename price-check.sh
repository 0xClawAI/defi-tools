#!/bin/bash
# Quick price check for watched tokens

echo "📊 Price Check - $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "================================================"

# CLAWD (Base)
clawd=$(curl -s "https://api.dexscreener.com/tokens/v1/base/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" 2>/dev/null)
clawd_price=$(echo "$clawd" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('priceUsd','?') if d else '?')" 2>/dev/null)
clawd_1h=$(echo "$clawd" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('priceChange',{}).get('h1','?') if d else '?')" 2>/dev/null)
echo "CLAWD (Base): \$${clawd_price} | 1h: ${clawd_1h}%"

# MOLT (Base)  
molt=$(curl -s "https://api.dexscreener.com/tokens/v1/base/0xB695559b26BB2c9703ef1935c37AeaE9526bab07" 2>/dev/null)
molt_price=$(echo "$molt" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('priceUsd','?') if d else '?')" 2>/dev/null)
molt_1h=$(echo "$molt" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('priceChange',{}).get('h1','?') if d else '?')" 2>/dev/null)
echo "MOLT (Base): \$${molt_price} | 1h: ${molt_1h}%"

echo ""
