import { CheckCircle2 } from 'lucide-react';
import { buyerAcceptance } from '../../lib/buyer-acceptance.js';

// Shared "✓ Buyer accepted" chip. Renders nothing until the sale is accepted (buyer
// confirmed via text, or auto-cleared after 3 days). Used on both the admin seller page
// and the seller's own portal so the look + rule never drift apart.
export default function BuyerAcceptedBadge({ reviewRespondedAt, payoutStatus, className = '' }) {
  const { accepted, label, sublabel } = buyerAcceptance({ reviewRespondedAt, payoutStatus });
  if (!accepted) return null;

  return (
    <span
      title={`${label} — ${sublabel}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 ${className}`}
    >
      <CheckCircle2 className="w-3 h-3" />
      {label}
      <span className="font-normal text-green-600">· {sublabel}</span>
    </span>
  );
}
