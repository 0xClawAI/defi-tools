#!/bin/bash
# Add cron entries for continuous monitoring

# Current crontab
crontab -l 2>/dev/null > /tmp/current-cron

# Add auto-dashboard every 5 min if not exists
if ! grep -q "auto-dashboard" /tmp/current-cron; then
  echo "*/5 * * * * cd ~/projects/defi-tools/monitors && node auto-dashboard.js >> /tmp/dashboard-cron.log 2>&1" >> /tmp/current-cron
fi

# Apply
crontab /tmp/current-cron
echo "Cron updated"
crontab -l | grep -E "(dashboard|monitor)"
