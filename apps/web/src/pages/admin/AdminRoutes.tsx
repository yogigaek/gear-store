import { Navigate } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { AdminLayout } from './AdminLayout';

/** Loaded on demand: shoppers never download the admin screens. Signed-in non-admins see the store's 404. */
export default function AdminGate() {
  const { status, user } = useAuth();
  if (status === 'restoring')
    return (
      <p className="mx-auto max-w-7xl px-4 py-16 font-mono text-sm text-ink-3 sm:px-6">
        Restoring your session…
      </p>
    );
  if (status === 'signed-out') return <Navigate to="/sign-in?next=%2Fadmin" replace />;
  if (user?.role !== 'ADMIN') return <Navigate to="/not-found" replace />;
  return <AdminLayout />;
}
