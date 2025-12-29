// api/auth/send-code.js
// Send magic code to email or phone

import { generateCode, storeVerificationCode, sendEmailCode, sendSMSCode } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Please provide email or phone' });
    }

    const identifier = email || phone;
    const code = generateCode();

    // Store the code
    await storeVerificationCode(identifier, code);

    // Send the code
    if (email) {
      await sendEmailCode(email, code);
    } else {
      await sendSMSCode(phone, code);
    }

    return res.status(200).json({
      success: true,
      message: `Code sent to ${email ? 'email' : 'phone'}`,
      // In dev, return code for testing (remove in production!)
      ...(process.env.NODE_ENV === 'development' && { code })
    });

  } catch (error) {
    console.error('Send code error:', error);
    return res.status(500).json({ error: error.message });
  }
}
