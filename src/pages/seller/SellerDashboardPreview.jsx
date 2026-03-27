/**
 * SellerDashboardPreview — editorial prototype (white bg, brand accents)
 * Route: /seller/preview  (remove before production)
 */
import { useState, useRef } from 'react';
import { Camera, X, Loader2, Edit2, Plus } from 'lucide-react';
import SellerLayout from './SellerLayout';

const CRIMSON = '#C91A2B';
const GOLD    = '#C9913D';
const INK     = '#1C1410';
const STONE   = '#78716C';
const BORDER  = '#EDE8E3';

// Subtle jali trellis — crimson, very faint — used as top-strip decoration
const JALI = `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23C91A2B' stroke-width='0.5' stroke-opacity='0.15'%3E%3Cpath d='M16 0 L32 16 L16 32 L0 16 Z'/%3E%3Cpath d='M16 6 L26 16 L16 26 L6 16 Z'/%3E%3Cline x1='16' y1='0' x2='16' y2='32'/%3E%3Cline x1='0' y1='16' x2='32' y2='16'/%3E%3C/g%3E%3C/svg%3E")`;

function OrnamentDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline-block mx-1.5 opacity-40">
      <path d="M5 0L6.2 3.8L10 5L6.2 6.2L5 10L3.8 6.2L0 5L3.8 3.8Z" fill={GOLD} />
    </svg>
  );
}

function parseRevisionNeeds(note, fields) {
  if (fields?.length) {
    return { photos: fields.includes('photos'), price: fields.includes('price'), designer: fields.includes('designer'), measurements: fields.includes('measurements'), description: fields.includes('description'), title: fields.includes('title') };
  }
  return {
    photos:       /photo|image|picture|tag|clearer|more pic/i.test(note),
    price:        /price|cost|amount|\$|pricing/i.test(note),
    designer:     /designer|brand|label|vendor/i.test(note),
    measurements: /measurement|size|dimension|fit/i.test(note),
    description:  /description|detail|condition|material/i.test(note),
    title:        /title|name|rename/i.test(note),
  };
}

function daysLeft(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline) - new Date();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function StatusPill({ listing }) {
  let label, color, bg;
  if (listing.isSold)                                { label = 'Sold';          color = '#2563EB'; bg = '#EFF6FF'; }
  else if (listing.tags?.includes('needs-revision')) { label = 'Action Needed'; color = CRIMSON;   bg = '#FFF0F1'; }
  else if (listing.tags?.includes('seller-revised')) { label = 'Under Review';  color = '#0284C7'; bg = '#F0F9FF'; }
  else if (listing.status === 'active')              { label = 'Live';          color = '#16A34A'; bg = '#F0FDF4'; }
  else                                               { label = 'Pending';       color = GOLD;      bg = '#FFFBEB'; }
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
      style={{ color, background: bg, border: `1px solid ${color}22` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

const MOCK_SELLER = { name: 'Ayesha Khan', email: 'ayesha@example.com', totalEarnings: 1240, pendingPayout: 320 };

const MOCK_LISTINGS = [
  {
    id: '1', title: 'Sana Safinaz Embroidered Lawn 3-Piece',
    designer: 'Sana Safinaz', status: 'active', price: 180, sellerPayout: 148,
    size: 'M', condition: 'Like New',
    image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&q=80',
    tags: ['needs-revision', 'active'],
    revisionNote: 'Please add clearer photos of the tag and measurements',
    revisionDeadline: new Date(Date.now() + 5 * 86400000).toISOString(),
    isSold: false,
  },
  {
    id: '2', title: 'Gul Ahmed Premium Karandi',
    designer: 'Gul Ahmed', status: 'active', price: 95, sellerPayout: 78,
    size: 'One Size', condition: 'Good',
    image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&q=80',
    tags: ['active'], isSold: false,
  },
  {
    id: '3', title: 'Maria B Embroidered Chiffon',
    designer: 'Maria B', status: 'draft', price: 65, sellerPayout: 53,
    size: 'One Size', condition: 'New with Tags',
    image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&q=80',
    tags: ['pending-approval'], isSold: false,
  },
  {
    id: '4', title: 'Khaadi Khaddar Winter Set',
    designer: 'Khaadi', status: 'active', price: 140, sellerPayout: 115,
    size: 'S', condition: 'Good',
    image: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=400&q=80',
    tags: ['active'], isSold: true,
  },
];

export default function SellerDashboardPreview() {
  const [listings, setListings]               = useState(MOCK_LISTINGS);
  const [revisionListing, setRevisionListing] = useState(null);
  const [revisionForm, setRevisionForm]       = useState({ price: '', designer: '', title: '', measurements: '', description: '' });
  const [revisionPhotos, setRevisionPhotos]   = useState([]);
  const [submitting, setSubmitting]           = useState(false);
  const photoRef = useRef(null);

  const needsRevision = listings.filter(l => l.tags?.includes('needs-revision'));
  const stats = {
    total:   listings.length,
    pending: listings.filter(l => l.status === 'draft' && !l.isSold).length,
    live:    listings.filter(l => l.status === 'active' && !l.isSold).length,
    sold:    listings.filter(l => l.isSold).length,
  };

  function openRevision(listing) {
    setRevisionListing(listing);
    setRevisionForm({ price: listing.price || '', designer: listing.designer || '', title: listing.title || '', measurements: '', description: '' });
    setRevisionPhotos([]);
  }

  function handlePhotoSelect(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setRevisionPhotos(p => [...p, { preview: ev.target.result }]);
      reader.readAsDataURL(file);
    });
  }

  async function submitRevision() {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    setListings(prev => prev.map(l =>
      l.id !== revisionListing.id ? l
        : { ...l, tags: [...(l.tags||[]).filter(t => t !== 'needs-revision'), 'seller-revised'], revisionNote: null, revisionDeadline: null }
    ));
    setRevisionListing(null);
    setRevisionPhotos([]);
    setSubmitting(false);
  }

  return (
    <SellerLayout seller={MOCK_SELLER} email={MOCK_SELLER.email} onLogout={() => {}} revisionCount={needsRevision.length}>
      <div className="px-4 pt-5 pb-24 md:px-0 md:pt-0 space-y-5" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* ── REVISION ALERT — white card, thick crimson left border ─── */}
        {needsRevision.map(listing => {
          const days = daysLeft(listing.revisionDeadline);
          const urgent = days !== null && days <= 2;
          return (
            <div key={listing.id} className="relative bg-white rounded-2xl overflow-hidden shadow-sm"
              style={{ border: `1px solid ${BORDER}`, borderLeft: `4px solid ${urgent ? CRIMSON : GOLD}` }}>
              {/* Jali strip along top */}
              <div className="h-1.5 w-full" style={{ backgroundImage: JALI, backgroundSize: '32px 32px' }} />
              <div className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-1"
                      style={{ color: urgent ? CRIMSON : GOLD }}>
                      {urgent ? 'Urgent Update Required' : 'Action Required'}
                    </p>
                    {listing.revisionNote && (
                      <p className="text-sm leading-snug font-medium" style={{ color: INK }}>
                        {listing.revisionNote}
                      </p>
                    )}
                    {days !== null && (
                      <p className="text-xs mt-1 font-medium" style={{ color: urgent ? CRIMSON : STONE }}>
                        {days === 0 ? 'Overdue — update immediately' : `${days} days left to update`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => openRevision(listing)}
                    className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase text-white transition-all active:scale-95"
                    style={{ background: urgent ? CRIMSON : GOLD }}
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── BALANCE CARD — white, brand color numbers ─────────────── */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BORDER}` }}>
          {/* Top jali strip */}
          <div className="h-2" style={{ background: CRIMSON, backgroundImage: JALI, backgroundSize: '32px 32px' }} />
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: STONE }}>
              Your Balance
            </p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] tracking-wide uppercase mb-0.5" style={{ color: STONE }}>Total Earned</p>
                <p className="text-4xl font-bold tracking-tight" style={{ color: INK }}>
                  ${MOCK_SELLER.totalEarnings.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] tracking-wide uppercase mb-0.5" style={{ color: STONE }}>Pending</p>
                <p className="text-2xl font-bold" style={{ color: GOLD }}>
                  ${MOCK_SELLER.pendingPayout}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: `1px solid ${BORDER}` }}>
              <OrnamentDot />
              <p className="text-[11px]" style={{ color: STONE }}>After commission — your payout shown per listing</p>
            </div>
          </div>
        </div>

        {/* ── STATS ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 divide-x bg-white rounded-2xl overflow-hidden shadow-sm"
          style={{ border: `1px solid ${BORDER}`, divideColor: BORDER }}>
          {[
            { label: 'Total',   value: stats.total,   color: INK },
            { label: 'Pending', value: stats.pending, color: GOLD },
            { label: 'Live',    value: stats.live,    color: '#16A34A' },
            { label: 'Sold',    value: stats.sold,    color: CRIMSON },
          ].map((s, i) => (
            <div key={s.label} className="py-4 text-center" style={{ borderRight: i < 3 ? `1px solid ${BORDER}` : 'none' }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] font-bold tracking-widest uppercase mt-0.5" style={{ color: STONE }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── LISTINGS ──────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {/* Crimson vertical rule */}
              <div className="w-0.5 h-6 rounded-full" style={{ background: CRIMSON }} />
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: GOLD }}>Your Closet</p>
                <h2 className="text-base font-bold leading-none" style={{ color: INK }}>Active Listings</h2>
              </div>
            </div>
            <button className="flex items-center gap-1.5 text-xs font-bold tracking-wide rounded-xl px-3 py-1.5"
              style={{ color: CRIMSON, border: `1.5px solid ${CRIMSON}` }}>
              <Plus className="w-3 h-3" /> Add New
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {listings.map(listing => {
              const needsRev = listing.tags?.includes('needs-revision');
              const days = needsRev ? daysLeft(listing.revisionDeadline) : null;
              return (
                <div key={listing.id}
                  className="bg-white rounded-2xl overflow-hidden transition-all hover:shadow-md"
                  style={{
                    border: needsRev ? `1.5px solid ${GOLD}` : `1px solid ${BORDER}`,
                    boxShadow: needsRev ? `0 0 0 3px ${GOLD}18` : undefined,
                  }}>

                  {/* Image */}
                  <div className="relative overflow-hidden" style={{ aspectRatio: '3/4' }}>
                    <img src={listing.image} alt={listing.title}
                      className="w-full h-full object-cover" loading="lazy"
                      onError={e => { e.target.style.background = '#f5f0eb'; e.target.style.display = 'none'; }} />

                    {/* Scrim */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                    {/* Status */}
                    <div className="absolute bottom-2 left-2">
                      <StatusPill listing={listing} />
                    </div>

                    {/* Countdown */}
                    {needsRev && days !== null && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black text-white"
                        style={{ background: days <= 2 ? CRIMSON : GOLD }}>
                        {days === 0 ? 'NOW' : `${days}d`}
                      </div>
                    )}

                    {/* Sold stamp */}
                    {listing.isSold && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rotate-[-12deg] px-3 py-1 rounded-sm"
                          style={{ border: `3px solid ${CRIMSON}`, background: 'rgba(255,255,255,0.15)' }}>
                          <p className="text-xs font-black tracking-widest uppercase" style={{ color: CRIMSON }}>Sold</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-[9px] font-bold tracking-[0.18em] uppercase mb-0.5" style={{ color: GOLD }}>
                      {listing.designer}
                    </p>
                    <p className="text-xs font-semibold leading-snug line-clamp-2" style={{ color: INK }}>
                      {listing.title}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2"
                      style={{ borderTop: `1px solid ${BORDER}` }}>
                      <div>
                        <p className="text-sm font-bold" style={{ color: INK }}>${listing.price}</p>
                        {!listing.isSold && (
                          <p className="text-[10px] font-semibold" style={{ color: '#16A34A' }}>→ ${listing.sellerPayout}</p>
                        )}
                      </div>
                      {needsRev ? (
                        <button onClick={() => openRevision(listing)}
                          className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-white active:scale-95 transition-transform"
                          style={{ background: GOLD }}>
                          Update
                        </button>
                      ) : !listing.isSold && (
                        <button className="p-1.5 rounded-xl hover:bg-gray-50 transition-colors" style={{ color: STONE }}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ══ REVISION MODAL ════════════════════════════════════════════ */}
      {revisionListing && (() => {
        const reqs = parseRevisionNeeds(revisionListing.revisionNote || '', revisionListing.revisionFields);
        const isValid = (
          (!reqs.photos       || revisionPhotos.length > 0) &&
          (!reqs.price        || (revisionForm.price && parseFloat(revisionForm.price) > 0)) &&
          (!reqs.designer     || revisionForm.designer.trim()) &&
          (!reqs.title        || revisionForm.title.trim()) &&
          (!reqs.measurements || revisionForm.measurements.trim()) &&
          (!reqs.description  || revisionForm.description.trim())
        );
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(28,20,16,0.55)', backdropFilter: 'blur(6px)' }}>
            <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl"
              style={{ maxHeight: '90vh', overflowY: 'auto' }}>

              {/* Modal header — crimson strip */}
              <div className="relative overflow-hidden" style={{ background: CRIMSON }}>
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: JALI, backgroundSize: '32px 32px' }} />
                <div className="relative px-5 py-4 flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/70 mb-0.5">
                      Update Required
                    </p>
                    <p className="text-white font-semibold text-sm leading-snug max-w-[260px]">
                      {revisionListing.title}
                    </p>
                  </div>
                  <button onClick={() => setRevisionListing(null)}
                    className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              <div className="px-5 py-5 space-y-4">

                {/* The note */}
                {revisionListing.revisionNote && (
                  <div className="rounded-xl px-4 py-3" style={{ background: '#FFF8F0', borderLeft: `3px solid ${GOLD}` }}>
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-1" style={{ color: GOLD }}>
                      Requested Change
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: INK }}>
                      {revisionListing.revisionNote}
                    </p>
                  </div>
                )}

                {/* Dynamic fields */}
                {reqs.photos && (
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase mb-2" style={{ color: INK }}>
                      Add Photos <span style={{ color: CRIMSON }}>*</span>
                    </label>
                    <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                    <button onClick={() => photoRef.current?.click()}
                      className="w-full rounded-xl py-5 flex flex-col items-center gap-2 transition-colors border-2 border-dashed hover:border-[#C91A2B]"
                      style={{ borderColor: BORDER, color: STONE }}>
                      <Camera className="w-5 h-5" />
                      <span className="text-xs font-semibold">Tap to add photos</span>
                    </button>
                    {revisionPhotos.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {revisionPhotos.map((p, i) => (
                          <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100">
                            <img src={p.preview} className="w-full h-full object-cover" />
                            <button onClick={() => setRevisionPhotos(prev => prev.filter((_, j) => j !== i))}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ background: CRIMSON }}>
                              <X className="w-2.5 h-2.5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {reqs.measurements && (
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase mb-2" style={{ color: INK }}>
                      Measurements <span style={{ color: CRIMSON }}>*</span>
                    </label>
                    <textarea
                      value={revisionForm.measurements}
                      onChange={e => setRevisionForm(f => ({ ...f, measurements: e.target.value }))}
                      rows={2} placeholder="e.g. Bust: 38in, Waist: 32in, Length: 54in"
                      className="w-full px-4 py-3 rounded-xl text-sm resize-none focus:outline-none transition-colors"
                      style={{ border: `1.5px solid ${BORDER}`, color: INK }} />
                  </div>
                )}

                {reqs.price && (
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase mb-2" style={{ color: INK }}>
                      New Price (CAD) <span style={{ color: CRIMSON }}>*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-sm" style={{ color: STONE }}>$</span>
                      <input type="number" value={revisionForm.price}
                        onChange={e => setRevisionForm(f => ({ ...f, price: e.target.value }))}
                        placeholder="0.00"
                        className="w-full pl-8 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                        style={{ border: `1.5px solid ${BORDER}`, color: INK }} />
                    </div>
                  </div>
                )}

                {reqs.designer && (
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase mb-2" style={{ color: INK }}>
                      Designer / Brand <span style={{ color: CRIMSON }}>*</span>
                    </label>
                    <input type="text" value={revisionForm.designer}
                      onChange={e => setRevisionForm(f => ({ ...f, designer: e.target.value }))}
                      placeholder="e.g. Gul Ahmed, Sana Safinaz…"
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                      style={{ border: `1.5px solid ${BORDER}`, color: INK }} />
                  </div>
                )}

                {/* Submit */}
                <button onClick={submitRevision} disabled={submitting || !isValid}
                  className="w-full py-3.5 rounded-xl text-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                  style={{
                    background: isValid && !submitting ? CRIMSON : '#D4C5B8',
                    color: '#fff',
                    cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
                  }}>
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  ) : !isValid ? (
                    'Fill Required Fields Above'
                  ) : (
                    'Submit Update'
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </SellerLayout>
  );
}
