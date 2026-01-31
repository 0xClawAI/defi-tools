#!/bin/bash
# Master automation script - runs all monitors

echo "=== DeFi Automation Suite ==="
echo "Time: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo ""

cd ~/projects/defi-tools/monitors

echo "📊 Running DEX Monitor..."
node dex-monitor.js --once 2>&1 | tail -5
echo ""

echo "👥 Running Account Tracker..."
node account-tracker.js scan 2>&1 | tail -5
echo ""

echo "💰 Checking Prices..."
~/projects/defi-tools/price-check.sh
echo ""

echo "📚 Learning Status..."
node learn-defi.js status 2>&1 | head -10
echo ""

echo "=== Summary ==="
echo "Tokens tracked: $(cat ../data/monitor-state.json 2>/dev/null | grep -c '"firstSeen"' || echo 0)"
echo "Accounts tracked: $(cat ../data/tracked-accounts.json 2>/dev/null | grep -c '"handle"' || echo 0)"
echo "Log file: ../logs/$(date '+%Y-%m-%d').log"
