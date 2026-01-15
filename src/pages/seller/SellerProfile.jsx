import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Mail, Phone, ArrowLeft, Edit2, Save, X, Loader2, Home, Plus, LogOut, User } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function SellerProfile() {
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingAddress, setEditingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [shippingAddress, setShippingAddress] = useState({
    full_name: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA'
  });

  useEffect(() => {
    const storedEmail = localStorage.getItem('seller_email');
    if (!storedEmail) {
      navigate('/seller/login');
      return;
    }

    async function fetchProfile() {
      try {
        const res = await fetch(`${API_URL}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-profile', email: storedEmail })
        });
        const data = await res.json();
        if (data.success) {
          setSeller(data.seller);
          if (data.seller.shipping_address) {
            setShippingAddress(data.seller.shipping_address);
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [navigate]);

  function isAddressValid() {
    return shippingAddress.street_address && shippingAddress.city &&
           shippingAddress.state && shippingAddress.postal_code;
  }

  async function handleSaveAddress() {
    if (!isAddressValid()) {
      setError('Please fill in all address fields');
      return;
    }

    setSavingAddress(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-address',
          email: seller?.email,
          shipping_address: shippingAddress
        })
      });

      const data = await res.json();
      if (data.success) {
        setSeller({ ...seller, has_address: true, shipping_address: shippingAddress });
        setEditingAddress(false);
        setSuccess('Address saved successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save address');
      }
    } catch (err) {
      console.error('Failed to save address:', err);
      setError('Failed to save address');
    } finally {
      setSavingAddress(false);
    }
  }

  function handleCancelEdit() {
    if (seller?.shipping_address) {
      setShippingAddress(seller.shipping_address);
    }
    setEditingAddress(false);
    setError('');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-medium text-gray-900">My Profile</h1>
          </div>
          <img src="/logo.svg" alt="" className="h-6 md:hidden opacity-60" />
        </div>
      </header>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50 safe-area-pb">
        <div className="flex items-center justify-around py-2">
          <Link to="/" className="flex flex-col items-center py-2 px-4 text-gray-500">
            <Home className="w-6 h-6" />
            <span className="text-xs mt-1">Home</span>
          </Link>
          <Link to="/seller/submit" className="flex flex-col items-center py-2 px-4 text-gray-500">
            <Plus className="w-6 h-6" />
            <span className="text-xs mt-1">Sell</span>
          </Link>
          <div className="flex flex-col items-center py-2 px-4 text-green-600">
            <User className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Profile</span>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Account Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Account Information</h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <Mail className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="text-gray-900">{seller?.email || '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <Phone className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="text-gray-900">{seller?.phone || 'Not set'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Shipping Address</h2>
            {!editingAddress && seller?.has_address && (
              <button
                onClick={() => setEditingAddress(true)}
                className="flex items-center gap-1 text-green-600 hover:text-green-700 text-sm font-medium"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          {editingAddress || !seller?.has_address ? (
            <div className="space-y-3">
              {!seller?.has_address && (
                <p className="text-sm text-amber-600 mb-4">
                  Add your shipping address so we can create labels when your items sell.
                </p>
              )}
              <input
                type="text"
                value={shippingAddress.full_name}
                onChange={(e) => setShippingAddress({ ...shippingAddress, full_name: e.target.value })}
                placeholder="Full Name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <input
                type="text"
                value={shippingAddress.street_address}
                onChange={(e) => setShippingAddress({ ...shippingAddress, street_address: e.target.value })}
                placeholder="Street Address"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                  placeholder="City"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <input
                  type="text"
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                  placeholder="State"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={shippingAddress.postal_code}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, postal_code: e.target.value })}
                  placeholder="ZIP Code"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <input
                  type="text"
                  value={shippingAddress.country}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, country: e.target.value })}
                  placeholder="Country"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                {editingAddress && (
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSaveAddress}
                  disabled={!isAddressValid() || savingAddress}
                  className={`${editingAddress ? 'flex-1' : 'w-full'} bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                >
                  {savingAddress ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Address
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-green-600" />
              </div>
              <div>
                {shippingAddress.full_name && (
                  <p className="font-medium text-gray-900">{shippingAddress.full_name}</p>
                )}
                <p className="text-gray-700">{shippingAddress.street_address}</p>
                <p className="text-gray-700">
                  {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postal_code}
                </p>
                <p className="text-gray-500">{shippingAddress.country}</p>
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          onClick={() => {
            localStorage.removeItem('seller_token');
            localStorage.removeItem('seller_email');
            navigate('/seller/login');
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </main>
    </div>
  );
}
