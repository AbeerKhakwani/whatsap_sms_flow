import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Loader2, ArrowLeft, Check } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function AdminLogin() {
  const navigate = useNavigate();

  // Flow state
  const [step, setStep] = useState('email'); // email -> code
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  // User data
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  // Check if already logged in
  useEffect(() => {
    checkExistingAuth();
  }, [navigate]);

  async function checkExistingAuth() {
    const token = localStorage.getItem('admin_token');

    if (!token || token === 'email-auth') {
      setChecking(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/admin-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'verify' })
      });

      if (res.ok) {
        navigate('/admin/dashboard');
        return;
      }
    } catch (err) {
      // Token invalid, continue to login
    }

    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_email');
    setChecking(false);
  }

  async function handleSendCode(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/admin-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-code', email: email.toLowerCase().trim() })
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

  async function handleVerifyCode(e) {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/admin-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-code',
          email: email.toLowerCase().trim(),
          code
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_email', data.admin.email);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError('');
    setCode('');
    setStep('email');
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="The Phir Story" className="h-12 mx-auto mb-2" />
          <p className="text-gray-500">Admin Dashboard</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

          {/* Step 1: Enter Email */}
          {step === 'email' && (
            <>
              <h2 className="text-lg font-medium text-gray-900 mb-2 text-center">
                Admin Sign In
              </h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                Enter your admin email to receive a verification code
              </p>

              <form onSubmit={handleSendCode}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      placeholder="admin@example.com"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!email.trim() || loading}
                  className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
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

          {/* Step 2: Enter Code */}
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
                We sent a verification code to {email}
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
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={code.length !== 6 || loading}
                  className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
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
                  onClick={handleSendCode}
                  disabled={loading}
                  className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm py-2"
                >
                  Didn't receive it? Send again
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
