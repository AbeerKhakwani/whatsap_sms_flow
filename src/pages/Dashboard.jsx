import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ChevronDown, ChevronUp, Check, X, Clock, User, DollarSign, Tag, Shirt, Palette, Sparkles, Image, ExternalLink, AlertCircle } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function Dashboard() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [approving, setApproving] = useState(null);
  const [stats, setStats] = useState({ pending: 0, approved: 0, sold: 0 });

  useEffect(() => {
    fetchListings();
    fetchStats();
  }, []);

  async function fetchListings() {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        sellers (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching listings:', error);
    } else {
      // Flatten listing_data into top-level for easier access
      const flattened = (data || []).map(listing => ({
        ...listing,
        ...listing.listing_data,
        images: listing.listing_data?.photos || [],
      }));
      setListings(flattened);
    }
    setLoading(false);
  }

  async function fetchStats() {
    const { data: pending } = await supabase
      .from('listings')
      .select('id', { count: 'exact' })
      .eq('status', 'pending_approval');
    
    const { data: approved } = await supabase
      .from('listings')
      .select('id', { count: 'exact' })
      .eq('status', 'live');
    
    const { data: sold } = await supabase
      .from('listings')
      .select('id', { count: 'exact' })
      .eq('status', 'sold');

    setStats({
      pending: pending?.length || 0,
      approved: approved?.length || 0,
      sold: sold?.length || 0
    });
  }

  async function approveListing(listing) {
    setApproving(listing.id);
    try {
      const response = await fetch('/api/approve-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id })
      });

      if (response.ok) {
        // Remove from list and update stats
        setListings(prev => prev.filter(l => l.id !== listing.id));
        setStats(prev => ({ ...prev, pending: prev.pending - 1, approved: prev.approved + 1 }));
        setExpandedId(null);
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
    setApproving(null);
  }

  async function rejectListing(listing) {
    if (!confirm('Are you sure you want to reject this listing? This will delete the Shopify draft.')) return;

    setApproving(listing.id);
    try {
      const response = await fetch('/api/reject-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to reject listing');
      }

      setListings(prev => prev.filter(l => l.id !== listing.id));
      setStats(prev => ({ ...prev, pending: prev.pending - 1 }));
      setExpandedId(null);
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
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm">Pending Approval</p>
              <p className="text-3xl font-bold">{stats.pending}</p>
            </div>
            <Clock className="w-10 h-10 text-yellow-200" />
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Live on Shopify</p>
              <p className="text-3xl font-bold">{stats.approved}</p>
            </div>
            <Check className="w-10 h-10 text-green-200" />
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-100 text-sm">Sold</p>
              <p className="text-3xl font-bold">{stats.sold}</p>
            </div>
            <DollarSign className="w-10 h-10 text-primary-200" />
          </div>
        </div>
      </div>

      {/* Pending Listings */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Pending Approval ({listings.length})
          </h2>
        </div>

        {listings.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Check className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <p className="text-xl font-medium">All caught up! 🎉</p>
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
                        src={listing.images[0]} 
                        alt={listing.product_name}
                        className="w-full h-full object-cover"
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
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-600 truncate">{listing.product_name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {listing.sellers?.name || 'Unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        ${listing.asking_price_usd || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Shirt className="w-3 h-3" />
                        {listing.size}
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
                    {/* Photo Gallery */}
                    <div className="pt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Image className="w-4 h-4" />
                        Photos ({listing.images?.length || 0})
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {listing.images?.map((url, idx) => (
                          <a 
                            key={idx} 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="aspect-square rounded-lg overflow-hidden bg-gray-200 hover:opacity-90 transition-opacity"
                          >
                            <img 
                              src={url} 
                              alt={`Photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => e.target.src = 'https://via.placeholder.com/200?text=Error'}
                            />
                          </a>
                        )) || (
                          <div className="aspect-square rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">
                            <Image className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                          <Palette className="w-3 h-3" />
                          Color
                        </div>
                        <p className="font-medium text-gray-900">{listing.color || 'Unknown'}</p>
                      </div>

                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <Sparkles className="w-3 h-3" />
                          Material
                        </div>
                        <p className="font-medium text-gray-900">{listing.material || 'Unknown'}</p>
                      </div>

                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <DollarSign className="w-3 h-3" />
                          Asking Price
                        </div>
                        <p className="font-medium text-green-600">${listing.asking_price_usd || 0}</p>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="text-gray-500 text-xs mb-1">Description / Raw Message</div>
                      <p className="text-gray-700 text-sm">{listing.description || 'No description'}</p>
                    </div>

                    {/* Beadwork / Embellishments */}
                    {listing.beadwork && (
                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="text-gray-500 text-xs mb-1">Embellishments</div>
                        <p className="text-gray-700 text-sm">{listing.beadwork}</p>
                      </div>
                    )}

                    {/* Original Link */}
                    {listing.original_listing_url && (
                      <div className="bg-white p-3 rounded-lg shadow-sm">
                        <div className="text-gray-500 text-xs mb-1">Original Listing</div>
                        <a 
                          href={listing.original_listing_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline text-sm flex items-center gap-1"
                        >
                          {listing.original_listing_url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Seller Info */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-blue-600 text-xs mb-1 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Seller
                      </div>
                      <p className="font-medium text-blue-900">{listing.sellers?.name || 'Unknown'}</p>
                      <p className="text-sm text-blue-700">{listing.sellers?.email}</p>
                      <p className="text-sm text-blue-700">{listing.sellers?.phone}</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => approveListing(listing)}
                        disabled={approving === listing.id}
                        className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-lg font-semibold hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {approving === listing.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Approving...
                          </>
                        ) : (
                          <>
                            <Check className="w-5 h-5" />
                            Approve & Push to Shopify
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={() => rejectListing(listing)}
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
    </div>
  );
}
