import { paymentWindowMinutes, type Cart, type CartLineInput, type ProductDetail } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { AddressForm, AddressLines } from '../../components/checkout/AddressForm';
import { LineList, type Line } from '../../components/checkout/LineList';
import { SandboxPaymentGuide } from '../../components/checkout/SandboxPaymentGuide';
import { PartImage } from '../../components/product/PartImage';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { PageTitle } from '../../components/ui/PageTitle';
import { Price } from '../../components/ui/Price';
import { SlowServerNote } from '../../components/ui/SlowServerNote';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { buyNowPath, finishSwapNote, parseBuyLine } from '../../lib/buy-now';
import { useCart, useLinesQuote } from '../../lib/cart';
import { cartScope, checkoutKey, closeCheckoutKey, hasOpenCartAttempt } from '../../lib/checkout-key';
import { useAddresses, useCheckout } from '../../lib/orders';

const redirectSchema = z.object({ redirectUrl: z.url() });

/** The whole cart, or with `?buy=<slug>&finish=<key>&qty=<n>` (Buy now) that one part, leaving the cart as it is. */
export function CheckoutPage() {
  const [params] = useSearchParams();
  const buying = params.has('buy');
  if (buying && !parseBuyLine(params)) {
    return (
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-16 sm:px-6">
        <PageTitle>Buy now</PageTitle>
        <h1 className="font-expanded text-3xl font-extrabold uppercase">Buy now</h1>
        <p className="text-ink-2">This link does not name a part to buy.</p>
        <Link to="/products" className="font-semibold underline underline-offset-4">
          Browse parts
        </Link>
      </div>
    );
  }
  // a new mode (or another part) starts with its own address choice, errors and pending state
  return <Checkout key={buying ? params.toString() : 'cart'} line={parseBuyLine(params)} />;
}

function Checkout({
  line: requested,
}: {
  /** the Buy-now line asked for; null for the cart */
  line: CartLineInput | null;
}) {
  const buying = requested !== null;
  const { cart, isLoading } = useCart();
  const quote = useLinesQuote(requested ? [requested] : null);
  const addresses = useAddresses();
  const checkout = useCheckout();
  const { authed, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chosenId, setChosenId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);

  const list = addresses.data ?? [];
  const address = list.find((a) => a.id === chosenId) ?? list.find((a) => a.isDefault) ?? list[0];
  const showForm = adding || (addresses.isSuccess && list.length === 0);
  const title = buying ? 'Buy now' : 'Checkout';

  const head = <PageTitle>{title}</PageTitle>;
  if ((buying ? quote.isPending : isLoading) || addresses.isPending) {
    return (
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-16 sm:px-6">
        {head}
        <p className="font-mono text-sm text-ink-3">Loading checkout…</p>
        <SlowServerNote />
      </div>
    );
  }
  if (buying && !quote.data) {
    return (
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-16 sm:px-6">
        {head}
        <h1 className="font-expanded text-3xl font-extrabold uppercase">{title}</h1>
        <Notice tone="error">
          {quote.error?.message ?? 'Something went wrong on our side.'}{' '}
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => void quote.refetch()}
          >
            Try again
          </button>
        </Notice>
      </div>
    );
  }
  const priced: Cart | undefined = buying ? quote.data : cart;
  // no reply (status 0): the order may exist, and the stock it holds would read as missing; the same key resends
  const lost = checkout.error instanceof ApiError && checkout.error.status === 0;
  if (!priced || priced.items.length + priced.builds.length === 0) {
    // an attempt left open (no reply, then a reload or a refetch) may have turned the cart into an order
    if (!buying && (lost || hasOpenCartAttempt())) {
      return (
        <div className="mx-auto max-w-7xl space-y-3 px-4 py-16 sm:px-6">
          {head}
          <h1 className="font-expanded text-3xl font-extrabold uppercase">{title}</h1>
          <p className="text-ink-2">
            Your cart is empty now: the last order attempt got no reply, so it may have gone through.
          </p>
          <Link to="/orders" className="font-semibold underline underline-offset-4">
            Check your orders
          </Link>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-16 sm:px-6">
        {head}
        <h1 className="font-expanded text-3xl font-extrabold uppercase">{title}</h1>
        {buying ? (
          <>
            <p className="text-ink-2">This part is not in the catalogue.</p>
            <Link to="/products" className="font-semibold underline underline-offset-4">
              Browse parts
            </Link>
          </>
        ) : (
          <>
            <p className="text-ink-2">Your cart is empty.</p>
            <Link to="/#configure" className="font-semibold underline underline-offset-4">
              Build an E-1
            </Link>
          </>
        )}
      </div>
    );
  }
  // Buy now orders the line as the quote has it: the API swaps a finish the part no longer has for its first
  const quoted = buying ? priced.items[0] : undefined;
  const buyLine: CartLineInput | undefined = quoted && {
    slug: quoted.product.slug,
    colorKey: quoted.colorKey,
    quantity: quoted.quantity,
  };
  // the product page this came from may still name the finish the quote swapped
  const swapNote =
    requested &&
    quoted &&
    finishSwapNote(
      requested.colorKey,
      quoted,
      queryClient
        .getQueryData<ProductDetail>(['product', requested.slug])
        ?.colors.find((c) => c.key === requested.colorKey)?.label,
    );
  const placeOrder = () => {
    if (!address) return;
    const scope = buyLine
      ? `buy:${buyLine.slug}:${buyLine.colorKey}:${buyLine.quantity}`
      : cartScope(
          priced.items.map((i) => ({ slug: i.product.slug, colorKey: i.colorKey, quantity: i.quantity })),
          priced.builds,
        );
    // kept for the tab, not the page: a reload after an unanswered attempt resends it, never a second order
    const idempotencyKey = checkoutKey(scope);
    checkout.mutate(
      { addressId: address.id, idempotencyKey, ...(buyLine ? { items: [buyLine] } : {}) },
      {
        // a refusal made nothing, so the next attempt is a new order
        onError: (error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) closeCheckoutKey(scope);
        },
        onSuccess: async (order) => {
          closeCheckoutKey(scope);
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
          } catch (error) {
            // the order page says which: payments not set up on this server, or the provider out of reach
            const reason =
              error instanceof ApiError && error.code === 'PAYMENTS_NOT_SET_UP'
                ? 'not-set-up'
                : 'unavailable';
            void navigate(`/orders/${order.number}?payment=${reason}`, { replace: true });
          }
        },
      },
    );
  };

  const total = priced.subtotal + (address?.shippingFee ?? 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {head}
      <div className="mb-8 space-y-1 border-b border-ink pb-4">
        <Label>Step 1 of 2 · then pay with Midtrans (sandbox)</Label>
        <h1 className="font-expanded text-4xl font-extrabold uppercase">{title}</h1>
        {buying && <p className="text-sm text-ink-2">Just this part. Your cart stays as it is.</p>}
        {swapNote && (
          <p role="status" className="mt-3 border-l-[3px] border-signal bg-alu-50 px-4 py-3 text-sm">
            {swapNote}
          </p>
        )}
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
                  className={`flex cursor-pointer gap-3 border bg-alu-50 p-4 ${a.id === address?.id ? 'border-ink-2' : 'border-field hover:border-ink-3'}`}
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
          <LineList lines={summaryLines(priced)} />
          <dl className="space-y-1 border-t border-ink pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>
                <Price amount={priced.subtotal} className="font-normal" />
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

          {!lost &&
            (quoted?.problem ? (
              <Notice tone="error">
                {quoted.problem === 'OUT_OF_STOCK' ? (
                  <>
                    This part is out of stock.{' '}
                    <Link to={`/products/${quoted.product.slug}`} className="font-semibold underline">
                      Back to the part
                    </Link>
                  </>
                ) : (
                  <>
                    Only {quoted.product.stock} left: fewer than you asked for.{' '}
                    <Link
                      to={buyNowPath({
                        slug: quoted.product.slug,
                        colorKey: quoted.colorKey,
                        quantity: quoted.product.stock,
                      })}
                      replace
                      className="font-semibold underline"
                    >
                      Buy {quoted.product.stock} instead
                    </Link>{' '}
                    or{' '}
                    <Link to={`/products/${quoted.product.slug}`} className="font-semibold underline">
                      go back to the part
                    </Link>
                    .
                  </>
                )}
              </Notice>
            ) : (
              !priced.canCheckout && (
                <Notice tone="error">
                  Some items are out of stock or over the stock left. Fix them in the cart first.
                </Notice>
              )
            ))}
          {lost ? (
            <Notice tone="error">
              No reply from the store: the order may have gone through. Check{' '}
              <Link to="/orders" className="font-semibold underline">
                your orders
              </Link>
              , or place it again: it will not be ordered twice.
            </Notice>
          ) : (
            checkout.error && <Notice tone="error">{checkout.error.message}</Notice>
          )}
          <Button
            className="w-full"
            disabled={!address || (!priced.canCheckout && !lost) || checkout.isPending || paying}
            onClick={placeOrder}
          >
            {paying ? 'Opening payment…' : checkout.isPending ? 'Placing order…' : 'Place order and pay'}
          </Button>
          <p className="text-xs text-ink-3">
            The items are held for {paymentWindowMinutes(user?.isDemo ?? false)} minutes while you pay. This
            is a demo: Midtrans runs in sandbox mode and no real money moves.
          </p>
          <SandboxPaymentGuide compact />
        </section>
      </div>
    </div>
  );
}

/** every line the order will hold: bikes, then parts, as the cart lists them */
function summaryLines(priced: Cart): Line[] {
  return [
    ...priced.builds.map((b) => ({
      key: `bike:${b.id}`,
      art: <PartImage slug="e1-bike" colorKey={b.quote.colorKey} module="FRAME" className="size-full" />,
      name: b.quote.label,
      what: `${b.quote.parts.length} ${b.quote.parts.length === 1 ? 'part' : 'parts'}`,
      finish: b.quote.colorLabel,
      quantity: b.quantity,
      unitPrice: b.quote.unitPrice,
      lineTotal: b.lineTotal,
    })),
    ...priced.items.map((i) => ({
      key: `part:${i.product.slug}:${i.colorKey}`,
      art: (
        <PartImage
          slug={i.product.slug}
          colorKey={i.colorKey}
          module={i.product.module}
          className="size-full"
        />
      ),
      name: i.product.name,
      what: i.product.model,
      finish: i.colorLabel,
      quantity: i.quantity,
      unitPrice: i.product.price,
      lineTotal: i.lineTotal,
    })),
  ];
}
