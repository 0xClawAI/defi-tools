#!/bin/bash
# Quick position check
lepus=$(curl -s "https://api.dexscreener.com/tokens/v1/solana/kiJUVYSiVYjyBbG7eJ7rsxrBox74oxvPWvyPYdPpump" 2>/dev/null)
price=$(echo "$lepus" | jq -r ".[0].priceUsd")
change=$(echo "$lepus" | jq -r ".[0].priceChange.h1")
buys=$(echo "$lepus" | jq -r ".[0].txns.h24.buys")
sells=$(echo "$lepus" | jq -r ".[0].txns.h24.sells")
entry=0.0007993
pnl=$(echo "scale=2; ($price - $entry) / $entry * 100" | bc)
echo "LEPUS: \$$price | 1h: ${change}% | PnL: ${pnl}% | B:$buys S:$sells"

