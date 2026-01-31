#!/bin/bash
# Fetch x402 alpha and log to file
cd ~/projects/defi-tools/x402-client

echo "=== $(date -u) ===" >> ~/memory/x402-alpha.log

node overnight-alpha.js 2>/dev/null | jq -r '.snapshot' >> ~/memory/x402-alpha.log 2>&1

echo "" >> ~/memory/x402-alpha.log
