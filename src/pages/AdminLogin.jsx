import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight } from 'lucide-react';

// Allowed admin emails
const ADMIN_EMAILS = [
  'thephirstory@gmail.com',
  'admin@thephirstory.com'
];

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  // Check if already logged in
  useEffect(() => {
    const adminEmail = localStorage.getItem('admin_email');
    if (adminEmail && ADMIN_EMAILS.includes(adminEmail.toLowerCase())) {
      navigate('/');
    }
  }, [navigate]);

  function handleLogin(e) {
    e.preventDefault();
    if (!email.trim()) return;

    const normalizedEmail = email.toLowerCase().trim();

    if (ADMIN_EMAILS.includes(normalizedEmail)) {
      localStorage.setItem('admin_email', normalizedEmail);
      localStorage.setItem('admin_token', 'email-auth'); // Keep for backward compat
      navigate('/');
    } else {
      setError('This email is not authorized for admin access');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="The Phir Story" className="h-12 mx-auto mb-2" />
          <p className="text-gray-500">Admin Dashboard</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6 text-center">
            Admin Sign In
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="admin@thephirstory.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!email.trim()}
              className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              Sign In
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
