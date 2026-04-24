import { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Home, Package, DollarSign, Tag, User, Plus, LogOut, ShoppingBag, AlertCircle } from 'lucide-react';
import ImpersonationBanner from '../../components/ImpersonationBanner';
import { installImpersonationFetch, uninstallImpersonationFetch } from '../../lib/impersonation';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: Home, path: '/' },
  { id: 'listings', label: 'My Listings', icon: Package, path: '/seller/profile?tab=listings' },
  { id: 'sales', label: 'My Sales', icon: ShoppingBag, path: '/seller/profile?tab=sales' },
  { id: 'balance', label: 'My Balance', icon: DollarSign, path: '/seller/profile?tab=balance' },
  { id: 'profile', label: 'Profile', icon: User, path: '/seller/profile?tab=profile' },
];

export default function SellerLayout({ children, seller, email, onLogout, revisionCount = 0 }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    installImpersonationFetch();
    return () => uninstallImpersonationFetch();
  }, []);

  function getActiveNav() {
    const path = location.pathname;
    const tab = searchParams.get('tab');
    if (path === '/' || path === '/seller') return 'dashboard';
    if (path === '/seller/profile' || path === '/profile') return tab || 'sales';
    return 'dashboard';
  }

  const activeNav = getActiveNav();
  const initials = (seller?.name || email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-20 md:pb-0" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ImpersonationBanner />

      {/* Desktop Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-100 hidden md:block sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="The Phir Story" className="h-8" />
          </Link>
          <div className="flex items-center gap-3">
            {revisionCount > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full text-xs font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                {revisionCount} listing{revisionCount > 1 ? 's' : ''} need{revisionCount === 1 ? 's' : ''} update
              </div>
            )}
            <Link
              to="/submit"
              className="flex items-center gap-2 bg-[#C91A2B] hover:bg-[#a81523] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Submit Listing
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="bg-white border-b border-gray-100 md:hidden sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <img src="/logo.svg" alt="The Phir Story" className="h-7" />
          </Link>
          <div className="flex items-center gap-2">
            {revisionCount > 0 && (
              <span className="w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {revisionCount}
              </span>
            )}
            <Link
              to="/seller/profile?tab=profile"
              className="w-9 h-9 rounded-full bg-gradient-to-br from-[#C91A2B] to-[#d28d30] flex items-center justify-center text-white text-xs font-bold shadow-sm"
            >
              {initials}
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 md:hidden z-50">
        <div className="flex items-center justify-around py-1">
          <Link to="/" className={`flex flex-col items-center py-2 px-3 gap-0.5 ${activeNav === 'dashboard' ? 'text-[#C91A2B]' : 'text-gray-400'}`}>
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium">Home</span>
          </Link>
          <Link to="/seller/profile?tab=listings" className={`flex flex-col items-center py-2 px-3 gap-0.5 ${activeNav === 'listings' ? 'text-[#C91A2B]' : 'text-gray-400'}`}>
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-medium">Listings</span>
          </Link>
          <Link to="/submit" className="flex flex-col items-center -mt-5">
            <div className="w-14 h-14 bg-[#C91A2B] rounded-full flex items-center justify-center shadow-lg shadow-red-200">
              <Plus className="w-7 h-7 text-white" />
            </div>
            <span className="text-[10px] font-medium text-[#C91A2B] mt-0.5">Sell</span>
          </Link>
          <Link to="/seller/profile?tab=sales" className={`flex flex-col items-center py-2 px-3 gap-0.5 ${activeNav === 'sales' ? 'text-[#C91A2B]' : 'text-gray-400'}`}>
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] font-medium">Sales</span>
          </Link>
          <Link to="/seller/profile?tab=profile" className={`flex flex-col items-center py-2 px-3 gap-0.5 ${activeNav === 'profile' ? 'text-[#C91A2B]' : 'text-gray-400'}`}>
            <User className="w-5 h-5" />
            <span className="text-[10px] font-medium">Profile</span>
          </Link>
        </div>
      </nav>

      {/* Desktop Layout: Sidebar + Content */}
      <div className="hidden md:flex max-w-7xl mx-auto">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-gray-100 min-h-[calc(100vh-56px)] sticky top-14 self-start flex flex-col overflow-y-auto">
          {/* Profile card */}
          <div className="p-5 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#C91A2B] to-[#d28d30] flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-white font-bold text-sm">{initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 text-sm truncate">{seller?.name || 'Seller'}</p>
                <p className="text-xs text-gray-400 truncate">{email}</p>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          {seller && (
            <div className="px-5 py-4 border-b border-gray-50 bg-gradient-to-b from-[#FAF9F7] to-white">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">${(seller.totalEarnings || 0).toFixed(0)}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Paid Out</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-600">${(seller.pendingPayout || 0).toFixed(0)}</p>
                  <p className="text-[10px] text-amber-600/70 uppercase tracking-wider font-medium">Pending</p>
                </div>
              </div>
            </div>
          )}

          {/* Nav */}
          <nav className="py-3 px-2 flex-1">
            {NAV_ITEMS.map(item => {
              const isActive = activeNav === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl mb-0.5 text-sm transition-all ${
                    isActive
                      ? 'bg-[#fef2f2] text-[#C91A2B] font-semibold border-l-4 border-[#C91A2B]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="p-3 border-t border-gray-50">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-6 max-w-4xl">
          {children}
        </main>
      </div>

      {/* Mobile Content */}
      <div className="md:hidden">
        {children}
      </div>
    </div>
  );
}
