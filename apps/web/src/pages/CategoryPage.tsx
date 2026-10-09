import { useParams } from 'react-router';
import { ProductCard } from '../components/product/ProductCard';
import { Label } from '../components/ui/Label';
import { categories, products } from '../data/catalog';
import { NotFoundPage } from './NotFoundPage';

export function CategoryPage() {
  const { id } = useParams();
  const category = categories.find((c) => c.id === id);
  if (!category) return <NotFoundPage />;
  const items = products.filter((p) => p.category === category.id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div className="space-y-1">
          <Label>{category.note}</Label>
          <h1 className="font-expanded text-4xl font-extrabold uppercase">{category.label}</h1>
        </div>
        <Label>{items.length} products</Label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
    </div>
  );
}
