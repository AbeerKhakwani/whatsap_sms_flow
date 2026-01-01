import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { User, Mail, Phone, Package, ExternalLink, ChevronDown, ChevronUp, DollarSign, ShoppingBag } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [shopifyProducts, setShopifyProducts] = useState({});
  const [loadingProducts, setLoadingProducts] = useState({});

  useEffect(() => {
    fetchSellers();
  }, []);

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

  async function fetchShopifyProducts(sellerId, productIds) {
    if (!productIds || productIds.length === 0) return;
    if (shopifyProducts[sellerId]) return; // Already loaded

    setLoadingProducts(prev => ({ ...prev, [sellerId]: true }));

    try {
      // Fetch via our API (avoids CORS issues)
      const response = await fetch(`/api/seller?action=products&ids=${productIds.join(',')}`);
      const data = await response.json();

      if (data.success) {
        setShopifyProducts(prev => ({ ...prev, [sellerId]: data.products }));
      }
    } catch (error) {
      console.error('Error fetching Shopify products:', error);
    }

    setLoadingProducts(prev => ({ ...prev, [sellerId]: false }));
  }

  function toggleExpand(seller) {
    if (expandedId === seller.id) {
      setExpandedId(null);
    } else {
      setExpandedId(seller.id);
      fetchShopifyProducts(seller.id, seller.shopify_product_ids);
    }
  }

  function maskEmail(email) {
    if (!email) return 'Not provided';
    const [user, domain] = email.split('@');
    return `${user.substring(0, 2)}***@${domain}`;
  }

  function maskPhone(phone) {
    if (!phone) return 'Not provided';
    const digits = phone.replace(/\D/g, '');
    return `***-***-${digits.slice(-4)}`;
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
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="w-6 h-6" />
          Sellers ({sellers.length})
        </h1>
        <p className="text-primary-100 mt-1">Manage sellers and view their Shopify listings</p>
      </div>

      {/* Sellers List */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {sellers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <User className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-xl font-medium">No sellers yet</p>
            <p className="text-sm">Sellers will appear here once they register</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sellers.map((seller) => {
              const productCount = seller.shopify_product_ids?.length || 0;
              const isExpanded = expandedId === seller.id;
              const products = shopifyProducts[seller.id] || [];
              const isLoadingProducts = loadingProducts[seller.id];

              return (
                <div key={seller.id} className="hover:bg-gray-50 transition-colors">
                  {/* Collapsed Header */}
                  <div 
                    className="p-4 cursor-pointer flex items-center gap-4"
                    onClick={() => toggleExpand(seller)}
                  >
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-gold-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {seller.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{seller.name || 'Unknown'}</div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {maskEmail(seller.email || seller.paypal_email)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {maskPhone(seller.phone)}
                        </span>
                      </div>
                    </div>

                    {/* Product Count Badge */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        productCount > 0 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        <Package className="w-3 h-3 inline mr-1" />
                        {productCount} listings
                      </span>
                      
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                      {/* Seller Details */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 py-4">
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Email</div>
                          <p className="font-medium text-gray-900 text-sm truncate">{seller.email || 'N/A'}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Phone</div>
                          <p className="font-medium text-gray-900 text-sm">{seller.phone || 'N/A'}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Commission</div>
                          <p className="font-medium text-primary-600 text-sm">{seller.commission_rate || 50}%</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Total Earned</div>
                          <p className="font-medium text-green-600 text-sm">${(seller.total_earnings || 0).toFixed(0)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Pending Payout</div>
                          <p className="font-medium text-amber-600 text-sm">${(seller.pending_payout || 0).toFixed(0)}</p>
                        </div>
                      </div>

                      {/* Products List - Compact */}
                      <div className="mt-2">
                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                          <ShoppingBag className="w-4 h-4" />
                          Products ({seller.products?.length || productCount})
                        </h4>

                        {(seller.products?.length || 0) === 0 && productCount === 0 ? (
                          <p className="text-sm text-gray-500 py-2">No products</p>
                        ) : (
                          <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                <tr>
                                  <th className="px-3 py-2 text-left">Product</th>
                                  <th className="px-3 py-2 text-left">Status</th>
                                  <th className="px-3 py-2 text-right">Price</th>
                                  <th className="px-3 py-2 text-right">Split</th>
                                  <th className="px-3 py-2 text-right">Earnings</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(seller.products || []).slice(0, 10).map((product, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900 truncate max-w-[200px]">{product.title}</span>
                                        {product.shopifyId && (
                                          <a
                                            href={`https://${import.meta.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.shopifyId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-400 hover:text-primary-600"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                      {product.brand && <div className="text-xs text-gray-400">{product.brand}</div>}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        product.status === 'IN_STOCK'
                                          ? 'bg-green-100 text-green-700'
                                          : product.status?.includes('SOLD')
                                          ? 'bg-blue-100 text-blue-700'
                                          : product.status === 'RETURNED'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {product.status?.replace(/_/g, ' ') || 'Unknown'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-900">${product.retailPrice || 0}</td>
                                    <td className="px-3 py-2 text-right text-gray-500">{product.splitPercent}%</td>
                                    <td className="px-3 py-2 text-right font-medium text-green-600">
                                      ${(product.sellerEarnings || 0).toFixed(0)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(seller.products?.length || 0) > 10 && (
                              <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 text-center">
                                +{seller.products.length - 10} more products
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
