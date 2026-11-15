// The record collection. Editorial text lives here; frames, dates and the
// color lookup table live in records/<id>/data.json (built by tools/).

import { loadLive, mapUrl } from './live.js';

const GIBS_DOCS = 'https://nasa-gibs.github.io/gibs-api-docs/';
const GIBS_CREDIT = 'Pulled live from NASA Global Imagery Browse Services (GIBS).';

// How a record talks about its values. "quiet" says what silence means.
const OCEAN_WORDS = {
  unit: '°C', decimals: 1, quiet: 'land',
  quietLabel: 'land, so silence',
  quietSay: 'This is land, so the record is silent here.',
  valueSay: (v) => `The water here is about ${Math.round(v)} degrees Celsius.`,
  meanSay: (v) => `Around this whole latitude it averages ${Math.round(v)} degrees.`,
  share: 'of the way round is water',
  none: 'No open water at this latitude',
  semitone: 'One semitone per °C (precise)',
};

export const RECORDS = [
  {
    id: 'sst',
    voice: 'warm',
    title: 'The Warm Current',
    subtitle: 'Sea surface temperature',
    kind: 'value',                 // a continuous value recovered from color
    unit: '°C',
    noun: 'water',
    range: [0, 32],
    legend: { src: 'records/sst/colorbar.png', alt: 'NASA colorbar: blue is 0 degrees Celsius, green is 10 to 20, yellow about 25, red is 32.' },
    words: OCEAN_WORDS,
    source: 'Global Sea Surface Currents and Temperature',
    sourceUrl: 'https://svs.gsfc.nasa.gov/3912/',
    credit: 'NASA’s Scientific Visualization Studio, from the ECCO2 ocean model (MIT/JPL).',
    strides: [
      { frames: 1, label: 'about 10 days' },
      { frames: 3, label: 'about a month' },
      { frames: 0, label: 'nothing (hold this date)' },
    ],
    mapping: 'One tone follows the water: higher and louder means warmer. Silence means land. The low drone is the average around the whole latitude.',
    liner: [
      'Ocean currents drawn as flowing lines, colored by the temperature of the water: blue is 0 °C, red is 32 °C.',
      'The needle reads the color under it and converts it back to degrees with NASA’s own colorbar. In “one semitone per °C” mode, an octave is exactly 12 degrees.',
      'Try this: park the tonearm at Tunis’s latitude and let a year go by. The melody climbs into summer and falls into winter. Then flip the record. On Side B the seasons run the other way.',
    ],
    chartLabel: 'Average water temperature at this latitude, through the year',
  },
  {
    id: 'live-sst',
    voice: 'warm',
    title: 'The Ocean, Latest',
    subtitle: 'Sea temperature up to NASA’s newest day',
    kind: 'value',
    live: { layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', tileSet: '1km', colormap: 'sst', cadence: 'monthly' },
    range: [0, 32],
    legend: { src: 'https://gibs.earthdata.nasa.gov/legends/GHRSST_Sea_Surface_Temperature_H.svg', alt: 'NASA color scale for sea surface temperature, from below 0 to 32 degrees Celsius.' },
    words: OCEAN_WORDS,
    noun: 'water',
    source: 'Sea Surface Temperature (L4, MUR, GHRSST)',
    sourceUrl: GIBS_DOCS,
    credit: `${GIBS_CREDIT} Data: the MUR analysis from NASA JPL.`,
    strides: [
      { frames: 1, label: 'thirty days' },
      { frames: 0, label: 'nothing (hold this date)' },
    ],
    mapping: 'One tone follows the water: higher and louder means warmer. Silence means land or sea ice. The low drone is the average around the whole latitude.',
    liner: [
      'This record is not stored in the app. When you choose it, the app asks NASA for the newest day of global sea surface temperature it has, and for twelve earlier maps thirty days apart.',
      'The first spin is NASA’s newest day, usually yesterday. Then the record goes back a year and plays forward to it.',
      'Every pixel is turned into degrees with the color table NASA publishes for this layer, so the value is exact to the table’s 0.15 °C steps.',
    ],
    chartLabel: 'Average water temperature at this latitude, over the last twelve months',
  },
  {
    id: 'live-rain',
    voice: 'rain',
    title: 'Rain, Last 24 Hours',
    subtitle: 'Rain and snow from the last 24 hours',
    kind: 'value',
    live: { layer: 'IMERG_Precipitation_Rate_30min', tileSet: '2km', colormap: 'rain', cadence: 'hours' },
    range: [0.1, 53],
    curve: 'log',
    minCover: 0.03,
    legend: { src: 'https://gibs.earthdata.nasa.gov/legends/GPM_Precipitation_Rate_H.svg', alt: 'NASA color scale for precipitation rate, from 0.1 to 53 millimetres per hour, for rain and for snow.' },
    words: {
      unit: 'mm/h', decimals: 1, quiet: 'dry',
      quietLabel: 'no rain, so silence',
      quietSay: 'No rain or snow was falling here.',
      valueSay: (v) => `Rain or snow was falling here at about ${v < 10 ? v.toFixed(1) : Math.round(v)} millimetres per hour.`,
      meanSay: (v) => `Where it was raining along this latitude, it averaged ${v.toFixed(1)} millimetres per hour.`,
      share: 'of the way round had rain or snow',
      none: 'No rain or snow anywhere along this latitude',
      semitone: 'Every semitone (finest steps)',
    },
    noun: 'rain',
    source: 'Precipitation Rate, 30-minute average (IMERG)',
    sourceUrl: GIBS_DOCS,
    credit: `${GIBS_CREDIT} Data: IMERG, from the NASA and JAXA Global Precipitation Measurement mission.`,
    strides: [
      { frames: 1, label: 'two hours' },
      { frames: 0, label: 'nothing (hold this moment)' },
    ],
    mapping: 'Rain patters where it is falling under the needle: more drops and louder means harder rain. Silence means dry sky.',
    liner: [
      'This record is not stored in the app. When you choose it, the app asks NASA for its newest half hour of global rain and snow, usually a few hours old, and for the day before it in two-hour steps.',
      'The first spin is the newest half hour. Then the record goes back a day and plays forward to it.',
      'Rates run from light drizzle to more than 50 millimetres per hour, so pitch follows a logarithmic scale: each step up is rain that is about a fifth heavier.',
    ],
    chartLabel: 'Average rain rate where it rained at this latitude, over the last 24 hours',
  },
  {
    id: 'live-land',
    voice: 'terrain',
    title: 'High Ground',
    subtitle: 'The height of the land',
    kind: 'value',
    live: { layer: 'ASTER_GDEM_Color_Index', tileSet: '31.25m', colormap: 'elevation', cadence: 'static' },
    range: [0, 6000],
    curve: 'sqrt',
    legend: { src: 'https://gibs.earthdata.nasa.gov/legends/ASTER_GDEM_Color_Index_H.svg', alt: 'NASA color scale for elevation, from sea level to more than 8,400 metres.' },
    words: {
      unit: 'm', decimals: 0, quiet: 'sea',
      quietLabel: 'sea, so silence',
      quietSay: 'This is sea, so the record is silent here.',
      valueSay: (v) => `The ground here is about ${Math.round(v / 10) * 10} metres above sea level.`,
      meanSay: (v) => `The land around this whole latitude averages ${Math.round(v / 10) * 10} metres.`,
      share: 'of the way round is land',
      none: 'No land at this latitude',
      semitone: 'Every semitone (finest steps)',
    },
    noun: 'land',
    source: 'Digital Elevation Model (Color Index, ASTER, Terra)',
    sourceUrl: GIBS_DOCS,
    credit: `${GIBS_CREDIT} Data: ASTER GDEM, from NASA and Japan’s METI.`,
    strides: [
      { frames: 0, label: 'nothing (this map does not change)' },
    ],
    mapping: 'A deep organ tone with a rumble: higher ground sounds higher, louder and heavier. Silence means sea. The low drone is the average height of the land around the whole latitude.',
    liner: [
      'The opposite of the ocean records: here the land sings and the sea is silent.',
      'A groove on a real record is a tiny line of hills and valleys. So is a line of latitude across the Earth. Park the tonearm at 30° on Side A and you will hear the needle climb onto the Himalaya.',
      'Low ground is far more common than high ground, so pitch follows a square-root scale that leaves room for plains and hills as well as mountain ranges.',
    ],
    chartLabel: 'Average height of the land at this latitude',
  },
  {
    id: 'lightning',
    title: 'Thunder Season',
    subtitle: 'Lightning seen from the Space Station',
    kind: 'events',                // discrete flashes counted from pixels
    unit: 'flashes',
    noun: 'lightning',
    source: 'Lightning Events Detected from the International Space Station (ISS) 2017-2023',
    sourceUrl: 'https://svs.gsfc.nasa.gov/5011/',
    credit: 'NASA’s Scientific Visualization Studio, from the Lightning Imaging Sensor on the ISS.',
    strides: [
      { frames: 1, label: 'one step (roughly a month)' },
      { frames: 3, label: 'three steps (roughly a season)' },
      { frames: 0, label: 'nothing (hold this moment)' },
    ],
    mapping: 'Every crack is lightning under the needle; a louder, longer crack means more of it. A soft tap means land with no lightning. Silence means open ocean.',
    liner: [
      'Each yellow dot is lightning recorded by a sensor on the International Space Station. Every frame gathers about ten days of storms.',
      'The Station’s orbit only passes over latitudes up to about 55°, so the polar grooves of this record are silent.',
      'NASA’s movie has no clock on screen, so we do not print dates. Each moment is labelled by storm season instead, read from the data: lightning sits north of its average latitude in the northern warm season and south of it in the southern one.',
      'Try this: listen at 10° on Side A, then flip to Side B. The thunder follows the Sun across the equator as the seasons go by.',
    ],
    chartLabel: 'Lightning activity at this latitude, 2017 to 2023',
  },
];

let landMask;
/** A 1-degree land mask, made from the ocean frames by tools/build_landmask.py. */
async function getLandMask() {
  if (landMask === undefined) {
    const res = await fetch('records/landmask.json');
    landMask = res.ok ? (await res.json()).rows : null;
  }
  return landMask;
}

/** Small picture for a record's sleeve. */
export function sleeveArt(record) {
  return record.live ? mapUrl(record.live.layer, null, 256, 128) : `records/${record.id}/000.jpg`;
}

export async function loadRecordData(record) {
  let data;
  if (record.live) {
    data = await loadLive(record);
  } else {
    const res = await fetch(`records/${record.id}/data.json`);
    if (!res.ok) throw new Error(`Could not load ${record.id} (${res.status})`);
    data = await res.json();
    for (const f of data.frames) f.url = `records/${record.id}/${f.file}`;
    if (record.range) [data.valueMin, data.valueMax] = record.range;
  }
  data.landMask = await getLandMask();
  return data;
}
