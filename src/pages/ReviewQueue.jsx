import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Check, X, Pencil, ArrowLeft, ArrowRight, Loader2, Image as ImageIcon,
  Sparkles, Globe, MessageCircle, User, ChevronDown, RotateCcw, PartyPopper
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

  const current = queue[0] || null;

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
        body: JSON.stringify({ shopifyProductId: listing.id, note: note.trim() }),
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
      if (sheet || !current) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'a' || e.key === 'ArrowRight') { e.preventDefault(); approve(current); }
      else if (k === 'arrowleft' || e.key === 'ArrowLeft') { e.preventDefault(); skip(current); }
      else if (k === 'e') { e.preventDefault(); setSheet({ type: 'revise', listing: current }); }
      else if (k === 'x') { e.preventDefault(); setSheet({ type: 'reject', listing: current }); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, sheet, approve, skip]);

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
              {queue.slice(0, 12).map((l, i) => (
                <div key={l.id} className={`flex items-center gap-2 px-3 py-2 border-b border-stone-50 last:border-0 ${i === 0 ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}>
                  <div className="w-8 h-8 rounded bg-stone-100 overflow-hidden flex-shrink-0">
                    {l.images?.[0] ? <img src={getThumbnail(l.images[0])} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-stone-300 m-2" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-stone-800 truncate">{l.designer} · {l.product_name}</p>
                    <p className="text-[11px] truncate" style={{ color: l.seller?.isNew ? '#b45309' : '#78716c' }}>{l.seller?.isNew ? 'New seller' : 'Returning'}</p>
                  </div>
                </div>
              ))}
              {queue.length > 12 && <p className="text-[11px] text-stone-400 px-3 py-2">+{queue.length - 12} more</p>}
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
            {/* Photos */}
            <div className="relative aspect-[4/3] bg-stone-100">
              <PhotoGallery key={current.id} images={current.images} alt={current.product_name} />
            </div>

            <div className="p-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center text-[11px] font-semibold text-stone-600">
                  {(current.seller?.name || current.seller?.email || '?')[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-medium text-stone-800">{current.seller?.name || current.seller?.email || 'Unknown seller'}</span>
                <SellerFlag seller={current.seller} />
                <span className="ml-auto"><SourceBadge tags={current.tags} /></span>
              </div>

              <h1 className="text-lg font-semibold text-stone-900 leading-tight">{current.designer} <span className="text-stone-300">·</span> <span className="text-stone-600 font-normal">{current.product_name}</span></h1>

              <div className="flex gap-2 flex-wrap mt-3">
                <span className="text-sm font-semibold px-3 py-1 rounded-lg bg-stone-50 text-stone-800">${current.asking_price_usd || 0}</span>
                {current.size && <span className="text-sm px-3 py-1 rounded-lg bg-stone-50 text-stone-600">{current.size}</span>}
                {current.condition && <span className="text-sm px-3 py-1 rounded-lg bg-stone-50 text-stone-600">{current.condition}</span>}
              </div>

              <Link to={`/admin/listings/${current.id}`} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mt-3">
                <ChevronDown className="w-4 h-4" /> More details &amp; edit fields
              </Link>
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
  if (!images?.length) {
    return <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-12 h-12 text-stone-300" /></div>;
  }
  return (
    <>
      <img src={getThumbnail(images[idx])} alt={alt} className="w-full h-full object-cover" />
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`Photo ${i + 1}`}
              className="w-2 h-2 rounded-full" style={{ background: i === idx ? '#1c1917' : 'rgba(0,0,0,0.25)' }} />
          ))}
        </div>
      )}
    </>
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
