import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Package, Tag, Heart, User, ChevronRight, Clock, CheckCircle, XCircle, ArrowUpDown } from 'lucide-react';
import StoreNav from '../../components/store/StoreNav';
import ListingCard from '../../components/store/ListingCard';
import { LISTINGS, CONDITION_COLORS } from '../../data/mockListings';

const MOCK_ORDERS = [
  { id: 'ORD-1042', title: 'Luxury Lawn 3-Piece', designer: 'Sana Safinaz', amount: 85, status: 'shipped', date: 'Mar 18, 2025', img: LISTINGS[0].images[0] },
  { id: 'ORD-1031', title: 'Embroidered Festive Kurta', designer: 'Elan', amount: 120, status: 'delivered', date: 'Feb 28, 2025', img: LISTINGS[1].images[0] },
];

const MOCK_OFFERS = [
  { id: 'OFF-88', title: 'Chiffon Formal 2-Piece', designer: 'Faraz Manan', offer: 170, listPrice: 200, status: 'pending', img: LISTINGS[2].images[0], expires: '18h' },
  { id: 'OFF-81', title: 'Embroidered Formal 3-Piece', designer: 'Maria B', offer: 130, listPrice: 160, counter: 150, status: 'countered', img: LISTINGS[3].images[0], expires: '6h' },
  { id: 'OFF-74', title: 'Velvet & Silk Winter 3-Piece', designer: 'Baroque', offer: 190, listPrice: 230, status: 'rejected', img: LISTINGS[6].images[0] },
];

const MOCK_LISTINGS = [
  { ...LISTINGS[0], myStatus: 'active', bids: 3, views: 48 },
  { ...LISTINGS[2], myStatus: 'active', bids: 7, views: 112 },
  { ...LISTINGS[4], myStatus: 'sold', bids: 0, views: 22 },
];

const STATUS_STYLES = {
  shipped:   'bg-sky-50 text-sky-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  processing:'bg-amber-50 text-amber-700',
  pending:   'bg-amber-50 text-amber-700',
  countered: 'bg-violet-50 text-violet-700',
  rejected:  'bg-stone-100 text-stone-500',
  accepted:  'bg-emerald-50 text-emerald-700',
  active:    'bg-emerald-50 text-emerald-700',
  sold:      'bg-stone-100 text-stone-500',
};

const TABS = [
  { id: 'orders',   label: 'Orders',   icon: Package },
  { id: 'offers',   label: 'Offers',   icon: ArrowUpDown, badge: 1 },
  { id: 'listings', label: 'Listings', icon: Tag },
  { id: 'saved',    label: 'Saved',    icon: Heart },
  { id: 'profile',  label: 'Profile',  icon: User },
];

export default function AccountPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'orders');
  const [counterAmt, setCounterAmt] = useState('');

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <StoreNav />

      <div className="pt-14 max-w-3xl mx-auto px-4">
        {/* Profile header */}
        <div className="py-8 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-stone-900 flex items-center justify-center">
            <span className="text-xl font-bold text-white">Z</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-stone-900">Zara M.</h1>
            <p className="text-sm text-stone-400">zara@gmail.com · Member since Jan 2024</p>
          </div>
          <Link
            to="/store/sell"
            className="ml-auto px-4 py-2 bg-stone-900 text-white rounded-full text-xs font-medium"
          >
            + List item
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 mb-6 scrollbar-hide border-b border-stone-200">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors relative ${
                tab === id
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              <Icon size={14} />
              {label}
              {badge && (
                <span className="w-4 h-4 bg-amber-600 rounded-full text-white text-[9px] flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ORDERS */}
        {tab === 'orders' && (
          <div className="space-y-3 pb-24 md:pb-8">
            {MOCK_ORDERS.map(order => (
              <div key={order.id} className="bg-white rounded-2xl p-4 flex gap-4 items-start border border-stone-100">
                <img src={order.img} alt="" className="w-16 h-20 rounded-xl object-cover flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">{order.designer}</p>
                      <p className="text-sm font-semibold text-stone-900 mt-0.5">{order.title}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-none ${STATUS_STYLES[order.status]}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">{order.date} · {order.id}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-stone-900">${order.amount}</span>
                    <button className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-0.5">
                      Track order <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* OFFERS */}
        {tab === 'offers' && (
          <div className="space-y-3 pb-24 md:pb-8">
            {MOCK_OFFERS.map(offer => (
              <div key={offer.id} className="bg-white rounded-2xl p-4 border border-stone-100">
                <div className="flex gap-4 items-start">
                  <img src={offer.img} alt="" className="w-14 h-18 rounded-xl object-cover flex-none" style={{height:'4.5rem'}} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">{offer.designer}</p>
                        <p className="text-sm font-semibold text-stone-900 mt-0.5">{offer.title}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-none ${STATUS_STYLES[offer.status]}`}>
                        {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-stone-400">Your offer: <span className="font-semibold text-stone-900">${offer.offer}</span></span>
                      <span className="text-xs text-stone-300">·</span>
                      <span className="text-xs text-stone-400">Listed: <span className="line-through">${offer.listPrice}</span></span>
                    </div>
                    {offer.expires && offer.status !== 'rejected' && (
                      <p className="text-[10px] text-stone-400 mt-1 flex items-center gap-1">
                        <Clock size={9} /> Expires in {offer.expires}
                      </p>
                    )}
                  </div>
                </div>

                {/* Countered state */}
                {offer.status === 'countered' && (
                  <div className="mt-4 p-3 bg-violet-50 rounded-xl">
                    <p className="text-xs font-semibold text-violet-700 mb-3">
                      Seller countered at <span className="text-base font-bold">${offer.counter}</span>
                    </p>
                    <div className="flex gap-2">
                      <button className="flex-1 py-2 bg-stone-900 text-white rounded-full text-xs font-medium flex items-center justify-center gap-1">
                        <CheckCircle size={12} /> Accept ${offer.counter}
                      </button>
                      <button className="flex-1 py-2 border border-stone-200 text-stone-600 rounded-full text-xs font-medium flex items-center justify-center gap-1">
                        Counter back
                      </button>
                      <button className="px-3 py-2 border border-stone-200 text-stone-400 rounded-full text-xs flex items-center justify-center">
                        <XCircle size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Link
              to="/store/shop"
              className="block text-center py-4 border-2 border-dashed border-stone-200 rounded-2xl text-sm text-stone-400 hover:border-stone-400 transition-colors"
            >
              Browse more items to bid on →
            </Link>
          </div>
        )}

        {/* MY LISTINGS */}
        {tab === 'listings' && (
          <div className="space-y-3 pb-24 md:pb-8">
            {MOCK_LISTINGS.map(listing => (
              <div key={listing.id} className="bg-white rounded-2xl p-4 flex gap-4 items-start border border-stone-100">
                <img src={listing.images[0]} alt="" className="w-16 h-20 rounded-xl object-cover flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">{listing.designer}</p>
                      <p className="text-sm font-semibold text-stone-900 mt-0.5">{listing.title}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-none ${STATUS_STYLES[listing.myStatus]}`}>
                      {listing.myStatus.charAt(0).toUpperCase() + listing.myStatus.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Listed at ${listing.price} · Size {listing.size}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
                    <span>{listing.views} views</span>
                    {listing.bids > 0 && (
                      <span className="text-amber-700 font-medium">{listing.bids} active bids</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <Link
              to="/submit"
              className="block text-center py-4 bg-stone-900 text-white rounded-2xl text-sm font-medium"
            >
              + List a new item
            </Link>
          </div>
        )}

        {/* SAVED */}
        {tab === 'saved' && (
          <div className="pb-24 md:pb-8">
            <div className="grid grid-cols-2 gap-4">
              {LISTINGS.filter(l => l.saved || [1,2,5].includes(Number(l.id))).map(l => (
                <ListingCard key={l.id} listing={{ ...l, saved: true }} />
              ))}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {tab === 'profile' && (
          <div className="space-y-4 pb-24 md:pb-8">
            {[
              { label: 'Full name', value: 'Zara M.' },
              { label: 'Email', value: 'zara@gmail.com' },
              { label: 'Phone (WhatsApp)', value: '+1 302 555 0142' },
              { label: 'Shipping address', value: '123 Main St, New York, NY 10001' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-2xl px-4 py-3.5 border border-stone-100 flex justify-between items-center">
                <div>
                  <p className="text-xs text-stone-400">{label}</p>
                  <p className="text-sm font-medium text-stone-900 mt-0.5">{value}</p>
                </div>
                <button className="text-xs text-stone-400 hover:text-stone-900">Edit</button>
              </div>
            ))}
            <button className="w-full py-3 text-sm text-red-500 hover:text-red-700 transition-colors">
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
