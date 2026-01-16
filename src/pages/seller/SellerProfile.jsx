import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { MapPin, Mail, Phone, ArrowLeft, Edit2, Save, X, Loader2, Home, Plus, LogOut, User, DollarSign, Check, ChevronRight, Package, Tag, CreditCard, Lock, Printer, Truck, ExternalLink, MoreVertical } from 'lucide-react';
import { getThumbnail } from '../../utils/image';

const API_URL = import.meta.env.VITE_API_URL || '';

// Tab configuration
const TABS = [
  { id: 'sales', label: 'My Sales', icon: Package, comingSoon: false },
  { id: 'balance', label: 'My Balance', icon: DollarSign, comingSoon: true },
  { id: 'offers', label: 'My Offers', icon: Tag, comingSoon: true },
  { id: 'profile', label: 'Profile', icon: User, comingSoon: false },
];

export default function SellerProfile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [soldProducts, setSoldProducts] = useState([]);

  // Shipping action states
  const [openShippingMenu, setOpenShippingMenu] = useState(null);
  const [requestingLabel, setRequestingLabel] = useState(null);

  // Active tab - default to menu on mobile (null), profile on desktop
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Edit modes
  const [editingAddress, setEditingAddress] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingPayout, setEditingPayout] = useState(false);

  // Saving states
  const [savingAddress, setSavingAddress] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  // Verification states
  const [emailVerifyStep, setEmailVerifyStep] = useState('input');
  const [phoneVerifyStep, setPhoneVerifyStep] = useState('input');
  const [verificationCode, setVerificationCode] = useState('');

  // Form data
  const [shippingAddress, setShippingAddress] = useState({
    full_name: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA'
  });
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [payoutMethod, setPayoutMethod] = useState({
    type: 'Zelle',
    name: '',
    account: ''
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On desktop, default to profile tab if none selected
      if (!mobile && !activeTab) {
        setActiveTab('profile');
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

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
          if (data.seller.payout_method) {
            setPayoutMethod(data.seller.payout_method);
          }
        }

        // Fetch sold products
        const sellerRes = await fetch(`/api/seller?action=listings&email=${encodeURIComponent(storedEmail)}`);
        const sellerData = await sellerRes.json();
        if (sellerData.success) {
          setSoldProducts(sellerData.soldProducts || []);
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

  function handleTabChange(tabId) {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  }

  function handleBackToMenu() {
    setActiveTab(null);
    setSearchParams({});
  }

  function showSuccess(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }

  // ============ ADDRESS ============
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
        showSuccess('Address saved');
      } else {
        setError(data.error || 'Failed to save address');
      }
    } catch (err) {
      setError('Failed to save address');
    } finally {
      setSavingAddress(false);
    }
  }

  // ============ EMAIL ============
  async function handleRequestEmailChange() {
    if (!newEmail || !newEmail.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    setSavingEmail(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request-email-change',
          currentEmail: seller?.email,
          newEmail
        })
      });

      const data = await res.json();
      if (data.success) {
        setEmailVerifyStep('verify');
        setVerificationCode('');
      } else {
        setError(data.error || 'Failed to send verification code');
      }
    } catch (err) {
      setError('Failed to send verification code');
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleVerifyEmailChange() {
    if (verificationCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setSavingEmail(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-email-change',
          currentEmail: seller?.email,
          newEmail,
          code: verificationCode
        })
      });

      const data = await res.json();
      if (data.success) {
        localStorage.setItem('seller_email', data.newEmail);
        setSeller({ ...seller, email: data.newEmail });
        setEditingEmail(false);
        setEmailVerifyStep('input');
        setNewEmail('');
        setVerificationCode('');
        showSuccess('Email updated');
      } else {
        setError(data.error || 'Invalid code');
      }
    } catch (err) {
      setError('Failed to verify code');
    } finally {
      setSavingEmail(false);
    }
  }

  // ============ PHONE ============
  async function handleRequestPhoneChange() {
    if (!newPhone || newPhone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setSavingPhone(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request-phone-change',
          email: seller?.email,
          newPhone
        })
      });

      const data = await res.json();
      if (data.success) {
        setPhoneVerifyStep('verify');
        setVerificationCode('');
      } else {
        setError(data.error || 'Failed to send verification code');
      }
    } catch (err) {
      setError('Failed to send verification code');
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleVerifyPhoneChange() {
    if (verificationCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setSavingPhone(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-phone-change',
          email: seller?.email,
          newPhone,
          code: verificationCode
        })
      });

      const data = await res.json();
      if (data.success) {
        setSeller({ ...seller, phone: data.newPhone });
        setEditingPhone(false);
        setPhoneVerifyStep('input');
        setNewPhone('');
        setVerificationCode('');
        showSuccess('Phone updated');
      } else {
        setError(data.error || 'Invalid code');
      }
    } catch (err) {
      setError('Failed to verify code');
    } finally {
      setSavingPhone(false);
    }
  }

  // ============ PAYOUT ============
  async function handleSavePayout() {
    if (!payoutMethod.name || !payoutMethod.account) {
      setError('Please fill in name and account');
      return;
    }

    setSavingPayout(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-payout',
          email: seller?.email,
          payout_method: payoutMethod
        })
      });

      const data = await res.json();
      if (data.success) {
        setSeller({ ...seller, payout_method: payoutMethod });
        setEditingPayout(false);
        showSuccess('Payout method saved');
      } else {
        setError(data.error || 'Failed to save payout method');
      }
    } catch (err) {
      setError('Failed to save payout method');
    } finally {
      setSavingPayout(false);
    }
  }

  // ============ CANCEL HANDLERS ============
  function cancelEmailEdit() {
    setEditingEmail(false);
    setEmailVerifyStep('input');
    setNewEmail('');
    setVerificationCode('');
    setError('');
  }

  function cancelPhoneEdit() {
    setEditingPhone(false);
    setPhoneVerifyStep('input');
    setNewPhone('');
    setVerificationCode('');
    setError('');
  }

  function cancelAddressEdit() {
    if (seller?.shipping_address) {
      setShippingAddress(seller.shipping_address);
    }
    setEditingAddress(false);
    setError('');
  }

  function cancelPayoutEdit() {
    if (seller?.payout_method) {
      setPayoutMethod(seller.payout_method);
    }
    setEditingPayout(false);
    setError('');
  }

  function handleLogout() {
    localStorage.removeItem('seller_token');
    localStorage.removeItem('seller_email');
    navigate('/seller/login');
  }

  // Request shipping label for a sold item
  async function handleRequestLabel(item) {
    setRequestingLabel(item.id);
    setOpenShippingMenu(null);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/seller?action=shipping-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: seller?.email,
          productTitle: item.title,
          transactionId: item.id
        })
      });

      const data = await res.json();

      if (data.needsAddress) {
        setError('Please add your shipping address in your profile first');
        setActiveTab('profile');
        return;
      }

      if (data.labelUrl) {
        // Update the sold product in state with new label info
        setSoldProducts(prev => prev.map(p =>
          p.id === item.id
            ? { ...p, shippingLabelUrl: data.labelUrl, trackingNumber: data.trackingNumber, shippingStatus: 'label_created' }
            : p
        ));
        showSuccess('Shipping label sent to your email!');
        // Open the label in a new tab
        window.open(data.labelUrl, '_blank');
      } else if (data.message) {
        // Instructions only
        showSuccess('Shipping instructions sent to your email!');
      }
    } catch (err) {
      setError('Failed to request shipping label');
    } finally {
      setRequestingLabel(null);
    }
  }

  function getShippingStatusBadge(status, fulfilledAt) {
    // If order is fulfilled but no label was created, show "Fulfilled" instead of "Ship Now"
    if (fulfilledAt && status === 'pending_label') {
      return { label: 'Fulfilled', color: 'bg-green-100 text-green-800' };
    }
    const badges = {
      pending_label: { label: 'Ship Now', color: 'bg-amber-100 text-amber-800' },
      label_created: { label: 'Label Ready', color: 'bg-blue-100 text-blue-800' },
      shipped: { label: 'Shipped', color: 'bg-purple-100 text-purple-800' },
      delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800' }
    };
    return badges[status] || badges.pending_label;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  // ============ RENDER SIDEBAR (Desktop) ============
  function renderSidebar() {
    return (
      <div className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)]">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-gray-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">{seller?.email}</p>
              <p className="text-sm text-gray-500">Seller Account</p>
            </div>
          </div>
        </div>

        <nav className="py-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.comingSoon && handleTabChange(tab.id)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${
                activeTab === tab.id
                  ? 'bg-gray-100 text-gray-900 font-medium border-l-4 border-[#C91A2B]'
                  : tab.comingSoon
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </div>
              {tab.comingSoon && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Soon</span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-gray-200 mt-2 pt-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  // ============ RENDER MOBILE MENU ============
  function renderMobileMenu() {
    return (
      <div className="bg-white min-h-screen">
        {/* User Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-[#C91A2B] rounded-full flex items-center justify-center text-white text-xl font-bold">
              {seller?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">{seller?.email}</p>
              <p className="text-sm text-gray-500">Seller Account</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="divide-y divide-gray-100">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.comingSoon && handleTabChange(tab.id)}
              disabled={tab.comingSoon}
              className={`w-full flex items-center justify-between px-4 py-4 text-left ${
                tab.comingSoon ? 'opacity-50' : 'active:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <tab.icon className="w-5 h-5 text-gray-600" />
                <span className="text-gray-900">{tab.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {tab.comingSoon && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Coming Soon</span>
                )}
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </button>
          ))}
        </div>

        {/* Sign Out */}
        <div className="border-t border-gray-200 mt-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-4 text-gray-700 active:bg-gray-50"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  // ============ RENDER MY SALES TAB ============
  function renderSalesContent() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">My Sales</h2>
          <span className="text-sm text-gray-500">{soldProducts.length} items sold</span>
        </div>

        {soldProducts.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">No sales yet</p>
            <Link
              to="/submit"
              className="inline-flex items-center gap-2 bg-[#C91A2B] text-white px-4 py-2 rounded-lg hover:bg-[#a81523] transition"
            >
              List your first item
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {soldProducts.map((item, idx) => {
              const shippingBadge = getShippingStatusBadge(item.shippingStatus, item.fulfilledAt);
              const hasLabel = !!item.shippingLabelUrl;
              const isFulfilledWithoutLabel = item.fulfilledAt && !hasLabel;

              return (
                <div key={idx} className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Image */}
                    <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {item.image ? (
                        <img
                          src={getThumbnail(item.image)}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        {item.brand && <span>{item.brand}</span>}
                        <span>Sold for ${item.retailPrice}</span>
                      </div>
                      <p className="text-sm text-green-600 font-medium mt-1">
                        You earned ${item.earnings?.toFixed(0)}
                      </p>
                      {item.trackingNumber && (
                        <p className="text-xs text-gray-500 mt-1">
                          Tracking: {item.trackingNumber}
                        </p>
                      )}
                    </div>

                    {/* Status & Actions */}
                    <div className="flex flex-col items-end gap-2">
                      {/* Payout Status */}
                      {item.status === 'SOLD_WITH_PAYOUT' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Paid Out
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Pending Payout
                        </span>
                      )}

                      {/* Shipping Status */}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${shippingBadge.color}`}>
                        {shippingBadge.label}
                      </span>

                      {/* Shipping Actions Dropdown - hide for fulfilled orders without labels */}
                      {!isFulfilledWithoutLabel && (
                        <div className="relative">
                          <button
                            onClick={() => setOpenShippingMenu(openShippingMenu === item.id ? null : item.id)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>

                          {openShippingMenu === item.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setOpenShippingMenu(null)}
                            />
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                              {hasLabel ? (
                                <>
                                  <a
                                    href={item.shippingLabelUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    onClick={() => setOpenShippingMenu(null)}
                                  >
                                    <Printer className="w-4 h-4" />
                                    Print Label
                                  </a>
                                  {item.trackingNumber && (
                                    <a
                                      href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${item.trackingNumber}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                      onClick={() => setOpenShippingMenu(null)}
                                    >
                                      <Truck className="w-4 h-4" />
                                      Track Package
                                    </a>
                                  )}
                                </>
                              ) : (
                                <button
                                  onClick={() => handleRequestLabel(item)}
                                  disabled={requestingLabel === item.id}
                                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full disabled:opacity-50"
                                >
                                  {requestingLabel === item.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Printer className="w-4 h-4" />
                                  )}
                                  Get Shipping Label
                                </button>
                              )}
                            </div>
                          </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Shipping Call to Action for items without label (only if not already fulfilled) */}
                  {!hasLabel && item.shippingStatus === 'pending_label' && !item.fulfilledAt && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-amber-600" />
                          <span className="text-sm text-amber-800">Ship this item to get paid</span>
                        </div>
                        <button
                          onClick={() => handleRequestLabel(item)}
                          disabled={requestingLabel === item.id}
                          className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          {requestingLabel === item.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Printer className="w-4 h-4" />
                              Get Label
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Earnings Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Earnings Summary</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500">Total Earned</p>
              <p className="text-2xl font-bold text-gray-900">${seller?.totalEarnings?.toFixed(0) || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Payout</p>
              <p className="text-2xl font-bold text-amber-600">${seller?.pendingPayout?.toFixed(0) || 0}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ RENDER COMING SOON TAB ============
  function renderComingSoonContent(tabId) {
    const tab = TABS.find(t => t.id === tabId);
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Lock className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{tab?.label}</h2>
        <p className="text-gray-500">This feature is coming soon!</p>
      </div>
    );
  }

  // ============ RENDER PROFILE TAB ============
  function renderProfileContent() {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Account Settings</h2>

        {/* Global Messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" />
            {success}
          </div>
        )}

        {/* Email */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Email</h3>
                {!editingEmail && <p className="text-gray-600">{seller?.email || '-'}</p>}
              </div>
            </div>
            {!editingEmail && (
              <button
                onClick={() => setEditingEmail(true)}
                className="text-[#C91A2B] hover:text-[#a81523] text-sm font-medium flex items-center gap-1"
              >
                <Edit2 className="w-4 h-4" />
                Change
              </button>
            )}
          </div>

          {editingEmail && (
            <div className="space-y-3">
              {emailVerifyStep === 'input' ? (
                <>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="New email address"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                  />
                  <div className="flex gap-3">
                    <button onClick={cancelEmailEdit} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                      Cancel
                    </button>
                    <button
                      onClick={handleRequestEmailChange}
                      disabled={savingEmail || !newEmail}
                      className="flex-1 bg-[#C91A2B] text-white py-2 rounded-lg font-medium hover:bg-[#a81523] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Enter the code sent to {newEmail}</p>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full text-center text-xl tracking-widest font-mono px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                    maxLength={6}
                  />
                  <div className="flex gap-3">
                    <button onClick={cancelEmailEdit} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                      Cancel
                    </button>
                    <button
                      onClick={handleVerifyEmailChange}
                      disabled={savingEmail || verificationCode.length !== 6}
                      className="flex-1 bg-[#C91A2B] text-white py-2 rounded-lg font-medium hover:bg-[#a81523] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Phone className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Phone</h3>
                {!editingPhone && <p className="text-gray-600">{seller?.phone || 'Not set'}</p>}
              </div>
            </div>
            {!editingPhone && (
              <button
                onClick={() => setEditingPhone(true)}
                className="text-[#C91A2B] hover:text-[#a81523] text-sm font-medium flex items-center gap-1"
              >
                <Edit2 className="w-4 h-4" />
                {seller?.phone ? 'Change' : 'Add'}
              </button>
            )}
          </div>

          {editingPhone && (
            <div className="space-y-3">
              {phoneVerifyStep === 'input' ? (
                <>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                  />
                  <p className="text-xs text-gray-500">We'll send a verification code via WhatsApp</p>
                  <div className="flex gap-3">
                    <button onClick={cancelPhoneEdit} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                      Cancel
                    </button>
                    <button
                      onClick={handleRequestPhoneChange}
                      disabled={savingPhone || !newPhone}
                      className="flex-1 bg-[#C91A2B] text-white py-2 rounded-lg font-medium hover:bg-[#a81523] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Enter the code sent to {newPhone}</p>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full text-center text-xl tracking-widest font-mono px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                    maxLength={6}
                  />
                  <div className="flex gap-3">
                    <button onClick={cancelPhoneEdit} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                      Cancel
                    </button>
                    <button
                      onClick={handleVerifyPhoneChange}
                      disabled={savingPhone || verificationCode.length !== 6}
                      className="flex-1 bg-[#C91A2B] text-white py-2 rounded-lg font-medium hover:bg-[#a81523] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Payout Method */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Payout Method</h3>
                {!editingPayout && seller?.payout_method && (
                  <p className="text-gray-600">{seller.payout_method.type}: {seller.payout_method.account}</p>
                )}
                {!editingPayout && !seller?.payout_method && (
                  <p className="text-gray-500">Not set</p>
                )}
              </div>
            </div>
            {!editingPayout && (
              <button
                onClick={() => setEditingPayout(true)}
                className="text-[#C91A2B] hover:text-[#a81523] text-sm font-medium flex items-center gap-1"
              >
                <Edit2 className="w-4 h-4" />
                {seller?.payout_method ? 'Change' : 'Add'}
              </button>
            )}
          </div>

          {editingPayout && (
            <div className="space-y-3">
              <select
                value={payoutMethod.type}
                onChange={(e) => setPayoutMethod({ ...payoutMethod, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
              >
                <option value="Zelle">Zelle</option>
                <option value="Venmo">Venmo</option>
                <option value="PayPal">PayPal</option>
              </select>
              <input
                type="text"
                value={payoutMethod.name}
                onChange={(e) => setPayoutMethod({ ...payoutMethod, name: e.target.value })}
                placeholder="Name on account"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
              />
              <input
                type="text"
                value={payoutMethod.account}
                onChange={(e) => setPayoutMethod({ ...payoutMethod, account: e.target.value })}
                placeholder={payoutMethod.type === 'PayPal' ? 'PayPal email' : 'Phone or email'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
              />
              <div className="flex gap-3">
                <button onClick={cancelPayoutEdit} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={handleSavePayout}
                  disabled={savingPayout || !payoutMethod.name || !payoutMethod.account}
                  className="flex-1 bg-[#C91A2B] text-white py-2 rounded-lg font-medium hover:bg-[#a81523] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingPayout ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Shipping Address */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <MapPin className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="font-medium text-gray-900">Shipping Address</h3>
            </div>
            {!editingAddress && seller?.has_address && (
              <button
                onClick={() => setEditingAddress(true)}
                className="text-[#C91A2B] hover:text-[#a81523] text-sm font-medium flex items-center gap-1"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>

          {editingAddress || !seller?.has_address ? (
            <div className="space-y-3">
              {!seller?.has_address && (
                <p className="text-sm text-amber-600 mb-2">
                  Add your shipping address so we can create labels when your items sell.
                </p>
              )}
              <input
                type="text"
                value={shippingAddress.full_name}
                onChange={(e) => setShippingAddress({ ...shippingAddress, full_name: e.target.value })}
                placeholder="Full Name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
              />
              <input
                type="text"
                value={shippingAddress.street_address}
                onChange={(e) => setShippingAddress({ ...shippingAddress, street_address: e.target.value })}
                placeholder="Street Address"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                  placeholder="City"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                />
                <input
                  type="text"
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                  placeholder="State"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={shippingAddress.postal_code}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, postal_code: e.target.value })}
                  placeholder="ZIP Code"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                />
                <input
                  type="text"
                  value={shippingAddress.country}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, country: e.target.value })}
                  placeholder="Country"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C91A2B] focus:border-[#C91A2B] outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                {editingAddress && (
                  <button onClick={cancelAddressEdit} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSaveAddress}
                  disabled={!isAddressValid() || savingAddress}
                  className={`${editingAddress ? 'flex-1' : 'w-full'} bg-[#C91A2B] text-white py-2 rounded-lg font-medium hover:bg-[#a81523] disabled:opacity-50 flex items-center justify-center gap-2`}
                >
                  {savingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Address</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-700">
              {shippingAddress.full_name && <p className="font-medium">{shippingAddress.full_name}</p>}
              <p>{shippingAddress.street_address}</p>
              <p>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.postal_code}</p>
              <p className="text-gray-500">{shippingAddress.country}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ RENDER CONTENT FOR ACTIVE TAB ============
  function renderTabContent() {
    switch (activeTab) {
      case 'sales':
        return renderSalesContent();
      case 'balance':
      case 'offers':
        return renderComingSoonContent(activeTab);
      case 'profile':
        return renderProfileContent();
      default:
        return renderProfileContent();
    }
  }

  // ============ MAIN RENDER ============
  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header - Desktop */}
      <header className="bg-white border-b border-gray-200 hidden md:block sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <img src="/logo.svg" alt="The Phir Story" className="h-8" />
            </Link>
            <span className="text-sm text-gray-500 border-l border-gray-200 pl-3">My Account</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/submit"
              className="flex items-center gap-2 bg-[#C91A2B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a81523] transition"
            >
              <Plus className="w-4 h-4" />
              Submit Listing
            </Link>
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            >
              <Home className="w-4 h-4" />
              <span className="text-sm">Dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Header - Mobile */}
      <header className="bg-white border-b border-gray-200 md:hidden sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          {isMobile && activeTab ? (
            <button
              onClick={handleBackToMenu}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg -ml-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <Link to="/" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg -ml-2">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}
          <span className="font-medium text-gray-900">
            {activeTab ? TABS.find(t => t.id === activeTab)?.label || 'My Account' : 'My Account'}
          </span>
          <div className="w-10" />
        </div>
      </header>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50 safe-area-pb">
        <div className="flex items-center justify-around py-2">
          <Link to="/" className="flex flex-col items-center py-2 px-4 text-gray-500">
            <Home className="w-6 h-6" />
            <span className="text-xs mt-1">Home</span>
          </Link>
          <Link
            to="/submit"
            className="flex flex-col items-center py-2 px-6 -mt-4 bg-[#C91A2B] text-white rounded-full shadow-lg"
          >
            <Plus className="w-7 h-7" />
            <span className="text-xs mt-0.5 font-medium">Sell</span>
          </Link>
          <div className="flex flex-col items-center py-2 px-4 text-[#C91A2B]">
            <User className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Profile</span>
          </div>
        </div>
      </nav>

      {/* Desktop Layout */}
      <div className="hidden md:flex">
        {renderSidebar()}
        <main className="flex-1 p-6 max-w-4xl">
          {renderTabContent()}
        </main>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        {!activeTab ? (
          renderMobileMenu()
        ) : (
          <main className="p-4">
            {renderTabContent()}
          </main>
        )}
      </div>
    </div>
  );
}
