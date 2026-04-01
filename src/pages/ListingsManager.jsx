import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Search, Loader2, ExternalLink, Edit2, X, AlertCircle, Send, Eye, MessageSquare, Mail, ChevronRight, ChevronLeft, Tag } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';
const PORTAL_URL = 'https://sell.thephirstory.com';

// ─── Seller search autocomplete ────────────────────────────────────────────
function SellerSearch({ onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_URL}/api/admin-listings?action=sellers&search=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
        });
        const d = await r.json();
        setResults(d.sellers || []);
        setOpen(true);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function select(seller) {
    setQuery(seller.name || seller.email);
    setResults([]);
    setOpen(false);
    onChange(seller);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 border border-stone-200 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-stone-300">
        <Search size={12} className="text-stone-400 flex-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) onChange(null); }}
          placeholder="Search seller..."
          className="text-xs outline-none w-40"
        />
        {loading && <Loader2 size={11} className="animate-spin text-stone-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 top-full left-0 mt-1 w-64 bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden">
          {results.map(s => (
            <button key={s.id} onClick={() => select(s)} className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-50 last:border-0">
              <p className="text-xs font-semibold text-stone-900">{s.name || '—'}</p>
              <p className="text-[11px] text-stone-400">{s.email}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Revision field options ─────────────────────────────────────────────────
const REVISION_FIELDS = [
  { key: 'photos',       label: 'Photos',       hint: 'Add clearer / more photos',       icon: '📷' },
  { key: 'price',        label: 'Price',         hint: 'Update asking price',             icon: '💰' },
  { key: 'designer',     label: 'Designer',      hint: 'Correct the brand name',         icon: '🏷️' },
  { key: 'measurements', label: 'Measurements',  hint: 'Add size measurements',          icon: '📏' },
  { key: 'description',  label: 'Description',   hint: 'Improve condition details',      icon: '📝' },
  { key: 'title',        label: 'Title',         hint: 'Rename the listing',             icon: '✏️' },
];

const FIELD_LABELS = {
  photos: 'photos', price: 'price', designer: 'designer/brand name',
  measurements: 'measurements', description: 'description/condition', title: 'listing title'
};

function buildNote(fields, extraNote) {
  const selected = Object.keys(fields).filter(k => fields[k]);
  const fieldList = selected.map(k => FIELD_LABELS[k]).join(', ');
  return `Please update the following: ${fieldList}${extraNote.trim() ? `. ${extraNote.trim()}` : '.'}`;
}

// ─── WA preview bubble ──────────────────────────────────────────────────────
function WAPreview({ sellerName, productTitle, note }) {
  const msg = `Hi ${sellerName || 'there'}! We've reviewed your listing "${productTitle}" and need a small update before we can approve it:\n\n"${note}"\n\nPlease update your listing here: ${PORTAL_URL}\n\nThank you! 🙏`;
  return (
    <div className="bg-[#E5DDD5] rounded-xl p-4 min-h-[180px] flex items-end">
      <div className="max-w-[85%] bg-white rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-sm">
        <p className="text-[12px] text-stone-800 whitespace-pre-wrap leading-relaxed">{msg}</p>
        <p className="text-[10px] text-stone-400 text-right mt-1">11:30 AM</p>
      </div>
    </div>
  );
}

// ─── Email preview ──────────────────────────────────────────────────────────
function EmailPreview({ sellerName, productTitle, note }) {
  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden text-sm">
      {/* Email chrome */}
      <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200 space-y-1">
        <p className="text-xs text-stone-500"><span className="font-medium text-stone-700">From:</span> The Phir Story &lt;hello@thephirstory.com&gt;</p>
        <p className="text-xs text-stone-500"><span className="font-medium text-stone-700">Subject:</span> Action needed: Update your listing – {productTitle}</p>
      </div>
      {/* Body */}
      <div className="p-4 space-y-3 text-[13px] text-stone-700 leading-relaxed">
        <p>Hi {sellerName || 'there'},</p>
        <p>Thanks for submitting your listing <strong>{productTitle}</strong>. We'd love to approve it — we just need one small update first:</p>
        <div className="bg-amber-50 border-l-4 border-amber-400 px-3 py-2.5 rounded-r-lg text-amber-900 font-medium text-[12px]">
          {note}
        </div>
        <p>Please log in to your seller portal to make the update:</p>
        <div>
          <span className="inline-block bg-green-600 text-white text-[12px] font-medium px-4 py-2 rounded-lg">Update My Listing</span>
        </div>
        <p>Once updated, we'll re-review and approve it as quickly as possible.</p>
        <p>Thank you!<br /><span className="font-medium">The Phir Story Team</span></p>
      </div>
    </div>
  );
}

// ─── Revision modal (2-step) ────────────────────────────────────────────────
function RevisionModal({ listing, onClose, onSent }) {
  const [step, setStep] = useState('compose'); // 'compose' | 'preview'
  const [previewTab, setPreviewTab] = useState('whatsapp');
  const [fields, setFields] = useState({});
  const [extraNote, setExtraNote] = useState('');
  const [sending, setSending] = useState(false);

  const selectedFields = Object.keys(fields).filter(k => fields[k]);
  const hasFields = selectedFields.length > 0;
  const note = hasFields ? buildNote(fields, extraNote) : '';

  async function send() {
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ shopifyProductId: listing.id, note, fields: selectedFields })
      });
      const d = await r.json();
      if (d.success) {
        onSent(listing.id);
        onClose();
      } else {
        alert(d.error || 'Failed to send revision request');
      }
    } catch (e) {
      alert(e.message);
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Request Revision</p>
            <p className="text-sm font-semibold text-stone-900 truncate max-w-[340px]">{listing.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
            <X size={16} className="text-stone-500" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-stone-100">
          {['compose', 'preview'].map((s, i) => (
            <button
              key={s}
              onClick={() => s === 'preview' && hasFields ? setStep('preview') : s === 'compose' ? setStep('compose') : null}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                step === s ? 'text-stone-900 border-stone-900' : 'text-stone-400 border-transparent hover:text-stone-600'
              }`}
            >
              {i === 0 ? <Edit2 size={11} /> : <Eye size={11} />}
              {s === 'compose' ? '1. Compose' : '2. Preview'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ── STEP 1: Compose ── */}
          {step === 'compose' && (
            <div className="p-5 space-y-5">
              {/* Field toggles */}
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">What needs updating?</p>
                <div className="grid grid-cols-2 gap-2">
                  {REVISION_FIELDS.map(({ key, label, hint, icon }) => {
                    const checked = !!fields[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setFields(f => ({ ...f, [key]: !f[key] }))}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          checked
                            ? 'bg-amber-50 border-amber-400 shadow-sm'
                            : 'bg-stone-50 border-stone-200 hover:border-stone-300 hover:bg-white'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md flex-shrink-0 border-2 flex items-center justify-center mt-0.5 transition-all ${
                          checked ? 'bg-amber-500 border-amber-500' : 'border-stone-300 bg-white'
                        }`}>
                          {checked && <svg className="w-3 h-3 text-white" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div>
                          <p className={`text-xs font-semibold leading-none ${checked ? 'text-amber-900' : 'text-stone-700'}`}>
                            {icon} {label}
                          </p>
                          <p className={`text-[10px] mt-1 leading-snug ${checked ? 'text-amber-700' : 'text-stone-400'}`}>{hint}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Extra note */}
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                  Additional note <span className="normal-case font-normal text-stone-400">(optional)</span>
                </p>
                <textarea
                  value={extraNote}
                  onChange={e => setExtraNote(e.target.value)}
                  placeholder="Any specific instructions for the seller…"
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                />
              </div>

              {/* Note preview */}
              {hasFields && (
                <div className="bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-3">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Message to seller</p>
                  <p className="text-xs text-stone-700 leading-relaxed">{note}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === 'preview' && (
            <div className="p-5 space-y-4">
              {/* Channel tabs */}
              <div className="flex gap-1 bg-stone-100 rounded-lg p-1">
                <button
                  onClick={() => setPreviewTab('whatsapp')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    previewTab === 'whatsapp' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  <MessageSquare size={11} /> WhatsApp
                </button>
                <button
                  onClick={() => setPreviewTab('email')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    previewTab === 'email' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  <Mail size={11} /> Email
                </button>
              </div>

              {previewTab === 'whatsapp' && (
                <WAPreview
                  sellerName={listing.sellerName}
                  productTitle={listing.title}
                  note={note}
                />
              )}
              {previewTab === 'email' && (
                <EmailPreview
                  sellerName={listing.sellerName}
                  productTitle={listing.title}
                  note={note}
                />
              )}

              <p className="text-[10px] text-stone-400 text-center">
                {listing.sellerName ? `Sending to ${listing.sellerName}` : 'Seller name not set'}
                {listing.sellerEmail ? ` · ${listing.sellerEmail}` : ''}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-stone-100 flex items-center gap-3">
          {step === 'compose' ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setStep('preview')}
                disabled={!hasFields}
                className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-40 transition-colors"
              >
                Preview <ChevronRight size={14} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('compose')} className="flex items-center gap-1.5 px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors">
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="ml-auto flex items-center gap-2 px-5 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-xl disabled:opacity-50 transition-colors"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Sending…' : 'Send Request'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ tags }) {
  const tagList = (tags || '').split(', ').map(t => t.trim());
  if (tagList.includes('needs-revision'))  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Revision</span>;
  if (tagList.includes('seller-revised'))  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">Re-review</span>;
  if (tagList.includes('delisted'))        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-500">Delisted</span>;
  if (tagList.includes('pending-approval')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">Pending</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">Live</span>;
}

// ─── Listing card ───────────────────────────────────────────────────────────
function ListingCard({ listing, onSaved, onRevise }) {
  const [editing, setEditing] = useState(false);
  const [seller, setSeller] = useState(null);
  const [rate, setRate] = useState(listing.commissionRate || 18);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    if (!seller) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=fix-listing-seller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ productId: listing.id, sellerId: seller.id, commissionRate: rate })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setSaved(true);
      setEditing(false);
      onSaved({ ...listing, sellerName: d.seller.name, sellerEmail: d.seller.email, sellerId: d.seller.id, commissionRate: rate, sellerPayout: parseFloat(d.sellerPayout), hasSeller: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const hasSeller = saved || listing.hasSeller;

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
      !hasSeller ? 'border-amber-200' : 'border-stone-200'
    }`}>
      {/* Image */}
      <div className="relative aspect-[3/4] bg-stone-100 overflow-hidden">
        {listing.image
          ? <img src={listing.image} alt={listing.title} className={`w-full h-full object-cover ${listing.isSold ? 'grayscale opacity-60' : ''}`} loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-stone-300 text-4xl">📷</div>
        }
        {/* Sold overlay */}
        {listing.isSold && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-3 py-1 text-xs font-black tracking-widest uppercase rotate-[-15deg] shadow-lg"
              style={{ background: 'rgba(37,99,235,0.85)', color: '#fff', border: '2px solid rgba(255,255,255,0.4)', borderRadius: 6 }}>
              SOLD
            </span>
          </div>
        )}
        {/* Status badge overlay */}
        <div className="absolute top-2 left-2">
          <StatusBadge tags={listing.tags} />
        </div>
        {/* Shopify link */}
        <a
          href={listing.shopifyAdminUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-black/60 rounded-lg transition-colors"
          title="Open in Shopify"
        >
          <ExternalLink size={11} className="text-white" />
        </a>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Title + designer */}
        <div>
          <p className="text-sm font-semibold text-stone-900 leading-snug line-clamp-2">{listing.title}</p>
          <p className="text-[11px] text-amber-700 font-medium mt-0.5">{listing.designer}</p>
        </div>

        {/* Price + payout */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-stone-800">${(listing.sellerAskingPrice || listing.price || 0).toFixed(0)}</p>
            {listing.sellerPayout > 0 && (
              <p className="text-[10px] text-green-600 font-medium">→ ${listing.sellerPayout.toFixed(0)} payout</p>
            )}
          </div>
          {listing.commissionRate && (
            <span className="text-[10px] text-stone-400 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded-full">
              {listing.commissionRate}%
            </span>
          )}
        </div>

        {/* Seller section */}
        <div className="mt-auto pt-2 border-t border-stone-100">
          {editing ? (
            <div className="space-y-2">
              <SellerSearch onChange={setSeller} />
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 border border-stone-200 rounded-lg px-2 py-1 bg-white flex-1">
                  <input
                    type="number"
                    value={rate}
                    onChange={e => setRate(Number(e.target.value))}
                    min={0} max={50}
                    className="text-xs outline-none w-full"
                    placeholder="Rate"
                  />
                  <span className="text-xs text-stone-400">%</span>
                </div>
                <button onClick={save} disabled={!seller || saving} className="px-2.5 py-1 bg-stone-900 text-white text-xs rounded-lg disabled:opacity-40 flex items-center gap-1">
                  {saving ? <Loader2 size={10} className="animate-spin" /> : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="p-1 text-stone-400 hover:text-stone-700">
                  <X size={12} />
                </button>
              </div>
              {error && <p className="text-[10px] text-red-500">{error}</p>}
            </div>
          ) : (
            <>
              {hasSeller ? (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-[10px] font-bold text-stone-600 flex-shrink-0">
                    {(listing.sellerName || listing.sellerEmail || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-stone-800 truncate">{listing.sellerName || listing.sellerEmail || '—'}</p>
                    {listing.sellerEmail && listing.sellerName && (
                      <p className="text-[10px] text-stone-400 truncate">{listing.sellerEmail}</p>
                    )}
                  </div>
                  {saved && <CheckCircle size={13} className="text-emerald-500 ml-auto flex-shrink-0" />}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle size={12} />
                  <span className="text-xs font-medium">No seller assigned</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        {!editing && (
          <div className="flex gap-1.5 mt-1">
            <button
              onClick={() => { setEditing(true); setSaved(false); setSeller(null); setRate(listing.commissionRate || 18); }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl transition-colors"
            >
              <Edit2 size={11} />
              {hasSeller ? 'Edit seller' : 'Assign seller'}
            </button>
            {hasSeller && (
              <button
                onClick={() => onRevise(listing)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors"
              >
                <AlertCircle size={11} />
                Revise
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ListingsManager() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, missing: 0 });
  const [revisionTarget, setRevisionTarget] = useState(null); // listing being revised

  const CACHE_KEY = 'admin_listings_cache';

  const load = useCallback(async () => {
    // Show cached data instantly while fetching fresh
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { listings: cl, total, missing } = JSON.parse(cached);
        setListings(cl || []);
        setStats({ total: total || 0, missing: missing || 0 });
        setLoading(false);
      }
    } catch {}

    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=all-listings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      });
      const d = await r.json();
      setListings(d.listings || []);
      setStats({ total: d.total || 0, missing: d.missing || 0 });
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ listings: d.listings, total: d.total, missing: d.missing })); } catch {}
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(updated) {
    setListings(prev => {
      const next = prev.map(l => l.id === updated.id ? updated : l);
      // Persist to localStorage so refresh doesn't revert
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.listings = next;
          parsed.missing = next.filter(l => !l.hasSeller).length;
          localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        }
      } catch {}
      return next;
    });
    setStats(prev => ({ ...prev, missing: Math.max(0, prev.missing - 1) }));
  }

  function handleRevisionSent(productId) {
    setListings(prev => prev.map(l => {
      if (l.id !== productId) return l;
      const tagList = (l.tags || '').split(', ').filter(t => t && t !== 'pending-approval' && t !== 'seller-revised');
      return { ...l, tags: [...tagList, 'needs-revision'].join(', ') };
    }));
  }

  const FILTERS = [
    { id: 'all',      label: 'All',                     count: stats.total },
    { id: 'missing',  label: 'Missing seller',           count: stats.missing },
    { id: 'assigned', label: 'Assigned',                 count: stats.total - stats.missing },
    { id: 'revision', label: 'Needs revision',           count: listings.filter(l => l.tags?.includes('needs-revision')).length },
  ];

  const filtered = listings
    .filter(l => {
      if (filter === 'missing')  return !l.hasSeller;
      if (filter === 'assigned') return l.hasSeller;
      if (filter === 'revision') return l.tags?.includes('needs-revision') || l.tags?.includes('seller-revised');
      return true;
    })
    .filter(l => !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.designer?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Listings</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {stats.total} active · {stats.missing} missing seller
            {listings.filter(l => l.tags?.includes('needs-revision')).length > 0 && (
              <> · <span className="text-amber-600 font-medium">{listings.filter(l => l.tags?.includes('needs-revision')).length} awaiting revision</span></>
            )}
          </p>
        </div>
        <button onClick={load} className="text-xs text-stone-500 hover:text-stone-900 border border-stone-200 rounded-xl px-3 py-2 transition-colors hover:bg-stone-50">
          Refresh
        </button>
      </div>

      {/* Missing seller alert */}
      {stats.missing > 0 && (
        <div className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-600 flex-none" />
          <p className="text-sm text-amber-800">
            <strong>{stats.missing} listing{stats.missing > 1 ? 's' : ''}</strong> missing seller — orders won't be tracked.
          </p>
          <button onClick={() => setFilter('missing')} className="ml-auto text-xs text-amber-700 font-medium underline underline-offset-2 hover:text-amber-900">
            View
          </button>
        </div>
      )}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
          {FILTERS.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                filter === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filter === id ? 'bg-stone-100 text-stone-600' : 'bg-stone-200 text-stone-500'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border border-stone-200 rounded-xl px-3 py-2 bg-white ml-auto w-56 focus-within:ring-2 focus-within:ring-stone-300">
          <Search size={13} className="text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title or designer…"
            className="text-xs outline-none flex-1"
          />
          {search && <button onClick={() => setSearch('')} className="text-stone-300 hover:text-stone-500"><X size={12} /></button>}
        </div>
      </div>

      {/* Cards grid */}
      {loading && listings.length === 0 ? (
        <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">Loading listings…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-stone-400">
          <CheckCircle size={32} className="mx-auto mb-3 text-emerald-400" />
          <p className="text-sm font-medium text-stone-600">
            {filter === 'missing' ? 'All listings have sellers assigned!' : 'No listings found.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {filtered.map(l => (
            <ListingCard
              key={l.id}
              listing={l}
              onSaved={handleSaved}
              onRevise={setRevisionTarget}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-stone-400 mt-3">Showing {filtered.length} of {listings.length} listings</p>

      {/* Revision modal */}
      {revisionTarget && (
        <RevisionModal
          listing={revisionTarget}
          onClose={() => setRevisionTarget(null)}
          onSent={handleRevisionSent}
        />
      )}
    </div>
  );
}
