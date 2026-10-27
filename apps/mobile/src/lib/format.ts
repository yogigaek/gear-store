const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** 1249000 → "Rp 1.249.000", the same rendering as the web app's lib/format.ts */
export function formatRupiah(amount: number): string {
  return rupiah.format(amount).replace(/ /g, ' ');
}

/** "20.000 mAh" never splits between number and unit. */
export function keepUnits(value: string): string {
  return value.replace(/(\d)\s+(?=[A-Za-zΩµ°%×])/g, '$1 ');
}
