import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Check, X, Clock, User, DollarSign, Tag, Shirt, Palette, Sparkles, Image, ExternalLink, Banknote, AlertCircle, CheckCircle, Plus, Loader2, Search, Link as LinkIcon, Mic, MicOff, Camera, Trash2, RotateCcw } from 'lucide-react';
import { getThumbnail } from '../utils/image';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useImageUpload } from '../hooks/useImageUpload';

const REJECTION_REASONS = [
  { value: 'poor_photos', label: 'Poor Photo Quality' },
  { value: 'missing_info', label: 'Missing Information' },
  { value: 'wrong_designer', label: 'Not Pakistani Designer' },
  { value: 'condition_issues', label: 'Condition Issues' },
  { value: 'pricing_too_high', label: 'Pricing Too High' },
  { value: 'duplicate', label: 'Duplicate Listing' },
  { value: 'not_resale', label: 'Not Eligible for Resale' },
  { value: 'other', label: 'Other' }
];

export default function Dashboard() {
  const [listings, setListings] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [approving, setApproving] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(null);
  const [stats, setStats] = useState({ pending: 0, approved: 0, sold: 0 });
  const [rejectModal, setRejectModal] = useState({ open: false, listing: null });
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [approveModal, setApproveModal] = useState({ open: false, listing: null });
  const [revisionModal, setRevisionModal] = useState({ open: false, listing: null });
  const [revisionNote, setRevisionNote] = useState('');
  const [submittingRevision, setSubmittingRevision] = useState(false);

  // Admin Create Listing state
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    designer: '', item_type: '', size: '', color: '', material: '', condition: 'Good',
    original_price: '', asking_price: '', description: '', chest: '', hip: '', notes: ''
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

  // Mark Paid modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payingPayout, setPayingPayout] = useState(null);
  const [paySellerNote, setPaySellerNote] = useState('');
  const [payAdminNote, setPayAdminNote] = useState('');
  const [paySkipNotification, setPaySkipNotification] = useState(false);
  const sellerNoteRef = useRef(null);

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

  function openPayModal(payout) {
    setPayingPayout(payout);
    setPaySellerNote('');
    setPayAdminNote('');
    setPaySkipNotification(false);
    setShowPayModal(true);
    setTimeout(() => sellerNoteRef.current?.focus(), 100);
  }

  function closePayModal() {
    setShowPayModal(false);
    setPayingPayout(null);
    setPaySellerNote('');
    setPayAdminNote('');
    setPaySkipNotification(false);
  }

  async function confirmMarkAsPaid() {
    if (!payingPayout) return;
    setMarkingPaid(payingPayout.id);
    try {
      const response = await fetch('/api/admin-listings?action=mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: payingPayout.id,
          sellerNote: paySellerNote || undefined,
          adminNote: payAdminNote || undefined,
          skipNotification: paySkipNotification || undefined
        })
      });

      const data = await response.json();

      if (data.success) {
        setPayouts(prev => prev.filter(p => p.id !== payingPayout.id));
        setTotalPending(prev => prev - (payingPayout.seller_payout || 0));
        setStats(prev => ({ ...prev, sold: prev.sold }));
        closePayModal();
      } else {
        alert(`Error: ${data.error || 'Failed to mark as paid'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
    setMarkingPaid(null);
  }

  function handlePayKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      confirmMarkAsPaid();
    }
  }

  function openApproveModal(listing) {
    setApproveModal({ open: true, listing });
  }

  function closeApproveModal() {
    setApproveModal({ open: false, listing: null });
  }

  async function confirmApproval() {
    const { listing } = approveModal;

    setApproving(listing.id);
    try {
      const response = await fetch('/api/admin-listings?action=approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopifyProductId: listing.shopify_product_id
        })
      });

      const data = await response.json();

      if (data.success) {
        setListings(prev => prev.filter(l => l.id !== listing.id));
        setStats(prev => ({ ...prev, pending: prev.pending - 1, approved: prev.approved + 1 }));
        setExpandedId(null);
        closeApproveModal();
      } else {
        alert(`Error: ${data.error || 'Failed to approve'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
    setApproving(null);
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
        // Upload photos to Shopify if any
        if (imageUpload.photos.length > 0 && data.productId) {
          try {
            await imageUpload.uploadAllToShopify(data.productId);
          } catch (err) {
            console.error('Photo upload error (non-fatal):', err);
          }
        }
        setCreateModal(false);
        setCreateForm({ designer: '', item_type: '', size: '', color: '', material: '', condition: 'Good', original_price: '', asking_price: '', description: '', chest: '', hip: '', notes: '' });
        setSelectedSeller(null);
        setSellerSearch('');
        setAdminScrapeUrl('');
        imageUpload.reset();
        voice.reset();
        fetchData(); // Refresh listings
      } else {
        setCreateError(data.error || 'Failed to create listing');
      }
    } catch (err) {
      setCreateError(err.message);
    }
    setCreatingListing(false);
  }

  function openRejectModal(listing) {
    setRejectModal({ open: true, listing });
    setRejectReason('');
    setRejectNote('');
  }

  function closeRejectModal() {
    setRejectModal({ open: false, listing: null });
    setRejectReason('');
    setRejectNote('');
  }

  function openRevisionModal(listing) {
    setRevisionModal({ open: true, listing });
    setRevisionNote('');
  }

  function closeRevisionModal() {
    setRevisionModal({ open: false, listing: null });
    setRevisionNote('');
  }

  async function submitRevision() {
    const { listing } = revisionModal;
    if (!revisionNote.trim()) return;

    setSubmittingRevision(true);
    try {
      const response = await fetch('/api/admin-listings?action=request-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyProductId: listing.id, note: revisionNote.trim() })
      });
      const data = await response.json();
      if (data.success) {
        setListings(prev => prev.map(l =>
          l.id === listing.id ? { ...l, tags: [...(l.tags || []).filter(t => t !== 'pending-approval'), 'needs-revision'] } : l
        ));
        closeRevisionModal();
      } else {
        alert(`Error: ${data.error || 'Failed to request revision'}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
    setSubmittingRevision(false);
  }

  async function submitRejection() {
    const { listing } = rejectModal;

    if (!rejectReason) {
      alert('Please select a rejection reason');
      return;
    }

    setApproving(listing.id);
    try {
      const reasonLabel = REJECTION_REASONS.find(r => r.value === rejectReason)?.label || rejectReason;

      const response = await fetch('/api/admin-listings?action=reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopifyProductId: listing.shopify_product_id,
          reason: reasonLabel,
          note: rejectNote.trim() || null
        })
      });

      const data = await response.json();

      if (data.success) {
        setListings(prev => prev.filter(l => l.id !== listing.id));
        setStats(prev => ({ ...prev, pending: prev.pending - 1 }));
        setExpandedId(null);
        closeRejectModal();
      } else {
        alert(`Error: ${data.error || 'Failed to reject'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
    setApproving(null);
  }

  async function simulateSale(listing) {
    if (!confirm(`Simulate a sale for "${listing.product_name}"? This will create a test transaction and notify the seller.`)) return;
    try {
      const res = await fetch('/api/admin-listings?action=simulate-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: listing.shopify_product_id,
          sellerId: listing.seller?.id,
          salePrice: listing.asking_price_usd
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  function toggleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm">Overview of listings and payouts</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide">Pending</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pending}</p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide">Live</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.approved}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide">Sold</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.sold}</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-black rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">Payouts Due</p>
              <p className="text-2xl font-bold mt-1">${totalPending.toFixed(0)}</p>
            </div>
            <Banknote className="w-8 h-8 text-gray-500" />
          </div>
        </div>
      </div>

      {/* Pending Payouts Section */}
      {payouts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              Pending Payouts
            </h2>
            <span className="text-sm text-gray-500">{payouts.length} items · ${totalPending.toFixed(0)}</span>
          </div>

          <div className="divide-y divide-gray-100">
            {payouts.map((payout) => (
              <div key={payout.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{payout.product_title}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      ${payout.sale_price?.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>{payout.seller?.name || payout.seller?.email || 'Unknown'}</span>
                    <span>·</span>
                    <span className="font-medium text-gray-900">${payout.seller_payout?.toFixed(2)} payout</span>
                    <span>·</span>
                    <span>{payout.order_name}</span>
                  </div>
                </div>

                <button
                  onClick={() => openPayModal(payout)}
                  className="ml-4 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Check className="w-3 h-3" />
                  Mark Paid
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Listings */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending Approval ({listings.length})
          </h2>
          <button
            onClick={() => setCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Listing
          </button>
        </div>

        {listings.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Check className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <p className="text-xl font-medium">All caught up!</p>
            <p className="text-sm">No listings pending approval</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {listings.map((listing) => (
              <div key={listing.id} className="hover:bg-gray-50 transition-colors">
                {/* Collapsed Header */}
                <div
                  className="p-4 cursor-pointer flex items-center gap-4"
                  onClick={() => toggleExpand(listing.id)}
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

                  {/* Expand Arrow */}
                  <div className="flex-shrink-0">
                    {expandedId === listing.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === listing.id && (
                  <div className="px-4 pb-4 space-y-4 bg-gray-50 border-t border-gray-100">
                    {/* Seller Info */}
                    {listing.seller && (
                      <div className="pt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                          <User className="w-4 h-4" />
                          Seller
                        </h4>
                        <div className="bg-white p-3 rounded-lg shadow-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{listing.seller.name || 'Unknown'}</p>
                              <p className="text-sm text-gray-600">{listing.seller.email}</p>
                              {listing.seller.phone && !listing.seller.phone.startsWith('NOPHONE') && !listing.seller.phone.startsWith('RESET_') && (
                                <p className="text-sm text-gray-600">{listing.seller.phone}</p>
                              )}
                            </div>
                            {listing.seller_payout > 0 && (
                              <div className="text-right">
                                <p className="text-xs text-gray-500">Payout if sold</p>
                                <p className="text-lg font-bold text-green-600">${listing.seller_payout.toFixed(2)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Photo Gallery */}
                    <div className={listing.seller ? '' : 'pt-4'}>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Image className="w-4 h-4" />
                        Photos ({listing.images?.length || 0})
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {listing.images?.length > 0 ? listing.images.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="aspect-square rounded-lg overflow-hidden bg-gray-200 hover:opacity-90 transition-opacity"
                          >
                            <img
                              src={getThumbnail(url)}
                              alt={`Photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => e.target.src = 'https://via.placeholder.com/200?text=Error'}
                            />
                          </a>
                        )) : (
                          <div className="aspect-square rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">
                            <Image className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <Tag className="w-3 h-3" />
                          Designer
                        </div>
                        <p className="font-medium text-gray-900">{listing.designer || 'Unknown'}</p>
                      </div>

                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <Shirt className="w-3 h-3" />
                          Size
                        </div>
                        <p className="font-medium text-gray-900">{listing.size || 'Unknown'}</p>
                      </div>

                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <Sparkles className="w-3 h-3" />
                          Condition
                        </div>
                        <p className="font-medium text-gray-900">{listing.condition || 'Unknown'}</p>
                      </div>

                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <DollarSign className="w-3 h-3" />
                          Seller Asking Price
                        </div>
                        <p className="font-medium text-green-600">${listing.asking_price_usd || 0}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Lists at ${listing.asking_price_usd || 0} (+$10 fee)</p>
                      </div>
                    </div>

                    {/* Tags */}
                    {listing.tags && listing.tags.length > 0 && (
                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="text-gray-500 text-xs mb-2">Tags</div>
                        <div className="flex flex-wrap gap-1">
                          {listing.tags.map((tag, idx) => (
                            <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="text-gray-500 text-xs mb-1">Description</div>
                      <p className="text-gray-700 text-sm">{listing.description || 'No description'}</p>
                    </div>

                    {/* Shopify Link */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <a
                        href={listing.shopify_admin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View/Edit in Shopify Admin
                      </a>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => openApproveModal(listing)}
                        disabled={approving === listing.id}
                        className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-lg font-semibold hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Check className="w-5 h-5" />
                        {listing.tags?.includes('seller-revised') ? 'Re-review & Approve' : 'Review & Approve'}
                      </button>

                      <button
                        onClick={() => openRevisionModal(listing)}
                        disabled={approving === listing.id}
                        className="px-4 bg-amber-100 text-amber-700 py-3 rounded-lg font-semibold hover:bg-amber-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        title="Request seller to update something"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Revise
                      </button>

                      <button
                        onClick={() => openRejectModal(listing)}
                        disabled={approving === listing.id}
                        className="px-4 bg-red-100 text-red-600 py-3 rounded-lg font-semibold hover:bg-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <X className="w-5 h-5" />
                        Reject
                      </button>
                    </div>
                    {listing.seller?.id && (
                      <button
                        onClick={() => simulateSale(listing)}
                        className="w-full mt-2 text-xs text-gray-500 hover:text-purple-600 py-1 transition-colors"
                      >
                        Simulate Sale (test shipping flow)
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {approveModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Approve Listing</h3>
                <p className="text-sm text-gray-500">{approveModal.listing?.product_name}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="font-medium">Seller:</span> {approveModal.listing?.seller_name || approveModal.listing?.seller_email || 'Unknown'}</p>
                  <p><span className="font-medium">Price:</span> ${approveModal.listing?.price || '—'}</p>
                  {approveModal.listing?.size && <p><span className="font-medium">Size:</span> {approveModal.listing.size}</p>}
                </div>
              </div>

              <a
                href={`https://${import.meta.env.VITE_SHOPIFY_STORE_URL}/admin/products/${approveModal.listing?.shopify_product_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Edit in Shopify before approving
              </a>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-800">
                  This will make the listing live, add "New Arrivals" tag, and notify the seller via email and WhatsApp.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeApproveModal}
                disabled={approving === approveModal.listing?.id}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmApproval}
                disabled={approving === approveModal.listing?.id}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {approving === approveModal.listing?.id ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Approving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Approve & Make Live
                  </>
                )}
              </button>
            </div>
          </div>
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

      {/* Revision Request Modal */}
      {revisionModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Request Revision</h3>
                <p className="text-sm text-gray-500">{revisionModal.listing?.product_name}</p>
              </div>
            </div>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                'Please update the price',
                'Please update the designer name',
                'Please submit a clearer photo of the tag',
                'Please add more photos',
              ].map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setRevisionNote(chip)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    revisionNote === chip
                      ? 'bg-amber-100 border-amber-400 text-amber-800 font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-amber-300'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            <textarea
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="Or write a custom note for the seller..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none text-sm"
            />

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
              <p className="text-xs text-amber-800">
                The seller will receive a WhatsApp message and email with your note and a link to update their listing. The draft stays alive.
              </p>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={closeRevisionModal}
                disabled={submittingRevision}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitRevision}
                disabled={submittingRevision || !revisionNote.trim()}
                className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingRevision ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Send Revision Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Reject Listing</h3>
                <p className="text-sm text-gray-500">{rejectModal.listing?.product_name}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for rejection *
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="">Select a reason...</option>
                  {REJECTION_REASONS.map(reason => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional note (optional)
                </label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Add any specific feedback for the seller..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  The seller will receive an email and WhatsApp message with this rejection reason.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeRejectModal}
                disabled={approving === rejectModal.listing?.id}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={approving === rejectModal.listing?.id || !rejectReason}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {approving === rejectModal.listing?.id ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Rejecting...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    Reject & Notify
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Confirmation Modal */}
      {showPayModal && payingPayout && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Payout</h3>
              <p className="text-sm text-gray-500 mt-1">Mark this transaction as paid</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">{payingPayout.product_title}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-gray-500">Payout Amount</span>
                  <span className="text-xl font-bold text-green-600">${payingPayout.seller_payout?.toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  To: {payingPayout.seller?.name || payingPayout.seller?.email || 'Unknown'}
                  {payingPayout.seller?.paypal_email && ` (${payingPayout.seller.paypal_email})`}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Payment Method <span className="text-gray-400 font-normal">(shown to seller)</span>
                </label>
                <input
                  ref={sellerNoteRef}
                  type="text"
                  value={paySellerNote}
                  onChange={(e) => setPaySellerNote(e.target.value)}
                  onKeyDown={handlePayKeyDown}
                  placeholder="e.g., via PayPal, via Zelle, via Venmo..."
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Admin Note <span className="text-gray-400 font-normal">(internal only)</span>
                </label>
                <textarea
                  value={payAdminNote}
                  onChange={(e) => setPayAdminNote(e.target.value)}
                  onKeyDown={handlePayKeyDown}
                  placeholder="e.g., PayPal transaction ID..."
                  rows={2}
                  className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 bg-gray-50"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paySkipNotification}
                  onChange={(e) => setPaySkipNotification(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-600">Skip seller notification</span>
                <span className="text-xs text-gray-400">(no WhatsApp/email)</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={closePayModal}
                disabled={markingPaid}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmMarkAsPaid}
                disabled={markingPaid}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${
                  paySkipNotification ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {markingPaid ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {paySkipNotification ? 'Mark Paid (Silent)' : 'Confirm & Notify'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
