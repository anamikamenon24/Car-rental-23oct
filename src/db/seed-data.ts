// Static seed data (UAE branches, fleet, prices in fils). Used by src/db/seed.ts and
// scripts/generate-vehicle-images.ts (photos under public/vehicles/).

export const SEED_BRANCHES = [
  {
    code: "DXB",
    slug: "dubai-airport",
    name: "Dubai Airport Terminal 3",
    city: "Dubai",
    address: "Arrivals Hall, Terminal 3, Dubai International Airport, Dubai",
    phone: "+971 4 555 0101",
    email: "dxb@driveeasy.test",
    latitude: 25.2486,
    longitude: 55.3527,
    isAirport: true,
    openingHours: { "24h": true },
  },
  {
    code: "DTD",
    slug: "downtown-dubai",
    name: "Downtown Dubai",
    city: "Dubai",
    address: "Ground Floor, Boulevard Plaza Tower 1, Sheikh Mohammed bin Rashid Blvd, Dubai",
    phone: "+971 4 555 0102",
    email: "downtown@driveeasy.test",
    latitude: 25.1953,
    longitude: 55.2766,
    isAirport: false,
    openingHours: daily("08:00", "22:00"),
  },
  {
    code: "MRN",
    slug: "dubai-marina",
    name: "Dubai Marina",
    city: "Dubai",
    address: "Marina Walk, Al Marsa Street, Dubai Marina, Dubai",
    phone: "+971 4 555 0103",
    email: "marina@driveeasy.test",
    latitude: 25.0805,
    longitude: 55.1403,
    isAirport: false,
    openingHours: { ...daily("09:00", "21:00"), fri: ["14:00", "21:00"] },
  },
  {
    code: "AUH",
    slug: "abu-dhabi-airport",
    name: "Abu Dhabi Airport",
    city: "Abu Dhabi",
    address: "Terminal A Arrivals, Zayed International Airport, Abu Dhabi",
    phone: "+971 2 555 0201",
    email: "auh@driveeasy.test",
    latitude: 24.4419,
    longitude: 54.6501,
    isAirport: true,
    openingHours: { "24h": true },
  },
  {
    code: "ADC",
    slug: "abu-dhabi-corniche",
    name: "Abu Dhabi Corniche",
    city: "Abu Dhabi",
    address: "Corniche Road West, near Nation Towers, Abu Dhabi",
    phone: "+971 2 555 0202",
    email: "corniche@driveeasy.test",
    latitude: 24.4632,
    longitude: 54.3266,
    isAirport: false,
    openingHours: daily("08:00", "21:00"),
  },
  {
    code: "SHJ",
    slug: "sharjah-city-centre",
    name: "Sharjah City Centre",
    city: "Sharjah",
    address: "City Centre Sharjah, Al Wahda Street, Sharjah",
    phone: "+971 6 555 0301",
    email: "sharjah@driveeasy.test",
    latitude: 25.3254,
    longitude: 55.3933,
    isAirport: false,
    openingHours: { ...daily("09:00", "22:00"), fri: ["14:00", "22:00"] },
  },
] as const;

function daily(open: string, close: string) {
  const d = [open, close] as [string, string];
  return { mon: d, tue: d, wed: d, thu: d, fri: d, sat: d, sun: d } as Record<string, [string, string]>;
}

export const SEED_CATEGORIES = [
  { code: "ECONOMY", slug: "economy", name: "Economy", description: "Easy to park, light on fuel. Perfect for city errands.", depositFils: 100_000, sortOrder: 1 },
  { code: "COMPACT", slug: "compact", name: "Compact sedan", description: "Comfortable sedans with room for four and their luggage.", depositFils: 100_000, sortOrder: 2 },
  { code: "SUV", slug: "suv", name: "SUV", description: "Space, height and confidence for families and desert roads.", depositFils: 150_000, sortOrder: 3 },
  { code: "LUXURY", slug: "luxury", name: "Luxury", description: "Executive sedans and premium SUVs.", depositFils: 300_000, sortOrder: 4 },
  { code: "SPORTS", slug: "sports", name: "Sports", description: "Head-turners for Jumeirah Beach Road and Jebel Jais.", depositFils: 500_000, sortOrder: 5 },
] as const;

/** Daily rates in fils per category: standard (1+ days), weekly (7+), monthly (28+). */
export const SEED_RATES: Record<string, { standard: number; weekly: number; monthly: number }> = {
  ECONOMY: { standard: 12_000, weekly: 10_000, monthly: 8_000 },
  COMPACT: { standard: 15_000, weekly: 12_500, monthly: 10_000 },
  SUV: { standard: 28_000, weekly: 24_000, monthly: 19_000 },
  LUXURY: { standard: 65_000, weekly: 55_000, monthly: 45_000 },
  SPORTS: { standard: 120_000, weekly: 100_000, monthly: 85_000 },
};
export const SEED_AIRPORT_PREMIUM: Record<string, number> = { ECONOMY: 13_500, COMPACT: 16_500 };
export const SEED_WINTER_PEAK = { validFrom: "2026-12-15", validTo: "2027-01-05", priority: 10, rates: { SUV: 32_000, LUXURY: 75_000 } as Record<string, number> };

export const SEED_FEATURES = [
  { code: "AC", name: "Air conditioning", icon: "snowflake" },
  { code: "BLUETOOTH", name: "Bluetooth audio", icon: "bluetooth" },
  { code: "CARPLAY", name: "Apple CarPlay / Android Auto", icon: "smartphone" },
  { code: "REVERSE_CAMERA", name: "Reversing camera", icon: "camera" },
  { code: "CRUISE", name: "Cruise control", icon: "gauge" },
  { code: "NAV", name: "Built-in navigation", icon: "map" },
  { code: "SUNROOF", name: "Sunroof", icon: "sun" },
  { code: "LEATHER", name: "Leather seats", icon: "armchair" },
  { code: "AWD", name: "4x4 / all-wheel drive", icon: "mountain" },
  { code: "KEYLESS", name: "Keyless entry", icon: "key" },
] as const;

export const SEED_EXTRAS = [
  { code: "CHILD_SEAT", name: "Child seat", description: "ISOFIX child seat for ages 1-4.", chargeType: "PER_DAY", priceFils: 2_500, maxChargeFils: 15_000, maxQuantity: 3, sortOrder: 1 },
  { code: "GPS", name: "GPS navigator", description: "Portable sat-nav with UAE maps.", chargeType: "PER_DAY", priceFils: 2_000, maxChargeFils: 12_000, maxQuantity: 1, sortOrder: 2 },
  { code: "ADDITIONAL_DRIVER", name: "Additional driver", description: "Add another licensed driver (21+).", chargeType: "PER_DAY", priceFils: 3_000, maxChargeFils: 30_000, maxQuantity: 3, sortOrder: 3 },
  { code: "FULL_INSURANCE", name: "Full insurance (zero excess)", description: "Reduces your liability for damage to zero.", chargeType: "PER_DAY", priceFils: 5_000, maxChargeFils: null, maxQuantity: 1, sortOrder: 4 },
  { code: "SALIK_TAG", name: "Salik toll tag", description: "Pre-registered toll tag; tolls are billed at cost after the rental.", chargeType: "PER_RENTAL", priceFils: 5_000, maxChargeFils: null, maxQuantity: 1, sortOrder: 5 },
] as const;

type Tr = "AUTOMATIC" | "MANUAL";
type Fu = "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC";

export interface SeedVehicle {
  slug: string;
  category: string;
  branch: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  vin: string;
  color: string;
  hex: string;
  transmission: Tr;
  fuelType: Fu;
  seats: number;
  doors: number;
  luggage: number;
  mileageKm: number;
  body: "hatch" | "sedan" | "suv" | "coupe";
  features: string[];
  description: string;
}

const base = ["AC", "BLUETOOTH"];
export const SEED_VEHICLES: SeedVehicle[] = [
  { slug: "nissan-sunny-2024", category: "ECONOMY", branch: "DXB", make: "Nissan", model: "Sunny", year: 2024, plate: "DUBAI A 21457", vin: "MNTBB7A90R6014521", color: "White", hex: "#f4f5f7", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 2, mileageKm: 18_240, body: "sedan", features: [...base, "REVERSE_CAMERA"], description: "1.6L, 118 hp, CVT. Frugal and easy to drive in city traffic." },
  { slug: "toyota-yaris-2024", category: "ECONOMY", branch: "DTD", make: "Toyota", model: "Yaris", year: 2024, plate: "DUBAI B 33018", vin: "MR2K29F30R1055832", color: "Silver", hex: "#c7ccd1", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 2, mileageKm: 12_905, body: "sedan", features: [...base, "CARPLAY"], description: "1.5L, 106 hp. Toyota reliability with smartphone integration." },
  { slug: "hyundai-accent-2023", category: "ECONOMY", branch: "SHJ", make: "Hyundai", model: "Accent", year: 2023, plate: "SHARJAH 3 48211", vin: "KMHC741CBPU301744", color: "Red", hex: "#c0262d", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 2, mileageKm: 31_470, body: "sedan", features: [...base, "REVERSE_CAMERA"], description: "1.6L, 121 hp. Roomy cabin for its class." },
  { slug: "kia-pegas-2024", category: "ECONOMY", branch: "AUH", make: "Kia", model: "Pegas", year: 2024, plate: "ABU DHABI 5 17760", vin: "LJD0AA29XR0172290", color: "Blue", hex: "#2f5aa8", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 2, mileageKm: 9_830, body: "sedan", features: [...base], description: "1.4L, 94 hp. The budget-friendly way around the capital." },
  { slug: "mitsubishi-attrage-2023", category: "ECONOMY", branch: "MRN", make: "Mitsubishi", model: "Attrage", year: 2023, plate: "DUBAI C 50934", vin: "MMBXNA13APH008116", color: "Grey", hex: "#7d838a", transmission: "MANUAL", fuelType: "PETROL", seats: 5, doors: 4, luggage: 2, mileageKm: 27_115, body: "sedan", features: [...base], description: "1.2L, 78 hp, 5-speed manual. Great for confident drivers on a budget." },
  { slug: "toyota-corolla-hybrid-2024", category: "COMPACT", branch: "DXB", make: "Toyota", model: "Corolla Hybrid", year: 2024, plate: "DUBAI D 11092", vin: "JTDBCAEE5R3021187", color: "White", hex: "#eef0f2", transmission: "AUTOMATIC", fuelType: "HYBRID", seats: 5, doors: 4, luggage: 3, mileageKm: 15_620, body: "sedan", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "KEYLESS"], description: "1.8L hybrid, 138 hp combined, about 4.5 L/100 km." },
  { slug: "honda-civic-2024", category: "COMPACT", branch: "DTD", make: "Honda", model: "Civic", year: 2024, plate: "DUBAI E 72645", vin: "2HGFE2F59RH530221", color: "Black", hex: "#1f2227", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 3, mileageKm: 8_410, body: "sedan", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE"], description: "1.5L turbo, 178 hp. Sharp handling and a modern cabin." },
  { slug: "mazda-3-2023", category: "COMPACT", branch: "ADC", make: "Mazda", model: "3", year: 2023, plate: "ABU DHABI 12 40387", vin: "3MZBPAEM3PM351904", color: "Soul Red", hex: "#9b1b22", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 3, mileageKm: 22_980, body: "sedan", features: [...base, "CARPLAY", "LEATHER", "CRUISE"], description: "2.5L, 186 hp. Premium feel at a compact price." },
  { slug: "hyundai-elantra-2024", category: "COMPACT", branch: "SHJ", make: "Hyundai", model: "Elantra", year: 2024, plate: "SHARJAH 1 66402", vin: "KMHLM4AG7RU603318", color: "Silver", hex: "#b9bec4", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 3, mileageKm: 11_256, body: "sedan", features: [...base, "CARPLAY", "REVERSE_CAMERA"], description: "2.0L, 147 hp. Spacious rear seats and a big boot." },
  { slug: "toyota-rav4-hybrid-2024", category: "SUV", branch: "DXB", make: "Toyota", model: "RAV4 Hybrid", year: 2024, plate: "DUBAI F 80213", vin: "JTMEWRFV0RD054419", color: "Pearl White", hex: "#f2efe9", transmission: "AUTOMATIC", fuelType: "HYBRID", seats: 5, doors: 5, luggage: 4, mileageKm: 14_002, body: "suv", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "AWD", "KEYLESS"], description: "2.5L hybrid AWD, 219 hp. Efficient family SUV." },
  { slug: "nissan-patrol-2024", category: "SUV", branch: "DXB", make: "Nissan", model: "Patrol LE", year: 2024, plate: "DUBAI G 90401", vin: "JN8AY2NY1R9123460", color: "White", hex: "#f7f7f5", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 7, doors: 5, luggage: 5, mileageKm: 19_335, body: "suv", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "AWD", "LEATHER", "SUNROOF", "NAV"], description: "5.6L V8, 400 hp, 7 seats. The UAE's favourite desert cruiser." },
  { slug: "mitsubishi-pajero-2023", category: "SUV", branch: "AUH", make: "Mitsubishi", model: "Pajero", year: 2023, plate: "ABU DHABI 7 25519", vin: "JMYLRV93WPJ709223", color: "Grey", hex: "#6f757b", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 7, doors: 5, luggage: 4, mileageKm: 38_760, body: "suv", features: [...base, "AWD", "REVERSE_CAMERA"], description: "3.8L V6, 247 hp, Super Select 4WD. Built for Liwa dunes." },
  { slug: "hyundai-tucson-2024", category: "SUV", branch: "MRN", make: "Hyundai", model: "Tucson", year: 2024, plate: "DUBAI H 14873", vin: "KM8JBCAE5RU188032", color: "Blue", hex: "#264f86", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 5, luggage: 4, mileageKm: 6_904, body: "suv", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "KEYLESS"], description: "2.0L, 154 hp. Comfortable, quiet and well equipped." },
  { slug: "kia-sportage-2024", category: "SUV", branch: "SHJ", make: "Kia", model: "Sportage", year: 2024, plate: "SHARJAH 2 70315", vin: "5XYK33AF2RG190558", color: "Green", hex: "#3c5a45", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 5, luggage: 4, mileageKm: 10_528, body: "suv", features: [...base, "CARPLAY", "REVERSE_CAMERA", "SUNROOF"], description: "2.4L, 185 hp. Panoramic roof and curved display." },
  { slug: "toyota-land-cruiser-2024", category: "SUV", branch: "DTD", make: "Toyota", model: "Land Cruiser GXR", year: 2024, plate: "DUBAI J 55001", vin: "JTMHB3FJ6R5017742", color: "Black", hex: "#16181b", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 7, doors: 5, luggage: 5, mileageKm: 21_388, body: "suv", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "AWD", "LEATHER", "NAV"], description: "3.5L twin-turbo V6, 409 hp. Legendary go-anywhere comfort." },
  { slug: "mercedes-e300-2024", category: "LUXURY", branch: "DTD", make: "Mercedes-Benz", model: "E 300", year: 2024, plate: "DUBAI K 30300", vin: "W1KLF4HB2RA041166", color: "Obsidian Black", hex: "#111316", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 3, mileageKm: 7_215, body: "sedan", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "LEATHER", "SUNROOF", "NAV", "KEYLESS"], description: "2.0L turbo, 258 hp, MBUX Superscreen. Business class on wheels." },
  { slug: "bmw-530i-2024", category: "LUXURY", branch: "DXB", make: "BMW", model: "530i", year: 2024, plate: "DUBAI L 53000", vin: "WBA53FJ09RCN81294", color: "Alpine White", hex: "#f5f6f8", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 5, doors: 4, luggage: 3, mileageKm: 5_640, body: "sedan", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "LEATHER", "NAV", "KEYLESS"], description: "2.0L turbo, 255 hp. The driver's executive sedan." },
  { slug: "range-rover-sport-2024", category: "LUXURY", branch: "AUH", make: "Land Rover", model: "Range Rover Sport", year: 2024, plate: "ABU DHABI 1 88808", vin: "SALWA2BU5RA157733", color: "Eiger Grey", hex: "#5d6166", transmission: "AUTOMATIC", fuelType: "HYBRID", seats: 5, doors: 5, luggage: 4, mileageKm: 9_977, body: "suv", features: [...base, "CARPLAY", "REVERSE_CAMERA", "CRUISE", "AWD", "LEATHER", "SUNROOF", "NAV", "KEYLESS"], description: "3.0L mild-hybrid, 394 hp. Luxury that also does the dunes." },
  { slug: "tesla-model-y-2024", category: "LUXURY", branch: "MRN", make: "Tesla", model: "Model Y Long Range", year: 2024, plate: "DUBAI M 20240", vin: "7SAYGDEE4RF902215", color: "Pearl White", hex: "#eceef0", transmission: "AUTOMATIC", fuelType: "ELECTRIC", seats: 5, doors: 5, luggage: 4, mileageKm: 13_102, body: "suv", features: [...base, "REVERSE_CAMERA", "CRUISE", "AWD", "NAV", "SUNROOF", "KEYLESS"], description: "Dual-motor AWD, about 530 km range. Free charging at our Marina branch." },
  { slug: "porsche-911-2023", category: "SPORTS", branch: "DTD", make: "Porsche", model: "911 Carrera", year: 2023, plate: "DUBAI N 91100", vin: "WP0AA2A91PS206638", color: "Racing Yellow", hex: "#f2c200", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 4, doors: 2, luggage: 1, mileageKm: 8_833, body: "coupe", features: [...base, "CARPLAY", "LEATHER", "NAV", "KEYLESS"], description: "3.0L twin-turbo flat-six, 385 hp, 0-100 km/h in 4.2 s." },
  { slug: "ford-mustang-gt-2024", category: "SPORTS", branch: "DXB", make: "Ford", model: "Mustang GT Convertible", year: 2024, plate: "DUBAI P 50050", vin: "1FATP8FF4R5110384", color: "Race Red", hex: "#b3141c", transmission: "AUTOMATIC", fuelType: "PETROL", seats: 4, doors: 2, luggage: 1, mileageKm: 4_410, body: "coupe", features: [...base, "CARPLAY", "REVERSE_CAMERA", "LEATHER", "CRUISE"], description: "5.0L V8, 480 hp, soft top. Made for Jumeirah Beach Road." },
];
