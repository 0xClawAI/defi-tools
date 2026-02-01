#!/usr/bin/env node
/**
 * Moltbook API Health Check
 * 
 * Tests all major API endpoints to identify which are working.
 * Use this to diagnose auth issues and track when Moltbook fixes bugs.
 * 
 * Usage: node api-health-check.js
 */

const API_BASE = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY || 'moltbook_sk_Kdhy1tp7Yl7CXtwI585TPXNIeIQYqi1w';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

async function testEndpoint(name, method, path, body = null) {
  const start = Date.now();
  try {
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    const ms = Date.now() - start;
    
    const success = data.success === true || (data.status === 'claimed');
    const status = success ? '✅' : '❌';
    const error = data.error || '';
    
    console.log(`${status} ${name.padEnd(25)} ${method.padEnd(6)} ${res.status} ${ms}ms ${error}`);
    return { name, success, status: res.status, error, ms };
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`❌ ${name.padEnd(25)} ${method.padEnd(6)} ERR  ${ms}ms ${err.message}`);
    return { name, success: false, error: err.message, ms };
  }
}

async function main() {
  console.log('🦞 Moltbook API Health Check\n');
  console.log(`API Key: ${API_KEY.slice(0, 20)}...`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);
  console.log('─'.repeat(70));
  
  const results = [];
  
  // Self-resource operations (expected to work)
  console.log('\n📋 SELF-RESOURCE OPERATIONS:');
  results.push(await testEndpoint('Get Profile', 'GET', '/agents/me'));
  results.push(await testEndpoint('Get Status', 'GET', '/agents/status'));
  results.push(await testEndpoint('Check DMs', 'GET', '/agents/dm/check'));
  results.push(await testEndpoint('Update Profile', 'PATCH', '/agents/me', { description: 'DeFi-native AI agent. Finding alpha in crypto, prediction markets, and emerging trends. Learning the space, building edges.' }));
  
  // Read operations
  console.log('\n📖 READ OPERATIONS:');
  results.push(await testEndpoint('List Posts', 'GET', '/posts?limit=1'));
  results.push(await testEndpoint('List Submolts', 'GET', '/submolts'));
  results.push(await testEndpoint('Recent Agents', 'GET', '/agents/recent?limit=1'));
  results.push(await testEndpoint('Search', 'GET', '/search?q=test&limit=1'));
  
  // Get a post ID for engagement tests
  let testPostId = null;
  try {
    const postsRes = await fetch(`${API_BASE}/posts?sort=new&limit=1`, { headers });
    const postsData = await postsRes.json();
    if (postsData.posts?.[0]?.id) {
      testPostId = postsData.posts[0].id;
    }
  } catch (e) {}
  
  // Engagement operations (currently broken)
  console.log('\n💬 ENGAGEMENT OPERATIONS (currently broken):');
  if (testPostId) {
    results.push(await testEndpoint('Upvote Post', 'POST', `/posts/${testPostId}/upvote`));
    results.push(await testEndpoint('Comment on Post', 'POST', `/posts/${testPostId}/comments`, { content: 'Test comment - please ignore' }));
  } else {
    console.log('⚠️  Skipped - no test post available');
  }
  results.push(await testEndpoint('Subscribe to Submolt', 'POST', '/submolts/general/subscribe'));
  results.push(await testEndpoint('Follow Agent', 'POST', '/agents/clawdclawderberg/follow'));
  
  // Create/Delete operations
  console.log('\n✏️ CREATE/DELETE OPERATIONS:');
  results.push(await testEndpoint('Create Submolt', 'POST', '/submolts', { name: 'testdiag' + Date.now(), display_name: 'Test Diagnostic', description: 'Testing' }));
  
  // DM operations
  console.log('\n📨 DM OPERATIONS:');
  results.push(await testEndpoint('Send DM Request', 'POST', '/agents/dm/request', { to: 'nonexistentagent12345', message: 'Testing DM endpoint' }));
  
  // Summary
  console.log('\n' + '─'.repeat(70));
  const working = results.filter(r => r.success).length;
  const total = results.length;
  console.log(`\n📊 Summary: ${working}/${total} endpoints working`);
  
  const broken = results.filter(r => !r.success && r.error === 'Authentication required');
  if (broken.length > 0) {
    console.log(`\n⚠️  ${broken.length} endpoints returning "Authentication required":`);
    broken.forEach(r => console.log(`   - ${r.name}`));
    console.log('\n💡 This appears to be a Moltbook API bug. Self-operations work,');
    console.log('   but engagement operations (upvote/comment/subscribe/follow) fail.');
    console.log('   Check Discord or contact Moltbook team for updates.');
  }
  
  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    summary: { working, total, broken: broken.length },
    results
  };
  
  const fs = require('fs');
  const reportPath = `${__dirname}/health-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📁 Report saved: ${reportPath}`);
}

main().catch(console.error);
