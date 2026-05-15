import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, Clock, CheckCircle, User, ExternalLink,
  Check, X, MessageSquare, Filter, RefreshCw, FileText,
  Package, Truck, Printer, Download, AlertTriangle
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Single mark paid
  const [markingPaid, setMarkingPaid] = useState(null);
  const [sellerNote, setSellerNote] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);
  const sellerNoteRef = useRef(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [skipNotification, setSkipNotification] = useState(false);

  // Set commission modal
  const [commissionTx, setCommissionTx] = useState(null);
  const [commissionRate, setCommissionRate] = useState('');
  const [commissionNotify, setCommissionNotify] = useState(true);
  const [commissionSaving, setCommissionSaving] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkAdminNote, setBulkAdminNote] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSkipNotification, setBulkSkipNotification] = useState(false);

  // Alerts
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    fetchTransactions();
    fetchAlerts();
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
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
    setLoading(false);
  }

  async function fetchAlerts() {
    try {
      const response = await fetch(`${API_URL}/api/admin-listings?action=shipping-alerts`);
      const data = await response.json();
      if (data.success) {
        setAlerts(data);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }

  // Set commission
  function openCommissionModal(tx) {
    setCommissionTx(tx);
    setCommissionRate(tx.commission_rate != null ? String(tx.commission_rate) : '');
    setCommissionNotify(true);
    setCommissionSaving(false);
  }

  async function saveCommission() {
    if (!commissionTx) return;
    setCommissionSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=update-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: commissionTx.id, commissionRate: parseFloat(commissionRate), notify: commissionNotify })
      });
      const data = await res.json();
      if (data.success) {
        await fetchTransactions();
        setCommissionTx(null);
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Failed: ' + e.message);
    }
    setCommissionSaving(false);
  }

  // Single mark paid
  function openMarkPaidModal(tx, silent = false) {
    setMarkingPaid(tx);
    setSellerNote('');
    setAdminNote('');
    setSkipNotification(silent);
    setShowConfirmModal(true);
  }

  function closeMarkPaidModal() {
    setShowConfirmModal(false);
    setMarkingPaid(null);
    setSellerNote('');
    setAdminNote('');
    setSkipNotification(false);
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
          adminNote: adminNote || undefined,
          skipNotification: skipNotification || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        await fetchTransactions();
        closeMarkPaidModal();
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed: ' + error.message);
    }
    setSaving(false);
  }

  // Bulk mark paid
  async function confirmBulkMarkPaid() {
    setBulkSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/admin-listings?action=bulk-mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: [...selectedIds],
          sellerNote: bulkNote || undefined,
          adminNote: bulkAdminNote || undefined,
          skipNotification: bulkSkipNotification || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        setSelectedIds(new Set());
        setShowBulkModal(false);
        setBulkNote('');
        setBulkAdminNote('');
        setBulkSkipNotification(false);
        await fetchTransactions();
        alert(`Marked ${data.updated} transaction(s) as paid.${bulkSkipNotification ? '' : ` ${data.notificationsSent} notification(s) sent.`}`);
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed: ' + error.message);
    }
    setBulkSaving(false);
  }

  // CSV export
  function handleExport() {
    window.open(`${API_URL}/api/admin-listings?action=export-payouts&payout_status=available`, '_blank');
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

  // Toggle selection
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const availableIds = filteredTransactions
      .filter(t => (t.payout_status || 'pending_shipping') === 'available')
      .map(t => t.id);

    if (availableIds.every(id => selectedIds.has(id))) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        availableIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        availableIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  // Filter
  const filteredTransactions = filter === 'all'
    ? transactions
    : transactions.filter(t => {
        const payoutStatus = t.payout_status || (t.status === 'paid' ? 'paid' : 'pending_shipping');
        return payoutStatus === filter;
      });

  // Helpers
  function isShippingOverdue(tx) {
    if (!tx.ship_by) return false;
    const payoutStatus = tx.payout_status || 'pending_shipping';
    if (payoutStatus !== 'pending_shipping') return false;
    return new Date(tx.ship_by) < new Date();
  }

  function getDaysUntilShipBy(tx) {
    if (!tx.ship_by) return null;
    return Math.ceil((new Date(tx.ship_by) - new Date()) / (1000 * 60 * 60 * 24));
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function getShippingBadge(status) {
    const badges = {
      pending_label: { label: 'Awaiting Label', color: 'bg-amber-100 text-amber-700', icon: Package },
      label_created: { label: 'Label Ready', color: 'bg-blue-100 text-blue-700', icon: Printer },
      shipped: { label: 'Shipped', color: 'bg-purple-100 text-purple-700', icon: Truck },
      delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: X },
      returned: { label: 'Returned', color: 'bg-red-100 text-red-700', icon: Package },
      cancelled: { label: 'Cancelled', color: 'bg-stone-100 text-stone-500', icon: X },
      needs_attention: { label: '⚠️ Needs Attention', color: 'bg-red-100 text-red-700', icon: AlertTriangle }
    };
    return badges[status] || badges.pending_label;
  }

  // Pipeline config
  const pipelineStages = [
    { key: 'needs_attention', label: '⚠️ Attention', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
    { key: 'needs_commission', label: '% Commission', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
    { key: 'pending_shipping', label: 'Pending Ship', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50' },
    { key: 'in_transit', label: 'In Transit', color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50' },
    { key: 'delivered', label: 'Delivered', color: 'bg-purple-500', textColor: 'text-purple-700', bgLight: 'bg-purple-50' },
    { key: 'available', label: 'Available', color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50' },
    { key: 'paid', label: 'Paid', color: 'bg-stone-400', textColor: 'text-stone-600', bgLight: 'bg-stone-50' },
    { key: 'cancelled', label: 'Cancelled', color: 'bg-stone-300', textColor: 'text-stone-400', bgLight: 'bg-stone-50' }
  ];

  const pipeline = stats?.pipeline || {};
  const needsAttentionCount = pipeline.needs_attention?.count || 0;
  const totalAlerts = (alerts?.overdue?.length || 0) + (alerts?.labelNotShipped?.length || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Transactions</h1>
          <p className="text-sm text-stone-500 mt-0.5">Track payouts from sale to settlement</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => { fetchTransactions(); fetchAlerts(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <DollarSign className="w-3.5 h-3.5" />
            Total GMV
          </div>
          <p className="text-2xl font-bold text-stone-900 mt-1">${(stats?.totalGMV || 0).toFixed(0)}</p>
          <p className="text-xs text-stone-400 mt-0.5">{stats?.totalCount || 0} orders</p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <DollarSign className="w-3.5 h-3.5" />
            Commission
          </div>
          <p className="text-2xl font-bold text-stone-900 mt-1">${(stats?.totalCommission || 0).toFixed(0)}</p>
          <p className="text-xs text-stone-400 mt-0.5">
            {stats?.totalGMV > 0 ? `${((stats.totalCommission / stats.totalGMV) * 100).toFixed(0)}% avg` : '0%'}
          </p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <Clock className="w-3.5 h-3.5" />
            Pending Payouts
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">${(stats?.totalPending || 0).toFixed(0)}</p>
          <p className="text-xs text-stone-400 mt-0.5">
            {(pipeline.pending_shipping?.count || 0) + (pipeline.in_transit?.count || 0) + (pipeline.delivered?.count || 0) + (pipeline.available?.count || 0)} items
          </p>
        </div>
        <div className="bg-white border border-stone-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wide">
            <CheckCircle className="w-3.5 h-3.5" />
            Paid Out
          </div>
          <p className="text-2xl font-bold text-green-600 mt-1">${(stats?.totalPaid || 0).toFixed(0)}</p>
          <p className="text-xs text-stone-400 mt-0.5">{pipeline.paid?.count || 0} items</p>
        </div>
      </div>

      {/* Pipeline Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-center gap-1 h-8 rounded-lg overflow-hidden bg-stone-100">
          {pipelineStages.map(stage => {
            const data = pipeline[stage.key] || { count: 0, total: 0 };
            const totalItems = transactions.length || 1;
            const widthPct = Math.max((data.count / totalItems) * 100, data.count > 0 ? 8 : 0);

            if (data.count === 0) return null;

            return (
              <button
                key={stage.key}
                onClick={() => setFilter(filter === stage.key ? 'all' : stage.key)}
                className={`h-full flex items-center justify-center text-white text-xs font-medium transition-all hover:opacity-80 ${stage.color} ${
                  filter === stage.key ? 'ring-2 ring-offset-1 ring-stone-900' : ''
                }`}
                style={{ width: `${widthPct}%`, minWidth: data.count > 0 ? '60px' : '0' }}
                title={`${stage.label}: ${data.count} items, $${data.total.toFixed(0)}`}
              >
                {data.count}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-stone-500 flex-wrap">
          {pipelineStages.map(stage => {
            const data = pipeline[stage.key] || { count: 0, total: 0 };
            if (data.count === 0) return null;
            return (
              <button
                key={stage.key}
                onClick={() => setFilter(filter === stage.key ? 'all' : stage.key)}
                className={`flex items-center gap-1.5 hover:text-stone-700 transition-colors ${
                  filter === stage.key ? 'font-medium text-stone-900' : ''
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${stage.color}`}></span>
                {stage.label}: {data.count} / ${data.total.toFixed(0)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Needs Attention Banner */}
      {needsAttentionCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-900">
                {needsAttentionCount} transaction{needsAttentionCount !== 1 ? 's' : ''} with missing seller — needs manual review
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Items sold but seller wasn't found in Shopify metafields or database
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilter('needs_attention')}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Review
          </button>
        </div>
      )}

      {/* Shipping Alerts Banner */}
      {totalAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                {alerts?.overdue?.length || 0} item{(alerts?.overdue?.length || 0) !== 1 ? 's' : ''} overdue for shipping
                {(alerts?.labelNotShipped?.length || 0) > 0 && `, ${alerts.labelNotShipped.length} with label but not shipped`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilter('pending_shipping')}
            className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            View
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-stone-400" />
          <div className="flex bg-stone-100 rounded-lg p-0.5 flex-wrap">
            {[
              { value: 'all', label: 'All' },
              { value: 'needs_attention', label: '⚠️ Attention' },
              { value: 'needs_commission', label: '% Set Commission' },
              { value: 'pending_shipping', label: 'Pending Ship' },
              { value: 'in_transit', label: 'In Transit' },
              { value: 'delivered', label: 'Delivered' },
              { value: 'available', label: 'Available' },
              { value: 'paid', label: 'Paid' },
              { value: 'contested', label: 'Contested' }
            ].map(option => {
              const count = option.value === 'all' ? transactions.length : (pipeline[option.value]?.count || 0);
              return (
                <button
                  key={option.value}
                  onClick={() => { setFilter(option.value); setSelectedIds(new Set()); }}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    filter === option.value
                      ? 'bg-white text-stone-900 shadow-sm font-medium'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {option.label}
                  {count > 0 && option.value !== 'all' && (
                    <span className="ml-1 text-xs text-stone-400">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
          <span className="text-sm text-stone-400 ml-2">
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <button
            onClick={() => { setBulkNote(''); setBulkAdminNote(''); setShowBulkModal(true); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <DollarSign className="w-4 h-4" />
            Bulk Mark Paid ({selectedIds.size})
          </button>
        )}
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
                <th className="w-10 px-3 py-3">
                  {filteredTransactions.some(t => (t.payout_status || 'pending_shipping') === 'available') && (
                    <input
                      type="checkbox"
                      checked={
                        filteredTransactions
                          .filter(t => (t.payout_status || 'pending_shipping') === 'available')
                          .every(t => selectedIds.has(t.id))
                        && filteredTransactions.some(t => (t.payout_status || 'pending_shipping') === 'available')
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-stone-300 text-green-600 focus:ring-green-500"
                    />
                  )}
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Product</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Seller</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">PayPal</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Sale</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Payout</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Shipping</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredTransactions.map(tx => {
                const payoutStatus = tx.payout_status || (tx.status === 'paid' ? 'paid' : 'pending_shipping');
                const isAvailable = payoutStatus === 'available';
                const overdue = isShippingOverdue(tx);
                const daysLeft = getDaysUntilShipBy(tx);

                const isCancelled = payoutStatus === 'cancelled';
                return (
                  <tr key={tx.id} className={`hover:bg-stone-50/50 transition-colors ${isCancelled ? 'opacity-40 line-through' : payoutStatus === 'needs_attention' ? 'bg-red-50/50' : overdue ? 'bg-amber-50/50' : ''}`}>
                    {/* Checkbox */}
                    <td className="w-10 px-3 py-3">
                      {isAvailable && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                          className="w-4 h-4 rounded border-stone-300 text-green-600 focus:ring-green-500"
                        />
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-stone-600">
                      {formatDate(tx.created_at)}
                    </td>

                    {/* Order */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-stone-900">{tx.order_name || tx.order_id}</span>
                    </td>

                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="text-sm text-stone-900 truncate max-w-[180px]" title={tx.product_title}>
                        {tx.product_title}
                      </div>
                      {tx.listing_type === 'concierge' && (
                        <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">Concierge</span>
                      )}
                    </td>

                    {/* Seller */}
                    <td className="px-4 py-3">
                      {tx.seller ? (
                        <Link
                          to={`/admin/sellers/${tx.seller_id}`}
                          className="flex items-center gap-2 hover:text-stone-700 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">
                            {tx.seller.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="text-sm font-medium text-stone-900">{tx.seller.name || 'Unknown'}</div>
                        </Link>
                      ) : payoutStatus === 'needs_attention' ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-red-700">Seller Not Found</div>
                            {tx.admin_note && (
                              <div className="text-[10px] text-red-500 max-w-[160px] truncate" title={tx.admin_note}>
                                {tx.admin_note.replace('⚠️ SELLER NOT FOUND — ', '')}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-stone-400 italic">Unknown</span>
                      )}
                    </td>

                    {/* PayPal */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-stone-500 truncate max-w-[120px] block" title={tx.seller?.paypal_email || tx.seller?.email}>
                        {tx.seller?.paypal_email || tx.seller?.email || '-'}
                      </span>
                    </td>

                    {/* Sale */}
                    <td className="px-4 py-3 text-right">
                      {tx.discount_amount > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs text-stone-400 line-through">${(tx.sale_price + tx.discount_amount).toFixed(2)}</span>
                          <span className="text-sm font-medium text-stone-900">${(tx.sale_price || 0).toFixed(2)}</span>
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">-${tx.discount_amount.toFixed(2)} off</span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-stone-900">${(tx.sale_price || 0).toFixed(2)}</span>
                      )}
                    </td>

                    {/* Payout */}
                    <td className="px-4 py-3 text-right">
                      {tx.commission_rate == null ? (
                        <span className="text-xs text-orange-500 font-medium">Not set</span>
                      ) : (
                        <span className="text-sm font-bold text-green-600">${(tx.seller_payout || 0).toFixed(2)}</span>
                      )}
                    </td>

                    {/* Shipping */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const badge = getShippingBadge(tx.shipping_status);
                        const IconComponent = badge.icon;
                        return (
                          <div className="inline-flex flex-col items-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                              <IconComponent className="w-3 h-3" />
                              {badge.label}
                            </span>
                            {tx.tracking_number && (
                              <a
                                href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${tx.tracking_number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-600 hover:underline mt-0.5"
                              >
                                {tx.tracking_number.slice(-8)}
                              </a>
                            )}
                            {tx.shipping_label_url && !tx.tracking_number && (
                              <a
                                href={tx.shipping_label_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-stone-500 hover:text-stone-700 mt-0.5 flex items-center gap-0.5"
                              >
                                <Printer className="w-3 h-3" />
                                Label
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Payout Status */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const statusConfig = {
                          pending_shipping: { label: 'Pending Ship', color: 'bg-amber-100 text-amber-700', icon: Clock },
                          in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-700', icon: Truck },
                          delivered: { label: 'Delivered', color: 'bg-purple-100 text-purple-700', icon: Package },
                          available: { label: 'Available', color: 'bg-green-100 text-green-700', icon: DollarSign },
                          paid: { label: 'Paid Out', color: 'bg-stone-100 text-stone-700', icon: CheckCircle },
                          cancelled: { label: 'Cancelled', color: 'bg-stone-100 text-stone-400', icon: X },
                          contested: { label: 'Contested', color: 'bg-red-100 text-red-700', icon: X },
                          needs_attention: { label: 'Seller Not Found', color: 'bg-red-100 text-red-700', icon: AlertTriangle }
                        };
                        const config = statusConfig[payoutStatus] || statusConfig.pending_shipping;
                        const IconComponent = config.icon;

                        return (
                          <div className="inline-flex flex-col items-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${overdue ? 'bg-red-100 text-red-700' : config.color}`}>
                              <IconComponent className="w-3 h-3" />
                              {overdue ? 'OVERDUE' : config.label}
                            </span>
                            {payoutStatus === 'pending_shipping' && tx.ship_by && (
                              <span className={`text-[10px] mt-0.5 ${overdue ? 'text-red-600 font-medium' : daysLeft <= 2 ? 'text-amber-600' : 'text-stone-400'}`}>
                                {overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                              </span>
                            )}
                            {payoutStatus === 'delivered' && tx.contest_window_ends && (
                              <span className="text-[10px] text-purple-600 mt-0.5">
                                Review ends {formatDate(tx.contest_window_ends)}
                              </span>
                            )}
                            {payoutStatus === 'paid' && tx.paid_at && (
                              <span className="text-[10px] text-stone-400 mt-0.5">{formatDateTime(tx.paid_at)}</span>
                            )}
                            {payoutStatus === 'paid' && tx.seller_note && (
                              <span className="text-[10px] text-green-600">{tx.seller_note}</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {tx.commission_rate == null && (
                          <button
                            onClick={() => openCommissionModal(tx)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                          >
                            % Set
                          </button>
                        )}
                        {tx.commission_rate != null && (
                          <button
                            onClick={() => openCommissionModal(tx)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-stone-200 text-stone-400 rounded-lg hover:bg-stone-50 transition-colors"
                            title="Edit commission rate"
                          >
                            %
                          </button>
                        )}
                        {isAvailable && (
                          <button
                            onClick={() => openMarkPaidModal(tx)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <DollarSign className="w-3 h-3" />
                            Pay
                          </button>
                        )}
                        {payoutStatus !== 'paid' && !isAvailable && (
                          <button
                            onClick={() => openMarkPaidModal(tx, true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-stone-300 text-stone-500 rounded-lg hover:bg-stone-50 transition-colors"
                            title="Mark as paid without notifying seller"
                          >
                            <Check className="w-3 h-3" />
                            Silent Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick PayPal List for Available */}
      {(pipeline.available?.count || 0) > 0 && (filter === 'all' || filter === 'available') && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Ready for Payout
          </h3>
          <div className="space-y-2">
            {Object.entries(
              transactions
                .filter(t => t.payout_status === 'available' && t.seller)
                .reduce((acc, t) => {
                  const key = t.seller?.paypal_email || t.seller?.email || 'no-email';
                  if (!acc[key]) {
                    acc[key] = { email: t.seller?.paypal_email || t.seller?.email, name: t.seller?.name, total: 0, count: 0, ids: [] };
                  }
                  acc[key].total += t.seller_payout || 0;
                  acc[key].count++;
                  acc[key].ids.push(t.id);
                  return acc;
                }, {})
            ).map(([key, data]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-green-900">
                  {data.name || 'Unknown'} — <span className="text-green-700 font-mono text-xs">{data.email}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-green-900">
                    ${data.total.toFixed(2)} <span className="text-green-600 text-xs">({data.count} item{data.count !== 1 ? 's' : ''})</span>
                  </span>
                  <button
                    onClick={() => {
                      setSelectedIds(new Set(data.ids));
                      setBulkNote('');
                      setBulkAdminNote('');
                      setBulkSkipNotification(false);
                      setShowBulkModal(true);
                    }}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <DollarSign className="w-3 h-3" />
                    Pay All
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single Mark Paid Modal */}
      {showConfirmModal && markingPaid && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onKeyDown={handleKeyDown}>
            <div className="px-5 py-4 border-b border-stone-200">
              <h3 className="text-lg font-semibold text-stone-900">Confirm Payout</h3>
              <p className="text-sm text-stone-500 mt-1">Mark this transaction as paid</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-stone-50 rounded-lg p-4">
                <div className="text-sm text-stone-600 mb-2">{markingPaid.product_title}</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-stone-500">
                    <span>Listed price</span>
                    <span>${(markingPaid.sale_price + (markingPaid.discount_amount || 0)).toFixed(2)}</span>
                  </div>
                  {(markingPaid.discount_amount || 0) > 0 && (
                    <div className="flex items-center justify-between text-red-500">
                      <span>Discount</span>
                      <span>-${markingPaid.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-stone-500">
                    <span>Platform fee</span>
                    <span>-${(markingPaid.platform_fee ?? 10).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-700 font-medium border-t border-stone-200 pt-1 mt-1">
                    <span>Commission base</span>
                    <span>${Math.max(0, markingPaid.sale_price - (markingPaid.platform_fee ?? 10)).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-500">
                    <span>Commission ({markingPaid.commission_rate ?? 18}%)</span>
                    <span>-${(Math.max(0, markingPaid.sale_price - (markingPaid.platform_fee ?? 10)) * ((markingPaid.commission_rate ?? 18) / 100)).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-stone-300">
                  <span className="text-stone-700 font-medium">Seller Payout</span>
                  <span className="text-xl font-bold text-green-600">${markingPaid.seller_payout?.toFixed(2)}</span>
                </div>
                {markingPaid.seller && (
                  <div className="text-xs text-stone-400 mt-2">
                    To: {markingPaid.seller.name || markingPaid.seller.email}
                    {markingPaid.seller.paypal_email && ` (${markingPaid.seller.paypal_email})`}
                  </div>
                )}
              </div>
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
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Admin Note <span className="text-stone-400 font-normal">(internal only)</span>
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., PayPal transaction ID..."
                  rows={2}
                  className="w-full px-4 py-3 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipNotification}
                  onChange={(e) => setSkipNotification(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-stone-600 focus:ring-stone-500"
                />
                <span className="text-sm text-stone-600">Skip seller notification</span>
                <span className="text-xs text-stone-400">(no WhatsApp/email)</span>
              </label>
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
                className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${
                  skipNotification ? 'bg-stone-600 hover:bg-stone-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {skipNotification ? 'Mark Paid (Silent)' : 'Confirm & Notify'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Mark Paid Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-5 py-4 border-b border-stone-200">
              <h3 className="text-lg font-semibold text-stone-900">Bulk Mark as Paid</h3>
              <p className="text-sm text-stone-500 mt-1">{selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''} selected</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Summary by seller */}
              <div className="bg-stone-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="text-xs font-medium text-stone-500 uppercase mb-2">Payout Summary</div>
                {Object.entries(
                  transactions
                    .filter(t => selectedIds.has(t.id))
                    .reduce((acc, t) => {
                      const name = t.seller?.name || 'Unknown';
                      if (!acc[name]) acc[name] = { email: t.seller?.paypal_email || t.seller?.email || '', total: 0, items: [] };
                      acc[name].total += t.seller_payout || 0;
                      acc[name].items.push(t.product_title);
                      return acc;
                    }, {})
                ).map(([name, data]) => (
                  <div key={name} className="flex items-center justify-between py-1 text-sm">
                    <div>
                      <span className="font-medium text-stone-900">{name}</span>
                      <span className="text-stone-400 text-xs ml-2">{data.email}</span>
                    </div>
                    <span className="font-bold text-green-600">${data.total.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-stone-200 mt-2 pt-2 flex justify-between text-sm font-bold">
                  <span>Total</span>
                  <span className="text-green-600">
                    ${transactions.filter(t => selectedIds.has(t.id)).reduce((sum, t) => sum + (t.seller_payout || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Payment Method <span className="text-stone-400 font-normal">(shown to sellers)</span>
                </label>
                <input
                  type="text"
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="e.g., PayPal Batch, Bank Transfer..."
                  className="w-full px-4 py-3 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Admin Note <span className="text-stone-400 font-normal">(internal)</span>
                </label>
                <input
                  type="text"
                  value={bulkAdminNote}
                  onChange={(e) => setBulkAdminNote(e.target.value)}
                  placeholder="e.g., Batch #1234..."
                  className="w-full px-4 py-3 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkSkipNotification}
                  onChange={(e) => setBulkSkipNotification(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-stone-600 focus:ring-stone-500"
                />
                <span className="text-sm text-stone-600">Skip seller notifications</span>
                <span className="text-xs text-stone-400">(no WhatsApp/email)</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-stone-200 flex gap-3">
              <button
                onClick={() => { setShowBulkModal(false); setBulkSkipNotification(false); }}
                disabled={bulkSaving}
                className="flex-1 px-4 py-2.5 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkMarkPaid}
                disabled={bulkSaving}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${
                  bulkSkipNotification ? 'bg-stone-600 hover:bg-stone-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {bulkSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {bulkSkipNotification ? `Mark Paid Silent (${selectedIds.size})` : `Confirm & Notify (${selectedIds.size})`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Set Commission Modal */}
      {commissionTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-stone-200">
              <h3 className="text-lg font-semibold text-stone-900">Set Commission Rate</h3>
              <p className="text-sm text-stone-500 mt-1 truncate">{commissionTx.product_title}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-stone-50 rounded-lg p-4 text-sm space-y-1.5">
                <div className="flex justify-between text-stone-500">
                  <span>Sale price</span><span>${(commissionTx.sale_price || 0).toFixed(2)}</span>
                </div>
                {(commissionTx.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Discount</span><span>-${commissionTx.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-500">
                  <span>Platform fee</span><span>-${(commissionTx.platform_fee ?? 10).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium text-stone-700 border-t border-stone-200 pt-1.5">
                  <span>Commission base</span>
                  <span>${Math.max(0, (commissionTx.sale_price || 0) - (commissionTx.platform_fee ?? 10)).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Commission Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={commissionRate}
                  onChange={e => setCommissionRate(e.target.value)}
                  placeholder="e.g. 18"
                  className="w-full px-4 py-3 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>

              {commissionRate !== '' && !isNaN(parseFloat(commissionRate)) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="flex justify-between text-green-700">
                    <span>Commission ({commissionRate}%)</span>
                    <span>-${(Math.max(0, (commissionTx.sale_price || 0) - (commissionTx.platform_fee ?? 10)) * (parseFloat(commissionRate) / 100)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-green-800 mt-1">
                    <span>Seller payout</span>
                    <span>${(Math.max(0, (commissionTx.sale_price || 0) - (commissionTx.platform_fee ?? 10)) * ((100 - parseFloat(commissionRate)) / 100)).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={commissionNotify}
                  onChange={e => setCommissionNotify(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-orange-500 focus:ring-orange-400"
                />
                <span className="text-sm text-stone-600">Send seller WhatsApp + email with payout details</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-stone-200 flex gap-3">
              <button
                onClick={() => setCommissionTx(null)}
                disabled={commissionSaving}
                className="flex-1 px-4 py-2.5 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveCommission}
                disabled={commissionSaving || commissionRate === '' || isNaN(parseFloat(commissionRate))}
                className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {commissionSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {commissionNotify ? 'Save & Notify Seller' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
