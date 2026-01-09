// Debug script for WhatsApp issues
const fs = require('fs');
const env = fs.readFileSync('.env.prod', 'utf8');
const token = env.match(/WHATSAPP_ACCESS_TOKEN="([^"]+)"/)?.[1];
const phoneId = env.match(/WHATSAPP_PHONE_NUMBER_ID="([^"]+)"/)?.[1];

console.log('=== WhatsApp Debug ===');
console.log('Token exists:', token ? 'YES' : 'NO');
console.log('Phone ID:', phoneId || 'NOT FOUND');

async function check() {
  // 1. Check templates
  console.log('\n--- Checking Templates ---');
  const templatesRes = await fetch('https://graph.facebook.com/v18.0/1622913521910825/message_templates', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const templates = await templatesRes.json();

  if (templates.error) {
    console.log('ERROR:', templates.error.message);
    return;
  }

  console.log('Approved templates:');
  templates.data?.filter(t => t.status === 'APPROVED').forEach(t => {
    console.log('  -', t.name, `(${t.category})`);
  });

  // 2. Check login_code template specifically
  console.log('\n--- login_code Template Details ---');
  const loginTemplate = templates.data?.find(t => t.name === 'login_code');
  if (loginTemplate) {
    console.log('Status:', loginTemplate.status);
    console.log('Category:', loginTemplate.category);
    console.log('Components:', JSON.stringify(loginTemplate.components, null, 2));
  } else {
    console.log('NOT FOUND');
  }

  // 3. Try to send a simple text message first
  console.log('\n--- Testing Simple Text Message ---');
  const textRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: '14406530800',
      type: 'text',
      text: { body: 'Debug test message' }
    })
  });
  const textResult = await textRes.json();
  console.log('Text message result:', JSON.stringify(textResult, null, 2));
}

check().catch(console.error);
