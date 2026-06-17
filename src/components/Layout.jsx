import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Settings, LogOut, Loader2, Terminal, Tag, Bell, Activity, Wand2, Search, Menu, X } from 'lucide-react';
import { activityConfig, timeAgo } from '../pages/ActivityFeed';
import SearchPalette from './SearchPalette';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  const [activity, setActivity] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bellRef = useRef(null);

  // Close the mobile nav drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

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
    // Preload listings cache in the background so /listings is instant.
    // Merge carefully: don't overwrite listings that were recently saved (hasSeller: true)
    // with stale API data that might still be in-flight from before the cache was updated.
    fetch(`${API_URL}/api/admin-listings?action=all-listings`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
    }).then(r => r.json()).then(d => {
      if (d.listings) {
        try {
          const existing = localStorage.getItem('admin_listings_cache');
          if (existing) {
            const prev = JSON.parse(existing);
            // Preserve any listings that the user already assigned a seller to
            // (hasSeller: true in localStorage but not yet in API response)
            const prevMap = Object.fromEntries((prev.listings || []).map(l => [l.id, l]));
            const merged = d.listings.map(l => {
              const p = prevMap[l.id];
              // Keep the locally-updated version if it has a seller and the API doesn't yet
              if (p && p.hasSeller && !l.hasSeller) return p;
              return l;
            });
            localStorage.setItem('admin_listings_cache', JSON.stringify({ listings: merged, total: d.total, missing: merged.filter(l => !l.hasSeller).length }));
          } else {
            localStorage.setItem('admin_listings_cache', JSON.stringify({ listings: d.listings, total: d.total, missing: d.missing }));
          }
        } catch {}
      }
    }).catch(() => {});

    const clickHandler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    const keyHandler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(s => !s);
      }
    };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
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
        localStorage.removeItem('admin_name');
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
    { name: 'Cleanup', path: '/admin/cleanup', icon: Wand2 },
    { name: 'Scripts', path: '/admin/scripts', icon: Terminal },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_email');
    localStorage.removeItem('admin_name');
    navigate('/admin');
  }

  if (!verified) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const NavLinks = ({ onItem }) => (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {navigation.map((item) => {
        const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onItem}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm
              ${isActive
                ? 'bg-stone-800 text-white font-medium'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
              }
            `}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen bg-stone-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-stone-100 border-r border-stone-200 flex-col">
        <div className="p-5 border-b border-stone-200">
          <img src="/logo.svg" alt="The Phir Story" className="h-12" />
          <p className="text-[10px] text-stone-400 mt-2 uppercase tracking-widest font-medium">Admin Dashboard</p>
        </div>
        <NavLinks />
        <div className="p-3 border-t border-stone-200">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 w-full text-left text-stone-400 hover:text-stone-700 transition text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[82%] bg-stone-100 flex flex-col h-full">
            <div className="p-5 border-b border-stone-200 flex items-center justify-between">
              <img src="/logo.svg" alt="The Phir Story" className="h-10" />
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-2 text-stone-500 hover:text-stone-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavLinks onItem={() => setDrawerOpen(false)} />
            <div className="p-3 border-t border-stone-200">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 w-full text-left text-stone-500 hover:text-stone-800 transition text-sm"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Top bar with burger (mobile) + search + bell */}
        <div className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-stone-200 bg-white flex-shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="lg:hidden p-2 -ml-1 text-stone-600 hover:text-stone-900"
          >
            <Menu className="w-6 h-6" />
          </button>
          <img src="/logo.svg" alt="The Phir Story" className="h-7 lg:hidden" />
          {/* Search trigger */}
          <button
            onClick={openSearch}
            className="flex items-center gap-2 flex-1 max-w-xs px-3 py-1.5 text-sm text-stone-400 bg-stone-50 border border-stone-200 rounded-lg hover:border-stone-300 hover:text-stone-600 transition text-left"
          >
            <Search className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Search anything…</span>
            <kbd className="hidden sm:block text-[10px] text-stone-300 font-mono">⌘K</kbd>
          </button>

          <div ref={bellRef} className="relative ml-auto">
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

        <div className="p-4 lg:p-6 flex-1 overflow-auto">
          {children}
        </div>
      </div>

      <SearchPalette open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
