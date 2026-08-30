import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import StoreNav from '../../components/store/StoreNav';
import ListingCard from '../../components/store/ListingCard';
import { LISTINGS, DESIGNERS } from '../../data/mockListings';
import { CONDITIONS, CONDITION_LABELS } from '../../../lib/conditions.js';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Unstitched'];

const PIECES = ['Kurta', '2-piece', '3-piece', 'Unstitched'];

function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white text-xs rounded-full">
      {label}
      <button onClick={onRemove}><X size={10} /></button>
    </span>
  );
}

function FilterSection({ title, options, selected, onToggle }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-stone-100 pb-4 mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-sm font-semibold text-stone-900 mb-3"
      >
        {title}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-wrap gap-2">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                selected.includes(opt)
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'border-stone-200 text-stone-600 hover:border-stone-400'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState({
    type: 'all', // all | stitched | unstitched
    designers: searchParams.get('designer') ? [searchParams.get('designer')] : [],
    sizes: [],
    conditions: [],
    pieces: [],
    hasBids: false,
    priceMax: 500,
  });

  const [sort, setSort] = useState('newest');

  const toggleFilter = (key, value) => {
    setFilters(f => ({
      ...f,
      [key]: f[key].includes(value)
        ? f[key].filter(v => v !== value)
        : [...f[key], value],
    }));
  };

  const activeFilters = [
    ...filters.designers.map(d => ({ label: d, key: 'designers', value: d })),
    ...filters.sizes.map(s => ({ label: s, key: 'sizes', value: s })),
    ...filters.conditions.map(c => ({ label: c, key: 'conditions', value: c })),
    ...filters.pieces.map(p => ({ label: p, key: 'pieces', value: p })),
    ...(filters.hasBids ? [{ label: 'Has bids', key: 'hasBids', value: true }] : []),
  ];

  const clearFilter = (key, value) => {
    if (key === 'hasBids') {
      setFilters(f => ({ ...f, hasBids: false }));
    } else {
      setFilters(f => ({ ...f, [key]: f[key].filter(v => v !== value) }));
    }
  };

  const filtered = useMemo(() => {
    let results = [...LISTINGS];

    if (filters.type === 'stitched') results = results.filter(l => l.pieces !== 'Unstitched');
    if (filters.type === 'unstitched') results = results.filter(l => l.pieces === 'Unstitched');
    if (filters.designers.length) results = results.filter(l => filters.designers.includes(l.designer));
    if (filters.sizes.length) results = results.filter(l => filters.sizes.includes(l.size));
    if (filters.conditions.length) results = results.filter(l => filters.conditions.includes(l.condition));
    if (filters.pieces.length) results = results.filter(l => filters.pieces.includes(l.pieces));
    if (filters.hasBids) results = results.filter(l => l.bids > 0);
    results = results.filter(l => l.price <= filters.priceMax);

    if (sort === 'price-asc') results.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') results.sort((a, b) => b.price - a.price);
    if (sort === 'most-bids') results.sort((a, b) => b.bids - a.bids);

    return results;
  }, [filters, sort]);

  const Sidebar = () => (
    <div className="space-y-0">
      <FilterSection title="Designer" options={DESIGNERS} selected={filters.designers} onToggle={v => toggleFilter('designers', v)} />
      <FilterSection title="Size" options={SIZES} selected={filters.sizes} onToggle={v => toggleFilter('sizes', v)} />
      <FilterSection title="Condition" options={CONDITIONS} selected={filters.conditions} onToggle={v => toggleFilter('conditions', v)} />
      <FilterSection title="Pieces" options={PIECES} selected={filters.pieces} onToggle={v => toggleFilter('pieces', v)} />

      {/* Price range */}
      <div className="pb-4 mb-4">
        <p className="text-sm font-semibold text-stone-900 mb-3">Max price: ${filters.priceMax}</p>
        <input
          type="range" min={20} max={500} step={10}
          value={filters.priceMax}
          onChange={e => setFilters(f => ({ ...f, priceMax: Number(e.target.value) }))}
          className="w-full accent-stone-900"
        />
        <div className="flex justify-between text-xs text-stone-400 mt-1">
          <span>$20</span><span>$500</span>
        </div>
      </div>

      {/* Has bids toggle */}
      <button
        onClick={() => setFilters(f => ({ ...f, hasBids: !f.hasBids }))}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors ${
          filters.hasBids ? 'border-amber-700 bg-amber-50 text-amber-700' : 'border-stone-200 text-stone-600'
        }`}
      >
        <span>Has active bids</span>
        <div className={`w-9 h-5 rounded-full transition-colors ${filters.hasBids ? 'bg-amber-600' : 'bg-stone-200'} relative`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${filters.hasBids ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <StoreNav />

      <div className="pt-14 max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="py-8">
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Shop</h1>
          <p className="text-sm text-stone-400 mt-1">Authenticated preloved Pakistani designer fashion</p>
        </div>

        {/* Type tabs */}
        <div className="flex gap-2 mb-6">
          {['all', 'stitched', 'unstitched'].map(t => (
            <button
              key={t}
              onClick={() => setFilters(f => ({ ...f, type: t }))}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
                filters.type === t
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 text-stone-600 hover:border-stone-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {activeFilters.map(f => (
              <FilterChip key={f.label} label={f.label} onRemove={() => clearFilter(f.key, f.value)} />
            ))}
            <button
              onClick={() => setFilters({ type: 'all', designers: [], sizes: [], conditions: [], pieces: [], hasBids: false, priceMax: 500 })}
              className="text-xs text-stone-400 hover:text-stone-900 underline"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-52 flex-none">
            <Sidebar />
          </aside>

          {/* Main grid */}
          <div className="flex-1">
            {/* Sort + count bar */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-stone-500">
                <span className="font-semibold text-stone-900">{filtered.length}</span> results
              </p>
              <div className="flex items-center gap-3">
                {/* Mobile filter button */}
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="md:hidden flex items-center gap-1.5 px-3 py-1.5 border border-stone-200 rounded-full text-sm text-stone-600"
                >
                  <SlidersHorizontal size={13} />
                  Filters {activeFilters.length > 0 && `(${activeFilters.length})`}
                </button>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="text-sm border border-stone-200 rounded-full px-3 py-1.5 bg-white text-stone-700 outline-none"
                >
                  <option value="newest">Newest first</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="most-bids">Most bids</option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-stone-400 text-sm">No results for these filters.</p>
                <button
                  onClick={() => setFilters({ type: 'all', designers: [], sizes: [], conditions: [], pieces: [], hasBids: false, priceMax: 500 })}
                  className="mt-3 text-sm text-stone-900 underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5 pb-24 md:pb-8">
                {filtered.map(listing => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setFiltersOpen(false)} />
          <div className="w-80 bg-white overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-stone-100">
              <h3 className="font-semibold text-stone-900">Filters</h3>
              <button onClick={() => setFiltersOpen(false)}><X size={18} /></button>
            </div>
            <div className="p-4">
              <Sidebar />
            </div>
            <div className="sticky bottom-0 p-4 bg-white border-t border-stone-100">
              <button
                onClick={() => setFiltersOpen(false)}
                className="w-full py-3 bg-stone-900 text-white rounded-full text-sm font-medium"
              >
                Show {filtered.length} results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
