import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowLeft, Mail, Phone, Package, ExternalLink, Edit2, Check, X,
  RotateCcw, Image as ImageIcon, ArrowRightLeft, Search, User, MessageSquare, XCircle, AlertCircle
} from 'lucide-react';
import { getThumbnail } from '../utils/image';
import BuyerAcceptedBadge from '../components/BuyerAcceptedBadge';

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
  const [rejectedListings, setRejectedListings] = useState([]);
  const [txStats, setTxStats] = useState({ earned: 0, pending: 0 });
  const [txByProduct, setTxByProduct] = useState({}); // shopify_product_id -> tx (for buyer-accepted badge)
  const [syncing, setSyncing] = useState(false);

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

  // Revision request state
  const [revisionProduct, setRevisionProduct] = useState(null); // { id, title }
  const [revisionFields, setRevisionFields] = useState({});     // { photos: true, price: false, ... }
  const [revisionNote, setRevisionNote] = useState('');
  const [sendingRevision, setSendingRevision] = useState(false);

  const REVISION_FIELD_OPTIONS = [
    { key: 'photos',       label: 'Photos',       hint: 'Add clearer / more photos' },
    { key: 'price',        label: 'Price',         hint: 'Update asking price' },
    { key: 'designer',     label: 'Designer',      hint: 'Correct the brand name' },
    { key: 'measurements', label: 'Measurements',  hint: 'Add size measurements' },
    { key: 'description',  label: 'Description',   hint: 'Improve condition details' },
    { key: 'title',        label: 'Title',         hint: 'Rename the listing' },
  ];

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
      fetchRejectedListings(data.id);
      fetchTxStats(data.id);
    }
    setLoading(false);
  }

  async function fetchTxStats(sellerId) {
    if (!sellerId) return;
    const { data } = await supabase
      .from('transactions')
      .select('seller_payout, payout_status, product_id, review_responded_at')
      .eq('seller_id', sellerId)
      .not('seller_payout', 'is', null);

    if (!data) return;
    const earned = data
      .filter(t => t.payout_status === 'paid')
      .reduce((s, t) => s + (t.seller_payout || 0), 0);
    const pending = data
      .filter(t => ['available', 'in_transit', 'delivered', 'pending_shipping'].includes(t.payout_status))
      .reduce((s, t) => s + (t.seller_payout || 0), 0);
    setTxStats({ earned, pending });

    // Index transactions by Shopify product id so sold cards can show the buyer-accepted badge.
    const byProduct = {};
    for (const t of data) { if (t.product_id) byProduct[String(t.product_id)] = t; }
    setTxByProduct(byProduct);
  }

  async function syncListings() {
    if (!seller) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=sync-seller-listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ sellerId: seller.id, sellerEmail: seller.email })
      });
      const data = await res.json();
      if (data.success) {
        // Reload with fresh product IDs
        if (data.productIds?.length) {
          fetchListings(data.productIds);
        }
        alert(`Synced ${data.productIds?.length || 0} listings for ${seller.name}`);
      } else {
        alert('Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Sync error: ' + err.message);
    }
    setSyncing(false);
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

  async function fetchRejectedListings(sellerId) {
    if (!sellerId) return;
    try {
      const response = await fetch(`${API_URL}/api/seller?action=rejected-listings&sellerId=${sellerId}`);
      const data = await response.json();
      if (data.success) {
        setRejectedListings(data.rejectedListings || []);
      }
    } catch (error) {
      console.error('Error fetching rejected listings:', error);
    }
  }

  async function sendRevisionRequest() {
    const selectedFields = Object.keys(revisionFields).filter(k => revisionFields[k]);
    if (!revisionProduct || selectedFields.length === 0) return;

    // Build a readable note from selected fields + optional admin note
    const fieldLabels = { photos: 'photos', price: 'price', designer: 'designer/brand name', measurements: 'measurements', description: 'description/condition', title: 'listing title' };
    const fieldList = selectedFields.map(k => fieldLabels[k]).join(', ');
    const builtNote = `Please update the following: ${fieldList}${revisionNote.trim() ? `. ${revisionNote.trim()}` : '.'}`;

    setSendingRevision(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyProductId: revisionProduct.id, note: builtNote, fields: selectedFields })
      });
      const data = await res.json();
      if (data.success) {
        setListings(prev => prev.map(l =>
          l.id === revisionProduct.id
            ? { ...l, tags: [...(l.tags?.split(', ').filter(t => t !== 'pending-approval' && t !== 'seller-revised') || []), 'needs-revision'].join(', ') }
            : l
        ));
        setRevisionProduct(null);
        setRevisionFields({});
        setRevisionNote('');
      } else {
        alert(data.error || 'Failed to send revision request');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSendingRevision(false);
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
          <Icon className="w-3 h-3" style={{ color: '#78716C' }} />
          <input
            ref={editInputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-2 py-0.5 text-sm rounded focus:outline-none focus:ring-2"
            style={{ border: '1px solid #C91A2B', focusRingColor: '#C91A2B' }}
            placeholder={placeholder}
          />
          <button
            onClick={saveEdit}
            disabled={saving}
            className="p-1 rounded"
            style={{ color: '#16A34A' }}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={cancelEdit}
            className="p-1 rounded"
            style={{ color: '#78716C' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => startEdit(field)}
        className="flex items-center gap-1.5 group"
        style={{ color: '#78716C' }}
      >
        <Icon className="w-3 h-3" />
        <span className="text-sm" style={!value ? { fontStyle: 'italic', color: '#A8A29E' } : {}}>
          {value || placeholder}
        </span>
        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#C91A2B' }} />
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ background: '#FAF8F5' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C91A2B', borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="text-center py-12" style={{ background: '#FAF8F5' }}>
        <p style={{ color: '#78716C' }}>Seller not found</p>
        <Link to="/admin/sellers" className="hover:underline mt-2 inline-block" style={{ color: '#C91A2B' }}>
          Back to Sellers
        </Link>
      </div>
    );
  }

  const activeListings = listings.filter(l => !l.isSold && l.status !== 'archived');
  const soldListings = listings.filter(l => l.isSold || l.status === 'archived');

  const CRIMSON = '#C91A2B';
  const GOLD    = '#C9913D';
  const INK     = '#1C1410';
  const STONE   = '#78716C';
  const BORDER  = '#EDE8E3';
  const JALI = `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23C91A2B' stroke-width='0.5' stroke-opacity='0.15'%3E%3Cpath d='M16 0 L32 16 L16 32 L0 16 Z'/%3E%3Cpath d='M16 6 L26 16 L16 26 L6 16 Z'/%3E%3Cline x1='16' y1='0' x2='16' y2='32'/%3E%3Cline x1='0' y1='16' x2='32' y2='16'/%3E%3C/g%3E%3C/svg%3E")`;

  // StatusPill for listings
  function StatusPill({ listing }) {
    const tagList = listing.tags?.split(', ') || [];
    let label, color, bg;
    if (listing.isSold || listing.status === 'archived') { label = 'Sold'; color = '#2563EB'; bg = '#EFF6FF'; }
    else if (tagList.includes('needs-revision'))         { label = 'Revision'; color = CRIMSON; bg = '#FFF0F1'; }
    else if (tagList.includes('seller-revised'))         { label = 'Revised'; color = '#0284C7'; bg = '#F0F9FF'; }
    else if (listing.status === 'active')                { label = 'Live'; color = '#16A34A'; bg = '#F0FDF4'; }
    else if (listing.status === 'draft')                 { label = 'Draft'; color = GOLD; bg = '#FFFBEB'; }
    else                                                 { label = listing.status || 'Unknown'; color = STONE; bg = '#F5F4F2'; }
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
        style={{ color, background: bg, border: `1px solid ${color}22` }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        {label}
      </span>
    );
  }

  return (
    <div className="space-y-6 pb-10" style={{ background: '#FAF8F5', minHeight: '100vh', padding: '24px' }}>

      {/* Back Link */}
      <Link
        to="/admin/sellers"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
        style={{ color: STONE }}
        onMouseEnter={e => e.currentTarget.style.color = CRIMSON}
        onMouseLeave={e => e.currentTarget.style.color = STONE}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Sellers
      </Link>

      {/* ── SELLER HEADER CARD ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BORDER}` }}>
        {/* Crimson jali strip */}
        <div className="h-1.5" style={{ background: CRIMSON, backgroundImage: JALI, backgroundSize: '32px 32px' }} />

        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-sm"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, ${GOLD})` }}
            >
              {seller.name?.charAt(0)?.toUpperCase() || '?'}
            </div>

            <div className="min-w-0">
              {/* Editable Name */}
              {editing === 'name' ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="text-xl font-bold px-2 py-0.5 rounded focus:outline-none"
                    style={{ border: `1px solid ${CRIMSON}`, color: INK }}
                  />
                  <button onClick={saveEdit} disabled={saving} className="p-1 rounded" style={{ color: '#16A34A' }}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={cancelEdit} className="p-1 rounded" style={{ color: STONE }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEdit('name')}
                  className="flex items-center gap-2 group text-left"
                >
                  <span className="text-xl font-bold" style={{ color: INK }}>{seller.name || 'Unknown'}</span>
                  <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: CRIMSON }} />
                </button>
              )}

              {/* Contact row */}
              <div className="flex items-center gap-4 mt-1.5">
                <EditableField field="email" icon={Mail} value={seller.email} placeholder="Add email" />
                <EditableField field="phone" icon={Phone} value={seller.phone?.startsWith('NOPHONE') ? '' : seller.phone} placeholder="Add phone" />
              </div>

              {/* Last login / joined */}
              <div className="flex items-center gap-3 mt-1.5" style={{ fontSize: '11px', color: STONE }}>
                {seller.last_dashboard_login ? (
                  <span>Last login: <span className="font-medium" style={{ color: INK }}>{new Date(seller.last_dashboard_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
                ) : (
                  <span className="italic">Never logged in</span>
                )}
                {seller.created_at && (
                  <span style={{ color: BORDER }}>·</span>
                )}
                {seller.created_at && (
                  <span>Joined: <span className="font-medium" style={{ color: INK }}>{new Date(seller.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                )}
              </div>
            </div>
          </div>

          {/* Reset Auth */}
          <button
            onClick={resetAuth}
            disabled={resettingAuth}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{ background: '#FAF8F5', border: `1px solid ${BORDER}`, color: STONE }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFF0F1'; e.currentTarget.style.borderColor = CRIMSON; e.currentTarget.style.color = CRIMSON; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FAF8F5'; e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = STONE; }}
          >
            <RotateCcw className={`w-3 h-3 ${resettingAuth ? 'animate-spin' : ''}`} />
            {resettingAuth ? 'Resetting…' : 'Reset Auth'}
          </button>
        </div>
      </div>

      {/* ── STATS ROW ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BORDER}` }}>
        {/* Listings */}
        <div className="py-5 px-5 text-center" style={{ borderRight: `1px solid ${BORDER}` }}>
          <p className="text-3xl font-bold" style={{ color: INK }}>{listings.length}</p>
          <p className="text-[9px] font-bold tracking-widest uppercase mt-0.5" style={{ color: STONE }}>Listings</p>
        </div>
        {/* Earnings */}
        <div className="py-5 px-5 text-center" style={{ borderRight: `1px solid ${BORDER}` }}>
          <p className="text-3xl font-bold" style={{ color: '#16A34A' }}>${txStats.earned.toFixed(0)}</p>
          <p className="text-[9px] font-bold tracking-widest uppercase mt-0.5" style={{ color: STONE }}>Earnings</p>
        </div>
        {/* Pending */}
        <div className="py-5 px-5 text-center" style={{ borderRight: `1px solid ${BORDER}` }}>
          <p className="text-3xl font-bold" style={{ color: GOLD }}>${txStats.pending.toFixed(0)}</p>
          <p className="text-[9px] font-bold tracking-widest uppercase mt-0.5" style={{ color: STONE }}>Pending</p>
        </div>
        {/* PayPal — editable */}
        <div className="py-4 px-5 flex flex-col items-center justify-center group relative">
          <p className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: STONE }}>PayPal</p>
          {editing === 'paypal_email' ? (
            <div className="flex items-center gap-1 w-full">
              <input
                ref={editInputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-2 py-1 text-xs rounded focus:outline-none"
                style={{ border: `1px solid ${CRIMSON}`, color: INK }}
                placeholder="paypal@email.com"
              />
              <button onClick={saveEdit} disabled={saving} style={{ color: '#16A34A' }}>
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelEdit} style={{ color: STONE }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => startEdit('paypal_email')}
              className="flex items-center gap-1 text-sm font-medium truncate max-w-full group"
              style={{ color: INK }}
            >
              {seller.paypal_email
                ? <span className="truncate">{seller.paypal_email}</span>
                : <span className="italic text-xs" style={{ color: '#A8A29E' }}>Not set</span>
              }
              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: CRIMSON }} />
            </button>
          )}
        </div>
      </div>

      {/* ── ACTIVE LISTINGS SECTION ────────────────────────────────── */}
      <div>
        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-0.5 h-6 rounded-full" style={{ background: CRIMSON }} />
            <div>
              <p className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: GOLD }}>Admin View</p>
              <p className="text-base font-bold" style={{ color: INK }}>Active Listings</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full font-bold text-white" style={{ background: CRIMSON }}>
              {activeListings.length} Active
            </span>
            {soldListings.length > 0 && (
              <span className="px-2.5 py-1 rounded-full font-bold" style={{ background: '#F5F4F2', color: STONE, border: `1px solid ${BORDER}` }}>
                {soldListings.length} Sold
              </span>
            )}
            <button
              onClick={syncListings}
              disabled={syncing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold border transition-colors disabled:opacity-50"
              style={{ background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD' }}
              title="Rebuild listings from Shopify metafields"
            >
              {syncing ? '⟳ Syncing…' : '⟳ Sync'}
            </button>
          </div>
        </div>

        {loadingListings ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: CRIMSON, borderTopColor: 'transparent' }}></div>
          </div>
        ) : activeListings.length === 0 && soldListings.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
            <Package className="w-12 h-12 mx-auto mb-3" style={{ color: BORDER }} />
            <p style={{ color: STONE }}>No listings yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {activeListings.map((listing) => (
              <div
                key={listing.id}
                className="rounded-xl overflow-hidden relative group transition-shadow hover:shadow-md"
                style={{ background: '#fff', border: `1px solid ${BORDER}` }}
              >
                {/* Transfer Button — hover reveal top-left */}
                <button
                  onClick={() => {
                    setTransferring(listing.id);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute top-2 left-2 z-10 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  style={{ background: 'rgba(255,255,255,0.92)' }}
                  title="Transfer to another seller"
                >
                  <ArrowRightLeft className="w-3 h-3" style={{ color: INK }} />
                </button>

                {/* Transfer Modal */}
                {transferring === listing.id && (
                  <div className="absolute inset-0 z-20 flex flex-col p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(4px)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold" style={{ color: INK }}>Transfer to:</span>
                      <button onClick={() => setTransferring(null)} className="p-1 rounded">
                        <X className="w-3.5 h-3.5" style={{ color: STONE }} />
                      </button>
                    </div>
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: STONE }} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search seller…"
                        className="w-full pl-7 pr-2 py-1.5 text-xs rounded focus:outline-none"
                        style={{ border: `1px solid ${BORDER}`, color: INK }}
                      />
                    </div>
                    <div className="flex-1 overflow-auto">
                      {searchLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: CRIMSON, borderTopColor: 'transparent' }}></div>
                        </div>
                      ) : searchResults.length === 0 ? (
                        <p className="text-xs text-center py-4" style={{ color: STONE }}>
                          {searchQuery ? 'No sellers found' : 'Type to search'}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {searchResults.slice(0, 5).map(s => (
                            <button
                              key={s.id}
                              onClick={() => transferListing(listing.id, s.id)}
                              className="w-full flex items-center gap-2 p-2 text-left rounded transition-colors"
                              style={{ color: INK }}
                              onMouseEnter={e => e.currentTarget.style.background = '#FAF8F5'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${CRIMSON}, ${GOLD})` }}>
                                {s.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold truncate" style={{ color: INK }}>{s.name || 'Unknown'}</div>
                                <div className="text-[10px] truncate" style={{ color: STONE }}>{s.email}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Image */}
                <div className="aspect-[3/4] relative" style={{ background: '#F5F4F2' }}>
                  {listing.image ? (
                    <img
                      src={getThumbnail(listing.image)}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8" style={{ color: BORDER }} />
                    </div>
                  )}
                  {/* Status pill */}
                  <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 items-start">
                    <StatusPill listing={listing} />
                    {/* Source Badge */}
                    {listing.tags && (() => {
                      const tagList = listing.tags?.split(', ') || [];
                      const sourceTag = tagList.find(t => t.startsWith('source:'));
                      if (!sourceTag) return null;
                      const source = sourceTag.replace('source:', '');
                      return (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          source === 'portal' ? 'bg-purple-100 text-purple-600' :
                          source === 'whatsapp' ? 'bg-green-100 text-green-600' :
                          source === 'admin' ? 'bg-blue-100 text-blue-600' :
                          'bg-stone-100 text-stone-500'
                        }`}>
                          {source === 'portal' ? '🌐' : source === 'whatsapp' ? '💬' : source === 'admin' ? '👤' : ''}
                          {' '}{source}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-2.5">
                  {/* Designer in gold small-caps */}
                  {listing.vendor && (
                    <p className="text-[9px] font-bold tracking-widest uppercase mb-0.5" style={{ color: GOLD }}>
                      {listing.vendor}
                    </p>
                  )}
                  <h3 className="font-semibold text-xs leading-tight truncate" style={{ color: INK }}>{listing.title}</h3>
                  <div className="flex items-center gap-1 mt-0.5 text-[10px]" style={{ color: STONE }}>
                    {listing.size && <span>{listing.size}</span>}
                    {listing.size && listing.condition && <span>·</span>}
                    {listing.condition && <span>{listing.condition}</span>}
                  </div>

                  {/* Price + payout row */}
                  <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <div>
                      <div className="text-sm font-bold" style={{ color: INK }}>${listing.price?.toFixed(2)}</div>
                      <div className="text-[10px] font-medium" style={{ color: '#16A34A' }}>→ ${listing.sellerPayout?.toFixed(2)}</div>
                    </div>
                    <a
                      href={`https://${import.meta.env.VITE_SHOPIFY_STORE_URL}/admin/products/${listing.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: STONE }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Revision status banners */}
                  {listing.tags?.split(', ').includes('needs-revision') && (
                    <div className="mt-2 px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wide text-center"
                      style={{ background: '#FFF0F1', color: CRIMSON, border: `1px solid ${CRIMSON}30` }}>
                      ⏳ Awaiting seller update
                    </div>
                  )}
                  {listing.tags?.split(', ').includes('seller-revised') && (
                    <div className="mt-2 px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wide text-center"
                      style={{ background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD' }}>
                      ✓ Seller revised — re-review
                    </div>
                  )}

                  {/* Request Revision — amber, full-width, prominent */}
                  {!listing.tags?.split(', ').includes('needs-revision') && (
                    <button
                      onClick={() => { setRevisionProduct({ id: listing.id, title: listing.title }); setRevisionFields({}); setRevisionNote(''); }}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
                      style={{ background: '#FFF3CD', color: '#92400E', border: '1px solid #F59E0B' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FEF08A'}
                      onMouseLeave={e => e.currentTarget.style.background = '#FFF3CD'}
                    >
                      <AlertCircle className="w-3 h-3" />
                      Request Revision
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SOLD LISTINGS sub-section ── */}
        {soldListings.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-0.5 h-6 rounded-full" style={{ background: BORDER }} />
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: STONE }}>Completed</p>
                <p className="text-base font-bold" style={{ color: STONE }}>Sold Items</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {soldListings.map((listing) => (
                <div
                  key={listing.id}
                  className="rounded-xl overflow-hidden relative"
                  style={{ background: '#fff', border: `1px solid ${BORDER}`, opacity: 0.6 }}
                >
                  {/* Image with SOLD stamp */}
                  <div className="aspect-[3/4] relative" style={{ background: '#F5F4F2' }}>
                    {listing.image ? (
                      <img
                        src={getThumbnail(listing.image)}
                        alt={listing.title}
                        className="w-full h-full object-cover grayscale"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8" style={{ color: BORDER }} />
                      </div>
                    )}
                    {/* SOLD stamp overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="px-3 py-1 text-xs font-black tracking-widest uppercase rounded rotate-[-12deg] shadow"
                        style={{ background: 'rgba(37,99,235,0.9)', color: '#fff', border: '2px solid rgba(255,255,255,0.5)' }}>
                        Sold
                      </span>
                    </div>
                  </div>
                  <div className="p-2">
                    <h3 className="font-medium text-xs truncate" style={{ color: STONE }}>{listing.title}</h3>
                    <div className="text-[10px] mt-0.5" style={{ color: STONE }}>${listing.price?.toFixed(2)}</div>
                    {(() => {
                      const t = txByProduct[String(listing.id)];
                      if (!t) return null;
                      const paid = t.payout_status === 'paid';
                      return (
                        <div className="mt-1 flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {paid ? '✓ Paid out' : 'Not paid out'}
                          </span>
                          <BuyerAcceptedBadge reviewRespondedAt={t.review_responded_at} payoutStatus={t.payout_status} />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Revision Request Modal */}
      {revisionProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-amber-600 px-5 py-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-amber-100 mb-0.5">Request Revision</p>
                <p className="text-white font-semibold text-sm truncate max-w-[280px]">{revisionProduct.title}</p>
              </div>
              <button onClick={() => setRevisionProduct(null)} className="p-1 hover:bg-amber-700 rounded transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Field checkboxes */}
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Select what needs updating</p>
                <div className="grid grid-cols-2 gap-2">
                  {REVISION_FIELD_OPTIONS.map(({ key, label, hint }) => {
                    const checked = !!revisionFields[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setRevisionFields(f => ({ ...f, [key]: !f[key] }))}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                          checked
                            ? 'bg-amber-50 border-amber-400 text-amber-900'
                            : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded flex-shrink-0 border-2 flex items-center justify-center ${checked ? 'bg-amber-500 border-amber-500' : 'border-stone-300'}`}>
                          {checked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                        </div>
                        <div>
                          <p className="text-xs font-semibold leading-none">{label}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5 leading-snug">{hint}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional extra note */}
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Additional note <span className="font-normal normal-case text-stone-400">(optional)</span></p>
                <textarea
                  value={revisionNote}
                  onChange={e => setRevisionNote(e.target.value)}
                  placeholder="Any specific instructions for the seller…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              <div className="flex gap-3">
              <button
                onClick={() => setRevisionProduct(null)}
                className="flex-1 px-4 py-2 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendRevisionRequest}
                disabled={sendingRevision || Object.values(revisionFields).every(v => !v)}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingRevision ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    Send Request
                  </>
                )}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REJECTED LISTINGS ──────────────────────────────────────── */}
      {rejectedListings.length > 0 && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BORDER}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2.5">
              <div className="w-0.5 h-6 rounded-full" style={{ background: '#DC2626' }} />
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: STONE }}>Review Queue</p>
                <h2 className="text-base font-bold" style={{ color: INK }}>Rejected Listings</h2>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {rejectedListings.length} Rejected
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
            {rejectedListings.map((item) => (
              <div key={item.id} className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}`, opacity: 0.75 }}>
                <div className="aspect-[3/4] relative" style={{ background: '#F5F4F2' }}>
                  {item.images?.[0]?.src ? (
                    <img
                      src={getThumbnail(item.images[0].src)}
                      alt={item.title}
                      className="w-full h-full object-cover grayscale"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8" style={{ color: BORDER }} />
                    </div>
                  )}
                  <div className="absolute inset-0" style={{ background: 'rgba(220,38,38,0.04)' }} />
                  <div className="absolute top-2 right-2 flex flex-col gap-0.5 items-end">
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                      Rejected
                    </span>
                    {item.submissionSource && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        item.submissionSource === 'portal' ? 'bg-purple-100 text-purple-600' :
                        item.submissionSource === 'whatsapp' ? 'bg-green-100 text-green-600' :
                        item.submissionSource === 'admin' ? 'bg-blue-100 text-blue-600' :
                        'bg-stone-100 text-stone-500'
                      }`}>
                        {item.submissionSource === 'portal' ? '🌐' : item.submissionSource === 'whatsapp' ? '💬' : item.submissionSource === 'admin' ? '👤' : ''}
                        {' '}{item.submissionSource}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-2.5">
                  <h3 className="font-semibold text-xs truncate" style={{ color: STONE }}>{item.title || `${item.designer} ${item.itemType}`}</h3>
                  <div className="flex items-center gap-1 mt-0.5 text-[10px]" style={{ color: STONE }}>
                    <span>{item.size || 'OS'}</span>
                    {item.askingPrice && <><span>·</span><span>Asked ${parseFloat(item.askingPrice).toFixed(0)}</span></>}
                  </div>
                  {item.rejectionReason && (
                    <div className="mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${BORDER}` }}>
                      <p className="text-[10px] font-semibold" style={{ color: '#DC2626' }}>{item.rejectionReason}</p>
                      {item.rejectionNote && (
                        <p className="text-[10px] mt-0.5" style={{ color: STONE }}>{item.rejectionNote}</p>
                      )}
                    </div>
                  )}
                  <p className="text-[9px] mt-1" style={{ color: STONE }}>
                    {new Date(item.rejectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MESSAGE HISTORY ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BORDER}` }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-0.5 h-6 rounded-full" style={{ background: GOLD }} />
            <div>
              <p className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: STONE }}>Communication Log</p>
              <h2 className="text-base font-bold" style={{ color: INK }}>Message History</h2>
            </div>
          </div>
          <span className="text-xs" style={{ color: STONE }}>{messages.length} messages</span>
        </div>

        {loadingMessages ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: CRIMSON, borderTopColor: 'transparent' }}></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-10 h-10 mx-auto mb-3" style={{ color: BORDER }} />
            <p style={{ color: STONE }}>No messages sent yet</p>
          </div>
        ) : (
          <div>
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className="px-5 py-4 transition-colors"
                style={{ borderTop: idx > 0 ? `1px solid ${BORDER}` : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAF8F5'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.type === 'whatsapp' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {msg.type === 'whatsapp' ? <Phone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        msg.type === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {msg.type === 'whatsapp' ? 'WhatsApp' : 'Email'}
                      </span>
                      {msg.type === 'whatsapp' && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          msg.status === 'read'      ? 'bg-blue-100 text-blue-700' :
                          msg.status === 'delivered' ? 'bg-green-100 text-green-700' :
                          msg.status === 'failed'    ? 'bg-red-100 text-red-700' :
                                                       'bg-amber-100 text-amber-700'
                        }`}>
                          {msg.status === 'read' ? '👁 Read' : msg.status === 'delivered' ? '✓ Delivered' : msg.status === 'failed' ? '✕ Failed' : '· Sent'}
                        </span>
                      )}
                      {msg.type === 'email' && msg.status === 'failed' && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                          ✕ Failed
                        </span>
                      )}
                      {msg.context && (
                        <span className="text-xs capitalize" style={{ color: STONE }}>
                          {msg.context.replace(/_/g, ' ')}
                        </span>
                      )}
                      <span className="text-xs ml-auto" style={{ color: STONE }}>
                        {new Date(msg.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {msg.subject && (
                      <div className="text-sm font-semibold mb-0.5" style={{ color: INK }}>{msg.subject}</div>
                    )}
                    <div className="text-sm whitespace-pre-wrap break-words" style={{ color: STONE }}>
                      {msg.content?.slice(0, 200)}{msg.content?.length > 200 && '…'}
                    </div>
                    <div className="text-xs mt-1" style={{ color: STONE }}>To: {msg.recipient}</div>
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
