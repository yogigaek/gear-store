import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Notice } from '../../components/ui/Field';
import { Price } from '../../components/ui/Price';
import { useAdminProducts } from '../../lib/admin';
import { AdminHeading } from './AdminLayout';
import { Pager, searchClass } from './Pager';

export function ProductsAdminPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const [q, setQ] = useState(params.get('q') ?? '');
  const products = useAdminProducts({ q: params.get('q') ?? undefined, page });

  return (
    <>
      <AdminHeading title="Products">
        <Link
          to="/admin/products/new"
          data-variant="primary"
          className="inline-flex min-h-11 items-center border-b-[3px] border-signal bg-ink px-5 text-sm font-semibold uppercase tracking-[0.06em] text-alu-50 hover:bg-ink-2"
        >
          New product
        </Link>
      </AdminHeading>
      <form
        role="search"
        className="mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(q.trim() ? { q: q.trim() } : {});
        }}
      >
        <label htmlFor="product-search" className="sr-only">
          Search products
        </label>
        <input
          id="product-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, model or slug"
          className={searchClass}
        />
      </form>
      {products.isError && <Notice tone="error">{products.error.message}</Notice>}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Products table">
        <table className="stack-table w-full text-sm sm:min-w-[40rem]">
          <thead>
            <tr className="border-b border-ink text-left font-mono text-xs uppercase tracking-[0.06em] text-ink-3">
              <th className="py-2 font-normal">Product</th>
              <th className="py-2 font-normal">Category</th>
              <th className="py-2 text-right font-normal">Price</th>
              <th className="py-2 text-right font-normal">Stock</th>
              <th className="py-2 pl-4 font-normal">On sale</th>
            </tr>
          </thead>
          <tbody className={products.isPlaceholderData ? 'opacity-60' : ''}>
            {products.data?.items.map((p) => (
              <tr
                key={p.slug}
                className={`border-b border-bench hover:bg-alu-50 ${p.isActive ? '' : 'text-ink-3'}`}
              >
                <td className="py-3">
                  <Link
                    to={`/admin/products/${p.slug}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="block font-mono text-xs text-ink-3">
                    {p.model} · {p.module.toLowerCase()}
                  </span>
                </td>
                <td className="py-3">{p.category}</td>
                <td data-label="Price" className="py-3 text-right">
                  <Price amount={p.price} className="font-normal" />
                </td>
                <td
                  data-label="Stock"
                  className={`tabular py-3 text-right font-mono ${p.stock === 0 ? 'text-danger' : ''}`}
                >
                  {p.stock}
                </td>
                <td data-label="On sale" className="py-3 pl-4">
                  {p.isActive ? 'Yes' : 'No'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {products.data && (
        <Pager
          {...products.data}
          onPage={(p) => setParams({ ...(params.get('q') ? { q: params.get('q')! } : {}), page: String(p) })}
        />
      )}
    </>
  );
}
