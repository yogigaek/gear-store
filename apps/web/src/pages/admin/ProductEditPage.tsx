import {
  adminProductInputSchema,
  partModules,
  type AdminProduct,
  type AdminProductInput,
  type PartModule,
} from '@gear-store/shared';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { PageTitle } from '../../components/ui/PageTitle';
import { ApiError } from '../../lib/api';
import { useAdminCategories, useAdminProduct, useCreateProduct, useUpdateProduct } from '../../lib/admin';
import { AdminHeading } from './AdminLayout';

type Errors = Record<string, string>;

const blank: AdminProductInput = {
  slug: '',
  name: '',
  model: '',
  category: '',
  module: 'ACCESSORY',
  description: '',
  price: 0,
  stock: 0,
  isActive: false,
  specs: [
    { label: '', value: '' },
    { label: '', value: '' },
    { label: '', value: '' },
  ],
  colors: [],
};

export function ProductEditPage() {
  const { slug } = useParams();
  const isNew = slug === undefined;
  const existing = useAdminProduct(slug ?? '');
  if (isNew) return <ProductForm />;
  if (existing.isError)
    return (
      <>
        <PageTitle>Product · Admin</PageTitle>
        <Notice tone="error">{existing.error.message}</Notice>
      </>
    );
  if (!existing.data)
    return (
      <p className="font-mono text-sm text-ink-3">
        <PageTitle>Product · Admin</PageTitle>
        Loading…
      </p>
    );
  // keyed by updatedAt: after a reload the form starts from the fresh product
  return (
    <ProductForm
      key={existing.data.updatedAt}
      product={existing.data}
      onReload={() => void existing.refetch()}
    />
  );
}

function ProductForm({ product, onReload }: { product?: AdminProduct; onReload?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const savedNote = (location.state as { saved?: string } | null)?.saved;
  const categories = useAdminCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.slug ?? '');
  const [v, setV] = useState<AdminProductInput>(() => (product ? { ...product } : blank));
  const [errors, setErrors] = useState<Errors>({});
  const save = product ? update : create;
  const conflict = save.error instanceof ApiError && save.error.status === 409 && !!product;

  const set = <K extends keyof AdminProductInput>(key: K, value: AdminProductInput[K]) =>
    setV((x) => ({ ...x, [key]: value }));
  const text = (key: 'slug' | 'name' | 'model') => ({
    value: v[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
    error: errors[key],
  });
  const fromIssues = (issues: { path: string; message: string }[]) => {
    const next: Errors = {};
    for (const i of issues) next[i.path] ??= i.message;
    setErrors(next);
  };

  return (
    <>
      <AdminHeading title={product ? product.name : 'New product'}>
        {product && (
          <Link to={`/products/${product.slug}`} className="text-sm underline underline-offset-4">
            View in store
          </Link>
        )}
      </AdminHeading>
      <form
        noValidate
        className="max-w-3xl space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = adminProductInputSchema.safeParse(v);
          if (!parsed.success) {
            fromIssues(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
            return;
          }
          setErrors({});
          // the form remounts with the saved product (fresh updatedAt), so the confirmation travels in the route state
          const done = (saved: AdminProduct) =>
            void navigate(`/admin/products/${saved.slug}`, {
              replace: true,
              state: { saved: product ? 'Changes saved.' : 'Product created.' },
            });
          const onError = (error: Error) => error instanceof ApiError && fromIssues(error.issues);
          if (product)
            update.mutate(
              { ...parsed.data, expectedUpdatedAt: product.updatedAt },
              { onSuccess: done, onError },
            );
          else create.mutate(parsed.data, { onSuccess: done, onError });
        }}
      >
        {save.error && (
          <Notice tone="error">
            {save.error.message}{' '}
            {conflict && (
              <button type="button" className="font-semibold underline" onClick={onReload}>
                Reload the product
              </button>
            )}
          </Notice>
        )}
        {savedNote && !save.error && <Notice tone="ok">{savedNote}</Notice>}

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Identity</legend>
          <Field label="Name" {...text('name')} />
          <Field
            label="Slug (used in the URL)"
            {...text('slug')}
            disabled={!!product}
            hint={product ? 'Fixed once created: links and orders use it.' : 'e.g. e1-battery-625'}
          />
          <Field label="Part code" {...text('model')} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
              Part type
            </label>
            <select
              id="category"
              value={v.category}
              onChange={(e) => set('category', e.target.value)}
              className={`min-h-11 border bg-alu-50 px-3 text-base sm:text-sm ${errors.category ? 'border-danger' : 'border-bench-strong'}`}
            >
              <option value="">Choose…</option>
              {categories.data?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.category && <p className="text-sm text-danger">{errors.category}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="module" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
              3D module
            </label>
            <select
              id="module"
              value={v.module}
              onChange={(e) => set('module', e.target.value as PartModule)}
              aria-describedby="module-help"
              className={`min-h-11 border bg-alu-50 px-3 text-base sm:text-sm ${errors.module ? 'border-danger' : 'border-bench-strong'}`}
            >
              {partModules.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            {errors.module && <p className="text-sm text-danger">{errors.module}</p>}
            <p id="module-help" className="text-sm text-ink-3">
              Which part of the E-1 model draws it. It must match the part type: accessories are Accessory.
            </p>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            Price and stock
          </legend>
          <Field
            label="Price (Rp, whole rupiah)"
            inputMode="numeric"
            value={v.price || ''}
            onChange={(e) => set('price', Number(e.target.value.replace(/\D/g, '')) || 0)}
            error={errors.price}
          />
          <Field
            label="Stock (units)"
            inputMode="numeric"
            value={String(v.stock)}
            onChange={(e) => set('stock', Number(e.target.value.replace(/\D/g, '')) || 0)}
            error={errors.stock}
            hint={
              product
                ? 'Orders change this too; saving is refused if one did since you opened the page.'
                : undefined
            }
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="size-4 accent-ink"
            />
            On sale (shown in the store)
          </label>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            value={v.description}
            onChange={(e) => set('description', e.target.value)}
            className={`border bg-alu-50 px-3 py-2 text-base ${errors.description ? 'border-danger' : 'border-bench-strong'}`}
          />
          {errors.description && <p className="text-sm text-danger">{errors.description}</p>}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            Specifications · the first three fill the spec plate
          </legend>
          {errors.specs && <p className="text-sm text-danger">{errors.specs}</p>}
          {v.specs.map((s, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-end gap-2">
              <Field
                label={`Label ${i + 1}`}
                value={s.label}
                error={errors[`specs.${i}.label`]}
                onChange={(e) =>
                  set(
                    'specs',
                    v.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
              />
              <Field
                label="Value"
                value={s.value}
                error={errors[`specs.${i}.value`]}
                onChange={(e) =>
                  set(
                    'specs',
                    v.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                  )
                }
              />
              <Button
                variant="ghost"
                disabled={v.specs.length <= 3}
                onClick={() =>
                  set(
                    'specs',
                    v.specs.filter((_, j) => j !== i),
                  )
                }
                aria-label={`Remove spec ${i + 1}`}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            disabled={v.specs.length >= 20}
            onClick={() => set('specs', [...v.specs, { label: '', value: '' }])}
          >
            Add spec
          </Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            Finishes (optional)
          </legend>
          {errors.colors && <p className="text-sm text-danger">{errors.colors}</p>}
          {v.colors.map((c, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] items-end gap-2">
              <Field
                label="Key"
                value={c.key}
                error={errors[`colors.${i}.key`]}
                onChange={(e) =>
                  set(
                    'colors',
                    v.colors.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                  )
                }
              />
              <Field
                label="Label"
                value={c.label}
                error={errors[`colors.${i}.label`]}
                onChange={(e) =>
                  set(
                    'colors',
                    v.colors.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
              />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`hex-${i}`}
                  className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2"
                >
                  Colour
                </label>
                <input
                  id={`hex-${i}`}
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'}
                  onChange={(e) =>
                    set(
                      'colors',
                      v.colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)),
                    )
                  }
                  className="h-11 w-full border border-bench-strong bg-alu-50"
                />
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  set(
                    'colors',
                    v.colors.filter((_, j) => j !== i),
                  )
                }
                aria-label={`Remove finish ${i + 1}`}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            disabled={v.colors.length >= 8}
            onClick={() => set('colors', [...v.colors, { key: '', label: '', hex: '#24292c' }])}
          >
            Add finish
          </Button>
        </fieldset>

        <div className="flex flex-wrap gap-3 border-t border-ink pt-4">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </Button>
          <Link
            to="/admin/products"
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Back to products
          </Link>
        </div>
      </form>
    </>
  );
}
