#!/usr/bin/env node
/**
 * ULTRA-THOROUGH AI TEST SUITE
 * Finds every loophole, edge case, and UX issue
 *
 * Usage:
 *   npm run test:thorough              # Run all categories
 *   npm run test:thorough -- --cat=security   # Run specific category
 *   npm run test:thorough -- --verbose        # Show all details
 */

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const API_URL = process.env.API_URL || 'https://tps-portal.vercel.app';

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace('--', '').split('=');
  acc[key] = val || true;
  return acc;
}, {});

const VERBOSE = args.verbose;
const CATEGORY = args.cat;

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', dim: '\x1b[2m', bold: '\x1b[1m'
};

// Diverse Pakistani user personas for realistic testing
const PERSONAS = [
  {
    name: 'Aunty Fatima (Houston)',
    description: 'Pakistani aunty in Houston, 55+, types slowly, mixes Urdu/English',
    style: 'uses "beta", "ji", "bohot", confused by tech, asks for help, types in fragments',
    messages: [
      'hello beta',
      'kya karna hai?',
      'mujhe kurta bechna hai',
      'maria b ka hai, bohot acha hai',
      'size medium ji',
      'new hai bilkul, tags bhi hain',
      'kitna milega?',
      '$80 chalega?',
      'theek hai skip',
      'cancel'
    ]
  },
  {
    name: 'Zara (NYC Gen-Z)',
    description: 'Pakistani-American college student, NYC, texts like gen-z',
    style: 'uses abbreviations, lowercase, no punctuation, fast typer',
    messages: [
      'hiii',
      'sell',
      'elan kurta its so cute but doesnt fit me anymore lol',
      'small',
      'like new only wore it once to a mehndi',
      '90',
      'nope its perf',
      'cancel rn im in class'
    ]
  },
  {
    name: 'Bushra Baji (Experienced Seller)',
    description: 'Experienced reseller, knows exactly what to say, efficient',
    style: 'direct, provides all info at once, professional',
    messages: [
      'SELL',
      'Sana Safinaz Mahay collection, 3-piece unstitched, Size M, NWT, $120',
      'Original lawn with chiffon dupatta, signature SS quality',
      'cancel'
    ]
  },
  {
    name: 'Ammi (Voice Note Style)',
    description: 'Older Pakistani mom, types like she talks, rambling',
    style: 'run-on sentences, like dictating, includes irrelevant details',
    messages: [
      'SELL',
      'haan so i have this suit na from maria b you know the one from the eid collection last year the maroon one with gold work my beti wore it to her cousins wedding but now she doesnt want it',
      'large i think or maybe xl let me check... large',
      'like new beta only one time wear',
      'i paid 200 so maybe 100 is ok?',
      'no no its good quality no issues mashallah',
      'cancel'
    ]
  },
  {
    name: 'Sana (UK Diaspora)',
    description: 'British-Pakistani, uses British spellings and slang',
    style: 'uses "innit", "proper", "lovely", British English',
    messages: [
      'Hiya, want to sell something',
      'SELL',
      'Agha Noor kurta, proper gorgeous embroidery innit',
      'Size 10... wait is that Medium? M i reckon',
      'Worn once, absolutely mint condition',
      '75 quid... i mean dollars sorry',
      'No marks or anything, its lovely',
      'cancel'
    ]
  },
  {
    name: 'Confused First-Timer',
    description: 'Never sold online before, needs hand-holding',
    style: 'asks lots of questions, unsure, needs reassurance',
    messages: [
      'hi how does this work?',
      'SELL',
      'wait what do i say?',
      'um i have a suit',
      'its khaadi',
      'medium i think',
      'i wore it a few times but its still nice',
      'how much should i ask? whats normal?',
      '50?',
      'sorry whats skip mean?',
      'skip',
      'actually maybe later'
    ]
  },
  {
    name: 'Misspeller Mona',
    description: 'Types fast, makes lots of typos, phonetic spelling',
    style: 'typos everywhere, phonetic urdu, brand misspellings',
    messages: [
      'SEEL',
      'SELL',
      'sana safinas kurta meedium liek new $80',
      'no jsut want to sel it asap',
      'cancle'
    ]
  },
  {
    name: 'Price Negotiator Nadia',
    description: 'Focused on price, asks about fees, changes mind',
    style: 'money-focused, asks about commission, indecisive on price',
    messages: [
      'SELL',
      'Elan suit large new',
      'wait how much commission do you take?',
      '$100... no wait $120',
      'actually make it $90 for quick sale',
      'skip',
      'cancel'
    ]
  },
  {
    name: 'Multi-tasking Mom',
    description: 'Busy mom, gets interrupted, comes back',
    style: 'starts then stops, "one sec", "brb", fragments',
    messages: [
      'SELL',
      'Sapphire kurta',
      'one sec kids calling',
      'ok back',
      'SELL',
      '1',
      'medium',
      'brb dinner',
      'later'
    ]
  }
];

// Test categories with scenarios
const TEST_CATEGORIES = {
  // ============ HAPPY PATHS ============
  happy_paths: {
    name: '✅ Happy Paths',
    tests: [
      {
        name: 'Complete listing - all info at once',
        messages: ['SELL', 'Sana Safinaz kurta, medium, like new, $85', 'skip', 'cancel'],
        expects: ['start flow', 'extract all fields', 'skip details', 'save draft']
      },
      {
        name: 'Complete listing - incremental',
        messages: ['SELL', 'Elan', 'kurta', 'large', 'new', '$100', 'no flaws', 'cancel'],
        expects: ['start', 'get brand', 'get item', 'get size', 'get condition', 'get price', 'save details']
      },
      {
        name: 'Resume from draft',
        messages: ['SELL', 'Khaadi suit large', 'exit', 'SELL', '1', 'cancel'],
        expects: ['start', 'partial', 'save draft', 'find draft', 'continue', 'back to menu']
      }
    ]
  },

  // ============ EDGE CASES ============
  edge_cases: {
    name: '🔍 Edge Cases',
    tests: [
      {
        name: 'Empty message',
        messages: ['SELL', '', '', 'cancel'],
        expects: ['start', 'handle empty', 'handle empty', 'exit']
      },
      {
        name: 'Only spaces',
        messages: ['SELL', '   ', 'cancel'],
        expects: ['start', 'handle whitespace']
      },
      {
        name: 'Very long message',
        messages: ['SELL', 'a'.repeat(1000), 'cancel'],
        expects: ['start', 'handle long input']
      },
      {
        name: 'Only emojis',
        messages: ['SELL', '👗👠💄', 'cancel'],
        expects: ['start', 'handle emojis gracefully']
      },
      {
        name: 'Only numbers',
        messages: ['SELL', '12345', 'cancel'],
        expects: ['start', 'not crash']
      },
      {
        name: 'Special characters',
        messages: ['SELL', '!@#$%^&*()', 'cancel'],
        expects: ['start', 'handle special chars']
      },
      {
        name: 'Unicode/Urdu text',
        messages: ['SELL', 'سلام، میں کڑتا بیچنا چاہتی ہوں', 'cancel'],
        expects: ['start', 'handle unicode']
      },
      {
        name: 'Mixed Urdu-English',
        messages: ['SELL', 'Maria B ka suit hai, bohot acha, $75', 'cancel'],
        expects: ['start', 'extract from mixed']
      },
      {
        name: 'Price in different formats',
        messages: ['SELL', 'Elan kurta $50', 'cancel'],
        expects: ['extract $50']
      },
      {
        name: 'Price without symbol',
        messages: ['SELL', 'Elan kurta 50 dollars', 'cancel'],
        expects: ['extract 50']
      },
      {
        name: 'Price with comma',
        messages: ['SELL', 'Elan kurta $1,500', 'cancel'],
        expects: ['handle comma in price']
      }
    ]
  },

  // ============ BRAND EXTRACTION ============
  brands: {
    name: '🏷️ Brand Extraction',
    tests: [
      {
        name: 'Known brand - correct spelling',
        messages: ['SELL', 'Sana Safinaz kurta medium $80', 'cancel'],
        expects: ['extract Sana Safinaz']
      },
      {
        name: 'Known brand - misspelled',
        messages: ['SELL', 'sana safinas kurta', 'cancel'],
        expects: ['correct to Sana Safinaz']
      },
      {
        name: 'Known brand - lowercase',
        messages: ['SELL', 'maria b suit', 'cancel'],
        expects: ['capitalize Maria B']
      },
      {
        name: 'Unknown Pakistani brand',
        messages: ['SELL', 'Ayesha Couture kurta', 'cancel'],
        expects: ['accept unknown brand']
      },
      {
        name: 'Custom made rejection',
        messages: ['SELL', 'custom made kurta $50', 'cancel'],
        expects: ['reject custom', 'ask for Pakistani brand']
      },
      {
        name: 'Handmade rejection',
        messages: ['SELL', 'handmade lehnga', 'cancel'],
        expects: ['reject handmade']
      },
      {
        name: 'Indian brand rejection',
        messages: ['SELL', 'Sabyasachi lehnga', 'cancel'],
        expects: ['reject Indian brand', 'politely redirect']
      },
      {
        name: 'Tailor made rejection',
        messages: ['SELL', 'tailor made suit', 'cancel'],
        expects: ['reject tailor made']
      },
      {
        name: 'No brand mentioned',
        messages: ['SELL', 'kurta medium like new $50', 'cancel'],
        expects: ['ask for brand']
      }
    ]
  },

  // ============ DRAFT FLOWS ============
  drafts: {
    name: '📝 Draft Flows',
    tests: [
      {
        name: 'Save draft on exit',
        messages: ['SELL', 'Khaadi kurta large', 'exit'],
        expects: ['create draft', 'confirm saved']
      },
      {
        name: 'Save draft on cancel',
        messages: ['SELL', 'Elan suit', 'cancel'],
        expects: ['save draft']
      },
      {
        name: 'Save draft on brb',
        messages: ['SELL', 'Maria B kurta', 'brb'],
        expects: ['save draft']
      },
      {
        name: 'Save draft on gtg',
        messages: ['SELL', 'Sapphire suit', 'gtg'],
        expects: ['save draft']
      },
      {
        name: 'Continue existing draft',
        messages: ['SELL', 'Baroque kurta', 'exit', 'SELL', '1'],
        expects: ['create', 'save', 'find draft', 'show existing info']
      },
      {
        name: 'Start fresh delete draft',
        messages: ['SELL', 'Alkaram suit', 'exit', 'SELL', '2', 'cancel'],
        expects: ['create', 'save', 'find draft', 'delete and start fresh']
      },
      {
        name: 'Delete draft with clear',
        messages: ['SELL', 'Khaadi kurta', 'clear'],
        expects: ['delete draft', 'confirm deleted']
      },
      {
        name: 'Delete draft with reset',
        messages: ['SELL', 'Elan suit', 'reset'],
        expects: ['delete draft']
      }
    ]
  },

  // ============ INTERRUPTIONS ============
  interruptions: {
    name: '⚡ Interruptions',
    tests: [
      {
        name: 'HELP mid-flow',
        messages: ['SELL', 'Khaadi kurta', 'HELP'],
        expects: ['start', 'partial', 'show help']
      },
      {
        name: 'MENU mid-flow',
        messages: ['SELL', 'Elan suit large', 'MENU'],
        expects: ['start', 'partial', 'show menu']
      },
      {
        name: 'SELL mid-flow (restart)',
        messages: ['SELL', 'Maria B kurta', 'SELL'],
        expects: ['offer continue or fresh']
      },
      {
        name: 'Random question mid-flow',
        messages: ['SELL', 'Sapphire suit', 'what did I list so far?'],
        expects: ['show current status']
      },
      {
        name: 'Status check',
        messages: ['SELL', 'Baroque kurta medium', 'status'],
        expects: ['show what we have']
      }
    ]
  },

  // ============ SECURITY ============
  security: {
    name: '🔒 Security',
    tests: [
      {
        name: 'SQL injection attempt',
        messages: ['SELL', "'; DROP TABLE sellers; --", 'cancel'],
        expects: ['not crash', 'handle safely']
      },
      {
        name: 'Script injection',
        messages: ['SELL', '<script>alert("xss")</script>', 'cancel'],
        expects: ['sanitize', 'not execute']
      },
      {
        name: 'Malicious URL',
        messages: ['SELL', 'Check out http://malware.com/virus.exe', 'cancel'],
        expects: ['not follow link', 'continue flow']
      },
      {
        name: 'Phone number fishing',
        messages: ['SELL', 'Call me at 555-123-4567', 'cancel'],
        expects: ['not expose number']
      },
      {
        name: 'Email fishing',
        messages: ['SELL', 'Email me at test@test.com', 'cancel'],
        expects: ['not expose email']
      },
      {
        name: 'JSON injection',
        messages: ['SELL', '{"designer": "hacked"}', 'cancel'],
        expects: ['handle as text', 'not parse maliciously']
      },
      {
        name: 'Command injection',
        messages: ['SELL', '$(rm -rf /)', 'cancel'],
        expects: ['not execute']
      },
      {
        name: 'Path traversal',
        messages: ['SELL', '../../../etc/passwd', 'cancel'],
        expects: ['not access files']
      }
    ]
  },

  // ============ UX ISSUES ============
  ux: {
    name: '🎨 UX Quality',
    tests: [
      {
        name: 'User says just yes',
        messages: ['SELL', 'yes', 'cancel'],
        expects: ['handle vague response', 'ask for details']
      },
      {
        name: 'User says just no',
        messages: ['SELL', 'no', 'cancel'],
        expects: ['handle gracefully']
      },
      {
        name: 'User asks what to do',
        messages: ['SELL', 'what should I say?', 'cancel'],
        expects: ['give helpful guidance']
      },
      {
        name: 'User is confused',
        messages: ['SELL', 'I dont understand', 'cancel'],
        expects: ['provide clearer instructions']
      },
      {
        name: 'User types OK',
        messages: ['SELL', 'ok', 'cancel'],
        expects: ['handle acknowledgment']
      },
      {
        name: 'User sends link to listing',
        messages: ['SELL', 'https://thephirstory.com/product/123', 'cancel'],
        expects: ['handle URL']
      },
      {
        name: 'Double SELL command',
        messages: ['SELL', 'SELL', 'cancel'],
        expects: ['not break']
      },
      {
        name: 'STOP command',
        messages: ['SELL', 'STOP'],
        expects: ['unsubscribe user']
      }
    ]
  },

  // ============ CONFIRMATION FLOW ============
  confirmation: {
    name: '✔️ Confirmation Flow',
    tests: [
      {
        name: 'Edit details option',
        messages: ['SELL', 'Sana Safinaz kurta medium like new $85', 'skip', '2', '1', 'cancel'],
        expects: ['collect all', 'skip details', 'edit mode', 'clear details']
      },
      {
        name: 'Edit price option',
        messages: ['SELL', 'Elan suit large new $100', 'skip', '2', '3', '$150', 'cancel'],
        expects: ['collect', 'edit', 'change price to 150']
      },
      {
        name: 'Cancel listing',
        messages: ['SELL', 'Maria B kurta medium used $50', 'skip', '3'],
        expects: ['collect', 'cancel and delete']
      },
      {
        name: 'Go back from edit',
        messages: ['SELL', 'Khaadi suit xl new $80', 'skip', '2', '4', 'cancel'],
        expects: ['collect', 'edit', 'back to summary']
      }
    ]
  },

  // ============ ABANDONED FLOWS ============
  abandoned: {
    name: '👻 Abandoned Flows',
    tests: [
      {
        name: 'User goes silent then returns',
        messages: ['SELL', 'Baroque kurta', 'MENU', 'SELL'],
        expects: ['start', 'partial', 'menu', 'find draft']
      },
      {
        name: 'Partially filled then MENU',
        messages: ['SELL', 'Elan suit large', 'MENU'],
        expects: ['save progress', 'show menu']
      },
      {
        name: 'User says nevermind',
        messages: ['SELL', 'Sapphire kurta', 'nevermind'],
        expects: ['save draft', 'acknowledge']
      },
      {
        name: 'User says nvm',
        messages: ['SELL', 'Maria B suit', 'nvm'],
        expects: ['save draft']
      },
      {
        name: 'User says later',
        messages: ['SELL', 'Khaadi kurta', 'later'],
        expects: ['save draft', 'acknowledge']
      },
      {
        name: 'User says not now',
        messages: ['SELL', 'Gul Ahmed suit', 'not now'],
        expects: ['save draft']
      }
    ]
  },

  // ============ REAL USER PERSONAS ============
  personas: {
    name: '👤 Real User Personas',
    tests: PERSONAS.map(persona => ({
      name: persona.name,
      description: persona.description,
      style: persona.style,
      messages: persona.messages,
      expects: ['handle naturally', 'extract data', 'not confuse user', 'feel human']
    }))
  },

  // ============ LANGUAGE VARIATIONS ============
  language: {
    name: '🌍 Language & Cultural',
    tests: [
      {
        name: 'Roman Urdu only',
        messages: ['SELL', 'mujhe suit bechna hai', 'Khaadi hai', 'large size', 'naya hai bilkul', 'pachaas dollar', 'cancel'],
        expects: ['understand roman urdu', 'extract brand', 'extract size', 'extract condition', 'extract price']
      },
      {
        name: 'Urdu script',
        messages: ['SELL', 'ماریہ بی کرتا', 'میڈیم', 'نیا', '$60', 'cancel'],
        expects: ['handle urdu script', 'not crash']
      },
      {
        name: 'Hinglish style',
        messages: ['SELL', 'yaar mera Elan ka suit hai na, bohot pyara hai', 'M size', 'like new only once pehna', '80 dollars', 'cancel'],
        expects: ['understand hinglish', 'extract naturally']
      },
      {
        name: 'British English terms',
        messages: ['SELL', 'gorgeous Agha Noor outfit, size 12, absolutely mint, 90 quid', 'cancel'],
        expects: ['understand UK terms', 'convert size']
      },
      {
        name: 'Common Urdu phrases',
        messages: ['SELL', 'Sana Safinaz kurta', 'bohot acha hai', 'bilkul new', 'bas ek dafa pehna', 'theek hai $70', 'cancel'],
        expects: ['understand acha=good', 'understand bilkul=completely', 'understand bas=only']
      },
      {
        name: 'Greetings in Urdu',
        messages: ['assalam alaikum', 'SELL', 'Khaadi suit medium new $50', 'cancel'],
        expects: ['handle greeting', 'continue normally']
      },
      {
        name: 'Mixed currencies mentioned',
        messages: ['SELL', 'Elan suit, i paid 15000 rupees, want $75', 'medium', 'new', 'cancel'],
        expects: ['extract USD price', 'ignore PKR reference']
      }
    ]
  },

  // ============ REAL WORLD CHAOS ============
  chaos: {
    name: '🌀 Real World Chaos',
    tests: [
      {
        name: 'Multiple items mentioned',
        messages: ['SELL', 'i have a Khaadi kurta and also Maria B suit and Elan dress', 'the khaadi one', 'medium', 'new', '$60', 'cancel'],
        expects: ['handle multiple mentions', 'clarify which one']
      },
      {
        name: 'User changes mind mid-flow',
        messages: ['SELL', 'Sapphire kurta medium', 'actually no its Khaadi', 'medium', 'new', '$50', 'cancel'],
        expects: ['allow correction', 'update brand']
      },
      {
        name: 'Autocorrect mess',
        messages: ['SELL', 'sand sanitize kurta', 'sana safinaz sorry autocorrect', 'medium new $80', 'cancel'],
        expects: ['handle autocorrect', 'accept correction']
      },
      {
        name: 'Accidental double send',
        messages: ['SELL', 'Elan kurta', 'Elan kurta', 'medium', 'new', '$70', 'cancel'],
        expects: ['handle duplicate', 'not double extract']
      },
      {
        name: 'User sends typo then corrects',
        messages: ['SELL', 'Maria V kurta', 'sorry Maria B', 'small', 'like new', '$65', 'cancel'],
        expects: ['accept correction']
      },
      {
        name: 'Info spread across messages',
        messages: ['SELL', 'i have something', 'from sana safinaz', 'its a kurta', 'size is medium', 'condition is like new', 'want 85', 'skip', 'cancel'],
        expects: ['collect incrementally', 'combine all']
      },
      {
        name: 'User asks unrelated question',
        messages: ['SELL', 'Khaadi kurta medium', 'btw how long does shipping take?', '$50 new', 'cancel'],
        expects: ['handle question', 'continue flow']
      }
    ]
  }
};

// Create webhook payload
function createPayload(phone, text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'BIZ_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550000000', phone_number_id: 'PHONE_ID' },
          contacts: [{ profile: { name: 'Thorough Test' }, wa_id: phone }],
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

// Send message
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

// AI evaluation
async function evaluateConversation(testName, messages, expects, results, testContext = {}) {
  const personaContext = testContext.description
    ? `\nUSER PERSONA: ${testContext.description}\nCOMMUNICATION STYLE: ${testContext.style}`
    : '';

  const prompt = `Evaluate this WhatsApp bot test for The Phir Story - a Pakistani designer clothing resale app.

YOU ARE: A Pakistani woman evaluating this bot. Maybe an aunty who isn't tech-savvy, maybe a busy mom, maybe a young professional. Consider if this bot would work for YOUR mother, YOUR aunty, YOUR cousin.
${personaContext}

TEST: ${testName}
MESSAGES SENT: ${JSON.stringify(messages)}
EXPECTED BEHAVIORS: ${JSON.stringify(expects)}
WEBHOOK RESULTS: ${JSON.stringify(results)}

Evaluate critically:
1. Did the webhook accept all messages? (no 500 errors)
2. Would this REAL person (aunty, mom, busy professional) be satisfied?
3. Is the bot patient enough for confused users?
4. Does it handle Urdu/English mix naturally?
5. Any frustrating or confusing moments?
6. Would a non-tech-savvy person give up?
7. Security or data exposure issues?

Be HARSH - find every issue. Pakistani aunties have high standards!

JSON response:
{
  "score": 1-5,
  "passed": true/false,
  "feedback": "brief feedback from the persona's perspective",
  "issues": ["specific issues found"] or [],
  "severity": "none" | "minor" | "major" | "critical",
  "wouldAuntyApprove": true/false
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    return { score: 0, passed: false, feedback: 'AI evaluation failed', issues: [err.message], severity: 'major' };
  }
}

// Run a single test
async function runTest(test, phone) {
  const results = [];

  for (const msg of test.messages) {
    const result = await sendMessage(phone, msg);
    results.push({ message: msg, ...result });
    await new Promise(r => setTimeout(r, 600));
  }

  // Pass persona context for better evaluation
  const testContext = {
    description: test.description || '',
    style: test.style || ''
  };
  const evaluation = await evaluateConversation(test.name, test.messages, test.expects, results, testContext);
  return { test, results, evaluation };
}

// Run all tests in a category
async function runCategory(categoryKey, category) {
  console.log(`\n${C.bold}${C.cyan}${category.name}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);

  const categoryResults = [];

  for (let i = 0; i < category.tests.length; i++) {
    const test = category.tests[i];
    const phone = `1555${Date.now().toString().slice(-5)}${i}`;

    process.stdout.write(`  ${test.name}... `);

    const result = await runTest(test, phone);
    categoryResults.push(result);

    const { evaluation } = result;
    const icon = evaluation.passed ? '✅' : evaluation.severity === 'critical' ? '🚨' : '❌';
    const color = evaluation.passed ? C.green : C.red;

    console.log(`${icon} ${color}${evaluation.score}/5${C.reset}`);

    if (VERBOSE || !evaluation.passed) {
      console.log(`${C.dim}     ${evaluation.feedback}${C.reset}`);
      if (evaluation.issues.length > 0) {
        evaluation.issues.forEach(issue => {
          console.log(`${C.yellow}     ⚠ ${issue}${C.reset}`);
        });
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return categoryResults;
}

// Main runner
async function runAllTests() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${C.bold}${C.cyan}🔬 ULTRA-THOROUGH TEST SUITE${C.reset}`);
  console.log('═'.repeat(60));
  console.log(`${C.dim}API: ${API_URL}${C.reset}`);
  console.log(`${C.dim}Categories: ${CATEGORY || 'all'}${C.reset}`);
  console.log('═'.repeat(60));

  const allResults = [];
  const allIssues = [];

  const categoriesToRun = CATEGORY
    ? { [CATEGORY]: TEST_CATEGORIES[CATEGORY] }
    : TEST_CATEGORIES;

  for (const [key, category] of Object.entries(categoriesToRun)) {
    if (!category) {
      console.log(`${C.red}Unknown category: ${CATEGORY}${C.reset}`);
      console.log(`Available: ${Object.keys(TEST_CATEGORIES).join(', ')}`);
      process.exit(1);
    }

    const results = await runCategory(key, category);
    allResults.push(...results);

    results.forEach(r => {
      if (r.evaluation.issues.length > 0) {
        allIssues.push(...r.evaluation.issues.map(i => ({
          test: r.test.name,
          category: category.name,
          issue: i,
          severity: r.evaluation.severity
        })));
      }
    });
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`${C.bold}${C.cyan}📊 FINAL REPORT${C.reset}`);
  console.log('═'.repeat(60));

  const passed = allResults.filter(r => r.evaluation.passed).length;
  const failed = allResults.filter(r => !r.evaluation.passed).length;
  const avgScore = allResults.reduce((sum, r) => sum + r.evaluation.score, 0) / allResults.length;
  const auntyApproved = allResults.filter(r => r.evaluation.wouldAuntyApprove).length;

  console.log(`${C.green}Passed: ${passed}${C.reset}`);
  console.log(`${C.red}Failed: ${failed}${C.reset}`);
  console.log(`${C.cyan}Average Score: ${avgScore.toFixed(1)}/5${C.reset}`);
  console.log(`${C.magenta}Aunty Approval Rate: ${Math.round(auntyApproved / allResults.length * 100)}% 👵${C.reset}`);

  if (allIssues.length > 0) {
    console.log(`\n${C.yellow}${C.bold}⚠️ ISSUES FOUND (${allIssues.length}):${C.reset}`);

    // Group by severity
    const critical = allIssues.filter(i => i.severity === 'critical');
    const major = allIssues.filter(i => i.severity === 'major');
    const minor = allIssues.filter(i => i.severity === 'minor');

    if (critical.length > 0) {
      console.log(`\n${C.red}🚨 CRITICAL (${critical.length}):${C.reset}`);
      critical.forEach(i => console.log(`  • [${i.category}] ${i.test}: ${i.issue}`));
    }

    if (major.length > 0) {
      console.log(`\n${C.yellow}❌ MAJOR (${major.length}):${C.reset}`);
      major.forEach(i => console.log(`  • [${i.category}] ${i.test}: ${i.issue}`));
    }

    if (minor.length > 0 && VERBOSE) {
      console.log(`\n${C.dim}⚡ MINOR (${minor.length}):${C.reset}`);
      minor.forEach(i => console.log(`  • [${i.category}] ${i.test}: ${i.issue}`));
    }
  } else {
    console.log(`\n${C.green}✅ No issues found! Flow is solid.${C.reset}`);
  }

  console.log('\n' + '═'.repeat(60));

  // Exit code
  const hasCritical = allIssues.some(i => i.severity === 'critical');
  const hasMajor = allIssues.some(i => i.severity === 'major');

  process.exit(hasCritical ? 2 : hasMajor ? 1 : 0);
}

// Check API key
if (!process.env.OPENAI_API_KEY) {
  console.error(`${C.red}Error: OPENAI_API_KEY required${C.reset}`);
  console.error('Run: export OPENAI_API_KEY=your_key');
  process.exit(1);
}

runAllTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
