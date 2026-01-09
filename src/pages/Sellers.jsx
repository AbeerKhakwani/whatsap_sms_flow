import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Users, Mail, Phone, Package, ChevronRight, Search, Plus, X } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add seller modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSeller, setNewSeller] = useState({ name: '', email: '', phone: '', paypal_email: '' });
  const [creating, setCreating] = useState(false);
  const emailInputRef = useRef(null);

  useEffect(() => {
    fetchSellers();
  }, []);

  useEffect(() => {
    if (showAddModal && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [showAddModal]);

  async function fetchSellers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('sellers')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching sellers:', error);
    } else {
      setSellers(data || []);
    }
    setLoading(false);
  }

  async function createSeller() {
    if (!newSeller.email) {
      alert('Email is required');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${API_URL}/api/seller?action=create-seller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSeller)
      });

      const data = await response.json();

      if (data.success) {
        setSellers(prev => [...prev, data.seller].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        setShowAddModal(false);
        setNewSeller({ name: '', email: '', phone: '', paypal_email: '' });
      } else {
        alert('Failed to create: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to create: ' + error.message);
    }
    setCreating(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      createSeller();
    }
    if (e.key === 'Escape') {
      setShowAddModal(false);
    }
  }

  const filtered = sellers.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.phone?.includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" />
            Sellers
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{sellers.length} total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Seller
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
        />
      </div>

      {/* Sellers List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">{search ? 'No results found' : 'No sellers yet'}</p>
            {!search && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Your First Seller
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((seller) => {
              const productCount = seller.shopify_product_ids?.length || 0;

              return (
                <Link
                  key={seller.id}
                  to={`/admin/sellers/${seller.id}`}
                  className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {seller.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{seller.name || 'Unknown'}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {seller.email || 'No email'}
                      </span>
                      {seller.phone && !seller.phone.startsWith('NOPHONE') && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {seller.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Product Count Badge */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      productCount > 0
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {productCount}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Seller Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onKeyDown={handleKeyDown}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Add New Seller</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  ref={emailInputRef}
                  type="email"
                  value={newSeller.email}
                  onChange={(e) => setNewSeller({ ...newSeller, email: e.target.value })}
                  onKeyDown={handleKeyDown}
                  placeholder="seller@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newSeller.name}
                  onChange={(e) => setNewSeller({ ...newSeller, name: e.target.value })}
                  onKeyDown={handleKeyDown}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={newSeller.phone}
                  onChange={(e) => setNewSeller({ ...newSeller, phone: e.target.value })}
                  onKeyDown={handleKeyDown}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PayPal Email</label>
                <input
                  type="email"
                  value={newSeller.paypal_email}
                  onChange={(e) => setNewSeller({ ...newSeller, paypal_email: e.target.value })}
                  onKeyDown={handleKeyDown}
                  placeholder="paypal@example.com (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500 text-sm"
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                disabled={creating}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createSeller}
                disabled={creating || !newSeller.email}
                className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Seller'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
