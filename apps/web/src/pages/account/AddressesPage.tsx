import { useState } from 'react';
import { AddressForm, AddressLines } from '../../components/checkout/AddressForm';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { Price } from '../../components/ui/Price';
import { useAddresses, useDeleteAddress } from '../../lib/orders';

export function AddressesPage() {
  const addresses = useAddresses();
  const remove = useDeleteAddress();
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div className="space-y-1">
          <Label>Account</Label>
          <h1 className="font-expanded text-4xl font-extrabold uppercase">Addresses</h1>
        </div>
        {editing === null && (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            Add address
          </Button>
        )}
      </div>
      <div className="max-w-2xl space-y-4">
        {addresses.isError && <Notice tone="error">{addresses.error.message}</Notice>}
        {remove.error && <Notice tone="error">{remove.error.message}</Notice>}
        {editing === 'new' && (
          <div className="border border-ink bg-alu-50 p-4">
            <AddressForm onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
          </div>
        )}
        {addresses.data?.length === 0 && editing !== 'new' && (
          <p className="text-ink-2">No saved addresses yet.</p>
        )}
        {addresses.data?.map((a) =>
          editing === a.id ? (
            <div key={a.id} className="border border-ink bg-alu-50 p-4">
              <AddressForm address={a} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <div key={a.id} className="space-y-2 border border-bench bg-alu-50 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {a.isDefault && <Label className="text-ink">Default</Label>}
                {a.label && <Label>{a.label}</Label>}
              </div>
              <AddressLines address={a} />
              <p className="font-mono text-xs text-ink-2">
                Shipping <Price amount={a.shippingFee} className="font-normal" /> · {a.shippingEta}
              </p>
              <div className="flex gap-4">
                <Button variant="ghost" onClick={() => setEditing(a.id)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="px-0"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(a.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
