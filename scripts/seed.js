'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { faker } = require('@faker-js/faker');

const ENTRY_COUNT = 12;
const PUBLISH_RATIO = 0.7;
const RANDOM_SEED = 20261028;
const SEED_ID_PREFIX = 'seed';
const SEED_FILE_PREFIX = 'seed-placeholder';
const SEED_ASSET_DIR = path.join(__dirname, '..', '.tmp', 'seed-assets');

const UIDS = {
  destination: 'api::destination.destination',
  tour: 'api::tour.tour',
  service: 'api::service.service',
  faq: 'api::faq.faq',
  testimonial: 'api::testimonial.testimonial',
  teamMember: 'api::team-member.team-member',
  global: 'api::global.global',
  galleryPage: 'api::gallery-page.gallery-page',
  contactSubmission: 'api::contact-submission.contact-submission',
  tripRequest: 'api::trip-request.trip-request',
};

const CREATE_ORDER = [
  UIDS.destination,
  UIDS.tour,
  UIDS.service,
  UIDS.faq,
  UIDS.testimonial,
  UIDS.teamMember,
  UIDS.global,
  UIDS.galleryPage,
  UIDS.contactSubmission,
  UIDS.tripRequest,
];

const RESET_ORDER = [...CREATE_ORDER].reverse();

const DESTINATION_SEEDS = [
  {
    city: 'Kyoto',
    country: 'Japan',
    continent: 'asia',
    short: 'Temple gardens, lantern-lit lanes and centuries of craft tradition in the old imperial capital.',
    attractions: ['Fushimi Inari Shrine', 'Kinkaku-ji', 'Arashiyama Bamboo Grove', 'Gion district'],
    activities: ['Tea ceremony', 'Temple walk', 'Kaiseki dinner', 'Craft workshop'],
    bestTime: ['Late March to May', 'October to November'],
  },
  {
    city: 'Bali',
    country: 'Indonesia',
    continent: 'asia',
    short: 'Rice terraces, reef-lined beaches and a relaxed island culture built around family and ritual.',
    attractions: ['Uluwatu Temple', 'Tegallalang Rice Terraces', 'Mount Batur', 'Nusa Penida'],
    activities: ['Sunrise volcano hike', 'Surfing lesson', 'Balinese cooking class', 'Snorkelling trip'],
    bestTime: ['April to October', 'Shoulder season in November'],
  },
  {
    city: 'Ladakh',
    country: 'India',
    continent: 'asia',
    short: 'High-altitude desert, dramatic passes and quiet Buddhist monasteries in the Indian Himalaya.',
    attractions: ['Pangong Tso', 'Nubra Valley', 'Thiksey Monastery', 'Khardung La'],
    activities: ['Monastery visits', 'River rafting', 'Jeep safari', 'Stargazing'],
    bestTime: ['June to September', 'Early October'],
  },
  {
    city: 'Lisbon',
    country: 'Portugal',
    continent: 'europe',
    short: 'Hillside neighbourhoods, tiled facades and Atlantic light a short tram ride from the coast.',
    attractions: ['Belem Tower', 'Alfama', 'Sintra', 'Jeronimos Monastery'],
    activities: ['Tram tour', 'Pastel de nata tasting', 'Coastal day trip', 'Fado evening'],
    bestTime: ['March to June', 'September to October'],
  },
  {
    city: 'Dolomites',
    country: 'Italy',
    continent: 'europe',
    short: 'Jagged limestone peaks, emerald lakes and mountain huts linked by some of Europe\'s finest trails.',
    attractions: ['Tre Cime di Lavaredo', 'Lago di Braies', 'Val Gardena', 'Seceda'],
    activities: ['Alpine hiking', 'Via ferrata', 'Landscape photography', 'Mountain hut lunch'],
    bestTime: ['June to September', 'Late September for autumn colour'],
  },
  {
    city: 'Santorini',
    country: 'Greece',
    continent: 'europe',
    short: 'Whitewashed villages above a flooded caldera, with slow days and famous Aegean sunsets.',
    attractions: ['Oia', 'Fira', 'Akrotiri', 'Red Beach'],
    activities: ['Caldera sail', 'Wine tasting', 'Coastal hike', 'Cooking class'],
    bestTime: ['May to June', 'September to October'],
  },
  {
    city: 'Marrakech',
    country: 'Morocco',
    continent: 'africa',
    short: 'A maze of souks, courtyard riads and gardens at the gateway to the Atlas Mountains.',
    attractions: ['Jemaa el-Fnaa', 'Majorelle Garden', 'Bahia Palace', 'Atlas Mountains'],
    activities: ['Souk tour', 'Moroccan cooking class', 'Desert day trip', 'Hammam visit'],
    bestTime: ['March to May', 'September to November'],
  },
  {
    city: 'Serengeti',
    country: 'Tanzania',
    continent: 'africa',
    short: 'Endless savannah and big-cat country, with the Great Migration moving across the plains.',
    attractions: ['Seronera Valley', 'Ngorongoro Crater', 'Grumeti River', 'Migration plains'],
    activities: ['Game drives', 'Balloon safari', 'Maasai village visit', 'Night-time wildlife talk'],
    bestTime: ['June to October', 'January to February for calving season'],
  },
  {
    city: 'Cape Town',
    country: 'South Africa',
    continent: 'africa',
    short: 'A mountain-backed city where beaches, vineyards and penguin colonies sit within an hour of each other.',
    attractions: ['Table Mountain', 'Cape Point', 'Boulders Beach', 'Stellenbosch'],
    activities: ['Cableway ride', 'Wine tasting', 'Penguin watching', 'Coastal drive'],
    bestTime: ['November to March', 'April for quieter vineyards'],
  },
  {
    city: 'Queenstown',
    country: 'New Zealand',
    continent: 'oceania',
    short: 'Adventure capital on a glacial lake, surrounded by alpine trails, rivers and dramatic valleys.',
    attractions: ['Lake Wakatipu', 'Milford Sound', 'The Remarkables', 'Arrowtown'],
    activities: ['Bungee jumping', 'Jet boating', 'Alpine hiking', 'Scenic flight'],
    bestTime: ['December to March', 'June to August for skiing'],
  },
  {
    city: 'Cusco',
    country: 'Peru',
    continent: 'south_america',
    short: 'Andean stone streets, colonial plazas and the gateway to Machu Picchu and the Sacred Valley.',
    attractions: ['Machu Picchu', 'Sacsayhuaman', 'Sacred Valley', 'Rainbow Mountain'],
    activities: ['Inca Trail trek', 'Market visit', 'Ceviche class', 'Weaving demonstration'],
    bestTime: ['May to September', 'Late April and October'],
  },
  {
    city: 'Patagonia',
    country: 'Argentina',
    continent: 'south_america',
    short: 'Wind-carved peaks, turquoise lakes and immense glaciers at the southern edge of the continent.',
    attractions: ['Perito Moreno Glacier', 'Torres del Paine', 'El Chalten', 'Lake Argentino'],
    activities: ['Glacier trek', 'Multi-day hike', 'Wildlife spotting', 'Estancia evening'],
    bestTime: ['November to March', 'December for long daylight hours'],
  },
];

const TOUR_SUFFIXES = [
  'Cultural Immersion',
  'Highlights and Hidden Gems',
  'Adventure Escape',
  'Family Discovery',
  'Photography Journey',
  'Trekking Expedition',
  'Coastal Escape',
  'Mountain Explorer',
  'Food and Market Walk',
  'Slow Travel Week',
  'Wildlife and Landscapes',
  'Private Guided Journey',
];

const SERVICE_TITLES = [
  'Tailor-Made Itineraries',
  'Small-Group Tours',
  'Private Guided Journeys',
  'Honeymoon Travel Planning',
  'Corporate Retreats',
  'Family Adventure Holidays',
  'Trekking and Hiking Expeditions',
  'Cultural and Heritage Tours',
  'Wildlife Safaris',
  'Luxury Rail Journeys',
  'Airport Transfers and Logistics',
  'Travel Insurance Assistance',
];

const FAQ_SEEDS = [
  {
    question: 'How far in advance should I book a trip?',
    answer: 'For most destinations we recommend booking three to six months ahead, especially for peak seasons and multi-country itineraries. If your dates are close, contact us and we will check live availability with our local partners.',
    category: 'general',
  },
  {
    question: 'Are your trips suitable for solo travellers?',
    answer: 'Yes. Many of our small-group departures welcome solo travellers, and we can also design private itineraries with single rooms or shared accommodation to suit your budget.',
    category: 'general',
  },
  {
    question: 'Do I need travel insurance?',
    answer: 'Travel insurance is strongly recommended for every trip. It should cover medical care, evacuation, cancellation and lost luggage. Some of our trekking and safari partners also require proof of cover before departure.',
    category: 'general',
  },
  {
    question: 'What is included in a tailor-made itinerary?',
    answer: 'A tailor-made itinerary can include accommodation, private guides, transport, activities and restaurant bookings. Flights are optional and can be quoted separately if you would like us to handle the whole journey.',
    category: 'services',
  },
  {
    question: 'What is included in the tour price?',
    answer: 'Our published prices normally include accommodation, listed meals, local transport, guides and entrance fees. International flights, visas, travel insurance and personal spending are usually excluded unless stated otherwise.',
    category: 'pricing',
  },
  {
    question: 'Are international flights included?',
    answer: 'International flights are not included in the base tour price. We can quote flights separately through our partner agents so that you have a single point of contact for the whole trip.',
    category: 'pricing',
  },
  {
    question: 'Can I pay in instalments?',
    answer: 'Yes. Most bookings can be secured with a deposit, with the balance due before departure. Instalment plans are available for selected trips and are confirmed in writing when you book.',
    category: 'pricing',
  },
  {
    question: 'Do prices change with group size?',
    answer: 'Private trips are priced according to the number of travellers, room categories and included activities. As a general rule, larger private groups benefit from lower per-person transport and guiding costs.',
    category: 'pricing',
  },
  {
    question: 'Can you arrange private guides?',
    answer: 'We work with trusted local guides in every destination we sell. Private guiding can be added to any itinerary, including specialist guides for photography, food, hiking or family travel.',
    category: 'services',
  },
  {
    question: 'Can you book domestic flights and transfers?',
    answer: 'Yes. We can book domestic flights, rail tickets, private transfers and airport meet-and-greet services as part of your itinerary. We monitor schedules and adjust ground arrangements if a flight changes.',
    category: 'services',
  },
  {
    question: 'Can you accommodate dietary requirements?',
    answer: 'Please tell us about allergies, intolerances and dietary preferences when you enquire. We pass the details to hotels, guides and restaurants, and we can plan food-focused activities around your needs.',
    category: 'services',
  },
  {
    question: 'Do you organise family trips with young children?',
    answer: 'Yes. We plan family journeys with shorter travel days, child-friendly guides, connecting rooms and activities that work for different ages. We can also arrange cots, car seats and babysitting where available.',
    category: 'services',
  },
  {
    question: 'What happens if my flight is delayed?',
    answer: 'Contact our 24-hour support line or your local guide as soon as you know about a delay. We will rearrange transfers and, where possible, adjust the first day of your itinerary so that you do not miss included activities.',
    category: 'support',
  },
  {
    question: 'How do I contact you during a trip?',
    answer: 'You will receive an emergency contact card with a local and an office number before departure. During the trip you can also reach your guide directly and use our messaging channel for non-urgent questions.',
    category: 'support',
  },
  {
    question: 'Can I change my booking after confirmation?',
    answer: 'Changes are usually possible subject to supplier availability and any fees charged by airlines, hotels or local operators. Please contact us as early as possible so we can review the options for your dates.',
    category: 'support',
  },
  {
    question: 'What is your cancellation policy?',
    answer: 'Cancellation terms depend on the trip and its suppliers. The specific policy is shown in your booking confirmation, and we recommend travel insurance that covers cancellation from the day you book.',
    category: 'support',
  },
  {
    question: 'Do you offer responsible and sustainable travel options?',
    answer: 'We favour locally owned accommodation, small groups and guides who live in the regions we visit. On request we can suggest lower-carbon transport options and add community or conservation projects to your itinerary.',
    category: 'general',
  },
  {
    question: 'Can you help with visas and entry requirements?',
    answer: 'We provide up-to-date guidance on visa categories, entry forms and passport validity, but the application itself remains your responsibility. Requirements can change, so please verify them with the relevant embassy before departure.',
    category: 'support',
  },
];

const TESTIMONIAL_TEMPLATES = [
  'Our trip to {destination} was beautifully planned from start to finish. The local guide was thoughtful, the pace was just right, and every transfer worked like clockwork.',
  'We asked for a family-friendly route through {destination} and got exactly that. The children loved the hands-on activities and we loved not having to think about logistics.',
  '{destination} exceeded every expectation. The small group made it easy to ask questions, and the hidden stops were the highlight of the whole journey.',
  'The team listened to what we wanted in {destination} and then added ideas we would never have found ourselves. It felt personal rather than packaged.',
  'A seamless week in {destination}. Lovely accommodation, a brilliant guide and enough free time to explore at our own pace.',
  'We travelled through {destination} with three generations of our family and everyone came home with a favourite moment. That says a lot.',
  'The itinerary through {destination} balanced famous sights with quiet local experiences. We came back with stories, not just photographs.',
  'From the first call to the final transfer, everything in {destination} was handled with care. We are already planning the next trip.',
];

const TEAM_ROLES = [
  'Founder and Travel Curator',
  'Head of Operations',
  'Senior Trip Designer',
  'Destination Specialist - Asia',
  'Destination Specialist - Europe',
  'Customer Experience Lead',
  'Marketing Manager',
  'Finance and Administration Manager',
  'Local Guide Coordinator',
  'Sustainability Lead',
  'Travel Consultant',
  'Groups and Corporate Travel Manager',
];

const AUTHOR_ROLES = [
  'Adventure traveller',
  'Family holiday',
  'Photographer',
  'Solo traveller',
  'Honeymoon trip',
  'Small-group tour',
  'Repeat guest',
  'Corporate retreat',
];

const INCLUSIONS = [
  'Accommodation in hand-picked hotels and guesthouses',
  'Daily breakfast and selected meals',
  'Private airport transfers',
  'Local English-speaking guide',
  'Entrance fees to listed attractions',
  'All ground transport during the tour',
  '24-hour emergency support',
  'Small-group experience',
];

const EXCLUSIONS = [
  'International flights',
  'Travel insurance',
  'Visa fees',
  'Personal expenses and tips',
  'Optional activities not listed in the itinerary',
  'Meals not mentioned in the itinerary',
  'Alcoholic drinks',
];

const PREFERENCES = [
  'Photography, local food and quiet villages',
  'Family-friendly activities with short travel days',
  'Hiking and time in nature',
  'Art, architecture and museum visits',
  'Wildlife and conservation experiences',
  'Slow travel with plenty of free time',
  'Local markets and cooking classes',
];

const GROUP_SIZES = [
  '2 travellers',
  '2 adults, 1 child',
  '2 adults, 2 children',
  '3 friends',
  '4 adults',
  '5-8 travellers',
  'Solo traveller',
];

const CONTACT_STATUSES = ['new', 'new', 'contacted', 'closed'];
const TRIP_STATUSES = ['new', 'new', 'new', 'contacted', 'closed'];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function parseArgs(argv) {
  const flags = {
    reset: false,
    skipMedia: false,
    withPublicPermissions: false,
    allowRemoteDb: false,
    help: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case '--reset':
        flags.reset = true;
        break;
      case '--skip-media':
        flags.skipMedia = true;
        break;
      case '--with-public-permissions':
        flags.withPublicPermissions = true;
        break;
      case '--allow-remote-db':
        flags.allowRemoteDb = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return flags;
}

function printHelp() {
  console.log(`
Usage: npm run seed -- [options]

Options:
  --reset                    Delete seeded content and media, then seed again.
  --skip-media               Do not create or upload placeholder images.
  --with-public-permissions  Grant the public role read access to public content
                             and create access for the two enquiry forms.
  --allow-remote-db          Allow a non-local database connection. Production is
                             always refused.
  --help                     Show this message.
`);
}

function assertSafeEnvironment(flags) {
  const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();

  if (nodeEnv === 'production') {
    throw new Error('Refusing to seed with NODE_ENV=production.');
  }

  const client = String(process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();
  const host = process.env.DATABASE_HOST || '';
  const url = process.env.DATABASE_URL || '';

  if (client === 'sqlite') {
    console.log(`[seed] Target database: sqlite (${process.env.DATABASE_FILENAME || '.tmp/data.db'})`);
    return;
  }

  const looksLocal = /(localhost|127\.0\.0\.1|::1)/i.test(host) || /(localhost|127\.0\.0\.1|::1)/i.test(url);
  const hasRemoteUrl = Boolean(url) && !looksLocal;

  if (hasRemoteUrl || (!host && !url)) {
    if (!flags.allowRemoteDb) {
      throw new Error(
        `Refusing to seed a non-local ${client} database. Use --allow-remote-db only if you are certain it is not production.`
      );
    }
  }

  console.log(
    `[seed] Target database: ${client} at ${host || (url ? 'DATABASE_URL host' : 'localhost')}`
  );
}

function seedDocumentId(code, index) {
  const padding = 24 - SEED_ID_PREFIX.length - code.length;

  return `${SEED_ID_PREFIX}${code}${String(index).padStart(padding, '0')}`;
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function truncate(value, maxLength) {
  return String(value).slice(0, maxLength).trim();
}

function textNode(text) {
  return { type: 'text', text: String(text) };
}

function paragraphNode(text) {
  return { type: 'paragraph', children: [textNode(text)] };
}

function headingNode(text, level = 2) {
  return { type: 'heading', level, children: [textNode(text)] };
}

function listNode(items) {
  return {
    type: 'list',
    format: 'unordered',
    children: items.map((item) => ({ type: 'list-item', children: [textNode(item)] })),
  };
}

function blocks(paragraphs, listHeading, listItems) {
  const nodes = paragraphs.filter(Boolean).map(paragraphNode);

  if (listHeading && Array.isArray(listItems) && listItems.length) {
    nodes.push(headingNode(listHeading), listNode(listItems));
  }

  return nodes;
}

function listItems(items) {
  return items.map((text) => ({ text }));
}

function chooseDistinct(items, count) {
  return faker.helpers.arrayElements(items, Math.min(count, items.length));
}

function getDestinationSeed(index) {
  if (index < DESTINATION_SEEDS.length) {
    return DESTINATION_SEEDS[index];
  }

  const city = faker.location.city();
  const country = faker.location.country();

  return {
    city,
    country,
    continent: faker.helpers.arrayElement([
      'asia',
      'europe',
      'africa',
      'oceania',
      'south_america',
    ]),
    short: `A hand-picked itinerary through ${city} and the surrounding region, balancing well-known sights with local experiences.`,
    attractions: ['Historic centre', 'Local market', 'Scenic viewpoint', 'Regional day trip'],
    activities: ['Guided walk', 'Food tasting', 'Sunset viewpoint', 'Craft demonstration'],
    bestTime: ['Spring', 'Autumn'],
  };
}

function publishStatus() {
  return faker.number.float({ min: 0, max: 1 }) < PUBLISH_RATIO ? 'published' : 'draft';
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  const crcBuffer = Buffer.alloc(4);

  lengthBuffer.writeUInt32BE(data.length, 0);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));

  if (saturation === 0) {
    const channel = Math.round(lightness * 255);

    return [channel, channel, channel];
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const channel = (t) => {
    let value = t;

    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;

    return p;
  };

  return [
    Math.round(channel(hue + 1 / 3) * 255),
    Math.round(channel(hue) * 255),
    Math.round(channel(hue - 1 / 3) * 255),
  ];
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * amount);
}

function makeScenicPng(width, height, index) {
  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  const hue = (index * 47 + 15) % 360;
  const skyTop = hslToRgb(hue, 0.55, 0.58);
  const skyBottom = hslToRgb((hue + 28) % 360, 0.65, 0.84);
  const landNear = hslToRgb((hue + 125) % 360, 0.38, 0.32);
  const landFar = hslToRgb((hue + 115) % 360, 0.32, 0.46);
  const mountainBack = hslToRgb((hue + 195) % 360, 0.28, 0.34);
  const mountainFront = hslToRgb((hue + 205) % 360, 0.32, 0.22);
  const sunColor = [255, 240, 190];
  const horizon = Math.floor(height * 0.58);
  const sunX = width * (0.64 + 0.16 * Math.sin(index));
  const sunY = height * 0.27;
  const sunRadius = height * (0.1 + 0.02 * (index % 4));
  const ridgeBack = new Float32Array(width);
  const ridgeFront = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    const ratio = x / width;

    ridgeBack[x] = horizon - height * 0.17 * (0.5 + 0.5 * Math.sin(ratio * Math.PI * 2.4 + index));
    ridgeFront[x] = horizon - height * 0.1 * (0.5 + 0.5 * Math.sin(ratio * Math.PI * 3.7 + index * 1.7));
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * rowLength;

    raw[row] = 0;

    for (let x = 0; x < width; x += 1) {
      let color;

      if (y < horizon) {
        const skyMix = y / horizon;

        color = [
          mix(skyTop[0], skyBottom[0], skyMix),
          mix(skyTop[1], skyBottom[1], skyMix),
          mix(skyTop[2], skyBottom[2], skyMix),
        ];

        const distanceToSun = Math.hypot(x - sunX, y - sunY);

        if (distanceToSun < sunRadius) {
          const glow = 1 - distanceToSun / sunRadius;

          color = [
            mix(color[0], sunColor[0], 0.75 + glow * 0.25),
            mix(color[1], sunColor[1], 0.75 + glow * 0.25),
            mix(color[2], sunColor[2], 0.75 + glow * 0.25),
          ];
        }

        if (y > ridgeBack[x]) {
          color = mountainBack;
        }

        if (y > ridgeFront[x]) {
          color = mountainFront;
        }
      } else {
        const landMix = (y - horizon) / Math.max(1, height - horizon);
        const texture = 0.06 * Math.sin((x + y * 2) / 24 + index);

        color = [
          mix(landNear[0], landFar[0], landMix) + Math.round(texture * 40),
          mix(landNear[1], landFar[1], landMix) + Math.round(texture * 40),
          mix(landNear[2], landFar[2], landMix) + Math.round(texture * 40),
        ];
      }

      const offset = row + 1 + x * 3;

      raw[offset] = Math.max(0, Math.min(255, color[0]));
      raw[offset + 1] = Math.max(0, Math.min(255, color[1]));
      raw[offset + 2] = Math.max(0, Math.min(255, color[2]));
    }
  }

  const header = Buffer.alloc(13);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function ensurePlaceholderAssets() {
  fs.mkdirSync(SEED_ASSET_DIR, { recursive: true });

  const assets = [];

  for (let i = 1; i <= 8; i += 1) {
    const name = `${SEED_FILE_PREFIX}-landscape-${String(i).padStart(2, '0')}.png`;
    const filePath = path.join(SEED_ASSET_DIR, name);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      fs.writeFileSync(filePath, makeScenicPng(960, 640, i));
    }

    assets.push({ kind: 'landscape', name, path: filePath, size: fs.statSync(filePath).size });
  }

  for (let i = 1; i <= 4; i += 1) {
    const name = `${SEED_FILE_PREFIX}-square-${String(i).padStart(2, '0')}.png`;
    const filePath = path.join(SEED_ASSET_DIR, name);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      fs.writeFileSync(filePath, makeScenicPng(640, 640, i + 20));
    }

    assets.push({ kind: 'square', name, path: filePath, size: fs.statSync(filePath).size });
  }

  return assets;
}

async function prepareMedia(strapi, flags) {
  const pools = { landscape: [], square: [] };

  if (flags.skipMedia) {
    console.log('[seed] Media upload skipped (--skip-media).');
    return pools;
  }

  try {
    const assets = ensurePlaceholderAssets();
    const existing = await strapi.db.query('plugin::upload.file').findMany({
      where: { name: { $startsWith: SEED_FILE_PREFIX } },
    });
    const byName = new Map(existing.map((file) => [file.name, file]));

    for (const asset of assets) {
      let file = byName.get(asset.name);

      if (!file) {
        const uploaded = await strapi.plugin('upload').service('upload').upload({
          data: {
            fileInfo: {
              name: asset.name,
              alternativeText: 'Placeholder travel photo generated by the seed script',
              caption: 'Seed placeholder image',
            },
          },
          files: {
            originalFilename: asset.name,
            filepath: asset.path,
            mimetype: 'image/png',
            size: asset.size,
          },
        });

        file = uploaded[0];
      }

      if (file) {
        pools[asset.kind].push(file);
      }
    }

    console.log(
      `[seed] Media ready: ${pools.landscape.length} landscape and ${pools.square.length} square placeholder images.`
    );
  } catch (error) {
    console.warn(`[seed] Media upload failed; continuing without media. ${error.message}`);
  }

  return pools;
}

function pickMedia(pool, index, count = 1) {
  if (!Array.isArray(pool) || pool.length === 0) {
    return [];
  }

  const ids = [];

  for (let i = 0; i < count; i += 1) {
    ids.push(pool[(index + i) % pool.length].id);
  }

  return [...new Set(ids)];
}

function singleMedia(pool, index) {
  const ids = pickMedia(pool, index, 1);

  return ids.length ? ids : undefined;
}

async function createDestinations(strapi, media, stats) {
  const created = [];

  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const seed = getDestinationSeed(i);
    const name = `${seed.city}, ${seed.country}`;
    const documentId = seedDocumentId('dst', i + 1);
    const image = singleMedia(media.landscape, i);

    const data = {
      documentId,
      name,
      slug: `${slugify(`${seed.city}-${seed.country}`)}-${i + 1}`,
      shortDescription: seed.short,
      description: blocks(
        [
          seed.short,
          `${seed.city} works well as a base for ${seed.activities.slice(0, 3).join(', ').toLowerCase()}. We build in enough time to explore without rushing between highlights.`,
        ],
        'Signature experiences',
        seed.attractions
      ),
      continent: seed.continent,
      attractions: listItems(seed.attractions),
      activities: listItems(seed.activities),
      bestTime: listItems(seed.bestTime),
      order: i + 1,
      ...(image ? { image } : {}),
    };

    const status = publishStatus();

    await strapi.documents(UIDS.destination).create({ data, status });

    stats.created += 1;
    stats[status === 'published' ? 'published' : 'drafts'] += 1;
    created.push({
      documentId,
      name,
      city: seed.city,
      continent: seed.continent,
      status,
    });
  }

  return created;
}

function buildItinerary(destinationName, durationDays) {
  const days = Math.min(Math.max(durationDays, 3), 8);
  const moments = [
    'Arrival and gentle introduction',
    'Old town and local life',
    'Landscape day trip',
    'Markets and food traditions',
    'Free day with optional activities',
    'Guided walk and viewpoint',
    'Craft, culture and community',
    'Farewell dinner',
  ];

  return Array.from({ length: days }, (_, index) => ({
    day: `Day ${index + 1}`,
    title: index === 0
      ? `Arrive in ${destinationName}`
      : index === days - 1
        ? 'Final morning and departure'
        : moments[index % moments.length],
    body: index === 0
      ? `Meet your guide, settle into the hotel and take a short orientation walk before dinner.`
      : index === days - 1
        ? `Enjoy a relaxed breakfast, a final local stop and a private transfer for your onward journey.`
        : faker.lorem.sentences(2),
  }));
}

async function createTours(strapi, destinations, media, stats) {
  const created = [];
  const publishedDestinations = destinations.filter((item) => item.status === 'published');
  const destinationPool = publishedDestinations.length ? publishedDestinations : destinations;

  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const destination = destinationPool[i % destinationPool.length];
    const suffix = TOUR_SUFFIXES[i % TOUR_SUFFIXES.length];
    const title = `${destination.city} ${suffix}`;
    const documentId = seedDocumentId('tour', i + 1);
    const durationDays = faker.number.int({ min: 4, max: 16 });
    const groupMin = faker.number.int({ min: 2, max: 6 });
    const groupMax = groupMin + faker.number.int({ min: 4, max: 10 });
    const coverImage = singleMedia(media.landscape, i + 2);
    const gallery = pickMedia(media.landscape, i + 1, faker.number.int({ min: 3, max: 5 }));

    const data = {
      documentId,
      title,
      slug: `${slugify(title)}-${i + 1}`,
      overview: `${faker.lorem.sentences(2)} This ${durationDays}-day journey through ${destination.name} is designed for travellers who want a balanced mix of guided experiences and time to explore.`,
      difficulty: faker.helpers.arrayElement(['easy', 'moderate', 'tough']),
      travelType: faker.helpers.arrayElement(['trekking', 'culture', 'family', 'adventure']),
      durationDays,
      groupSize: `${groupMin}-${groupMax} travellers`,
      distanceKm: Math.round(faker.number.float({ min: 12, max: 380 }) * 10) / 10,
      priceAmount: faker.number.int({ min: 450, max: 6800 }),
      priceCurrency: 'USD',
      pricePer: 'Per Person',
      startLocation: destination.name,
      endLocation: destination.name,
      itinerary: buildItinerary(destination.name, durationDays),
      inclusions: listItems(chooseDistinct(INCLUSIONS, faker.number.int({ min: 4, max: 6 }))),
      exclusions: listItems(chooseDistinct(EXCLUSIONS, faker.number.int({ min: 3, max: 5 }))),
      destination: destination.documentId,
      featured: faker.number.float({ min: 0, max: 1 }) < 0.2,
      order: i + 1,
      ...(coverImage ? { coverImage } : {}),
      ...(gallery.length ? { gallery } : {}),
    };

    const status = publishStatus();

    await strapi.documents(UIDS.tour).create({ data, status });

    stats.created += 1;
    stats[status === 'published' ? 'published' : 'drafts'] += 1;
    created.push({ documentId, title });
  }

  return created;
}

async function createServices(strapi, media, stats) {
  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const title = i < SERVICE_TITLES.length
      ? SERVICE_TITLES[i]
      : `${faker.commerce.department()} Travel Support`;
    const documentId = seedDocumentId('srv', i + 1);
    const image = singleMedia(media.landscape, i + 4);

    const data = {
      documentId,
      title,
      slug: `${slugify(title)}-${i + 1}`,
      shortDescription: `${title} planned around your dates, pace and interests, with local expertise at every step.`,
      description: blocks(
        [
          `${faker.lorem.sentences(2)} We coordinate the details so that your journey feels effortless, from the first planning call to the final transfer.`,
          'Every recommendation is matched to your travel style, and you will have a single point of contact throughout the planning process.',
        ],
        'How we help',
        ['Personal planning call', 'Clear written itinerary', 'Trusted local partners', 'Support before and during travel']
      ),
      order: i + 1,
      ...(image ? { image } : {}),
    };

    const status = publishStatus();

    await strapi.documents(UIDS.service).create({ data, status });

    stats.created += 1;
    stats[status === 'published' ? 'published' : 'drafts'] += 1;
  }
}

async function createFaqs(strapi, stats) {
  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const seed = FAQ_SEEDS[i % FAQ_SEEDS.length];
    const question = i < FAQ_SEEDS.length
      ? seed.question
      : `${faker.lorem.sentence()}?`;
    const answer = i < FAQ_SEEDS.length
      ? seed.answer
      : faker.lorem.paragraph();
    const documentId = seedDocumentId('faq', i + 1);

    const data = {
      documentId,
      question,
      answer: blocks([answer]),
      category: i < FAQ_SEEDS.length
        ? seed.category
        : faker.helpers.arrayElement(['general', 'pricing', 'services', 'support']),
      order: i + 1,
    };

    const status = publishStatus();

    await strapi.documents(UIDS.faq).create({ data, status });

    stats.created += 1;
    stats[status === 'published' ? 'published' : 'drafts'] += 1;
  }
}

async function createTestimonials(strapi, destinations, media, stats) {
  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const destination = destinations[i % destinations.length];
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const documentId = seedDocumentId('tst', i + 1);
    const avatar = singleMedia(media.square, i);

    const data = {
      documentId,
      quote: faker.helpers
        .arrayElement(TESTIMONIAL_TEMPLATES)
        .replace('{destination}', destination.name),
      authorName: `${firstName} ${lastName}`,
      authorRole: faker.helpers.arrayElement(AUTHOR_ROLES),
      ...(faker.number.float({ min: 0, max: 1 }) < 0.6
        ? { company: faker.company.name() }
        : {}),
      rating: faker.number.int({ min: 3, max: 5 }),
      featured: faker.number.float({ min: 0, max: 1 }) < 0.25,
      ...(avatar ? { avatar } : {}),
    };

    const status = publishStatus();

    await strapi.documents(UIDS.testimonial).create({ data, status });

    stats.created += 1;
    stats[status === 'published' ? 'published' : 'drafts'] += 1;
  }
}

async function createTeamMembers(strapi, media, stats) {
  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const name = faker.person.fullName();
    const role = i < TEAM_ROLES.length
      ? TEAM_ROLES[i]
      : faker.person.jobTitle();
    const documentId = seedDocumentId('team', i + 1);
    const photo = singleMedia(media.square, i + 1);

    const data = {
      documentId,
      name,
      role,
      bio: `${faker.lorem.sentences(2)} ${faker.lorem.sentence()}`,
      linkedin: `https://www.linkedin.com/in/${slugify(name)}-${i + 1}`,
      order: i + 1,
      ...(photo ? { photo } : {}),
    };

    const status = publishStatus();

    await strapi.documents(UIDS.teamMember).create({ data, status });

    stats.created += 1;
    stats[status === 'published' ? 'published' : 'drafts'] += 1;
  }
}

async function createGlobal(strapi, media, stats) {
  const logo = singleMedia(media.square, 2);
  const logoDark = singleMedia(media.square, 3);

  const data = {
    documentId: seedDocumentId('glb', 1),
    siteName: 'API Touch Travel',
    contactEmail: 'hello@example.com',
    contactPhone: faker.phone.number(),
    address: `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.country()}`,
    footerText: 'Thoughtfully planned journeys with local guides, small groups and a lighter footprint.',
    socialLinks: {
      instagram: 'https://www.instagram.com/apitouchtravel',
      facebook: 'https://www.facebook.com/apitouchtravel',
      youtube: 'https://www.youtube.com/@apitouchtravel',
      x: 'https://x.com/apitouchtravel',
    },
    ...(logo ? { logo } : {}),
    ...(logoDark ? { logoDark } : {}),
  };

  await strapi.documents(UIDS.global).create({ data, status: 'published' });

  stats.created += 1;
  stats.published += 1;
}

async function createGalleryPage(strapi, media, stats) {
  const photos = pickMedia(media.landscape, 0, Math.min(8, media.landscape.length));

  const data = {
    documentId: seedDocumentId('gal', 1),
    badge: 'Travel Gallery',
    title: 'Moments from the road',
    sub: 'A small selection of landscapes, streets and quiet in-between moments from our journeys.',
    ...(photos.length ? { photos } : {}),
  };

  await strapi.documents(UIDS.galleryPage).create({ data, status: 'published' });

  stats.created += 1;
  stats.published += 1;
}

async function createContactSubmissions(strapi, tours, stats) {
  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const tour = tours.length
      ? faker.helpers.arrayElement(tours).title
      : 'Tailor-made itinerary';
    const documentId = seedDocumentId('con', i + 1);

    const data = {
      documentId,
      name: `${firstName} ${lastName}`,
      email: `${slugify(`${firstName}.${lastName}`)}.${i + 1}@example.com`,
      message: truncate(
        `${faker.lorem.sentences(2)} We would love to know more about availability, the day-to-day pace and whether the itinerary can be adapted for our group.`,
        2000
      ),
      tour,
      travelDate: dateOnly(faker.date.future({ years: 1 })),
      status: faker.helpers.arrayElement(CONTACT_STATUSES),
    };

    await strapi.documents(UIDS.contactSubmission).create({ data });

    stats.created += 1;
  }
}

async function createTripRequests(strapi, destinations, stats) {
  for (let i = 0; i < ENTRY_COUNT; i += 1) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const destination = destinations[i % destinations.length];
    const documentId = seedDocumentId('trp', i + 1);
    const budgetLow = faker.number.int({ min: 1, max: 4 }) * 500;
    const budgetHigh = budgetLow + faker.number.int({ min: 500, max: 2500 });

    const data = {
      documentId,
      name: truncate(`${firstName} ${lastName}`, 120),
      email: `${slugify(`${firstName}.${lastName}`)}.${i + 1}@example.com`,
      destination: truncate(destination.name, 120),
      travelDate: dateOnly(faker.date.future({ years: 1 })),
      group: truncate(faker.helpers.arrayElement(GROUP_SIZES), 60),
      preferences: truncate(faker.helpers.arrayElement(PREFERENCES), 120),
      budget: truncate(`USD ${budgetLow}-${budgetHigh} per person`, 60),
      message: truncate(
        `${faker.lorem.sentences(2)} Please let us know what a realistic itinerary might look like for these dates.`,
        2000
      ),
      status: faker.helpers.arrayElement(TRIP_STATUSES),
    };

    await strapi.documents(UIDS.tripRequest).create({ data });

    stats.created += 1;
  }
}

function createStats(label) {
  return { label, created: 0, published: 0, drafts: 0 };
}

function logStats(stats) {
  if (stats.published || stats.drafts) {
    console.log(
      `[seed] ${stats.label}: ${stats.created} created (${stats.published} published, ${stats.drafts} drafts)`
    );
  } else {
    console.log(`[seed] ${stats.label}: ${stats.created} created`);
  }
}

async function hasSeedData(strapi) {
  for (const uid of CREATE_ORDER) {
    const count = await strapi.db.query(uid).count({
      where: { documentId: { $startsWith: SEED_ID_PREFIX } },
    });

    if (count > 0) {
      return true;
    }
  }

  return false;
}

async function deleteSeedDocuments(strapi, uid) {
  const rows = await strapi.db.query(uid).findMany({
    where: { documentId: { $startsWith: SEED_ID_PREFIX } },
    select: ['documentId'],
  });
  const documentIds = [...new Set(rows.map((row) => row.documentId))];

  for (const documentId of documentIds) {
    await strapi.documents(uid).delete({ documentId });
  }

  return documentIds.length;
}

async function removeSeedMedia(strapi) {
  const files = await strapi.db.query('plugin::upload.file').findMany({
    where: { name: { $startsWith: SEED_FILE_PREFIX } },
  });

  for (const file of files) {
    try {
      await strapi.plugin('upload').service('upload').remove(file);
    } catch (error) {
      console.warn(`[seed] Could not remove media ${file.name}: ${error.message}`);
    }
  }

  return files.length;
}

async function resetSeedData(strapi) {
  console.log('[seed] Resetting previously seeded data...');

  let documentCount = 0;

  for (const uid of RESET_ORDER) {
    const deleted = await deleteSeedDocuments(strapi, uid);

    documentCount += deleted;
    console.log(`[seed]   ${uid}: ${deleted} document(s) removed`);
  }

  const mediaCount = await removeSeedMedia(strapi);

  console.log(`[seed] Reset complete: ${documentCount} document(s) and ${mediaCount} media file(s) removed.`);
}

async function grantPublicPermissions(strapi) {
  const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
  });

  if (!publicRole) {
    console.warn('[seed] Public role not found; skipping public permissions.');
    return;
  }

  const actions = [
    'api::destination.destination.find',
    'api::destination.destination.findOne',
    'api::tour.tour.find',
    'api::tour.tour.findOne',
    'api::service.service.find',
    'api::service.service.findOne',
    'api::faq.faq.find',
    'api::faq.faq.findOne',
    'api::testimonial.testimonial.find',
    'api::testimonial.testimonial.findOne',
    'api::team-member.team-member.find',
    'api::team-member.team-member.findOne',
    'api::global.global.find',
    'api::gallery-page.gallery-page.find',
    'api::contact-submission.contact-submission.create',
    'api::trip-request.trip-request.create',
  ];

  const existing = await strapi.db.query('plugin::users-permissions.permission').findMany({
    where: { role: publicRole.id },
  });
  const existingActions = new Set(existing.map((permission) => permission.action));
  let added = 0;

  for (const action of actions) {
    if (existingActions.has(action)) {
      continue;
    }

    await strapi.db.query('plugin::users-permissions.permission').create({
      data: { action, role: publicRole.id },
    });

    added += 1;
  }

  console.log(`[seed] Public permissions: ${added} added, ${actions.length - added} already present.`);
}

async function logVerification(strapi) {
  console.log('[seed] Database check:');

  for (const uid of CREATE_ORDER) {
    const rows = await strapi.db.query(uid).findMany({
      where: { documentId: { $startsWith: SEED_ID_PREFIX } },
      select: ['documentId', 'publishedAt'],
    });
    const total = new Set(rows.map((row) => row.documentId)).size;
    const published = new Set(
      rows.filter((row) => row.publishedAt).map((row) => row.documentId)
    ).size;

    console.log(`[seed]   ${uid}: ${total} seeded, ${published} published`);
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    return;
  }

  assertSafeEnvironment(flags);
  process.env.NOTIFY_EMAIL = '';

  faker.seed(RANDOM_SEED);

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  try {
    if (flags.reset) {
      await resetSeedData(strapi);
    } else if (await hasSeedData(strapi)) {
      console.log('[seed] Existing seed data found. Nothing inserted. Use --reset to replace it.');
      return;
    }

    const media = await prepareMedia(strapi, flags);
    const stats = [];

    const destinationStats = createStats('destinations');
    const destinations = await createDestinations(strapi, media, destinationStats);
    stats.push(destinationStats);

    const tourStats = createStats('tours');
    const tours = await createTours(strapi, destinations, media, tourStats);
    stats.push(tourStats);

    const serviceStats = createStats('services');
    await createServices(strapi, media, serviceStats);
    stats.push(serviceStats);

    const faqStats = createStats('faqs');
    await createFaqs(strapi, faqStats);
    stats.push(faqStats);

    const testimonialStats = createStats('testimonials');
    await createTestimonials(strapi, destinations, media, testimonialStats);
    stats.push(testimonialStats);

    const teamStats = createStats('team members');
    await createTeamMembers(strapi, media, teamStats);
    stats.push(teamStats);

    const globalStats = createStats('global');
    await createGlobal(strapi, media, globalStats);
    stats.push(globalStats);

    const galleryStats = createStats('gallery page');
    await createGalleryPage(strapi, media, galleryStats);
    stats.push(galleryStats);

    const contactStats = createStats('contact submissions');
    await createContactSubmissions(strapi, tours, contactStats);
    stats.push(contactStats);

    const tripStats = createStats('trip requests');
    await createTripRequests(strapi, destinations, tripStats);
    stats.push(tripStats);

    for (const item of stats) {
      logStats(item);
    }

    if (flags.withPublicPermissions) {
      await grantPublicPermissions(strapi);
    }

    await logVerification(strapi);

    console.log('[seed] Done.');
  } finally {
    await strapi.destroy();
  }
}

main().catch((error) => {
  console.error(`[seed] Failed: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
