import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, ArrowRight, Loader2, ArrowLeft, Check, X, MessageCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function SellerLogin() {
  const navigate = useNavigate();

  // Flow state: email -> channel -> (addPhone if needed) -> code -> (promptPhone after login)
  const [step, setStep] = useState('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // User data
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState('email');

  // User info from check
  const [userInfo, setUserInfo] = useState(null);
  const [showSplash, setShowSplash] = useState(true);

  const normalizedEmail = email.toLowerCase().trim();

  // Show splash screen on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Splash Screen
  if (showSplash) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center relative">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover absolute inset-0"
        >
          <source src="/loading.mov" type="video/quicktime" />
          <source src="/loading.mp4" type="video/mp4" />
        </video>
      </div>
    );
  }

  // Step 1: Check if user exists and get their info
  async function handleCheckEmail(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-user', identifier: normalizedEmail })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to check user');
      }

      setUserInfo(data);
      setStep('channel');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Send code via selected channel
  async function handleSendCode(selectedChannel) {
    // If WhatsApp selected but no phone on file, show add phone form
    if (selectedChannel === 'whatsapp' && !userInfo?.hasPhone && !phone) {
      setChannel('whatsapp');
      setStep('addPhone');
      return;
    }

    setLoading(true);
    setError('');
    setChannel(selectedChannel);

    try {
      const body = {
        action: 'send-code',
        channel: selectedChannel,
        email: normalizedEmail
      };

      // Include phone if adding new one
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
        throw new Error(data.error || 'Failed to send code');
      }

      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Handle adding phone and sending WhatsApp code
  async function handleAddPhoneAndSend(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    await handleSendCode('whatsapp');
  }

  // Step 3: Verify code
  async function handleVerifyCode(e) {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setError('');

    try {
      const body = {
        action: 'verify-code',
        identifier: normalizedEmail,
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

      // Store token
      localStorage.setItem('seller_token', data.token);
      localStorage.setItem('seller_email', data.seller.email || '');

      // If seller still has no phone (logged in via email), prompt to add
      if (!data.seller.phone && !phone) {
        setStep('promptPhone');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Add phone after login (optional)
  async function handleAddPhoneAfterLogin(e) {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-phone',
          email: normalizedEmail,
          phone: phone.replace(/\D/g, '')
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update phone');
      }

      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function skipAddPhone() {
    navigate('/');
  }

  function handleBack() {
    setError('');
    if (step === 'code') {
      setCode('');
      setStep('channel');
    } else if (step === 'channel') {
      setStep('email');
    } else if (step === 'addPhone') {
      setPhone('');
      setStep('channel');
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

          {/* Step 1: Enter Email */}
          {step === 'email' && (
            <>
              <h2 className="text-lg font-medium text-gray-900 mb-2 text-center">
                Welcome
              </h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                Enter your email to sign in or create an account
              </p>

              <form onSubmit={handleCheckEmail}>
                <div className="mb-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
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
                  disabled={!email.trim() || loading}
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

          {/* Step 2: Choose Channel - Two Equal Buttons */}
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
                {userInfo?.exists ? `Welcome back${userInfo?.name ? `, ${userInfo.name}` : ''}!` : 'Verify your email'}
              </h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                Tap below to receive your verification code to login
              </p>

              {error && (
                <p className="text-red-600 text-sm mb-4 text-center">{error}</p>
              )}

              <div className="space-y-3">
                {/* Email Button */}
                <button
                  onClick={() => handleSendCode('email')}
                  disabled={loading}
                  className="w-full border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 p-4 rounded-lg flex items-center gap-4 transition disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <Mail className="w-6 h-6 text-gray-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-medium text-gray-900">Send to Email</p>
                    <p className="text-sm text-gray-500">{email}</p>
                  </div>
                  {loading && channel === 'email' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  ) : (
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* WhatsApp Button - COMMENTED OUT - Will add back later as feature */}
                {/* <button
                  onClick={() => handleSendCode('whatsapp')}
                  disabled={loading}
                  className="w-full border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 p-4 rounded-lg flex items-center gap-4 transition disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-medium text-gray-900">Send to WhatsApp</p>
                    <p className="text-sm text-gray-500">
                      {userInfo?.hasPhone ? 'Phone on file' : 'Add your number'}
                    </p>
                  </div>
                  {loading && channel === 'whatsapp' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  ) : (
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  )}
                </button> */}
              </div>
            </>
          )}

          {/* Step 2b: Add Phone (when WhatsApp selected but no phone on file) */}
          {step === 'addPhone' && (
            <>
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-900">
                    No WhatsApp number on file
                  </h2>
                </div>
              </div>

              <p className="text-sm text-gray-500 mb-6">
                Add your WhatsApp number to receive the verification code
              </p>

              <form onSubmit={handleAddPhoneAndSend}>
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
                      <MessageCircle className="w-4 h-4" />
                      Send WhatsApp Code
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('channel'); setPhone(''); }}
                  className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm py-2"
                >
                  Use email instead
                </button>
              </form>
            </>
          )}

          {/* Step 3: Enter Code */}
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
                  : `We sent a code to ${email}`}
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
                  onClick={() => handleSendCode(channel)}
                  disabled={loading}
                  className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm py-2"
                >
                  Didn't receive it? Send again
                </button>
              </form>
            </>
          )}

          {/* Step 4: Prompt to add phone after login (optional) */}
          {step === 'promptPhone' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">
                  One more thing!
                </h2>
                <button
                  onClick={skipAddPhone}
                  className="text-gray-400 hover:text-gray-600"
                  title="Skip"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-500 mb-6">
                Add your WhatsApp number to get instant updates when your items are approved or sold.
              </p>

              <form onSubmit={handleAddPhoneAfterLogin}>
                <div className="mb-4">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    We'll send you WhatsApp notifications for approvals, sales, and payouts
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
                      Add WhatsApp
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={skipAddPhone}
                  className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm py-2"
                >
                  Skip for now
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
