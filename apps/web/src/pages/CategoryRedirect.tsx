import { Navigate, useParams } from 'react-router';

/** Old /c/:slug links land on the catalogue with that category selected. */
export function CategoryRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/products?category=${encodeURIComponent(id)}`} replace />;
}
