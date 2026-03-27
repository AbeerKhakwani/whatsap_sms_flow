import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { CONDITION_COLORS } from '../../data/mockListings';

export default function ListingCard({ listing }) {
  const [saved, setSaved] = useState(listing.saved);
  const [imgIndex, setImgIndex] = useState(0);

  return (
    <div className="group relative">
      {/* Image */}
      <Link to={`/store/item/${listing.id}`} className="block">
        <div
          className="relative overflow-hidden rounded-2xl bg-stone-100 aspect-[3/4]"
          onMouseEnter={() => listing.images[1] && setImgIndex(1)}
          onMouseLeave={() => setImgIndex(0)}
        >
          <img
            src={listing.images[imgIndex]}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {/* Sold overlay */}
          {listing.sold && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="text-sm font-semibold text-stone-500 tracking-widest uppercase">Sold</span>
            </div>
          )}

          {/* Condition badge */}
          <div className="absolute top-3 left-3">
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${CONDITION_COLORS[listing.condition]}`}>
              {listing.condition}
            </span>
          </div>

          {/* Bids badge */}
          {listing.bids > 0 && (
            <div className="absolute top-3 right-10">
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                {listing.bids} bid{listing.bids !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Save button */}
      <button
        onClick={() => setSaved(!saved)}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
      >
        <Heart
          size={13}
          className={saved ? 'fill-red-500 text-red-500' : 'text-stone-500'}
        />
      </button>

      {/* Details */}
      <Link to={`/store/item/${listing.id}`} className="block mt-3 px-1">
        <p className="text-[11px] font-semibold tracking-wider text-amber-700 uppercase">{listing.designer}</p>
        <p className="text-sm font-medium text-stone-900 mt-0.5 leading-snug">{listing.title}</p>
        <div className="flex items-center justify-between mt-1.5">
          <div>
            <span className="text-sm font-semibold text-stone-900">${listing.price}</span>
            {listing.originalRetail && (
              <span className="text-xs text-stone-400 line-through ml-2">${listing.originalRetail}</span>
            )}
          </div>
          <span className="text-xs text-stone-400">{listing.size}</span>
        </div>
        {listing.highestBid && (
          <p className="text-xs text-amber-700 mt-1">
            Top bid: ${listing.highestBid}
          </p>
        )}
      </Link>
    </div>
  );
}
