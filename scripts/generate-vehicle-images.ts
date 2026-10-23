// Generates the committed placeholder photos in public/vehicles/<slug>.svg from the seed data.
//   pnpm tsx scripts/generate-vehicle-images.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEED_VEHICLES, type SeedVehicle } from "../src/db/seed-data";

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `#${[c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const BODIES: Record<SeedVehicle["body"], { body: string; windows: string; wheels: [number, number] }> = {
  sedan: {
    body: "M70 250 Q72 215 120 205 L220 195 Q260 150 330 145 L480 145 Q540 150 590 195 L690 210 Q735 220 735 255 L735 280 Q735 292 722 292 L82 292 Q70 292 70 280 Z",
    windows: "M245 196 Q275 160 335 158 L400 158 L400 196 Z M412 158 L478 158 Q525 162 565 196 L412 196 Z",
    wheels: [200, 600],
  },
  hatch: {
    body: "M80 250 Q85 212 130 205 L230 195 Q270 140 340 138 L560 140 Q610 150 650 205 L700 215 Q730 225 730 255 L730 280 Q730 292 718 292 L92 292 Q80 292 80 280 Z",
    windows: "M255 195 Q285 152 345 150 L430 150 L430 195 Z M442 150 L555 151 Q590 160 618 195 L442 195 Z",
    wheels: [205, 595],
  },
  suv: {
    body: "M70 255 L75 200 Q80 180 120 175 L210 168 Q240 115 300 110 L590 110 Q640 112 675 170 L715 180 Q740 190 740 230 L740 282 Q740 295 726 295 L84 295 Q70 295 70 282 Z",
    windows: "M230 168 Q258 125 305 123 L420 123 L420 168 Z M432 123 L585 123 Q625 128 652 168 L432 168 Z",
    wheels: [205, 605],
  },
  coupe: {
    body: "M60 258 Q62 228 115 218 L250 200 Q300 155 380 150 L470 152 Q540 160 600 205 L700 220 Q745 230 745 262 L745 282 Q745 292 732 292 L74 292 Q60 292 60 280 Z",
    windows: "M275 200 Q315 166 385 163 L455 164 L455 200 Z M466 165 Q520 172 565 200 L466 200 Z",
    wheels: [195, 610],
  },
};

function svg(v: SeedVehicle) {
  const b = BODIES[v.body];
  const dark = shade(v.hex, -60);
  const light = shade(v.hex, 40);
  const wheel = (x: number) =>
    `<g transform="translate(${x} 292)"><circle r="46" fill="#1d1f23"/><circle r="30" fill="#9aa1a9"/><circle r="10" fill="#4b5058"/></g>`;
  const title = `${v.year} ${v.make} ${v.model}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" role="img" aria-labelledby="t">
  <title id="t">${title} (${v.color})</title>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef5"/><stop offset="1" stop-color="#f8f5ef"/></linearGradient>
    <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${v.hex}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  <ellipse cx="402" cy="340" rx="350" ry="22" fill="#000" opacity="0.12"/>
  <path d="${b.body}" fill="url(#paint)" stroke="${dark}" stroke-width="3"/>
  <path d="${b.windows}" fill="#2b3644" opacity="0.85"/>
  <rect x="${b.wheels[1] + 90}" y="232" width="34" height="12" rx="4" fill="#fff4c2"/>
  <rect x="78" y="238" width="22" height="12" rx="4" fill="#d94040"/>
  ${wheel(b.wheels[0])}${wheel(b.wheels[1])}
  <text x="400" y="400" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="600" fill="#1f2937">${title}</text>
  <text x="400" y="428" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="16" fill="#6b7280">Illustration – ${v.color}</text>
</svg>
`;
}

async function main() {
  const dir = path.resolve("public/vehicles");
  await mkdir(dir, { recursive: true });
  for (const v of SEED_VEHICLES) await writeFile(path.join(dir, `${v.slug}.svg`), svg(v));
  console.log(`Wrote ${SEED_VEHICLES.length} images to public/vehicles/`);
}

main();
