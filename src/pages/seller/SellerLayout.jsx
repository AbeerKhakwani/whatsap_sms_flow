import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Home, Package, DollarSign, Tag, User, Plus, LogOut, ShoppingBag, ChevronRight } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/' },
  { id: 'listings', label: 'My Listings', icon: Package, path: '/seller/profile?tab=listings' },
  { id: 'sales', label: 'My Sales', icon: ShoppingBag, path: '/seller/profile?tab=sales' },
  { id: 'balance', label: 'My Balance', icon: DollarSign, path: '/seller/profile?tab=balance', comingSoon: false },
  { id: 'offers', label: 'My Offers', icon: Tag, path: '/seller/profile?tab=offers', comingSoon: true },
  { id: 'profile', label: 'Profile', icon: User, path: '/seller/profile?tab=profile' },
];

export default function SellerLayout({ children, seller, email, onLogout }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  function getActiveNav() {
    const path = location.pathname;
    const tab = searchParams.get('tab');

    if (path === '/' || path === '/seller') {
      return 'dashboard';
    }
    if (path === '/seller/profile' || path === '/profile') {
      return tab || 'sales';
    }
    return 'dashboard';
  }

  const activeNav = getActiveNav();

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header - Desktop */}
      <header className="bg-white border-b border-gray-200 hidden md:block sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <img src="/logo.svg" alt="The Phir Story" className="h-8" />
            </Link>
            <span className="text-sm text-gray-500 border-l border-gray-200 pl-3">Seller Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/submit"
              className="flex items-center gap-2 bg-[#C91A2B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a81523] transition"
            >
              <Plus className="w-4 h-4" />
              Submit Listing
            </Link>
          </div>
        </div>
      </header>

      {/* Header - Mobile */}
      <header className="bg-white border-b border-gray-200 md:hidden sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="w-10" />
          <Link to="/">
            <img src="/logo.svg" alt="The Phir Story" className="h-7" />
          </Link>
          <Link
            to="/seller/profile?tab=profile"
            className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200"
          >
            <User className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50 safe-area-pb">
        <div className="flex items-center justify-around py-2">
          <Link
            to="/"
            className={`flex flex-col items-center py-2 px-4 ${activeNav === 'dashboard' ? 'text-[#C91A2B]' : 'text-gray-500'}`}
          >
            <Home className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Home</span>
          </Link>
          <Link
            to="/submit"
            className="flex flex-col items-center py-2 px-6 -mt-4 bg-[#C91A2B] text-white rounded-full shadow-lg"
          >
            <Plus className="w-7 h-7" />
            <span className="text-xs mt-0.5 font-medium">Sell</span>
          </Link>
          <Link
            to="/seller/profile"
            className={`flex flex-col items-center py-2 px-4 ${activeNav !== 'dashboard' ? 'text-[#C91A2B]' : 'text-gray-500'}`}
          >
            <User className="w-6 h-6" />
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </div>
      </nav>

      {/* Desktop Layout: Sidebar + Content */}
      <div className="hidden md:flex">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] sticky top-[65px] self-start">
          {/* User info */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{email || seller?.email}</p>
                <p className="text-sm text-gray-500">Seller Account</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="py-2">
            {NAV_ITEMS.map(item => {
              const isActive = activeNav === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.comingSoon ? '#' : item.path}
                  onClick={item.comingSoon ? (e) => e.preventDefault() : undefined}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${
                    isActive
                      ? 'bg-gray-100 text-gray-900 font-medium border-l-4 border-[#C91A2B]'
                      : item.comingSoon
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                  {item.comingSoon && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Soon</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="border-t border-gray-200 mt-2 pt-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 max-w-4xl">
          {children}
        </main>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        {children}
      </div>
    </div>
  );
}
