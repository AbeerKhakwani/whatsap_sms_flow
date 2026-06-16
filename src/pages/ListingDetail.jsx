import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Check, X, RotateCcw, Loader2, ExternalLink, User,
  Camera, Trash2, Plus, Tag as TagIcon, AlertCircle
} from 'lucide-react';
import { getThumbnail } from '../utils/image';

const API_URL = import.meta.env.VITE_API_URL || '';
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Unstitched'];
const CONDITIONS = ['New with tags', 'Like new', 'Excellent', 'Good', 'Fair'];
const REJECTION_REASONS = [
  'Poor Photo Quality', 'Missing Information', 'Not Pakistani Designer',
  'Condition Issues', 'Pricing Too High', 'Duplicate Listing', 'Not Eligible for Resale', 'Other'
];

const FIELD = 'w-full px-3 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400';
const LABEL = 'block text-xs font-medium text-stone-500 mb-1';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  // action modals
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseNote, setReviseNote] = useState('');

  useEffect(() => { fetchListing(); }, [id]);

  async function fetchListing() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=listing&id=${id}`);
      const data = await res.json();
      if (data.success) {
        setListing(data.listing);
        setForm({
          designer: data.listing.designer || '',
          item_type: data.listing.item_type || '',
          size: data.listing.size || '',
          color: data.listing.color || '',
          condition: data.listing.condition || '',
          material: data.listing.material || '',
          chest: data.listing.chest || '',
          hip: data.listing.hip || '',
          description: data.listing.description || '',
          asking_price: data.listing.asking_price_usd || '',
          original_price: data.listing.original_price || '',
          commission_rate: data.listing.commission_rate ?? '',
          tags: data.listing.tags || [],
        });
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setSavedAt(null); }

  // Live payout preview
  const ask = parseFloat(form?.asking_price);
  const commission = form?.commission_rate !== '' ? parseFloat(form?.commission_rate) : 18;
  const listPrice = isNaN(ask) ? null : ask + 10;
  const payout = isNaN(ask) ? null : ask * (1 - (commission || 0) / 100);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=update-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...form }),
      });
      const data = await res.json();
      if (data.success) { setSavedAt(Date.now()); fetchListing(); }
      else alert('Failed to save: ' + (data.error || 'Unknown error'));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  // Tags
  function addTag(t) {
    const v = (t || '').trim();
    if (!v || form.tags.includes(v)) return;
    set('tags', [...form.tags, v]);
    setTagInput('');
  }
  function removeTag(t) { set('tags', form.tags.filter(x => x !== t)); }

  // Photos
  async function onFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch(`${API_URL}/api/product-image?action=add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, base64, filename: file.name }),
      });
      const data = await res.json();
      if (data.success) setListing(l => ({ ...l, images: [...l.images, { id: data.imageId, src: data.imageUrl }] }));
      else alert('Upload failed: ' + (data.error || 'Unknown'));
    } catch (e) { alert('Upload error: ' + e.message); }
    finally { setPhotoBusy(false); }
  }

  async function deletePhoto(imageId) {
    if (!confirm('Remove this photo?')) return;
    setPhotoBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/product-image?action=delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, imageId }),
      });
      const data = await res.json();
      if (data.success) setListing(l => ({ ...l, images: l.images.filter(img => img.id !== imageId) }));
      else alert('Delete failed: ' + (data.error || 'Unknown'));
    } catch (e) { alert('Delete error: ' + e.message); }
    finally { setPhotoBusy(false); }
  }

  // Approval actions
  async function doApprove() {
    setBusyAction('approve');
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyProductId: id }),
      });
      const data = await res.json();
      if (data.success) navigate('/admin/dashboard');
      else alert('Failed: ' + (data.error || 'Unknown'));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setBusyAction(null); }
  }

  async function doReject() {
    if (!rejectReason) { alert('Pick a reason'); return; }
    setBusyAction('reject');
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyProductId: id, reason: rejectReason, note: rejectNote.trim() || null }),
      });
      const data = await res.json();
      if (data.success) navigate('/admin/dashboard');
      else alert('Failed: ' + (data.error || 'Unknown'));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setBusyAction(null); }
  }

  async function doRevise() {
    if (!reviseNote.trim()) return;
    setBusyAction('revise');
    try {
      const res = await fetch(`${API_URL}/api/admin-listings?action=request-revision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyProductId: id, note: reviseNote.trim() }),
      });
      const data = await res.json();
      if (data.success) { setReviseOpen(false); navigate('/admin/dashboard'); }
      else alert('Failed: ' + (data.error || 'Unknown'));
    } catch (e) { alert('Error: ' + e.message); }
    finally { setBusyAction(null); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (!listing || !form) return <div className="p-8 text-stone-500">Listing not found. <button onClick={() => navigate(-1)} className="text-indigo-600">Back</button></div>;

  const isLive = listing.status === 'active';

  return (
    <div className="max-w-2xl mx-auto pb-28">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-stone-200 flex-shrink-0">
          {listing.images?.[0]
            ? <img src={getThumbnail(listing.images[0].src)} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-stone-400"><Camera className="w-6 h-6" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-stone-900 leading-tight">{form.designer || 'Untitled'} <span className="text-stone-400">·</span> {form.item_type || 'Item'}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isLive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {isLive ? 'Live' : 'Pending approval'}
            </span>
            <a href={listing.shopify_admin_url} target="_blank" rel="noreferrer" className="text-xs text-stone-400 hover:text-stone-600 inline-flex items-center gap-0.5">
              <ExternalLink className="w-3 h-3" /> Shopify
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Photos */}
        <Section title="Photos">
          <div className="flex flex-wrap gap-2">
            {listing.images?.map(img => (
              <div key={img.id} className="relative group w-20 h-20">
                <img src={getThumbnail(img.src)} alt="" className="w-20 h-20 object-cover rounded-lg border border-stone-200" />
                <button onClick={() => deletePhoto(img.id)} disabled={photoBusy}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow disabled:opacity-50">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} disabled={photoBusy}
              className="w-20 h-20 border-2 border-dashed border-stone-300 rounded-lg flex items-center justify-center text-stone-400 hover:border-stone-400 disabled:opacity-50">
              {photoBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFilePicked} className="hidden" />
          </div>
        </Section>

        {/* Basics */}
        <Section title="Details">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={LABEL}>Designer</label><input className={FIELD} value={form.designer} onChange={e => set('designer', e.target.value)} /></div>
            <div className="col-span-2"><label className={LABEL}>Item type</label><input className={FIELD} value={form.item_type} onChange={e => set('item_type', e.target.value)} placeholder="e.g. 3-piece suit" /></div>
            <div>
              <label className={LABEL}>Size</label>
              <select className={FIELD} value={form.size} onChange={e => set('size', e.target.value)}>
                <option value="">Select…</option>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                {form.size && !SIZES.includes(form.size) && <option value={form.size}>{form.size}</option>}
              </select>
            </div>
            <div>
              <label className={LABEL}>Condition</label>
              <select className={FIELD} value={form.condition} onChange={e => set('condition', e.target.value)}>
                <option value="">Select…</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                {form.condition && !CONDITIONS.includes(form.condition) && <option value={form.condition}>{form.condition}</option>}
              </select>
            </div>
            <div><label className={LABEL}>Color</label><input className={FIELD} value={form.color} onChange={e => set('color', e.target.value)} /></div>
            <div><label className={LABEL}>Material</label><input className={FIELD} value={form.material} onChange={e => set('material', e.target.value)} /></div>
            <div><label className={LABEL}>Chest (")</label><input className={FIELD} value={form.chest} onChange={e => set('chest', e.target.value)} placeholder="e.g. 20" /></div>
            <div><label className={LABEL}>Hip (")</label><input className={FIELD} value={form.hip} onChange={e => set('hip', e.target.value)} placeholder="e.g. 22" /></div>
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Asking price ($)</label><input className={FIELD} type="number" value={form.asking_price} onChange={e => set('asking_price', e.target.value)} /></div>
            <div><label className={LABEL}>Original retail ($)</label><input className={FIELD} type="number" value={form.original_price} onChange={e => set('original_price', e.target.value)} /></div>
            <div><label className={LABEL}>Commission (%)</label><input className={FIELD} type="number" value={form.commission_rate} onChange={e => set('commission_rate', e.target.value)} placeholder="18" /></div>
          </div>
          {listPrice != null && (
            <p className="text-xs text-stone-500 mt-2">
              Lists at <span className="font-medium text-stone-700">${listPrice.toFixed(2)}</span> (+$10 fee) · seller payout <span className="font-medium text-green-600">${payout.toFixed(2)}</span>
            </p>
          )}
        </Section>

        {/* Description */}
        <Section title="Description">
          <textarea className={`${FIELD} resize-y`} rows={4} value={form.description} onChange={e => set('description', e.target.value)} />
        </Section>

        {/* Tags */}
        <Section title="Tags">
          <div className="flex flex-wrap gap-2 mb-2">
            {form.tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-700 pl-2.5 pr-1.5 py-1 rounded-full">
                {t}
                <button onClick={() => removeTag(t)} className="text-stone-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={FIELD} value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
              placeholder="Add a tag and press Enter (e.g. concierge)" />
            <button onClick={() => addTag(tagInput)} className="px-3 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 flex items-center gap-1"><Plus className="w-4 h-4" /></button>
          </div>
        </Section>

        {/* Seller */}
        <Section title="Seller">
          {listing.seller ? (
            <div className="text-sm text-stone-700">
              <Link to={`/admin/sellers/${listing.seller.id}`} className="text-indigo-600 hover:underline font-medium inline-flex items-center gap-1">
                <User className="w-4 h-4" /> {listing.seller.name || 'Unnamed'}
              </Link>
              <p className="text-stone-500 text-xs mt-1">{listing.seller.email}{listing.seller.phone ? ` · ${listing.seller.phone}` : ''}</p>
            </div>
          ) : (
            <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> No seller linked.</p>
          )}
        </Section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-stone-200 px-4 py-3 flex items-center gap-2 z-40">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {savedAt ? 'Saved' : 'Save'}
        </button>
        <div className="flex-1" />
        {!isLive && (
          <>
            <button onClick={() => setReviseOpen(true)} className="px-3 py-2.5 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 inline-flex items-center gap-1.5"><RotateCcw className="w-4 h-4" /><span className="hidden sm:inline">Revise</span></button>
            <button onClick={() => setRejectOpen(true)} className="px-3 py-2.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 inline-flex items-center gap-1.5"><X className="w-4 h-4" /><span className="hidden sm:inline">Reject</span></button>
            <button onClick={doApprove} disabled={busyAction === 'approve'} className="px-4 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busyAction === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
            </button>
          </>
        )}
      </div>

      {/* Revise modal */}
      {reviseOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setReviseOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Request revision</h3>
            <p className="text-sm text-stone-500 mb-3">The seller gets a WhatsApp + email with your note and a link to update.</p>
            <textarea className={`${FIELD} resize-y`} rows={3} value={reviseNote} onChange={e => setReviseNote(e.target.value)} placeholder="What should the seller fix?" autoFocus />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setReviseOpen(false)} className="px-4 py-2 text-sm text-stone-600">Cancel</button>
              <button onClick={doRevise} disabled={busyAction === 'revise' || !reviseNote.trim()} className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg disabled:opacity-50">Send request</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setRejectOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Reject listing</h3>
            <label className={LABEL}>Reason</label>
            <select className={`${FIELD} mb-3`} value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
              <option value="">Select a reason…</option>
              {REJECTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <label className={LABEL}>Note (optional)</label>
            <textarea className={`${FIELD} resize-y`} rows={2} value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRejectOpen(false)} className="px-4 py-2 text-sm text-stone-600">Cancel</button>
              <button onClick={doReject} disabled={busyAction === 'reject' || !rejectReason} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50">Reject & notify</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        {title === 'Tags' && <TagIcon className="w-3.5 h-3.5" />}{title}
      </h2>
      {children}
    </div>
  );
}
