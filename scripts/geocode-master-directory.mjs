import fs from "node:fs";

const root = new URL("../", import.meta.url);
const pageSource = fs.readFileSync(new URL("app/page.tsx", root), "utf8");
const directorySource = fs.readFileSync(new URL("app/master-directory.ts", root), "utf8");
const cachePath = "/tmp/jeju-wondosim-geocode-cache.json";

const landmarkBlock = pageSource.slice(pageSource.indexOf("const landmarkLocations"), pageSource.indexOf("] as const;", pageSource.indexOf("const landmarkLocations")));
const supportBlock = pageSource.slice(pageSource.indexOf("const supportDirectoryPlaces"), pageSource.indexOf("];", pageSource.indexOf("const supportDirectoryPlaces")));
const landmarkPattern = /\{ name: "([^"]+)", address: "([^"]+)"[^}]*? x: ([\d.]+), y: ([\d.]+)/g;
const supportPattern = /\{ id: "[^"]+", name: "([^"]+)", category: "([^"]+)", area: "([^"]+)", address: "([^"]+)"/g;
const masterPattern = /\{ name: "([^"]+)", address: "([^"]+)", area: "([^"]+)", subtype: "([^"]+)", priority: "([^"]*)", sourceUrl: "([^"]*)", category: "([^"]+)" \}/g;

const landmarks = [...landmarkBlock.matchAll(landmarkPattern)].map((match) => ({ name: match[1], address: match[2], x: Number(match[3]), y: Number(match[4]), kind: "landmark" }));
const supports = [...supportBlock.matchAll(supportPattern)].map((match) => ({ name: match[1], category: match[2], area: match[3], address: match[4], kind: "support" }));
const master = [...directorySource.matchAll(masterPattern)].map((match) => ({ name: match[1], address: match[2], area: match[3], subtype: match[4], priority: match[5], category: match[7], kind: "directory" }));
const places = [...new Map([...landmarks, ...master, ...supports].map((place) => [place.name, place])).values()];

let cache = {};
try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch { cache = {}; }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeAddress = (address) => address.replace(/\s+/g, " ").trim();

function addressSearchCore(address) {
  const local = normalizeAddress(address)
    .replace(/^제주특별자치도\s+제주시\s+/, "")
    .replace(/\s+지하\s+(\d)/, " $1")
    .replace(/\s+(?:가동|나동|\d+층|지하\s*\d+층|\d+호|일대|Place1빌딩).*$/, "")
    .trim();
  const road = local.match(/^(.+?(?:로|길))\s+(\d+(?:-\d+)?)/);
  if (road) return `${road[1]} ${road[2]}`;
  const parcel = local.match(/^([^\s]+동)\s+(\d+(?:-\d+)?)/);
  return parcel ? `${parcel[1]} ${parcel[2]}` : local;
}

async function geocode(place) {
  const address = normalizeAddress(place.address);
  const cacheKey = `${place.name}::${address}`;
  if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) return cache[cacheKey];
  if (place.kind !== "landmark" && cache[address]) {
    cache[cacheKey] = cache[address];
    return cache[cacheKey];
  }
  const core = addressSearchCore(address);
  const addressQuery = `${core}, 제주시, 제주특별자치도, 대한민국`;
  const nameQuery = `${place.name}, 제주시, 제주특별자치도, 대한민국`;
  const queries = place.kind === "landmark" ? [nameQuery, addressQuery] : [
    addressQuery,
    nameQuery,
  ];
  let result = null;
  for (const query of queries) {
    const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", countrycodes: "kr", "accept-language": "ko", addressdetails: "1" });
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { Accept: "application/json", "User-Agent": "JejuWondosimMapEditor/1.0 (https://jeju-wondosim-map-review.snowynight706.chatgpt.site)" },
      });
      if (response.ok) {
        const rows = await response.json();
        const latitude = Number(rows[0]?.lat);
        const longitude = Number(rows[0]?.lon);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          result = { latitude, longitude, displayName: rows[0]?.display_name ?? "", query };
          break;
        }
      }
    } catch { /* leave unresolved */ }
    await wait(1100);
  }
  cache[cacheKey] = result;
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  await wait(1100);
  return result;
}

const results = {};
for (let index = 0; index < places.length; index += 1) {
  const place = places[index];
  results[place.name] = await geocode(place);
  if ((index + 1) % 10 === 0 || index === places.length - 1) console.log(`geocoded ${index + 1}/${places.length}`);
}

const calibration = landmarks.flatMap((landmark) => {
  const result = results[landmark.name];
  return result ? [{ ...result, x: landmark.x, y: landmark.y, name: landmark.name }] : [];
});
const mapBounds = { west: 126.5135, east: 126.5365, north: 33.5208, south: 33.499 };
const project = (result) => ({
  x: Math.max(0, Math.min(100, ((result.longitude - mapBounds.west) / (mapBounds.east - mapBounds.west)) * 100)),
  y: Math.max(0, Math.min(100, ((mapBounds.north - result.latitude) / (mapBounds.north - mapBounds.south)) * 100)),
});

const output = {};
for (const place of places) {
  const result = results[place.name];
  if (!result) continue;
  output[place.name] = { ...result, ...project(result) };
}
const body = `export type GeocodedPlace = { latitude: number; longitude: number; x: number; y: number; displayName: string; query: string };\n\nexport const mapCalibration = ${JSON.stringify(mapBounds, null, 2)} as const;\n\nexport function projectGeographicCoordinates(latitude: number, longitude: number) {\n  const x = ((longitude - mapCalibration.west) / (mapCalibration.east - mapCalibration.west)) * 100;\n  const y = ((mapCalibration.north - latitude) / (mapCalibration.north - mapCalibration.south)) * 100;\n  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };\n}\n\nexport const geocodedPlaces: Record<string, GeocodedPlace> = ${JSON.stringify(output, null, 2)};\n`;
fs.writeFileSync(new URL("app/geocoded-places.ts", root), body);
console.log(JSON.stringify({ total: places.length, found: Object.keys(output).length, unresolved: places.length - Object.keys(output).length, verifiedLandmarks: calibration.length }));
