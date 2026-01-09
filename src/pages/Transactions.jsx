import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, Clock, CheckCircle, User, ExternalLink,
  Check, X, MessageSquare, Filter, RefreshCw, FileText
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({ totalPending: 0, totalPaid: 0, pendingCount: 0, paidCount: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending_payout, paid

  // Mark paid state
  const [markingPaid, setMarkingPaid] = useState(null); // transaction being marked (full object)
  const [sellerNote, setSellerNote] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);
  const sellerNoteRef = useRef(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (showConfirmModal && sellerNoteRef.current) {
      sellerNoteRef.current.focus();
    }
  }, [showConfirmModal]);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin-listings?action=transactions`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.transactions || []);
        setStats(data.stats || { totalPending: 0, totalPaid: 0, pendingCount: 0, paidCount: 0 });
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
    setLoading(false);
  }

  function openMarkPaidModal(tx) {
    setMarkingPaid(tx);
    setSellerNote('');
    setAdminNote('');
    setShowConfirmModal(true);
  }

  function closeMarkPaidModal() {
    setShowConfirmModal(false);
    setMarkingPaid(null);
    setSellerNote('');
    setAdminNote('');
  }

  async function confirmMarkAsPaid() {
    if (!markingPaid) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/admin-listings?action=mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: markingPaid.id,
          sellerNote: sellerNote || undefined,
          adminNote: adminNote || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        // Update local state
        setTransactions(prev => prev.map(t =>
          t.id === markingPaid.id
            ? {
                ...t,
                status: 'paid',
                paid_at: new Date().toISOString(),
                seller_note: sellerNote || t.seller_note,
                admin_note: adminNote || t.admin_note
              }
            : t
        ));
        // Update stats
        setStats(prev => ({
          ...prev,
          totalPending: prev.totalPending - (markingPaid.seller_payout || 0),
          totalPaid: prev.totalPaid + (markingPaid.seller_payout || 0),
          pendingCount: prev.pendingCount - 1,
          paidCount: prev.paidCount + 1
        }));
        closeMarkPaidModal();
      } else {
        alert('Failed to mark as paid: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to mark as paid: ' + error.message);
    }
    setSaving(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      confirmMarkAsPaid();
    }
    if (e.key === 'Escape') {
      closeMarkPaidModal();
    }
  }

  // Filter transactions
  const filteredTransactions = filter === 'all'
    ? transactions
    : transactions.filter(t => t.status === filter);

  // Format date
  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Transactions</h1>
        <button
          onClick={fetchTransactions}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <Clock className="w-3.5 h-3.5" />
            Pending Payouts
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">${stats.totalPending.toFixed(2)}</p>
          <p className="text-xs text-stone-400 mt-0.5">{stats.pendingCount} transaction{stats.pendingCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <CheckCircle className="w-3.5 h-3.5" />
            Paid Out
          </div>
          <p className="text-2xl font-bold text-green-600 mt-1">${stats.totalPaid.toFixed(2)}</p>
          <p className="text-xs text-stone-400 mt-0.5">{stats.paidCount} transaction{stats.paidCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <DollarSign className="w-3.5 h-3.5" />
            Total Revenue
          </div>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            ${transactions.reduce((sum, t) => sum + (t.sale_price || 0), 0).toFixed(2)}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">{transactions.length} sale{transactions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <DollarSign className="w-3.5 h-3.5" />
            Total Commission
          </div>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            ${transactions.reduce((sum, t) => sum + ((t.sale_price || 0) - (t.seller_payout || 0)), 0).toFixed(2)}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">
            {transactions.length > 0
              ? `${((1 - transactions.reduce((sum, t) => sum + (t.seller_payout || 0), 0) / Math.max(1, transactions.reduce((sum, t) => sum + (t.sale_price || 0), 0))) * 100).toFixed(0)}% avg`
              : '0% avg'
            }
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-stone-400" />
        <div className="flex bg-stone-100 rounded-lg p-0.5">
          {[
            { value: 'all', label: 'All' },
            { value: 'pending_payout', label: 'Pending' },
            { value: 'paid', label: 'Paid' }
          ].map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === option.value
                  ? 'bg-white text-stone-900 shadow-sm font-medium'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-stone-400 ml-2">
          {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center text-stone-500">
            <DollarSign className="w-12 h-12 mx-auto mb-3 text-stone-300" />
            <p>No transactions found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Product</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Seller</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Sale</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Payout</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredTransactions.map(tx => (
                <tr key={tx.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-stone-600">
                    {formatDate(tx.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-stone-900">{tx.order_name || tx.order_id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-stone-900 truncate max-w-[200px]" title={tx.product_title}>
                      {tx.product_title}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {tx.seller ? (
                      <Link
                        to={`/admin/sellers/${tx.seller_id}`}
                        className="flex items-center gap-2 hover:text-stone-700 transition-colors"
                      >
                        <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">
                          {tx.seller.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-stone-900">{tx.seller.name || 'Unknown'}</div>
                          <div className="text-xs text-stone-400">{tx.seller.email}</div>
                        </div>
                      </Link>
                    ) : (
                      <span className="text-sm text-stone-400 italic">Unknown seller</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium text-stone-900">${(tx.sale_price || 0).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-green-600">${(tx.seller_payout || 0).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tx.status === 'paid' ? (
                      <div className="inline-flex flex-col items-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" />
                          Paid
                        </span>
                        {tx.paid_at && (
                          <span className="text-[10px] text-stone-400 mt-0.5">
                            {formatDateTime(tx.paid_at)}
                          </span>
                        )}
                        {tx.seller_note && (
                          <span className="text-[11px] text-green-600 mt-1">
                            {tx.seller_note}
                          </span>
                        )}
                        {tx.admin_note && (
                          <span className="text-[10px] text-stone-400 mt-0.5 italic">
                            ({tx.admin_note})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Clock className="w-3 h-3" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {tx.status === 'pending_payout' && (
                      <button
                        onClick={() => openMarkPaidModal(tx)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <DollarSign className="w-3 h-3" />
                        Mark Paid
                      </button>
                    )}
                    {tx.status === 'paid' && tx.seller?.paypal_email && (
                      <span className="text-[10px] text-stone-400" title={tx.seller.paypal_email}>
                        {tx.seller.paypal_email}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick PayPal List for Pending */}
      {stats.pendingCount > 0 && filter !== 'paid' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Quick Payout List
          </h3>
          <div className="space-y-1">
            {Object.entries(
              transactions
                .filter(t => t.status === 'pending_payout' && t.seller)
                .reduce((acc, t) => {
                  const key = t.seller?.paypal_email || t.seller?.email || 'no-email';
                  if (!acc[key]) {
                    acc[key] = {
                      email: t.seller?.paypal_email || t.seller?.email,
                      name: t.seller?.name,
                      total: 0,
                      count: 0
                    };
                  }
                  acc[key].total += t.seller_payout || 0;
                  acc[key].count++;
                  return acc;
                }, {})
            ).map(([key, data]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-amber-900">
                  {data.name || 'Unknown'} — <span className="text-amber-700">{data.email}</span>
                </span>
                <span className="font-medium text-amber-900">
                  ${data.total.toFixed(2)} <span className="text-amber-600 text-xs">({data.count} item{data.count !== 1 ? 's' : ''})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mark Paid Confirmation Modal */}
      {showConfirmModal && markingPaid && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onKeyDown={handleKeyDown}>
            <div className="px-5 py-4 border-b border-stone-200">
              <h3 className="text-lg font-semibold text-stone-900">Confirm Payout</h3>
              <p className="text-sm text-stone-500 mt-1">Mark this transaction as paid</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Transaction Details */}
              <div className="bg-stone-50 rounded-lg p-4">
                <div className="text-sm text-stone-600">{markingPaid.product_title}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-stone-500">Payout Amount</span>
                  <span className="text-xl font-bold text-green-600">${markingPaid.seller_payout?.toFixed(2)}</span>
                </div>
                {markingPaid.seller && (
                  <div className="text-xs text-stone-400 mt-2">
                    To: {markingPaid.seller.name || markingPaid.seller.email}
                    {markingPaid.seller.paypal_email && ` (${markingPaid.seller.paypal_email})`}
                  </div>
                )}
              </div>

              {/* Seller Note */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Payment Method <span className="text-stone-400 font-normal">(shown to seller)</span>
                </label>
                <input
                  ref={sellerNoteRef}
                  type="text"
                  value={sellerNote}
                  onChange={(e) => setSellerNote(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., via PayPal, via Zelle, via Venmo..."
                  className="w-full px-4 py-3 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {/* Admin Note */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Admin Note <span className="text-stone-400 font-normal">(internal only)</span>
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., PayPal transaction ID, reference number..."
                  rows={2}
                  className="w-full px-4 py-3 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-stone-200 flex gap-3">
              <button
                onClick={closeMarkPaidModal}
                disabled={saving}
                className="flex-1 px-4 py-2.5 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmMarkAsPaid}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm Paid
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
