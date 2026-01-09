import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowLeft, Mail, Phone, Package, ExternalLink, Edit2, Check, X,
  RotateCcw, Image as ImageIcon, ArrowRightLeft, Search, User, MessageSquare
} from 'lucide-react';
import { getThumbnail } from '../utils/image';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_URL = import.meta.env.VITE_API_URL || '';

export default function SellerDetail() {
  const { id } = useParams();
  const [seller, setSeller] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(false);
  const [resettingAuth, setResettingAuth] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(null); // 'name', 'email', 'phone', 'paypal'
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const editInputRef = useRef(null);

  // Transfer state
  const [transferring, setTransferring] = useState(null); // productId being transferred
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    fetchSeller();
  }, [id]);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (transferring && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [transferring]);

  // Debounced seller search
  useEffect(() => {
    if (!transferring) return;

    const timer = setTimeout(() => {
      searchSellers(searchQuery);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, transferring]);

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
      fetchMessages(data.id);
    }
    setLoading(false);
  }

  async function fetchMessages(sellerId) {
    if (!sellerId) return;

    setLoadingMessages(true);
    try {
      const response = await fetch(`${API_URL}/api/seller?action=messages&sellerId=${sellerId}`);
      const data = await response.json();
      if (data.success) {
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
    setLoadingMessages(false);
  }

  async function fetchListings(productIds) {
    if (!productIds || productIds.length === 0) return;

    setLoadingListings(true);
    try {
      const response = await fetch(`${API_URL}/api/seller?action=products&ids=${productIds.join(',')}`);
      const data = await response.json();
      if (data.success) {
        setListings(data.products || []);
      }
    } catch (error) {
      console.error('Error fetching listings:', error);
    }
    setLoadingListings(false);
  }

  async function searchSellers(query) {
    setSearchLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/seller?action=search-sellers&q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data.success) {
        // Filter out current seller
        setSearchResults((data.sellers || []).filter(s => s.id !== id));
      }
    } catch (error) {
      console.error('Error searching sellers:', error);
    }
    setSearchLoading(false);
  }

  function startEdit(field) {
    setEditing(field);
    setEditValue(seller[field] || '');
  }

  async function saveEdit() {
    if (!editing) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/seller?action=update-seller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: id,
          [editing]: editValue
        })
      });

      const data = await response.json();
      if (data.success) {
        setSeller(data.seller);
        setEditing(null);
      } else {
        alert('Failed to save: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to save: ' + error.message);
    }
    setSaving(false);
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  }

  async function transferListing(productId, toSellerId) {
    try {
      const response = await fetch(`${API_URL}/api/seller?action=transfer-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          fromSellerId: id,
          toSellerId
        })
      });

      const data = await response.json();
      if (data.success) {
        // Remove from local listings
        setListings(prev => prev.filter(l => l.id.toString() !== productId.toString()));
        setTransferring(null);
        setSearchQuery('');
      } else {
        alert('Transfer failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Transfer failed: ' + error.message);
    }
  }

  async function resetAuth() {
    const sellerName = seller?.name || 'this seller';
    if (!confirm(`⚠️ TESTING ONLY ⚠️\n\nThis will:\n• Delete all SMS conversations\n• Clear phone number link\n• Make it like ${sellerName} never texted before\n\nContinue?`)) return;

    const confirmEmail = prompt(`Type the seller's email to confirm reset:\n\n${seller?.email}`);
    if (confirmEmail?.toLowerCase() !== seller?.email?.toLowerCase()) {
      alert('Email mismatch - reset cancelled');
      return;
    }

    setResettingAuth(true);
    try {
      const response = await fetch(`${API_URL}/api/seller?action=reset-auth`, {
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
      alert('Failed to reset');
    }
    setResettingAuth(false);
  }

  // Editable field component
  function EditableField({ field, label, icon: Icon, value, placeholder }) {
    const isEditing = editing === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          <Icon className="w-3 h-3 text-stone-400" />
          <input
            ref={editInputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-2 py-0.5 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-stone-500"
            placeholder={placeholder}
          />
          <button
            onClick={saveEdit}
            disabled={saving}
            className="p-1 text-green-600 hover:bg-green-50 rounded"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={cancelEdit}
            className="p-1 text-stone-400 hover:bg-stone-100 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => startEdit(field)}
        className="flex items-center gap-1 text-stone-500 hover:text-stone-700 group"
      >
        <Icon className="w-3 h-3" />
        <span className={!value ? 'italic text-stone-400' : ''}>
          {value || placeholder}
        </span>
        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">Seller not found</p>
        <Link to="/admin/sellers" className="text-stone-600 hover:underline mt-2 inline-block">
          Back to Sellers
        </Link>
      </div>
    );
  }

  const activeListings = listings.filter(l => !l.isSold && l.status !== 'archived');
  const soldListings = listings.filter(l => l.isSold || l.status === 'archived');

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        to="/admin/sellers"
        className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-700 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Sellers
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-stone-800 flex items-center justify-center text-white text-xl font-bold">
            {seller.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            {/* Editable Name */}
            {editing === 'name' ? (
              <div className="flex items-center gap-2">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="text-xl font-bold px-2 py-0.5 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-stone-500"
                />
                <button onClick={saveEdit} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={cancelEdit} className="p-1 text-stone-400 hover:bg-stone-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit('name')}
                className="text-xl font-bold text-stone-900 hover:text-stone-700 flex items-center gap-2 group"
              >
                {seller.name || 'Unknown'}
                <Edit2 className="w-4 h-4 opacity-0 group-hover:opacity-100 text-stone-400" />
              </button>
            )}

            {/* Editable Email & Phone */}
            <div className="flex items-center gap-3 text-sm mt-1">
              <EditableField field="email" icon={Mail} value={seller.email} placeholder="Add email" />
              <EditableField field="phone" icon={Phone} value={seller.phone?.startsWith('NOPHONE') ? '' : seller.phone} placeholder="Add phone" />
            </div>
          </div>
        </div>
        <button
          onClick={resetAuth}
          disabled={resettingAuth}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
        >
          <RotateCcw className={`w-3 h-3 ${resettingAuth ? 'animate-spin' : ''}`} />
          {resettingAuth ? 'Resetting...' : 'Reset Auth'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="text-stone-500 text-xs uppercase tracking-wide">Listings</div>
          <p className="text-2xl font-bold text-stone-900 mt-1">{listings.length}</p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="text-stone-500 text-xs uppercase tracking-wide">Earnings</div>
          <p className="text-2xl font-bold text-stone-900 mt-1">${(seller.total_earnings || 0).toFixed(0)}</p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="text-stone-500 text-xs uppercase tracking-wide">Pending</div>
          <p className="text-2xl font-bold text-stone-900 mt-1">${(seller.pending_payout || 0).toFixed(0)}</p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl group relative">
          <div className="text-stone-500 text-xs uppercase tracking-wide">PayPal</div>
          {editing === 'paypal_email' ? (
            <div className="flex items-center gap-1 mt-1">
              <input
                ref={editInputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-1 py-0.5 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-stone-500"
                placeholder="paypal@email.com"
              />
              <button onClick={saveEdit} disabled={saving} className="p-0.5 text-green-600">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelEdit} className="p-0.5 text-stone-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => startEdit('paypal_email')}
              className="text-sm font-medium text-stone-900 mt-1 truncate flex items-center gap-1 hover:text-stone-700"
            >
              {seller.paypal_email || <span className="italic text-stone-400">Not set</span>}
              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-stone-400" />
            </button>
          )}
        </div>
      </div>

      {/* Listings */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-semibold text-stone-900 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Listings
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-stone-900 text-white rounded font-medium">
              {activeListings.length} Active
            </span>
            {soldListings.length > 0 && (
              <span className="px-2 py-1 bg-stone-100 text-stone-600 rounded font-medium">
                {soldListings.length} Sold
              </span>
            )}
          </div>
        </div>

        {loadingListings ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-stone-800 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : listings.length === 0 ? (
          <div className="p-12 text-center text-stone-500">
            <Package className="w-12 h-12 mx-auto mb-3 text-stone-300" />
            <p>No listings yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
            {listings.map((listing) => (
              <div key={listing.id} className="border border-stone-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white relative group">
                {/* Transfer Button */}
                <button
                  onClick={() => {
                    setTransferring(listing.id);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute top-1 left-1 z-10 p-1.5 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-stone-100"
                  title="Transfer to another seller"
                >
                  <ArrowRightLeft className="w-3 h-3 text-stone-600" />
                </button>

                {/* Transfer Modal */}
                {transferring === listing.id && (
                  <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm p-3 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-stone-700">Transfer to:</span>
                      <button
                        onClick={() => setTransferring(null)}
                        className="p-1 hover:bg-stone-100 rounded"
                      >
                        <X className="w-3.5 h-3.5 text-stone-400" />
                      </button>
                    </div>

                    {/* Search Input */}
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search seller..."
                        className="w-full pl-7 pr-2 py-1.5 text-xs border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-400"
                      />
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-auto">
                      {searchLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : searchResults.length === 0 ? (
                        <p className="text-xs text-stone-400 text-center py-4">
                          {searchQuery ? 'No sellers found' : 'Type to search'}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {searchResults.slice(0, 5).map(s => (
                            <button
                              key={s.id}
                              onClick={() => transferListing(listing.id, s.id)}
                              className="w-full flex items-center gap-2 p-2 text-left hover:bg-stone-100 rounded transition-colors"
                            >
                              <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">
                                {s.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-stone-800 truncate">{s.name || 'Unknown'}</div>
                                <div className="text-[10px] text-stone-500 truncate">{s.email}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Image */}
                <div className="aspect-[4/5] bg-stone-100 relative">
                  {listing.image ? (
                    <img
                      src={getThumbnail(listing.image)}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-stone-300" />
                    </div>
                  )}
                  {/* Status Badge */}
                  <span className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    listing.isSold || listing.status === 'archived'
                      ? 'bg-blue-100 text-blue-700'
                      : listing.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : listing.status === 'draft'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-stone-100 text-stone-600'
                  }`}>
                    {listing.isSold || listing.status === 'archived' ? 'SOLD' : listing.status}
                  </span>
                </div>

                {/* Info */}
                <div className="p-2">
                  <h3 className="font-medium text-stone-900 text-xs truncate">{listing.title}</h3>
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-stone-500">
                    <span>{listing.size}</span>
                    <span>·</span>
                    <span>{listing.condition}</span>
                  </div>

                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-stone-100">
                    <div>
                      <div className="text-sm font-bold text-stone-900">${listing.price?.toFixed(0)}</div>
                      <div className="text-[10px] text-green-600">→ ${listing.sellerPayout?.toFixed(0)}</div>
                    </div>
                    <a
                      href={`https://${import.meta.env.VITE_SHOPIFY_STORE_URL}/admin/products/${listing.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-400 hover:text-stone-600"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message History */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-semibold text-stone-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Message History
          </h2>
          <span className="text-xs text-stone-500">{messages.length} messages</span>
        </div>

        {loadingMessages ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-stone-800 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="p-12 text-center text-stone-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-stone-300" />
            <p>No messages sent yet</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {messages.map((msg) => (
              <div key={msg.id} className="p-4 hover:bg-stone-50">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.type === 'whatsapp' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {msg.type === 'whatsapp' ? (
                      <Phone className="w-4 h-4" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        msg.type === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {msg.type === 'whatsapp' ? 'WhatsApp' : 'Email'}
                      </span>
                      {msg.context && (
                        <span className="text-xs text-stone-500 capitalize">
                          {msg.context.replace(/_/g, ' ')}
                        </span>
                      )}
                      <span className="text-xs text-stone-400 ml-auto">
                        {new Date(msg.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {msg.subject && (
                      <div className="text-sm font-medium text-stone-800 mb-0.5">{msg.subject}</div>
                    )}

                    <div className="text-sm text-stone-600 whitespace-pre-wrap break-words">
                      {msg.content?.slice(0, 200)}{msg.content?.length > 200 && '...'}
                    </div>

                    <div className="text-xs text-stone-400 mt-1">
                      To: {msg.recipient}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
