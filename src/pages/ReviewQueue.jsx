import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, X, Pencil, ArrowLeft, ArrowRight, Loader2, Image as ImageIcon,
  Sparkles, Globe, MessageCircle, User, RotateCcw, PartyPopper, Maximize2, Plus
} from 'lucide-react';
import { getThumbnail } from '../utils/image';

const API_URL = import.meta.env.VITE_API_URL || '';
const UNDO_MS = 5000;

const REJECT_REASONS = ['Photos too unclear', 'Price too high', 'Wrong/missing details', 'Not a fit for the store', 'Authenticity concern'];

function sourceOf(tags) {
  // pending API returns tags as an array; tolerate a comma-string too.
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

// Only the special case (re-review) gets a badge; new submissions are the default.
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

// In-place editor for the focused review card. Reuses the same endpoints as the full
// editor page (update-listing + product-image), so the standalone page stays untouched.
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

export default function ReviewQueue() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doneToday, setDoneToday] = useState(0);
  const [toast, setToast] = useState(null);          // { msg, listing }
  const [sheet, setSheet] = useState(null);          // { type:'reject'|'revise', listing }
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);                      // { listing, timer }
  const touchX = useRef(null);
  const [editListing, setEditListing] = useState(null); // full listing (action=listing) being edited
  const [editLoading, setEditLoading] = useState(false);

  const current = queue[0] || null;
  // Edit mode is derived: on only while the loaded listing matches the focused card,
  // so moving to a new item (approve/skip) drops out of edit mode automatically.
  const editing = !!editListing && editListing.id === current?.id;

  // Open the in-place editor: fetch the full listing (pending payload lacks color,
  // original_price, chest/hip, image IDs).
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

  // Merge saved fields back into the queued card so it reflects the edit without a refetch.
  const onEditorSaved = useCallback((merged, listingId) => {
    setQueue(q => q.map(l => l.id === listingId ? { ...l, ...merged } : l));
    setEditListing(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin-listings?action=pending`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        });
        const data = await res.json();
        if (data.success) {
          // needs-revision items are awaiting the seller — not actionable here.
          // They live on the dashboard's "Waiting on sellers" block instead.
          const actionable = (data.listings || []).filter(l => !(l.tags || []).includes('needs-revision'));
          const revised = actionable.filter(l => (l.tags || []).includes('seller-revised'));
          const fresh = actionable.filter(l => !(l.tags || []).includes('seller-revised'));
          setQueue([...revised, ...fresh]); // re-review first, then new submissions
        }
      } catch { /* surfaced via empty state */ }
      setLoading(false);
    })();
  }, []);

  // Fire the actual approve call (deferred so Undo never sends a premature email).
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

  useEffect(() => () => flushPending(), [flushPending]); // commit on unmount

  const approve = useCallback((listing) => {
    if (!listing) return;
    flushPending();                                  // commit any prior approval
    setQueue(q => q.filter(l => l.id !== listing.id));
    setDoneToday(n => n + 1);
    const timer = setTimeout(() => { commitApprove(listing); pending.current = null; setToast(t => (t && t.listing.id === listing.id ? null : t)); }, UNDO_MS);
    pending.current = { listing, timer };
    setToast({ msg: `Approved "${listing.product_name}"`, listing });
  }, [flushPending, commitApprove]);

  const undoApprove = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    const l = pending.current.listing;
    pending.current = null;
    setQueue(q => [l, ...q]);
    setDoneToday(n => Math.max(0, n - 1));
    setToast(null);
  }, []);

  const skip = useCallback((listing) => {
    if (!listing) return;
    setQueue(q => (q.length <= 1 ? q : [...q.slice(1), q[0]]));
  }, []);

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
      setQueue(q => q.filter(l => l.id !== listing.id));
      setDoneToday(n => n + 1);
      setSheet(null);
    } catch (e) { alert('Failed to reject: ' + e.message); }
    setBusy(false);
  }

  async function confirmRevise(note) {
    const listing = sheet?.listing;
    if (!listing || !note?.trim()) return;
    setBusy(true);
    flushPending();
    try {
      await fetch(`${API_URL}/api/admin-listings?action=request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ shopifyProductId: listing.id, note: note.trim(), adminEmail: localStorage.getItem('admin_email') || undefined }),
      });
      setQueue(q => q.filter(l => l.id !== listing.id));
      setDoneToday(n => n + 1);
      setSheet(null);
    } catch (e) { alert('Failed to send revision: ' + e.message); }
    setBusy(false);
  }

  // Keyboard shortcuts (desktop). Disabled while a sheet is open (so typing works).
  useEffect(() => {
    function onKey(e) {
      if (sheet || !current || editing) return;
      if (document.querySelector('[data-lightbox]')) return; // image zoom open — let it own the keys
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'a' || e.key === 'ArrowRight') { e.preventDefault(); approve(current); }
      else if (k === 'arrowleft' || e.key === 'ArrowLeft') { e.preventDefault(); skip(current); }
      else if (k === 'e') { e.preventDefault(); setSheet({ type: 'revise', listing: current }); }
      else if (k === 'x') { e.preventDefault(); setSheet({ type: 'reject', listing: current }); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, sheet, editing, approve, skip]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  }

  const left = queue.length;
  const total = doneToday + left;
  const pct = total ? Math.round((doneToday / total) * 100) : 100;

  return (
    <div className="max-w-5xl mx-auto pb-28">
      {/* Progress header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/admin/dashboard')} className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg" aria-label="Back to dashboard"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-900">{left} to review</span>
            <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {doneToday} done today</span>
          </div>
          <div className="h-1.5 bg-stone-100 rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
        <span className="hidden md:inline text-xs text-stone-400">A approve · E revise · X reject · ←/→</span>
      </div>

      {!current ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-stone-200">
          <PartyPopper className="w-14 h-14 mx-auto mb-3 text-green-500" />
          <p className="text-xl font-semibold text-stone-900">All caught up</p>
          <p className="text-sm text-stone-500 mt-1">{doneToday > 0 ? `${doneToday} reviewed today — nice.` : 'Nothing pending approval.'}</p>
          <button onClick={() => navigate('/admin/dashboard')} className="mt-5 px-4 py-2 text-sm rounded-xl bg-stone-900 text-white">Back to dashboard</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
          {/* Desktop queue rail */}
          <div className="hidden md:block">
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden sticky top-4">
              {(() => {
                const reReview = queue.filter(isReReview);
                const fresh = queue.filter(l => !isReReview(l));
                const Row = (l) => (
                  <div key={l.id} className={`flex items-center gap-2 px-3 py-2 border-b border-stone-50 last:border-0 ${l.id === current.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}>
                    <div className="w-8 h-8 rounded bg-stone-100 overflow-hidden flex-shrink-0">
                      {l.images?.[0] ? <img src={getThumbnail(l.images[0])} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-stone-300 m-2" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-stone-800 truncate">{l.designer} · {l.product_name}</p>
                      <p className="text-[11px] truncate" style={{ color: l.seller?.isNew ? '#b45309' : '#78716c' }}>{l.seller?.isNew ? 'New seller' : 'Returning'}</p>
                    </div>
                  </div>
                );
                return (
                  <>
                    {reReview.length > 0 && (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-50 px-3 py-1.5">Re-review · {reReview.length}</p>
                        {reReview.slice(0, 8).map(Row)}
                      </>
                    )}
                    {fresh.length > 0 && (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 bg-stone-50 px-3 py-1.5">New · {fresh.length}</p>
                        {fresh.slice(0, 10).map(Row)}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Focused review card */}
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
            {/* Photos (read mode; the editor manages its own photo strip) */}
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

              {/* What the seller was asked to fix — pinned on top, both view & edit modes */}
              {isReReview(current) && (
                <div className="mt-4 rounded-xl bg-sky-50 border border-sky-100 p-3">
                  <p className="text-xs font-semibold text-sky-800 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    {current.revisionRequestedByName
                      ? `Seller revised this — ${current.revisionRequestedByName} asked them to fix:`
                      : "Seller revised this — you'd asked them to fix:"}
                  </p>
                  <p className="text-sm text-sky-900 mt-1">{current.revisionNote || 'No note was saved with the original request.'}</p>
                  {current.revisionFields?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {current.revisionFields.map(f => (
                        <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-white text-sky-700 border border-sky-200 capitalize">{f}</span>
                      ))}
                    </div>
                  )}
                  {current.sellerReply && (
                    <div className="mt-3 pt-3 border-t border-sky-200">
                      <p className="text-xs font-semibold text-sky-800 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Their reply:</p>
                      <p className="text-sm text-sky-900 mt-1 whitespace-pre-wrap">{current.sellerReply}</p>
                    </div>
                  )}
                </div>
              )}

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

                  {/* Inline detail — no click-through needed */}
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
        </div>
      )}

      {/* Bottom action bar — fixed, thumb-zone. Reject kept far from Approve. */}
      {current && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-stone-200 px-4 py-3 z-40">
          <div className="max-w-5xl mx-auto flex items-center gap-2 md:gap-3">
            <button onClick={() => setSheet({ type: 'reject', listing: current })}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 text-red-600 text-sm hover:bg-red-50">
              <X className="w-4 h-4" /> Reject
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

      {/* Undo toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-stone-900 text-white shadow-lg max-w-[92%]">
          <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-sm truncate">{toast.msg}</span>
          <button onClick={undoApprove} className="flex items-center gap-1 text-sm font-medium text-white ml-1"><RotateCcw className="w-3.5 h-3.5" /> Undo</button>
        </div>
      )}

      {/* Reject / Revise sheet */}
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

  // While zoomed: Esc closes, arrows page through photos (keyboard is owned here).
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
  const [note, setNote] = useState('');
  return (
    <div>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
        placeholder={`What should ${sellerName || 'the seller'} fix? (sent to them)`}
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-stone-400 mb-3" />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 text-sm rounded-xl border border-stone-200 text-stone-600">Cancel</button>
        <button onClick={() => onConfirm(note)} disabled={busy || !note.trim()}
          className="flex-1 py-2.5 text-sm rounded-xl bg-amber-600 text-white font-medium disabled:opacity-40 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Send request
        </button>
      </div>
    </div>
  );
}
