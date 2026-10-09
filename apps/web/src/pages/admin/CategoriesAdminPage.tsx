import { adminCategoryInputSchema, type AdminCategory, type AdminCategoryInput } from '@gear-store/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useAdminCategories, useCreateCategory, useDeleteCategory, useSaveCategory } from '../../lib/admin';
import { AdminHeading } from './AdminLayout';

export function CategoriesAdminPage() {
  const categories = useAdminCategories();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  return (
    <>
      <AdminHeading title="Categories">
        {editing === null && (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            New category
          </Button>
        )}
      </AdminHeading>
      <div className="max-w-3xl space-y-3">
        {categories.isError && <Notice tone="error">{categories.error.message}</Notice>}
        {remove.error && <Notice tone="error">{remove.error.message}</Notice>}
        {editing === 'new' && <CategoryForm onDone={() => setEditing(null)} />}
        {categories.data?.map((c) =>
          editing === c.slug ? (
            <CategoryForm key={c.slug} category={c} onDone={() => setEditing(null)} />
          ) : (
            <div
              key={c.slug}
              className="flex flex-wrap items-center justify-between gap-3 border border-bench bg-alu-50 p-4 text-sm"
            >
              <div>
                <p className="font-semibold">
                  {c.name}{' '}
                  <span className="font-mono text-xs text-ink-3">
                    /{c.slug} · order {c.sortOrder}
                  </span>
                </p>
                <p className="text-ink-2">{c.description}</p>
                <p className="tabular font-mono text-xs text-ink-3">
                  {c.activeCount} on sale · {c.productCount} in total
                </p>
              </div>
              <div className="flex gap-4">
                <Button variant="ghost" onClick={() => setEditing(c.slug)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  disabled={c.productCount > 0 || remove.isPending}
                  title={c.productCount > 0 ? 'Only empty categories can be deleted' : undefined}
                  onClick={() => remove.mutate(c.slug)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </>
  );
}

function CategoryForm({ category, onDone }: { category?: AdminCategory; onDone: () => void }) {
  const create = useCreateCategory();
  const update = useSaveCategory();
  const save = category ? update : create;
  const [v, setV] = useState<AdminCategoryInput>(
    category
      ? {
          slug: category.slug,
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
        }
      : { slug: '', name: '', description: '', sortOrder: 10 },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      noValidate
      className="space-y-4 border border-ink bg-alu-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = adminCategoryInputSchema.safeParse(v);
        if (!parsed.success) {
          const next: Record<string, string> = {};
          for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
          setErrors(next);
          return;
        }
        setErrors({});
        const onError = (error: Error) => {
          if (error instanceof ApiError)
            setErrors(Object.fromEntries(error.issues.map((i) => [i.path, i.message])));
        };
        if (category)
          update.mutate({ slug: category.slug, input: parsed.data }, { onSuccess: onDone, onError });
        else create.mutate(parsed.data, { onSuccess: onDone, onError });
      }}
    >
      {save.error && <Notice tone="error">{save.error.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          value={v.name}
          error={errors.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
        <Field
          label="Slug"
          value={v.slug}
          error={errors.slug}
          disabled={!!category}
          onChange={(e) => setV({ ...v, slug: e.target.value })}
        />
        <Field
          label="Description"
          value={v.description}
          error={errors.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
        <Field
          label="Order in menus"
          inputMode="numeric"
          value={String(v.sortOrder)}
          error={errors.sortOrder}
          onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value.replace(/\D/g, '')) || 0 })}
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending}>
          {category ? 'Save' : 'Create'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
