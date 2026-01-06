import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { User, Mail, Phone, Package, ChevronRight } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

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
        <p className="text-primary-100 mt-1">Manage sellers and view their listings</p>
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

              return (
                <Link
                  key={seller.id}
                  to={`/sellers/${seller.id}`}
                  className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
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
                  <div className="flex-shrink-0 flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      productCount > 0
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      <Package className="w-3 h-3 inline mr-1" />
                      {productCount} listings
                    </span>

                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
