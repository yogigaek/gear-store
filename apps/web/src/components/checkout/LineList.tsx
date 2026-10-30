import type { ReactNode } from 'react';
import { Price } from '../ui/Price';

export interface Line {
  key: string;
  /** the still: a PartImage */
  art: ReactNode;
  name: ReactNode;
  /** the model, or "8 parts" for a bike; shown with the finish after it */
  what: string;
  finish: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** under the row, lined up with the text: a bike's parts */
  extra?: ReactNode;
}

/** The lines of an order, or of one about to be placed: still, name, details, and the line's total. */
export function LineList({ lines, className = '' }: { lines: Line[]; className?: string }) {
  return (
    <ul className={`divide-y divide-bench ${className}`}>
      {lines.map((line) => (
        <li key={line.key} className="py-3">
          {/* a total that does not fit beside the details (narrow column) goes under them, right-aligned */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="size-14 shrink-0 overflow-hidden border border-bench">{line.art}</div>
            <div className="min-w-0 flex-1 basis-32 text-sm">
              <p className="font-semibold">{line.name}</p>
              <p className="font-mono text-xs text-ink-3">
                {line.what}
                {line.finish && ` · ${line.finish}`}
              </p>
              <p className="font-mono text-xs text-ink-3">
                {line.quantity} × <Price amount={line.unitPrice} className="font-normal" />
              </p>
            </div>
            <Price amount={line.lineTotal} className="ml-auto shrink-0 text-sm" />
          </div>
          {line.extra}
        </li>
      ))}
    </ul>
  );
}
