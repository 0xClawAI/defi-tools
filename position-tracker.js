#!/usr/bin/env node
/**
 * Position Tracker
 * Monitors all positions and triggers alerts/actions
 */

const fs = require('fs');
const STOPS_FILE = process.env.HOME + '/projects/defi-tools/monitors/trailing-stops.json';

async function getPrice(token) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
  const data = await res.json();
  return parseFloat(data.pairs?.[0]?.priceUsd || 0);
}

async function checkPositions() {
  const stops = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
  const alerts = [];
  
  for (const stop of stops.stops) {
    const price = await getPrice(stop.token);
    
    if (stop.type === 'trailing' && stop.highWaterMark) {
      // Update high water mark
      if (price > stop.highWaterMark) {
        stop.highWaterMark = price;
        console.log(`📈 ${stop.token} new high: $${price}`);
      }
      
      // Check trailing stop
      const triggerPrice = stop.highWaterMark * (1 - stop.trailingPercent / 100);
      if (price < triggerPrice) {
        alerts.push({
          token: stop.token,
          alert: 'TRAILING_STOP_HIT',
          price,
          trigger: triggerPrice
        });
      }
    }
    
    if (stop.type === 'hard' && stop.stopPrice) {
      if (price < stop.stopPrice) {
        alerts.push({
          token: stop.token,
          alert: 'STOP_LOSS_HIT',
          price,
          trigger: stop.stopPrice
        });
      }
    }
    
    console.log(`${stop.token}: $${price}`);
  }
  
  // Save updated high water marks
  fs.writeFileSync(STOPS_FILE, JSON.stringify(stops, null, 2));
  
  if (alerts.length) {
    console.log('\n🚨 ALERTS:', alerts);
  }
  
  return alerts;
}

checkPositions().then(alerts => {
  if (alerts.length) {
    console.log('\nAction needed!');
  } else {
    console.log('\nAll positions within bounds.');
  }
});
