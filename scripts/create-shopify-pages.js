// scripts/create-shopify-pages.js
// Creates "Sell With Us" (embedded portal) and "How to Sell on WhatsApp" pages in Shopify
//
// Usage: SHOPIFY_STORE_URL=xxx SHOPIFY_ACCESS_TOKEN=xxx node scripts/create-shopify-pages.js

const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_URL || !SHOPIFY_TOKEN) {
  console.error('Set VITE_SHOPIFY_STORE_URL and VITE_SHOPIFY_ACCESS_TOKEN env vars');
  process.exit(1);
}

const SELLER_PORTAL_URL = 'https://sell.thephirstory.com';
const WHATSAPP_NUMBER = '14406530800';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

async function createPage(title, handle, bodyHtml) {
  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/pages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN
      },
      body: JSON.stringify({
        page: {
          title,
          handle,
          body_html: bodyHtml,
          published: true
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json();
    console.error(`Failed to create "${title}":`, JSON.stringify(err, null, 2));
    return null;
  }

  const { page } = await res.json();
  console.log(`✅ Created "${title}" → https://thephirstory.com/pages/${page.handle}`);
  return page;
}

// Page 1: Sell With Us — landing page with both selling options
const sellWithUsHtml = `
<style>
  .tps-sell { max-width: 860px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .tps-sell * { box-sizing: border-box; }

  /* Hero */
  .tps-sell-hero {
    text-align: center; padding: 50px 24px 40px;
    background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
    border-radius: 20px; margin-bottom: 40px; color: white;
  }
  .tps-sell-hero h1 { font-size: 36px; margin: 0 0 12px; color: white; }
  .tps-sell-hero p { font-size: 18px; margin: 0 0 6px; opacity: 0.85; line-height: 1.6; }
  .tps-sell-hero-sub { font-size: 15px; opacity: 0.6; margin-top: 12px; }

  /* Payout badge */
  .tps-sell-badge {
    display: inline-block; background: rgba(37,211,102,0.15); border: 1px solid rgba(37,211,102,0.3);
    padding: 8px 20px; border-radius: 30px; font-size: 15px; font-weight: 600;
    color: #25D366; margin-bottom: 20px;
  }

  /* Two options */
  .tps-sell-options {
    display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 40px;
  }
  @media (max-width: 700px) {
    .tps-sell-options { grid-template-columns: 1fr; }
  }

  .tps-sell-card {
    border: 2px solid #eee; border-radius: 20px; padding: 32px 28px;
    text-align: center; transition: border-color 0.2s, transform 0.2s;
    position: relative; overflow: hidden;
  }
  .tps-sell-card:hover { border-color: #ddd; transform: translateY(-2px); }

  .tps-sell-card-icon {
    width: 64px; height: 64px; border-radius: 16px; margin: 0 auto 16px;
    display: flex; align-items: center; justify-content: center; font-size: 32px;
  }
  .tps-sell-card h2 { font-size: 22px; margin: 0 0 10px; color: #1a1a1a; }
  .tps-sell-card p { font-size: 15px; color: #666; line-height: 1.6; margin: 0 0 8px; }
  .tps-sell-card-list {
    text-align: left; margin: 16px 0; padding: 0; list-style: none; font-size: 14px; color: #555;
  }
  .tps-sell-card-list li { padding: 6px 0 6px 24px; position: relative; }
  .tps-sell-card-list li::before {
    content: '✓'; position: absolute; left: 0; color: #25D366; font-weight: 700;
  }

  .tps-sell-card-tag {
    display: inline-block; font-size: 12px; font-weight: 600; padding: 4px 12px;
    border-radius: 20px; margin-bottom: 16px;
  }
  .tps-sell-tag-fast { background: #f0fdf4; color: #166534; }
  .tps-sell-tag-detailed { background: #eff6ff; color: #1e40af; }

  .tps-sell-btn {
    display: inline-block; padding: 14px 32px; border-radius: 30px;
    text-decoration: none; font-weight: 600; font-size: 16px;
    transition: transform 0.2s, box-shadow 0.2s; margin-top: 20px;
  }
  .tps-sell-btn:hover { transform: scale(1.03); box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .tps-sell-btn-wa { background: #25D366; color: white; }
  .tps-sell-btn-portal { background: #1a1a1a; color: white; }

  /* How it works summary */
  .tps-sell-how {
    background: #f8f9fa; border-radius: 16px; padding: 32px 28px; margin-bottom: 40px;
  }
  .tps-sell-how h3 { text-align: center; margin: 0 0 24px; font-size: 22px; }
  .tps-sell-steps {
    display: flex; justify-content: space-between; gap: 12px; text-align: center;
  }
  @media (max-width: 600px) {
    .tps-sell-steps { flex-direction: column; gap: 16px; }
  }
  .tps-sell-step { flex: 1; }
  .tps-sell-step-icon { font-size: 28px; margin-bottom: 8px; }
  .tps-sell-step-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #1a1a1a; }
  .tps-sell-step-desc { font-size: 13px; color: #888; }
  .tps-sell-arrow { display: flex; align-items: center; color: #ccc; font-size: 20px; }
  @media (max-width: 600px) { .tps-sell-arrow { display: none; } }

  /* Payout box */
  .tps-sell-payout {
    background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 16px;
    padding: 28px; text-align: center; margin-bottom: 40px;
  }
  .tps-sell-payout-big { font-size: 40px; font-weight: 800; color: #166534; margin: 0 0 4px; }
  .tps-sell-payout-sub { font-size: 15px; color: #166534; margin: 0 0 12px; }
  .tps-sell-payout-detail { font-size: 13px; color: #555; margin: 0; }

  /* FAQ */
  .tps-sell-faq { border-top: 1px solid #eee; padding-top: 30px; }
  .tps-sell-faq h3 { margin: 0 0 16px; font-size: 22px; text-align: center; }
  .tps-sell-faq details {
    margin-bottom: 8px; background: #f8f9fa; border-radius: 10px; padding: 16px;
  }
  .tps-sell-faq summary { font-weight: 600; cursor: pointer; font-size: 15px; }
  .tps-sell-faq details p { margin: 12px 0 0; color: #555; font-size: 14px; line-height: 1.6; }
</style>

<div class="tps-sell">

  <!-- Hero -->
  <div class="tps-sell-hero">
    <div class="tps-sell-badge">You Keep 82% of Every Sale</div>
    <h1>Sell Your Preloved Designer Pieces</h1>
    <p>Turn your closet into cash. We handle the listing, customer service, and payments — you just describe, ship, and get paid.</p>
    <div class="tps-sell-hero-sub">Pakistani &amp; international designers welcome &middot; Free to list &middot; Prepaid shipping</div>
  </div>

  <!-- Transition Notice -->
  <div style="background: #FFF9E6; border: 2px solid #F59E0B; border-radius: 16px; padding: 28px; margin-bottom: 40px; text-align: center;">
    <div style="font-size: 28px; margin-bottom: 12px;">🚧</div>
    <h2 style="margin: 0 0 10px; font-size: 22px; color: #92400E;">New Selling Platform Coming Soon</h2>
    <p style="margin: 0 0 16px; color: #78350F; font-size: 15px; line-height: 1.6;">We are no longer accepting listings through our previous selling platform. We're building a brand new, more intuitive experience for sellers — including <strong>WhatsApp selling</strong> and a <strong>Seller Portal</strong>.</p>
    <p style="margin: 0 0 6px; color: #78350F; font-size: 15px; line-height: 1.6;">During this transition, we are limiting new listings to <strong>10 per month</strong>. Once spots are filled, submissions close until the following month.</p>
  </div>

  <!-- Current Method: Email -->
  <div class="tps-sell-card" style="margin-bottom: 40px; border-color: #25D366; border-width: 2px;">
    <div class="tps-sell-card-tag tps-sell-tag-fast">✅ Available Now</div>
    <div class="tps-sell-card-icon" style="background: #f0fdf4;">📧</div>
    <h2>Submit via Email</h2>
    <p>During our transition period, you can submit items by emailing us directly. Please include:</p>
    <ul class="tps-sell-card-list">
      <li>Designer name</li>
      <li>Material</li>
      <li>Measurements</li>
      <li>Condition</li>
      <li>Clear, detailed photos of the outfit</li>
    </ul>
    <p style="font-size: 14px; color: #888; margin-top: 12px;">You will receive a response regarding approval within 4–5 business days.</p>
    <a href="mailto:admin@thephirstory.com?subject=New%20Listing%20Submission" class="tps-sell-btn tps-sell-btn-wa" style="background: #1a1a1a;">📧 Email admin@thephirstory.com</a>
  </div>

  <!-- Coming Soon: Two New Ways -->
  <h3 style="text-align: center; font-size: 20px; color: #999; margin-bottom: 24px;">Coming Soon — Two New Ways to Sell</h3>
  <div class="tps-sell-options">

    <!-- WhatsApp Card -->
    <div class="tps-sell-card" style="opacity: 0.7;">
      <div class="tps-sell-card-tag" style="background: #f3f4f6; color: #9ca3af;">🔜 Coming Soon</div>
      <div class="tps-sell-card-icon" style="background: #f0fdf4;">💬</div>
      <h2>Sell on WhatsApp</h2>
      <p>Just message us and describe your item — type or send a voice note. Our AI handles the rest.</p>
      <ul class="tps-sell-card-list">
        <li>Send a voice note or text description</li>
        <li>AI extracts all details automatically</li>
        <li>Pre-filled form to review &amp; add photos</li>
        <li>Get notified when it sells</li>
      </ul>
    </div>

    <!-- Portal Card -->
    <div class="tps-sell-card" style="opacity: 0.7;">
      <div class="tps-sell-card-tag" style="background: #f3f4f6; color: #9ca3af;">🔜 Coming Soon</div>
      <div class="tps-sell-card-icon" style="background: #eff6ff;">📱</div>
      <h2>Seller Portal</h2>
      <p>Fill out a form with all details, upload photos, and track your listings — all from your browser.</p>
      <ul class="tps-sell-card-list">
        <li>Step-by-step listing form</li>
        <li>Upload photos directly</li>
        <li>Track all your listings &amp; sales</li>
        <li>View earnings &amp; payouts</li>
      </ul>
    </div>

  </div>

  <!-- How It Works -->
  <div class="tps-sell-how">
    <h3>How It Works</h3>
    <div class="tps-sell-steps">
      <div class="tps-sell-step">
        <div class="tps-sell-step-icon">📝</div>
        <div class="tps-sell-step-title">1. List It</div>
        <div class="tps-sell-step-desc">Email us with details &amp; photos of your item</div>
      </div>
      <div class="tps-sell-arrow">→</div>
      <div class="tps-sell-step">
        <div class="tps-sell-step-icon">✅</div>
        <div class="tps-sell-step-title">2. We Review</div>
        <div class="tps-sell-step-desc">We approve &amp; list it on our store</div>
      </div>
      <div class="tps-sell-arrow">→</div>
      <div class="tps-sell-step">
        <div class="tps-sell-step-icon">📦</div>
        <div class="tps-sell-step-title">3. Ship It</div>
        <div class="tps-sell-step-desc">When sold, we send a prepaid shipping label</div>
      </div>
      <div class="tps-sell-arrow">→</div>
      <div class="tps-sell-step">
        <div class="tps-sell-step-icon">💰</div>
        <div class="tps-sell-step-title">4. Get Paid</div>
        <div class="tps-sell-step-desc">You keep 82% — paid weekly</div>
      </div>
    </div>
  </div>

  <!-- Payout -->
  <div class="tps-sell-payout">
    <p class="tps-sell-payout-big">You Keep 82%</p>
    <p class="tps-sell-payout-sub">Free to list &middot; No upfront costs &middot; We handle everything</p>
    <p class="tps-sell-payout-detail">We take care of listing optimization, photography touch-ups, customer inquiries, secure payments, and buyer support.</p>
  </div>

  <!-- FAQ -->
  <div class="tps-sell-faq">
    <h3>Common Questions</h3>

    <details>
      <summary>Why can't I use the old platform?</summary>
      <p>We're upgrading to a much better selling experience! Our new platform will let you list items via WhatsApp (voice notes + AI) or a dedicated Seller Portal. During the transition, email submissions keep things moving.</p>
    </details>

    <details>
      <summary>What are the 10 monthly spots?</summary>
      <p>To ensure quality during our transition, we're accepting up to 10 new listings per month. Once all spots are filled, submissions re-open the following month. Submit early to secure your spot!</p>
    </details>

    <details>
      <summary>What brands do you accept?</summary>
      <p>Pakistani designers (Sana Safinaz, Khaadi, Agha Noor, Maria B, Elan, HSY, Asim Jofa, Baroque, and more) plus international brands (Zara, Mango, H&amp;M, etc). Not sure? Just ask us!</p>
    </details>

    <details>
      <summary>How much does it cost?</summary>
      <p>Listing is completely free. We only take an 18% commission when your item sells. You keep 82% of the sale price. Shipping is on us — we provide a prepaid label.</p>
    </details>

    <details>
      <summary>How long does approval take?</summary>
      <p>You'll receive a response regarding approval within 4–5 business days of emailing us.</p>
    </details>

    <details>
      <summary>How do I ship when it sells?</summary>
      <p>We send a prepaid shipping label to your email. Just pack your item, stick on the label, and drop it off at any shipping location. No cost to you!</p>
    </details>

    <details>
      <summary>When do I get paid?</summary>
      <p>Payments are processed after the buyer receives the item. We pay weekly via your preferred method (Zelle, Venmo, or bank transfer).</p>
    </details>
  </div>

</div>
`;

// Page 2: How to Sell on WhatsApp — animated phone mockups
const howToSellHtml = `
<style>
  .tps-guide { max-width: 800px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .tps-guide * { box-sizing: border-box; }

  /* Hero */
  .tps-hero {
    text-align: center; padding: 50px 20px; position: relative; overflow: hidden;
    background: linear-gradient(135deg, #075E54 0%, #25D366 50%, #128C7E 100%);
    border-radius: 20px; margin-bottom: 50px; color: white;
  }
  .tps-hero h1 { font-size: 36px; margin: 0 0 8px; color: white; }
  .tps-hero p { font-size: 18px; margin: 0; opacity: 0.9; }
  .tps-hero-badge {
    display: inline-block; background: rgba(255,255,255,0.2); padding: 6px 16px;
    border-radius: 20px; font-size: 14px; margin-bottom: 16px; backdrop-filter: blur(4px);
  }

  /* Step layout */
  .tps-step {
    display: flex; gap: 40px; align-items: center; margin-bottom: 60px;
    opacity: 0; transform: translateY(30px); animation: tps-fadeUp 0.6s ease forwards;
  }
  .tps-step:nth-child(even) { flex-direction: row-reverse; }
  .tps-step-text { flex: 1; }
  .tps-step-phone { flex: 0 0 280px; }

  @media (max-width: 700px) {
    .tps-step, .tps-step:nth-child(even) { flex-direction: column; gap: 24px; }
    .tps-step-phone { flex: none; width: 260px; }
  }

  /* Step number + title */
  .tps-step-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; background: #25D366; color: white;
    border-radius: 50%; font-weight: 700; font-size: 16px; margin-bottom: 12px;
  }
  .tps-step-text h2 { margin: 0 0 12px; font-size: 24px; color: #1a1a1a; }
  .tps-step-text p { margin: 0 0 12px; color: #555; line-height: 1.7; font-size: 16px; }

  /* Phone mockup */
  .tps-phone {
    background: #1a1a1a; border-radius: 32px; padding: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15); position: relative;
  }
  .tps-phone-inner {
    background: #ECE5DD; border-radius: 22px; overflow: hidden; min-height: 360px;
  }
  .tps-phone-header {
    background: #075E54; color: white; padding: 12px 16px; display: flex;
    align-items: center; gap: 10px; font-size: 14px;
  }
  .tps-phone-avatar {
    width: 32px; height: 32px; background: #25D366; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;
  }
  .tps-phone-name { font-weight: 600; }
  .tps-phone-status { font-size: 11px; opacity: 0.8; }

  .tps-phone-chat { padding: 16px 12px; display: flex; flex-direction: column; gap: 8px; }

  /* Chat bubbles */
  .tps-bubble {
    max-width: 85%; padding: 8px 12px; border-radius: 8px; font-size: 13px;
    line-height: 1.5; position: relative; word-wrap: break-word;
  }
  .tps-bubble-in {
    background: white; align-self: flex-start; border-top-left-radius: 0;
    box-shadow: 0 1px 1px rgba(0,0,0,0.05);
  }
  .tps-bubble-out {
    background: #DCF8C6; align-self: flex-end; border-top-right-radius: 0;
    box-shadow: 0 1px 1px rgba(0,0,0,0.05);
  }
  .tps-bubble-time { font-size: 10px; color: #999; text-align: right; margin-top: 2px; }
  .tps-bubble-btn {
    display: block; text-align: center; padding: 8px; margin-top: 6px;
    background: rgba(37,211,102,0.1); border-radius: 6px; color: #25D366;
    font-weight: 600; font-size: 13px; text-decoration: none;
  }
  .tps-bubble strong { color: #075E54; }

  /* Voice note bubble */
  .tps-voice {
    display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  }
  .tps-voice-play {
    width: 28px; height: 28px; background: #25D366; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .tps-voice-play::after {
    content: ''; width: 0; height: 0; border-left: 8px solid white;
    border-top: 5px solid transparent; border-bottom: 5px solid transparent; margin-left: 2px;
  }
  .tps-voice-wave {
    flex: 1; height: 20px; background:
      repeating-linear-gradient(90deg, #075E54 0px, #075E54 2px, transparent 2px, transparent 4px);
    border-radius: 2px; opacity: 0.4;
  }
  .tps-voice-dur { font-size: 11px; color: #999; }

  /* Photo grid in bubble */
  .tps-photos {
    display: grid; grid-template-columns: 1fr 1fr; gap: 3px; border-radius: 6px;
    overflow: hidden; margin-bottom: 4px;
  }
  .tps-photo-placeholder {
    aspect-ratio: 1; background: linear-gradient(135deg, #f0e6d9, #e8d5c4);
    display: flex; align-items: center; justify-content: center; font-size: 24px;
  }

  /* Typing indicator */
  .tps-typing { display: flex; gap: 4px; padding: 12px 16px; align-self: flex-start; }
  .tps-typing-dot {
    width: 8px; height: 8px; background: #aaa; border-radius: 50%;
    animation: tps-typeBounce 1.4s infinite;
  }
  .tps-typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .tps-typing-dot:nth-child(3) { animation-delay: 0.4s; }

  /* Animations */
  @keyframes tps-fadeUp {
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes tps-typeBounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }

  .tps-step:nth-child(1) { animation-delay: 0.1s; }
  .tps-step:nth-child(2) { animation-delay: 0.2s; }
  .tps-step:nth-child(3) { animation-delay: 0.3s; }
  .tps-step:nth-child(4) { animation-delay: 0.4s; }
  .tps-step:nth-child(5) { animation-delay: 0.5s; }
  .tps-step:nth-child(6) { animation-delay: 0.6s; }
  .tps-step:nth-child(7) { animation-delay: 0.7s; }

  /* Tip box */
  .tps-tip {
    background: #FFF9E6; border-left: 4px solid #F59E0B; padding: 14px 18px;
    border-radius: 0 8px 8px 0; margin: 12px 0; font-size: 14px;
  }

  /* CTA section */
  .tps-cta {
    text-align: center; padding: 50px 24px; background: #f8f9fa;
    border-radius: 20px; margin: 50px 0 30px;
  }
  .tps-cta h2 { margin: 0 0 8px; font-size: 28px; }
  .tps-cta p { margin: 0 0 24px; color: #666; font-size: 16px; }
  .tps-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .tps-btn {
    display: inline-block; padding: 14px 28px; border-radius: 30px;
    text-decoration: none; font-weight: 600; font-size: 16px; transition: transform 0.2s;
  }
  .tps-btn:hover { transform: scale(1.03); }
  .tps-btn-wa { background: #25D366; color: white; }
  .tps-btn-portal { background: #1a1a1a; color: white; }

  /* FAQ */
  .tps-faq { border-top: 1px solid #eee; padding-top: 30px; margin-top: 20px; }
  .tps-faq h3 { margin: 0 0 16px; font-size: 22px; }
  .tps-faq details {
    margin-bottom: 10px; background: #f8f9fa; border-radius: 10px; padding: 16px;
  }
  .tps-faq summary { font-weight: 600; cursor: pointer; font-size: 15px; }
  .tps-faq details p { margin: 12px 0 0; color: #555; font-size: 14px; line-height: 1.6; }

  /* Payout highlight */
  .tps-payout {
    background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;
    padding: 20px; text-align: center; margin: 16px 0;
  }
  .tps-payout-big { font-size: 36px; font-weight: 800; color: #166534; margin: 0; }
  .tps-payout-sub { font-size: 14px; color: #166534; margin: 8px 0 0; }
</style>

<div class="tps-guide">

  <!-- Hero -->
  <div class="tps-hero">
    <div class="tps-hero-badge">Takes less than 5 minutes</div>
    <h1>Sell on WhatsApp</h1>
    <p>List your preloved designer pieces — it's as easy as sending a message</p>
  </div>

  <!-- STEP 1: Say SELL -->
  <div class="tps-step">
    <div class="tps-step-text">
      <div class="tps-step-num">1</div>
      <h2>Message Us "SELL"</h2>
      <p>Open WhatsApp and send <strong>"SELL"</strong> to <strong>+1 (440) 653-0800</strong>. You'll instantly get a welcome message with a button to start.</p>
      <div class="tps-tip">You can also tap the green button below to start the chat with the message pre-filled!</div>
    </div>
    <div class="tps-step-phone">
      <div class="tps-phone">
        <div class="tps-phone-inner">
          <div class="tps-phone-header">
            <div class="tps-phone-avatar">P</div>
            <div><div class="tps-phone-name">The Phir Story</div><div class="tps-phone-status">online</div></div>
          </div>
          <div class="tps-phone-chat">
            <div class="tps-bubble tps-bubble-out">SELL<div class="tps-bubble-time">10:01 AM</div></div>
            <div class="tps-bubble tps-bubble-in">
              Hi! 👋 Welcome to The Phir Story.
              <div class="tps-bubble-btn">Click Here To SELL</div>
              <div class="tps-bubble-time">10:01 AM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- STEP 2: Enter Email -->
  <div class="tps-step">
    <div class="tps-step-text">
      <div class="tps-step-num">2</div>
      <h2>Enter Your Email</h2>
      <p>We'll ask for your email to create or link your seller account. If you already have an account, use the same email.</p>
    </div>
    <div class="tps-step-phone">
      <div class="tps-phone">
        <div class="tps-phone-inner">
          <div class="tps-phone-header">
            <div class="tps-phone-avatar">P</div>
            <div><div class="tps-phone-name">The Phir Story</div><div class="tps-phone-status">online</div></div>
          </div>
          <div class="tps-phone-chat">
            <div class="tps-bubble tps-bubble-in">
              What's your email?<br><br>If you have an account with us already, please use that email.
              <div class="tps-bubble-time">10:01 AM</div>
            </div>
            <div class="tps-bubble tps-bubble-out">sarah@gmail.com<div class="tps-bubble-time">10:02 AM</div></div>
            <div class="tps-bubble tps-bubble-in">
              ✅ Code sent to sarah@gmail.com<br><br>Check your email (and junk/spam folder) and reply with the 6-digit code to verify.
              <div class="tps-bubble-time">10:02 AM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- STEP 3: Verify Code -->
  <div class="tps-step">
    <div class="tps-step-text">
      <div class="tps-step-num">3</div>
      <h2>Verify with Code</h2>
      <p>Check your email for a <strong>6-digit code</strong> and send it back on WhatsApp. This links your phone to your seller account — you only do this once!</p>
      <div class="tps-tip">Check your spam/junk folder if you don't see the email within a minute.</div>
    </div>
    <div class="tps-step-phone">
      <div class="tps-phone">
        <div class="tps-phone-inner">
          <div class="tps-phone-header">
            <div class="tps-phone-avatar">P</div>
            <div><div class="tps-phone-name">The Phir Story</div><div class="tps-phone-status">online</div></div>
          </div>
          <div class="tps-phone-chat">
            <div class="tps-bubble tps-bubble-in">
              ✅ Code sent to sarah@gmail.com<br><br>Reply with the 6-digit code.
              <div class="tps-bubble-time">10:02 AM</div>
            </div>
            <div class="tps-bubble tps-bubble-out">847291<div class="tps-bubble-time">10:03 AM</div></div>
            <div class="tps-bubble tps-bubble-in">
              Welcome! ✓<br><br>Tell us about your outfit in your own words.<br><br>Send a voice note or text.
              <div class="tps-bubble-time">10:03 AM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- STEP 4: Describe Item -->
  <div class="tps-step">
    <div class="tps-step-text">
      <div class="tps-step-num">4</div>
      <h2>Describe Your Item</h2>
      <p>Send a <strong>voice note</strong> or <strong>text</strong> describing your item — designer, size, condition, and your asking price. Our AI extracts the details automatically!</p>
      <p style="font-size: 14px; color: #888;">Example: "Sana Safinaz 3-piece suit, size medium, like new condition, asking $120"</p>
    </div>
    <div class="tps-step-phone">
      <div class="tps-phone">
        <div class="tps-phone-inner">
          <div class="tps-phone-header">
            <div class="tps-phone-avatar">P</div>
            <div><div class="tps-phone-name">The Phir Story</div><div class="tps-phone-status">online</div></div>
          </div>
          <div class="tps-phone-chat">
            <div class="tps-bubble tps-bubble-out tps-voice">
              <div class="tps-voice-play"></div>
              <div class="tps-voice-wave"></div>
              <div class="tps-voice-dur">0:12</div>
            </div>
            <div class="tps-bubble tps-bubble-in">
              🎤 I heard: "Sana Safinaz 3-piece, medium, like new, $120"
              <div class="tps-bubble-time">10:04 AM</div>
            </div>
            <div class="tps-bubble tps-bubble-in">
              Tap below to edit, and add photos:
              <div class="tps-bubble-btn">Click Here: To Edit, Review and add Photos</div>
              <div class="tps-bubble-time">10:04 AM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- STEP 5: Review Form + Photos -->
  <div class="tps-step">
    <div class="tps-step-text">
      <div class="tps-step-num">5</div>
      <h2>Add Photos & Review</h2>
      <p>A form opens right inside WhatsApp with your details pre-filled. Edit anything, then <strong>add at least 3 photos</strong> — front, back, and label.</p>
      <div style="background: #f8f9fa; border-radius: 10px; padding: 16px; margin-top: 12px;">
        <p style="margin: 0 0 6px; font-weight: 600; font-size: 14px;">📸 Best photos to include:</p>
        <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #555;">
          <li>Full front &amp; back view</li>
          <li>Designer label / brand tag</li>
          <li>Size tag</li>
          <li>Close-up of fabric &amp; details</li>
          <li>Any wear or flaws (honesty builds trust!)</li>
        </ul>
      </div>
    </div>
    <div class="tps-step-phone">
      <div class="tps-phone">
        <div class="tps-phone-inner">
          <div class="tps-phone-header" style="background: #128C7E;">
            <div style="font-size: 13px;">Review Your Listing</div>
          </div>
          <div style="padding: 16px; background: white; font-size: 13px;">
            <div style="margin-bottom: 12px;">
              <div style="color: #999; font-size: 11px; margin-bottom: 3px;">DESIGNER</div>
              <div style="padding: 8px 10px; background: #f5f5f5; border-radius: 6px;">Sana Safinaz</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
              <div>
                <div style="color: #999; font-size: 11px; margin-bottom: 3px;">SIZE</div>
                <div style="padding: 8px 10px; background: #f5f5f5; border-radius: 6px;">Medium</div>
              </div>
              <div>
                <div style="color: #999; font-size: 11px; margin-bottom: 3px;">CONDITION</div>
                <div style="padding: 8px 10px; background: #f5f5f5; border-radius: 6px;">Like New</div>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
              <div>
                <div style="color: #999; font-size: 11px; margin-bottom: 3px;">PIECES</div>
                <div style="padding: 8px 10px; background: #f5f5f5; border-radius: 6px;">3-piece</div>
              </div>
              <div>
                <div style="color: #999; font-size: 11px; margin-bottom: 3px;">PRICE (USD)</div>
                <div style="padding: 8px 10px; background: #f5f5f5; border-radius: 6px;">$120</div>
              </div>
            </div>
            <div class="tps-photos" style="margin-bottom: 12px;">
              <div class="tps-photo-placeholder">👗</div>
              <div class="tps-photo-placeholder">🏷️</div>
              <div class="tps-photo-placeholder">📏</div>
              <div class="tps-photo-placeholder" style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9);">+</div>
            </div>
            <div style="text-align: center; padding: 10px; background: #25D366; color: white; border-radius: 8px; font-weight: 600;">Submit Listing</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- STEP 6: Success -->
  <div class="tps-step">
    <div class="tps-step-text">
      <div class="tps-step-num">6</div>
      <h2>Done! We Handle the Rest</h2>
      <p>Your listing is submitted for review. We'll notify you on WhatsApp when it's approved and goes live on our store.</p>
      <p>When it sells, you'll get another notification with a <strong>prepaid shipping label</strong> — just pack and ship!</p>
      <div class="tps-payout">
        <p class="tps-payout-big">You Keep 82%</p>
        <p class="tps-payout-sub">We handle photography touch-ups, listing, customer service &amp; payments</p>
      </div>
    </div>
    <div class="tps-step-phone">
      <div class="tps-phone">
        <div class="tps-phone-inner">
          <div class="tps-phone-header">
            <div class="tps-phone-avatar">P</div>
            <div><div class="tps-phone-name">The Phir Story</div><div class="tps-phone-status">online</div></div>
          </div>
          <div class="tps-phone-chat">
            <div class="tps-bubble tps-bubble-in">
              ✅ Success! Your <strong>Sana Safinaz</strong> listing is now in review.<br><br>We'll notify you when it's approved.<br><br>Reply <strong>SELL</strong> to list another item.
              <div class="tps-bubble-time">10:05 AM</div>
            </div>
            <div style="text-align: center; margin: 16px 0 8px;">
              <div style="font-size: 40px;">🎉</div>
              <div style="font-size: 12px; color: #999;">That's it!</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- CTA -->
  <div class="tps-cta">
    <h2>Ready to Start Selling?</h2>
    <p>It takes less than 5 minutes to list your first item</p>
    <div class="tps-cta-btns">
      <a href="${WHATSAPP_LINK}?text=SELL" target="_blank" class="tps-btn tps-btn-wa">💬 Message Us on WhatsApp</a>
      <a href="/pages/sell-with-us" class="tps-btn tps-btn-portal">📱 Use Seller Portal Instead</a>
    </div>
  </div>

  <!-- FAQ -->
  <div class="tps-faq">
    <h3>Frequently Asked Questions</h3>

    <details>
      <summary>What brands do you accept?</summary>
      <p>We accept Pakistani and international designer brands — Sana Safinaz, Khaadi, Agha Noor, Maria B, Elan, HSY, Zara, and many more. Not sure? Just ask us on WhatsApp!</p>
    </details>

    <details>
      <summary>How much does it cost to sell?</summary>
      <p>Listing is completely free. We only take an 18% commission when your item sells. You keep 82% of the sale price.</p>
    </details>

    <details>
      <summary>Can I send a voice note instead of typing?</summary>
      <p>Absolutely! Just record a voice note describing your item and our AI will transcribe and extract all the details. It's the fastest way to list.</p>
    </details>

    <details>
      <summary>How many photos do I need?</summary>
      <p>At least 3 — front view, back view, and the designer label. More photos = faster approval and quicker sales!</p>
    </details>

    <details>
      <summary>How do I ship my item when it sells?</summary>
      <p>We provide a prepaid shipping label right on WhatsApp. Just pack your item and drop it off — no shipping costs for you!</p>
    </details>

    <details>
      <summary>When do I get paid?</summary>
      <p>Payments are processed after the buyer receives the item. We pay weekly via your preferred method.</p>
    </details>
  </div>

</div>
`;

async function main() {
  console.log('Creating Shopify pages...\\n');

  // Create "Sell With Us" page (embedded portal)
  await createPage('Sell With Us', 'sell-with-us', sellWithUsHtml);

  // Create "How to Sell on WhatsApp" page
  await createPage('How to Sell on WhatsApp', 'how-to-sell', howToSellHtml);

  console.log('\\nDone! Add these to your navigation in Shopify Admin → Online Store → Navigation');
}

main().catch(console.error);
