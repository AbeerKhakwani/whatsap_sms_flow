import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, DollarSign, Users, Package, AlertCircle, Sparkles } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

const PAYOUT_STATUS_LABEL = {
  pending_shipping: 'Awaiting Ship',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  available: 'Ready to Pay',
  paid: 'Paid',
  needs_attention: 'Needs Attention',
  needs_commission: 'Commission Unset',
};

const PAYOUT_STATUS_COLOR = {
  pending_shipping: 'bg-yellow-100 text-yellow-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-purple-100 text-purple-700',
  available: 'bg-green-100 text-green-700',
  paid: 'bg-stone-100 text-stone-600',
  needs_attention: 'bg-red-100 text-red-700',
  needs_commission: 'bg-orange-100 text-orange-700',
};

const EXAMPLE_QUERIES = [
  'Find all transactions for Amna',
  'How many listings from Suffuse',
  'Pending commission items',
  'Concierge orders this month',
  'Orders with discounts',
  'Sellers ready for payout',
];

export default function SearchPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [interpretation, setInterpretation] = useState('');
  const [error, setError] = useState('');

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults(null);
      setInterpretation('');
      setError('');
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const runSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) return;
    setLoading(true);
    setError('');
    setResults(null);
    setInterpretation('');
    try {
      const res = await fetch(`${API_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ query: q.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.results);
      setInterpretation(data.interpretation || q);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && query.trim().length >= 2) {
      runSearch(query);
    }
  }

  function useExample(q) {
    setQuery(q);
    runSearch(q);
  }

  const totalResults = results
    ? (results.sellers?.length || 0) + (results.transactions?.length || 0)
    : 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[75vh]">

        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-stone-100">
          {loading
            ? <Loader2 className="w-5 h-5 text-stone-400 animate-spin flex-shrink-0" />
            : <Search className="w-5 h-5 text-stone-400 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search anything… press Enter to run"
            className="flex-1 text-sm text-stone-800 placeholder:text-stone-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults(null); setError(''); }} className="text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-stone-400 border border-stone-200 rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Interpretation banner */}
          {interpretation && !loading && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-xs text-stone-500">
              <Sparkles className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
              <span>{interpretation}</span>
              <span className="ml-auto text-stone-400">
                {totalResults} result{totalResults !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="divide-y divide-stone-100">

              {/* Sellers */}
              {results.sellers?.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 px-4 py-2 bg-stone-50">
                    <Users className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                      Sellers ({results.sellers.length})
                    </span>
                  </div>
                  {results.sellers.map((seller) => (
                    <button
                      key={seller.id}
                      onClick={() => { navigate(`/admin/sellers/${seller.id}`); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-semibold text-xs flex-shrink-0">
                        {seller.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{seller.name}</p>
                        <p className="text-xs text-stone-400 truncate">{seller.email}</p>
                      </div>
                      <span className="text-xs text-stone-400">View →</span>
                    </button>
                  ))}
                </section>
              )}

              {/* Transactions */}
              {results.transactions?.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 px-4 py-2 bg-stone-50">
                    <DollarSign className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                      Transactions ({results.transactions.length})
                    </span>
                  </div>
                  {results.transactions.map((tx) => (
                    <button
                      key={tx.id}
                      onClick={() => { navigate('/admin/transactions'); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 text-left transition-colors"
                    >
                      {tx.product_image
                        ? <img src={tx.product_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-stone-100" />
                        : <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-stone-400" />
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-stone-800 truncate">{tx.product_title}</p>
                          {tx.listing_type === 'concierge' && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">Concierge</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-stone-400">{tx.sellers?.name || '—'}</span>
                          {tx.order_name && <span className="text-xs text-stone-300">· {tx.order_name}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-sm font-semibold text-stone-700">
                          ${(tx.seller_payout || 0).toFixed(2)}
                        </span>
                        {tx.payout_status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PAYOUT_STATUS_COLOR[tx.payout_status] || 'bg-stone-100 text-stone-600'}`}>
                            {PAYOUT_STATUS_LABEL[tx.payout_status] || tx.payout_status}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </section>
              )}

              {/* Empty state */}
              {totalResults === 0 && !loading && (
                <div className="py-12 text-center">
                  <Search className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-stone-400 text-sm">No results found</p>
                  <p className="text-stone-300 text-xs mt-1">Try a different search term</p>
                </div>
              )}
            </div>
          )}

          {/* Example queries — shown when no search yet */}
          {!results && !loading && !error && (
            <div className="px-4 py-4">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">Try searching for…</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => useExample(q)}
                    className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-3 py-1.5 rounded-full transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="px-4 py-6 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-stone-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-stone-100 rounded w-3/4" />
                    <div className="h-2 bg-stone-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-stone-100 bg-stone-50 flex items-center gap-4 text-[10px] text-stone-400">
          <span><kbd className="font-mono">↵</kbd> search</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto flex items-center gap-1"><Sparkles className="w-3 h-3" /> Powered by Claude</span>
        </div>
      </div>
    </div>
  );
}
