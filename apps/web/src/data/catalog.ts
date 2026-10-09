// Prototype catalogue for Phase 1 (design review). Names, specs and prices are placeholders; the real
// catalogue comes from the API in Phase 2–3.

export type CategoryId = 'audio' | 'keyboards' | 'power' | 'hubs';

export interface Spec {
  label: string;
  value: string;
}

export interface Product {
  slug: string;
  name: string;
  model: string;
  category: CategoryId;
  price: number;
  /** the three numbers that matter most, shown on the card's spec plate */
  plate: [Spec, Spec, Spec];
  specs: Spec[];
  colors: { id: string; label: string; hex: string }[];
  stock: number;
  summary: string;
}

export const categories: { id: CategoryId; label: string; note: string }[] = [
  { id: 'audio', label: 'Audio', note: 'Headphones, earbuds, DACs' },
  { id: 'keyboards', label: 'Keyboards', note: 'Mechanical, low-profile, keycaps' },
  { id: 'power', label: 'Power', note: 'Chargers, power banks, cables' },
  { id: 'hubs', label: 'Hubs & docks', note: 'USB-C hubs, docks, adapters' },
];

export const products: Product[] = [
  {
    slug: 'h-40-anc-headphone',
    name: 'Over-ear ANC Headphone',
    model: 'H-40',
    category: 'audio',
    price: 1249000,
    plate: [
      { label: 'Driver', value: '40 mm' },
      { label: 'Battery', value: '60 h' },
      { label: 'Latency', value: '45 ms' },
    ],
    specs: [
      { label: 'Driver', value: '40 mm dynamic, PET diaphragm' },
      { label: 'Frequency response', value: '20 Hz – 40 kHz' },
      { label: 'Noise cancelling', value: 'Hybrid ANC, up to 35 dB' },
      { label: 'Battery', value: '60 h (ANC off), 40 h (ANC on)' },
      { label: 'Charging', value: 'USB-C, 10 min → 5 h playback' },
      { label: 'Bluetooth', value: '5.3, AAC / SBC' },
      { label: 'Latency', value: '45 ms in game mode' },
      { label: 'Weight', value: '265 g' },
    ],
    colors: [
      { id: 'graphite', label: 'Graphite', hex: '#24292c' },
      { id: 'aluminium', label: 'Aluminium', hex: '#b9bfc2' },
      { id: 'olive', label: 'Olive', hex: '#4c5440' },
    ],
    stock: 14,
    summary:
      'A closed-back headphone with hybrid noise cancelling and a battery that lasts a working week. Every part can be replaced: the cushions clip off and the battery sits behind a screwed panel.',
  },
  {
    slug: 'k-75-mechanical-keyboard',
    name: '75% Mechanical Keyboard',
    model: 'K-75',
    category: 'keyboards',
    price: 1890000,
    plate: [
      { label: 'Layout', value: '75%' },
      { label: 'Switch', value: 'Hot-swap' },
      { label: 'Polling', value: '1000 Hz' },
    ],
    specs: [],
    colors: [],
    stock: 6,
    summary: 'Gasket-mounted aluminium case with hot-swap sockets.',
  },
  {
    slug: 'p-20-power-bank',
    name: 'Power Bank 20.000 mAh',
    model: 'P-20',
    category: 'power',
    price: 459000,
    plate: [
      { label: 'Capacity', value: '20.000 mAh' },
      { label: 'Output', value: '65 W' },
      { label: 'Weight', value: '380 g' },
    ],
    specs: [],
    colors: [],
    stock: 32,
    summary: 'USB-C PD power bank that charges a laptop.',
  },
  {
    slug: 'd-7-usb-c-hub',
    name: '7-in-1 USB-C Hub',
    model: 'D-7',
    category: 'hubs',
    price: 389000,
    plate: [
      { label: 'Ports', value: '7' },
      { label: 'HDMI', value: '4K60' },
      { label: 'PD in', value: '100 W' },
    ],
    specs: [],
    colors: [],
    stock: 0,
    summary: 'HDMI, Ethernet, card reader and pass-through charging.',
  },
];

export function findProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}
