import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..', '..');
const PROJECT_DIR = path.resolve(SERVER_DIR, '..', '..');

const DEFAULT_INPUT_CSV = path.join(PROJECT_DIR, 'places_lab_2026-11-02', 'bangkok_places.csv');
const DEFAULT_OUTPUT_NDJSON = path.join(SERVER_DIR, 'data', 'places-bangkok.ndjson');

const INPUT_CSV = process.env.INPUT_CSV || DEFAULT_INPUT_CSV;
const OUTPUT_NDJSON = process.env.OUTPUT_NDJSON || DEFAULT_OUTPUT_NDJSON;

// Bangkok bounding box
const BBOX = {
  minLon: 100.30,
  minLat: 13.50,
  maxLon: 100.95,
  maxLat: 14.10,
};

// 8 Whitelist Groups mapping
export const CATEGORY_GROUP_MAPPING = {
  // 1. PARKING
  parking: 'parking',
  parking_lot: 'parking',
  parking_garage: 'parking',
  valet_parking_service: 'parking',

  // 2. SPORTS & FITNESS
  gym: 'sports',
  fitness_center: 'sports',
  sports_club: 'sports',
  sports_complex: 'sports',
  stadium_arena: 'sports',
  stadium: 'sports',
  basketball_court: 'sports',
  sport_or_fitness_facility: 'sports',
  swimming_pool: 'sports',
  public_swimming_pool: 'sports',
  yoga_studio: 'sports',
  pilates_studio: 'sports',
  martial_arts_club: 'sports',
  badminton_court: 'sports',
  dance_studio: 'sports',
  muay_thai_club: 'sports',
  boxing_gym: 'sports',
  soccer_field: 'sports',
  tennis_court: 'sports',
  sports_and_recreation: 'sports',
  sport_league: 'sports',
  sports_school: 'sports',
  recreation_center: 'sports',
  skate_park: 'sports',
  sporting_goods_store: 'sports',
  sportswear_store: 'sports',
  outdoor_sports_store: 'sports',
  bicycle_shop: 'sports',
  running_store: 'sports',
  golf_course: 'sports',
  golf_driving_range: 'sports',
  bowling_alley: 'sports',
  climbing_gym: 'sports',
  amateur_sport_league: 'sports',
  esports_team: 'sports',
  professional_sport_team: 'sports',

  // 3. TRANSPORT
  train_station: 'transport',
  bus_station: 'transport',
  light_rail_and_subway_station: 'transport',
  metro_station: 'transport',
  public_transit_facility_or_service: 'transport',
  pier: 'transport',
  ferry_boat_company: 'transport',
  airport: 'transport',
  transit_stop: 'transport',
  bus_stop: 'transport',
  subway_station: 'transport',
  heliport: 'transport',

  // 4. HEALTH
  hospital: 'health',
  pharmacy: 'health',
  dental_clinic: 'health',
  doctors_office: 'health',
  clinic: 'health',
  urgent_care_clinic: 'health',
  health_care: 'health',
  medical_service_organization: 'health',
  outpatient_care_facility: 'health',
  physical_therapy: 'health',
  medical_clinic: 'health',
  emergency_room: 'health',
  blood_bank: 'health',
  medical_center: 'health',
  pediatrician: 'health',
  optometrist: 'health',
  medical_lab: 'health',

  // 5. EDUCATION
  school: 'education',
  college_university: 'education',
  education: 'education',
  elementary_school: 'education',
  preschool: 'education',
  language_school: 'education',
  music_school: 'education',
  high_school: 'education',
  middle_school: 'education',
  tutoring_service: 'education',
  vocational_school: 'education',
  art_school: 'education',
  flight_school: 'education',
  nursery_school: 'education',
  cooking_school: 'education',
  culinary_school: 'education',
  driving_school: 'education',
  educational_institution: 'education',
  campus_building: 'education',
  library: 'education',

  // 6. LODGING
  lodging: 'lodging',
  hotel: 'lodging',
  hostel: 'lodging',
  resort: 'lodging',
  motel: 'lodging',
  bed_and_breakfast: 'lodging',
  inn: 'lodging',
  guest_house: 'lodging',
  serviced_apartment: 'lodging',
  lodge: 'lodging',
  campground: 'lodging',
};

// Additional category classifications function
export function getCategoryGroup(category) {
  if (!category || typeof category !== 'string') return null;
  const c = category.toLowerCase().trim();

  // Explicit mappings first
  if (CATEGORY_GROUP_MAPPING[c]) {
    return CATEGORY_GROUP_MAPPING[c];
  }

  // Parking check
  if (c.includes('parking')) {
    return 'parking';
  }

  // Sports & Fitness check
  if (c.includes('fitness') || c.includes('sports_') || c.includes('stadium') || c.includes('gym')) {
    return 'sports';
  }

  // Health check
  if (c.includes('hospital') || c.includes('clinic') || c.includes('medical') || c.includes('pharmacy')) {
    return 'health';
  }

  // Education check
  if (c.includes('school') || c.includes('university') || c.includes('college')) {
    return 'education';
  }

  // Lodging check
  if (
    (c.includes('hotel') || c.includes('hostel') || c.includes('resort') || c.includes('lodging')) &&
    !c.includes('supply') && !c.includes('service')
  ) {
    return 'lodging';
  }

  // Food & Drink check
  const isBar = (
    c === 'bar' || c.startsWith('bar_') || c.endsWith('_bar') || c.includes('_bar_') ||
    c === 'pub' || c.endsWith('_pub') || c === 'gastropub'
  ) && c !== 'barber' && c !== 'bartender';

  const isFood = (
    c.includes('restaurant') || c.includes('cafe') || c.includes('coffee') ||
    c.includes('bakery') || isBar || c.includes('bistro') ||
    c.includes('diner') || c.includes('food') || c.includes('ice_cream') ||
    c.includes('tea_room') || c.includes('bubble_tea') ||
    c.includes('steakhouse') || c.includes('pizzeria') || c.includes('buffet') ||
    c.includes('delicatessen') || c.includes('caterer') || c.includes('juice_shop') ||
    c.includes('dessert_shop') || c.includes('brewery') || c.includes('winery') ||
    c.includes('distillery') || c.includes('gastropub') || c.includes('noodle') ||
    c === 'donut_shop' || c === 'sandwich_shop' || c === 'patisserie' || c === 'bagel_shop'
  );
  if (isFood) {
    const isExcluded = ['exporter', 'pet_food', 'training', 'manufacturer', 'equipment', 'service', 'barber'].some(x => c.includes(x) && !c.includes('food_court') && !c.includes('catering_service'));
    if (!isExcluded) {
      return 'food';
    }
  }

  // Shopping check
  const isShop = (
    [
      'convenience_store', 'supermarket', 'grocery_store', 'shopping_mall', 'shopping',
      'department_store', 'flea_market', 'clothing_store', 'warehouse_club_store',
      'furniture_store', 'hardware_store', 'electronics_store', 'mobile_phone_store',
      'bookstore', 'pet_store', 'jewelry_store', 'shoe_store', 'beauty_supply_store',
      'home_improvement_store', 'discount_store', 'variety_store', 'liquor_store',
      'stationery_store', 'toy_store', 'optician', 'eyewear_store', 'florist',
      'flowers_and_gifts_store', 'market', 'farmers_market', 'night_market',
      'fruit_and_vegetable_store', 'butcher_shop', 'fish_and_seafood_market'
    ].includes(c) ||
    ((c.includes('store') || c.includes('shop') || c.includes('market')) &&
      !['repair', 'auto', 'motorcycle', 'service', 'tattoo', 'barber', 'salon', 'machinery', 'workshop'].some(x => c.includes(x)))
  );
  if (isShop) {
    return 'shop';
  }

  return null;
}

// Zero-dependency RFC 4180 CSV parser line-by-line
function parseCsvLine(line) {
  const fields = [];
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export async function buildPlacesIndex(inputPath = INPUT_CSV, outputPath = OUTPUT_NDJSON) {
  const startTime = Date.now();
  console.log('='.repeat(70));
  console.log('HoopUp MAP6b - Overture Places Index Builder');
  console.log(`Input CSV:     ${inputPath}`);
  console.log(`Output NDJSON: ${outputPath}`);
  console.log(`Bangkok BBox:  [${BBOX.minLon}, ${BBOX.minLat}, ${BBOX.maxLon}, ${BBOX.maxLat}]`);
  console.log('='.repeat(70));

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV file not found: ${inputPath}`);
  }

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const fileStream = fs.createReadStream(inputPath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let totalRows = 0;
  let header = null;
  const places = [];

  const droppedReasons = {
    low_confidence: 0,
    empty_name: 0,
    out_of_bounds: 0,
    category_not_whitelisted: 0,
    invalid_data: 0,
  };

  const keptCategoryCounts = new Map();
  const keptGroupCounts = {
    food: 0,
    shop: 0,
    sports: 0,
    parking: 0,
    transport: 0,
    health: 0,
    education: 0,
    lodging: 0,
  };

  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }

    totalRows++;
    const fields = parseCsvLine(line);
    if (fields.length < 8) {
      droppedReasons.invalid_data++;
      continue;
    }

    const [id, name, nameTh, categoryPrimary, rawConfidence, rawLon, rawLat] = fields;

    // 1. Confidence check >= 0.70
    const conf = Number(rawConfidence);
    if (!Number.isFinite(conf) || conf < 0.70) {
      droppedReasons.low_confidence++;
      continue;
    }

    // 2. Name check: Thai name first, else primary
    const trimmedTh = nameTh ? nameTh.trim() : '';
    const trimmedPrimary = name ? name.trim() : '';
    const displayName = trimmedTh || trimmedPrimary;
    if (!displayName) {
      droppedReasons.empty_name++;
      continue;
    }

    // 3. Coordinates check inside Bangkok bbox
    const lon = Number(rawLon);
    const lat = Number(rawLat);
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      lon < BBOX.minLon ||
      lon > BBOX.maxLon ||
      lat < BBOX.minLat ||
      lat > BBOX.maxLat
    ) {
      droppedReasons.out_of_bounds++;
      continue;
    }

    // 4. Whitelist check & group mapping
    const group = getCategoryGroup(categoryPrimary);
    if (!group) {
      droppedReasons.category_not_whitelisted++;
      continue;
    }

    // Kept record
    const record = {
      i: id,
      n: displayName,
      c: categoryPrimary,
      x: Math.round(lon * 1e6) / 1e6,
      y: Math.round(lat * 1e6) / 1e6,
      f: Math.round(conf * 100) / 100,
    };

    places.push(record);
    keptGroupCounts[group] = (keptGroupCounts[group] || 0) + 1;
    keptCategoryCounts.set(categoryPrimary, (keptCategoryCounts.get(categoryPrimary) || 0) + 1);
  }

  console.log(`\nParsed ${totalRows.toLocaleString()} rows from CSV.`);
  console.log(`Kept ${places.length.toLocaleString()} places matching all criteria.`);

  // Deterministic sorting by ID
  console.log('Sorting records deterministically by ID...');
  places.sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0));

  // Write NDJSON
  console.log(`Writing records to ${outputPath}...`);
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
  for (const place of places) {
    writeStream.write(JSON.stringify(place) + '\n');
  }
  await new Promise((resolve, reject) => {
    writeStream.end(resolve);
    writeStream.on('error', reject);
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const stat = fs.statSync(outputPath);
  const fileSizeMb = (stat.size / (1024 * 1024)).toFixed(2);

  // Compute SHA-256
  const fileBuffer = fs.readFileSync(outputPath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Print statistics
  console.log('\n' + '='.repeat(70));
  console.log('BUILD SUMMARY & STATS');
  console.log('='.repeat(70));
  console.log(`Total rows processed:       ${totalRows.toLocaleString()}`);
  console.log(`Total places kept:          ${places.length.toLocaleString()}`);
  console.log(`Raw output file size:       ${stat.size.toLocaleString()} bytes (${fileSizeMb} MB)`);
  console.log(`SHA-256 checksum:           ${sha256}`);
  console.log(`Build elapsed time:         ${duration}s`);

  console.log('\n--- KEPT PLACES PER GROUP ---');
  for (const [grp, cnt] of Object.entries(keptGroupCounts)) {
    console.log(`  ${grp.padEnd(12)}: ${cnt.toLocaleString().padStart(8)} places`);
  }

  console.log('\n--- TOP 30 KEPT CATEGORIES ---');
  const sortedCategories = Array.from(keptCategoryCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < Math.min(30, sortedCategories.length); i++) {
    const [cat, cnt] = sortedCategories[i];
    console.log(`  ${(i + 1).toString().padStart(2)}. ${cat.padEnd(35)}: ${cnt.toLocaleString().padStart(7)}`);
  }
  console.log(`  ... and ${sortedCategories.length - 30} more categories (total ${sortedCategories.length} distinct categories).`);

  console.log('\n--- DROPPED RECORDS BY REASON ---');
  for (const [reason, cnt] of Object.entries(droppedReasons)) {
    console.log(`  ${reason.padEnd(25)}: ${cnt.toLocaleString().padStart(8)}`);
  }
  const totalDropped = Object.values(droppedReasons).reduce((a, b) => a + b, 0);
  console.log(`  ${'TOTAL DROPPED'.padEnd(25)}: ${totalDropped.toLocaleString().padStart(8)}`);
  console.log('='.repeat(70));

  if (stat.size > 25 * 1024 * 1024) {
    console.warn(`WARNING: File size (${fileSizeMb} MB) exceeds target 25 MB! Consider tightening filters.`);
  } else {
    console.log(`Target <= 25 MB met: ${fileSizeMb} MB <= 25.00 MB`);
  }

  return {
    totalRows,
    totalKept: places.length,
    fileSize: stat.size,
    fileSizeMb,
    sha256,
    duration,
    keptGroupCounts,
    droppedReasons,
    categoriesCount: sortedCategories.length,
  };
}

// Run directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildPlacesIndex().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}
