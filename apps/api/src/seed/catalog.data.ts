// Demo catalogue. Brands and products are fictional; specs are plausible for their category so the store
// reads like a real one. Prices in whole Rupiah.

export interface SeedProduct {
  slug: string;
  name: string;
  model: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  has3d?: boolean;
  description: string;
  /** first three are printed on the spec plate */
  specs: [string, string][];
  colors?: [key: string, label: string, hex: string][];
}

export const seedCategories = [
  { slug: 'audio', name: 'Audio', description: 'Headphones, earbuds, DACs', sortOrder: 1 },
  { slug: 'keyboards', name: 'Keyboards', description: 'Mechanical, low-profile, keycaps', sortOrder: 2 },
  { slug: 'power', name: 'Power', description: 'Chargers, power banks, cables', sortOrder: 3 },
  { slug: 'hubs', name: 'Hubs & docks', description: 'USB-C hubs, docks, adapters', sortOrder: 4 },
];

export const seedProducts: SeedProduct[] = [
  {
    slug: 'h-40-anc-headphone',
    name: 'Over-ear ANC Headphone',
    model: 'H-40',
    brand: 'Rakit Lab',
    category: 'audio',
    price: 1249000,
    stock: 14,
    has3d: true,
    description:
      'A closed-back headphone with hybrid noise cancelling and a battery that lasts a working week. Every part can be replaced: the cushions clip off and the battery sits behind a screwed panel.',
    specs: [
      ['Driver', '40 mm'],
      ['Battery', '60 h'],
      ['Latency', '45 ms'],
      ['Frequency response', '20 Hz – 40 kHz'],
      ['Noise cancelling', 'Hybrid ANC, up to 35 dB'],
      ['Charging', 'USB-C, 10 min → 5 h playback'],
      ['Bluetooth', '5.3, AAC / SBC'],
      ['Weight', '265 g'],
    ],
    colors: [
      ['graphite', 'Graphite', '#24292c'],
      ['aluminium', 'Aluminium', '#b9bfc2'],
      ['olive', 'Olive', '#4c5440'],
    ],
  },
  {
    slug: 'e-12-wireless-earbuds',
    name: 'Wireless Earbuds',
    model: 'E-12',
    brand: 'Arus',
    category: 'audio',
    price: 649000,
    stock: 40,
    description:
      'Small earbuds with a 10 mm driver, multipoint pairing and a case that charges over USB-C or Qi.',
    specs: [
      ['Driver', '10 mm'],
      ['Battery', '8 + 24 h'],
      ['Water', 'IPX5'],
      ['Bluetooth', '5.3, multipoint'],
      ['Charging', 'USB-C, Qi wireless'],
      ['Weight', '4.8 g per bud'],
    ],
    colors: [
      ['graphite', 'Graphite', '#24292c'],
      ['chalk', 'Chalk', '#e9e7e1'],
    ],
  },
  {
    slug: 'd-2-usb-c-dac',
    name: 'USB-C DAC Dongle',
    model: 'D-2',
    brand: 'Tegak',
    category: 'audio',
    price: 899000,
    stock: 3,
    description:
      'A pocket DAC that drives 300 Ω headphones from a phone or laptop, with a 3.5 mm and a 4.4 mm output.',
    specs: [
      ['Resolution', '32-bit / 384 kHz'],
      ['Output', '3.5 + 4.4 mm'],
      ['Power', '125 mW @ 32 Ω'],
      ['SNR', '121 dB'],
      ['Weight', '14 g'],
    ],
  },
  {
    slug: 'k-75-mechanical-keyboard',
    name: '75% Mechanical Keyboard',
    model: 'K-75',
    brand: 'Rakit Lab',
    category: 'keyboards',
    price: 1890000,
    stock: 6,
    description:
      'A gasket-mounted aluminium keyboard with hot-swap sockets, so switches can be changed without soldering.',
    specs: [
      ['Layout', '75%'],
      ['Switch', 'Hot-swap'],
      ['Polling', '1000 Hz'],
      ['Case', 'CNC aluminium'],
      ['Mount', 'Gasket'],
      ['Connection', 'USB-C, Bluetooth 5.1, 2.4 GHz'],
      ['Battery', '4000 mAh'],
    ],
    colors: [
      ['graphite', 'Graphite', '#24292c'],
      ['aluminium', 'Aluminium', '#b9bfc2'],
    ],
  },
  {
    slug: 'k-60-low-profile-keyboard',
    name: 'Low-profile Keyboard',
    model: 'K-60',
    brand: 'Arus',
    category: 'keyboards',
    price: 1150000,
    stock: 18,
    description: 'A slim 60% board with low-profile switches for travel, pairing with three devices.',
    specs: [
      ['Layout', '60%'],
      ['Height', '17 mm'],
      ['Battery', '120 h'],
      ['Switch', 'Low-profile linear'],
      ['Connection', 'USB-C, Bluetooth 5.1'],
      ['Weight', '410 g'],
    ],
  },
  {
    slug: 'kc-1-pbt-keycap-set',
    name: 'PBT Keycap Set',
    model: 'KC-1',
    brand: 'Tegak',
    category: 'keyboards',
    price: 349000,
    stock: 25,
    description: 'Dye-sublimated PBT keycaps in a cherry profile, covering 60% to full-size layouts.',
    specs: [
      ['Keys', '139'],
      ['Material', 'PBT'],
      ['Profile', 'Cherry'],
      ['Legends', 'Dye-sublimated'],
      ['Thickness', '1.5 mm'],
    ],
  },
  {
    slug: 'p-20-power-bank',
    name: 'Power Bank 20.000 mAh',
    model: 'P-20',
    brand: 'Arus',
    category: 'power',
    price: 459000,
    stock: 32,
    description:
      'A USB-C PD power bank that can charge a laptop, with two outputs and pass-through charging.',
    specs: [
      ['Capacity', '20.000 mAh'],
      ['Output', '65 W'],
      ['Weight', '380 g'],
      ['Ports', '2 × USB-C, 1 × USB-A'],
      ['Recharge', '2.5 h at 45 W'],
    ],
  },
  {
    slug: 'c-65-gan-charger',
    name: 'GaN Charger 65 W',
    model: 'C-65',
    brand: 'Arus',
    category: 'power',
    price: 399000,
    stock: 50,
    description: 'A compact gallium-nitride charger that splits 65 W across two USB-C ports and one USB-A.',
    specs: [
      ['Output', '65 W'],
      ['Ports', '3'],
      ['Size', '30 × 54 mm'],
      ['Standard', 'USB PD 3.0, PPS'],
      ['Plug', 'Type C, folding'],
    ],
  },
  {
    slug: 'cb-2-usb-c-cable',
    name: 'USB-C Cable 2 m',
    model: 'CB-2',
    brand: 'Tegak',
    category: 'power',
    price: 159000,
    stock: 120,
    description: 'A braided USB-C cable rated for 240 W charging and 10 Gbps data.',
    specs: [
      ['Length', '2 m'],
      ['Power', '240 W'],
      ['Data', '10 Gbps'],
      ['Jacket', 'Braided nylon'],
    ],
  },
  {
    slug: 'd-7-usb-c-hub',
    name: '7-in-1 USB-C Hub',
    model: 'D-7',
    brand: 'Rakit Lab',
    category: 'hubs',
    price: 389000,
    stock: 0,
    description: 'HDMI, Ethernet, a card reader and pass-through charging in one aluminium hub.',
    specs: [
      ['Ports', '7'],
      ['HDMI', '4K60'],
      ['PD in', '100 W'],
      ['Ethernet', '1 Gbps'],
      ['Card reader', 'SD + microSD'],
    ],
  },
  {
    slug: 'd-12-thunderbolt-dock',
    name: 'Thunderbolt 4 Dock',
    model: 'D-12',
    brand: 'Rakit Lab',
    category: 'hubs',
    price: 3490000,
    stock: 4,
    description: 'One cable to two 4K displays, 2.5 Gb Ethernet and 96 W of laptop charging.',
    specs: [
      ['Ports', '12'],
      ['Displays', '2 × 4K60'],
      ['PD out', '96 W'],
      ['Ethernet', '2.5 Gbps'],
      ['Host', 'Thunderbolt 4 / USB4'],
    ],
  },
  {
    slug: 'a-1-usb-c-ethernet',
    name: 'USB-C to Ethernet Adapter',
    model: 'A-1',
    brand: 'Tegak',
    category: 'hubs',
    price: 189000,
    stock: 60,
    description: 'Wired 2.5 Gb networking for laptops without a network port.',
    specs: [
      ['Speed', '2.5 Gbps'],
      ['Port', 'USB-C'],
      ['Driver', 'Plug and play'],
      ['Length', '15 cm'],
    ],
  },
];
