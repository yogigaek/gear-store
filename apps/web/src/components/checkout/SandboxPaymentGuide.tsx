import { useState } from 'react';

/** Midtrans' published sandbox test card (docs.midtrans.com → Testing payment on sandbox). */
const TEST_CARD = { number: '4811 1111 1111 1114', cvv: '123', otp: '112233' };
const SIMULATOR = 'https://simulator.sandbox.midtrans.com';

/**
 * How to finish a payment on the demo. Midtrans runs in sandbox here: a card payment completes inside its
 * page with the published test card, while a virtual account only completes through Midtrans' simulator,
 * a separate site nobody would guess.
 */
export function SandboxPaymentGuide({ compact = false }: { compact?: boolean }) {
  return (
    <details open={!compact} className="group border border-bench bg-alu-50 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">How to pay on this demo</span>
        <span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-3">
          Sandbox
        </span>
        <span aria-hidden="true" className="shrink-0 text-ink-3 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-bench px-4 py-4 text-ink-2">
        <div className="space-y-2">
          <p>
            <strong className="text-ink">Quickest: Card Payment.</strong> On the Midtrans page choose{' '}
            <em>Card Payment</em> and enter Midtrans&apos; test card:
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 font-mono text-xs">
            <dt className="uppercase tracking-[0.08em] text-ink-3">Card</dt>
            <dd className="flex flex-wrap items-center gap-2 text-ink">
              {TEST_CARD.number}{' '}
              <CopyButton value={TEST_CARD.number.replaceAll(' ', '')} label="card number" />
            </dd>
            <dt className="uppercase tracking-[0.08em] text-ink-3">Expiry</dt>
            <dd className="text-ink">any future month, e.g. 12/30</dd>
            <dt className="uppercase tracking-[0.08em] text-ink-3">CVV</dt>
            <dd className="text-ink">{TEST_CARD.cvv}</dd>
            <dt className="uppercase tracking-[0.08em] text-ink-3">OTP</dt>
            <dd className="text-ink">{TEST_CARD.otp}</dd>
          </dl>
        </div>
        <div className="space-y-1.5">
          <p>
            <strong className="text-ink">Or a virtual account.</strong> Choose a bank and copy the account
            number Midtrans shows. Then open the{' '}
            <a href={SIMULATOR} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">
              Midtrans sandbox simulator
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            , pick the same bank, paste the number and pay there.
          </p>
        </div>
        <p className="text-ink-3">
          No real money moves. Back on the order page, the payment is checked by itself and the order turns to
          Paid within a few seconds.
        </p>
      </div>
    </details>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      onClick={() => {
        const done = (next: 'copied' | 'failed') => {
          setState(next);
          window.setTimeout(() => setState('idle'), 1500);
        };
        // the clipboard can be refused (no permission, page not focused): say so rather than fail silently
        if (!navigator.clipboard) return done('failed');
        navigator.clipboard.writeText(value).then(
          () => done('copied'),
          () => done('failed'),
        );
      }}
      className="min-h-8 border border-bench-strong px-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-2 hover:border-ink hover:text-ink"
      aria-label={`Copy ${label}`}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy it by hand' : 'Copy'}
    </button>
  );
}
