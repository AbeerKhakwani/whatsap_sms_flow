import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check, X, Clock, User, DollarSign, Tag, Shirt, Palette, Sparkles, Image, ExternalLink, Banknote, AlertCircle } from 'lucide-react';
import { getThumbnail } from '../utils/image';

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
  const [editedListing, setEditedListing] = useState({});

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

  async function markAsPaid(payout) {
    setMarkingPaid(payout.id);
    try {
      const response = await fetch('/api/admin-listings?action=mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: payout.id })
      });

      const data = await response.json();

      if (data.success) {
        setPayouts(prev => prev.filter(p => p.id !== payout.id));
        setTotalPending(prev => prev - (payout.seller_payout || 0));
        setStats(prev => ({ ...prev, sold: prev.sold }));
      } else {
        alert(`Error: ${data.error || 'Failed to mark as paid'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
    setMarkingPaid(null);
  }

  function openApproveModal(listing) {
    setApproveModal({ open: true, listing });
    setEditedListing({
      description: listing.description || '',
      tags: listing.tags ? listing.tags.join(', ') : '',
      commission: listing.commission_rate || 18
    });
  }

  function closeApproveModal() {
    setApproveModal({ open: false, listing: null });
    setEditedListing({});
  }

  async function confirmApproval() {
    const { listing } = approveModal;

    setApproving(listing.id);
    try {
      const response = await fetch('/api/admin-listings?action=approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopifyProductId: listing.shopify_product_id,
          updates: {
            description: editedListing.description,
            tags: editedListing.tags,
            commission: parseInt(editedListing.commission) || 18
          }
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
                      ${payout.sale_price?.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>{payout.seller?.name || payout.seller?.email || 'Unknown'}</span>
                    <span>·</span>
                    <span className="font-medium text-gray-900">${payout.seller_payout?.toFixed(0)} payout</span>
                    <span>·</span>
                    <span>{payout.order_name}</span>
                  </div>
                </div>

                <button
                  onClick={() => markAsPaid(payout)}
                  disabled={markingPaid === payout.id}
                  className="ml-4 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {markingPaid === payout.id ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing
                    </>
                  ) : (
                    <>
                      <Check className="w-3 h-3" />
                      Mark Paid
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Listings */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending Approval ({listings.length})
          </h2>
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
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">{listing.designer}</span>
                      <span className="text-gray-400">-</span>
                      <span className="text-gray-600 truncate">{listing.product_name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        ${listing.asking_price_usd || 0}
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
                          Asking Price
                        </div>
                        <p className="font-medium text-green-600">${listing.asking_price_usd || 0}</p>
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
                        Review & Approve
                      </button>

                      <button
                        onClick={() => openRejectModal(listing)}
                        disabled={approving === listing.id}
                        className="px-6 bg-red-100 text-red-600 py-3 rounded-lg font-semibold hover:bg-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <X className="w-5 h-5" />
                        Reject
                      </button>
                    </div>
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
                <h3 className="text-lg font-semibold text-gray-900">Review & Approve Listing</h3>
                <p className="text-sm text-gray-500">{approveModal.listing?.product_name}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={editedListing.description || ''}
                  onChange={(e) => setEditedListing(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Edit the listing description..."
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={editedListing.tags || ''}
                  onChange={(e) => setEditedListing(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="e.g., Sana Safinaz, Lawn, Medium, Excellent"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commission Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editedListing.commission || ''}
                  onChange={(e) => setEditedListing(prev => ({ ...prev, commission: e.target.value }))}
                  placeholder="18"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default is 18%. Seller receives {100 - (parseInt(editedListing.commission) || 18)}% of asking price.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-800">
                  This will approve the listing, add "New Arrivals" tag, and notify the seller via email and WhatsApp.
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
    </div>
  );
}
