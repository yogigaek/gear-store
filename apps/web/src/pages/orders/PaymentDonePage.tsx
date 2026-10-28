import { orderNumberSchema } from '@gear-store/shared';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Label } from '../../components/ui/Label';
import { useAuth } from '../../lib/auth-context';

/**
 * Where Midtrans sends the shopper after its payment page, with ?order_id=…. Signed in here, that is the order
 * page. Paid from the phone app, this browser holds no session: the app reads the order itself, so the page only
 * says where to go. The status Midtrans adds to the address is never shown: anyone can type it.
 */
export function PaymentDonePage() {
  const [params] = useSearchParams();
  const { status } = useAuth();
  const number = orderNumberSchema.safeParse(params.get('order_id'));

  if (number.success && status === 'signed-in') return <Navigate to={`/orders/${number.data}`} replace />;
  if (status === 'restoring') {
    return (
      <p role="status" className="mx-auto max-w-7xl px-4 py-16 font-mono text-sm text-ink-3 sm:px-6">
        Restoring your session…
      </p>
    );
  }
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-24 sm:px-6">
      <Label>Payment</Label>
      <h1 className="font-expanded text-4xl font-extrabold uppercase">Back from the payment page</h1>
      <p className="max-w-prose text-ink-2">
        {number.success ? `Order ${number.data} shows Paid` : 'Your order shows Paid'} as soon as Midtrans
        confirms the payment. A bank transfer can take a few minutes.
      </p>
      <p className="max-w-prose text-ink-2">Paid in the Rakit app? Close this window to go back to it.</p>
      {number.success && (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <a href={`rakit://orders/${number.data}`} className="font-semibold underline underline-offset-4">
            Open the order in the app
          </a>
          <Link to={`/orders/${number.data}`} className="font-semibold underline underline-offset-4">
            View the order on the web
          </Link>
        </div>
      )}
    </div>
  );
}
