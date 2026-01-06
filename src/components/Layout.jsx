import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Users, DollarSign, Settings, Send, LogOut, Upload, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  // Auth check with token verification
  useEffect(() => {
    const token = localStorage.getItem('admin_token');

    if (!token) {
      navigate('/login');
      return;
    }

    // Skip API verification for old email-auth tokens (backward compat)
    if (token === 'email-auth') {
      setVerified(true);
      return;
    }

    // Verify JWT token
    verifyToken(token);
  }, [navigate]);

  async function verifyToken(token) {
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
        setVerified(true);
      } else {
        // Token invalid
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_email');
        navigate('/login');
      }
    } catch (err) {
      console.error('Auth error:', err);
      navigate('/login');
    }
  }

  const navigation = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Listings', path: '/listings', icon: Package },
    { name: 'Sellers', path: '/sellers', icon: Users },
    { name: 'Transactions', path: '/transactions', icon: DollarSign },
    { name: 'Import', path: '/import', icon: Upload },
    { name: 'Test SMS', path: '/test-sms', icon: Send },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_email');
    navigate('/login');
  }

  // Show loading while verifying
  if (!verified) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-gradient-to-b from-primary-500 to-primary-600 text-white flex flex-col">
        <div className="p-6 border-b border-primary-400">
          <h1 className="text-2xl font-bold">The Phir Story</h1>
          <p className="text-sm text-primary-100 mt-1">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                  ${isActive
                    ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-700'
                    : 'text-white hover:bg-primary-400/50'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-primary-400">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 w-full text-left text-primary-100 hover:text-white transition"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
