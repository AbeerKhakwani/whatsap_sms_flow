import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Truck, RotateCcw } from 'lucide-react';
import StoreNav from '../../components/store/StoreNav';
import ListingCard from '../../components/store/ListingCard';
import { LISTINGS, DESIGNERS } from '../../data/mockListings';

const featured = LISTINGS.slice(0, 6);
const newArrivals = LISTINGS.slice(0, 4);

export default function StoreFront() {
  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <StoreNav />

      {/* Hero */}
      <section className="pt-14 relative overflow-hidden">
        <div className="relative h-[85vh] min-h-[560px] max-h-[780px]">
          <img
            src="https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1400&q=80"
            alt="Hero"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/60" />

          <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 px-6 text-center">
            <p className="text-white/70 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Authenticated Preloved
            </p>
            <h1 className="text-white text-4xl md:text-6xl font-bold tracking-tight leading-none mb-2">
              Pakistani Luxury
            </h1>
            <p className="text-white/80 text-xl md:text-2xl font-light mt-2 mb-8">
              reimagined.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/store/shop"
                className="px-8 py-3.5 bg-white text-stone-900 rounded-full font-semibold text-sm hover:bg-stone-100 transition-colors"
              >
                Shop now
              </Link>
              <Link
                to="/store/sell"
                className="px-8 py-3.5 bg-white/10 backdrop-blur-sm border border-white/30 text-white rounded-full font-medium text-sm hover:bg-white/20 transition-colors"
              >
                Start selling
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-stone-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-around gap-4 text-center">
          {[
            { icon: <Shield size={16} />, text: 'Seller verified' },
            { icon: <Truck size={16} />, text: 'Ships within 7 days' },
            { icon: <RotateCcw size={16} />, text: 'Bid & negotiate' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-stone-500 text-sm">
              <span className="text-amber-700">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Designer row */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-stone-900 tracking-tight">Shop by designer</h2>
          <Link to="/store/shop" className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {DESIGNERS.map((d) => (
            <Link
              key={d}
              to={`/store/shop?designer=${encodeURIComponent(d)}`}
              className="flex-none px-5 py-2.5 rounded-full border border-stone-200 bg-white text-sm text-stone-700 hover:border-stone-900 hover:text-stone-900 transition-colors whitespace-nowrap"
            >
              {d}
            </Link>
          ))}
        </div>
      </section>

      {/* New arrivals */}
      <section className="max-w-6xl mx-auto px-4 pb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-stone-900 tracking-tight">New arrivals</h2>
            <p className="text-sm text-stone-400 mt-0.5">Just listed this week</p>
          </div>
          <Link to="/store/shop" className="text-xs font-medium text-stone-900 border-b border-stone-300 pb-0.5 hover:border-stone-900 transition-colors">
            See all
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {newArrivals.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>

      {/* Sell CTA banner */}
      <section className="mx-4 md:mx-auto max-w-6xl mb-12">
        <div className="rounded-3xl bg-stone-900 overflow-hidden relative">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #d28d30 0%, transparent 60%)' }}
          />
          <div className="relative px-8 py-12 md:py-16 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-amber-400 text-sm tracking-[0.2em] uppercase font-medium mb-2">For sellers</p>
              <h2 className="text-white text-2xl md:text-3xl font-bold tracking-tight">
                Your wardrobe is<br />someone's dream outfit.
              </h2>
              <p className="text-stone-400 text-sm mt-3 max-w-sm">
                List your preloved Pakistani designer pieces. We handle the rest — photos, pricing, buyers.
              </p>
            </div>
            <Link
              to="/store/sell"
              className="flex-none px-8 py-3.5 bg-white text-stone-900 rounded-full font-semibold text-sm hover:bg-stone-100 transition-colors"
            >
              Start selling →
            </Link>
          </div>
        </div>
      </section>

      {/* Featured listings */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-stone-900 tracking-tight">Featured listings</h2>
            <p className="text-sm text-stone-400 mt-0.5">Handpicked by our team</p>
          </div>
          <Link to="/store/shop" className="text-xs font-medium text-stone-900 border-b border-stone-300 pb-0.5">
            Browse all
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {featured.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-t border-stone-200 px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-amber-700 text-xs tracking-[0.25em] uppercase font-semibold mb-3">How it works</p>
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight mb-12">
            Simple. Trusted. Yours.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Browse & bid',
                desc: 'Discover authenticated pieces from verified sellers. Buy instantly or place an offer.',
              },
              {
                step: '02',
                title: 'Seller confirms',
                desc: 'The seller accepts, counters, or declines — you\'re notified immediately.',
              },
              {
                step: '03',
                title: 'It arrives, you love it',
                desc: 'Seller ships within 7 days. Every piece is verified before you pay.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-left">
                <p className="text-4xl font-bold text-stone-100 mb-3">{step}</p>
                <h3 className="text-base font-semibold text-stone-900 mb-2">{title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 px-4 py-8 md:pb-8 pb-24">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-stone-900">پھر</span>
            <span className="text-xs tracking-[0.2em] uppercase text-stone-400">Story</span>
          </div>
          <p className="text-xs text-stone-400">© 2025 The Phir Story. All rights reserved.</p>
          <div className="flex gap-6">
            {['Privacy', 'Terms', 'Contact'].map(l => (
              <a key={l} href="#" className="text-xs text-stone-400 hover:text-stone-700">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
