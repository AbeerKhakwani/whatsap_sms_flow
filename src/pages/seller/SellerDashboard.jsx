import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Package, DollarSign, Clock, CheckCircle, Edit2, ExternalLink, LogOut, ChevronRight, X, Plus, Camera, Trash2 } from 'lucide-react';

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
  const photoInputRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('seller_token');
    const storedEmail = localStorage.getItem('seller_email');

    // If no token, redirect to login
    if (!token) {
      navigate('/seller/login');
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
        navigate('/seller/login');
        return;
      }

      // Use email from token verification
      const sellerEmail = authData.seller.email || storedEmail;
      setEmail(sellerEmail);
      setSeller(authData.seller);

      // Fetch listings
      fetchListings(sellerEmail);
    } catch (error) {
      console.error('Auth error:', error);
      navigate('/seller/login');
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
    navigate('/seller/login');
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

  function getStatusBadge(listing) {
    if (listing.isSold) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Sold
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="The Phir Story" className="h-8" />
            <span className="text-sm text-gray-500 border-l border-gray-200 pl-3">Seller Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/seller/submit"
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
            >
              <Plus className="w-4 h-4" />
              Submit Listing
            </Link>
            <span className="text-sm text-gray-600">{email}</span>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-700 p-2"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

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
                to="/seller/submit"
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
                        src={listing.image}
                        alt={listing.title}
                        className="w-full h-full object-cover"
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
                    <button
                      onClick={() => openEditModal(listing)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <a
                      href={listing.shopify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      title="View in Shopify"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
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
                      <span className="text-green-600">You earned ${item.earnings?.toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                      item.status === 'SOLD_WITH_PAYOUT'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {item.status === 'SOLD_WITH_PAYOUT' ? 'Paid' : 'Pending'}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">Your share: {item.splitPercent}%</p>
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
    </div>
  );
}
