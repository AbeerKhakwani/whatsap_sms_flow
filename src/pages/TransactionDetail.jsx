import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Package, Truck, CheckCircle, Clock, DollarSign,
  ExternalLink, User, Mail, Phone, AlertTriangle, Zap, StickyNote
} from 'lucide-react';
import { calculateSellerPayout } from '../../lib/payout-calculation';
import BuyerAcceptedBadge from '../components/BuyerAcceptedBadge';

const API_URL = import.meta.env.VITE_API_URL || '';
const money = n => `$${(Number(n) || 0).toFixed(2)}`;

// Lifecycle steps, in order. Each resolves done/current from the transaction.
function buildTimeline(tx) {
  const ship = tx.shipping_status;
  const pay = tx.payout_status;
  const shipped = ['shipped', 'delivered'].includes(ship);
  const delivered = ship === 'delivered' || !!tx.delivered_at;
  const confirmed = tx.review_status === 'confirmed' || ['available', 'paid'].includes(pay);
  const available = ['available', 'paid'].includes(pay);
  const paid = pay === 'paid';
  return [
    { key: 'sold', label: 'Sold', done: true, at: tx.created_at },
    { key: 'fulfilled', label: 'Label / fulfilled', done: ['label_created', 'shipped', 'delivered'].includes(ship) || ship === 'concierge' },
    { key: 'shipped', label: 'Shipped', done: shipped },
    { key: 'delivered', label: 'Delivered', done: delivered, at: tx.delivered_at },
    { key: 'confirmed', label: 'Buyer confirmed / window passed', done: confirmed },
    { key: 'available', label: 'Ready to pay', done: available },
    { key: 'paid', label: 'Paid', done: paid, at: tx.paid_at },
  ];
}

const PAYOUT_BADGE = {
  needs_attention: ['Needs attention', 'bg-red-100 text-red-700'],
  needs_commission: ['Needs commission', 'bg-amber-100 text-amber-700'],
  pending_shipping: ['Pending shipping', 'bg-stone-100 text-stone-600'],
  in_transit: ['In transit', 'bg-blue-100 text-blue-700'],
  delivered: ['Delivered', 'bg-indigo-100 text-indigo-700'],
  available: ['Ready to pay', 'bg-green-100 text-green-700'],
  paid: ['Paid', 'bg-emerald-600 text-white'],
  cancelled: ['Cancelled', 'bg-stone-200 text-stone-500'],
};

export default function TransactionDetail() {
  const { id } = useParams();
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Mark-paid modal
  const [showPaid, setShowPaid] = useState(false);
  const [payMethod, setPayMethod] = useState('');
  const [payHandle, setPayHandle] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [skipNotify, setSkipNotify] = useState(false);

  // Freeform notes (editable any time, persists on the transaction)
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Set-commission
  const [rateInput, setRateInput] = useState('');
  // Concierge shipping
  const [tracking, setTracking] = useState('');
  // Edit receipt
  const [showEdit, setShowEdit] = useState(false);
  const [editRate, setEditRate] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editOverride, setEditOverride] = useState('');

  useEffect(() => { fetchTx(); }, [id]);

  async function fetchTx() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=transaction&id=${id}`);
      const data = await res.json();
      if (data.success) {
        setTx(data.transaction);
        const s = data.transaction.seller || {};
        setPayMethod(s.payout_method || (s.payment_provider ? s.payment_provider : 'Zelle'));
        setPayHandle(s.payment_handle || s.paypal_email || '');
        setRateInput(data.transaction.commission_rate != null ? String(data.transaction.commission_rate) : '');
        setNotes(data.transaction.payout_notes || '');
        setSavedNotes(data.transaction.payout_notes || '');
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function post(action, body) {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) { alert('Failed: ' + (data.error || 'Unknown error')); return false; }
      await fetchTx();
      return true;
    } catch (e) { alert('Error: ' + e.message); return false; }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8 text-stone-500">Loading…</div>;
  if (!tx) return <div className="p-8 text-stone-500">Transaction not found. <Link to="/admin/transactions" className="text-indigo-600">Back</Link></div>;

  const seller = tx.seller || {};
  const fee = tx.platform_fee ?? 10;
  const bd = calculateSellerPayout({ grossPrice: tx.sale_price || 0, commissionRate: tx.commission_rate, platformFee: fee });
  const listedPrice = (tx.sale_price || 0) + (tx.discount_amount || 0);
  const [badgeLabel, badgeClass] = PAYOUT_BADGE[tx.payout_status] || [tx.payout_status, 'bg-stone-100 text-stone-600'];
  const timeline = buildTimeline(tx);
  const canRelease = tx.payout_status === 'delivered';
  const canMarkPaid = tx.payout_status !== 'paid' && tx.payout_status !== 'cancelled';
  const needsCommission = tx.commission_rate == null;
  // Concierge state is carried by shipping_status (set from the Shopify tag at sale),
  // not listing_type (a separate, often-unset metafield).
  const isConcierge = tx.shipping_status === 'concierge' || tx.listing_type === 'concierge';
  const conciergeNeedsShip = tx.shipping_status === 'concierge';
  // Manual delivery fallback (e.g. concierge on a carrier Shippo can't track).
  const canMarkDelivered = ['shipped', 'label_created', 'in_transit'].includes(tx.shipping_status) || tx.payout_status === 'in_transit';

  async function markPaid() {
    // Fold any note typed in the modal into the persisted notes (newline-appended).
    const mergedNotes = [savedNotes, payNotes].map(s => (s || '').trim()).filter(Boolean).join('\n');
    const ok = await post('mark-paid', {
      transactionId: tx.id,
      payoutProvider: seller.payment_provider || 'zelle_manual',
      payoutMethod: payMethod || undefined,
      payoutHandle: payHandle || undefined,
      payoutReference: payReference || undefined,
      payoutNotes: mergedNotes || undefined,
      skipNotification: skipNotify || undefined,
      adminEmail: localStorage.getItem('admin_email') || undefined,
    });
    if (ok) { setShowPaid(false); setPayNotes(''); setPayReference(''); }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=update-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: tx.id, payoutNotes: notes }),
      });
      const data = await res.json();
      if (data.success) setSavedNotes(notes);
      else alert('Failed to save notes: ' + (data.error || 'Unknown error'));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSavingNotes(false); }
  }

  function openEdit() {
    setEditRate(tx.commission_rate != null ? String(tx.commission_rate) : '');
    setEditDiscount(tx.discount_amount != null ? String(tx.discount_amount) : '');
    setEditOverride('');
    setShowEdit(true);
  }

  async function saveReceipt() {
    const ok = await post('update-receipt', {
      transactionId: tx.id,
      commissionRate: editRate !== '' ? editRate : undefined,
      discount: editDiscount !== '' ? editDiscount : undefined,
      payoutOverride: editOverride !== '' ? editOverride : undefined,
      adminEmail: localStorage.getItem('admin_email') || undefined,
    });
    if (ok) setShowEdit(false);
  }

  // Live preview for the edit modal
  const previewPayout = editOverride !== ''
    ? parseFloat(editOverride)
    : calculateSellerPayout({ grossPrice: tx.sale_price || 0, commissionRate: editRate !== '' ? parseFloat(editRate) : null, platformFee: fee }).sellerPayout;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to="/admin/transactions" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> All transactions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          {tx.product_image && <img src={tx.product_image} alt="" className="w-16 h-16 rounded-lg object-cover border border-stone-200" />}
          <div>
            <h1 className="text-xl font-semibold text-stone-900">{tx.product_title}</h1>
            <p className="text-sm text-stone-500">{tx.order_name} · sold {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}</p>
            <div className="mt-1.5">
              <BuyerAcceptedBadge reviewRespondedAt={tx.review_responded_at} payoutStatus={tx.payout_status} />
            </div>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${badgeClass}`}>{badgeLabel}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2"><Clock className="w-4 h-4" /> Lifecycle</h2>
          <ol className="space-y-3">
            {timeline.map(step => (
              <li key={step.key} className="flex items-center gap-3">
                {step.done
                  ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  : <div className="w-5 h-5 rounded-full border-2 border-stone-300 shrink-0" />}
                <span className={step.done ? 'text-stone-800' : 'text-stone-400'}>{step.label}</span>
                {step.at && <span className="text-xs text-stone-400 ml-auto">{new Date(step.at).toLocaleDateString()}</span>}
              </li>
            ))}
          </ol>
          {tx.contest_status === 'open' && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-2">
              <AlertTriangle className="w-4 h-4" /> Buyer raised an issue — payout on hold.
            </div>
          )}
        </div>

        {/* Price breakdown */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Payout breakdown</h2>
            {tx.payout_status !== 'paid' && (
              <button onClick={openEdit} className="text-xs text-indigo-600 hover:underline">Edit</button>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            <Row label="Listed price" value={money(listedPrice)} />
            {(tx.discount_amount || 0) > 0 && <Row label="Discount" value={`-${money(tx.discount_amount)}`} red />}
            <Row label="Shipping fee" value={`-${money(fee)}`} />
            <Row label="Net (commission base)" value={money(bd.commissionBase)} border bold />
            {needsCommission
              ? <Row label="Commission" value="not set" amber />
              : <Row label={`Commission (${tx.commission_rate}%)`} value={`-${money(bd.commissionAmount)}`} />}
            <Row label="Seller payout" value={tx.seller_payout != null ? money(tx.seller_payout) : '—'} border green big />
          </div>
        </div>

        {/* Seller */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Seller</h2>
          {seller.id ? (
            <div className="space-y-1.5 text-sm text-stone-700">
              <div className="flex items-center gap-2"><User className="w-4 h-4 text-stone-400" /> <Link to={`/admin/sellers/${seller.id}`} className="text-indigo-600 hover:underline">{seller.name || 'Unnamed'}</Link></div>
              {seller.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-stone-400" /> {seller.email}</div>}
              {seller.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-stone-400" /> {seller.phone}</div>}
              <div className="text-xs text-stone-500 pt-2">
                Payout on file: {seller.payment_handle || seller.paypal_email || '—'} {seller.payment_provider ? `(${seller.payment_provider})` : ''}
              </div>
            </div>
          ) : <p className="text-sm text-red-600">⚠️ No seller linked.</p>}
        </div>

        {/* Shipping */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping</h2>
          <div className="space-y-1.5 text-sm text-stone-700">
            <div>Status: <span className="font-medium">{tx.shipping_status || '—'}</span></div>
            {tx.tracking_number && <div>Tracking: {tx.carrier || ''} {tx.tracking_number}</div>}
            {tx.shipping_label_url && <a href={tx.shipping_label_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600"><ExternalLink className="w-3 h-3" /> Label</a>}
            {tx.delivered_at && <div className="text-xs text-stone-500">Delivered {new Date(tx.delivered_at).toLocaleDateString()}</div>}
            {isConcierge && <div className="text-xs text-amber-700">★ Concierge (Phirstory ships)</div>}
          </div>
        </div>
      </div>

      {/* Notes — freeform, editable any time, saved to the transaction */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2"><StickyNote className="w-4 h-4" /> Notes</h2>
          {notes !== savedNotes && (
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="text-xs px-3 py-1.5 bg-stone-800 text-white rounded-lg hover:bg-stone-900 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {savingNotes ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              Save
            </button>
          )}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything you want to remember about this payout — reference numbers, who you spoke to, why the amount changed…"
          className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50 resize-y"
        />
        <p className="text-xs text-stone-400 mt-1.5">Internal only — never shown to the seller.</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mt-6">
        {conciergeNeedsShip && (
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2">
            <Truck className="w-4 h-4 text-violet-600" />
            <input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Tracking #"
              className="w-40 px-2 py-1.5 text-sm border border-stone-300 rounded" />
            <button disabled={busy || !tracking.trim()} onClick={() => post('mark-concierge-shipped', { transactionId: tx.id, trackingNumber: tracking.trim() })}
              className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded disabled:opacity-50">Mark shipped + fulfill</button>
          </div>
        )}
        {needsCommission && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <input type="number" value={rateInput} onChange={e => setRateInput(e.target.value)} placeholder="Commission %"
              className="w-28 px-2 py-1.5 text-sm border border-stone-300 rounded" />
            <button disabled={busy || rateInput === ''} onClick={() => post('update-transaction', { transactionId: tx.id, commissionRate: parseFloat(rateInput), notify: true })}
              className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded disabled:opacity-50">Set commission</button>
          </div>
        )}
        {canMarkDelivered && (
          <button disabled={busy} onClick={() => post('mark-delivered', { transactionId: tx.id })}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50">
            <Truck className="w-4 h-4" /> Mark delivered
          </button>
        )}
        {canRelease && (
          <button disabled={busy} onClick={() => post('release-payout', { transactionId: tx.id })}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50">
            <Zap className="w-4 h-4" /> Release now (skip window)
          </button>
        )}
        {canMarkPaid && (
          <button disabled={busy || needsCommission} onClick={() => setShowPaid(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-700 text-white rounded-lg disabled:opacity-50">
            <CheckCircle className="w-4 h-4" /> Mark as paid
          </button>
        )}
        {tx.payout_status === 'paid' && (
          <div className="text-sm text-emerald-700 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" /> Paid {tx.paid_at ? new Date(tx.paid_at).toLocaleDateString() : ''} {tx.payout_method ? `via ${tx.payout_method}` : ''} {tx.payout_handle ? `(${tx.payout_handle})` : ''}{tx.payout_reference ? ` · ref ${tx.payout_reference}` : ''}
          </div>
        )}
      </div>

      {/* Mark-paid modal */}
      {showPaid && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowPaid(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Confirm payout</h3>
            <p className="text-sm text-stone-500 mb-4">Paying <strong>{money(tx.seller_payout)}</strong> to {seller.name || 'seller'}.</p>
            <label className="block text-sm text-stone-600 mb-1">Method</label>
            <input value={payMethod} onChange={e => setPayMethod(e.target.value)} placeholder="Zelle"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg mb-3" />
            <label className="block text-sm text-stone-600 mb-1">Paid to (handle)</label>
            <input value={payHandle} onChange={e => setPayHandle(e.target.value)} placeholder="email or phone"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg mb-3" />
            <label className="block text-sm text-indigo-600 mb-1">Confirmation # <span className="text-stone-400">— optional, attaches to this payout</span></label>
            <input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="Zelle / Interac reference"
              className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg mb-3 focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
            <label className="block text-sm text-stone-600 mb-1">Note <span className="text-stone-400">— internal, optional</span></label>
            <textarea value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2} placeholder="e.g. Zelle confirmation #, anything to remember"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg mb-3 bg-stone-50 resize-y" />
            <label className="flex items-center gap-2 text-sm text-stone-600 mb-4">
              <input type="checkbox" checked={skipNotify} onChange={e => setSkipNotify(e.target.checked)} /> Don't notify the seller
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPaid(false)} className="px-4 py-2 text-sm text-stone-600">Cancel</button>
              <button disabled={busy} onClick={markPaid} className="px-4 py-2 text-sm bg-emerald-700 text-white rounded-lg disabled:opacity-50">Confirm paid</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit receipt modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Edit receipt</h3>
            <p className="text-sm text-stone-500 mb-4">Corrects the transaction, resyncs Shopify, and logs a note.</p>
            <label className="block text-sm text-stone-600 mb-1">Commission %</label>
            <input type="number" value={editRate} onChange={e => setEditRate(e.target.value)} placeholder="e.g. 40"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg mb-3" />
            <label className="block text-sm text-stone-600 mb-1">Discount ($)</label>
            <input type="number" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} placeholder="0"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg mb-3" />
            <label className="block text-sm text-stone-600 mb-1">Payout override ($) <span className="text-stone-400">— optional, skips the math</span></label>
            <input type="number" value={editOverride} onChange={e => setEditOverride(e.target.value)} placeholder="leave blank to auto-calculate"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg mb-3" />
            <div className="flex justify-between text-sm bg-stone-50 rounded-lg p-3 mb-4">
              <span className="text-stone-600">New payout</span>
              <span className="font-semibold text-green-600">{previewPayout != null && !Number.isNaN(previewPayout) ? money(previewPayout) : '—'}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm text-stone-600">Cancel</button>
              <button disabled={busy} onClick={saveReceipt} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50">Save receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, red, green, amber, bold, big, border }) {
  return (
    <div className={`flex justify-between ${border ? 'border-t border-stone-200 pt-1.5 mt-1.5' : ''}`}>
      <span className={bold ? 'font-medium text-stone-700' : 'text-stone-500'}>{label}</span>
      <span className={`${red ? 'text-red-600' : ''} ${green ? 'text-green-600 font-bold' : ''} ${amber ? 'text-amber-600' : ''} ${big ? 'text-lg' : ''} ${bold && !green ? 'font-medium text-stone-900' : ''}`}>{value}</span>
    </div>
  );
}
