import { PAYMENT_WINDOW_MINUTES } from '@gear-store/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { AddressForm, AddressLines } from '../../components/checkout/AddressForm';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { Price } from '../../components/ui/Price';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart';
import { useAddresses, useCheckout } from '../../lib/orders';

const redirectSchema = z.object({ redirectUrl: z.url() });

export function CheckoutPage() {
  const { cart, isLoading } = useCart();
  const addresses = useAddresses();
  const checkout = useCheckout();
  const { authed } = useAuth();
  const navigate = useNavigate();
  const [chosenId, setChosenId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  // one key per visit to this page: a double click or a retried request cannot place two orders
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const list = addresses.data ?? [];
  const address = list.find((a) => a.id === chosenId) ?? list.find((a) => a.isDefault) ?? list[0];
  const showForm = adding || (addresses.isSuccess && list.length === 0);

  if (isLoading || addresses.isPending) {
    return (
      <p className="mx-auto max-w-7xl px-4 py-16 font-mono text-sm text-ink-3 sm:px-6">Loading checkout…</p>
    );
  }
  if (!cart || cart.items.length + cart.builds.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-16 sm:px-6">
        <h1 className="font-expanded text-3xl font-extrabold uppercase">Checkout</h1>
        <p className="text-ink-2">Your cart is empty.</p>
        <Link to="/#configure" className="font-semibold underline underline-offset-4">
          Build an E-1
        </Link>
      </div>
    );
  }

  const placeOrder = () => {
    if (!address) return;
    checkout.mutate(
      { addressId: address.id, idempotencyKey },
      {
        onSuccess: async (order) => {
          // straight on to the payment page; if that cannot be reached, the order page offers "Pay now"
          setPaying(true);
          try {
            const { redirectUrl } = await authed((accessToken) =>
              api(`/me/orders/${order.number}/pay`, {
                method: 'POST',
                accessToken,
                schema: redirectSchema,
              }),
            );
            window.location.assign(redirectUrl);
          } catch {
            void navigate(`/orders/${order.number}?payment=unavailable`, { replace: true });
          }
        },
      },
    );
  };

  const total = cart.subtotal + (address?.shippingFee ?? 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-1 border-b border-ink pb-4">
        <Label>Step 1 of 2 · then pay with Midtrans (sandbox)</Label>
        <h1 className="font-expanded text-4xl font-extrabold uppercase">Checkout</h1>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="ship-title" className="space-y-4">
          <h2 id="ship-title" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            Ship to
          </h2>
          {addresses.isError && <Notice tone="error">{addresses.error.message}</Notice>}
          {list.length > 0 && !adding && (
            <fieldset className="space-y-2">
              <legend className="sr-only">Choose a shipping address</legend>
              {list.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer gap-3 border bg-alu-50 p-4 ${a.id === address?.id ? 'border-ink' : 'border-bench hover:border-bench-strong'}`}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={a.id === address?.id}
                    onChange={() => setChosenId(a.id)}
                    className="mt-1 size-4 accent-ink"
                  />
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    {a.label && <Label>{a.label}</Label>}
                    <AddressLines address={a} />
                    <p className="font-mono text-xs text-ink-2">
                      Shipping <Price amount={a.shippingFee} className="font-normal" /> · {a.shippingEta}
                    </p>
                  </div>
                </label>
              ))}
              <Button variant="ghost" onClick={() => setAdding(true)}>
                Add another address
              </Button>
            </fieldset>
          )}
          {showForm && (
            <div className="border border-bench bg-alu-50 p-4">
              <AddressForm
                onSaved={(a) => {
                  setChosenId(a.id);
                  setAdding(false);
                }}
                onCancel={list.length > 0 ? () => setAdding(false) : undefined}
              />
            </div>
          )}
        </section>

        <section
          aria-labelledby="summary-title"
          className="h-fit space-y-4 border border-ink bg-alu-50 p-4 sm:p-6"
        >
          <h2 id="summary-title" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            Order summary
          </h2>
          <ul className="divide-y divide-bench">
            {cart.builds.map((b) => (
              <li key={b.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  {b.quote.label}
                  <span className="block font-mono text-xs text-ink-3">
                    {b.quantity} × {b.quote.parts.length} parts
                    {b.quote.colorLabel && ` · ${b.quote.colorLabel}`}
                  </span>
                </span>
                <Price amount={b.lineTotal} className="shrink-0" />
              </li>
            ))}
            {cart.items.map((i) => (
              <li key={`${i.product.slug}:${i.colorKey}`} className="flex justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  {i.product.name}
                  <span className="block font-mono text-xs text-ink-3">
                    {i.quantity} × {i.product.model}
                    {i.colorLabel && ` · ${i.colorLabel}`}
                  </span>
                </span>
                <Price amount={i.lineTotal} className="shrink-0" />
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-ink pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>
                <Price amount={cart.subtotal} className="font-normal" />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping{address && ` to ${address.province}`}</dt>
              <dd>{address ? <Price amount={address.shippingFee} className="font-normal" /> : '–'}</dd>
            </div>
            <div className="flex justify-between border-t border-bench pt-2 text-base">
              <dt className="font-semibold">Total</dt>
              <dd>
                <Price amount={total} />
              </dd>
            </div>
          </dl>

          {!cart.canCheckout && (
            <Notice tone="error">
              Some items are out of stock or over the stock left. Fix them in the cart first.
            </Notice>
          )}
          {checkout.error && <Notice tone="error">{checkout.error.message}</Notice>}
          <Button
            className="w-full"
            disabled={!address || !cart.canCheckout || checkout.isPending || paying}
            onClick={placeOrder}
          >
            {paying ? 'Opening payment…' : checkout.isPending ? 'Placing order…' : 'Place order and pay'}
          </Button>
          <p className="text-xs text-ink-3">
            The items are held for {PAYMENT_WINDOW_MINUTES} minutes while you pay. This is a demo: Midtrans
            runs in sandbox mode and no real money moves.
          </p>
        </section>
      </div>
    </div>
  );
}
