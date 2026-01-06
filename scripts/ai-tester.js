#!/usr/bin/env node
/**
 * AI-Powered Test Harness
 * Uses GPT to simulate random users and evaluate responses
 *
 * Usage: node scripts/ai-tester.js [--rounds=5] [--verbose]
 */

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const API_URL = process.env.API_URL || 'https://phirstory-dashboard.vercel.app';

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace('--', '').split('=');
  acc[key] = val || true;
  return acc;
}, {});

const ROUNDS = parseInt(args.rounds) || 5;
const VERBOSE = args.verbose;

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

// User personas for simulation
const PERSONAS = [
  {
    name: 'Experienced Seller',
    description: 'Knows exactly what to say, provides all info at once',
    style: 'concise, direct, knows brands well'
  },
  {
    name: 'Confused Newbie',
    description: 'First time seller, asks questions, provides info slowly',
    style: 'hesitant, asks "what do you need?", types in fragments'
  },
  {
    name: 'Voice Note Simulator',
    description: 'Types like they speak, run-on sentences, informal',
    style: 'conversational, "umm", "like", rambling but has the info'
  },
  {
    name: 'Urdu-English Mixer',
    description: 'Mixes Urdu/English words naturally',
    style: 'uses words like "bilkul", "acha", "theek hai", "bohot"'
  },
  {
    name: 'Misspeller',
    description: 'Types fast, makes typos, shorthand',
    style: 'typos, "u" instead of "you", brand misspellings'
  },
  {
    name: 'Price Haggler',
    description: 'Focuses on price, asks about payout, changes mind',
    style: 'asks about commission, changes price multiple times'
  },
  {
    name: 'Edge Case Creator',
    description: 'Tests edge cases - Indian brands, custom made, weird inputs',
    style: 'mentions Sabyasachi, custom tailored, or random non-clothing items'
  }
];

// Pakistani brands for realistic simulation
const BRANDS = [
  'Sana Safinaz', 'Elan', 'Maria B', 'Khaadi', 'Sapphire', 'Gul Ahmed',
  'Hussain Rehar', 'Suffuse', 'Baroque', 'Alkaram', 'Zara Shahjahan',
  'Agha Noor', 'Cross Stitch', 'Nishat', 'Generation', 'Limelight'
];

const ITEMS = ['kurta', '3-piece suit', 'lehnga', 'sharara', 'gharara', 'anarkali', 'saree'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const CONDITIONS = ['new with tags', 'like new', 'gently used', 'worn once'];

// Create WhatsApp webhook payload
function createPayload(phone, text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'BIZ_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550000000', phone_number_id: 'PHONE_ID' },
          contacts: [{ profile: { name: 'AI Test User' }, wa_id: phone }],
          messages: [{
            from: phone,
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: { body: text }
          }]
        },
        field: 'messages'
      }]
    }]
  };
}

// Send message to webhook
async function sendMessage(phone, text) {
  try {
    const res = await fetch(`${API_URL}/api/sms-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload(phone, text))
    });
    return { success: res.ok, status: res.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Generate a user message using GPT
async function generateUserMessage(persona, conversationHistory, stage) {
  const brand = BRANDS[Math.floor(Math.random() * BRANDS.length)];
  const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
  const size = SIZES[Math.floor(Math.random() * SIZES.length)];
  const condition = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];
  const price = Math.floor(Math.random() * 150) + 50;

  const prompt = `You are simulating a user testing a WhatsApp bot for selling Pakistani designer clothes.

PERSONA: ${persona.name}
Style: ${persona.style}
Description: ${persona.description}

CONVERSATION STAGE: ${stage}
- If stage is "start": Say SELL or hello to start
- If stage is "provide_info": Provide some or all of: brand=${brand}, item=${item}, size=${size}, condition=${condition}, price=$${price}
- If stage is "respond": Respond naturally to the bot's last message
- If stage is "edge_case": Test something unusual (custom made, Indian brand, random question)

CONVERSATION SO FAR:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Generate ONE short message (under 100 chars) as this user would type it. Just the message, no quotes.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.9
  });

  return completion.choices[0].message.content.trim();
}

// Evaluate bot response using GPT
async function evaluateResponse(userMessage, botBehavior, persona) {
  const prompt = `You are evaluating a WhatsApp bot for selling Pakistani designer clothes.

USER (${persona.name}): "${userMessage}"
BOT BEHAVIOR: ${botBehavior}

Evaluate the bot's behavior on a scale of 1-5:
- Did it understand the user's intent?
- Was the response appropriate?
- Did it extract data correctly (if applicable)?
- Was it friendly but not annoying?

Respond in JSON format:
{
  "score": 1-5,
  "feedback": "brief feedback",
  "issues": ["list any problems"] or []
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(completion.choices[0].message.content);
}

// Run a single conversation simulation
async function simulateConversation(roundNum) {
  const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
  const phone = `1555${Date.now().toString().slice(-7)}${roundNum}`;
  const conversationHistory = [];
  const evaluations = [];

  console.log(`\n${COLORS.cyan}━━━ Round ${roundNum}: ${persona.name} ━━━${COLORS.reset}`);
  console.log(`${COLORS.dim}${persona.description}${COLORS.reset}\n`);

  const stages = ['start', 'provide_info', 'respond', 'respond'];
  if (persona.name === 'Edge Case Creator') stages[2] = 'edge_case';

  for (let i = 0; i < stages.length; i++) {
    // Generate user message
    const userMsg = await generateUserMessage(persona, conversationHistory, stages[i]);
    conversationHistory.push({ role: 'user', content: userMsg });

    console.log(`${COLORS.magenta}👤 User:${COLORS.reset} ${userMsg}`);

    // Send to webhook
    const result = await sendMessage(phone, userMsg);
    const botBehavior = result.success ? 'Responded successfully' : `Error: ${result.error || result.status}`;
    conversationHistory.push({ role: 'bot', content: botBehavior });

    console.log(`${COLORS.cyan}🤖 Bot:${COLORS.reset} ${botBehavior}`);

    // Evaluate
    const evaluation = await evaluateResponse(userMsg, botBehavior, persona);
    evaluations.push(evaluation);

    if (VERBOSE) {
      const scoreColor = evaluation.score >= 4 ? COLORS.green : evaluation.score >= 3 ? COLORS.yellow : COLORS.red;
      console.log(`${COLORS.dim}   Score: ${scoreColor}${evaluation.score}/5${COLORS.reset} - ${evaluation.feedback}`);
      if (evaluation.issues.length > 0) {
        console.log(`${COLORS.red}   Issues: ${evaluation.issues.join(', ')}${COLORS.reset}`);
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  const avgScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;
  const allIssues = evaluations.flatMap(e => e.issues);

  return { persona: persona.name, avgScore, issues: allIssues, evaluations };
}

// Main test runner
async function runTests() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${COLORS.cyan}🧪 AI-POWERED TEST HARNESS${COLORS.reset}`);
  console.log('═'.repeat(60));
  console.log(`${COLORS.dim}API: ${API_URL}`);
  console.log(`Rounds: ${ROUNDS}${COLORS.reset}`);
  console.log('═'.repeat(60));

  const results = [];

  for (let i = 1; i <= ROUNDS; i++) {
    const result = await simulateConversation(i);
    results.push(result);
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`${COLORS.cyan}📊 TEST SUMMARY${COLORS.reset}`);
  console.log('═'.repeat(60));

  const overallAvg = results.reduce((sum, r) => sum + r.avgScore, 0) / results.length;
  const allIssues = results.flatMap(r => r.issues);
  const uniqueIssues = [...new Set(allIssues)];

  for (const r of results) {
    const color = r.avgScore >= 4 ? COLORS.green : r.avgScore >= 3 ? COLORS.yellow : COLORS.red;
    console.log(`${color}${r.avgScore.toFixed(1)}/5${COLORS.reset} - ${r.persona}`);
  }

  console.log('─'.repeat(60));
  const overallColor = overallAvg >= 4 ? COLORS.green : overallAvg >= 3 ? COLORS.yellow : COLORS.red;
  console.log(`${COLORS.cyan}Overall Score: ${overallColor}${overallAvg.toFixed(1)}/5${COLORS.reset}`);

  if (uniqueIssues.length > 0) {
    console.log(`\n${COLORS.yellow}⚠️ Issues Found:${COLORS.reset}`);
    uniqueIssues.forEach(issue => console.log(`  • ${issue}`));
  } else {
    console.log(`\n${COLORS.green}✅ No issues found!${COLORS.reset}`);
  }

  console.log('═'.repeat(60) + '\n');

  // Recommendations
  if (overallAvg < 4) {
    console.log(`${COLORS.yellow}💡 RECOMMENDATIONS:${COLORS.reset}`);
    if (uniqueIssues.some(i => i.toLowerCase().includes('brand'))) {
      console.log('  • Improve brand extraction for misspellings');
    }
    if (uniqueIssues.some(i => i.toLowerCase().includes('confus'))) {
      console.log('  • Add more helpful prompts for confused users');
    }
    if (uniqueIssues.some(i => i.toLowerCase().includes('error'))) {
      console.log('  • Check webhook error handling');
    }
    console.log('');
  }

  process.exit(overallAvg >= 3.5 ? 0 : 1);
}

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable required');
  console.error('Run: export OPENAI_API_KEY=your_key');
  process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
