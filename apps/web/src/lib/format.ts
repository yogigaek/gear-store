const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** 1249000 → "Rp 1.249.000" (Indonesian grouping, no decimals, a plain space after "Rp") */
export function formatRupiah(amount: number): string {
  return rupiah.format(amount).replace(/ /g, ' ');
}
