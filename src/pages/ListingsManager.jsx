import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Search, ChevronDown, Loader2, ExternalLink, Edit2, X, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

function SellerSearch({ value, onChange }) {
  const [query, setQuery] = useState(value?.name || '');
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
      <div className="flex items-center gap-1 border border-stone-200 rounded-lg px-2 py-1.5 bg-white">
        <Search size={12} className="text-stone-400 flex-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) onChange(null); }}
          placeholder="Search seller..."
          className="text-xs outline-none w-36"
        />
        {loading && <Loader2 size={11} className="animate-spin text-stone-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 mt-1 w-64 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
          {results.map(s => (
            <button
              key={s.id}
              onClick={() => select(s)}
              className="w-full text-left px-3 py-2 hover:bg-stone-50 text-xs"
            >
              <p className="font-medium text-stone-900">{s.name || '—'}</p>
              <p className="text-stone-400">{s.email}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK_NOTES = [
  'Please update the price',
  'Please update the designer name',
  'Please submit a clearer photo of the tag',
  'Please add more photos',
];

function ListingRow({ listing, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [seller, setSeller] = useState(null);
  const [rate, setRate] = useState(listing.commissionRate || 18);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [sendingRevision, setSendingRevision] = useState(false);

  async function sendRevision() {
    if (!revisionNote.trim()) return;
    setSendingRevision(true);
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ shopifyProductId: listing.id, note: revisionNote.trim() })
      });
      const d = await r.json();
      if (d.success) {
        setShowRevision(false);
        setRevisionNote('');
      } else {
        alert(d.error || 'Failed to send revision request');
      }
    } catch (e) {
      alert(e.message);
    }
    setSendingRevision(false);
  }

  async function save() {
    if (!seller) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=fix-listing-seller`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`
        },
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

  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
      {/* Image + title */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          {listing.image
            ? <img src={listing.image} alt="" className="w-10 h-12 rounded-lg object-cover flex-none" />
            : <div className="w-10 h-12 rounded-lg bg-stone-100 flex-none" />
          }
          <div>
            <p className="text-sm font-medium text-stone-900 leading-tight">{listing.title}</p>
            <p className="text-xs text-amber-700 font-semibold">{listing.designer}</p>
            <a
              href={listing.shopifyAdminUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-stone-400 hover:text-stone-600 flex items-center gap-0.5 mt-0.5"
            >
              Shopify <ExternalLink size={9} />
            </a>
          </div>
        </div>
      </td>

      {/* Price */}
      <td className="py-3 px-4 text-sm text-stone-700">${listing.price.toFixed(2)}</td>

      {/* Seller */}
      <td className="py-3 px-4">
        {saved || listing.hasSeller ? (
          <div>
            <p className="text-xs font-medium text-stone-900">{listing.sellerName || listing.sellerEmail || '—'}</p>
            {listing.sellerEmail && <p className="text-[10px] text-stone-400">{listing.sellerEmail}</p>}
          </div>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle size={11} /> No seller
          </span>
        )}
      </td>

      {/* Commission */}
      <td className="py-3 px-4 text-xs text-stone-600">
        {listing.commissionRate}%
        {listing.sellerPayout > 0 && (
          <span className="text-stone-400 ml-1">(payout ${listing.sellerPayout.toFixed(2)})</span>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex items-start gap-2 flex-wrap">
            <SellerSearch value={null} onChange={setSeller} />
            <div className="flex items-center gap-1 border border-stone-200 rounded-lg px-2 py-1.5 bg-white w-20">
              <input
                type="number"
                value={rate}
                onChange={e => setRate(Number(e.target.value))}
                min={0}
                max={50}
                className="text-xs outline-none w-full"
              />
              <span className="text-xs text-stone-400">%</span>
            </div>
            <button
              onClick={save}
              disabled={!seller || saving}
              className="px-3 py-1.5 bg-stone-900 text-white text-xs rounded-lg disabled:opacity-40 flex items-center gap-1"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="p-1.5 text-stone-400 hover:text-stone-700">
              <X size={13} />
            </button>
            {error && <p className="text-[10px] text-red-500 w-full">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {saved && <CheckCircle size={14} className="text-emerald-500" />}
              <button
                onClick={() => { setEditing(true); setSaved(false); setSeller(null); setRate(listing.commissionRate || 18); }}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900"
              >
                <Edit2 size={12} />
                {listing.hasSeller ? 'Edit' : 'Assign'}
              </button>
              <button
                onClick={() => { setShowRevision(v => !v); setRevisionNote(''); }}
                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800"
              >
                <AlertCircle size={12} />
                Revise
              </button>
            </div>

            {/* Inline revision form */}
            {showRevision && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {QUICK_NOTES.map(n => (
                    <button
                      key={n}
                      onClick={() => setRevisionNote(n)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${revisionNote === n ? 'bg-amber-200 border-amber-400 text-amber-900 font-medium' : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-100'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <textarea
                  value={revisionNote}
                  onChange={e => setRevisionNote(e.target.value)}
                  placeholder="What needs to be updated..."
                  rows={2}
                  className="w-full text-xs px-2 py-1.5 border border-amber-200 rounded focus:outline-none resize-none bg-white"
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowRevision(false)} className="px-3 py-1 text-xs text-stone-500 border border-stone-200 rounded hover:bg-stone-50">Cancel</button>
                  <button
                    onClick={sendRevision}
                    disabled={sendingRevision || !revisionNote.trim()}
                    className="px-3 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded disabled:opacity-50 flex items-center gap-1"
                  >
                    {sendingRevision ? <Loader2 size={11} className="animate-spin" /> : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function ListingsManager() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('missing'); // 'all' | 'missing' | 'assigned'
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, missing: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=all-listings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      });
      const d = await r.json();
      setListings(d.listings || []);
      setStats({ total: d.total || 0, missing: d.missing || 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(updated) {
    setListings(prev => prev.map(l => l.id === updated.id ? updated : l));
    setStats(prev => ({ ...prev, missing: prev.missing - 1 }));
  }

  const filtered = listings
    .filter(l => filter === 'missing' ? !l.hasSeller : filter === 'assigned' ? l.hasSeller : true)
    .filter(l => !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.designer.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Listings</h1>
          <p className="text-sm text-stone-500 mt-1">{stats.total} active listings · {stats.missing} missing seller</p>
        </div>
        <button onClick={load} className="text-xs text-stone-500 hover:text-stone-900 border border-stone-200 rounded-lg px-3 py-1.5">
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      {stats.missing > 0 && (
        <div className="mb-5 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-600 flex-none" />
          <p className="text-sm text-amber-800">
            <strong>{stats.missing} listings</strong> are missing seller info — orders for these won't be tracked to a seller.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-stone-100 rounded-lg p-1">
          {[
            { id: 'missing', label: `Missing (${stats.missing})` },
            { id: 'assigned', label: 'Assigned' },
            { id: 'all', label: 'All' }
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                filter === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border border-stone-200 rounded-lg px-3 py-1.5 bg-white ml-auto">
          <Search size={13} className="text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title or designer..."
            className="text-xs outline-none w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-stone-400">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">Loading listings...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-stone-400">
            <CheckCircle size={32} className="mx-auto mb-3 text-emerald-400" />
            <p className="text-sm font-medium text-stone-600">
              {filter === 'missing' ? 'All listings have sellers assigned!' : 'No listings found.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wider py-3 px-4">Listing</th>
                <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wider py-3 px-4">Price</th>
                <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wider py-3 px-4">Seller</th>
                <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wider py-3 px-4">Commission</th>
                <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wider py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <ListingRow key={l.id} listing={l} onSaved={handleSaved} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-stone-400 mt-3">
        Showing {filtered.length} of {listings.length} listings
      </p>
    </div>
  );
}
