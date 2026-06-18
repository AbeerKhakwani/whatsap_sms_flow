import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X, Clock, DollarSign, Shirt, Sparkles, Image, Banknote, Plus, Loader2, Search, Mic, MicOff, Camera, ArrowRight } from 'lucide-react';
import { getThumbnail } from '../utils/image';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useImageUpload } from '../hooks/useImageUpload';

export default function Dashboard() {
  const navigate = useNavigate();
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
  const [togglingConcierge, setTogglingConcierge] = useState(null);

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

  async function toggleConcierge(listing, event) {
    event.stopPropagation();
    if (togglingConcierge) return;
    setTogglingConcierge(listing.id);
    const wasConcierge = listing.tags?.includes('concierge');
    // Optimistic UI
    setListings(prev => prev.map(l => l.id === listing.id
      ? { ...l, tags: wasConcierge
          ? (l.tags || []).filter(t => t !== 'concierge')
          : [...(l.tags || []), 'concierge'] }
      : l));
    try {
      const res = await fetch('/api/admin-listings?action=toggle-concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyProductId: listing.shopify_product_id })
      });
      const data = await res.json();
      if (!data.success) {
        // Revert on failure
        setListings(prev => prev.map(l => l.id === listing.id ? { ...l, tags: listing.tags || [] } : l));
        alert(`Failed: ${data.error || 'unknown error'}`);
      }
    } catch (err) {
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, tags: listing.tags || [] } : l));
      alert(`Failed: ${err.message}`);
    }
    setTogglingConcierge(null);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>
        <p className="text-stone-500 text-sm">Overview of listings and payouts</p>
      </div>

      {/* Needs you — action items lead, with functional color drawing the eye */}
      {(stats.pending > 0 || payouts.length > 0) && (
        <div>
          <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">Needs you</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stats.pending > 0 && (
              <Link to="/admin/review" className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 hover:bg-amber-100 active:scale-[0.99] transition">
                <Clock className="w-6 h-6 text-amber-600 flex-shrink-0" />
                <span className="flex-1 text-sm text-amber-800">Review listings</span>
                <span className="text-lg font-semibold text-amber-800">{stats.pending}</span>
                <ArrowRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
              </Link>
            )}
            {payouts.length > 0 && (
              <Link to="/admin/transactions" className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-100 hover:bg-green-100 active:scale-[0.99] transition">
                <Banknote className="w-6 h-6 text-green-600 flex-shrink-0" />
                <span className="flex-1 text-sm text-green-800">Payouts to send · ${totalPending.toFixed(0)}</span>
                <span className="text-lg font-semibold text-green-800">{payouts.length}</span>
                <ArrowRight className="w-4 h-4 text-green-600 flex-shrink-0" />
              </Link>
            )}
          </div>
        </div>
      )}

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

      {/* Pending Listings */}
      <div id="pending-approval" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending Approval ({listings.length})
          </h2>
          <div className="flex items-center gap-2">
            {listings.length > 0 && (
              <Link
                to="/admin/review"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                Review all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            <button
              onClick={() => setCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Listing
            </button>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Check className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <p className="text-xl font-medium">All caught up!</p>
            <p className="text-sm">No listings pending approval</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Section header: Revised */}
            {listings.some(l => l.tags?.includes('seller-revised')) && (
              <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                <span className="text-sm">✓</span>
                <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Seller Revised — Re-Review</span>
                <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                  {listings.filter(l => l.tags?.includes('seller-revised')).length}
                </span>
              </div>
            )}
            {[
              ...listings.filter(l => l.tags?.includes('seller-revised')),
              ...listings.filter(l => !l.tags?.includes('seller-revised'))
            ].map((listing, index) => {
              const revisedCount = listings.filter(l => l.tags?.includes('seller-revised')).length;
              const showNewHeader = index === revisedCount && revisedCount > 0 && revisedCount < listings.length;
              return (
              <div key={listing.id}>
                {showNewHeader && (
                  <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      New Submissions ({listings.length - revisedCount})
                    </span>
                  </div>
                )}
              <div className="hover:bg-gray-50 transition-colors">
                {/* Collapsed Header — opens its own review page */}
                <div
                  className="p-4 cursor-pointer flex items-center gap-4"
                  onClick={() => navigate(`/admin/listings/${listing.id}`)}
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    {listing.images && listing.images.length > 0 ? (
                      <img
                        src={getThumbnail(listing.images[0])}
                        alt={listing.product_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => e.target.src = 'https://via.placeholder.com/64?text=No+Image'}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Image className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{listing.designer}</span>
                      <span className="text-gray-400">-</span>
                      <span className="text-gray-600 truncate">{listing.product_name}</span>
                      {listing.tags?.includes('needs-revision') && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium flex-shrink-0">Needs Revision</span>
                      )}
                      {listing.tags?.includes('seller-revised') && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex-shrink-0">✓ Seller Revised</span>
                      )}
                      <button
                        onClick={(e) => toggleConcierge(listing, e)}
                        disabled={togglingConcierge === listing.id}
                        title={listing.tags?.includes('concierge')
                          ? 'Concierge: Phirstory ships. Click to unset.'
                          : 'Not concierge. Click to mark as held & shipped by Phirstory.'}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 transition-colors disabled:opacity-50 ${
                          listing.tags?.includes('concierge')
                            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {listing.tags?.includes('concierge') ? '★ Concierge' : '☆ Concierge'}
                      </button>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        asks ${listing.asking_price_usd || 0}
                        <span className="text-gray-300 text-xs">→ lists ${listing.asking_price_usd || 0}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Shirt className="w-3 h-3" />
                        {listing.size}
                      </span>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {listing.condition}
                      </span>
                    </div>
                  </div>

                  {/* Opens its own review page */}
                  <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                </div>
              </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

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
