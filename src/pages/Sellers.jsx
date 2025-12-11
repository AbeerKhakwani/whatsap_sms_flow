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
      // Fetch from Shopify API
      const shopifyUrl = import.meta.env.VITE_SHOPIFY_STORE_URL;
      const accessToken = import.meta.env.VITE_SHOPIFY_ACCESS_TOKEN;

      const products = [];
      for (const productId of productIds.slice(0, 10)) { // Limit to 10
        try {
          const response = await fetch(
            `https://${shopifyUrl}/admin/api/2024-10/products/${productId}.json`,
            {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            products.push(data.product);
          }
        } catch (e) {
          console.log('Error fetching product:', productId);
        }
      }

      setShopifyProducts(prev => ({ ...prev, [sellerId]: products }));
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Full Email</div>
                          <p className="font-medium text-gray-900 text-sm truncate">{seller.email || seller.paypal_email || 'N/A'}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Phone</div>
                          <p className="font-medium text-gray-900 text-sm">{seller.phone || 'N/A'}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Total Sales</div>
                          <p className="font-medium text-green-600 text-sm">${seller.total_sales || 0}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg shadow-sm">
                          <div className="text-gray-500 text-xs mb-1">Rating</div>
                          <p className="font-medium text-gray-900 text-sm">{seller.rating || 'N/A'}</p>
                        </div>
                      </div>

                      {/* Shopify Listings */}
                      <div className="mt-2">
                        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1">
                          <ShoppingBag className="w-4 h-4" />
                          Live Shopify Listings
                        </h4>

                        {isLoadingProducts ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="ml-2 text-gray-500">Loading products...</span>
                          </div>
                        ) : productCount === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p>No live listings yet</p>
                          </div>
                        ) : products.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <p className="text-sm">
                              {productCount} product IDs stored, but could not fetch details.
                            </p>
                            <p className="text-xs mt-1">Product IDs: {seller.shopify_product_ids?.slice(0, 3).join(', ')}...</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {products.map((product) => (
                              <div 
                                key={product.id}
                                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                              >
                                {/* Product Image */}
                                <div className="aspect-square bg-gray-100">
                                  {product.images?.[0]?.src ? (
                                    <img 
                                      src={product.images[0].src}
                                      alt={product.title}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                      <Package className="w-8 h-8" />
                                    </div>
                                  )}
                                </div>

                                {/* Product Info */}
                                <div className="p-3">
                                  <h5 className="font-medium text-gray-900 text-sm truncate">{product.title}</h5>
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="text-green-600 font-semibold">
                                      ${product.variants?.[0]?.price || '0'}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      product.status === 'active' 
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {product.status}
                                    </span>
                                  </div>
                                  <a 
                                    href={`https://${import.meta.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 text-xs text-primary-600 hover:underline flex items-center gap-1"
                                  >
                                    View in Shopify
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            ))}
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
