import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Package, DollarSign, Clock, CheckCircle, Edit2, ExternalLink,
  ChevronRight, X, Plus, Trash2, RotateCcw, XCircle,
  Loader2, ArrowUpDown, AlertCircle, Camera, MapPin
} from 'lucide-react';
import { getThumbnail } from '../../utils/image';
import SellerLayout from './SellerLayout';

const API_URL = import.meta.env.VITE_API_URL || '';

// Parse revision fields — uses explicit array from admin if available, else regex fallback
function parseRevisionNeeds(note, fields) {
  if (fields?.length) {
    return {
      photos:       fields.includes('photos'),
      price:        fields.includes('price'),
      designer:     fields.includes('designer'),
      measurements: fields.includes('measurements'),
      description:  fields.includes('description'),
      title:        fields.includes('title'),
    };
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

function StatusBadge({ listing }) {
  if (listing.isSold) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wide">Sold</span>;
  if (listing.tags?.includes('needs-revision')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wide">Action Required</span>;
  if (listing.tags?.includes('seller-revised')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 uppercase tracking-wide">Under Review</span>;
  if (listing.tags?.includes('delisted')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 uppercase tracking-wide">Delisted</span>;
  if (listing.status === 'active') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide">Live</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700 uppercase tracking-wide">Pending Review</span>;
}

export default function SellerDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(null);
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ total: 0, draft: 0, active: 0, sold: 0 });
  const [seller, setSeller] = useState(null);
  const [soldProducts, setSoldProducts] = useState([]);
  const [rejectedListings, setRejectedListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [counterInputs, setCounterInputs] = useState({});
  const [respondingOffer, setRespondingOffer] = useState(null);
  const [togglingStatus, setTogglingStatus] = useState(null);

  // Edit modal state
  const [editingListing, setEditingListing] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', price: '', condition: '', description: '' });
  const [existingImages, setExistingImages] = useState([]);
  const [imagesToDelete, setImagesToDelete] = useState([]);
  const [newPhotos, setNewPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const photoInputRef = useRef(null);

  // Revision edit modal state
  const [revisionListing, setRevisionListing] = useState(null);
  const [revisionForm, setRevisionForm] = useState({ price: '', designer: '', title: '', measurements: '', description: '' });
  const [revisionPhotos, setRevisionPhotos] = useState([]);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const revisionPhotoRef = useRef(null);

  // Address modal
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [shippingAddress, setShippingAddress] = useState({ full_name: '', street_address: '', city: '', state: '', postal_code: '', country: 'USA' });

  useEffect(() => {
    const token = localStorage.getItem('seller_token');
    const storedEmail = localStorage.getItem('seller_email');
    if (!token) { navigate('/login'); return; }
    verifyAndFetch(token, storedEmail);
  }, [navigate]);

  function applyListingsData(data) {
    setListings(data.listings || []);
    setStats(data.stats || { total: 0, draft: 0, active: 0, sold: 0 });
    setSeller(data.seller);
    setSoldProducts(data.soldProducts || []);
    setRejectedListings(data.rejectedListings || []);
  }

  async function verifyAndFetch(token, storedEmail) {
    try {
      const authRes = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'verify-token' })
      });
      const authData = await authRes.json();
      if (!authRes.ok || !authData.success) {
        localStorage.removeItem('seller_token');
        localStorage.removeItem('seller_email');
        navigate('/login');
        return;
      }
      const sellerEmail = authData.seller.email || storedEmail;
      setEmail(sellerEmail);
      setSeller(authData.seller);
      if (!authData.seller.has_address) setShowAddressModal(true);
      fetchListings(sellerEmail);
      if (authData.seller?.id) fetchOffers(authData.seller.id);
    } catch {
      navigate('/login');
    }
  }

  async function fetchListings(sellerEmail) {
    const cacheKey = `listings_cache_${sellerEmail}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { applyListingsData(JSON.parse(cached)); setLoading(false); }
    } catch {}
    try {
      const res = await fetch(`/api/seller?action=listings&email=${encodeURIComponent(sellerEmail)}`);
      const data = await res.json();
      if (data.success) {
        applyListingsData(data);
        try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function fetchOffers(sellerId) {
    try {
      const r = await fetch(`${API_URL}/api/seller?action=get-offers&sellerId=${sellerId}`);
      const d = await r.json();
      if (d.success) setOffers(d.offers || []);
    } catch {}
  }

  async function respondToOffer(offerId, response, counterAmount) {
    setRespondingOffer(offerId);
    try {
      const r = await fetch(`${API_URL}/api/seller?action=respond-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId, response, counterAmount: counterAmount ? parseFloat(counterAmount) : undefined })
      });
      const d = await r.json();
      if (d.success) {
        setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: d.status, amount: d.counterAmount || o.amount } : o));
        setCounterInputs(prev => { const n = { ...prev }; delete n[offerId]; return n; });
      }
    } catch {}
    setRespondingOffer(null);
  }

  function handleLogout() {
    localStorage.removeItem('seller_token');
    localStorage.removeItem('seller_email');
    navigate('/login');
  }

  function openEditModal(listing) {
    setEditingListing(listing);
    // Show seller's asking price (not the Shopify price which includes the $10 platform fee)
    setEditForm({ title: listing.title, price: listing.sellerAskingPrice || listing.price, condition: listing.condition || '', description: listing.description || '' });
    setExistingImages(listing.images || []);
    setImagesToDelete([]);
    setNewPhotos([]);
    setUploadProgress('');
  }

  function openRevisionModal(listing) {
    setRevisionListing(listing);
    // Pre-fill with seller's asking price (not the Shopify price with fee)
    setRevisionForm({ price: listing.sellerAskingPrice || listing.price || '', designer: listing.designer || '', title: listing.title || '', measurements: '', description: listing.description || '' });
    setRevisionPhotos([]);
  }

  function handlePhotoSelect(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setNewPhotos(prev => [...prev, { preview: ev.target.result, file, base64: ev.target.result.split(',')[1] }]);
      reader.readAsDataURL(file);
    });
  }

  function handleRevisionPhotoSelect(e) {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setRevisionPhotos(prev => [...prev, { preview: ev.target.result, file, base64: ev.target.result.split(',')[1] }]);
      reader.readAsDataURL(file);
    });
  }

  async function handleSaveEdit() {
    if (!editingListing) return;
    setSaving(true);
    try {
      const res = await fetch('/api/seller?action=update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, productId: editingListing.id, title: editForm.title, askingPrice: parseFloat(editForm.price), condition: editForm.condition, description: editForm.description })
      });
      const data = await res.json();
      if (!data.success) { alert(data.error || 'Failed to save'); setSaving(false); return; }

      if (imagesToDelete.length > 0) {
        for (let i = 0; i < imagesToDelete.length; i++) {
          setUploadProgress(`Removing photo ${i+1}...`);
          await fetch('/api/product-image?action=delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: editingListing.id, imageId: imagesToDelete[i].id }) }).catch(() => {});
        }
      }
      const finalImages = [...existingImages];
      if (newPhotos.length > 0) {
        for (let i = 0; i < newPhotos.length; i++) {
          setUploadProgress(`Uploading photo ${i+1} of ${newPhotos.length}...`);
          const pRes = await fetch('/api/product-image?action=add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: editingListing.id, base64: newPhotos[i].base64, filename: newPhotos[i].file?.name || `photo-${i}.jpg` }) }).catch(() => ({ json: async () => ({}) }));
          const pData = await pRes.json();
          if (pData.success) finalImages.push({ id: pData.imageId, src: newPhotos[i].preview });
        }
      }
      setListings(prev => prev.map(l => l.id === editingListing.id ? { ...l, title: editForm.title, sellerAskingPrice: parseFloat(editForm.price), condition: editForm.condition, description: editForm.description, images: finalImages, image: finalImages[0]?.src || l.image } : l));
      setEditingListing(null);
      setUploadProgress('');
    } catch { alert('Something went wrong'); }
    finally { setSaving(false); }
  }

  async function handleSubmitRevision() {
    if (!revisionListing) return;
    const reqs = parseRevisionNeeds(revisionListing.revisionNote || '', revisionListing.revisionFields);
    setSubmittingRevision(true);

    try {
      // Upload any new photos first
      if (revisionPhotos.length > 0) {
        for (let i = 0; i < revisionPhotos.length; i++) {
          setUploadProgress(`Uploading photo ${i+1} of ${revisionPhotos.length}...`);
          await fetch('/api/product-image?action=add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: revisionListing.id, base64: revisionPhotos[i].base64, filename: revisionPhotos[i].file?.name || `photo-${i}.jpg` }) }).catch(() => {});
        }
      }

      // Build update payload from filled fields
      const updatePayload = { email, productId: revisionListing.id };
      if (reqs.price && revisionForm.price) updatePayload.askingPrice = parseFloat(revisionForm.price);
      if (reqs.title && revisionForm.title) updatePayload.title = revisionForm.title;
      if (reqs.description && revisionForm.description) updatePayload.description = revisionForm.description;
      if (reqs.designer && revisionForm.designer) updatePayload.designer = revisionForm.designer;
      if (reqs.measurements && revisionForm.measurements) updatePayload.measurements = revisionForm.measurements;

      const res = await fetch('/api/seller?action=update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
      const data = await res.json();
      if (data.success) {
        // Update local listing — flip tag to seller-revised
        setListings(prev => prev.map(l => {
          if (l.id !== revisionListing.id) return l;
          const newTags = [...(l.tags || []).filter(t => t !== 'needs-revision'), 'seller-revised'];
          return { ...l, tags: newTags, revisionNote: null, revisionDeadline: null, ...(updatePayload.askingPrice && { sellerAskingPrice: updatePayload.askingPrice }), ...(updatePayload.title && { title: updatePayload.title }) };
        }));
        setRevisionListing(null);
        setRevisionPhotos([]);
        setUploadProgress('');
      } else {
        alert(data.error || 'Failed to submit update');
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSubmittingRevision(false); }
  }

  async function toggleListingStatus(listing) {
    const isDelisted = listing.tags?.includes('delisted');
    const action = isDelisted ? 'relist' : 'delist';
    setTogglingStatus(listing.id);
    try {
      const res = await fetch(`/api/seller?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, productId: listing.id }) });
      const data = await res.json();
      if (data.success) {
        setListings(prev => prev.map(l => {
          if (l.id !== listing.id) return l;
          const newTags = action === 'delist'
            ? [...(l.tags || []).filter(t => t !== 'pending-approval'), 'delisted']
            : [...(l.tags || []).filter(t => t !== 'delisted'), 'pending-approval'];
          return { ...l, status: data.status, tags: newTags };
        }));
      } else { alert(`Failed: ` + (data.error || '')); }
    } catch (e) { alert(e.message); }
    setTogglingStatus(null);
  }

  async function handleSaveAddress() {
    if (!shippingAddress.street_address || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postal_code) return;
    setSavingAddress(true);
    try {
      const res = await fetch(`${API_URL}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-address', email, shipping_address: shippingAddress }) });
      const data = await res.json();
      if (data.success) { setSeller(s => ({ ...s, has_address: true })); setShowAddressModal(false); }
    } catch {}
    setSavingAddress(false);
  }

  const needsRevision = listings.filter(l => l.tags?.includes('needs-revision'));
  const activeLiistings = listings.filter(l => !l.isSold);
  const pendingOffers = offers.filter(o => o.status === 'pending' || o.status === 'countered');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#C91A2B] border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px' }} />
      </div>
    );
  }

  return (
    <SellerLayout seller={seller} email={email} onLogout={handleLogout} revisionCount={needsRevision.length}>
      <div className="px-4 pt-6 pb-4 md:px-0 md:pt-0 space-y-5">

        {/* ── REVISION ALERTS ── */}
        {needsRevision.map(listing => {
          const days = daysLeft(listing.revisionDeadline);
          const urgent = days !== null && days <= 2;
          return (
            <div key={listing.id} className={`rounded-2xl border-2 p-4 ${urgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${urgent ? 'bg-red-100' : 'bg-amber-100'}`}>
                  <AlertCircle className={`w-4 h-4 ${urgent ? 'text-red-600' : 'text-amber-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${urgent ? 'text-red-800' : 'text-amber-800'}`}>
                    {urgent && days === 0 ? '⚠️ Action overdue — listing will be deactivated soon' : `Update required for "${listing.title}"`}
                  </p>
                  {listing.revisionNote && (
                    <p className={`text-sm mt-1 font-medium ${urgent ? 'text-red-700' : 'text-amber-700'}`}>
                      "{listing.revisionNote}"
                    </p>
                  )}
                  {days !== null && (
                    <p className={`text-xs mt-1 ${urgent ? 'text-red-600' : 'text-amber-600'}`}>
                      {days === 0 ? 'Overdue — update now to keep this listing' : `${days} day${days === 1 ? '' : 's'} left to update, or this listing will be deactivated`}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => openRevisionModal(listing)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors ${urgent ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                >
                  Update Now
                </button>
              </div>
            </div>
          );
        })}

        {/* ── EARNINGS HERO ── */}
        {seller && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Total Earned</p>
                <p className="text-3xl font-bold mt-1">${(seller.totalEarnings || 0).toFixed(0)}</p>
              </div>
              {(seller.pendingPayout || 0) > 0 && (
                <div className="text-right">
                  <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Pending</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">${(seller.pendingPayout || 0).toFixed(0)}</p>
                </div>
              )}
            </div>
            <p className="text-gray-500 text-xs mt-3">Commission deducted — your payout shown per listing</p>
          </div>
        )}

        {/* ── STATS ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900' },
            { label: 'Pending', value: stats.draft, color: 'text-yellow-600' },
            { label: 'Live', value: stats.active, color: 'text-green-600' },
            { label: 'Sold', value: stats.sold, color: 'text-blue-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── OFFERS BADGE ── */}
        {pendingOffers.length > 0 && (
          <Link to="/seller/profile?tab=offers" className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center">
                <ArrowUpDown className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{pendingOffers.length} pending offer{pendingOffers.length > 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-400">Buyers are interested — respond now</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors" />
          </Link>
        )}

        {/* ── LISTINGS GRID ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-base">Your Listings</h2>
            <Link to="/submit" className="text-xs text-[#C91A2B] font-semibold flex items-center gap-1 hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add New
            </Link>
          </div>

          {listings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-200 mb-4" />
              <p className="text-gray-400 text-sm mb-4">No listings yet</p>
              <Link to="/submit" className="inline-flex items-center gap-2 bg-[#C91A2B] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#a81523] transition-colors">
                Submit your first listing
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {listings.map(listing => {
                const needsRev = listing.tags?.includes('needs-revision');
                const isDelisted = listing.tags?.includes('delisted');
                const days = needsRev ? daysLeft(listing.revisionDeadline) : null;
                return (
                  <div
                    key={listing.id}
                    className={`bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-md ${needsRev ? 'border-amber-300 ring-2 ring-amber-200' : 'border-gray-100'}`}
                  >
                    {/* Image */}
                    <div className="relative aspect-[4/5] bg-gray-50 overflow-hidden">
                      {listing.image ? (
                        <img src={getThumbnail(listing.image)} alt={listing.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-200" />
                        </div>
                      )}
                      {/* Status overlay */}
                      <div className="absolute top-2 left-2">
                        <StatusBadge listing={listing} />
                      </div>
                      {/* Revision days warning */}
                      {needsRev && days !== null && (
                        <div className={`absolute bottom-2 left-2 right-2 text-center py-1 rounded-lg text-[10px] font-bold ${days <= 2 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                          {days === 0 ? 'Overdue!' : `${days}d left`}
                        </div>
                      )}
                      {/* Sold overlay */}
                      {listing.isSold && (
                        <div className="absolute inset-0 bg-black/20 flex items-end justify-end p-2">
                          <span className="bg-[#C91A2B] text-white text-[10px] font-bold px-2 py-1 rounded-lg">SOLD</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <p className="font-semibold text-gray-900 text-xs truncate">{listing.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{listing.size} · {listing.condition}</p>
                      <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-gray-900">${(listing.sellerAskingPrice || listing.price)?.toFixed(0)}</p>
                          <p className="text-[10px] text-green-600 font-medium">→ ${listing.sellerPayout?.toFixed(0)}</p>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {needsRev ? (
                            <button
                              onClick={() => openRevisionModal(listing)}
                              className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition-colors"
                            >
                              Update
                            </button>
                          ) : !listing.isSold && (
                            <>
                              <button
                                onClick={() => openEditModal(listing)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {listing.status === 'active' && !isDelisted && (
                                <button
                                  onClick={() => toggleListingStatus(listing)}
                                  disabled={togglingStatus === listing.id}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delist"
                                >
                                  {togglingStatus === listing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {isDelisted && (
                                <button
                                  onClick={() => toggleListingStatus(listing)}
                                  disabled={togglingStatus === listing.id}
                                  className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Relist"
                                >
                                  {togglingStatus === listing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {listing.status === 'active' && listing.handle && (
                                <a href={`https://thephirstory.com/products/${listing.handle}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="View live">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ══ REVISION EDIT MODAL ══ */}
      {revisionListing && (() => {
        const reqs = parseRevisionNeeds(revisionListing.revisionNote || '', revisionListing.revisionFields);
        const hasAnyReq = Object.values(reqs).some(Boolean);
        const isValid = (
          (!reqs.photos || revisionPhotos.length > 0) &&
          (!reqs.price || (revisionForm.price && parseFloat(revisionForm.price) > 0)) &&
          (!reqs.designer || revisionForm.designer.trim()) &&
          (!reqs.title || revisionForm.title.trim()) &&
          (!reqs.measurements || revisionForm.measurements.trim()) &&
          (!reqs.description || revisionForm.description.trim())
        );
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-gray-100 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Update Required</h3>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">{revisionListing.title}</p>
                </div>
                <button onClick={() => setRevisionListing(null)} className="p-1.5 hover:bg-gray-100 rounded-xl">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* The note */}
                {revisionListing.revisionNote && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Requested change</p>
                    <p className="text-sm text-amber-800 font-medium">"{revisionListing.revisionNote}"</p>
                  </div>
                )}

                {/* Dynamic fields */}
                {reqs.photos && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Add Photos <span className="text-red-500">*</span></label>
                    <input ref={revisionPhotoRef} type="file" accept="image/*" multiple className="hidden" onChange={handleRevisionPhotoSelect} />
                    <button onClick={() => revisionPhotoRef.current?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 flex flex-col items-center gap-2 text-gray-400 hover:border-[#C91A2B] hover:text-[#C91A2B] transition-colors">
                      <Camera className="w-6 h-6" />
                      <span className="text-sm font-medium">Tap to add photos</span>
                    </button>
                    {revisionPhotos.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {revisionPhotos.map((p, i) => (
                          <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100">
                            <img src={p.preview} className="w-full h-full object-cover" />
                            <button onClick={() => setRevisionPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                              <X className="w-2.5 h-2.5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {reqs.price && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Your New Asking Price (CAD) <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                      <input
                        type="number"
                        value={revisionForm.price}
                        onChange={e => setRevisionForm(f => ({ ...f, price: e.target.value }))}
                        className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B]"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>
                  </div>
                )}

                {reqs.designer && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Designer / Brand <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={revisionForm.designer}
                      onChange={e => setRevisionForm(f => ({ ...f, designer: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B]"
                      placeholder="e.g. Gul Ahmed, Sana Safinaz..."
                    />
                  </div>
                )}

                {reqs.title && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Listing Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={revisionForm.title}
                      onChange={e => setRevisionForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B]"
                    />
                  </div>
                )}

                {reqs.measurements && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Measurements <span className="text-red-500">*</span></label>
                    <textarea
                      value={revisionForm.measurements}
                      onChange={e => setRevisionForm(f => ({ ...f, measurements: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B] resize-none"
                      placeholder="e.g. Bust: 38in, Waist: 32in, Length: 54in"
                    />
                  </div>
                )}

                {reqs.description && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Description / Condition <span className="text-red-500">*</span></label>
                    <textarea
                      value={revisionForm.description}
                      onChange={e => setRevisionForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B] resize-none"
                    />
                  </div>
                )}

                {!hasAnyReq && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">What did you update? <span className="text-red-500">*</span></label>
                    <textarea
                      value={revisionForm.description}
                      onChange={e => setRevisionForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B] resize-none"
                      placeholder="Describe what you changed..."
                    />
                  </div>
                )}

                {uploadProgress && <p className="text-xs text-gray-400 text-center">{uploadProgress}</p>}

                <button
                  onClick={handleSubmitRevision}
                  disabled={submittingRevision || !isValid}
                  className="w-full py-3.5 bg-[#C91A2B] hover:bg-[#a81523] text-white font-bold rounded-2xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
                >
                  {submittingRevision ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Update'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ REGULAR EDIT MODAL ══ */}
      {editingListing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Edit Listing</h3>
              <button onClick={() => setEditingListing(null)} className="p-1.5 hover:bg-gray-100 rounded-xl">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
                <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Asking Price (CAD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B]" step="0.01" min="0" />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">A platform fee is added separately on the buyer-facing listing</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Condition</label>
                <select value={editForm.condition} onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B] bg-white">
                  <option value="">Select</option>
                  <option value="New with tags">New with tags</option>
                  <option value="Like new">Like new</option>
                  <option value="Gently used">Gently used</option>
                  <option value="Used">Used</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B] resize-none" />
              </div>

              {/* Photos */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Photos</label>
                <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                <div className="flex gap-2 flex-wrap">
                  {existingImages.map(img => (
                    <div key={img.id} className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100">
                      <img src={getThumbnail(img.src)} className="w-full h-full object-cover" />
                      <button onClick={() => { setImagesToDelete(prev => [...prev, img]); setExistingImages(prev => prev.filter(i => i.id !== img.id)); }} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                  {newPhotos.map((p, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100">
                      <img src={p.preview} className="w-full h-full object-cover" />
                      <button onClick={() => setNewPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => photoInputRef.current?.click()} className="w-16 h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-300 hover:border-[#C91A2B] hover:text-[#C91A2B] transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {uploadProgress && <p className="text-xs text-gray-400 mt-1">{uploadProgress}</p>}
              </div>

              <button onClick={handleSaveEdit} disabled={saving} className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADDRESS MODAL ══ */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-[#fef2f2] rounded-full flex items-center justify-center mx-auto mb-3">
                <MapPin className="w-6 h-6 text-[#C91A2B]" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">Add your address</h3>
              <p className="text-sm text-gray-400 mt-1">Required for shipping when your items sell</p>
            </div>
            <div className="space-y-3">
              {[
                { key: 'full_name', label: 'Full Name', placeholder: 'Your full name' },
                { key: 'street_address', label: 'Street Address', placeholder: '123 Main St' },
                { key: 'city', label: 'City', placeholder: 'Toronto' },
                { key: 'state', label: 'Province/State', placeholder: 'ON' },
                { key: 'postal_code', label: 'Postal Code', placeholder: 'M5V 2K1' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={shippingAddress[f.key]}
                    onChange={e => setShippingAddress(s => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B]"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleSaveAddress}
              disabled={savingAddress || !shippingAddress.street_address || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postal_code}
              className="mt-5 w-full py-3.5 bg-[#C91A2B] hover:bg-[#a81523] text-white font-bold rounded-2xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
            >
              {savingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Address'}
            </button>
            <button onClick={() => setShowAddressModal(false)} className="mt-2 w-full py-2 text-sm text-gray-400 hover:text-gray-600">
              Skip for now
            </button>
          </div>
        </div>
      )}
    </SellerLayout>
  );
}
