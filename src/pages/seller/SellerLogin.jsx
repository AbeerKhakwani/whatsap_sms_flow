import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, ArrowRight, Loader2, MessageCircle, ArrowLeft, Check } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function SellerLogin() {
  const navigate = useNavigate();

  // Flow state
  const [step, setStep] = useState('identifier'); // identifier -> phone -> channel -> code
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // User data
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState('email'); // email or whatsapp

  // User info from check
  const [userInfo, setUserInfo] = useState(null);

  const isEmail = identifier.includes('@');
  const normalizedIdentifier = isEmail ? identifier.toLowerCase().trim() : identifier.replace(/\D/g, '');

  async function handleCheckUser(e) {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-user', identifier: normalizedIdentifier })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to check user');
      }

      setUserInfo(data);

      // Decide next step based on user status
      if (isEmail) {
        // Email entered
        if (data.exists && data.hasPhone) {
          // Existing user with phone - offer channel choice
          setStep('channel');
        } else if (data.exists && !data.hasPhone) {
          // Existing user without phone - need to add phone
          setStep('phone');
        } else {
          // New user - need phone
          setStep('phone');
        }
      } else {
        // Phone entered - just send WhatsApp code
        await sendCode('whatsapp');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPhone(e) {
    e.preventDefault();
    if (!phone.trim()) return;

    // After adding phone, send email verification code
    await sendCode('email');
  }

  async function sendCode(selectedChannel) {
    setLoading(true);
    setError('');

    try {
      const body = {
        action: 'send-code',
        channel: selectedChannel
      };

      if (isEmail) {
        body.email = normalizedIdentifier;
        if (phone) body.phone = phone.replace(/\D/g, '');
      } else {
        body.phone = normalizedIdentifier;
      }

      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send code');
      }

      setChannel(data.channel);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setError('');

    try {
      const body = {
        action: 'verify-code',
        identifier: isEmail ? normalizedIdentifier : normalizedIdentifier,
        code
      };

      // Include phone if it was added
      if (phone) {
        body.phone = phone.replace(/\D/g, '');
      }

      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      // Store token and redirect
      localStorage.setItem('seller_token', data.token);
      localStorage.setItem('seller_email', data.seller.email || '');
      navigate('/seller');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError('');
    if (step === 'code') {
      setCode('');
      setStep(userInfo?.hasPhone ? 'channel' : 'phone');
    } else if (step === 'channel') {
      setStep('identifier');
    } else if (step === 'phone') {
      setStep('identifier');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="The Phir Story" className="h-12 mx-auto mb-2" />
          <p className="text-gray-500">Seller Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

          {/* Step 1: Enter Email or Phone */}
          {step === 'identifier' && (
            <>
              <h2 className="text-lg font-medium text-gray-900 mb-2 text-center">
                Welcome Back
              </h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                Enter your email or phone number to sign in
              </p>

              <form onSubmit={handleCheckUser}>
                <div className="mb-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Email or phone number"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-600 text-sm mb-4 text-center">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={!identifier.trim() || loading}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Step 2: Add Phone (for new users or existing without phone) */}
          {step === 'phone' && (
            <>
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <h2 className="text-lg font-medium text-gray-900 mb-2 text-center">
                {userInfo?.exists ? 'Add Your Phone' : 'Almost There'}
              </h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                {userInfo?.exists
                  ? 'Add your phone number for easier login next time'
                  : 'Enter your phone for verification and future logins'}
              </p>

              <form onSubmit={handleAddPhone}>
                <div className="mb-4">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                      required
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    We'll send a verification code to your email
                  </p>
                </div>

                {error && (
                  <p className="text-red-600 text-sm mb-4 text-center">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={!phone.trim() || loading}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Send Code
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Step 3: Choose Channel (for returning users with phone) */}
          {step === 'channel' && (
            <>
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <h2 className="text-lg font-medium text-gray-900 mb-2 text-center">
                Welcome back{userInfo?.name ? `, ${userInfo.name}` : ''}!
              </h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                We'll send a verification code to your WhatsApp
              </p>

              {error && (
                <p className="text-red-600 text-sm mb-4 text-center">{error}</p>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => sendCode('whatsapp')}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg flex items-center gap-4 transition disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-medium">Send WhatsApp Code</p>
                  </div>
                  {loading && channel === 'whatsapp' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <ArrowRight className="w-5 h-5 text-white" />
                  )}
                </button>

                <button
                  onClick={() => sendCode('email')}
                  disabled={loading}
                  className="w-full text-gray-500 hover:text-gray-700 text-sm py-2 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && channel === 'email' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Send to email instead</>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step 4: Enter Code */}
          {step === 'code' && (
            <>
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <h2 className="text-lg font-medium text-gray-900 mb-2 text-center">
                Enter Code
              </h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                {channel === 'whatsapp'
                  ? 'We sent a code to your WhatsApp'
                  : `We sent a code to ${identifier}`}
              </p>

              <form onSubmit={handleVerifyCode}>
                <div className="mb-4">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                    maxLength={6}
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Code expires in 10 minutes
                  </p>
                </div>

                {error && (
                  <p className="text-red-600 text-sm mb-4 text-center">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={code.length !== 6 || loading}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Verify & Sign In
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => sendCode(channel)}
                  disabled={loading}
                  className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm py-2"
                >
                  Didn't receive it? Send again
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          By signing in, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}
