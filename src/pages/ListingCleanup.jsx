import { useState, useCallback } from 'react';
import {
  Search, CheckCircle, XCircle, AlertTriangle, Loader2,
  RefreshCw, Tag, ChevronRight, ExternalLink, Wand2,
  DollarSign, AlertCircle, HelpCircle, Sparkles
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';
const SHOPIFY_STORE = import.meta.env.VITE_SHOPIFY_STORE_URL || 'ba42c1.myshopify.com';

// ─── helpers ──────────────────────────────────────────────────────────────────
function shopifyAdminUrl(id) {
  return `https://${SHOPIFY_STORE}/admin/products/${id}`;
}

function Badge({ children, color = 'gray' }) {
  const colors = {
    gray: 'bg-stone-100 text-stone-600',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

function TagPill({ tag, removed }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono mr-1 mb-1 ${
      removed ? 'bg-red-50 text-red-500 line-through' : 'bg-stone-100 text-stone-700'
    }`}>
      {tag}
    </span>
  );
}

// ─── Issue row card ────────────────────────────────────────────────────────────
function IssueCard({ item, type, onFix, onSkip, fixed, skipped }) {
  const [loading, setLoading] = useState(false);

  async function handleFix() {
    setLoading(true);
    await onFix(item);
    setLoading(false);
  }

  if (fixed) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-100 rounded-xl opacity-70">
        <CheckCircle className="w-4 h-4 text-green-500 flex-none" />
        <span className="text-sm text-green-800 font-medium">{item.title}</span>
        <span className="text-xs text-green-600 ml-auto">Fixed ✓</span>
      </div>
    );
  }

  if (skipped) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-stone-50 border border-stone-100 rounded-xl opacity-50">
        <XCircle className="w-4 h-4 text-stone-400 flex-none" />
        <span className="text-sm text-stone-500 line-through">{item.title}</span>
        <span className="text-xs text-stone-400 ml-auto">Skipped</span>
      </div>
    );
  }

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white hover:border-stone-300 transition-colors">
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        {item.image ? (
          <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-none border border-stone-100" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-stone-100 flex-none flex items-center justify-center">
            <Tag className="w-4 h-4 text-stone-400" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-sm font-semibold text-stone-900 truncate">{item.title}</p>
            <a
              href={shopifyAdminUrl(item.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-400 hover:text-stone-600 flex-none"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {item._status === 'draft' && <Badge color="gray">draft</Badge>}
          </div>

          {/* Issue-specific detail */}
          <IssueDetail item={item} type={type} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-none">
          <button
            onClick={() => onSkip(item.id, item.variantId)}
            className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 border border-stone-200 rounded-lg hover:border-stone-300 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleFix}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-stone-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Fix
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueDetail({ item, type }) {
  if (type === 'price_issues') {
    return (
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-none" />
        <span className="text-xs text-red-700">
          {item.type === 'zero_price' ? 'Price is $0 — needs manual fix in Shopify' : 'No price set'}
        </span>
      </div>
    );
  }

  if (type === 'default_title') {
    return (
      <div className="flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-none" />
        <span className="text-xs text-amber-700">Variant is "Default Title" — no size set. Fix manually in Shopify.</span>
      </div>
    );
  }

  if (type === 'size_needs_fix') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-stone-500">Size variant:</span>
        <code className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{item.rawSize}</code>
        <ChevronRight className="w-3 h-3 text-stone-400" />
        <code className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-semibold">{item.canonical}</code>
      </div>
    );
  }

  if (type === 'size_unknown') {
    return (
      <div className="flex items-center gap-2">
        <HelpCircle className="w-3.5 h-3.5 text-purple-500 flex-none" />
        <span className="text-xs text-purple-700">Unknown size: </span>
        <code className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{item.rawSize}</code>
        <span className="text-xs text-stone-400">— needs manual fix</span>
      </div>
    );
  }

  if (type === 'needs_tag_cleanup') {
    return (
      <div className="space-y-2">
        {/* Extracted info */}
        <div className="flex items-center gap-3 flex-wrap">
          {item.extracted.brand && (
            <span className="text-xs text-stone-600">
              <span className="text-stone-400">Brand:</span> <strong>{item.extracted.brand}</strong>
              {item.currentVendor !== item.extracted.brand && (
                <span className="text-blue-600"> → vendor</span>
              )}
            </span>
          )}
          {item.extracted.condition && (
            <span className="text-xs text-stone-600">
              <span className="text-stone-400">Condition:</span> {item.extracted.condition}
            </span>
          )}
          {item.extracted.category && (
            <span className="text-xs text-stone-600">
              <span className="text-stone-400">Category:</span> {item.extracted.category}
            </span>
          )}
          {item.extracted.gender && (
            <span className="text-xs text-stone-600">
              <span className="text-stone-400">Gender:</span> {item.extracted.gender}
            </span>
          )}
        </div>
        {/* Tags preview */}
        <div>
          <p className="text-[11px] text-stone-400 mb-1">Remove {item.chTags.length} CH-* tags, clean result:</p>
          <div className="flex flex-wrap gap-0.5">
            {item.proposedTags.map(t => (
              <span key={t} className="inline-block px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded font-mono">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'missing_brand') {
    return (
      <div className="flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-stone-400 flex-none" />
        <span className="text-xs text-stone-500">No brand tag or vendor — needs manual fix</span>
      </div>
    );
  }

  return null;
}

// ─── Tab definition ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'size_needs_fix', label: 'Size Fix', icon: '📐', color: 'amber', autoFixable: true,
    desc: 'Variant size not in canonical format (e.g. "Medium" → "M")' },
  { key: 'needs_tag_cleanup', label: 'Tag Cleanup', icon: '🏷️', color: 'blue', autoFixable: true,
    desc: 'Remove CH-* tags, add clean brand/condition/category tags' },
  { key: 'price_issues', label: 'Price Issues', icon: '🚨', color: 'red', autoFixable: false,
    desc: '$0 or missing price — fix manually in Shopify' },
  { key: 'default_title', label: 'No Size Set', icon: '⚠️', color: 'amber', autoFixable: false,
    desc: 'Variant is "Default Title" — fix manually in Shopify' },
  { key: 'size_unknown', label: 'Unknown Size', icon: '❓', color: 'purple', autoFixable: false,
    desc: 'Size format we cannot auto-map — fix manually' },
  { key: 'missing_brand', label: 'No Brand', icon: '🔍', color: 'gray', autoFixable: false,
    desc: 'No CH-brand tag and no vendor set' },
];

// ─── Main component ────────────────────────────────────────────────────────────
export default function ListingCleanup() {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('size_needs_fix');
  const [fixed, setFixed] = useState(new Set());
  const [skipped, setSkipped] = useState(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  function itemKey(i) { return i.variantId ? `${i.id}-${i.variantId}` : i.id; }

  async function runAudit() {
    setLoading(true);
    setError(null);
    setFixed(new Set());
    setSkipped(new Set());
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=audit-listings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Audit failed');
      setAuditData(d);
      // Auto-focus first tab with issues
      const firstIssueTab = TABS.find(t => (d.issues[t.key] || []).length > 0);
      if (firstIssueTab) setActiveTab(firstIssueTab.key);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const fixItem = useCallback(async (item) => {
    const tabKey = activeTab;
    try {
      if (tabKey === 'size_needs_fix') {
        const r = await fetch(`${API_URL}/api/admin-listings?action=fix-listing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('admin_token')}`
          },
          body: JSON.stringify({
            productId: item.id,
            variantId: item.variantId,
            fixType: 'size',
            newSize: item.canonical
          })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);

      } else if (tabKey === 'needs_tag_cleanup') {
        const r = await fetch(`${API_URL}/api/admin-listings?action=fix-listing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('admin_token')}`
          },
          body: JSON.stringify({
            productId: item.id,
            fixType: 'tags',
            newTags: item.proposedTags,
            newVendor: item.proposedVendor
          })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
      }

      // Use variantId as key for size fixes (same product can have multiple variants)
      const fixKey = (tabKey === 'size_needs_fix' && item.variantId) ? `${item.id}-${item.variantId}` : item.id;
      setFixed(prev => new Set([...prev, fixKey]));
    } catch (e) {
      alert(`Fix failed for ${item.title}: ${e.message}`);
    }
  }, [activeTab]);

  const skipItem = useCallback((id, variantId) => {
    const key = variantId ? `${id}-${variantId}` : id;
    setSkipped(prev => new Set([...prev, key]));
  }, []);

  async function bulkFixAll() {
    const tab = TABS.find(t => t.key === activeTab);
    if (!tab?.autoFixable) return;

    const items = (auditData?.issues[activeTab] || []).filter(
      i => !fixed.has(itemKey(i)) && !skipped.has(itemKey(i))
    );
    if (!items.length) return;

    if (!window.confirm(`Fix all ${items.length} items in "${tab.label}"? This will update Shopify.`)) return;

    setBulkRunning(true);
    setBulkProgress({ done: 0, total: items.length });

    for (let i = 0; i < items.length; i++) {
      await fixItem(items[i]);
      setBulkProgress({ done: i + 1, total: items.length });
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    setBulkRunning(false);
  }

  const currentItems = auditData?.issues[activeTab] || [];
  const filteredItems = search
    ? currentItems.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
    : currentItems;

  const pendingCount = filteredItems.filter(i => !fixed.has(itemKey(i)) && !skipped.has(itemKey(i))).length;
  const fixedCount = filteredItems.filter(i => fixed.has(itemKey(i))).length;

  const currentTab = TABS.find(t => t.key === activeTab);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Listing Cleanup</h1>
          <p className="text-stone-500 text-sm mt-0.5">
            Audit and fix all Shopify listings — sizes, tags, brands
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 font-medium text-sm"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> {auditData ? 'Re-scan' : 'Run Audit'}</>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-none" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Pre-audit state */}
      {!auditData && !loading && (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wand2 className="w-8 h-8 text-stone-400" />
          </div>
          <h2 className="text-lg font-semibold text-stone-900 mb-2">Ready to clean up listings</h2>
          <p className="text-stone-500 text-sm max-w-sm mx-auto mb-6">
            Scans all active and draft products in Shopify. Checks sizes, tags, brands, and prices.
            Takes about 10–15 seconds.
          </p>
          <button
            onClick={runAudit}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-xl hover:bg-stone-800 transition-colors font-medium text-sm"
          >
            <Sparkles className="w-4 h-4" />
            Run Audit
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-stone-400 mx-auto mb-4" />
          <p className="text-stone-600 font-medium">Scanning all listings…</p>
          <p className="text-stone-400 text-sm mt-1">Fetching active + draft products from Shopify</p>
        </div>
      )}

      {/* Results */}
      {auditData && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-3xl font-bold text-stone-900">{auditData.summary.total}</p>
              <p className="text-xs text-stone-500 mt-1 font-medium uppercase tracking-wide">Total listings</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-3xl font-bold text-green-700">{auditData.summary.clean}</p>
              <p className="text-xs text-green-600 mt-1 font-medium uppercase tracking-wide">Clean ✓</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-3xl font-bold text-amber-700">{auditData.summary.has_issues}</p>
              <p className="text-xs text-amber-600 mt-1 font-medium uppercase tracking-wide">Need attention</p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex overflow-x-auto border-b border-stone-100">
              {TABS.map(tab => {
                const count = (auditData.issues[tab.key] || []).length;
                const doneCount = (auditData.issues[tab.key] || []).filter(i => fixed.has(i.id)).length;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                    className={`flex-none flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-black text-black'
                        : 'border-transparent text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {count > 0 ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        doneCount === count
                          ? 'bg-green-100 text-green-700'
                          : isActive
                          ? 'bg-black text-white'
                          : 'bg-stone-100 text-stone-600'
                      }`}>
                        {doneCount === count ? '✓' : `${count - doneCount}`}
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="p-4">
              {/* Tab header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-stone-600">{currentTab?.desc}</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {pendingCount} remaining · {fixedCount} fixed this session
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="pl-8 pr-3 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 w-36"
                    />
                  </div>
                  {/* Bulk fix */}
                  {currentTab?.autoFixable && pendingCount > 0 && (
                    <button
                      onClick={bulkFixAll}
                      disabled={bulkRunning}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 text-white text-xs font-medium rounded-lg hover:bg-black transition-colors disabled:opacity-50"
                    >
                      {bulkRunning ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {bulkProgress.done}/{bulkProgress.total}</>
                      ) : (
                        <><Wand2 className="w-3.5 h-3.5" /> Fix all {pendingCount}</>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Items */}
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-stone-600 font-medium">
                    {search ? 'No matches' : 'No issues in this category'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map(item => (
                    <IssueCard
                      key={`${activeTab}-${item.id}-${item.variantId || ''}`}
                      item={item}
                      type={activeTab}
                      onFix={fixItem}
                      onSkip={skipItem}
                      fixed={fixed.has(item.variantId ? `${item.id}-${item.variantId}` : item.id)}
                      skipped={skipped.has(item.variantId ? `${item.id}-${item.variantId}` : item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
