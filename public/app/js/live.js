// Live records: frames pulled from NASA when the record is chosen.
//
// Source: NASA Global Imagery Browse Services (GIBS), a public NASA service
// that needs no key or login. https://nasa-gibs.github.io/gibs-api-docs/
//   - WMS GetMap gives one flat world map as a PNG for a layer and a time.
//   - WMTS DescribeDomains says which times a layer has, so we can ask for
//     the newest one.
// Each GIBS layer has a published color table (bundled in records/live/, built
// by tools/build_live_colormaps.py), so a pixel maps back to an exact value.

const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi';
const HOUR = 3600e3, DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** URL of one flat world map (180 W to 180 E, 90 N to 90 S) from GIBS. */
export function mapUrl(layer, time, width = 1024, height = 512) {
  const p = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: layer,
    CRS: 'EPSG:4326', BBOX: '-90,-180,90,180', WIDTH: width, HEIGHT: height,
    FORMAT: 'image/png', TRANSPARENT: 'true',
  });
  if (time) p.set('TIME', time);
  return `${WMS}?${p}`;
}

/** Newest time a layer has, as GIBS writes it: a date or a full timestamp. */
async function latestTime(layer, tileSet) {
  const p = new URLSearchParams({
    SERVICE: 'WMTS', REQUEST: 'DescribeDomains', VERSION: '1.0.0', LAYER: layer, TILEMATRIXSET: tileSet,
  });
  const res = await fetch(`${WMTS}?${p}`);
  if (!res.ok) throw new Error(`NASA GIBS answered ${res.status}`);
  const domain = /<Domain>([^<]+)<\/Domain>/.exec(await res.text());
  if (!domain) throw new Error('NASA GIBS did not list any times for this layer');
  return domain[1].split(',').pop().split('/')[1];
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const stamp = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

/** Frames, colors and scale for a live record. Throws if NASA cannot be reached. */
export async function loadLive(record) {
  const { layer, tileSet, colormap, cadence } = record.live;
  const table = await (await fetch(`records/live/${colormap}.json`)).json();
  const lookup = new Map(table.entries.map(([r, g, b, v]) => [(r << 16) | (g << 8) | b, v]));

  const frames = [];
  if (cadence === 'static') {
    frames.push({ url: mapUrl(layer), label: 'A map that does not change', short: '' });
  } else {
    const latest = await latestTime(layer, tileSet);
    if (cadence === 'monthly') {
      // Thirteen maps, thirty days apart, ending with the newest day NASA has.
      const end = new Date(`${latest.slice(0, 10)}T00:00:00Z`);
      for (let k = 12; k >= 0; k--) {
        const day = isoDay(new Date(end - k * 30 * DAY));
        frames.push({ url: mapUrl(layer, day), date: day });
      }
    } else if (cadence === 'hours') {
      // Thirteen maps, two hours apart: one day of weather, ending with the newest half hour.
      const end = new Date(latest);
      for (let k = 12; k >= 0; k--) {
        const t = new Date(end - k * 2 * HOUR);
        frames.push({
          url: mapUrl(layer, `${t.toISOString().slice(0, 19)}Z`),
          label: `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${stamp(t).split(' ').pop()} UTC`,
          short: stamp(t),
        });
      }
    }
  }

  return {
    size: [1024, 512],
    frames,
    startFrame: frames.length - 1,          // open on the newest map
    lookup,
    units: table.units,
    valueMin: record.range[0],
    valueMax: record.range[1],
  };
}
