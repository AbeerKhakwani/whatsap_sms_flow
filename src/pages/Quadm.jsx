import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  RefreshCw, Loader2, Search, X, StickyNote, Package,
  CheckCircle2, PauseCircle, Tag as TagIcon, AlertCircle,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

// Boxes are shipped — their contents are fixed. Only these can still be changed.
const LOCKED = ['Box 1', 'Box 2'];

const STATUSES = [
  { id: 'avail', label: 'Available', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  { id: 'held',  label: 'Held',      cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  { id: 'sold',  label: 'Sold',      cls: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
];

const money = n => (n == null ? null : `$${Number(n).toLocaleString('en-US')}`);
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_token')}` });

function stamp() {
  const d = new Date();
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ` +
         `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function Quadm() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState({});
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);   // product id
  const [draft, setDraft] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/quadm?action=all${refresh ? '&refresh=1' : ''}`, { headers: auth() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setState(data.state || {});
      setContainers(data.containers || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const st = useCallback(
    id => state[id] || { container: null, status: 'avail', notes: [] },
    [state]
  );

  async function patch(id, changes) {
    const before = st(id);
    const next = { ...before, ...changes };
    setState(s => ({ ...s, [id]: next }));       // optimistic
    setSaving(s => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`${API_URL}/api/quadm?action=state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({
          productId: id,
          actor: localStorage.getItem('admin_name') || localStorage.getItem('admin_email') || '',
          ...changes,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { row } = await res.json();
      setState(s => ({ ...s, [id]: row }));
    } catch (e) {
      setState(s => ({ ...s, [id]: before }));   // roll back
      setError(`Could not save: ${e.message}`);
    } finally {
      setSaving(s => { const c = { ...s }; delete c[id]; return c; });
    }
  }

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keep = items.filter(i => {
      const s = st(i.id);
      if (filter !== 'all' && s.status !== filter) return false;
      if (!needle) return true;
      const hay = [i.name, i.designer, i.size, i.colour, i.material, i.cond, s.container,
        ...(s.notes || []).map(n => n.t)].join(' ').toLowerCase();
      return hay.includes(needle);
    });
    const by = new Map();
    for (const i of keep) {
      const c = st(i.id).container || 'Unassigned';
      if (!by.has(c)) by.set(c, []);
      by.get(c).push(i);
    }
    const order = [...LOCKED, ...containers, 'Unassigned'];
    return [...by.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]), bi = order.indexOf(b[0]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  }, [items, st, q, filter, containers]);

  const tally = useMemo(() => {
    let a = 0, h = 0, s = 0, val = 0;
    for (const i of items) {
      const k = st(i.id).status;
      if (k === 'held') h++;
      else if (k === 'sold') s++;
      else { a++; if (i.price) val += i.price; }
    }
    return { a, h, s, val };
  }, [items, st]);

  const openItem = open ? items.find(i => i.id === open) : null;
  const allContainers = [...LOCKED, ...containers];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading from Shopify…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QUADM 2026</h1>
          <p className="text-gray-500 text-sm">
            Everything tagged <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">quadm</code> in Shopify.
            Tag a product there and it appears here.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing' : 'Refresh from Shopify'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-800 text-sm ring-1 ring-rose-600/20">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-none" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { n: tally.a, l: 'available', c: 'text-emerald-700' },
          { n: tally.h, l: 'held', c: 'text-amber-700' },
          { n: tally.s, l: 'sold', c: 'text-rose-700' },
          { n: money(tally.val), l: 'on the rail', c: 'text-gray-900' },
        ].map(t => (
          <div key={t.l} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-2xl font-bold tabular-nums ${t.c}`}>{t.n}</div>
            <div className="text-xs text-gray-500 mt-0.5">{t.l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search item, designer, colour, notes…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
        </div>
        <div className="flex gap-1">
          {[{ id: 'all', label: 'All' }, ...STATUSES].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border ${
                filter === f.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-gray-500 py-10 text-center">
          Nothing matches. {items.length === 0 && 'No products are tagged quadm yet.'}
        </p>
      )}

      {groups.map(([container, list]) => {
        const locked = LOCKED.includes(container);
        const val = list.reduce((s, i) => s + (st(i.id).status === 'avail' && i.price ? i.price : 0), 0);
        return (
          <section key={container}>
            <div className="flex items-center justify-between border-b border-gray-900 pb-2 mb-3">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                {container}
                {locked && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 border border-gray-300 rounded px-1.5 py-0.5">
                    shipped · fixed
                  </span>
                )}
              </h2>
              <span className="text-xs font-mono text-gray-500 tabular-nums">
                {list.length} {list.length === 1 ? 'item' : 'items'} · {money(val)}
              </span>
            </div>

            <div className="space-y-2">
              {list.map(i => {
                const s = st(i.id);
                const badge = STATUSES.find(x => x.id === s.status) || STATUSES[0];
                return (
                  <div key={i.id} className="bg-white rounded-xl border border-gray-200 p-3 flex gap-3 items-center">
                    <button onClick={() => { setOpen(i.id); setDraft(''); }} className="flex gap-3 items-center flex-1 min-w-0 text-left">
                      <div className="w-14 h-[72px] rounded-lg bg-gray-100 overflow-hidden flex-none">
                        {i.imgs[0]
                          ? <img src={i.imgs[0]} alt={i.name} loading="lazy" className="w-full h-full object-cover" />
                          : <div className="w-full h-full grid place-items-center text-gray-400 text-lg">{i.name[0]}</div>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{i.name}</div>
                        <div className="text-sm text-gray-500 truncate">{i.designer || '—'}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-1 text-xs">
                          {i.size && <span className="font-mono font-semibold text-gray-700">{i.size}</span>}
                          <span className="font-mono text-gray-700">{money(i.price) || 'TBC'}</span>
                          <span className={`font-mono uppercase tracking-wide text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {(s.notes || []).length > 0 && (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <StickyNote className="w-3 h-3" />{s.notes.length}
                            </span>
                          )}
                          {i.sold && s.status !== 'sold' && (
                            <span className="text-[10px] font-mono uppercase text-rose-600">sold on shopify</span>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 flex-none">
                      {saving[i.id] && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                      <select
                        value={s.container || ''}
                        disabled={locked}
                        onChange={e => patch(i.id, { container: e.target.value })}
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">Unassigned</option>
                        {allContainers.map(c => <option key={c} value={c} disabled={LOCKED.includes(c) && c !== s.container}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {openItem && (() => {
        const s = st(openItem.id);
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setOpen(null)}>
            <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-gray-500">{s.container || 'Unassigned'}</span>
                <button onClick={() => setOpen(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-4 space-y-4">
                {openItem.imgs.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
                    {openItem.imgs.map((u, ix) => (
                      <img key={ix} src={u} alt={`${openItem.name} ${ix + 1}`} loading="lazy"
                           className="h-56 rounded-lg object-cover flex-none" />
                    ))}
                  </div>
                )}

                <div>
                  <h2 className="text-xl font-bold text-gray-900">{openItem.name}</h2>
                  <p className="text-gray-500">{openItem.designer}</p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-2xl font-bold">{money(openItem.price) || 'Price TBC'}</span>
                    {openItem.retail > openItem.price && (
                      <span className="text-sm text-gray-400 line-through">{money(openItem.retail)}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {STATUSES.map(b => (
                    <button
                      key={b.id}
                      onClick={() => patch(openItem.id, { status: b.id })}
                      className={`py-2 text-sm font-medium rounded-lg border ${
                        s.status === b.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >{b.label}</button>
                  ))}
                </div>

                <label className="block">
                  <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Container</span>
                  <select
                    value={s.container || ''}
                    disabled={LOCKED.includes(s.container)}
                    onChange={e => patch(openItem.id, { container: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">Unassigned</option>
                    {allContainers.map(c => <option key={c} value={c} disabled={LOCKED.includes(c) && c !== s.container}>{c}</option>)}
                  </select>
                  {LOCKED.includes(s.container) && (
                    <p className="text-xs text-gray-500 mt-1">{s.container} has shipped, so its contents are fixed.</p>
                  )}
                </label>

                <dl className="text-sm divide-y divide-gray-100 border-t border-gray-100">
                  {[
                    ['Size', openItem.size], ['Colour', openItem.colour],
                    ['Condition', openItem.cond], ['Fabric', openItem.material],
                    ['Measurements', openItem.measure],
                    ['Shipping', openItem.concierge ? 'Shipped by The Phir Story' : ''],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="py-2 flex gap-4">
                      <dt className="w-28 flex-none text-gray-500">{k}</dt>
                      <dd className="text-gray-900 whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Notes{(s.notes || []).length > 0 && ` · ${s.notes.length}`}
                  </h3>
                  <div className="space-y-2">
                    {(s.notes || []).map((n, ix) => (
                      <div key={ix} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <p className="text-gray-900 whitespace-pre-wrap">{n.t}</p>
                        <div className="flex justify-between items-center mt-1.5 text-xs text-gray-500">
                          <span>{n.at}{n.by ? ` · ${n.by}` : ''}</span>
                          <button
                            onClick={() => patch(openItem.id, { notes: s.notes.filter((_, j) => j !== ix) })}
                            className="text-rose-600 hover:underline"
                          >delete</button>
                        </div>
                      </div>
                    ))}
                    {(s.notes || []).length === 0 && <p className="text-sm text-gray-400">Nothing noted yet.</p>}
                  </div>

                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={3}
                    placeholder="Who asked about it, what you promised, anything that needs saying at the till."
                    className="mt-3 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <button
                    disabled={!draft.trim()}
                    onClick={() => {
                      patch(openItem.id, {
                        notes: [{ t: draft.trim(), at: stamp(), by: localStorage.getItem('admin_name') || '' }, ...(s.notes || [])],
                      });
                      setDraft('');
                    }}
                    className="mt-2 w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40"
                  >Add note</button>
                </div>

                <a
                  href={`https://admin.shopify.com/store/ba42c1/products/${openItem.id}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
                >
                  <TagIcon className="w-3.5 h-3.5" /> Open in Shopify
                </a>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
