import { z } from 'zod';
import { rupiahSchema } from './catalog.js';

/**
 * Flat-rate shipping from a warehouse in Jakarta, by the destination's province. Demo rates: a real store
 * would quote couriers by weight and city.
 */
export const shippingZones = {
  A: { label: 'Jabodetabek & West Java', fee: 15000, eta: '1–2 days' },
  B: { label: 'Rest of Java & Bali', fee: 22000, eta: '2–3 days' },
  C: { label: 'Sumatra, Kalimantan, Sulawesi & NTB', fee: 35000, eta: '3–5 days' },
  D: { label: 'NTT, Maluku & Papua', fee: 55000, eta: '5–8 days' },
} as const;
export type ShippingZone = keyof typeof shippingZones;

/** Indonesia's 38 provinces (since 2022) and their shipping zone. */
export const provinces = {
  Aceh: 'C',
  'Sumatera Utara': 'C',
  'Sumatera Barat': 'C',
  Riau: 'C',
  'Kepulauan Riau': 'C',
  Jambi: 'C',
  'Sumatera Selatan': 'C',
  'Kepulauan Bangka Belitung': 'C',
  Bengkulu: 'C',
  Lampung: 'C',
  'DKI Jakarta': 'A',
  'Jawa Barat': 'A',
  Banten: 'A',
  'Jawa Tengah': 'B',
  'DI Yogyakarta': 'B',
  'Jawa Timur': 'B',
  Bali: 'B',
  'Nusa Tenggara Barat': 'C',
  'Nusa Tenggara Timur': 'D',
  'Kalimantan Barat': 'C',
  'Kalimantan Tengah': 'C',
  'Kalimantan Selatan': 'C',
  'Kalimantan Timur': 'C',
  'Kalimantan Utara': 'C',
  'Sulawesi Utara': 'C',
  Gorontalo: 'C',
  'Sulawesi Tengah': 'C',
  'Sulawesi Barat': 'C',
  'Sulawesi Selatan': 'C',
  'Sulawesi Tenggara': 'C',
  Maluku: 'D',
  'Maluku Utara': 'D',
  Papua: 'D',
  'Papua Barat': 'D',
  'Papua Barat Daya': 'D',
  'Papua Selatan': 'D',
  'Papua Tengah': 'D',
  'Papua Pegunungan': 'D',
} as const satisfies Record<string, ShippingZone>;
export type Province = keyof typeof provinces;
export const provinceNames = Object.keys(provinces) as [Province, ...Province[]];
export const provinceSchema = z.enum(provinceNames, { error: 'Choose a province' });

export function shippingFor(province: Province) {
  const zone = provinces[province];
  return { zone, ...shippingZones[zone] };
}

/** Indonesian mobile number in any common form ("0812…", "62812…", "+62 812-…"), stored as +62812… */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s().-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^(?:\+62|62|0)8[1-9]\d{6,11}$/, 'Enter an Indonesian mobile number, e.g. 0812 3456 7890'),
  )
  .transform((v) => `+62${v.replace(/^(?:\+62|62|0)/, '')}`);

export const MAX_ADDRESSES = 10;

export const addressInputSchema = z.object({
  label: z.string().trim().max(30).default(''),
  recipient: z.string().trim().min(1, 'Enter the recipient’s name').max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(5, 'Enter the street address').max(200),
  line2: z.string().trim().max(200).default(''),
  city: z.string().trim().min(2, 'Enter the city or regency').max(80),
  province: provinceSchema,
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Postal codes have 5 digits'),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressInputSchema>;

export const addressSchema = addressInputSchema.extend({
  id: z.uuid(),
  phone: z.string(),
  shippingFee: rupiahSchema,
  shippingEta: z.string(),
});
export type Address = z.infer<typeof addressSchema>;
