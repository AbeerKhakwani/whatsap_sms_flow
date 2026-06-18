import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Clock, Sparkles, Banknote, Plus, Loader2, Search, Mic, MicOff, Camera, ChevronRight, RotateCcw } from 'lucide-react';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useImageUpload } from '../hooks/useImageUpload';

// Days-since / days-left for a revision request (7-day auto-expire window).
function revisionTiming(requestedAt) {
  if (!requestedAt) return { agoLabel: null, leftLabel: null, urgent: false };
  const reqMs = new Date(requestedAt).getTime();
  if (Number.isNaN(reqMs)) return { agoLabel: null, leftLabel: null, urgent: false };
  const dayMs = 86400000;
  const daysAgo = Math.floor((Date.now() - reqMs) / dayMs);
  const daysLeft = 7 - daysAgo;
  const agoLabel = daysAgo <= 0 ? 'today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
  const leftLabel = daysLeft <= 0 ? 'expiring' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  return { agoLabel, leftLabel, urgent: daysLeft <= 1 };
}

export default function Dashboard() {
  const [listings, setListings] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, approved: 0, sold: 0 });

  // Admin Create Listing state
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    designer: '', item_type: '', size: '', color: '', material: '', condition: 'Good',
    original_price: '', asking_price: '', description: '', chest: '', hip: '', notes: '',
    concierge: false
  });
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerResults, setSellerResults] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [searchingSellers, setSearchingSellers] = useState(false);
  const [creatingListing, setCreatingListing] = useState(false);
  const [createError, setCreateError] = useState('');
  const [adminScrapeUrl, setAdminScrapeUrl] = useState('');
  const [adminScraping, setAdminScraping] = useState(false);
  const [voiceError, setVoiceError] = useState('');

  // Voice recording hook for admin create
  const voice = useVoiceRecording({
    onTranscribed: () => {},
    onFieldsExtracted: (extracted) => {
      setCreateForm(prev => ({
        ...prev,
        designer: extracted.designer || prev.designer,
        item_type: extracted.pieces || extracted.item_type || prev.item_type,
        size: extracted.size || prev.size,
        color: extracted.color || prev.color,
        material: extracted.material || extracted.fabric || prev.material,
        condition: extracted.condition || prev.condition,
        original_price: extracted.original_price?.toString() || prev.original_price,
        asking_price: extracted.asking_price?.toString() || prev.asking_price,
        chest: extracted.chest?.toString() || prev.chest,
        hip: extracted.hip?.toString() || prev.hip,
        notes: extracted.notes || prev.notes
      }));
    },
    onError: (msg) => setVoiceError(msg)
  });

  // Image upload hook for admin create
  const imageUpload = useImageUpload({ maxPhotos: 10 });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch both in parallel for speed
      const [listingsRes, payoutsRes] = await Promise.all([
        fetch('/api/admin-listings?action=pending'),
        fetch('/api/admin-listings?action=payouts')
      ]);

      const listingsData = await listingsRes.json();
      const payoutsData = await payoutsRes.json();

      if (listingsData.success) {
        setListings(listingsData.listings || []);
        setStats(listingsData.stats || { pending: 0, approved: 0, sold: 0 });
      }

      if (payoutsData.success) {
        setPayouts(payoutsData.payouts || []);
        setTotalPending(payoutsData.totalPending || 0);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  }

  // Admin listing helpers
  async function searchSellers(query) {
    if (!query || query.length < 2) { setSellerResults([]); return; }
    setSearchingSellers(true);
    try {
      const res = await fetch(`/api/admin-listings?action=sellers&search=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) setSellerResults(data.sellers || []);
    } catch { setSellerResults([]); }
    setSearchingSellers(false);
  }

  async function handleAdminScrape(url) {
    if (!url) return;
    setAdminScraping(true);
    try {
      const res = await fetch('/api/admin-listings?action=scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success && data.data) {
        const s = data.data;
        setCreateForm(prev => ({
          ...prev,
          original_price: s.price ? s.price.toString() : prev.original_price,
          description: s.description || prev.description,
          designer: s.title && !prev.designer ? s.title : prev.designer,
          material: s.material || prev.material
        }));
        // Auto-populate images from scraper
        if (s.images?.length) {
          imageUpload.addPhotosFromUrls(s.images);
        }
      }
    } catch { /* ignore */ }
    setAdminScraping(false);
  }

  async function submitAdminListing() {
    if (!selectedSeller) { setCreateError('Select a seller'); return; }
    if (!createForm.designer || !createForm.asking_price) { setCreateError('Designer and asking price required'); return; }
    setCreatingListing(true);
    setCreateError('');
    try {
      const res = await fetch('/api/admin-listings?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: selectedSeller.id,
          ...createForm,
          asking_price: parseFloat(createForm.asking_price) || 0,
          original_price: parseFloat(createForm.original_price) || 0
        })
      });
      const data = await res.json();
      if (data.success) {
        // Upload photos to Shopify in background — don't block UI
        const photoPreviews = imageUpload.photos.map(p => p.preview || p.url).filter(Boolean);
        if (imageUpload.photos.length > 0 && data.productId) {
          imageUpload.uploadAllToShopify(data.productId).catch(err => {
            console.error('Photo upload error (non-fatal):', err);
          });
        }

        // Optimistically insert the new listing into state — no full refetch
        const optimisticListing = {
          id: data.productId,
          shopify_product_id: data.productId,
          product_name: createForm.item_type || 'Designer Item',
          designer: createForm.designer,
          size: createForm.size || 'One Size',
          condition: createForm.condition || 'Good',
          list_price: (parseFloat(createForm.asking_price) || 0) + 10,
          asking_price_usd: parseFloat(createForm.asking_price) || 0,
          seller_payout: null,
          commission_rate: null,
          description: createForm.description || '',
          images: photoPreviews,
          created_at: new Date().toISOString(),
          shopify_admin_url: data.shopifyAdminUrl,
          tags: [
            createForm.designer,
            createForm.size,
            createForm.condition,
            'pending-approval',
            'source:admin',
            createForm.concierge ? 'concierge' : null
          ].filter(Boolean),
          seller: selectedSeller ? {
            id: selectedSeller.id,
            name: selectedSeller.name,
            email: selectedSeller.email,
            phone: selectedSeller.phone
          } : null
        };
        setListings(prev => [optimisticListing, ...prev]);
        setStats(prev => ({ ...prev, pending: (prev.pending || 0) + 1 }));

        setCreateModal(false);
        setCreateForm({ designer: '', item_type: '', size: '', color: '', material: '', condition: 'Good', original_price: '', asking_price: '', description: '', chest: '', hip: '', notes: '', concierge: false });
        setSelectedSeller(null);
        setSellerSearch('');
        setAdminScrapeUrl('');
        imageUpload.reset();
        voice.reset();
      } else {
        setCreateError(data.error || 'Failed to create listing');
      }
    } catch (err) {
      setCreateError(err.message);
    }
    setCreatingListing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Group the pending list by whose move it is — the core declutter.
  const hasTag = (l, t) => (l.tags || []).includes(t);
  const reReview = listings.filter(l => hasTag(l, 'seller-revised'));
  const fresh = listings.filter(l => !hasTag(l, 'seller-revised') && !hasTag(l, 'needs-revision'));
  const waiting = listings.filter(l => hasTag(l, 'needs-revision') && !hasTag(l, 'seller-revised'));
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>
          <p className="text-stone-500 text-sm">{todayLabel}</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add listing
        </button>
      </div>

      {/* At a glance — informational metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-stone-100 rounded-xl p-4">
          <p className="text-stone-500 text-xs">Live</p>
          <p className="text-2xl font-semibold text-stone-900 mt-1">{stats.approved}</p>
        </div>
        <div className="bg-stone-100 rounded-xl p-4">
          <p className="text-stone-500 text-xs">Sold</p>
          <p className="text-2xl font-semibold text-stone-900 mt-1">{stats.sold}</p>
        </div>
        <div className="bg-stone-100 rounded-xl p-4">
          <p className="text-stone-500 text-xs">Payouts due</p>
          <p className="text-2xl font-semibold text-stone-900 mt-1">${totalPending.toFixed(0)}</p>
        </div>
      </div>

      {/* Your move — only the things you can act on right now */}
      <div>
        <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">Your move</p>
        {(reReview.length > 0 || fresh.length > 0 || payouts.length > 0) ? (
          <div className="flex flex-col gap-2.5">
            {reReview.length > 0 && (
              <Link
                to="/admin/review"
                className="flex items-center gap-3.5 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-[0.99] transition p-4"
                style={{ borderLeft: '3px solid #378ADD' }}
              >
                <RotateCcw className="w-5 h-5 flex-shrink-0" style={{ color: '#185FA5' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900">Re-review <span className="font-normal text-stone-500">— sellers fixed these</span></p>
                  <p className="text-xs text-stone-400 mt-0.5">Each shows exactly what changed</p>
                </div>
                <span className="text-lg font-semibold" style={{ color: '#185FA5' }}>{reReview.length}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </Link>
            )}
            {fresh.length > 0 && (
              <Link
                to="/admin/review"
                className="flex items-center gap-3.5 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-[0.99] transition p-4"
                style={{ borderLeft: '3px solid #EF9F27' }}
              >
                <Sparkles className="w-5 h-5 flex-shrink-0" style={{ color: '#854F0B' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900">New submissions</p>
                  <p className="text-xs text-stone-400 mt-0.5">Never reviewed yet</p>
                </div>
                <span className="text-lg font-semibold" style={{ color: '#854F0B' }}>{fresh.length}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </Link>
            )}
            {payouts.length > 0 && (
              <Link
                to="/admin/transactions"
                className="flex items-center gap-3.5 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-[0.99] transition p-4"
                style={{ borderLeft: '3px solid #1D9E75' }}
              >
                <Banknote className="w-5 h-5 flex-shrink-0" style={{ color: '#0F6E56' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900">Payouts to send</p>
                  <p className="text-xs text-stone-400 mt-0.5">${totalPending.toFixed(0)} across {payouts.length} {payouts.length === 1 ? 'seller' : 'sellers'}</p>
                </div>
                <span className="text-lg font-semibold" style={{ color: '#0F6E56' }}>{payouts.length}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </Link>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-stone-50 border border-stone-100">
            <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
            <span className="text-sm text-stone-600">All caught up — nothing waiting on you.</span>
          </div>
        )}
      </div>

      {/* Waiting on sellers — sent back for revision, the ball's in their court */}
      {waiting.length > 0 && (
        <div>
          <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">Waiting on sellers</p>
          <div className="bg-stone-50 rounded-xl border border-stone-100 divide-y divide-stone-100">
            {waiting.map(l => {
              const { agoLabel, leftLabel, urgent } = revisionTiming(l.revisionRequestedAt);
              return (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <Clock className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-600 truncate">{l.seller?.name || 'Seller'} — {l.product_name}</p>
                    <p className="text-xs text-stone-400 truncate">{l.revisionNote || 'Revision requested'}{agoLabel ? ` · ${agoLabel}` : ''}</p>
                  </div>
                  {leftLabel && (
                    <span className={`text-xs flex-shrink-0 ${urgent ? 'text-red-600' : 'text-stone-400'}`}>{leftLabel}</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-stone-400 mt-2.5">These aren't in your review queue — the ball's in their court. They auto-expire after 7 days.</p>
        </div>
      )}

      {/* Create Listing Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create Listing for Seller</h3>
              <button onClick={() => setCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Seller Picker */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Seller <span className="text-red-500">*</span></label>
              {selectedSeller ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-medium text-gray-900">{selectedSeller.name || selectedSeller.email}</span>
                    {selectedSeller.phone && <span className="text-sm text-gray-500 ml-2">{selectedSeller.phone}</span>}
                  </div>
                  <button onClick={() => { setSelectedSeller(null); setSellerSearch(''); }} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center border border-gray-300 rounded-lg">
                    <Search className="w-4 h-4 text-gray-400 ml-3" />
                    <input
                      type="text"
                      value={sellerSearch}
                      onChange={(e) => { setSellerSearch(e.target.value); searchSellers(e.target.value); }}
                      placeholder="Search by name, email, or phone..."
                      className="flex-1 px-3 py-2 outline-none rounded-lg"
                    />
                    {searchingSellers && <Loader2 className="w-4 h-4 text-gray-400 mr-3 animate-spin" />}
                  </div>
                  {sellerResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {sellerResults.map(s => (
                        <button
                          key={s.id}
                          onClick={() => { setSelectedSeller(s); setSellerResults([]); setSellerSearch(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                        >
                          <span className="font-medium">{s.name || s.email}</span>
                          {s.phone && <span className="text-gray-500 ml-2">{s.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Product Link Scraper */}
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="block text-sm font-medium text-blue-800 mb-1">Product link (optional)</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={adminScrapeUrl}
                  onChange={(e) => setAdminScrapeUrl(e.target.value)}
                  placeholder="Paste retail URL to auto-fill"
                  className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAdminScrape(adminScrapeUrl)}
                  disabled={!adminScrapeUrl || adminScraping}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {adminScraping ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
                </button>
              </div>
            </div>

            {/* Voice AI Autofill */}
            <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-purple-800">Voice AI</span>
                  {voice.isTranscribing && <span className="text-xs text-purple-600">Transcribing...</span>}
                  {voice.isAnalyzing && <span className="text-xs text-purple-600">Analyzing...</span>}
                  {voice.transcribedText && !voice.isTranscribing && !voice.isAnalyzing && (
                    <span className="text-xs text-green-600">Fields extracted</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={voice.isRecording ? voice.stopRecording : voice.startRecording}
                  disabled={voice.isTranscribing || voice.isAnalyzing}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    voice.isRecording
                      ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  } disabled:opacity-50`}
                >
                  {voice.isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {voice.isRecording ? 'Stop' : 'Describe item'}
                </button>
              </div>
              {voiceError && <p className="text-xs text-red-600 mt-1">{voiceError}</p>}
              {voice.transcribedText && (
                <p className="text-xs text-purple-700 mt-2 line-clamp-2">{voice.transcribedText}</p>
              )}
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Designer/Brand *</label>
                  <input type="text" value={createForm.designer} onChange={e => setCreateForm(f => ({ ...f, designer: e.target.value }))}
                    placeholder="e.g., Sana Safinaz" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Item Type</label>
                  <input type="text" value={createForm.item_type} onChange={e => setCreateForm(f => ({ ...f, item_type: e.target.value }))}
                    placeholder="e.g., 3-piece suit" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
                  <select value={createForm.size} onChange={e => setCreateForm(f => ({ ...f, size: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Select...</option>
                    {['XS','S','M','L','XL','XXL','One Size','Unstitched'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                  <input type="text" value={createForm.color} onChange={e => setCreateForm(f => ({ ...f, color: e.target.value }))}
                    placeholder="e.g., Teal" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                  <select value={createForm.condition} onChange={e => setCreateForm(f => ({ ...f, condition: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {['New with tags','Like new','Excellent','Good','Fair'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
                  <input type="text" value={createForm.material} onChange={e => setCreateForm(f => ({ ...f, material: e.target.value }))}
                    placeholder="e.g., Chiffon" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Chest (")</label>
                    <input type="text" value={createForm.chest} onChange={e => setCreateForm(f => ({ ...f, chest: e.target.value }))}
                      placeholder="36" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Hip (")</label>
                    <input type="text" value={createForm.hip} onChange={e => setCreateForm(f => ({ ...f, hip: e.target.value }))}
                      placeholder="38" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Original Retail Price ($)</label>
                  <input type="number" value={createForm.original_price} onChange={e => setCreateForm(f => ({ ...f, original_price: e.target.value }))}
                    placeholder="250" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Asking Price ($) *</label>
                  <input type="number" value={createForm.asking_price} onChange={e => setCreateForm(f => ({ ...f, asking_price: e.target.value }))}
                    placeholder="95" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Item description..." rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (internal)</label>
                <input type="text" value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Admin notes..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>

              <label className="flex items-start gap-2 p-3 border border-gray-300 rounded-lg bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors">
                <input
                  type="checkbox"
                  checked={createForm.concierge}
                  onChange={e => setCreateForm(f => ({ ...f, concierge: e.target.checked }))}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium text-gray-900">Concierge item</span>
                  <span className="block text-xs text-gray-600 mt-0.5">
                    Phirstory is holding this item and will ship it when sold. Seller will get a sale notification but no shipping label.
                  </span>
                </span>
              </label>

              {/* Photo Upload */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Photos {imageUpload.photos.length > 0 && `(${imageUpload.photos.length})`}
                </label>
                <div
                  onDragOver={imageUpload.handleDragOver}
                  onDrop={imageUpload.handleDrop}
                  onClick={() => imageUpload.photoInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors"
                >
                  <Camera className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-500">Click or drag photos here</p>
                  <input
                    ref={imageUpload.photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={imageUpload.handlePhotoSelect}
                    className="hidden"
                  />
                </div>
                {imageUpload.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {imageUpload.photos.map((photo, i) => (
                      <div key={i} className="relative group w-16 h-16">
                        <img src={photo.preview} alt="" className="w-16 h-16 object-cover rounded-lg border" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); imageUpload.removePhoto(i); }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {imageUpload.processingCount > 0 && (
                      <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {createError && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setCreateModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button onClick={submitAdminListing} disabled={creatingListing}
                className="flex-1 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {creatingListing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Create Draft</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
