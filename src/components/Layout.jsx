import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Settings, LogOut, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  // Auth check with token verification
  useEffect(() => {
    const token = localStorage.getItem('admin_token');

    if (!token) {
      navigate('/admin');
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
        navigate('/admin');
      }
    } catch (err) {
      console.error('Auth error:', err);
      navigate('/admin');
    }
  }

  const navigation = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Sellers', path: '/admin/sellers', icon: Users },
    { name: 'Transactions', path: '/admin/transactions', icon: DollarSign },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_email');
    navigate('/admin');
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
    <div className="flex h-screen bg-stone-50">
      {/* Sidebar */}
      <div className="w-64 bg-stone-100 border-r border-stone-200 flex flex-col">
        <div className="p-5 border-b border-stone-200">
          <img src="/logo.svg" alt="The Phir Story" className="h-12" />
          <p className="text-[10px] text-stone-400 mt-2 uppercase tracking-widest font-medium">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm
                  ${isActive
                    ? 'bg-stone-800 text-white font-medium'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
                  }
                `}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-stone-200">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 w-full text-left text-stone-400 hover:text-stone-700 transition text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
