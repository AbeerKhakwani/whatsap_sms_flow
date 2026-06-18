import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign, Clock, CheckCircle, Package, Truck, Printer,
  AlertTriangle, RefreshCw, Download, X, Link2, ChevronRight, Upload
} from 'lucide-react';

import { payoutMethodLabel, payoutHandle } from '../lib/payout-display.js';

const API_URL = import.meta.env.VITE_API_URL || '';
const money = n => `$${(Number(n) || 0).toFixed(0)}`;
const money2 = n => `$${(Number(n) || 0).toFixed(2)}`;

// Payout stage of a transaction, with a sensible default for legacy rows.
function payoutStageOf(tx) {
  return tx.payout_status || (tx.status === 'paid' ? 'paid' : 'pending_shipping');
}

// Single, scannable status badge for the flat (browse) views.
const SHIP_BADGE = {
  pending_label: ['Awaiting label', 'bg-amber-100 text-amber-700', Package],
  label_created: ['Label ready', 'bg-blue-100 text-blue-700', Printer],
  concierge:     ['Concierge', 'bg-violet-100 text-violet-700', Package],
  shipped:       ['Shipped', 'bg-purple-100 text-purple-700', Truck],
  in_transit:    ['In transit', 'bg-blue-100 text-blue-700', Truck],
  delivered:     ['Delivered', 'bg-indigo-100 text-indigo-700', CheckCircle],
  failed:        ['Shipping failed', 'bg-red-100 text-red-700', AlertTriangle],
  returned:      ['Returned', 'bg-red-100 text-red-700', Package],
};
const PAY_BADGE = {
  pending_shipping: ['Awaiting shipment', 'bg-amber-100 text-amber-700', Clock],
  in_transit:       ['In transit', 'bg-blue-100 text-blue-700', Truck],
  delivered:        ['Delivered', 'bg-indigo-100 text-indigo-700', CheckCircle],
};

function statusBadge(tx) {
  const pay = payoutStageOf(tx);
  if (pay === 'paid')      return ['Paid', 'bg-stone-100 text-stone-500', CheckCircle];
  if (pay === 'cancelled') return ['Cancelled', 'bg-stone-100 text-stone-400', X];
  if (pay === 'available') return ['Ready to pay', 'bg-green-100 text-green-700', DollarSign];
  if (pay === 'needs_attention' || !tx.seller_id) return ['Seller not found', 'bg-red-100 text-red-700', AlertTriangle];
  if (tx.commission_rate == null) return ['Needs commission', 'bg-orange-100 text-orange-700', AlertTriangle];
  return SHIP_BADGE[tx.shipping_status] || PAY_BADGE[pay] || ['Pending', 'bg-stone-100 text-stone-600', Clock];
}

// Dedicated payout destination on file (Zelle/Interac handle or PayPal email).
// Their login email does NOT count — we want to flag sellers we can't actually pay.
// Both delegate to the shared normalizers, which safely handle payout_method being
// either a string or a { name, type, account } object (the latter crashed the page).
const payoutHandleOf = payoutHandle;
const sellerMethod = payoutMethodLabel;

const TABS = [
  { value: 'pending', label: 'Pending payouts' },
  { value: 'paid', label: 'Paid out' },
  { value: 'all', label: 'All' },
];

export default function Transactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  // Per-seller pay modal
  const [payGroup, setPayGroup] = useState(null); // { seller, items, total }
  const [payMethod, setPayMethod] = useState('');
  const [payHandle, setPayHandle] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySkip, setPaySkip] = useState(false);
  const [payScreenshot, setPayScreenshot] = useState(null); // data URL of the Zelle screenshot
  const [paying, setPaying] = useState(false);

  useEffect(() => { fetchTransactions(); }, []);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=transactions`);
      const data = await res.json();
      if (data.success) setTransactions(data.transactions || []);
    } catch (e) {
      console.error('Error fetching transactions:', e);
    }
    setLoading(false);
  }

  function handleExport() {
    window.open(`${API_URL}/api/admin-listings?action=export-payouts&payout_status=available`, '_blank');
  }

  // Buckets
  const availableList = transactions.filter(t => payoutStageOf(t) === 'available' && t.seller_id && t.seller);
  const paidList = transactions.filter(t => payoutStageOf(t) === 'paid');
  const needsAttention = transactions.filter(t => payoutStageOf(t) === 'needs_attention' || !t.seller_id);
  // Owed but not payable yet (still moving through shipping / review window).
  const notReadyList = transactions.filter(t => {
    const p = payoutStageOf(t);
    return p !== 'paid' && p !== 'cancelled' && p !== 'available' && p !== 'needs_attention' && t.seller_id;
  });

  // Group ready-to-pay items by seller → one card = one transfer.
  const sellerGroups = Object.values(availableList.reduce((acc, t) => {
    const k = t.seller_id;
    if (!acc[k]) acc[k] = { seller: t.seller, items: [], total: 0 };
    acc[k].items.push(t);
    acc[k].total += t.seller_payout || 0;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);

  const readyTotal = availableList.reduce((s, t) => s + (t.seller_payout || 0), 0);
  const paidTotal = paidList.reduce((s, t) => s + (t.seller_payout || 0), 0);

  // Pay modal
  function openPay(group) {
    setPayGroup(group);
    setPayMethod(sellerMethod(group.seller));
    setPayHandle(payoutHandleOf(group.seller) || group.seller.email || '');
    setPayReference('');
    setPayNotes('');
    setPaySkip(false);
    setPayScreenshot(null);
  }
  function closePay() { setPayGroup(null); }

  async function confirmPay() {
    if (!payGroup) return;
    setPaying(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=bulk-mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: payGroup.items.map(t => t.id),
          payoutMethod: payMethod || undefined,
          payoutHandle: payHandle || undefined,
          payoutReference: payReference || undefined,
          payoutNotes: payNotes || undefined,
          payoutScreenshot: payScreenshot || undefined,
          skipNotification: paySkip || undefined,
          adminEmail: localStorage.getItem('admin_email') || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) { closePay(); await fetchTransactions(); }
      else alert('Failed: ' + (data.error || 'Unknown error'));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setPaying(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const flatList = filter === 'paid' ? paidList : transactions;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Payouts</h1>
          <p className="text-sm text-stone-500 mt-0.5">Pay each seller once — every item they're owed, settled together.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={fetchTransactions} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Two summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => setFilter('pending')} className={`text-left bg-white border p-4 rounded-xl transition-colors ${filter === 'pending' ? 'border-amber-300 ring-1 ring-amber-200' : 'border-stone-200 hover:border-stone-300'}`}>
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide"><Clock className="w-3.5 h-3.5" /> Pending payouts</div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{money(readyTotal)}</p>
          <p className="text-xs text-stone-400 mt-0.5">{sellerGroups.length} seller{sellerGroups.length !== 1 ? 's' : ''} · {availableList.length} item{availableList.length !== 1 ? 's' : ''}</p>
        </button>
        <button onClick={() => setFilter('paid')} className={`text-left bg-white border p-4 rounded-xl transition-colors ${filter === 'paid' ? 'border-green-300 ring-1 ring-green-200' : 'border-stone-200 hover:border-stone-300'}`}>
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide"><CheckCircle className="w-3.5 h-3.5" /> Paid out</div>
          <p className="text-2xl font-bold text-green-600 mt-1">{money(paidTotal)}</p>
          <p className="text-xs text-stone-400 mt-0.5">{paidList.length} item{paidList.length !== 1 ? 's' : ''}</p>
        </button>
      </div>

      {/* Needs-attention safety net */}
      {needsAttention.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-900 flex-1">
            {needsAttention.length} transaction{needsAttention.length !== 1 ? 's' : ''} couldn't be matched to a seller — open each to fix.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex bg-stone-100 rounded-lg p-0.5">
          {TABS.map(tab => {
            const count = tab.value === 'paid' ? paidList.length : tab.value === 'pending' ? sellerGroups.length : transactions.length;
            return (
              <button key={tab.value} onClick={() => setFilter(tab.value)}
                className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${filter === tab.value ? 'bg-white text-stone-900 shadow-sm font-medium' : 'text-stone-500 hover:text-stone-700'}`}>
                {tab.label}<span className="ml-1.5 text-xs text-stone-400">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* PENDING — one card per seller */}
      {filter === 'pending' ? (
        <div className="space-y-3">
          {sellerGroups.length === 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 p-12 text-center text-stone-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-stone-300" />
              <p>No payouts ready — all caught up.</p>
            </div>
          ) : sellerGroups.map(group => {
            const handle = payoutHandleOf(group.seller);
            const hasInfo = !!handle;
            return (
              <div key={group.seller.id} className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-sm font-semibold text-stone-600 flex-shrink-0">
                    {group.seller.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900">{group.seller.name || group.seller.email || 'Unknown'}</p>
                    {hasInfo ? (
                      <p className="text-xs text-stone-500 truncate">{sellerMethod(group.seller)} · {handle}</p>
                    ) : (
                      <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No payout info on file</p>
                    )}
                  </div>
                  <div className="text-right mr-1">
                    <p className="text-lg font-semibold text-green-600">{money(group.total)}</p>
                    <p className="text-xs text-stone-400">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  {hasInfo ? (
                    <button onClick={() => openPay(group)} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
                      Mark paid
                    </button>
                  ) : (
                    <button onClick={() => navigate(`/admin/sellers/${group.seller.id}`)} className="px-4 py-2 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors font-medium">
                      Add info
                    </button>
                  )}
                </div>
                {/* items */}
                <div className="border-t border-stone-100 mt-3 pt-2.5 space-y-1.5">
                  {group.items.map(t => (
                    <button key={t.id} onClick={() => navigate(`/admin/transactions/${t.id}`)}
                      className="w-full flex items-center justify-between text-sm hover:bg-stone-50 -mx-1 px-1 py-0.5 rounded transition-colors">
                      <span className="text-stone-600 truncate text-left">
                        {t.product_title}<span className="text-stone-400"> · {t.order_name || t.order_id}</span>
                      </span>
                      <span className="flex items-center gap-1 text-stone-700 flex-shrink-0">{money2(t.seller_payout)}<ChevronRight className="w-3.5 h-3.5 text-stone-300" /></span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Owed but not ready yet — informational, no action */}
          {notReadyList.length > 0 && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
              <p className="text-xs text-stone-400 uppercase tracking-wide mb-2">Not ready yet · {notReadyList.length}</p>
              <div className="space-y-1.5">
                {notReadyList.map(t => {
                  const [label, , Icon] = statusBadge(t);
                  return (
                    <button key={t.id} onClick={() => navigate(`/admin/transactions/${t.id}`)}
                      className="w-full flex items-center justify-between text-sm hover:bg-white -mx-1 px-1 py-1 rounded transition-colors">
                      <span className="text-stone-500 truncate text-left">
                        {t.seller?.name || 'Unknown'}<span className="text-stone-400"> · {t.product_title}</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-stone-400 flex-shrink-0"><Icon className="w-3 h-3" />{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* PAID / ALL — flat browse table (no per-row money) */
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {flatList.length === 0 ? (
            <div className="p-12 text-center text-stone-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-stone-300" />
              <p>{filter === 'paid' ? 'Nothing paid out yet.' : 'No transactions yet.'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Seller</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Order</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Product</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">{filter === 'paid' ? 'Paid via' : 'PayPal'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {flatList.map(tx => {
                  const [label, cls, Icon] = statusBadge(tx);
                  const cancelled = payoutStageOf(tx) === 'cancelled';
                  return (
                    <tr key={tx.id} onClick={() => navigate(`/admin/transactions/${tx.id}`)}
                      className={`cursor-pointer hover:bg-stone-50 transition-colors ${cancelled ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}><Icon className="w-3 h-3" />{label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {tx.seller ? <span className="text-sm font-medium text-stone-900">{tx.seller.name || tx.seller.email || 'Unknown'}</span>
                                   : <span className="text-sm text-red-600 font-medium">Not found</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600 whitespace-nowrap">{tx.order_name || tx.order_id || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-stone-900 truncate max-w-[220px] block" title={tx.product_title}>{tx.product_title}</span>
                      </td>
                      <td className="px-4 py-3">
                        {filter === 'paid' ? (
                          <span className="text-xs text-stone-500 flex items-center gap-1">
                            {tx.payout_method || 'Zelle'}
                            {tx.payout_reference && <span className="inline-flex items-center gap-0.5 text-stone-400"><Link2 className="w-3 h-3" />{tx.payout_reference}</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-500 truncate max-w-[180px] block" title={tx.seller?.paypal_email || tx.seller?.email}>
                            {tx.seller?.paypal_email || tx.seller?.email || '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Per-seller pay modal */}
      {payGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={closePay}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-stone-200">
              <h3 className="text-lg font-semibold text-stone-900">Pay {payGroup.seller.name || 'seller'}</h3>
              <p className="text-sm text-stone-500 mt-0.5">{payGroup.items.length} item{payGroup.items.length !== 1 ? 's' : ''} · <span className="font-semibold text-green-600">{money2(payGroup.total)}</span> total</p>
            </div>
            <div className="p-5 space-y-4">
              {/* items recap */}
              <div className="bg-stone-50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                {payGroup.items.map(t => (
                  <div key={t.id} className="flex justify-between text-xs">
                    <span className="text-stone-500 truncate">{t.product_title} · {t.order_name || t.order_id}</span>
                    <span className="text-stone-700">{money2(t.seller_payout)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Method</label>
                  <input value={payMethod} onChange={e => setPayMethod(e.target.value)} placeholder="Zelle / Interac"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Sent to</label>
                  <input value={payHandle} onChange={e => setPayHandle(e.target.value)} placeholder="email or phone"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-indigo-600 mb-1 flex items-center gap-1"><Link2 className="w-3 h-3" /> Confirmation # <span className="text-stone-400 font-normal">— optional, attaches to each item</span></label>
                <input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="paste the reference from your bank"
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Note <span className="text-stone-400 font-normal">— internal, optional</span></label>
                <textarea value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2} placeholder="anything to remember"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-stone-50 resize-y" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Payment screenshot <span className="text-stone-400 font-normal">— optional, sent to seller with the receipt</span></label>
                {payScreenshot ? (
                  <div className="flex items-center gap-3">
                    <img src={payScreenshot} alt="payment screenshot" className="w-14 h-14 object-cover rounded-lg border border-stone-200" />
                    <button onClick={() => setPayScreenshot(null)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-stone-300 rounded-lg cursor-pointer hover:bg-stone-50 text-stone-500">
                    <Upload className="w-4 h-4" /> Upload Zelle screenshot
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0]; e.target.value = '';
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () => setPayScreenshot(String(r.result));
                      r.readAsDataURL(f);
                    }} />
                  </label>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={paySkip} onChange={e => setPaySkip(e.target.checked)} className="w-4 h-4 rounded border-stone-300" />
                <span className="text-sm text-stone-600">Skip seller notification</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-stone-200 flex gap-3">
              <button onClick={closePay} disabled={paying} className="flex-1 px-4 py-2.5 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 text-sm font-medium disabled:opacity-50">Cancel</button>
              <button onClick={confirmPay} disabled={paying}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {paying ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
                        : <><CheckCircle className="w-4 h-4" /> Mark {payGroup.items.length} item{payGroup.items.length !== 1 ? 's' : ''} paid</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-stone-400">
        {filter === 'pending'
          ? `${sellerGroups.length} seller${sellerGroups.length !== 1 ? 's' : ''} ready · ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} total.`
          : `Showing ${flatList.length} of ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}.`}
      </p>
    </div>
  );
}
