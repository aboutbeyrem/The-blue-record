// Real place names for any point on Earth: which country, which sea, and the
// nearest big city. Data is Natural Earth (public domain), prepared by
// tools/build_geo.py into records/geo/places.png and places.json.
//
// places.png is a flat world picture: red = country id, green = sea id.

const SIZE = [4096, 2048];
let data = null, ids = null, loading = null;

/** Load the place data once. Safe to call many times. */
export function loadPlaces() {
  if (!loading) {
    loading = (async () => {
      const [json, img] = await Promise.all([
        fetch('records/geo/places.json').then((r) => {
          if (!r.ok) throw new Error(`places.json ${r.status}`);
          return r.json();
        }),
        new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('places.png did not load'));
          i.src = 'records/geo/places.png';
        }),
      ]);
      const cv = document.createElement('canvas');
      cv.width = SIZE[0]; cv.height = SIZE[1];
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, SIZE[0], SIZE[1]).data;
      // Keep only what we need: one byte per pixel for countries, one for seas.
      const country = new Uint8Array(SIZE[0] * SIZE[1]);
      const sea = new Uint8Array(SIZE[0] * SIZE[1]);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) { country[j] = px[i]; sea[j] = px[i + 1]; }
      ids = { country, sea, px };
      data = json;
      return json;
    })();
  }
  return loading;
}

export const ready = () => data !== null;
export const countries = () => data.countries;
export const countryById = (id) => (data && id > 0 ? data.countries[id] : null);

/** RGBA pixels of places.png (red = country id), for the globe's picking texture. */
export const idPixels = () => ids.px;
export const idSize = SIZE;

const index = (lat, lon) => {
  const x = Math.min(SIZE[0] - 1, Math.max(0, Math.floor(((lon + 180) / 360) * SIZE[0])));
  const y = Math.min(SIZE[1] - 1, Math.max(0, Math.floor(((90 - lat) / 180) * SIZE[1])));
  return y * SIZE[0] + x;
};

/** Country id (0 = none) at a point. */
export function countryIdAt(lat, lon) {
  return ids ? ids.country[index(lat, lon)] : 0;
}

/** { country, sea } at a point. Either can be null. */
export function placeAt(lat, lon) {
  if (!ids) return { country: null, sea: null };
  const i = index(lat, lon);
  return { country: countryById(ids.country[i]), sea: ids.sea[i] ? data.seas[ids.sea[i]] : null };
}

const km = (lat1, lon1, lat2, lon2) => {
  const dy = (lat2 - lat1) * 111.2;
  const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180) * 111.2;
  return Math.hypot(dx, dy);
};

/**
 * The nearest city of any size in our list, and how far away it is.
 * Optionally only cities of at least minPop people.
 */
export function nearestCity(lat, lon, minPop = 0) {
  if (!data) return null;
  let best = null;
  for (const [name, la, lo, pop] of data.cities) {
    if (pop < minPop) continue;
    const d = km(lat, lon, la, lo);
    if (!best || d < best.km) best = { name, km: d, lat: la, lon: lo };
  }
  return best;
}

/** Where in a big country a point lies: north, south-west, centre. Small countries get none. */
function direction(country, lat, lon) {
  const [w, s, e, n] = country.b;
  if (Math.max(e - w, n - s) < 4) return '';
  const fx = (lon - (w + e) / 2) / ((e - w) / 2 || 1), fy = (lat - (s + n) / 2) / ((n - s) / 2 || 1);
  const ns = fy > 0.34 ? 'north' : fy < -0.34 ? 'south' : '';
  const ew = fx > 0.34 ? 'east' : fx < -0.34 ? 'west' : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'centre';
}

const roundKm = (d) => (d < 12 ? 'near' : d < 100 ? `about ${Math.round(d / 5) * 5} km from` : `about ${Math.round(d / 10) * 10} km from`);

/**
 * A full sentence-ready description of a point.
 * { name, where, kind } where name is "Tunisia" or "the Mediterranean Sea",
 * where adds the nearest city ("about 60 km from Tunis"), kind is land | sea.
 */
export function describe(lat, lon) {
  const { country, sea } = placeAt(lat, lon);
  const city = nearestCity(lat, lon, country ? 0 : 150000);
  const near = city && city.km < (country ? 250 : 600) ? `${roundKm(city.km)} ${city.name}` : '';
  if (country) {
    const dir = direction(country, lat, lon);
    const dirPhrase = dir ? (dir === 'centre' ? 'in the centre' : `in the ${dir}`) : '';
    const detail = [dirPhrase, near].filter(Boolean).join(', ');
    return { kind: 'land', name: country.n, country, detail, where: detail ? `${country.n}, ${detail}` : country.n, near };
  }
  const sName = sea ? `the ${sea}` : 'open water';
  return { kind: 'sea', name: sea || 'open water', sea, where: near ? `${sName}, ${near}` : sName, near };
}

export const coords = (lat, lon) =>
  `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;

/** Search countries by name (case and accent blind). */
export function searchCountries(q) {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const n = norm(q.trim());
  if (!n || !data) return [];
  const hits = [];
  data.countries.forEach((c, id) => {
    if (!c) return;
    const name = norm(c.n);
    const at = name.indexOf(n);
    if (at >= 0) hits.push({ id, c, rank: at === 0 ? 0 : 1 });
  });
  return hits.sort((a, b) => a.rank - b.rank || a.c.n.localeCompare(b.c.n)).slice(0, 8);
}
