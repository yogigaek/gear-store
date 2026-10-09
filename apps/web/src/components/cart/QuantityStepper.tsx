import { MAX_LINE_QUANTITY } from '@gear-store/shared';

interface Props {
  value: number;
  max?: number;
  min?: number;
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
}

export function QuantityStepper({
  value,
  max = MAX_LINE_QUANTITY,
  min = 1,
  disabled,
  label,
  onChange,
}: Props) {
  return (
    <div role="group" aria-label={label} className="flex border border-ink">
      <button
        type="button"
        className="size-11 font-mono disabled:text-bench-strong"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <output aria-live="polite" className="tabular grid w-10 place-items-center font-mono">
        {value}
      </output>
      <button
        type="button"
        className="size-11 font-mono disabled:text-bench-strong"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
