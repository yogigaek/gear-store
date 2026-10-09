import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const set = (value: boolean) => {
  open = value;
  listeners.forEach((l) => l());
};

/** Lets any button (header, "Add to cart") open the one cart drawer in the layout. */
export const cartDrawer = { open: () => set(true), close: () => set(false) };

export function useCartDrawerOpen(): boolean {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => open,
    () => false,
  );
}
