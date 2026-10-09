import { formatRupiah } from '../../lib/format';

export function Price({ amount, className = '' }: { amount: number; className?: string }) {
  return <span className={`tabular font-mono font-semibold ${className}`}>{formatRupiah(amount)}</span>;
}
