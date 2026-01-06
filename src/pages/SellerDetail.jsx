import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowLeft, User, Mail, Phone, Package, ExternalLink,
  DollarSign, RotateCcw, Image as ImageIcon, Tag
} from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function SellerDetail() {
  const { id } = useParams();
  const [seller, setSeller] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(false);
  const [resettingAuth, setResettingAuth] = useState(false);

  useEffect(() => {
    fetchSeller();
  }, [id]);

  async function fetchSeller() {
    setLoading(true);
    const { data, error } = await supabase
      .from('sellers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching seller:', error);
    } else {
      setSeller(data);
      if (data?.shopify_product_ids?.length > 0) {
        fetchListings(data.shopify_product_ids);
      }
    }
    setLoading(false);
  }

  async function fetchListings(productIds) {
    if (!productIds || productIds.length === 0) return;

    setLoadingListings(true);
    try {
      const response = await fetch(`/api/seller?action=products&ids=${productIds.join(',')}`);
      const data = await response.json();
      if (data.success) {
        setListings(data.products || []);
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
    }
    setLoadingListings(false);
  }

  async function resetAuth() {
    // Double confirmation for safety
    const sellerName = seller?.name || 'this seller';
    if (!confirm(`⚠️ TESTING ONLY ⚠️\n\nThis will:\n• Delete all SMS conversations\n• Clear phone number link\n• Make it like ${sellerName} never texted before\n\nContinue?`)) return;

    if (!confirm(`Are you sure? Type the seller's email to confirm:\n\nExpected: ${seller?.email || 'unknown'}`)) return;

    const confirmEmail = prompt(`Type the seller's email to confirm reset:\n\n${seller?.email}`);
    if (confirmEmail?.toLowerCase() !== seller?.email?.toLowerCase()) {
      alert('Email mismatch - reset cancelled');
      return;
    }

    setResettingAuth(true);
    try {
      const response = await fetch('/api/seller?action=reset-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: id })
      });

      const data = await response.json();
      if (data.success) {
        alert('Full reset complete! Seller will see first-time welcome on next message.');
      } else {
        alert('Failed to reset: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Reset auth error:', error);
      alert('Failed to reset');
    }
    setResettingAuth(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Seller not found</p>
        <Link to="/sellers" className="text-primary-600 hover:underline mt-2 inline-block">
          Back to Sellers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        to="/sellers"
        className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Sellers
      </Link>

      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
            {seller.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{seller.name || 'Unknown'}</h1>
            <div className="flex items-center gap-4 text-primary-100 mt-1 text-sm">
              <span className="flex items-center gap-1">
                <Mail className="w-4 h-4" />
                {seller.email || 'No email'}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {seller.phone || 'No phone'}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{listings.length}</div>
            <div className="text-primary-100 text-sm">Listings</div>
          </div>
        </div>
      </div>

      {/* Stats & Testing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-gray-500 text-xs mb-1">Total Earnings</div>
          <p className="text-2xl font-bold text-green-600">${(seller.total_earnings || 0).toFixed(0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-gray-500 text-xs mb-1">Pending Payout</div>
          <p className="text-2xl font-bold text-amber-600">${(seller.pending_payout || 0).toFixed(0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-gray-500 text-xs mb-1">PayPal</div>
          <p className="text-sm font-medium text-gray-900 truncate">{seller.paypal_email || 'Not set'}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-gray-500 text-xs mb-1">Testing</div>
          <button
            onClick={resetAuth}
            disabled={resettingAuth}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${resettingAuth ? 'animate-spin' : ''}`} />
            {resettingAuth ? 'Resetting...' : 'Reset Auth'}
          </button>
        </div>
      </div>

      {/* Listings */}
      {(() => {
        const activeListings = listings.filter(l => !l.isSold && l.status !== 'archived');
        const soldListings = listings.filter(l => l.isSold || l.status === 'archived');
        return (
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-primary-500" />
            Listings
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              {activeListings.length} Active
            </span>
            {soldListings.length > 0 && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                {soldListings.length} Sold
              </span>
            )}
          </div>
        </div>

        {loadingListings ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : listings.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No listings yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {listings.map((listing) => (
              <div key={listing.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                {/* Image */}
                <div className="aspect-square bg-gray-100 relative">
                  {listing.image ? (
                    <img
                      src={listing.image}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-gray-300" />
                    </div>
                  )}
                  {/* Status Badge */}
                  <span className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${
                    listing.isSold || listing.status === 'archived'
                      ? 'bg-blue-100 text-blue-700'
                      : listing.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : listing.status === 'draft'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {listing.isSold || listing.status === 'archived' ? 'SOLD' : listing.status}
                  </span>
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="font-medium text-gray-900 truncate">{listing.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {listing.size}
                    </span>
                    <span>|</span>
                    <span>{listing.condition}</span>
                  </div>

                  {/* Pricing breakdown */}
                  <div className="mt-2 pt-2 border-t border-gray-100 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Listing price:</span>
                      <span className="font-medium">${listing.price?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Seller asked:</span>
                      <span className="text-gray-700">${listing.sellerAskingPrice?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Seller payout:</span>
                      <span className="text-green-600 font-medium">${listing.sellerPayout?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Commission:</span>
                      <span className="text-primary-600">{listing.commissionRate}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-lg font-bold text-primary-600">${listing.price?.toFixed(2)}</span>
                    <a
                      href={`https://${import.meta.env.VITE_SHOPIFY_STORE_URL}/admin/products/${listing.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-primary-600"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        );
      })()}
    </div>
  );
}
