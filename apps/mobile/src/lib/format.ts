const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** 1249000 → "Rp 1.249.000" (a plain space after "Rp"), the same rendering as the web app's lib/format.ts */
export function formatRupiah(amount: number): string {
  return rupiah.format(amount).replace(/ /g, ' ');
}

/** "20.000 mAh" never splits between number and unit: they are joined by a no-break space. */
export function keepUnits(value: string): string {
  return value.replace(/(\d)\s+(?=[A-Za-zΩµ°%×])/g, '$1 ');
}

/** 1 → "1 item", 3 → "3 items" */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
