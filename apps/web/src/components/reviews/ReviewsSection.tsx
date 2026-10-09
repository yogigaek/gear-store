import { reviewInputSchema, type ReviewInput } from '@gear-store/shared';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { formatDateTime } from '../../lib/date';
import { useMyReview, useProductReviews, useSaveReview } from '../../lib/queries';
import { Button } from '../ui/Button';
import { Field, Notice } from '../ui/Field';
import { Stars } from './Stars';

type Errors = Partial<Record<keyof ReviewInput, string>>;

export function ReviewsSection({ slug }: { slug: string }) {
  const reviews = useProductReviews(slug);
  const data = reviews.data;

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-title"
      className="mt-16 grid gap-8 border-t border-ink pt-8 lg:grid-cols-[18rem_minmax(0,1fr)]"
    >
      <div className="space-y-4">
        <h2 id="reviews-title" className="font-expanded text-2xl font-bold uppercase">
          Reviews
        </h2>
        {data && data.count > 0 && (
          <>
            <p className="flex items-baseline gap-3">
              <span className="tabular font-mono text-4xl font-semibold">{data.average?.toFixed(1)}</span>
              <span className="text-sm text-ink-2">
                out of 5 · {data.count} {data.count === 1 ? 'review' : 'reviews'}
              </span>
            </p>
            <dl className="space-y-1 font-mono text-xs">
              {data.distribution.map((n, i) => (
                <div key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-2">
                  <dt>{5 - i}★</dt>
                  <dd className="h-2 border border-ink">
                    <span
                      className="block h-full bg-ink"
                      style={{ width: `${data.count ? (n / data.count) * 100 : 0}%` }}
                    />
                  </dd>
                  <dd className="tabular text-right text-ink-3">{n}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <p className="text-sm text-ink-3">Only customers who paid for this product can review it.</p>
        <MyReviewPanel slug={slug} />
      </div>

      <div className="min-w-0">
        {reviews.isError && <Notice tone="error">{reviews.error.message}</Notice>}
        {data?.count === 0 && <p className="text-ink-2">No reviews yet.</p>}
        <ul className="divide-y divide-bench">
          {data?.items.map((r) => (
            <li key={r.id} className="space-y-2 py-4 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <span className="sr-only">{r.rating} out of 5</span>
                <h3 className="font-semibold">{r.title}</h3>
              </div>
              <p className="max-w-[65ch] whitespace-pre-line text-ink-2">{r.body}</p>
              <p className="font-mono text-xs text-ink-3">
                {r.author} · verified purchase · {formatDateTime(r.createdAt)}
                {r.updatedAt !== r.createdAt && ' · edited'}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MyReviewPanel({ slug }: { slug: string }) {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const mine = useMyReview(slug);
  const { save, remove } = useSaveReview(slug);
  const [editing, setEditing] = useState(false);

  if (status !== 'signed-in') {
    return (
      <Link
        to={`/sign-in?next=${encodeURIComponent(pathname + '#reviews')}`}
        className="inline-block text-sm font-semibold underline underline-offset-4"
      >
        Sign in to review
      </Link>
    );
  }
  if (!mine.data) return null;
  if (!mine.data.canReview) {
    return (
      <p className="text-sm text-ink-2">
        {mine.data.reason === 'DEMO_ACCOUNT'
          ? 'Demo accounts are shared by every visitor, so they cannot post reviews.'
          : 'Buy this product to review it.'}
      </p>
    );
  }
  const existing = mine.data.review;
  if (existing && !editing) {
    return (
      <div className="space-y-2 text-sm">
        <p>You rated this {existing.rating} out of 5.</p>
        {remove.error && <Notice tone="error">{remove.error.message}</Notice>}
        <div className="flex gap-4">
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit review
          </Button>
          <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </div>
      </div>
    );
  }
  if (!existing && !editing) {
    return (
      <Button variant="secondary" onClick={() => setEditing(true)}>
        Write a review
      </Button>
    );
  }
  return (
    <ReviewForm
      initial={existing ?? undefined}
      pending={save.isPending}
      serverError={save.error?.message}
      onCancel={() => setEditing(false)}
      onSubmit={(input) => save.mutate(input, { onSuccess: () => setEditing(false) })}
    />
  );
}

function ReviewForm({
  initial,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial?: ReviewInput;
  pending: boolean;
  serverError?: string;
  onSubmit: (input: ReviewInput) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    rating: initial?.rating ?? 0,
    title: initial?.title ?? '',
    body: initial?.body ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = reviewInputSchema.safeParse(values);
        if (!parsed.success) {
          const next: Errors = {};
          for (const i of parsed.error.issues) next[i.path[0] as keyof ReviewInput] ??= i.message;
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-2">Rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={values.rating === n}
                onChange={() => setValues((v) => ({ ...v, rating: n }))}
                className="peer sr-only"
              />
              <span className="sr-only">{n} out of 5</span>
              <span
                aria-hidden="true"
                className={`grid size-11 place-items-center border font-mono text-sm peer-focus-visible:outline-3 peer-focus-visible:outline-signal ${
                  n <= values.rating ? 'border-ink bg-ink text-alu-50' : 'border-bench-strong bg-alu-50'
                }`}
              >
                {n}
              </span>
            </label>
          ))}
        </div>
        {errors.rating && <p className="mt-1 text-sm text-danger">{errors.rating}</p>}
      </fieldset>
      <Field
        label="Title"
        value={values.title}
        maxLength={80}
        onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
        error={errors.title}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-body" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
          Review
        </label>
        <textarea
          id="review-body"
          rows={5}
          maxLength={2000}
          value={values.body}
          onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? 'review-body-error' : undefined}
          className={`w-full border bg-alu-50 px-3 py-2 text-base text-ink outline-none focus:border-ink ${errors.body ? 'border-danger' : 'border-bench-strong'}`}
        />
        {errors.body && (
          <p id="review-body-error" className="text-sm text-danger">
            {errors.body}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Post review'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
