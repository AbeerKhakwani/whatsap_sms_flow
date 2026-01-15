import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Package, DollarSign, Clock, CheckCircle, Edit2, ExternalLink, LogOut, ChevronRight, X, Plus, Camera, Trash2, RotateCcw, XCircle, Home, User, MapPin, Loader2 } from 'lucide-react';
import { getThumbnail } from '../../utils/image';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function SellerDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(null);
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ total: 0, draft: 0, active: 0, sold: 0 });
  const [seller, setSeller] = useState(null);
  const [soldProducts, setSoldProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingListing, setEditingListing] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', price: '', condition: '', description: '' });
  const [existingImages, setExistingImages] = useState([]);
  const [imagesToDelete, setImagesToDelete] = useState([]);
  const [newPhotos, setNewPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [togglingStatus, setTogglingStatus] = useState(null); // productId being toggled
  const photoInputRef = useRef(null);

  // Address modal state
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [shippingAddress, setShippingAddress] = useState({
    full_name: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA'
  });

  useEffect(() => {
    const token = localStorage.getItem('seller_token');
    const storedEmail = localStorage.getItem('seller_email');

    // If no token, redirect to login
    if (!token) {
      navigate('/login');
      return;
    }

    // Verify token with API
    verifyAndFetch(token, storedEmail);
  }, [navigate]);

  async function verifyAndFetch(token, storedEmail) {
    try {
      // Verify token
      const authRes = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'verify-token' })
      });

      const authData = await authRes.json();

      if (!authRes.ok || !authData.success) {
        // Token invalid - redirect to login
        localStorage.removeItem('seller_token');
        localStorage.removeItem('seller_email');
        navigate('/login');
        return;
      }

      // Use email from token verification
      const sellerEmail = authData.seller.email || storedEmail;
      setEmail(sellerEmail);
      setSeller(authData.seller);

      // Show address modal if user doesn't have an address
      if (!authData.seller.has_address) {
        setShowAddressModal(true);
      }

      // Fetch listings
      fetchListings(sellerEmail);
    } catch (error) {
      console.error('Auth error:', error);
      navigate('/login');
    }
  }

  async function fetchListings(sellerEmail) {
    try {
      const response = await fetch(`/api/seller?action=listings&email=${encodeURIComponent(sellerEmail)}`);
      const data = await response.json();

      if (data.success) {
        setListings(data.listings);
        setStats(data.stats);
        setSeller(data.seller);
        setSoldProducts(data.soldProducts || []);
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('seller_token');
    localStorage.removeItem('seller_email');
    navigate('/login');
  }

  function openEditModal(listing) {
    setEditingListing(listing);
    setEditForm({
      title: listing.title,
      price: listing.price,
      condition: listing.condition || '',
      description: listing.description || ''
    });
    setExistingImages(listing.images || []);
    setImagesToDelete([]);
    setNewPhotos([]);
    setUploadProgress('');
  }

  function handlePhotoSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setNewPhotos(prev => [...prev, {
          preview: e.target.result,
          file,
          base64: e.target.result.split(',')[1]
        }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeNewPhoto(index) {
    setNewPhotos(prev => prev.filter((_, i) => i !== index));
  }

  function markImageForDeletion(image) {
    setImagesToDelete(prev => [...prev, image]);
    setExistingImages(prev => prev.filter(img => img.id !== image.id));
  }

  async function handleSaveEdit() {
    if (!editingListing) return;
    setSaving(true);

    try {
      // Save listing details
      const response = await fetch('/api/seller?action=update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          productId: editingListing.id,
          title: editForm.title,
          price: parseFloat(editForm.price),
          condition: editForm.condition,
          description: editForm.description
        })
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.error || 'Failed to save');
        setSaving(false);
        return;
      }

      // Delete images marked for deletion
      if (imagesToDelete.length > 0) {
        for (let i = 0; i < imagesToDelete.length; i++) {
          setUploadProgress(`Removing photo ${i + 1} of ${imagesToDelete.length}...`);
          try {
            await fetch('/api/product-image?action=delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: editingListing.id,
                imageId: imagesToDelete[i].id
              })
            });
          } catch (err) {
            console.error('Photo delete error:', err);
          }
        }
      }

      // Upload new photos if any
      const finalImages = [...existingImages];
      if (newPhotos.length > 0) {
        for (let i = 0; i < newPhotos.length; i++) {
          setUploadProgress(`Uploading photo ${i + 1} of ${newPhotos.length}...`);
          try {
            const photoRes = await fetch('/api/product-image?action=add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: editingListing.id,
                base64: newPhotos[i].base64,
                filename: newPhotos[i].file?.name || `photo-${i + 1}.jpg`
              })
            });
            const photoData = await photoRes.json();
            if (photoData.success) {
              finalImages.push({ id: photoData.imageId, src: newPhotos[i].preview });
            }
          } catch (err) {
            console.error('Photo upload error:', err);
          }
        }
      }

      // Update local state
      setListings(prev =>
        prev.map(l =>
          l.id === editingListing.id
            ? {
                ...l,
                title: editForm.title,
                price: parseFloat(editForm.price),
                condition: editForm.condition,
                description: editForm.description,
                images: finalImages,
                image: finalImages[0]?.src || l.image
              }
            : l
        )
      );
      setEditingListing(null);
      setUploadProgress('');
    } catch (error) {
      alert('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function toggleListingStatus(listing) {
    const isDelisted = listing.tags?.includes('delisted');
    const action = isDelisted ? 'relist' : 'delist';
    setTogglingStatus(listing.id);

    try {
      const response = await fetch(`/api/seller?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, productId: listing.id })
      });

      const data = await response.json();

      if (data.success) {
        // Update local state - update status and tags
        setListings(prev =>
          prev.map(l => {
            if (l.id !== listing.id) return l;
            const newTags = action === 'delist'
              ? [...(l.tags || []), 'delisted']
              : (l.tags || []).filter(t => t !== 'delisted');
            return { ...l, status: data.status, tags: newTags };
          })
        );

        // Update stats
        if (action === 'delist') {
          setStats(prev => ({ ...prev, active: prev.active - 1, draft: prev.draft + 1 }));
        } else {
          setStats(prev => ({ ...prev, active: prev.active + 1, draft: prev.draft - 1 }));
        }
      } else {
        alert(`Failed to ${action}: ` + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert(`Failed to ${action}: ` + error.message);
    } finally {
      setTogglingStatus(null);
    }
  }

  function isAddressValid() {
    return shippingAddress.street_address && shippingAddress.city &&
           shippingAddress.state && shippingAddress.postal_code;
  }

  async function handleSaveAddress() {
    if (!isAddressValid()) return;

    setSavingAddress(true);
    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-address',
          email,
          shipping_address: shippingAddress
        })
      });

      const data = await res.json();
      if (data.success) {
        setSeller({ ...seller, has_address: true, shipping_address: shippingAddress });
        setShowAddressModal(false);
      }
    } catch (err) {
      console.error('Failed to save address:', err);
    } finally {
      setSavingAddress(false);
    }
  }

  function getStatusBadge(listing) {
    if (listing.isSold) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Sold
        </span>
      );
    }
    // Check if delisted (has delisted tag)
    if (listing.tags?.includes('delisted')) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
          Delisted
        </span>
      );
    }
    const styles = {
      draft: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800'
    };
    const labels = {
      draft: 'Pending Review',
      active: 'Live',
      archived: 'Archived'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[listing.status] || styles.draft}`}>
        {labels[listing.status] || listing.status}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src="/loading.mov" type="video/quicktime" />
          <source src="/loading.mov" type="video/mp4" />
        </video>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header - Desktop */}
      <header className="bg-white border-b border-gray-200 hidden md:block">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="The Phir Story" className="h-8" />
            <span className="text-sm text-gray-500 border-l border-gray-200 pl-3">Seller Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/submit"
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
            >
              <Plus className="w-4 h-4" />
              Submit Listing
            </Link>

            {/* Profile Dropdown - Desktop */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              >
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <span className="text-sm max-w-[150px] truncate">{email}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">{email}</p>
                      <p className="text-xs text-gray-500">Seller Account</p>
                    </div>
                    <Link
                      to="/seller/profile"
                      className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50"
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <User className="w-4 h-4" />
                      <span>My Profile</span>
                    </Link>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                      className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 w-full"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Header - Mobile */}
      <header className="bg-white border-b border-gray-200 md:hidden sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="w-10" /> {/* Spacer for centering */}
          <img src="/logo.svg" alt="The Phir Story" className="h-7" />
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200"
            >
              <User className="w-5 h-5" />
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowProfileMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <Link
                    to="/seller/profile"
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowProfileMenu(false)}
                  >
                    <User className="w-4 h-4" />
                    <span>My Profile</span>
                  </Link>
                  <div className="border-t border-gray-100" />
                  <button
                    onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50 safe-area-pb">
        <div className="flex items-center justify-around py-2">
          <Link to="/" className="flex flex-col items-center py-2 px-4 text-[#C91A2B]">
            <Home className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Home</span>
          </Link>
          <Link
            to="/submit"
            className="flex flex-col items-center py-2 px-6 -mt-4 bg-[#C91A2B] text-white rounded-full shadow-lg"
          >
            <Plus className="w-7 h-7" />
            <span className="text-xs mt-0.5 font-medium">Sell</span>
          </Link>
          <Link
            to="/seller/profile"
            className="flex flex-col items-center py-2 px-4 text-gray-500"
          >
            <User className="w-6 h-6" />
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Earnings Banner */}
        {seller && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Total Earned</p>
                <p className="text-2xl font-bold text-green-800">${seller.totalEarnings?.toFixed(0) || 0}</p>
                <p className="text-xs text-green-600 mt-1">Each listing shows your payout amount</p>
              </div>
              {seller.pendingPayout > 0 && (
                <div className="text-right">
                  <p className="text-sm text-amber-700">Pending Payout</p>
                  <p className="text-2xl font-bold text-amber-600">${seller.pendingPayout?.toFixed(0)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Package className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total Listings</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{stats.draft}</p>
                <p className="text-sm text-gray-500">Pending</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{stats.active}</p>
                <p className="text-sm text-gray-500">Live</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{stats.sold}</p>
                <p className="text-sm text-gray-500">Sold</p>
              </div>
            </div>
          </div>
        </div>

        {/* Listings */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Your Listings</h2>
          </div>

          {listings.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4">No listings yet</p>
              <Link
                to="/submit"
                className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
              >
                Submit your first listing
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {listings.map((listing) => (
                <div key={listing.id} className="p-4 flex items-start gap-4 hover:bg-gray-50">
                  {/* Image */}
                  <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {listing.image ? (
                      <img
                        src={getThumbnail(listing.image)}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">{listing.title}</h3>
                      {getStatusBadge(listing)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{listing.size}</span>
                      <span>{listing.condition}</span>
                    </div>
                    {/* Pricing breakdown */}
                    {listing.isSold ? (
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <span className="text-gray-500">
                          Sold for: <span className="font-medium text-gray-700">${listing.price?.toFixed(2)}</span>
                        </span>
                        <span className="text-green-600 font-medium">
                          You earned: ${listing.sellerPayout?.toFixed(2)}
                        </span>
                        <span className="text-gray-400">
                          ({100 - (listing.commissionRate || 18)}% of ${listing.sellerAskingPrice?.toFixed(0)})
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <span className="text-gray-500">
                          Listed: <span className="font-medium text-gray-700">${listing.price?.toFixed(2)}</span>
                        </span>
                        <span className="text-gray-500">
                          You asked: <span className="text-gray-700">${listing.sellerAskingPrice?.toFixed(2)}</span>
                        </span>
                        <span className="text-gray-500">
                          You'll get: <span className="font-medium text-green-600">${listing.sellerPayout?.toFixed(2)}</span>
                          <span className="text-gray-400 ml-1">({100 - (listing.commissionRate || 18)}%)</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Edit button - not for sold items */}
                    {!listing.isSold && (
                      <button
                        onClick={() => openEditModal(listing)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {/* Delist button - only for active (live) items */}
                    {!listing.isSold && listing.status === 'active' && !listing.tags?.includes('delisted') && (
                      <div className="relative group">
                        <button
                          onClick={() => toggleListingStatus(listing)}
                          disabled={togglingStatus === listing.id}
                          className={`p-2 rounded-lg transition text-gray-400 hover:text-red-600 hover:bg-red-50 ${
                            togglingStatus === listing.id ? 'opacity-50' : ''
                          }`}
                        >
                          {togglingStatus === listing.id ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                        </button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-10">
                          <div className="font-medium">Delist Item</div>
                          <div className="text-gray-300 mt-0.5">Remove from store temporarily.</div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    )}
                    {/* Relist button - for delisted items, goes to pending review */}
                    {!listing.isSold && listing.tags?.includes('delisted') && (
                      <div className="relative group">
                        <button
                          onClick={() => toggleListingStatus(listing)}
                          disabled={togglingStatus === listing.id}
                          className={`p-2 rounded-lg transition text-gray-400 hover:text-green-600 hover:bg-green-50 ${
                            togglingStatus === listing.id ? 'opacity-50' : ''
                          }`}
                        >
                          {togglingStatus === listing.id ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-10">
                          <div className="font-medium">Relist Item</div>
                          <div className="text-gray-300 mt-0.5">Submit for review to go live again.</div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    )}
                    {listing.status === 'active' && listing.handle && (
                      <a
                        href={`https://thephirstory.com/products/${listing.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="View on store"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sold Items Section */}
        {soldProducts.length > 0 && (
          <div className="mt-8 bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Items Sold</h2>
              <span className="text-sm text-gray-500">{soldProducts.length} items</span>
            </div>
            <div className="divide-y divide-gray-100">
              {soldProducts.map((item, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{item.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                      {item.brand && <span>{item.brand}</span>}
                      <span>Sold for ${item.retailPrice}</span>
                      <span className="text-green-600 font-medium">You earned ${item.earnings?.toFixed(0)}</span>
                    </div>
                    {/* Show payment note under the item */}
                    {item.status === 'SOLD_WITH_PAYOUT' && item.paymentNote && (
                      <p className="text-xs text-green-600 mt-2">
                        {item.paymentNote}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    {/* Always show Sold tag */}
                    <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Sold
                    </span>
                    {/* Show Paid Out or Pending Payout tag */}
                    {item.status === 'SOLD_WITH_PAYOUT' ? (
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Paid Out
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        Pending Payout
                      </span>
                    )}
                    {item.status === 'SOLD_WITH_PAYOUT' && item.paidAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(item.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payouts Summary */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Earnings Summary</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500">Total Earned</p>
                <p className="text-3xl font-bold text-gray-900">${seller?.totalEarnings?.toFixed(0) || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending Payout</p>
                <p className="text-3xl font-bold text-amber-600">${seller?.pendingPayout?.toFixed(0) || 0}</p>
              </div>
            </div>
            {seller?.pendingPayout > 0 && (
              <p className="text-sm text-gray-500 mt-4">
                Pending payouts will be processed within 7 business days after the item is marked as sold.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {editingListing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-medium text-gray-900">Edit Listing</h3>
              <button
                onClick={() => setEditingListing(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                  <input
                    type="number"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                  <select
                    value={editForm.condition}
                    onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  >
                    <option value="">Select...</option>
                    <option value="New with tags">New with tags</option>
                    <option value="Like new">Like new</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
                  placeholder="Describe your item..."
                />
              </div>

              {/* Photos Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>

                {/* Existing Images */}
                {existingImages.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2">Current photos (tap to remove):</p>
                    <div className="flex flex-wrap gap-2">
                      {existingImages.map((img, idx) => (
                        <div key={img.id || idx} className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 group">
                          <img src={img.src || img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => markImageForDeletion(img)}
                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                          >
                            <Trash2 className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Photos */}
                {newPhotos.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2">New photos to add:</p>
                    <div className="flex flex-wrap gap-2">
                      {newPhotos.map((photo, idx) => (
                        <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                          <img src={photo.preview} alt={`New ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeNewPhoto(idx)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Photos Button */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-green-500 hover:text-green-600 transition"
                >
                  <Camera className="w-5 h-5" />
                  <span>Add More Photos</span>
                </button>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-gray-200">
              {uploadProgress && (
                <p className="text-sm text-green-600 mb-2 text-center">{uploadProgress}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingListing(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                >
                  {saving ? (uploadProgress || 'Saving...') : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Add Shipping Address</h3>
                  <p className="text-sm text-gray-500">Required to create shipping labels when items sell</p>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={shippingAddress.full_name}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, full_name: e.target.value })}
                  placeholder="Full Name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <input
                  type="text"
                  value={shippingAddress.street_address}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, street_address: e.target.value })}
                  placeholder="Street Address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={shippingAddress.city}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                    placeholder="City"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                  <input
                    type="text"
                    value={shippingAddress.state}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                    placeholder="State"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={shippingAddress.postal_code}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, postal_code: e.target.value })}
                    placeholder="ZIP Code"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                  <input
                    type="text"
                    value={shippingAddress.country}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, country: e.target.value })}
                    placeholder="Country"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddressModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Later
                </button>
                <button
                  onClick={handleSaveAddress}
                  disabled={!isAddressValid() || savingAddress}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingAddress ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <MapPin className="w-4 h-4" />
                      Save Address
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
