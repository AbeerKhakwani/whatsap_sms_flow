import { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Settings, LogOut, Loader2, Terminal, Tag, Bell, Activity } from 'lucide-react';
import { activityConfig, timeAgo } from '../pages/ActivityFeed';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  const [activity, setActivity] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

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

    verifyToken(token);
  }, [navigate]);

  useEffect(() => {
    if (!verified) return;
    fetchActivity();
    // Preload listings cache in the background so /listings is instant
    fetch(`${API_URL}/api/admin-listings?action=all-listings`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    }).then(r => r.json()).then(d => {
      if (d.listings) {
        try { localStorage.setItem('admin_listings_cache', JSON.stringify({ listings: d.listings, total: d.total, missing: d.missing })); } catch {}
      }
    }).catch(() => {});

    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [verified]);

  async function fetchActivity() {
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=activity&limit=15`);
      const data = await res.json();
      if (data.success) {
        const items = data.activity || [];
        setActivity(items);
        const lastSeen = localStorage.getItem('activity_last_seen');
        const count = lastSeen
          ? items.filter(a => new Date(a.createdAt) > new Date(lastSeen)).length
          : items.length;
        setUnreadCount(count);
      }
    } catch {}
  }

  function openBell() {
    setBellOpen(prev => !prev);
    setUnreadCount(0);
    localStorage.setItem('activity_last_seen', new Date().toISOString());
  }

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
    { name: 'Listings', path: '/admin/listings', icon: Tag },
    { name: 'Transactions', path: '/admin/transactions', icon: DollarSign },
    { name: 'Activity', path: '/admin/activity', icon: Activity },
    { name: 'Scripts', path: '/admin/scripts', icon: Terminal },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_email');
    navigate('/admin');
  }

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
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Top bar with bell */}
        <div className="flex items-center justify-end px-6 py-3 border-b border-stone-200 bg-white flex-shrink-0">
          <div ref={bellRef} className="relative">
            <button
              onClick={openBell}
              className="relative p-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-semibold text-gray-900 text-sm">Recent Activity</span>
                  <Link
                    to="/admin/activity"
                    onClick={() => setBellOpen(false)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View all →
                  </Link>
                </div>

                {activity.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">No activity yet</div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                    {activity.map((item) => {
                      const cfg = activityConfig(item);
                      return (
                        <div key={item.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5 ${cfg.color}`}>
                            {cfg.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-800 leading-snug">{cfg.label}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5 whitespace-nowrap">
                            {timeAgo(item.createdAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                  <Link
                    to="/admin/activity"
                    onClick={() => setBellOpen(false)}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    See full activity log →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
