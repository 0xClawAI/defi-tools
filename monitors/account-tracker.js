#!/usr/bin/env node
/**
 * CT Account Tracker
 * Discovers and scores Twitter accounts based on token calls
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'tracked-accounts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load accounts database
function loadAccounts() {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  }
  return {
    accounts: {},
    lastUpdated: null
  };
}

function saveAccounts(db) {
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(db, null, 2));
}

// Extract Twitter handle from URL
function extractHandle(url) {
  if (!url) return null;
  const match = url.match(/x\.com\/([^\/\?]+)/i) || url.match(/twitter\.com\/([^\/\?]+)/i);
  if (match && !['i', 'status', 'search'].includes(match[1])) {
    return '@' + match[1];
  }
  return null;
}

// Scan DEXScreener for account links
async function scanForAccounts() {
  const db = loadAccounts();
  console.log(`\n👥 Account Scanner - ${new Date().toISOString()}`);
  
  // Get boosted tokens
  const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
  const boosted = await res.json();
  
  let newAccounts = 0;
  
  for (const token of boosted.slice(0, 30)) {
    // Get token details with socials
    try {
      const detailRes = await fetch(`https://api.dexscreener.com/tokens/v1/${token.chainId}/${token.tokenAddress}`);
      const details = await detailRes.json();
      
      if (details[0]?.info?.socials) {
        for (const social of details[0].info.socials) {
          if (social.type === 'twitter') {
            const handle = extractHandle(social.url);
            if (handle && !db.accounts[handle]) {
              newAccounts++;
              db.accounts[handle] = {
                handle,
                firstSeen: new Date().toISOString(),
                source: 'dexscreener',
                tokens: [{
                  symbol: details[0].baseToken?.symbol,
                  chain: token.chainId,
                  fdvAtDiscovery: details[0].fdv,
                  priceAtDiscovery: details[0].priceUsd,
                  discoveredAt: new Date().toISOString()
                }],
                tier: 'unscored',
                notes: ''
              };
              console.log(`  ✨ New account: ${handle} (${details[0].baseToken?.symbol})`);
            } else if (handle && db.accounts[handle]) {
              // Update existing account with new token
              const existing = db.accounts[handle].tokens.find(
                t => t.symbol === details[0].baseToken?.symbol
              );
              if (!existing) {
                db.accounts[handle].tokens.push({
                  symbol: details[0].baseToken?.symbol,
                  chain: token.chainId,
                  fdvAtDiscovery: details[0].fdv,
                  priceAtDiscovery: details[0].priceUsd,
                  discoveredAt: new Date().toISOString()
                });
              }
            }
          }
        }
      }
    } catch (e) {
      // Skip errors
    }
  }
  
  saveAccounts(db);
  console.log(`✅ Found ${newAccounts} new accounts`);
  console.log(`📊 Total tracked: ${Object.keys(db.accounts).length} accounts`);
  
  return db;
}

// Score accounts based on token performance
async function scoreAccounts() {
  const db = loadAccounts();
  console.log('\n📈 Scoring accounts...');
  
  for (const [handle, account] of Object.entries(db.accounts)) {
    if (account.tokens.length === 0) continue;
    
    let totalScore = 0;
    let scoredTokens = 0;
    
    for (const token of account.tokens) {
      // TODO: Fetch current price and compare to discovery price
      // For now, just count tokens
      scoredTokens++;
    }
    
    // Simple scoring: more tokens = potentially more active
    if (scoredTokens >= 3) {
      account.tier = 'active';
    } else if (scoredTokens >= 1) {
      account.tier = 'watch';
    }
  }
  
  saveAccounts(db);
  console.log('✅ Scoring complete');
}

// List accounts by tier
function listAccounts(tier = null) {
  const db = loadAccounts();
  console.log('\n📋 Tracked Accounts:');
  
  for (const [handle, account] of Object.entries(db.accounts)) {
    if (tier && account.tier !== tier) continue;
    console.log(`\n${handle} [${account.tier}]`);
    console.log(`  First seen: ${account.firstSeen}`);
    console.log(`  Tokens: ${account.tokens.map(t => t.symbol).join(', ')}`);
  }
}

// Main
const args = process.argv.slice(2);
const cmd = args[0] || 'scan';

switch (cmd) {
  case 'scan':
    scanForAccounts();
    break;
  case 'score':
    scoreAccounts();
    break;
  case 'list':
    listAccounts(args[1]);
    break;
  default:
    console.log('Usage: node account-tracker.js [scan|score|list]');
}
