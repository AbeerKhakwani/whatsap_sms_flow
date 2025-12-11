import { createClient } from '@supabase/supabase-js';

// Create Supabase client
export function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// Clean up phone numbers to consistent format
export function normalizePhone(phone) {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('1') && digits.length === 10) {
    digits = '1' + digits;
  }
  return '+' + digits;
}

// Send XML response back to Twilio
export function sendResponse(res, message) {
  console.log('📤 Sending:', message.substring(0, 80) + '...');
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Message><![CDATA[' + 
    message + 
    ']]></Message></Response>'
  );
}

// ═══════════════════════════════════════
// SELLER FUNCTIONS
// ═══════════════════════════════════════

// Look up seller by phone number
export async function findSeller(phone) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  
  if (error) console.error('findSeller error:', error);
  return data;
}

// Look up seller by email
export async function findSellerByEmail(email) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .or(`email.ilike.${email},paypal_email.ilike.${email}`)
    .maybeSingle();
  
  if (error) console.error('findSellerByEmail error:', error);
  return data;
}

// Link phone number to existing seller
export async function linkPhoneToSeller(sellerId, phone) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('sellers')
    .update({ phone: phone })
    .eq('id', sellerId);
  
  if (error) console.error('linkPhoneToSeller error:', error);
}

// Create new seller
export async function createSeller(phone, email) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sellers')
    .insert({
      phone: phone,
      email: email,
      paypal_email: email
    })
    .select()
    .single();
  
  if (error) {
    console.error('createSeller error:', error);
    return null;
  }
  return data;
}

// ═══════════════════════════════════════
// CONVERSATION FUNCTIONS
// ═══════════════════════════════════════

// Get the most recent conversation for this phone
export async function findConversation(phone) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sms_conversations')
    .select('*')
    .eq('phone_number', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) console.error('findConversation error:', error);
  return data;
}

// Update or create conversation state
export async function updateConversation(phone, sellerId, updates) {
  const supabase = getSupabase();
  const existing = await findConversation(phone);
  
  // Add updated_at timestamp
  updates.updated_at = new Date().toISOString();
  
  if (existing) {
    const { error } = await supabase
      .from('sms_conversations')
      .update(updates)
      .eq('id', existing.id);
    
    if (error) console.error('updateConversation error:', error);
  } else {
    const { error } = await supabase
      .from('sms_conversations')
      .insert({
        phone_number: phone,
        seller_id: sellerId,
        ...updates
      });
    
    if (error) console.error('createConversation error:', error);
  }
}

// ═══════════════════════════════════════
// INTENT DETECTION
// ═══════════════════════════════════════
export async function detectIntent(message) {
  const m = message.toLowerCase().trim();
  
  console.log('🔍 detectIntent:', m);
  
  // Quick match for numbers
  if (m === '1') return 'sell';
  if (m === '2') return 'buy';
  if (m === '3') return 'listings';

  // Quick match for keywords
  if (/^(sell|list|selling)$/i.test(m)) return 'sell';
  if (/^(buy|shop|browse|shopping)$/i.test(m)) return 'buy';
  if (/^(listings?|my listings?|my items?)$/i.test(m)) return 'listings';

  // Skip AI for very short gibberish
  if (m.length < 3) return null;

  console.log('🤖 Calling OpenAI...');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You detect user intent for The Phir Story, a Pakistani designer clothing resale platform.

Return ONLY one word:
- "sell" if they want to sell, list, or consign an item
- "buy" if they want to browse, shop, or purchase
- "listings" if they want to see their current listings or items they're selling
- "unknown" if the message is unclear, random text, or gibberish`
          },
          { role: 'user', content: message }
        ],
        max_tokens: 10,
        temperature: 0
      })
    });

    const data = await response.json();
    const intent = data.choices?.[0]?.message?.content?.toLowerCase().trim();
    
    console.log('🤖 AI intent:', intent);
    
    if (['sell', 'buy', 'listings'].includes(intent)) {
      return intent;
    }
    return null;
    
  } catch (error) {
    console.error('❌ AI error:', error);
    return null;
  }
}