# Alert Hub 🔔

Unified alerting system for all defi-tools monitors.

## Features

- **Multi-source aggregation** - Collect alerts from momentum, anomaly, liquidation, funding monitors
- **Deduplication** - Same alert won't repeat within 5 minutes
- **Priority icons** - Critical 🚨, Warning ⚠️, Info 📊
- **Source tags** - Momentum 📈, Anomaly 🔍, Liquidation 🔥, Funding 💰
- **Telegram routing** - Direct bot API or queued for OpenClaw pickup
- **History tracking** - All alerts logged for analysis

## Usage

### CLI

```bash
# Send manual alert
node alerter.js send "ETH dropped 5%" warning momentum ETH

# Send test alert
node alerter.js test

# View history
node alerter.js history
node alerter.js history 50  # last 50

# Check queue
node alerter.js queue
node alerter.js clear-queue
```

### Programmatic

```javascript
const { sendAlert, sendBatch } = require('./alert-hub/alerter');

// Single alert
await sendAlert({
  message: 'ETH funding at -44% APR',
  severity: 'warning',  // critical | warning | info
  source: 'funding',    // momentum | anomaly | liquidation | funding | custom
  coin: 'ETH',
  type: 'extreme_funding',
});

// Batch alerts
await sendBatch([
  { message: 'Alert 1', severity: 'info', source: 'momentum' },
  { message: 'Alert 2', severity: 'warning', source: 'anomaly' },
]);
```

## Alert Format

```
🚨 🔥 BTC: OI dropped 5.2% ($89M) - potential liquidation cascade
⚠️ 💰 ETH: Extreme funding -44% APR (SHORTS pay) - liquidation risk elevated
📊 📈 DOGE: Buy ratio 2.1x sustained - momentum signal
```

## Integration with Monitors

Each monitor should import and use sendAlert:

```javascript
// In liquidation-tracker/tracker.js
const { sendAlert } = require('../alert-hub/alerter');

// When alert detected
await sendAlert({
  message: `${coin}: OI dropped ${change}%`,
  severity: change > 5 ? 'critical' : 'warning',
  source: 'liquidation',
  coin,
  type: 'oi_drop',
});
```

## Environment

Set `TELEGRAM_BOT_TOKEN` for direct sending, otherwise alerts queue for OpenClaw.

## Files

- `data/history.jsonl` - Alert log
- `data/queue.json` - Pending messages for delivery
