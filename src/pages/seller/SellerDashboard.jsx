import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, DollarSign, Clock, CheckCircle, Edit2, ExternalLink, LogOut, ChevronRight, X } from 'lucide-react';

export default function SellerDashboard() {
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ total: 0, draft: 0, active: 0, sold: 0 });
  const [loading, setLoading] = useState(true);
  const [editingListing, setEditingListing] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', price: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('seller_token');
    const storedSeller = localStorage.getItem('seller');

    if (!token) {
      navigate('/seller/login');
      return;
    }

    if (storedSeller) {
      setSeller(JSON.parse(storedSeller));
    }

    fetchListings(token);
  }, [navigate]);

  async function fetchListings(token) {
    try {
      const response = await fetch('/api/seller?action=listings', {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json();

      if (data.success) {
        setListings(data.listings);
        setStats(data.stats);
      } else if (response.status === 401) {
        localStorage.removeItem('seller_token');
        localStorage.removeItem('seller');
        navigate('/seller/login');
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('seller_token');
    localStorage.removeItem('seller');
    navigate('/seller/login');
  }

  function openEditModal(listing) {
    setEditingListing(listing);
    setEditForm({ title: listing.title, price: listing.price });
  }

  async function handleSaveEdit() {
    if (!editingListing) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('seller_token');
      const response = await fetch('/api/seller?action=update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productId: editingListing.id,
          title: editForm.title,
          price: parseFloat(editForm.price)
        })
      });

      const data = await response.json();

      if (data.success) {
        // Update listing in state
        setListings(prev =>
          prev.map(l =>
            l.id === editingListing.id
              ? { ...l, title: editForm.title, price: parseFloat(editForm.price) }
              : l
          )
        );
        setEditingListing(null);
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (error) {
      alert('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  function getStatusBadge(status) {
    const styles = {
      draft: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800'
    };
    const labels = {
      draft: 'Pending Review',
      active: 'Live',
      archived: 'Sold'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {labels[status] || status}
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
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{seller?.name || seller?.email}</span>
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
                <p className="text-2xl font-semibold text-gray-900">N/A</p>
                <p className="text-sm text-gray-500">Balance</p>
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
              <a
                href="/submit"
                className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
              >
                Submit your first listing
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {listings.map((listing) => (
                <div key={listing.id} className="p-4 flex items-center gap-4 hover:bg-gray-50">
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
                      {getStatusBadge(listing.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>${listing.price}</span>
                      <span>{listing.size}</span>
                      <span>{listing.condition}</span>
                    </div>
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

        {/* Payouts Section (N/A for now) */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Payouts</h2>
          </div>
          <div className="p-8 text-center text-gray-500">
            <DollarSign className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p>Payout tracking coming soon</p>
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {editingListing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-medium text-gray-900">Edit Listing</h3>
              <button
                onClick={() => setEditingListing(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                <input
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => setEditingListing(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
