#!/usr/bin/env node
/**
 * DeFi Learning Tracker
 * Tracks concepts to learn and logs research
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const LEARN_FILE = path.join(DATA_DIR, 'learning-queue.json');
const KNOWLEDGE_FILE = path.join(__dirname, '../research/knowledge-base.md');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Topics to research
const TOPICS = {
  basics: [
    'DEX vs CEX - how they work',
    'Liquidity pools and impermanent loss',
    'AMM (Automated Market Maker) mechanics',
    'Token bonding curves',
    'pump.fun mechanics and fee structure'
  ],
  trading: [
    'MEV (Maximal Extractable Value)',
    'Sandwich attacks',
    'Front-running protection',
    'Slippage and price impact',
    'Smart money tracking methods'
  ],
  tokens: [
    'Token launch patterns on pump.fun',
    'FDV vs Market Cap interpretation',
    'Volume analysis for new tokens',
    'Holder distribution patterns',
    'Dev wallet tracking'
  ],
  narratives: [
    'AI agent token meta evolution',
    'Meme coin cycles and timing',
    'Cross-chain token launches',
    'Community token vs VC token dynamics'
  ],
  tools: [
    'DEXScreener advanced features',
    'Birdeye analytics',
    'Bubblemaps for holder analysis',
    'On-chain transaction reading'
  ]
};

function loadQueue() {
  if (fs.existsSync(LEARN_FILE)) {
    return JSON.parse(fs.readFileSync(LEARN_FILE, 'utf8'));
  }
  return {
    completed: [],
    inProgress: null,
    queue: [],
    notes: {}
  };
}

function saveQueue(queue) {
  fs.writeFileSync(LEARN_FILE, JSON.stringify(queue, null, 2));
}

// Initialize queue with all topics
function initQueue() {
  const queue = loadQueue();
  const allTopics = Object.entries(TOPICS).flatMap(([category, topics]) => 
    topics.map(t => ({ category, topic: t }))
  );
  
  // Add topics not already in queue or completed
  for (const item of allTopics) {
    const key = `${item.category}:${item.topic}`;
    if (!queue.completed.includes(key) && !queue.queue.find(q => q.topic === item.topic)) {
      queue.queue.push(item);
    }
  }
  
  saveQueue(queue);
  console.log(`📚 Learning queue initialized: ${queue.queue.length} topics`);
  return queue;
}

// Get next topic to research
function getNext() {
  const queue = loadQueue();
  if (queue.inProgress) {
    console.log(`\n🔄 Currently researching: ${queue.inProgress.topic}`);
    console.log(`   Category: ${queue.inProgress.category}`);
    return queue.inProgress;
  }
  
  if (queue.queue.length === 0) {
    console.log('✅ All topics completed!');
    return null;
  }
  
  const next = queue.queue.shift();
  queue.inProgress = next;
  saveQueue(queue);
  
  console.log(`\n📖 Next topic: ${next.topic}`);
  console.log(`   Category: ${next.category}`);
  return next;
}

// Mark current topic as complete with notes
function complete(notes) {
  const queue = loadQueue();
  if (!queue.inProgress) {
    console.log('No topic in progress');
    return;
  }
  
  const key = `${queue.inProgress.category}:${queue.inProgress.topic}`;
  queue.completed.push(key);
  queue.notes[key] = {
    completedAt: new Date().toISOString(),
    notes: notes || 'No notes'
  };
  
  // Append to knowledge base
  const entry = `\n## ${queue.inProgress.topic}\n*Category: ${queue.inProgress.category} | Learned: ${new Date().toISOString().split('T')[0]}*\n\n${notes || 'No notes'}\n\n---\n`;
  fs.appendFileSync(KNOWLEDGE_FILE, entry);
  
  queue.inProgress = null;
  saveQueue(queue);
  
  console.log(`✅ Completed: ${key}`);
  console.log(`📊 Progress: ${queue.completed.length}/${queue.completed.length + queue.queue.length}`);
}

// Show status
function status() {
  const queue = loadQueue();
  console.log('\n📚 Learning Progress:');
  console.log(`   Completed: ${queue.completed.length}`);
  console.log(`   Remaining: ${queue.queue.length}`);
  if (queue.inProgress) {
    console.log(`   In Progress: ${queue.inProgress.topic}`);
  }
  
  console.log('\n📋 Remaining by category:');
  const byCategory = {};
  queue.queue.forEach(q => {
    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
  });
  Object.entries(byCategory).forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count}`);
  });
}

// Main
const args = process.argv.slice(2);
const cmd = args[0] || 'status';

switch (cmd) {
  case 'init':
    initQueue();
    break;
  case 'next':
    getNext();
    break;
  case 'complete':
    complete(args.slice(1).join(' '));
    break;
  case 'status':
    status();
    break;
  default:
    console.log('Usage: node learn-defi.js [init|next|complete "notes"|status]');
}
