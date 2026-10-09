/** Stock as a fact, not a nudge: no countdowns, no "only X left!" urgency. */
export function StockNote({ stock }: { stock: number }) {
  if (stock === 0) return <span className="font-mono text-xs text-danger">Out of stock</span>;
  return <span className="tabular font-mono text-xs text-ok">In stock · {stock} units</span>;
}
