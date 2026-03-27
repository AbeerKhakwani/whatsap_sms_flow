import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, ArrowLeft, Share2, Shield, ChevronLeft, ChevronRight, X } from 'lucide-react';
import StoreNav from '../../components/store/StoreNav';
import ListingCard from '../../components/store/ListingCard';
import { LISTINGS, CONDITION_COLORS } from '../../data/mockListings';

function BidModal({ listing, onClose }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('bid'); // bid | confirm | sent

  const saving = amount ? listing.price - Number(amount) : 0;
  const savingPct = amount ? Math.round((saving / listing.price) * 100) : 0;
  const valid = amount && Number(amount) >= 10 && Number(amount) < listing.price;

  if (step === 'sent') {
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎉</span>
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">Offer sent!</h3>
          <p className="text-sm text-stone-500 mb-1">
            Your offer of <span className="font-semibold text-stone-900">${amount}</span> has been sent to the seller.
          </p>
          <p className="text-xs text-stone-400 mb-6">
            You'll be notified by WhatsApp and email when they respond. Offer expires in 48 hours.
          </p>
          <button onClick={onClose} className="w-full py-3 bg-stone-900 text-white rounded-full text-sm font-medium">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl overflow-hidden">
        {/* Handle */}
        <div className="md:hidden w-10 h-1 bg-stone-300 rounded-full mx-auto mt-3" />

        <div className="px-6 py-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="font-bold text-stone-900 text-lg">Make an offer</h3>
              <p className="text-sm text-stone-500 mt-0.5">{listing.designer} — {listing.title}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100">
              <X size={16} />
            </button>
          </div>

          {/* Listed price context */}
          <div className="bg-stone-50 rounded-2xl p-4 mb-5">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Listed at</span>
              <span className="font-semibold text-stone-900">${listing.price}</span>
            </div>
            {listing.highestBid && (
              <div className="flex justify-between text-sm mt-2">
                <span className="text-stone-500">Highest bid</span>
                <span className="font-semibold text-amber-700">${listing.highestBid}</span>
              </div>
            )}
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 block">
              Your offer
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-medium">$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min={10}
                max={listing.price - 1}
                className="w-full pl-8 pr-4 py-3.5 text-2xl font-bold border-2 border-stone-200 rounded-2xl focus:border-stone-900 outline-none transition-colors"
              />
            </div>
            {amount && valid && (
              <p className="text-xs text-emerald-600 mt-2">
                You save ${saving} ({savingPct}% off listed price)
              </p>
            )}
            {amount && !valid && Number(amount) >= listing.price && (
              <p className="text-xs text-red-500 mt-2">
                Offer must be below the listed price of ${listing.price}
              </p>
            )}
          </div>

          {/* Note */}
          <div className="mb-6">
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 block">
              Note to seller <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. I love this piece, would you consider a slight discount?"
              rows={2}
              className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm resize-none focus:border-stone-400 outline-none transition-colors placeholder:text-stone-300"
            />
          </div>

          {/* Terms */}
          <p className="text-xs text-stone-400 text-center mb-4">
            If accepted, you'll receive a checkout link and have 24 hours to complete payment.
          </p>

          <button
            disabled={!valid}
            onClick={() => setStep('sent')}
            className="w-full py-4 bg-stone-900 text-white rounded-full font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-800 transition-colors"
          >
            {valid ? `Send offer — $${amount}` : 'Enter an offer amount'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ItemPage() {
  const { id } = useParams();
  const listing = LISTINGS.find(l => l.id === id) || LISTINGS[0];
  const related = LISTINGS.filter(l => l.id !== listing.id && l.designer === listing.designer).slice(0, 4);
  const fallbackRelated = LISTINGS.filter(l => l.id !== listing.id).slice(0, 4);

  const [imgIndex, setImgIndex] = useState(0);
  const [saved, setSaved] = useState(listing.saved);
  const [bidOpen, setBidOpen] = useState(false);

  const nextImg = () => setImgIndex(i => (i + 1) % listing.images.length);
  const prevImg = () => setImgIndex(i => (i - 1 + listing.images.length) % listing.images.length);

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <StoreNav />

      <div className="pt-14">
        {/* Back */}
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link to="/store/shop" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
            <ArrowLeft size={14} />
            Back to shop
          </Link>
        </div>

        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
            {/* Gallery */}
            <div>
              {/* Main image */}
              <div className="relative rounded-3xl overflow-hidden bg-stone-100 aspect-[3/4]">
                <img
                  src={listing.images[imgIndex]}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
                {listing.images.length > 1 && (
                  <>
                    <button
                      onClick={prevImg}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={nextImg}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
                {/* Dot indicators */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {listing.images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIndex(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imgIndex ? 'bg-white' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              </div>

              {/* Thumbnails */}
              {listing.images.length > 1 && (
                <div className="flex gap-2 mt-3">
                  {listing.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIndex(i)}
                      className={`w-16 h-20 rounded-xl overflow-hidden flex-none border-2 transition-colors ${i === imgIndex ? 'border-stone-900' : 'border-transparent'}`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="md:sticky md:top-20 md:self-start">
              {/* Designer + actions */}
              <div className="flex items-start justify-between">
                <Link
                  to={`/store/shop?designer=${encodeURIComponent(listing.designer)}`}
                  className="text-xs font-bold tracking-widest text-amber-700 uppercase hover:text-amber-800"
                >
                  {listing.designer}
                </Link>
                <div className="flex gap-2">
                  <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100">
                    <Share2 size={15} className="text-stone-500" />
                  </button>
                  <button
                    onClick={() => setSaved(!saved)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100"
                  >
                    <Heart size={15} className={saved ? 'fill-red-500 text-red-500' : 'text-stone-500'} />
                  </button>
                </div>
              </div>

              <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1 mb-4">{listing.title}</h1>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-5">
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${CONDITION_COLORS[listing.condition]}`}>
                  {listing.condition}
                </span>
                <span className="text-xs px-3 py-1.5 rounded-full bg-stone-100 text-stone-600">{listing.pieces}</span>
                <span className="text-xs px-3 py-1.5 rounded-full bg-stone-100 text-stone-600">Size {listing.size}</span>
              </div>

              {/* Price */}
              <div className="mb-5">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-stone-900">${listing.price}</span>
                  {listing.originalRetail && (
                    <span className="text-sm text-stone-400 line-through">${listing.originalRetail} retail</span>
                  )}
                </div>
                {listing.highestBid && (
                  <p className="text-sm text-amber-700 mt-1 font-medium">
                    🔥 {listing.bids} people bidding — highest offer ${listing.highestBid}
                  </p>
                )}
                {listing.bids === 0 && (
                  <p className="text-sm text-stone-400 mt-1">No offers yet — be the first</p>
                )}
              </div>

              {/* CTAs */}
              <div className="flex flex-col gap-3 mb-6">
                <a
                  href="#"
                  className="w-full py-4 bg-stone-900 text-white rounded-full font-semibold text-sm text-center hover:bg-stone-800 transition-colors"
                >
                  Buy now — ${listing.price}
                </a>
                <button
                  onClick={() => setBidOpen(true)}
                  className="w-full py-4 border-2 border-amber-700 text-amber-700 rounded-full font-semibold text-sm hover:bg-amber-50 transition-colors"
                >
                  Make an offer
                </button>
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-stone-900 mb-2">About this piece</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{listing.description}</p>
              </div>

              {/* Bid history */}
              {listing.bids > 0 && (
                <div className="mb-6 p-4 bg-amber-50 rounded-2xl">
                  <p className="text-xs font-semibold text-amber-700 mb-3 uppercase tracking-wider">
                    Active bids ({listing.bids})
                  </p>
                  {[
                    { label: 'Buyer •••', amount: listing.highestBid, time: '2h ago', top: true },
                    { label: 'Buyer •••', amount: Math.round(listing.highestBid * 0.93), time: '5h ago', top: false },
                  ].map((bid, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-amber-700">B</span>
                        </div>
                        <span className="text-xs text-stone-600">{bid.label}</span>
                        {bid.top && <span className="text-[9px] px-1.5 py-0.5 bg-amber-700 text-white rounded-full">Top</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-stone-900">${bid.amount}</p>
                        <p className="text-[10px] text-stone-400">{bid.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Seller info */}
              <div className="p-4 border border-stone-200 rounded-2xl mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-stone-200 flex items-center justify-center">
                    <span className="text-sm font-bold text-stone-600">{listing.sellerName[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900">{listing.sellerName}</p>
                    <p className="text-xs text-stone-400">{listing.sellerSold} items sold · since {listing.sellerSince}</p>
                  </div>
                  <Shield size={14} className="ml-auto text-emerald-600" />
                </div>
                <p className="text-xs text-stone-500 flex items-center gap-1.5">
                  <Shield size={11} className="text-emerald-500" />
                  Verified seller · All sales authenticated
                </p>
              </div>

              {/* Shipping */}
              <div className="text-xs text-stone-400 space-y-1.5">
                <p>🚚 Ships within 5–7 business days</p>
                <p>📦 All sales final — no returns</p>
                <p>🔒 Payment secured via Shopify checkout</p>
              </div>
            </div>
          </div>
        </div>

        {/* Related listings */}
        {(related.length > 0 || fallbackRelated.length > 0) && (
          <div className="max-w-6xl mx-auto px-4 pb-24 md:pb-8">
            <h2 className="text-lg font-bold text-stone-900 mb-5">
              {related.length > 0 ? `More from ${listing.designer}` : 'You might also like'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(related.length > 0 ? related : fallbackRelated).map(l => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bid modal */}
      {bidOpen && <BidModal listing={listing} onClose={() => setBidOpen(false)} />}
    </div>
  );
}
