import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, ArrowRight, Loader2 } from 'lucide-react';

export default function SellerLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('email'); // email or phone
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('input'); // input or verify
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSendCode(e) {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-code',
          ...(mode === 'email' ? { email: identifier } : { phone: identifier })
        })
      });

      const data = await response.json();

      if (data.success) {
        setStep('verify');
        // For dev: auto-fill code if returned
        if (data.code) setCode(data.code);
      } else {
        setError(data.error || 'Failed to send code');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-code',
          ...(mode === 'email' ? { email: identifier } : { phone: identifier }),
          code
        })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('seller_token', data.token);
        localStorage.setItem('seller', JSON.stringify(data.seller));
        navigate('/seller');
      } else {
        setError(data.error || 'Invalid code');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin(response) {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'google', credential: response.credential })
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('seller_token', data.token);
        localStorage.setItem('seller', JSON.stringify(data.seller));
        navigate('/seller');
      } else {
        setError(data.error || 'Google sign in failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Initialize Google Sign In
  useState(() => {
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleGoogleLogin
      });
      window.google.accounts.id.renderButton(
        document.getElementById('google-signin'),
        { theme: 'outline', size: 'large', width: '100%' }
      );
    }
  }, []);

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
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            {step === 'input' ? 'Sign in to your account' : 'Enter verification code'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {step === 'input' ? (
            <>
              {/* Mode Toggle */}
              <div className="flex mb-4 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => { setMode('email'); setIdentifier(''); }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                    mode === 'email'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email
                </button>
                <button
                  onClick={() => { setMode('phone'); setIdentifier(''); }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                    mode === 'phone'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Phone className="w-4 h-4 inline mr-2" />
                  Phone
                </button>
              </div>

              <form onSubmit={handleSendCode}>
                <input
                  type={mode === 'email' ? 'email' : 'tel'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={mode === 'email' ? 'you@example.com' : '+1 (555) 123-4567'}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  disabled={loading}
                />

                <button
                  type="submit"
                  disabled={loading || !identifier.trim()}
                  className="w-full mt-4 bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
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

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Google Sign In */}
              <div id="google-signin" className="flex justify-center"></div>
            </>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <p className="text-sm text-gray-600 mb-4">
                We sent a code to <strong>{identifier}</strong>
              </p>

              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-center text-2xl tracking-widest"
                maxLength={6}
                disabled={loading}
              />

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full mt-4 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Verify & Sign In'
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep('input'); setCode(''); setError(''); }}
                className="w-full mt-3 text-gray-600 text-sm hover:text-gray-900"
              >
                Use a different {mode}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          New seller?{' '}
          <a href="/submit" className="text-green-600 hover:text-green-700 font-medium">
            Submit your first listing
          </a>
        </p>
      </div>
    </div>
  );
}
