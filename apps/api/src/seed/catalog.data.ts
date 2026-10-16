// Demo catalogue: the parts of the Rakit E-1 and a few accessories. The bike and its parts are fictional;
// specs are plausible for a 29-inch trail e-bike so the store reads like a real one. Prices in whole Rupiah.

import type { PartModule } from '../generated/prisma/client.js';

export interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  /** place in the E-1 build; null for accessories */
  slot: number | null;
}

export interface SeedProduct {
  slug: string;
  name: string;
  /** part code on the spec plate */
  model: string;
  category: string;
  module: PartModule;
  price: number;
  stock: number;
  description: string;
  /** first three are printed on the spec plate */
  specs: [string, string][];
  colors?: [key: string, label: string, hex: string][];
}

export const seedCategories: SeedCategory[] = [
  {
    slug: 'frames',
    name: 'Frames',
    description: 'Frame, rear triangle and the 85 Nm mid-drive',
    sortOrder: 1,
    slot: 0,
  },
  {
    slug: 'batteries',
    name: 'Batteries',
    description: 'Packs that drop out of the down tube',
    sortOrder: 2,
    slot: 1,
  },
  {
    slug: 'shocks',
    name: 'Rear shocks',
    description: '150 mm of rear travel, coil or air',
    sortOrder: 3,
    slot: 2,
  },
  {
    slug: 'forks',
    name: 'Forks',
    description: 'Suspension forks with the front brake',
    sortOrder: 4,
    slot: 3,
  },
  {
    slug: 'wheelsets',
    name: 'Wheelsets',
    description: '29-inch wheels, tyres, rotors and cassette body',
    sortOrder: 5,
    slot: 4,
  },
  {
    slug: 'drivetrains',
    name: 'Drivetrains',
    description: 'Cranks, chain, cassette and derailleur',
    sortOrder: 6,
    slot: 5,
  },
  {
    slug: 'cockpits',
    name: 'Cockpits',
    description: 'Bar, stem, grips, levers and the display',
    sortOrder: 7,
    slot: 6,
  },
  { slug: 'seats', name: 'Seatposts', description: 'Dropper posts with the saddle', sortOrder: 8, slot: 7 },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Lights, locks and workshop tools',
    sortOrder: 9,
    slot: null,
  },
];

/** the frame's finishes, matching the colours the 3D bike is painted in */
const frameColors: SeedProduct['colors'] = [
  ['signal', 'Signal yellow', '#f2c230'],
  ['graphite', 'Graphite', '#3a4045'],
  ['glacier', 'Glacier white', '#e6e9ea'],
  ['ember', 'Ember orange', '#d4541f'],
  ['moss', 'Moss green', '#4c6a3f'],
];

const frame = (size: 'S' | 'M' | 'L', rider: string, reach: string, stock: number): SeedProduct => ({
  slug: `e1-frame-${size.toLowerCase()}`,
  name: `E-1 Frame ${size}`,
  model: `E1-FR-${size}`,
  category: 'frames',
  module: 'FRAME',
  price: 16_900_000,
  stock,
  description: `The hydroformed aluminium front triangle, the rear triangle and its rocker, with the 85 Nm mid-drive motor fitted. Size ${size} suits riders ${rider}.`,
  specs: [
    ['Rider height', rider],
    ['Reach', reach],
    ['Motor', '85 Nm mid-drive'],
    ['Head angle', '65°'],
    ['Wheel size', '29″'],
    ['Weight', '4.9 kg with motor'],
  ],
  colors: frameColors,
});

export const seedProducts: SeedProduct[] = [
  frame('S', '155–170 cm', '430 mm', 4),
  frame('M', '168–182 cm', '455 mm', 7),
  frame('L', '180–195 cm', '480 mm', 5),
  {
    slug: 'e1-battery-625',
    name: 'Battery 625 Wh',
    model: 'BT-625',
    category: 'batteries',
    module: 'BATTERY',
    price: 9_400_000,
    stock: 9,
    description: 'A 625 Wh pack that drops out of the down tube with one key. Fits every frame size.',
    specs: [
      ['Capacity', '625 Wh'],
      ['Range', 'up to 110 km'],
      ['Charge', '0–80 % in 3.5 h'],
      ['Cells', '21700 lithium-ion'],
      ['Weight', '3.4 kg'],
    ],
  },
  {
    slug: 'e1-battery-750',
    name: 'Battery 750 Wh',
    model: 'BT-750',
    category: 'batteries',
    module: 'BATTERY',
    price: 11_900_000,
    stock: 6,
    description:
      'The long-range pack: 750 Wh in the same drop-out housing. Too long for the S frame’s down tube.',
    specs: [
      ['Capacity', '750 Wh'],
      ['Range', 'up to 135 km'],
      ['Charge', '0–80 % in 4 h'],
      ['Cells', '21700 lithium-ion'],
      ['Weight', '4.1 kg'],
    ],
  },
  {
    slug: 'e1-shock-coil',
    name: 'Coil shock 150 mm',
    model: 'SH-C150',
    category: 'shocks',
    module: 'SHOCK',
    price: 7_900_000,
    stock: 8,
    description:
      'A coil-spring shock: the most consistent feel on long descents. Spring rate chosen by rider weight.',
    specs: [
      ['Travel', '150 mm'],
      ['Spring', 'Coil, 450 lb/in'],
      ['Adjustments', 'Rebound, low-speed compression'],
      ['Stroke', '62.5 mm'],
    ],
  },
  {
    slug: 'e1-shock-air',
    name: 'Air shock 150 mm',
    model: 'SH-A150',
    category: 'shocks',
    module: 'SHOCK',
    price: 6_900_000,
    stock: 10,
    description:
      'An air shock, tuned with a pump to the rider’s weight. Lighter than the coil, livelier on climbs.',
    specs: [
      ['Travel', '150 mm'],
      ['Spring', 'Air, tunable'],
      ['Adjustments', 'Rebound, climb lever'],
      ['Stroke', '62.5 mm'],
    ],
  },
  {
    slug: 'e1-fork-160',
    name: 'Trail fork 160 mm',
    model: 'FK-160',
    category: 'forks',
    module: 'FORK',
    price: 9_800_000,
    stock: 9,
    description: 'A 160 mm air fork with gold-coated stanchions, the front brake and the headlight mount.',
    specs: [
      ['Travel', '160 mm'],
      ['Stanchions', '36 mm, gold coat'],
      ['Brake', '4-piston, 203 mm'],
      ['Axle', '15 × 110 mm'],
      ['Offset', '44 mm'],
    ],
  },
  {
    slug: 'e1-fork-170',
    name: 'Enduro fork 170 mm',
    model: 'FK-170',
    category: 'forks',
    module: 'FORK',
    price: 11_200_000,
    stock: 4,
    description: 'Ten more millimetres for steeper ground. The S frame is not rated for it.',
    specs: [
      ['Travel', '170 mm'],
      ['Stanchions', '38 mm, gold coat'],
      ['Brake', '4-piston, 220 mm'],
      ['Axle', '15 × 110 mm'],
      ['Offset', '44 mm'],
    ],
  },
  {
    slug: 'e1-wheelset-alloy',
    name: 'Alloy wheelset AL30',
    model: 'WS-AL30',
    category: 'wheelsets',
    module: 'WHEELSET',
    price: 7_600_000,
    stock: 12,
    description: 'Both 29-inch wheels on 32 spokes each, tubeless-ready 2.4″ tyres and 203 mm rotors.',
    specs: [
      ['Rims', 'AL30, 30 mm inner'],
      ['Tyres', '29 × 2.4″ tubeless-ready'],
      ['Spokes', '32, two-cross'],
      ['Rotors', '203 mm'],
      ['Weight', '2.3 kg pair, without tyres'],
    ],
  },
  {
    slug: 'e1-wheelset-carbon',
    name: 'Carbon wheelset C30',
    model: 'WS-C30',
    category: 'wheelsets',
    module: 'WHEELSET',
    price: 14_500_000,
    stock: 3,
    description: 'The same tyres and rotors on carbon rims: lighter, and stiffer through corners.',
    specs: [
      ['Rims', 'C30 carbon, 30 mm inner'],
      ['Tyres', '29 × 2.4″ tubeless-ready'],
      ['Spokes', '28, straight-pull'],
      ['Rotors', '203 mm'],
      ['Weight', '1.8 kg pair, without tyres'],
    ],
  },
  {
    slug: 'e1-drivetrain-12',
    name: '1 × 12 drivetrain',
    model: 'DT-112',
    category: 'drivetrains',
    module: 'DRIVETRAIN',
    price: 5_600_000,
    stock: 11,
    description: 'Cranks with a 34-tooth ring, a 10–52 cassette, the chain and a cable derailleur.',
    specs: [
      ['Gears', '1 × 12'],
      ['Cassette', '10–52'],
      ['Chainring', '34 T'],
      ['Cranks', '165 mm'],
      ['Shifting', 'Cable'],
    ],
  },
  {
    slug: 'e1-drivetrain-12-wireless',
    name: '1 × 12 wireless drivetrain',
    model: 'DT-112W',
    category: 'drivetrains',
    module: 'DRIVETRAIN',
    price: 9_900_000,
    stock: 5,
    description: 'The same range with a wireless derailleur that charges from the bike’s battery.',
    specs: [
      ['Gears', '1 × 12'],
      ['Cassette', '10–52'],
      ['Chainring', '34 T'],
      ['Cranks', '165 mm'],
      ['Shifting', 'Wireless, powered by the bike'],
    ],
  },
  {
    slug: 'e1-cockpit-alloy',
    name: 'Alloy cockpit 780 mm',
    model: 'CP-AL780',
    category: 'cockpits',
    module: 'COCKPIT',
    price: 2_100_000,
    stock: 14,
    description: 'A 780 mm riser bar, 45 mm stem, lock-on grips, brake levers and the colour display.',
    specs: [
      ['Bar width', '780 mm'],
      ['Rise', '25 mm'],
      ['Stem', '45 mm'],
      ['Display', 'Colour, battery and mode'],
    ],
  },
  {
    slug: 'e1-cockpit-carbon',
    name: 'Carbon cockpit 800 mm',
    model: 'CP-C800',
    category: 'cockpits',
    module: 'COCKPIT',
    price: 4_300_000,
    stock: 6,
    description: 'A wider carbon bar that damps trail buzz, with the same stem, levers and display.',
    specs: [
      ['Bar width', '800 mm'],
      ['Rise', '30 mm'],
      ['Stem', '45 mm'],
      ['Display', 'Colour, battery and mode'],
    ],
  },
  {
    slug: 'e1-seat-150',
    name: 'Dropper 150 mm with saddle',
    model: 'ST-D150',
    category: 'seats',
    module: 'SEAT',
    price: 3_200_000,
    stock: 12,
    description: 'A 150 mm dropper post worked from the bar, and the trail saddle.',
    specs: [
      ['Drop', '150 mm'],
      ['Diameter', '31.6 mm'],
      ['Remote', 'Bar lever'],
      ['Saddle', '142 mm wide'],
    ],
  },
  {
    slug: 'e1-seat-200',
    name: 'Dropper 200 mm with saddle',
    model: 'ST-D200',
    category: 'seats',
    module: 'SEAT',
    price: 3_900_000,
    stock: 7,
    description: 'Fifty more millimetres of drop for tall riders. Too long for the S frame’s seat tube.',
    specs: [
      ['Drop', '200 mm'],
      ['Diameter', '31.6 mm'],
      ['Remote', 'Bar lever'],
      ['Saddle', '142 mm wide'],
    ],
  },
  {
    slug: 'lights-front-rear',
    name: 'Front and rear lights',
    model: 'AC-LT',
    category: 'accessories',
    module: 'ACCESSORY',
    price: 650_000,
    stock: 20,
    description: 'A 1,200-lumen headlight and a brake-sensing tail light, both run from the bike’s battery.',
    specs: [
      ['Headlight', '1,200 lm'],
      ['Tail light', 'Brake-sensing'],
      ['Power', 'From the bike battery'],
    ],
  },
  {
    slug: 'folding-lock',
    name: 'Folding lock',
    model: 'AC-LK',
    category: 'accessories',
    module: 'ACCESSORY',
    price: 890_000,
    // sold out on purpose: the catalogue and cart show what that looks like
    stock: 0,
    description: 'Hardened steel links that fold into a frame-mounted holster.',
    specs: [
      ['Length', '90 cm'],
      ['Material', 'Hardened steel'],
      ['Weight', '1.1 kg'],
    ],
  },
  {
    slug: 'battery-charger-4a',
    name: 'Fast charger 4 A',
    model: 'AC-CH4',
    category: 'accessories',
    module: 'ACCESSORY',
    price: 1_150_000,
    stock: 10,
    description: 'Charges either battery in or out of the bike, 0–80 % in about two and a half hours.',
    specs: [
      ['Current', '4 A'],
      ['0–80 %', 'about 2.5 h'],
      ['Input', '100–240 V'],
    ],
  },
  {
    slug: 'workshop-hex-set',
    name: 'Workshop hex key set',
    model: 'AC-HX',
    category: 'accessories',
    module: 'ACCESSORY',
    price: 320_000,
    stock: 25,
    description: 'Every bolt on the E-1 in nine keys, with a torque card for each part.',
    specs: [
      ['Sizes', '1.5–10 mm'],
      ['Keys', '9'],
      ['Includes', 'Torque card'],
    ],
  },
  // second-wave parts: one more in each slot, each a different shape on the bike
  {
    slug: 'e1-shock-coil-piggyback',
    name: 'Coil shock 150 mm, piggyback',
    model: 'SH-C150P',
    category: 'shocks',
    module: 'SHOCK',
    price: 9_400_000,
    stock: 5,
    description:
      'The coil shock with a piggyback reservoir: more oil, so it stays consistent on the longest descents.',
    specs: [
      ['Travel', '150 mm'],
      ['Spring', 'Coil, 450 lb/in'],
      ['Reservoir', 'Piggyback'],
      ['Adjustments', 'Rebound, high- and low-speed compression'],
      ['Stroke', '62.5 mm'],
    ],
  },
  {
    slug: 'e1-fork-dual-200',
    name: 'Dual-crown fork 200 mm',
    model: 'FK-DC200',
    category: 'forks',
    module: 'FORK',
    price: 16_500_000,
    stock: 3,
    description:
      'A downhill fork: the stanchions run up past the head tube to a second crown. For bike parks, not for climbing.',
    specs: [
      ['Travel', '200 mm'],
      ['Crowns', 'Dual'],
      ['Brake', '4-piston, 220 mm'],
      ['Stanchions', '38 mm, gold coat'],
      ['Axle', '20 × 110 mm'],
    ],
  },
  {
    slug: 'e1-wheelset-plus',
    name: 'Plus wheelset 29 × 2.6',
    model: 'WS-P26',
    category: 'wheelsets',
    module: 'WHEELSET',
    price: 9_200_000,
    stock: 6,
    description: 'Wider rims and 2.6″ tyres: more grip and more cushion at lower pressure, for loose ground.',
    specs: [
      ['Rims', 'AL35, 35 mm inner'],
      ['Tyres', '29 × 2.6″ tubeless-ready'],
      ['Spokes', '32, two-cross'],
      ['Weight', '2.6 kg pair, without tyres'],
    ],
  },
  {
    slug: 'e1-drivetrain-belt',
    name: 'Belt drive, single speed',
    model: 'DT-BELT',
    category: 'drivetrains',
    module: 'DRIVETRAIN',
    price: 6_900_000,
    stock: 4,
    description:
      'A carbon-reinforced belt on one sprocket: no derailleur, no oil, no chain to wear. The motor does the gearing.',
    specs: [
      ['Gears', '1 × 1'],
      ['Belt', 'Carbon-reinforced'],
      ['Chainring', '50 T'],
      ['Rear sprocket', '24 T'],
    ],
  },
  {
    slug: 'e1-cockpit-integrated',
    name: 'Integrated carbon bar-stem 780 mm',
    model: 'CP-INT780',
    category: 'cockpits',
    module: 'COCKPIT',
    price: 6_200_000,
    stock: 4,
    description: 'Bar and stem moulded in one piece of carbon, flat, with the levers and the colour display.',
    specs: [
      ['Bar width', '780 mm'],
      ['Rise', '0 mm, flat'],
      ['Stem', '45 mm, one piece'],
      ['Display', 'Colour, battery and mode'],
    ],
  },
  {
    slug: 'e1-seat-rigid',
    name: 'Rigid carbon post, race saddle',
    model: 'ST-R0',
    category: 'seats',
    module: 'SEAT',
    price: 4_100_000,
    stock: 5,
    description:
      'A fixed carbon seatpost and a narrow race saddle: lighter, for riders who never drop the seat.',
    specs: [
      ['Drop', 'None, rigid'],
      ['Diameter', '31.6 mm'],
      ['Saddle', 'Race, carbon rails'],
    ],
  },
  {
    slug: 'range-extender-250',
    name: 'Range extender 250 Wh',
    model: 'AC-RX250',
    category: 'accessories',
    module: 'ACCESSORY',
    price: 4_900_000,
    stock: 6,
    description:
      'A second battery in a bottle cage, cabled to the frame’s port, for days longer than one charge.',
    specs: [
      ['Capacity', '250 Wh'],
      ['Mount', 'Bottle cage bosses'],
      ['Weight', '1.5 kg'],
    ],
  },
  {
    slug: 'rear-rack',
    name: 'Rear rack',
    model: 'AC-RK',
    category: 'accessories',
    module: 'ACCESSORY',
    price: 1_100_000,
    stock: 9,
    description: 'An aluminium rack on the rear axle and seat stays, for a pannier or a crate.',
    specs: [
      ['Load', '25 kg'],
      ['Mount', 'Axle and seat stays'],
      ['Weight', '0.7 kg'],
    ],
  },
  {
    slug: 'fender-set',
    name: 'Fender set',
    model: 'AC-FN',
    category: 'accessories',
    module: 'ACCESSORY',
    price: 650_000,
    stock: 12,
    description: 'Front and rear fenders that clip on without tools, shaped for tyres up to 29 × 2.6″.',
    specs: [
      ['Fits', 'Up to 29 × 2.6″'],
      ['Mount', 'Clip-on, no tools'],
      ['Material', 'Recycled polypropylene'],
    ],
  },
];

/** pairs of parts that cannot go on the same bike, with the reason the buyer sees */
export const seedConflicts: [a: string, b: string, reason: string][] = [
  ['e1-frame-s', 'e1-battery-750', 'The 750 Wh battery is longer than the S frame’s down tube.'],
  ['e1-frame-s', 'e1-fork-170', 'The S frame is rated for forks up to 160 mm.'],
  ['e1-frame-s', 'e1-seat-200', 'A 200 mm dropper needs a longer seat tube than the S frame has.'],
  ['e1-frame-s', 'e1-fork-dual-200', 'The S frame is rated for forks up to 160 mm.'],
];
