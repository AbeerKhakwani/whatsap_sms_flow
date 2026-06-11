import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const FILTERS = [
  { key: 'all',               label: 'All' },
  { key: 'price_updated',     label: 'Price Changes' },
  { key: 'seller_revised',    label: 'Revisions' },
  { key: 'listing_approved',  label: 'Approvals' },
  { key: 'listing_rejected',  label: 'Rejections' },
  { key: 'revision_requested',label: 'Revision Requests' },
  { key: 'item_sold',         label: 'Sales' },
  { key: 'new_offer',         label: 'Offers' },
  { key: 'payout_sent',       label: 'Payouts' },
  { key: 'inbound_message',   label: 'Messages' },
];

export function activityConfig(item) {
  const meta = item.metadata || {};
  const sellerName = item.seller?.name || item.seller?.email || 'Unknown seller';
  const map = {
    price_updated:        { icon: '💰', color: 'bg-amber-50 text-amber-700',    label: `${sellerName} updated price of "${meta.productTitle || 'listing'}" → $${parseFloat(meta.newPrice || 0).toFixed(2)} (payout $${parseFloat(meta.payout || 0).toFixed(2)})` },
    seller_revised:       { icon: '✏️', color: 'bg-blue-50 text-blue-700',      label: `${sellerName} revised "${meta.productTitle || 'listing'}" — ready for re-review` },
    listing_approved:     { icon: '✅', color: 'bg-green-50 text-green-700',    label: `Approved: "${meta.productTitle || 'listing'}" for ${sellerName}` },
    listing_rejected:     { icon: '❌', color: 'bg-red-50 text-red-700',        label: `Rejected: "${meta.productTitle || 'listing'}" for ${sellerName}` },
    revision_requested:   { icon: '🔄', color: 'bg-orange-50 text-orange-700', label: `Revision requested for "${meta.productTitle || 'listing'}" — ${sellerName}` },
    item_sold:            { icon: '🎉', color: 'bg-purple-50 text-purple-700',  label: `Sold: "${meta.productTitle || 'item'}" for $${meta.salePrice || '?'} — payout $${meta.payout || '?'}` },
    new_offer:            { icon: '💬', color: 'bg-indigo-50 text-indigo-700',  label: `New offer $${meta.amount || '?'} on listing — ${sellerName}` },
    offer_accepted:       { icon: '🤝', color: 'bg-teal-50 text-teal-700',     label: `Offer accepted on "${meta.productTitle || 'listing'}"` },
    payout_sent:          { icon: '💸', color: 'bg-gray-50 text-gray-700',     label: `Payout sent to ${sellerName}` },
    inbound_message:      { icon: '📩', color: 'bg-rose-50 text-rose-700',     label: `${sellerName} messaged: "${item.content || ''}"` },
  };
  return map[item.context] || { icon: '📋', color: 'bg-gray-50 text-gray-700', label: item.subject || item.content || item.context };
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ActivityFeed() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  useEffect(() => {
    fetchActivity();
    localStorage.setItem('activity_last_seen', new Date().toISOString());
  }, []);

  async function fetchActivity() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin-listings?action=activity&limit=200');
      const data = await res.json();
      if (data.success) setActivity(data.activity || []);
    } catch {}
    setLoading(false);
  }

  const filtered = filter === 'all' ? activity : activity.filter(a => a.context === filter);
  const paginated = filtered.slice(0, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
          <p className="text-sm text-gray-500 mt-0.5">All seller events and admin actions</p>
        </div>
        <button onClick={fetchActivity} className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(0); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filter === f.key
                ? 'bg-stone-800 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1.5 text-[10px] opacity-70">
                {activity.filter(a => a.context === f.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No activity yet</div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {paginated.map((item) => {
                const cfg = activityConfig(item);
                return (
                  <div key={item.id} className="px-5 py-4 flex items-start gap-4 hover:bg-gray-50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5 ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{cfg.label}</p>
                      {item.seller?.id && (
                        <Link
                          to={`/admin/sellers/${item.seller.id}`}
                          className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                        >
                          {item.seller.name || item.seller.email}
                        </Link>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5 whitespace-nowrap">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
            {filtered.length > paginated.length && (
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Load more ({filtered.length - paginated.length} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
