import type { ProductSummary } from '@gear-store/shared';
import { useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { useToggleWishlist, useWishlist } from '../../lib/queries';

/** Save to wishlist. Guests are sent to sign in and come back to this page afterwards. */
export function SaveButton({ product, className = '' }: { product: ProductSummary; className?: string }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const wishlist = useWishlist();
  const toggle = useToggleWishlist();
  const saved = wishlist.data?.some((p) => p.slug === product.slug) ?? false;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      disabled={status === 'restoring'}
      onClick={() => {
        if (status !== 'signed-in') {
          void navigate(`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`);
          return;
        }
        toggle.mutate({ product, save: !saved });
      }}
      className={`grid size-11 place-items-center border bg-alu-50 transition-colors ${
        saved ? 'border-ink text-ink' : 'border-bench text-ink-3 hover:border-ink hover:text-ink'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        {/* a bookmark tag, drawn like the rest of the line icons */}
        <path
          d="M7 4h10v16l-5-4-5 4z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
