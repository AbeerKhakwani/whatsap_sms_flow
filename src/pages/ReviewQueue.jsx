import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check, X, Pencil, ArrowLeft, ArrowRight, Loader2, Image as ImageIcon,
  Sparkles, Globe, MessageCircle, User, RotateCcw, PartyPopper, Maximize2, Plus,
  SkipForward, Link as LinkIcon, ExternalLink, Save, ChevronDown, Download
} from 'lucide-react';
import { getThumbnail } from '../utils/image';

const API_URL = import.meta.env.VITE_API_URL || '';
const UNDO_MS = 5000;

const REJECT_REASONS = ['Photos too unclear', 'Price too high', 'Wrong/missing details', 'Not a fit for the store', 'Authenticity concern'];

// Fields the seller can be asked to fix — keys match the backend show_* flags + Flow inputs.
const REVISE_FIELDS = [
  { key: 'photos', label: 'Photos' },
  { key: 'price', label: 'Price' },
  { key: 'description', label: 'Description' },
  { key: 'measurements', label: 'Measurements' },
  { key: 'title', label: 'Title' },
  { key: 'designer', label: 'Designer' },
];

function sourceOf(tags) {
  const list = Array.isArray(tags) ? tags : (tags || '').split(',');
  const src = list.map(s => (s || '').trim()).find(x => x.startsWith('source:'));
  return src ? src.replace('source:', '') : null;
}

function SourceBadge({ tags }) {
  const s = sourceOf(tags);
  if (!s) return null;
  const map = {
    portal: { icon: Globe, label: 'Portal' },
    whatsapp: { icon: MessageCircle, label: 'WhatsApp' },
    admin: { icon: User, label: 'Admin' },
  };
  const { icon: Icon, label } = map[s] || { icon: Globe, label: s };
  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone-400">
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

function SellerFlag({ seller }) {
  if (!seller) return <span className="text-xs px-2 py-0.5 rounded-md bg-red-50 text-red-600">No seller</span>;
  if (seller.isNew) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
        <Sparkles className="w-3 h-3" /> New seller
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
      <Check className="w-3 h-3" /> Returning{seller.salesCount ? ` · ${seller.salesCount} sold` : ''}
    </span>
  );
}

const isReReview = (l) => (l?.tags || []).includes('seller-revised');

function StateBadge({ listing, className = '' }) {
  if (!isReReview(listing)) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 ${className}`}>
      <RotateCcw className="w-3 h-3" /> Re-review
    </span>
  );
}

function Detail({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{label}</p>
      <p className="text-sm text-stone-800">{value}</p>
    </div>
  );
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Unstitched'];
const CONDITIONS = ['New with tags', 'Like new', 'Excellent', 'Good', 'Fair'];

// Track a media query (used to branch mobile card flow vs desktop split-pane).
function useIsDesktop() {
  const [is, setIs] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const fn = (e) => setIs(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return is;
}

// Revision context banner (what was asked + the seller's reply) — shared by both layouts.
function RevisionBanner({ listing }) {
  if (!isReReview(listing)) return null;
  return (
    <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
      <p className="text-xs font-semibold text-sky-800 flex items-center gap-1.5">
        <RotateCcw className="w-3.5 h-3.5" />
        {listing.revisionRequestedByName
          ? `Seller revised this — ${listing.revisionRequestedByName} asked them to fix:`
          : "Seller revised this — you'd asked them to fix:"}
      </p>
      <p className="text-sm text-sky-900 mt-1">{listing.revisionNote || 'No note was saved with the original request.'}</p>
      {listing.revisionFields?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {listing.revisionFields.map(f => (
            <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-white text-sky-700 border border-sky-200 capitalize">{f}</span>
          ))}
        </div>
      )}
      {listing.sellerReply && (
        <div className="mt-3 pt-3 border-t border-sky-200">
          <p className="text-xs font-semibold text-sky-800 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Their reply:</p>
          <p className="text-sm text-sky-900 mt-1 whitespace-pre-wrap">{listing.sellerReply}</p>
        </div>
      )}
    </div>
  );
}

// In-place editor for the MOBILE focused review card (unchanged behavior).
function InlineEditor({ listing, onSaved, onCancel }) {
  const [form, setForm] = useState({
    designer: listing.designer || '',
    item_type: listing.item_type || '',
    size: listing.size || '',
    color: listing.color || '',
    condition: listing.condition || '',
    material: listing.material || '',
    chest: listing.chest || '',
    hip: listing.hip || '',
    asking_price: listing.asking_price_usd ?? '',
    original_price: listing.original_price ?? '',
    commission_rate: listing.commission_rate ?? '',
    description: listing.description || '',
    tags: listing.tags || [],
  });
  const [images, setImages] = useState(listing.images || []); // [{id, src}]
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` };

  async function save() {
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=update-listing`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ id: listing.id, ...form }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Save failed');
      const ask = Math.round((parseFloat(form.asking_price) || 0) * 100) / 100;
      const measurements = [form.chest && `Chest: ${form.chest}"`, form.hip && `Hip: ${form.hip}"`].filter(Boolean).join(' | ');
      onSaved({
        designer: form.designer,
        product_name: [form.designer, form.item_type].filter(Boolean).join(' - '),
        size: form.size,
        condition: form.condition,
        material: form.material,
        measurements,
        description: form.description,
        asking_price_usd: ask,
        list_price: d.list_price,
        seller_payout: d.seller_payout,
        tags: form.tags,
        images: images.map(im => im.src),
      });
    } catch (e) { setErr(e.message); }
    setSaving(false);
  }

  async function addPhoto(file) {
    if (!file) return;
    setPhotoBusy(true); setErr(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch(`${API_URL}/api/product-image?action=add`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ productId: listing.id, base64, filename: file.name }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Upload failed');
      setImages(prev => [...prev, { id: d.imageId, src: d.imageUrl }]);
    } catch (e) { setErr(e.message); }
    setPhotoBusy(false);
  }

  async function removePhoto(imageId) {
    setPhotoBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_URL}/api/product-image?action=delete`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ productId: listing.id, imageId }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Delete failed');
      setImages(prev => prev.filter(im => im.id !== imageId));
    } catch (e) { setErr(e.message); }
    setPhotoBusy(false);
  }

  const inp = 'w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-stone-400';
  const lbl = 'text-[11px] uppercase tracking-wide text-stone-400 mb-1 block';

  return (
    <div className="space-y-3">
      <div>
        <span className={lbl}>Photos</span>
        <div className="flex gap-2 flex-wrap">
          {images.map(im => (
            <div key={im.id} className="relative w-16 h-16">
              <img src={getThumbnail(im.src)} alt="" className="w-16 h-16 object-cover rounded-lg border border-stone-200" />
              <button onClick={() => removePhoto(im.id)} disabled={photoBusy} aria-label="Remove photo"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Add photo"
            className="w-16 h-16 rounded-lg border-2 border-dashed border-stone-300 flex items-center justify-center text-stone-400 hover:border-stone-400">
            {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><span className={lbl}>Designer</span><input className={inp} value={form.designer} onChange={e => set('designer', e.target.value)} /></div>
        <div><span className={lbl}>Item type</span><input className={inp} value={form.item_type} onChange={e => set('item_type', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className={lbl}>Size</span>
          <select className={inp} value={form.size} onChange={e => set('size', e.target.value)}>
            <option value="">—</option>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            {form.size && !SIZES.includes(form.size) && <option value={form.size}>{form.size}</option>}
          </select>
        </div>
        <div>
          <span className={lbl}>Condition</span>
          <select className={inp} value={form.condition} onChange={e => set('condition', e.target.value)}>
            <option value="">—</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            {form.condition && !CONDITIONS.includes(form.condition) && <option value={form.condition}>{form.condition}</option>}
          </select>
        </div>
        <div><span className={lbl}>Color</span><input className={inp} value={form.color} onChange={e => set('color', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><span className={lbl}>Material</span><input className={inp} value={form.material} onChange={e => set('material', e.target.value)} /></div>
        <div><span className={lbl}>Chest (&quot;)</span><input className={inp} value={form.chest} onChange={e => set('chest', e.target.value)} /></div>
        <div><span className={lbl}>Hip (&quot;)</span><input className={inp} value={form.hip} onChange={e => set('hip', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><span className={lbl}>Asking ($)</span><input type="number" className={inp} value={form.asking_price} onChange={e => set('asking_price', e.target.value)} /></div>
        <div><span className={lbl}>Original ($)</span><input type="number" className={inp} value={form.original_price} onChange={e => set('original_price', e.target.value)} /></div>
        <div><span className={lbl}>Commission (%)</span><input type="number" className={inp} value={form.commission_rate} onChange={e => set('commission_rate', e.target.value)} /></div>
      </div>
      <div><span className={lbl}>Description</span><textarea rows={4} className={inp} value={form.description} onChange={e => set('description', e.target.value)} /></div>
      <div>
        <span className={lbl}>Tags</span>
        <input className={inp} value={form.tags.join(', ')} placeholder="tag1, tag2, …"
          onChange={e => set('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} />
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} disabled={saving} className="flex-1 py-2.5 text-sm rounded-xl border border-stone-200 text-stone-600">Cancel</button>
        <button onClick={save} disabled={saving}
          className="flex-1 py-2.5 text-sm rounded-xl bg-stone-900 text-white font-medium flex items-center justify-center gap-1.5 disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save changes
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP: Shopify-style inline edit pane. All fields editable in place; a save
// bar appears when dirty. No separate "edit mode".
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  designer: '', item_type: '', size: '', color: '', condition: '', material: '',
  chest: '', hip: '', asking_price: '', original_price: '', commission_rate: '',
  description: '', tags: [], original_listing_url: '',
};

function formFromFull(l) {
  return {
    designer: l.designer || '',
    item_type: l.item_type || '',
    size: l.size || '',
    color: l.color || '',
    condition: l.condition || '',
    material: l.material || '',
    chest: l.chest || '',
    hip: l.hip || '',
    asking_price: l.asking_price_usd ?? '',
    original_price: l.original_price ?? '',
    commission_rate: l.commission_rate ?? '',
    description: l.description || '',
    tags: l.tags || [],
    original_listing_url: l.original_listing_url || '',
  };
}

function DesktopDetail({ listing, onSaved, onApprove, onRevise, onReject, onSkip }) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [err, setErr] = useState(null);
  // scrape state
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(null);        // raw scrape result
  const [scrapePick, setScrapePick] = useState({});    // { description: true, ... , images: Set-like {url:bool} }
  const [zoom, setZoom] = useState(null);              // src being zoomed
  const fileRef = useRef(null);
  const cache = useRef({});                            // id -> full listing

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` };
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load the full listing whenever selection changes (cached per id).
  useEffect(() => {
    let live = true;
    (async () => {
      setErr(null); setScraped(null); setUrlDraft('');
      if (cache.current[listing.id]) {
        const l = cache.current[listing.id];
        setFull(l); setForm(formFromFull(l)); setBaseline(formFromFull(l)); setImages(l.images || []); setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/admin-listings?action=listing&id=${listing.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        });
        const d = await res.json();
        if (!live) return;
        if (d.success) {
          cache.current[listing.id] = d.listing;
          setFull(d.listing); setForm(formFromFull(d.listing)); setBaseline(formFromFull(d.listing)); setImages(d.listing.images || []);
        } else setErr(d.error || 'Could not load listing');
      } catch (e) { if (live) setErr(e.message); }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [listing.id]);

  const save = useCallback(async () => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=update-listing`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ id: listing.id, ...form }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Save failed');
      const merged = { ...full, ...form, asking_price_usd: parseFloat(form.asking_price) || 0, images };
      cache.current[listing.id] = merged;
      setFull(merged); setBaseline({ ...form });
      onSaved({
        designer: form.designer,
        product_name: [form.designer, form.item_type].filter(Boolean).join(' - '),
        size: form.size, condition: form.condition, material: form.material,
        description: form.description,
        asking_price_usd: Math.round((parseFloat(form.asking_price) || 0) * 100) / 100,
        list_price: d.list_price, seller_payout: d.seller_payout,
        tags: form.tags, images: images.map(im => im.src),
      }, listing.id);
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setSaving(false); }
  }, [form, full, images, listing.id, onSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Approve includes unsaved edits: save first if dirty.
  const approveNow = useCallback(async () => {
    if (dirty) { const ok = await save(); if (!ok) return; }
    onApprove(listing);
  }, [dirty, save, onApprove, listing]);

  async function addPhotoFile(file) {
    if (!file) return;
    setPhotoBusy(true); setErr(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch(`${API_URL}/api/product-image?action=add`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ productId: listing.id, base64, filename: file.name }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Upload failed');
      setImages(prev => { const next = [...prev, { id: d.imageId, src: d.imageUrl }]; syncImages(next); return next; });
    } catch (e) { setErr(e.message); }
    setPhotoBusy(false);
  }

  async function addPhotoUrl(url) {
    const u = (url || '').trim();
    if (!u) return;
    setPhotoBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_URL}/api/product-image?action=add`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ productId: listing.id, imageUrl: u }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Could not fetch that image URL');
      setImages(prev => { const next = [...prev, { id: d.imageId, src: d.imageUrl }]; syncImages(next); return next; });
      setUrlDraft('');
    } catch (e) { setErr(e.message); }
    setPhotoBusy(false);
  }

  async function removePhoto(imageId) {
    setPhotoBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_URL}/api/product-image?action=delete`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ productId: listing.id, imageId }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Delete failed');
      setImages(prev => { const next = prev.filter(im => im.id !== imageId); syncImages(next); return next; });
    } catch (e) { setErr(e.message); }
    setPhotoBusy(false);
  }

  // Keep the queue-row thumbnails + cache in step with photo changes (photos save instantly).
  function syncImages(next) {
    if (cache.current[listing.id]) cache.current[listing.id] = { ...cache.current[listing.id], images: next };
    onSaved({ images: next.map(im => im.src) }, listing.id);
  }

  async function pullDetails() {
    const url = (form.original_listing_url || '').trim();
    if (!url) return;
    setScraping(true); setErr(null); setScraped(null);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=scrape-url`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ url }),
      });
      const d = await res.json();
      if (!d.success || !d.data) throw new Error(d.error || 'Could not read that page');
      const s = d.data;
      setScraped(s);
      // Preselect fields that are empty locally (safe default), images unselected.
      setScrapePick({
        description: !!s.description && !form.description,
        original_price: !!s.price && !form.original_price,
        material: !!s.material && !form.material,
        images: {},
      });
    } catch (e) { setErr(e.message); }
    setScraping(false);
  }

  async function applyScrape() {
    if (!scraped) return;
    const upd = {};
    if (scrapePick.description && scraped.description) upd.description = scraped.description;
    if (scrapePick.original_price && scraped.price) upd.original_price = String(Math.round(parseFloat(scraped.price)) || '');
    if (scrapePick.material && scraped.material) upd.material = scraped.material;
    setForm(f => ({ ...f, ...upd }));
    const picked = Object.entries(scrapePick.images || {}).filter(([, v]) => v).map(([u]) => u);
    for (const u of picked) await addPhotoUrl(u);
    setScraped(null);
  }

  const inp = 'w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-stone-400 bg-white';
  const lbl = 'text-[11px] uppercase tracking-wide text-stone-400 mb-1 block';
  const card = 'bg-white border border-stone-200 rounded-xl p-4';

  const listPrice = (parseFloat(form.asking_price) || 0) + 10;
  const commission = parseFloat(form.commission_rate) || full?.commission_rate || 18;
  const payout = (parseFloat(form.asking_price) || 0) * (1 - commission / 100);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  }

  return (
    <div className="relative pb-16">
      {/* Header: identity + actions */}
      <div className="sticky top-0 z-20 bg-stone-50/95 backdrop-blur border-b border-stone-200 -mx-1 px-1 pb-3 pt-1 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-stone-900 leading-tight truncate">
                {form.designer || listing.designer} <span className="text-stone-300">·</span> <span className="text-stone-600 font-normal">{form.item_type || listing.product_name}</span>
              </h1>
              <StateBadge listing={listing} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-sm text-stone-600">{listing.seller?.name || listing.seller?.email || 'Unknown seller'}</span>
              <SellerFlag seller={listing.seller} />
              <SourceBadge tags={listing.tags} />
              {full?.shopify_admin_url && (
                <a href={full.shopify_admin_url} target="_blank" rel="noreferrer" className="text-xs text-stone-400 hover:text-stone-700 inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Shopify
                </a>
              )}
              {baseline.original_listing_url && (
                <a href={baseline.original_listing_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" /> Original listing
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onReject(listing)} className="px-3 py-2 rounded-xl border border-stone-200 text-red-600 text-sm hover:bg-red-50 inline-flex items-center gap-1.5"><X className="w-4 h-4" /> Reject</button>
            <button onClick={() => onRevise(listing)} className="px-3 py-2 rounded-xl border border-stone-200 text-amber-700 text-sm hover:bg-amber-50 inline-flex items-center gap-1.5"><Pencil className="w-4 h-4" /> Revise</button>
            <button onClick={() => onSkip(listing)} title="Decide later" className="px-3 py-2 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-100 inline-flex items-center gap-1.5"><SkipForward className="w-4 h-4" /> Skip</button>
            <button onClick={approveNow} disabled={saving} className="px-5 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 inline-flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve{dirty ? ' (saves edits)' : ''}
            </button>
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      <div className="space-y-4">
        <RevisionBanner listing={listing} />

        {/* Photos — edits apply instantly (like Shopify media) */}
        <div className={card}>
          <span className={lbl}>Photos</span>
          <div className="flex gap-2 flex-wrap items-start">
            {images.map((im, i) => (
              <div key={im.id || i} className="relative group">
                <img src={getThumbnail(im.src)} alt="" onClick={() => setZoom(im.src)}
                  className={`object-cover rounded-lg border border-stone-200 cursor-zoom-in ${i === 0 ? 'w-40 h-40' : 'w-[76px] h-[76px]'}`} />
                <button onClick={() => removePhoto(im.id)} disabled={photoBusy} aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white items-center justify-center hidden group-hover:flex"><X className="w-3 h-3" /></button>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Upload photo"
              className="w-[76px] h-[76px] rounded-lg border-2 border-dashed border-stone-300 flex items-center justify-center text-stone-400 hover:border-stone-400">
              {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { addPhotoFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="flex gap-2 mt-3">
            <input className={inp} placeholder="Paste an image URL to add it…" value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addPhotoUrl(urlDraft); }} />
            <button onClick={() => addPhotoUrl(urlDraft)} disabled={photoBusy || !urlDraft.trim()}
              className="px-4 py-2 rounded-lg border border-stone-200 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40 inline-flex items-center gap-1.5 flex-shrink-0">
              <LinkIcon className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Details */}
        <div className={card}>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={lbl}>Designer</span><input className={inp} value={form.designer} onChange={e => set('designer', e.target.value)} /></div>
            <div><span className={lbl}>Item type</span><input className={inp} value={form.item_type} onChange={e => set('item_type', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <span className={lbl}>Size</span>
              <select className={inp} value={form.size} onChange={e => set('size', e.target.value)}>
                <option value="">—</option>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                {form.size && !SIZES.includes(form.size) && <option value={form.size}>{form.size}</option>}
              </select>
            </div>
            <div>
              <span className={lbl}>Condition</span>
              <select className={inp} value={form.condition} onChange={e => set('condition', e.target.value)}>
                <option value="">—</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                {form.condition && !CONDITIONS.includes(form.condition) && <option value={form.condition}>{form.condition}</option>}
              </select>
            </div>
            <div><span className={lbl}>Color</span><input className={inp} value={form.color} onChange={e => set('color', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><span className={lbl}>Material</span><input className={inp} value={form.material} onChange={e => set('material', e.target.value)} /></div>
            <div><span className={lbl}>Chest (&quot;)</span><input className={inp} value={form.chest} onChange={e => set('chest', e.target.value)} /></div>
            <div><span className={lbl}>Hip (&quot;)</span><input className={inp} value={form.hip} onChange={e => set('hip', e.target.value)} /></div>
          </div>
          <div className="mt-3">
            <span className={lbl}>Description</span>
            <textarea rows={5} className={inp} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="mt-3">
            <span className={lbl}>Tags</span>
            <input className={inp} value={form.tags.join(', ')} placeholder="tag1, tag2, …"
              onChange={e => set('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} />
          </div>
        </div>

        {/* Pricing */}
        <div className={card}>
          <div className="grid grid-cols-3 gap-3">
            <div><span className={lbl}>Asking ($)</span><input type="number" className={inp} value={form.asking_price} onChange={e => set('asking_price', e.target.value)} /></div>
            <div><span className={lbl}>Original retail ($)</span><input type="number" className={inp} value={form.original_price} onChange={e => set('original_price', e.target.value)} /></div>
            <div><span className={lbl}>Commission (%)</span><input type="number" className={inp} value={form.commission_rate} onChange={e => set('commission_rate', e.target.value)} /></div>
          </div>
          <div className="flex gap-6 mt-3 text-sm text-stone-600">
            <span>Lists at <b className="text-stone-900">${listPrice.toFixed(2)}</b> <span className="text-stone-400">(incl. $10 fee)</span></span>
            <span>Payout if sold <b className="text-green-700">${payout.toFixed(2)}</b></span>
          </div>
        </div>

        {/* Original listing — paste retail URL, pull details, choose what to apply */}
        <div className={card}>
          <span className={lbl}>Original listing (brand&apos;s page)</span>
          <div className="flex gap-2">
            <input className={inp} placeholder="https://www.sanasafinaz.com/…" value={form.original_listing_url}
              onChange={e => set('original_listing_url', e.target.value)} />
            <button onClick={pullDetails} disabled={scraping || !form.original_listing_url.trim()}
              className="px-4 py-2 rounded-lg border border-stone-200 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40 inline-flex items-center gap-1.5 flex-shrink-0">
              {scraping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Pull details
            </button>
          </div>
          <p className="text-[11px] text-stone-400 mt-1.5">The link is saved with the listing. Pulled details are previewed below — nothing applies until you choose.</p>

          {scraped && (
            <div className="mt-3 border border-indigo-100 bg-indigo-50/50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-indigo-800">{scraped.title || 'Found on page'}</p>
              {scraped.description && (
                <label className="flex items-start gap-2 text-sm text-stone-700 cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={!!scrapePick.description}
                    onChange={e => setScrapePick(p => ({ ...p, description: e.target.checked }))} />
                  <span><b className="text-xs uppercase tracking-wide text-stone-400 block">Description</b><span className="line-clamp-3">{scraped.description}</span></span>
                </label>
              )}
              {scraped.price && (
                <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                  <input type="checkbox" checked={!!scrapePick.original_price}
                    onChange={e => setScrapePick(p => ({ ...p, original_price: e.target.checked }))} />
                  <span><b className="text-xs uppercase tracking-wide text-stone-400">Original price:</b> {scraped.currency || '$'}{scraped.price}</span>
                </label>
              )}
              {scraped.material && (
                <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                  <input type="checkbox" checked={!!scrapePick.material}
                    onChange={e => setScrapePick(p => ({ ...p, material: e.target.checked }))} />
                  <span><b className="text-xs uppercase tracking-wide text-stone-400">Material:</b> {scraped.material}</span>
                </label>
              )}
              {(scraped.images?.length > 0) && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-400 mb-1.5">Images — tick to add</p>
                  <div className="flex gap-2 flex-wrap">
                    {scraped.images.slice(0, 8).map(u => (
                      <button key={u} onClick={() => setScrapePick(p => ({ ...p, images: { ...p.images, [u]: !p.images?.[u] } }))}
                        className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${scrapePick.images?.[u] ? 'border-indigo-500' : 'border-transparent'}`}>
                        <img src={u} alt="" className="w-full h-full object-cover" />
                        {scrapePick.images?.[u] && <span className="absolute top-0.5 right-0.5 bg-indigo-500 text-white rounded-full w-4 h-4 flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setScraped(null)} className="px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-600">Dismiss</button>
                <button onClick={applyScrape} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white font-medium">Apply selected</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shopify-style save bar */}
      {dirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-stone-900 text-white shadow-lg">
          <span className="text-sm">Unsaved changes</span>
          <button onClick={() => { setForm({ ...baseline }); }} className="text-sm text-stone-300 hover:text-white">Discard</button>
          <button onClick={save} disabled={saving}
            className="px-3 py-1.5 text-sm rounded-lg bg-white text-stone-900 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      )}

      {/* Zoom lightbox */}
      {zoom && (
        <div data-lightbox className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-w-[95vw] max-h-[90vh] object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setZoom(null)} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X className="w-6 h-6" /></button>
        </div>
      )}
    </div>
  );
}

// Compact queue row used by the desktop list and the mobile jump sheet.
function QueueRow({ l, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100 last:border-0 hover:bg-stone-50 transition
        ${active ? 'bg-indigo-50 hover:bg-indigo-50 border-l-2 border-l-indigo-500' : 'border-l-2 border-l-transparent'}`}>
      <div className="w-10 h-10 rounded-lg bg-stone-100 overflow-hidden flex-shrink-0">
        {l.images?.[0] ? <img src={getThumbnail(l.images[0])} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-stone-300 m-3" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-stone-800 truncate">{l.designer} · {l.product_name}</p>
        <p className="text-[11px] text-stone-400 truncate">
          {l.seller?.isNew ? <span className="text-amber-700">New seller</span> : (l.seller?.name || 'Returning')}
          {l.asking_price_usd ? ` · $${Math.round(l.asking_price_usd)}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {isReReview(l) && <RotateCcw className="w-3.5 h-3.5 text-sky-600" />}
        {l.sellerReply && <MessageCircle className="w-3.5 h-3.5 text-sky-500" />}
      </div>
    </button>
  );
}

export default function ReviewQueue() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [searchParams] = useSearchParams();
  const rawMode = searchParams.get('queue');
  const initialFilter = rawMode === 'new' || rawMode === 'rereview' ? rawMode : 'all';
  const [filter, setFilter] = useState(initialFilter);   // all | new | rereview (switchable in-page)
  const [queue, setQueue] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [doneToday, setDoneToday] = useState(0);
  const [toast, setToast] = useState(null);
  const [sheet, setSheet] = useState(null);              // { type:'reject'|'revise', listing }
  const [jumpOpen, setJumpOpen] = useState(false);       // mobile queue sheet
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const touchX = useRef(null);
  const [editListing, setEditListing] = useState(null);  // mobile inline editor
  const [editLoading, setEditLoading] = useState(false);

  // Visible list under the active filter; selection lives on the visible list.
  const visible = useMemo(() => {
    if (filter === 'rereview') return queue.filter(isReReview);
    if (filter === 'new') return queue.filter(l => !isReReview(l));
    return queue;
  }, [queue, filter]);

  const current = visible.find(l => l.id === selectedId) || visible[0] || null;
  const editing = !!editListing && editListing.id === current?.id;

  const idxOf = useCallback((id) => visible.findIndex(l => l.id === id), [visible]);
  const nextAfter = useCallback((id) => {
    const i = idxOf(id);
    if (visible.length <= 1) return null;
    return visible[(i + 1) % visible.length]?.id ?? null;
  }, [visible, idxOf]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin-listings?action=pending`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        });
        const data = await res.json();
        if (data.success) {
          const actionable = (data.listings || []).filter(l => !(l.tags || []).includes('needs-revision'));
          const revised = actionable.filter(l => (l.tags || []).includes('seller-revised'));
          const fresh = actionable.filter(l => !(l.tags || []).includes('seller-revised'));
          setQueue([...revised, ...fresh]); // re-review first, then new
        }
      } catch { /* surfaced via empty state */ }
      setLoading(false);
    })();
  }, []);

  const openEditor = useCallback(async (listing) => {
    if (!listing) return;
    setEditLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=listing&id=${listing.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      const d = await res.json();
      if (d.success) setEditListing(d.listing);
      else alert('Could not load listing: ' + (d.error || 'unknown error'));
    } catch (e) { alert('Could not load listing: ' + e.message); }
    setEditLoading(false);
  }, []);

  const onEditorSaved = useCallback((merged, listingId) => {
    setQueue(q => q.map(l => l.id === listingId ? { ...l, ...merged } : l));
    setEditListing(null);
  }, []);

  // Desktop editor merges without closing anything.
  const onDesktopSaved = useCallback((merged, listingId) => {
    setQueue(q => q.map(l => l.id === listingId ? { ...l, ...merged } : l));
  }, []);

  const commitApprove = useCallback((listing) => {
    fetch(`${API_URL}/api/admin-listings?action=approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      body: JSON.stringify({ shopifyProductId: listing.id, adminEmail: localStorage.getItem('admin_email') || undefined }),
    }).catch(() => {});
  }, []);

  const flushPending = useCallback(() => {
    if (pending.current) {
      clearTimeout(pending.current.timer);
      commitApprove(pending.current.listing);
      pending.current = null;
    }
  }, [commitApprove]);

  useEffect(() => () => flushPending(), [flushPending]);

  const approve = useCallback((listing) => {
    if (!listing) return;
    flushPending();
    const nxt = nextAfter(listing.id);
    setQueue(q => q.filter(l => l.id !== listing.id));
    setSelectedId(nxt);
    setDoneToday(n => n + 1);
    const timer = setTimeout(() => { commitApprove(listing); pending.current = null; setToast(t => (t && t.listing.id === listing.id ? null : t)); }, UNDO_MS);
    pending.current = { listing, timer };
    setToast({ msg: `Approved "${listing.product_name}"`, listing });
  }, [flushPending, commitApprove, nextAfter]);

  const undoApprove = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    const l = pending.current.listing;
    pending.current = null;
    setQueue(q => [l, ...q]);
    setSelectedId(l.id);
    setDoneToday(n => Math.max(0, n - 1));
    setToast(null);
  }, []);

  // Skip = decide later: just move the pointer (item stays in the list).
  const skip = useCallback((listing) => {
    if (!listing) return;
    const nxt = nextAfter(listing.id);
    if (nxt) setSelectedId(nxt);
  }, [nextAfter]);

  async function confirmReject(reason, note) {
    const listing = sheet?.listing;
    if (!listing || !reason) return;
    setBusy(true);
    flushPending();
    try {
      await fetch(`${API_URL}/api/admin-listings?action=reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ shopifyProductId: listing.id, reason, note: note?.trim() || null }),
      });
      const nxt = nextAfter(listing.id);
      setQueue(q => q.filter(l => l.id !== listing.id));
      setSelectedId(nxt);
      setDoneToday(n => n + 1);
      setSheet(null);
    } catch (e) { alert('Failed to reject: ' + e.message); }
    setBusy(false);
  }

  async function confirmRevise({ mode: reviseMode, note, fields }) {
    const listing = sheet?.listing;
    if (!listing || !note?.trim()) return;
    setBusy(true);
    flushPending();
    try {
      await fetch(`${API_URL}/api/admin-listings?action=request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({
          shopifyProductId: listing.id,
          note: note.trim(),
          mode: reviseMode,
          fields: reviseMode === 'fields' ? fields : [],
          adminEmail: localStorage.getItem('admin_email') || undefined,
        }),
      });
      const nxt = nextAfter(listing.id);
      setQueue(q => q.filter(l => l.id !== listing.id));
      setSelectedId(nxt);
      setDoneToday(n => n + 1);
      setSheet(null);
    } catch (e) { alert('Failed to send revision: ' + e.message); }
    setBusy(false);
  }

  // Keyboard: ↑/↓ (or j/k) move · A approve · S skip · E revise · X reject.
  useEffect(() => {
    function onKey(e) {
      if (sheet || !current || editing || jumpOpen) return;
      if (document.querySelector('[data-lightbox]')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'a') { e.preventDefault(); approve(current); }
      else if (k === 's') { e.preventDefault(); skip(current); }
      else if (k === 'e') { e.preventDefault(); setSheet({ type: 'revise', listing: current }); }
      else if (k === 'x') { e.preventDefault(); setSheet({ type: 'reject', listing: current }); }
      else if (e.key === 'ArrowDown' || k === 'j') {
        e.preventDefault();
        const i = idxOf(current.id); if (i < visible.length - 1) setSelectedId(visible[i + 1].id);
      }
      else if (e.key === 'ArrowUp' || k === 'k') {
        e.preventDefault();
        const i = idxOf(current.id); if (i > 0) setSelectedId(visible[i - 1].id);
      }
      else if (e.key === 'ArrowRight') { e.preventDefault(); approve(current); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(current); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, sheet, editing, jumpOpen, approve, skip, visible, idxOf]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  }

  const left = visible.length;
  const total = doneToday + left;
  const pct = total ? Math.round((doneToday / total) * 100) : 100;
  const counts = {
    all: queue.length,
    new: queue.filter(l => !isReReview(l)).length,
    rereview: queue.filter(isReReview).length,
  };

  const emptyState = (
    <div className="py-20 text-center bg-white rounded-2xl border border-stone-200">
      <PartyPopper className="w-14 h-14 mx-auto mb-3 text-green-500" />
      <p className="text-xl font-semibold text-stone-900">All caught up</p>
      <p className="text-sm text-stone-500 mt-1">{doneToday > 0 ? `${doneToday} reviewed today — nice.` : 'Nothing pending approval.'}</p>
      <button onClick={() => navigate('/admin/dashboard')} className="mt-5 px-4 py-2 text-sm rounded-xl bg-stone-900 text-white">Back to dashboard</button>
    </div>
  );

  const filterChips = (
    <div className="flex gap-1.5">
      {[['all', `All ${counts.all}`], ['new', `New ${counts.new}`], ['rereview', `Re-review ${counts.rereview}`]].map(([k, label]) => (
        <button key={k} onClick={() => setFilter(k)}
          className={`text-xs px-2.5 py-1 rounded-full border ${filter === k ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-stone-200 text-stone-500 hover:text-stone-700'}`}>
          {label}
        </button>
      ))}
    </div>
  );

  // ── DESKTOP: split-pane inbox ────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/admin/dashboard')} className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg" aria-label="Back to dashboard"><ArrowLeft className="w-5 h-5" /></button>
          <span className="text-sm font-medium text-stone-900">{left} to review</span>
          <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {doneToday} done today</span>
          <div className="w-40 h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="flex-1" />
          <span className="text-xs text-stone-400">↑↓ move · A approve · S skip · E revise · X reject</span>
        </div>

        {!current ? emptyState : (
          <div className="grid grid-cols-[320px_1fr] gap-5 items-start">
            {/* Queue list */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden sticky top-4">
              <div className="px-3 py-2.5 border-b border-stone-100">{filterChips}</div>
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                {visible.map(l => (
                  <QueueRow key={l.id} l={l} active={l.id === current.id} onClick={() => setSelectedId(l.id)} />
                ))}
              </div>
            </div>

            {/* Work area: Shopify-style inline editor */}
            <DesktopDetail
              key={current.id}
              listing={current}
              onSaved={onDesktopSaved}
              onApprove={approve}
              onRevise={(l) => setSheet({ type: 'revise', listing: l })}
              onReject={(l) => setSheet({ type: 'reject', listing: l })}
              onSkip={skip}
            />
          </div>
        )}

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-stone-900 text-white shadow-lg max-w-[92%]">
            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm truncate">{toast.msg}</span>
            <button onClick={undoApprove} className="flex items-center gap-1 text-sm font-medium text-white ml-1"><RotateCcw className="w-3.5 h-3.5" /> Undo</button>
          </div>
        )}

        {sheet && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setSheet(null)}>
            <div className="bg-white w-full max-w-md rounded-2xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-stone-900">{sheet.type === 'reject' ? 'Reject listing' : 'Request revision'}</h3>
                <button onClick={() => !busy && setSheet(null)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-stone-500 mb-3 truncate">{sheet.listing.designer} · {sheet.listing.product_name}</p>
              {sheet.type === 'reject'
                ? <RejectForm busy={busy} onCancel={() => setSheet(null)} onConfirm={confirmReject} />
                : <ReviseForm busy={busy} sellerName={sheet.listing.seller?.name} onCancel={() => setSheet(null)} onConfirm={confirmRevise} />}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MOBILE: unchanged card flow + queue jump sheet ───────────────────────
  return (
    <div className="max-w-5xl mx-auto pb-28">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/admin/dashboard')} className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg" aria-label="Back to dashboard"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <button onClick={() => setJumpOpen(true)} className="text-sm font-medium text-stone-900 inline-flex items-center gap-1">
              {current ? `${idxOf(current.id) + 1} of ${left}` : `${left} to review`} <ChevronDown className="w-4 h-4 text-indigo-500" />
            </button>
            <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {doneToday} done today</span>
          </div>
          <div className="h-1.5 bg-stone-100 rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {!current ? emptyState : (
        <div
          className="bg-white border border-stone-200 rounded-2xl overflow-hidden"
          onTouchStart={e => { touchX.current = e.changedTouches[0].clientX; }}
          onTouchEnd={e => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (dx > 70) approve(current);
            else if (dx < -70) skip(current);
          }}
        >
          {!editing && <PhotoGallery key={current.id} images={current.images} alt={current.product_name} />}

          <div className="p-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center text-[11px] font-semibold text-stone-600">
                {(current.seller?.name || current.seller?.email || '?')[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-medium text-stone-800">{current.seller?.name || current.seller?.email || 'Unknown seller'}</span>
              <SellerFlag seller={current.seller} />
              <span className="ml-auto"><SourceBadge tags={current.tags} /></span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-stone-900 leading-tight">{current.designer} <span className="text-stone-300">·</span> <span className="text-stone-600 font-normal">{current.product_name}</span></h1>
              <StateBadge listing={current} />
            </div>

            <div className="mt-4"><RevisionBanner listing={current} /></div>

            {editing ? (
              <div className="mt-4">
                <InlineEditor
                  listing={editListing}
                  onSaved={(merged) => onEditorSaved(merged, editListing.id)}
                  onCancel={() => setEditListing(null)}
                />
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap mt-3">
                  <span className="text-sm font-semibold px-3 py-1 rounded-lg bg-stone-50 text-stone-800">${Math.round((current.asking_price_usd || 0) * 100) / 100}</span>
                  {current.size && <span className="text-sm px-3 py-1 rounded-lg bg-stone-50 text-stone-600">{current.size}</span>}
                  {current.condition && <span className="text-sm px-3 py-1 rounded-lg bg-stone-50 text-stone-600">{current.condition}</span>}
                </div>

                {(current.description || current.measurements || current.material) && (
                  <div className="mt-4 border-t border-stone-100 pt-4 space-y-3">
                    {current.description && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-1">Description</p>
                        <p className="text-sm text-stone-700 whitespace-pre-wrap">{current.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <Detail label="Measurements" value={current.measurements} />
                      <Detail label="Material" value={current.material} />
                      <Detail label="Lists at" value={`$${Math.round((current.list_price || current.asking_price_usd || 0) * 100) / 100} (incl. fee)`} />
                      <Detail label="Payout if sold" value={current.seller_payout != null ? `$${Number(current.seller_payout).toFixed(2)}` : null} />
                      <Detail label="Commission" value={current.commission_rate != null ? `${current.commission_rate}%` : null} />
                    </div>
                  </div>
                )}

                <button onClick={() => openEditor(current)} disabled={editLoading}
                  className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mt-4 disabled:opacity-50">
                  {editLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />} Edit details here
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {current && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-stone-200 px-4 py-3 z-40">
          <div className="max-w-5xl mx-auto flex items-center gap-2">
            <button onClick={() => setSheet({ type: 'reject', listing: current })}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 text-red-600 text-sm hover:bg-red-50">
              <X className="w-4 h-4" /> Reject
            </button>
            <button onClick={() => skip(current)} title="Decide later — moves on, stays in the queue"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50">
              <SkipForward className="w-4 h-4" /> Skip
            </button>
            <div className="flex-1" />
            <button onClick={() => setSheet({ type: 'revise', listing: current })}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 text-amber-700 text-sm hover:bg-amber-50">
              <Pencil className="w-4 h-4" /> Revise
            </button>
            <button onClick={() => approve(current)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 text-white text-base font-medium hover:bg-green-700">
              <Check className="w-5 h-5" /> Approve
            </button>
          </div>
        </div>
      )}

      {/* Queue jump sheet — tap any listing to go straight to it */}
      {jumpOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setJumpOpen(false)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-stone-900">Queue</h3>
                {filterChips}
              </div>
              <button onClick={() => setJumpOpen(false)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto">
              {visible.map(l => (
                <QueueRow key={l.id} l={l} active={l.id === current?.id}
                  onClick={() => { setSelectedId(l.id); setJumpOpen(false); }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-stone-900 text-white shadow-lg max-w-[92%]">
          <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-sm truncate">{toast.msg}</span>
          <button onClick={undoApprove} className="flex items-center gap-1 text-sm font-medium text-white ml-1"><RotateCcw className="w-3.5 h-3.5" /> Undo</button>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4" onClick={() => !busy && setSheet(null)}>
          <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-stone-900">{sheet.type === 'reject' ? 'Reject listing' : 'Request revision'}</h3>
              <button onClick={() => !busy && setSheet(null)} className="p-1 text-stone-400 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-stone-500 mb-3 truncate">{sheet.listing.designer} · {sheet.listing.product_name}</p>
            {sheet.type === 'reject'
              ? <RejectForm busy={busy} onCancel={() => setSheet(null)} onConfirm={confirmReject} />
              : <ReviseForm busy={busy} sellerName={sheet.listing.seller?.name} onCancel={() => setSheet(null)} onConfirm={confirmRevise} />}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoGallery({ images, alt }) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const go = useCallback((d) => setIdx(i => images?.length ? (i + d + images.length) % images.length : 0), [images]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setZoom(false);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, go]);

  if (!images?.length) {
    return <div className="aspect-[4/3] bg-stone-100 flex items-center justify-center"><ImageIcon className="w-12 h-12 text-stone-300" /></div>;
  }

  return (
    <div className="bg-stone-50">
      <div className="relative">
        <img
          src={getThumbnail(images[idx])}
          alt={alt}
          onClick={() => setZoom(true)}
          className="w-full h-[300px] md:h-[440px] object-contain cursor-zoom-in bg-stone-50"
        />
        <button onClick={() => setZoom(true)} aria-label="Enlarge photo"
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white hover:bg-black/60">
          <Maximize2 className="w-4 h-4" />
        </button>
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50"><ArrowLeft className="w-4 h-4" /></button>
            <button onClick={() => go(1)} aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50"><ArrowRight className="w-4 h-4" /></button>
            <span className="absolute bottom-2 right-2 text-[11px] px-1.5 py-0.5 rounded bg-black/40 text-white">{idx + 1}/{images.length}</span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-2">
          {images.map((src, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`Photo ${i + 1}`}
              className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 ${i === idx ? 'border-stone-900' : 'border-transparent'}`}>
              <img src={getThumbnail(src)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <div data-lightbox className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center" onClick={() => setZoom(false)}>
          <img src={images[idx]} alt={alt} className="max-w-[95vw] max-h-[90vh] object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setZoom(false)} aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X className="w-6 h-6" /></button>
          {images.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); go(-1); }} aria-label="Previous photo"
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><ArrowLeft className="w-6 h-6" /></button>
              <button onClick={e => { e.stopPropagation(); go(1); }} aria-label="Next photo"
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><ArrowRight className="w-6 h-6" /></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RejectForm({ busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {REJECT_REASONS.map(r => (
          <button key={r} onClick={() => setReason(r)}
            className={`text-xs px-3 py-1.5 rounded-full border ${reason === r ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-stone-200 text-stone-600'}`}>
            {r}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional note to the seller…"
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-stone-400 mb-3" />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 text-sm rounded-xl border border-stone-200 text-stone-600">Cancel</button>
        <button onClick={() => onConfirm(reason, note)} disabled={busy || !reason}
          className="flex-1 py-2.5 text-sm rounded-xl bg-red-600 text-white font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Reject
        </button>
      </div>
    </div>
  );
}

function ReviseForm({ busy, sellerName, onCancel, onConfirm }) {
  const [mode, setMode] = useState('question');   // 'question' = ask · 'fields' = request edits
  const [note, setNote] = useState('');
  const [fields, setFields] = useState([]);
  const toggleField = (k) => setFields(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k]);
  const canSend = note.trim() && (mode === 'question' || fields.length > 0);
  const seg = (m, label) => (
    <button onClick={() => setMode(m)}
      className={`px-3 py-1.5 ${m === 'fields' ? 'border-l border-stone-200' : ''} ${mode === m ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-500 hover:text-stone-700'}`}>
      {label}
    </button>
  );
  return (
    <div>
      <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden mb-3 text-sm">
        {seg('question', 'Ask a question')}
        {seg('fields', 'Request changes')}
      </div>

      {mode === 'fields' && (
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-1.5">Only these will show in their WhatsApp form</p>
          <div className="flex flex-wrap gap-2">
            {REVISE_FIELDS.map(f => {
              const on = fields.includes(f.key);
              return (
                <button key={f.key} onClick={() => toggleField(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1 ${on ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-stone-200 text-stone-600'}`}>
                  {on && <Check className="w-3 h-3" />}{f.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
        placeholder={mode === 'question'
          ? `What do you want to ask ${sellerName || 'the seller'}? They'll reply right in WhatsApp.`
          : `Tell ${sellerName || 'the seller'} what to fix${fields.length ? ` (${fields.length} field${fields.length > 1 ? 's' : ''} selected)` : ''}…`}
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-stone-400 mb-3" />

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 text-sm rounded-xl border border-stone-200 text-stone-600">Cancel</button>
        <button onClick={() => onConfirm({ mode, note, fields })} disabled={busy || !canSend}
          className="flex-1 py-2.5 text-sm rounded-xl bg-amber-600 text-white font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Send request
        </button>
      </div>
    </div>
  );
}
