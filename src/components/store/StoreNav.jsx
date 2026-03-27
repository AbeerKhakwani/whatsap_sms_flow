import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Heart, User, Menu, X, Search, Tag } from 'lucide-react';

export default function StoreNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Top nav */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#fafaf9]/90 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">

          {/* Logo */}
          <Link to="/store" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-stone-900">پھر</span>
            <span className="text-xs tracking-[0.2em] uppercase text-stone-400 font-medium">Story</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              to="/store/shop"
              className={`text-sm tracking-wide transition-colors ${isActive('/store/shop') ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'}`}
            >
              Shop
            </Link>
            <Link
              to="/store/sell"
              className={`text-sm tracking-wide transition-colors ${isActive('/store/sell') ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'}`}
            >
              Sell
            </Link>
            <Link
              to="/store/how-it-works"
              className="text-sm tracking-wide text-stone-500 hover:text-stone-900 transition-colors"
            >
              How it works
            </Link>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors text-stone-600"
            >
              <Search size={17} />
            </button>

            <Link
              to="/store/account?tab=saved"
              className="w-9 h-9 hidden md:flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors text-stone-600"
            >
              <Heart size={17} />
            </Link>

            <Link
              to="/store/account"
              className="hidden md:flex items-center gap-2 ml-2 pl-3 pr-4 h-9 rounded-full border border-stone-200 hover:border-stone-400 transition-colors text-sm text-stone-700"
            >
              <User size={14} />
              <span>Sign in</span>
            </Link>

            <Link
              to="/store/sell"
              className="hidden md:flex items-center gap-1.5 ml-1 pl-3 pr-4 h-9 rounded-full bg-stone-900 text-white hover:bg-stone-800 transition-colors text-sm font-medium"
            >
              <Tag size={13} />
              <span>List an item</span>
            </Link>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors text-stone-600"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="border-t border-stone-200 px-4 py-3">
            <div className="max-w-6xl mx-auto">
              <input
                autoFocus
                type="text"
                placeholder="Search by designer, style, or keyword..."
                className="w-full text-sm bg-stone-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-amber-700/20 placeholder:text-stone-400"
              />
            </div>
          </div>
        )}
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-[#fafaf9] pt-14">
          <nav className="flex flex-col px-6 py-8 gap-6">
            <Link to="/store/shop" onClick={() => setMenuOpen(false)} className="text-2xl font-medium text-stone-900">Shop</Link>
            <Link to="/store/sell" onClick={() => setMenuOpen(false)} className="text-2xl font-medium text-stone-900">Sell</Link>
            <Link to="/store/account" onClick={() => setMenuOpen(false)} className="text-2xl font-medium text-stone-900">My Account</Link>
            <Link to="/store/how-it-works" onClick={() => setMenuOpen(false)} className="text-2xl text-stone-400">How it works</Link>
            <div className="pt-4 border-t border-stone-200">
              <Link
                to="/store/sell"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-full text-sm font-medium"
              >
                <Tag size={14} />
                List an item
              </Link>
            </div>
          </nav>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#fafaf9]/95 backdrop-blur-md border-t border-stone-200 safe-area-pb">
        <div className="flex items-center justify-around px-2 py-2">
          <Link to="/store" className={`flex flex-col items-center gap-0.5 px-4 py-1 ${isActive('/store') ? 'text-stone-900' : 'text-stone-400'}`}>
            <ShoppingBag size={20} />
            <span className="text-[10px] font-medium">Shop</span>
          </Link>
          <Link to="/store/account?tab=saved" className={`flex flex-col items-center gap-0.5 px-4 py-1 ${location.search.includes('saved') ? 'text-amber-700' : 'text-stone-400'}`}>
            <Heart size={20} />
            <span className="text-[10px] font-medium">Saved</span>
          </Link>
          <Link to="/store/sell" className="flex flex-col items-center gap-0.5 -mt-4">
            <div className="w-12 h-12 rounded-full bg-stone-900 flex items-center justify-center shadow-lg">
              <Tag size={18} className="text-white" />
            </div>
            <span className="text-[10px] font-medium text-stone-400 mt-0.5">Sell</span>
          </Link>
          <Link to="/store/account?tab=offers" className={`flex flex-col items-center gap-0.5 px-4 py-1 relative ${location.search.includes('offers') ? 'text-stone-900' : 'text-stone-400'}`}>
            <ShoppingBag size={20} />
            <span className="text-[10px] font-medium">Offers</span>
            <span className="absolute top-0.5 right-2.5 w-2 h-2 bg-amber-600 rounded-full" />
          </Link>
          <Link to="/store/account" className={`flex flex-col items-center gap-0.5 px-4 py-1 ${isActive('/store/account') ? 'text-stone-900' : 'text-stone-400'}`}>
            <User size={20} />
            <span className="text-[10px] font-medium">Account</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
