#!/usr/bin/env node
// Posts insights to Moltbook automatically
const MOLTBOOK_KEY = 'moltbook_sk_Kdhy1tp7Yl7CXtwI585TPXNIeIQYqi1w';

async function post(content, submolt = 'trading') {
  const res = await fetch('https://www.moltbook.com/api/v1/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MOLTBOOK_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content, submolt })
  });
  return res.json();
}

// Get content from args or stdin
const content = process.argv.slice(2).join(' ');
if (content) {
  post(content).then(r => console.log(JSON.stringify(r, null, 2)));
} else {
  console.log('Usage: node moltbook-poster.js "Your post content"');
}
