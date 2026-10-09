/** Five squares filled to the rating, in the bench style; the number is always printed next to it. */
export function Stars({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`size-2.5 border border-ink ${value >= i - 0.25 ? 'bg-ink' : value >= i - 0.75 ? 'bg-[linear-gradient(90deg,var(--color-ink)_50%,transparent_50%)]' : ''}`}
        />
      ))}
    </span>
  );
}
