import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, Check, SkipForward, ExternalLink, AlertTriangle, RefreshCw,
  ChevronRight, Layers, Sparkles
} from 'lucide-react';
import { CONDITIONS, CONDITION_LABELS } from '../../lib/conditions.js';

const API_URL = import.meta.env.VITE_API_URL || '';
const SHOPIFY_STORE = import.meta.env.VITE_SHOPIFY_STORE_URL || 'ba42c1.myshopify.com';
const BATCH = 5;
const PLATFORM_FEE = 10;          // mirrors lib/payout-calculation.js
const DEFAULT_COMMISSION = 18;    // house default applied to new listings
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Unstitched'];

// Default is "closest to done": listings that only need a field or two come first, and
// the near-empty import stubs (10+ gaps) fall to the end where they belong.
const SORTS = {
  quick:   { label: 'Closest to done',   hint: 'Listings needing only a field or two — near-empty ones come last' },
  broken:  { label: 'Most broken first', hint: 'Orphans, missing conditions and prices lead' },
  designer:{ label: 'By designer',       hint: 'Same brand together, easier to batch' },
};

function sortItems(items, mode) {
  const c = [...items];
  if (mode === 'quick')    return c.sort((a, b) => a.gaps.length - b.gaps.length || a.title.localeCompare(b.title));
  if (mode === 'designer') return c.sort((a, b) => (a.vendor || 'zzz').localeCompare(b.vendor || 'zzz') || a.title.localeCompare(b.title));
  return c.sort((a, b) => b.breaking - a.breaking || b.gaps.length - a.gaps.length || a.title.localeCompare(b.title));
}

/* ── one editable field ───────────────────────────────────────────────────── */
function Field({ label, hint, wide, filled, derived, children }) {
  return (
    <div className={wide ? 'sm:col-span-2 flex flex-col gap-1.5' : 'flex flex-col gap-1.5'}>
      <label className="flex items-center gap-2 text-xs font-medium text-stone-600">
        <span className={`w-1.5 h-1.5 rounded-full flex-none ${filled ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {label}
        {derived && filled && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-normal bg-sky-50 text-sky-700 border border-sky-200">
            suggested
          </span>
        )}
      </label>
      {children}
      {hint && <span className="text-[11px] leading-snug text-stone-400">{hint}</span>}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-[#C91A2B]/30 focus:border-[#C91A2B]';

/* ── the card ─────────────────────────────────────────────────────────────── */
function Card({ item, index, total, onSave, onSkip }) {
  // The parent remounts this component via key={item.id}, so plain initial state is
  // enough — no effect needed to reset the form between cards.
  // Prefill everything the listing already knows, and derive the two we can compute:
  // asking price is list minus the $10 platform fee, commission is the house default.
  // Derived values are flagged so the card can say "check this" rather than pretending
  // it is data we actually had.
  const derivedAsk = item.price != null && item.price !== ''
    ? String(Math.max(0, Math.round((parseFloat(item.price) - PLATFORM_FEE) * 100) / 100)) : '';
  const [form, setForm] = useState(() => ({
    condition: item.condition || '', size: item.size || '', designer: item.vendor || '',
    seller: item.seller || '', chest: item.chest || '', hip: item.hip || '',
    measurements: item.measurements || '', material: item.material || '',
    ask: derivedAsk, commission: item.commission || String(DEFAULT_COMMISSION),
    retail: item.retail || '', description: item.description || '',
  }));
  // Which values the admin is being asked to confirm rather than supply.
  const derived = {
    ask: derivedAsk !== '' && !item.ask,
    commission: !item.commission,
  };
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const need = k => item.gaps.includes(k);
  const filled = k => String(form[k] ?? '').trim() !== '';

  const saveWith = extra => save(extra);

  async function save(extra) {
    setSaving(true); setErr('');
    // Send only fields this item was actually missing, and only if filled in. Sending a
    // field that was never a gap would write a value back over itself for no reason.
    const wanted = new Set(item.gaps);
    if (wanted.has('chest') || wanted.has('hip') || wanted.has('measurements')) wanted.add('measurements');
    const fields = {};
    for (const k of Object.keys(form)) {
      if (!wanted.has(k)) continue;
      if (String(form[k] ?? '').trim() === '') continue;
      fields[k] = form[k];
    }
    Object.assign(fields, extra || {});
    if (!Object.keys(fields).length) { setSaving(false); onSkip(item); return; }
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=patch-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ id: item.id, fields }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Save failed');
      onSave(item, d.applied || []);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  const shopUrl = `https://${SHOPIFY_STORE}/admin/products/${item.id}`;

  return (
    <div className="relative bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
      {/* header */}
      <div className="flex gap-4 p-5 bg-stone-50 border-b border-stone-200">
        {item.image
          ? <img src={item.image} alt="" className="w-[74px] h-[98px] rounded-lg object-cover border border-stone-200 flex-none" />
          : <div className="w-[74px] h-[98px] rounded-lg bg-stone-200 flex-none" />}
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-stone-900 leading-tight truncate">{item.title}</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
            <span>{item.vendor || 'No designer'}</span>
            <span className="font-mono">${item.price ?? '—'}</span>
            <span className="font-mono">{item.mediaCount} photo{item.mediaCount === 1 ? '' : 's'}</span>
            <a href={shopUrl} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-[#C91A2B] hover:underline">
              Shopify <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <div className="flex-none text-right">
          <div className={`text-3xl font-semibold leading-none ${item.breaking ? 'text-[#C91A2B]' : 'text-amber-600'}`}>
            {item.gaps.length}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">missing</div>
        </div>
      </div>

      {/* body */}
      <div className="p-5 flex flex-col gap-4 max-h-[52vh] overflow-y-auto">
        {need('images') && (
          <a href={shopUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 hover:bg-red-100">
            <AlertTriangle className="w-4 h-4 flex-none" />
            <span><b>No photos at all.</b> This can't sell.</span>
            <ExternalLink className="w-3.5 h-3.5 ml-auto flex-none" />
          </a>
        )}
        {need('images_few') && (
          <a href={shopUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 hover:bg-amber-100">
            <AlertTriangle className="w-4 h-4 flex-none" />
            <span>Only {item.mediaCount} photo{item.mediaCount === 1 ? '' : 's'} — three is the minimum.</span>
            <ExternalLink className="w-3.5 h-3.5 ml-auto flex-none" />
          </a>
        )}
        {need('condition_option') && (
          <a href={shopUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 hover:bg-red-100">
            <AlertTriangle className="w-4 h-4 flex-none" />
            <span><b>No Condition option on this product.</b> It has to be added in Shopify before a condition can be set.</span>
            <ExternalLink className="w-3.5 h-3.5 ml-auto flex-none" />
          </a>
        )}
        {need('category') && (
          <a href={shopUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 hover:bg-amber-100">
            <AlertTriangle className="w-4 h-4 flex-none" />
            <span>No Shopify category — weakens storefront filtering.</span>
            <ExternalLink className="w-3.5 h-3.5 ml-auto flex-none" />
          </a>
        )}

        {need('commission_review') && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 flex flex-col gap-3">
            <div className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
              <span>
                Charging <b>{item.commission}%</b> but not tagged concierge.
                The rules would give this <b>{item.expectedCommission}%</b>.
                Is Phirstory holding and shipping it?
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => saveWith({ markConcierge: true })} disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-[#C91A2B] text-white text-xs font-medium hover:brightness-110 disabled:opacity-60">
                Yes — it's concierge
              </button>
              <button type="button" onClick={() => saveWith({ rateReviewed: true })} disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-xs font-medium text-stone-700 hover:border-stone-400 disabled:opacity-60">
                No — {item.commission}% is correct
              </button>
            </div>
            <p className="text-[11px] text-amber-800/80 m-0">
              Tagging it concierge re-rates commission and recalculates payout. Confirming the rate
              leaves it untouched and stops this card asking again.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {need('condition') && (
            <Field label="Condition" filled={filled('condition')}
                   hint={item.conditionTags.length ? `Tag is currently "${item.conditionTags.join(' / ')}" — saving rewrites it to match.` : 'No condition tag either. Saving sets both.'}>
              <select className={inputCls} value={form.condition || ''} onChange={e => set('condition', e.target.value)}>
                <option value="">Select…</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
              </select>
            </Field>
          )}
          {need('size') && (
            <Field label="Size" filled={filled('size')}>
              <select className={inputCls} value={form.size || ''} onChange={e => set('size', e.target.value)}>
                <option value="">Select…</option>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
          {need('designer') && (
            <Field label="Designer" filled={filled('designer')}>
              <input className={inputCls} value={form.designer || ''} placeholder="e.g. Sana Safinaz"
                     onChange={e => set('designer', e.target.value)} />
            </Field>
          )}
          {need('seller') && (
            <Field label="Seller email" filled={filled('seller')} hint="Orphaned — nobody gets paid when this sells.">
              <input className={inputCls} type="email" value={form.seller || ''} placeholder="seller@email.com"
                     onChange={e => set('seller', e.target.value)} />
            </Field>
          )}
          {need('ask') && (
            <Field label="Seller asking price" filled={filled('ask')} derived={derived.ask}
                   hint={item.price ? `Filled in from the $${item.price} list price minus the $${PLATFORM_FEE} fee — check it.` : ''}>
              <input className={inputCls} type="number" value={form.ask || ''} placeholder="120"
                     onChange={e => set('ask', e.target.value)} />
            </Field>
          )}
          {need('commission') && (
            <Field label="Commission %" filled={filled('commission')} derived={derived.commission}
                   hint={derived.commission ? `Defaulted to ${DEFAULT_COMMISSION}% — change it if this seller is on a different rate.` : ''}>
              <input className={inputCls} type="number" value={form.commission || ''} placeholder="18"
                     onChange={e => set('commission', e.target.value)} />
            </Field>
          )}
          {need('chest') && (
            <Field label="Chest (pit to pit, in)" filled={filled('chest')}
                   hint="Merges into measurements and sets custom.chest_size for the storefront filter.">
              <input className={inputCls} type="number" step="0.5" value={form.chest || ''} placeholder="e.g. 21"
                     onChange={e => set('chest', e.target.value)} />
            </Field>
          )}
          {need('hip') && (
            <Field label="Hip (in)" filled={filled('hip')}>
              <input className={inputCls} type="number" step="0.5" value={form.hip || ''} placeholder="e.g. 24.5"
                     onChange={e => set('hip', e.target.value)} />
            </Field>
          )}
          {need('material') && (
            <Field label="Material" filled={filled('material')}>
              <input className={inputCls} value={form.material || ''} placeholder="e.g. Chiffon"
                     onChange={e => set('material', e.target.value)} />
            </Field>
          )}
          {need('retail') && (
            <Field label="Original retail $" filled={filled('retail')} hint="Drives the “you save” badge.">
              <input className={inputCls} type="number" value={form.retail || ''} placeholder="250"
                     onChange={e => set('retail', e.target.value)} />
            </Field>
          )}
          {(need('measurements') || need('chest') || need('hip')) && (
            <Field label="Measurements" wide filled={filled('measurements')}
                   hint="Free text. Chest and hip merge into this — nothing else is ever overwritten.">
              <textarea className={inputCls} rows={2} value={form.measurements || ''}
                        placeholder={'Medium | Chest: 21" | Length: 48"'}
                        onChange={e => set('measurements', e.target.value)} />
            </Field>
          )}
          {need('description') && (
            <Field label="Description" wide filled={filled('description')}>
              <textarea className={inputCls} rows={3} value={form.description || ''}
                        placeholder="Describe the piece…" onChange={e => set('description', e.target.value)} />
            </Field>
          )}
        </div>

        {err && <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>}
      </div>

      {/* footer */}
      <div className="flex items-center gap-3 px-5 py-4 bg-stone-50 border-t border-stone-200">
        <button onClick={() => onSkip(item)} disabled={saving}
                className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:border-stone-400 disabled:opacity-50">
          <SkipForward className="w-4 h-4 inline mr-1.5 -mt-0.5" />Skip
        </button>
        <span className="text-xs text-stone-400">{index + 1} of {total} in this batch</span>
        <button onClick={() => save()} disabled={saving}
                className="ml-auto px-5 py-2 rounded-lg bg-[#C91A2B] text-white text-sm font-medium hover:brightness-110 disabled:opacity-60 inline-flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save &amp; next
        </button>
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */
export default function ListingDeck() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState('quick');
  const [breakingOnly, setBreakingOnly] = useState(false);
  const [handled, setHandled] = useState({});   // id -> 'done' | 'skip'
  const [queue, setQueue] = useState([]);      // ordered ids still waiting
  const [batch, setBatch] = useState([]);      // the 5 ids currently dealt (frozen)
  const [idx, setIdx] = useState(0);
  const [fixedTotal, setFixedTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/api/admin-listings?action=completeness&status=active`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Could not load listings');
      setData(d);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => Object.fromEntries((data?.items || []).map(i => [i.id, i])), [data]);

  // The dealt batch is FROZEN. If it were recomputed from a pool that drops saved items,
  // every save would re-slice the list and silently skip the card that shifted into place.
  useEffect(() => {
    if (!data) return;
    let items = data.items.filter(i => handled[i.id] !== 'done');
    if (breakingOnly) items = items.filter(i => i.breaking > 0);
    const ids = sortItems(items, sort).map(i => i.id);
    setBatch(ids.slice(0, BATCH));
    setQueue(ids.slice(BATCH));
    setIdx(0);
    // `handled` is deliberately not a dependency — re-sorting mid-batch is the bug above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, breakingOnly]);

  const current = byId[batch[idx]];

  function next(id, result) {
    setHandled(h => ({ ...h, [id]: result }));
    if (result === 'done') setFixedTotal(n => n + 1);
    setIdx(i => i + 1);
  }
  function dealNext() {
    // Skipped cards go to the back of the queue rather than being dropped.
    const skipped = batch.filter(id => handled[id] === 'skip');
    const rest = [...queue, ...skipped];
    setBatch(rest.slice(0, BATCH));
    setQueue(rest.slice(BATCH));
    setIdx(0);
  }

  const remaining = queue.length + batch.filter(id => handled[id] !== 'done').length;
  const batchDone = idx >= batch.length && batch.length > 0;

  if (loading) return (
    <div className="flex items-center justify-center py-32 text-stone-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Scanning active listings…
    </div>
  );
  if (err) return (
    <div className="max-w-2xl mx-auto mt-16 p-5 rounded-xl bg-red-50 border border-red-200 text-red-800">
      <p className="font-medium mb-2">Couldn't load the deck</p>
      <p className="text-sm mb-4">{err}</p>
      <button onClick={load} className="px-4 py-2 rounded-lg bg-white border border-red-300 text-sm font-medium">Try again</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-wrap gap-4 items-end justify-between border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#C91A2B]" /> Listing Cleanup
          </h1>
          <p className="text-sm text-stone-500 mt-1">Active listings · five at a time · save each card as you go</p>
        </div>
        <div className="flex gap-6 text-right">
          <div><div className="text-2xl font-semibold text-stone-900 leading-none">{remaining}</div>
               <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">in queue</div></div>
          <div><div className="text-2xl font-semibold text-emerald-600 leading-none">{fixedTotal}</div>
               <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">fixed today</div></div>
          <button onClick={load} title="Rescan" className="self-center p-2 rounded-lg border border-stone-300 hover:border-stone-400">
            <RefreshCw className="w-4 h-4 text-stone-500" />
          </button>
        </div>
      </div>

      {/* sorting — plain buttons, no dropdown to hunt through */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          {Object.entries(SORTS).map(([k, s]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition ${
                sort === k ? 'bg-stone-900 text-white border-stone-900'
                           : 'bg-white text-stone-600 border-stone-300 hover:border-stone-400'}`}>
              {s.label}
            </button>
          ))}
          <button onClick={() => setBreakingOnly(v => !v)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition inline-flex items-center gap-1.5 ${
              breakingOnly ? 'bg-[#C91A2B] text-white border-[#C91A2B]'
                           : 'bg-white text-stone-600 border-stone-300 hover:border-stone-400'}`}>
            <AlertTriangle className="w-3.5 h-3.5" /> Breaking only
          </button>
        </div>
        <p className="text-xs text-stone-400">
          {SORTS[sort].hint}{breakingOnly && ' · showing only items with an issue that actually breaks something'}
        </p>
      </div>

      {/* batch pips */}
      {batch.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {batch.map((id, i) => (
              <span key={id} className={`w-8 h-1.5 rounded-full ${
                handled[id] === 'done' ? 'bg-emerald-500'
                : handled[id] === 'skip' ? 'bg-amber-500'
                : i === idx ? 'bg-[#C91A2B]' : 'bg-stone-200'}`} />
            ))}
          </div>
          <span className="text-xs text-stone-400">
            {batchDone ? 'Batch done' : `Card ${idx + 1} of ${batch.length} · ${current?.gaps.length} fields missing`}
          </span>
        </div>
      )}

      {/* deck */}
      {batch.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center flex flex-col items-center gap-3">
          <Sparkles className="w-7 h-7 text-emerald-500" />
          <h2 className="text-xl font-semibold text-stone-900">Nothing left in this queue</h2>
          <p className="text-sm text-stone-500 max-w-sm">
            {breakingOnly ? 'No active listings have breaking issues. Turn off “Breaking only” to see the rest.'
                          : `All ${data?.scanned ?? 0} active listings are complete.`}
          </p>
        </div>
      ) : batchDone ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center flex flex-col items-center gap-3">
          <h2 className="text-xl font-semibold text-stone-900">Batch complete</h2>
          <div className="flex gap-8 my-1">
            <div><div className="text-2xl font-semibold text-emerald-600 leading-none">
              {batch.filter(id => handled[id] === 'done').length}</div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">saved</div></div>
            <div><div className="text-2xl font-semibold text-amber-600 leading-none">
              {batch.filter(id => handled[id] === 'skip').length}</div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">skipped</div></div>
          </div>
          <p className="text-sm text-stone-500 max-w-sm">
            Skipped cards go back to the end of the queue — nothing is dropped. {remaining} listing{remaining === 1 ? '' : 's'} still {remaining === 1 ? 'has' : 'have'} gaps.
          </p>
          <button onClick={dealNext}
            className="mt-2 px-5 py-2.5 rounded-lg bg-[#C91A2B] text-white text-sm font-medium hover:brightness-110 inline-flex items-center gap-2">
            Deal next {BATCH} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          {/* stacked cards behind, purely visual */}
          <div className="absolute inset-x-2 -bottom-2 h-full rounded-2xl bg-white border border-stone-200 opacity-40" aria-hidden="true" />
          <div className="absolute inset-x-1 -bottom-1 h-full rounded-2xl bg-white border border-stone-200 opacity-70" aria-hidden="true" />
          <Card key={current.id} item={current} index={idx} total={batch.length}
                onSave={i => next(i.id, 'done')} onSkip={i => next(i.id, 'skip')} />
        </div>
      )}
    </div>
  );
}
