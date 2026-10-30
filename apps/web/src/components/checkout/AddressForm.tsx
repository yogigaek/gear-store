import {
  addressInputSchema,
  provinceNames,
  shippingFor,
  type Address,
  type AddressInput,
  type Province,
} from '@gear-store/shared';
import { useId, useState } from 'react';
import { ApiError } from '../../lib/api';
import { formatRupiah } from '../../lib/format';
import { useSaveAddress } from '../../lib/orders';
import { Button } from '../ui/Button';
import { Field, Notice } from '../ui/Field';

type Values = Required<Omit<AddressInput, 'province'>> & { province: Province | '' };
type Errors = Partial<Record<keyof Values, string>>;

const empty: Values = {
  label: '',
  recipient: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  isDefault: false,
};

export function AddressForm({
  address,
  onSaved,
  onCancel,
}: {
  address?: Address;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Values>(address ? { ...address } : empty);
  const [errors, setErrors] = useState<Errors>({});
  const save = useSaveAddress();
  const provinceId = useId();

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({
      ...v,
      [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value,
    }));

  const fromIssues = (issues: { path: string; message: string }[]) => {
    const next: Errors = {};
    for (const i of issues) next[i.path as keyof Values] ??= i.message;
    setErrors(next);
  };

  const shipping = values.province ? shippingFor(values.province) : null;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = addressInputSchema.safeParse(values);
        if (!parsed.success) {
          fromIssues(parsed.error.issues.map((i) => ({ path: String(i.path[0]), message: i.message })));
          return;
        }
        setErrors({});
        save.mutate(
          { id: address?.id, input: values as AddressInput },
          {
            onSuccess: onSaved,
            onError: (error) => error instanceof ApiError && fromIssues(error.issues),
          },
        );
      }}
    >
      {save.error && !Object.values(errors).some(Boolean) && (
        <Notice tone="error">{save.error.message}</Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Recipient"
          autoComplete="name"
          value={values.recipient}
          onChange={set('recipient')}
          error={errors.recipient}
        />
        <Field
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="0812 3456 7890"
          value={values.phone}
          onChange={set('phone')}
          error={errors.phone}
        />
      </div>
      <Field
        label="Street address"
        autoComplete="address-line1"
        placeholder="Jl. Sudirman No. 1, RT 01/RW 02"
        value={values.line1}
        onChange={set('line1')}
        error={errors.line1}
      />
      <Field
        label="Building, floor, landmark (optional)"
        autoComplete="address-line2"
        value={values.line2}
        onChange={set('line2')}
        error={errors.line2}
      />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
        <Field
          label="City or regency"
          autoComplete="address-level2"
          value={values.city}
          onChange={set('city')}
          error={errors.city}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={provinceId} className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
            Province
          </label>
          <select
            id={provinceId}
            autoComplete="address-level1"
            value={values.province}
            onChange={set('province')}
            aria-invalid={errors.province ? true : undefined}
            aria-describedby={errors.province ? `${provinceId}-error` : undefined}
            className={`min-h-11 w-full border bg-alu-50 px-3 text-base text-ink sm:text-sm ${errors.province ? 'border-danger' : 'border-field'}`}
          >
            <option value="">Choose…</option>
            {provinceNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {errors.province && (
            <p id={`${provinceId}-error`} className="text-sm text-danger">
              {errors.province}
            </p>
          )}
        </div>
        <Field
          label="Postal code"
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={5}
          value={values.postalCode}
          onChange={set('postalCode')}
          error={errors.postalCode}
        />
      </div>
      {shipping && (
        <p className="font-mono text-xs text-ink-2">
          Shipping to {values.province}: {formatRupiah(shipping.fee)} · {shipping.eta}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Label (optional)"
          placeholder="Home, Office"
          value={values.label}
          onChange={set('label')}
          error={errors.label}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={values.isDefault}
            onChange={set('isDefault')}
            className="size-4 accent-ink"
          />
          Use as my default address
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : address ? 'Save address' : 'Add address'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** A saved address or the copy stored on an order (whose province is plain text). */
interface AddressLike {
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
}

export function AddressLines({ address }: { address: AddressLike }) {
  return (
    <address className="not-italic">
      <span className="font-semibold">{address.recipient}</span> ·{' '}
      <span className="font-mono text-sm">{address.phone}</span>
      <br />
      {address.line1}
      {address.line2 && (
        <>
          <br />
          {address.line2}
        </>
      )}
      <br />
      {address.city}, {address.province} {address.postalCode}
    </address>
  );
}
