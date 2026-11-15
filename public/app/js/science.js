// "How is this calculated?": every formula the app uses, with the real numbers for what you are hearing.
// Two levels: Easy (plain words, no maths needed) and Expert (the laws and formulas, for scientists).

import { normOf } from './categories.js';

const BASE_HZ = 130.81, SEMITONES = 32, STEPS = 64;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const f = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

let level = 'easy';
let getLive = () => null;
let summary = null;

/** The numbers behind what is on screen right now (or null if no country is loaded). */
function liveNumbers() {
  const L = getLive();
  if (!L || !L.cat) return null;
  const { cat, range, value, bin, cover, lat, lon, n: _unused } = L;
  void _unused;
  if (value === null || value === undefined) return { cat, range, none: true, lat, lon };
  const n = normOf(cat, range, value);
  const semi = n * SEMITONES;
  const hz = BASE_HZ * Math.pow(2, semi / 12);
  const level_ = (0.3 + 0.7 * n) * (0.5 + 0.5 * (cover ?? 1));
  const pan = (bin / (STEPS - 1) * 2 - 1) * 0.8;
  return { cat, range, value, n, semi, hz, level: level_, pan, bin, lat, lon };
}

const CAT = {
  temperature: {
    easy: 'NASA’s satellite measures how much heat the ground gives off. The map paints that in colours, and NASA publishes a table that says exactly which colour means which number. We look each colour up, so we get real degrees. Satellites give the temperature in kelvin, and we subtract 273.15 to get the degrees you know.',
    expert: ({ v }) => `Land: MODIS Terra LST, 8-day mean of daytime skin temperature, 1 km. Sea: MUR SST, a daily analysis of the temperature just under the surface.
  T[°C] = T[K] − 273.15${v ? `\n  with today’s reading:  ${f(v + 273.15, 2)} K − 273.15 = ${f(v, 1)} °C` : ''}
Terra crosses the equator at about 10:30 local time, so land values are the ground in the morning, not the afternoon air. Skin temperature differs from the air temperature that weather stations report.`,
  },
  rain: {
    easy: 'NASA combines many satellites to estimate how hard it is raining or snowing every half hour. We read the colour of the map to get “millimetres of rain per hour”. Stronger rain makes a busier, louder patter. Silence means no rain was falling.',
    expert: ({ v }) => `GPM IMERG precipitation rate, half-hourly, 0.1°, combining passive-microwave and infrared estimates.
  rate [mm/h]  read from the colour table;  daily total [mm] = rate × 24 h${v ? `\n  with this reading:  ${f(v, 1)} mm/h × 24 h = ${f(v * 24, 0)} mm/day` : ''}
Pitch uses a logarithmic scale because rain rates span orders of magnitude:  n = ln(v / 0.1) / ln(53 / 0.1),  clipped to [0, 1].
Our weakest result: r = 0.42 against MERRA-2 daily rain, because rain is patchy in time and space.`,
  },
  elevation: {
    easy: 'The satellite ASTER maps the height of the land. Higher ground makes a higher, heavier note. We turn colours into metres using NASA’s own colour table, the same way as for the other maps.',
    expert: ({ v }) => `ASTER Global DEM, 1 arc-second (about 30 m), colour index through GIBS. Height above sea level, in metres.
  Pitch uses a square-root curve so low land does not all sound the same:  n = √((h − 0) / (H − 0)),  H = the range top for the country${v !== undefined && v !== null ? `\n  with this reading:  h = ${f(v, 0)} m` : ''}
Checked against SRTM at 70 places: median error 7.5 m, r = 0.996.`,
  },
  greenness: {
    easy: 'Healthy plants reflect lots of near-infrared light and soak up red light. The satellite compares the two to give a “greenness” number from 0 (bare ground) to about 1 (thick forest). A brighter, airier sound means greener ground.',
    expert: ({ v }) => `MODIS Terra NDVI, monthly, 1 km.
  NDVI = (ρ_NIR − ρ_red) / (ρ_NIR + ρ_red)${v !== undefined && v !== null ? `\n  this reading:  NDVI = ${f(v, 2)}` : ''}
where ρ is surface reflectance. Bare rock and sand sit at 0.1 or below, which is the same barren look as Mars. Checked against VIIRS (another satellite): r = 0.905 over 228 places.`,
  },
};

function sections() {
  const L = liveNumbers();
  const catId = L?.cat?.id;
  const v = L && !L.none ? L.value : null;
  const S = [];

  S.push({
    title: '1. From a colour to a real number',
    easy: 'NASA draws its maps with a fixed colour code, like a paint-by-numbers key. NASA publishes that key. For every pixel in the picture we find its colour in the key and read the number next to it. Nothing is guessed. If a colour is not in the key, we skip that pixel.',
    expert: `GIBS WMS GetMap returns an image of the country’s bounding box. For each pixel (R, G, B):
  value = table[(R<<16) | (G<<8) | B]        (exact match on NASA’s published colormap)
Pixels with alpha < 128, outside the country mask, or with no matching colour are treated as "no reading" and stay silent. No interpolation, no nearest-colour guess.`,
  });

  const order = catId ? [catId, ...Object.keys(CAT).filter((k) => k !== catId)] : Object.keys(CAT);
  for (const id of order) {
    const names = { temperature: 'Temperature', rain: 'Rain', elevation: 'Height of the land', greenness: 'Greenness' };
    S.push({
      title: `${names[id]}${id === catId ? ' (what you are hearing)' : ''}`,
      easy: CAT[id].easy,
      expert: CAT[id].expert({ v: id === catId ? v : null }),
      open: id === catId,
    });
  }

  S.push({
    title: 'From the number to the sound',
    easy: 'The lowest value on the scale is a low note and the highest is a high note, three octaves apart in total. Bigger values are also a bit louder. Where the line is in the west you hear it in your left ear, and in the east in your right ear.',
    expert: `n = (v − lo) / (hi − lo)      (linear; log or √ for rain and height, see above), clipped to [0, 1]
semitones s = n × ${SEMITONES}
frequency f = ${BASE_HZ} Hz × 2^(s / 12)            (equal temperament, C3 = ${BASE_HZ} Hz)
loudness = (0.3 + 0.7 n) × (0.5 + 0.5 c)           (c = share of pixels with data)
pan = (2 × bin / ${STEPS - 1} − 1) × 0.8               (−0.8 left = west, +0.8 right = east)
Each kind of data has its own voice: warm tone (temperature), rain patter, deep terrain tone, airy leaf pad.${L && !L.none ? `

Right now:
  value v = ${f(L.value, L.cat.decimals)} ${L.cat.unit || ''}  →  n = ${f(L.n, 3)}
  s = ${f(L.n, 3)} × ${SEMITONES} = ${f(L.semi, 1)} semitones
  f = ${BASE_HZ} × 2^(${f(L.semi, 1)}/12) = ${f(L.hz, 1)} Hz
  loudness ≈ ${f(L.level, 2)},   pan = ${f(L.pan, 2)}  (step ${L.bin + 1} of ${STEPS})` : ''}`,
    open: true,
  });

  S.push({
    title: 'Where on Earth you are',
    easy: 'The scan line sweeps the country from west to east in 64 small steps. We know the latitude and longitude of every step, so we can tell you the nearest city and how far away it is.',
    expert: `Maps are in EPSG:4326 (plate carrée): equal steps in degrees.
  lon = west + (bin + ½) / ${STEPS} × Δlon          lat = north − (row + ½) / H × Δlat
Nearest city (Natural Earth, 7,342 places) by great-circle distance, haversine formula, R = 6371 km:
  a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)
  d = 2R · asin(√a)${L ? `\n\nRight now:  lat ${f(L.lat, 2)}°, lon ${f(L.lon, 2)}°` : ''}`,
  });

  S.push({
    title: 'Averages and what “What did I hear?” says',
    easy: 'The average is the sum of all the readings along the line divided by how many there are. The hottest and coolest places are the biggest and smallest readings.',
    expert: `mean = (1/N) Σ vᵢ  over the N steps on the line that have data
Change over time: Δ = mean(newest map) − mean(oldest map) along the same line. Pixel values in each step are the mean of the valid pixels in a band of ±0.8 % of the map height.`,
  });

  S.push({
    title: 'The Mars chime',
    easy: 'Mars is very cold and has no plants. If a place on Earth is as cold as Mars’s average, or as bare as Mars’s ground, a chime rings. The card tells you whether any such place was FOUND in the country or NOT FOUND.',
    expert: `Temperature:  | T − (−63 °C) | ≤ 4 °C      (Mars mean temperature 210 K, NASA Mars Fact Sheet)
Greenness:    NDVI ≤ 0.1                   (bare rock and sand, NASA Earth Observatory)
FOUND = at least one pixel inside the border of the newest map passes the test; the share is  matches / pixels with data.`,
  });

  const sm = summary;
  const row = (name, key, unit) => {
    const s = sm?.[key];
    return s ? `<tr><td>${name}</td><td>${s.pairs}</td><td>${f(s.mean_abs_error, 2)} ${unit}</td><td>${f(s.bias, 2)}</td><td>${f(s.correlation_r, 3)}</td></tr>` : '';
  };
  S.push({
    title: 'How we proved it is right',
    easy: 'We read the same place and day from a second, independent NASA source and compared. If the two agree, the readings are trustworthy. Sea temperature, height and greenness agree very well. Land temperature reads a little cool, and rain agrees only roughly. We show those results openly.',
    expert: `For each category, N pairs (app value aᵢ, reference bᵢ):
  bias = (1/N) Σ (aᵢ − bᵢ)          MAE = (1/N) Σ |aᵢ − bᵢ|          RMSE = √((1/N) Σ (aᵢ − bᵢ)²)
  r = Σ (aᵢ − ā)(bᵢ − b̄) / √(Σ (aᵢ − ā)² · Σ (bᵢ − b̄)²)          (Pearson correlation)
References: MERRA-2 (NASA POWER), SRTM, VIIRS. They are NASA products too, so this shows consistency between sources, not agreement with weather stations.`,
    table: `<table class="sci-table"><thead><tr><th>Data</th><th>Pairs</th><th>Mean error</th><th>Bias</th><th>r</th></tr></thead><tbody>
${row('Sea temperature', 'sea temperature (C)', '°C')}${row('Height of the land', 'height of the land (m)', 'm')}${row('Greenness', 'greenness (index)', '')}${row('Land temperature', 'land temperature (C)', '°C')}${row('Rain', 'rain (mm per day)', 'mm/day')}
</tbody></table><p class="fine">Source file: validation/live_summary.json. r is the correlation (1 is perfect). Rain is our weakest result.</p>`,
  });

  S.push({
    title: 'Where the data comes from',
    easy: 'All the maps come live from NASA’s GIBS service, the same family of NASA satellite pictures shown in NASA’s Earth Information Center. Country borders and city names come from Natural Earth, not NASA.',
    expert: `NASA GIBS (Global Imagery Browse Services), WMS epsg4326: MODIS_Terra_L3_Land_Surface_Temp_8Day_Day, GHRSST_L4_MUR_Sea_Surface_Temperature, IMERG_Precipitation_Rate_30min, ASTER_GDEM_Color_Index, MODIS_Terra_L3_NDVI_Monthly, BlueMarble_ShadedRelief_Bathymetry.
Challenge resource: NASA Earth Information Center, https://earth.gov/. Validation only: NASA POWER (MERRA-2), VIIRS NDVI, SRTM.`,
  });
  return S;
}

function render() {
  const dlg = $('science');
  const expert = level === 'expert';
  const secs = sections();
  dlg.innerHTML = `
  <div class="sci-head">
    <h2 id="sciTitle">How is this calculated?</h2>
    <button type="button" class="ghost" id="sciClose">Close</button>
  </div>
  <div class="sci-switch" role="group" aria-label="Level of detail">
    <button type="button" data-level="easy" aria-pressed="${!expert}">Easy: for everyone</button>
    <button type="button" data-level="expert" aria-pressed="${expert}">Expert: laws and formulas</button>
  </div>
  <p class="fine sci-intro">${expert ? 'Every step from NASA pixel to sound, with the exact formulas and, where a country is loaded, the live numbers.' : 'Short, plain explanations. Switch to Expert for the formulas.'}</p>
  ${secs.map((s) => `
    <details class="sci-sec"${s.open ? ' open' : ''}>
      <summary>${esc(s.title)}</summary>
      ${expert ? `<pre class="sci-math">${esc(s.expert)}</pre>` : `<p>${esc(s.easy)}</p>`}
      ${s.table && expert ? s.table : ''}
    </details>`).join('')}
  `;
  dlg.querySelector('#sciClose').addEventListener('click', () => dlg.close());
  dlg.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level;
    try { localStorage.setItem('blue-record-sci-level', level); } catch { /* no storage */ }
    const open = [...dlg.querySelectorAll('.sci-sec')].map((d) => d.open);
    render();
    dlg.querySelectorAll('.sci-sec').forEach((d, i) => { d.open = open[i]; });
    dlg.querySelector(`[data-level="${level}"]`).focus();
  }));
}

export function initScience(live) {
  getLive = live;
  try { level = localStorage.getItem('blue-record-sci-level') === 'expert' ? 'expert' : 'easy'; } catch { /* no storage */ }
  fetch('validation/live_summary.json').then((r) => r.json()).then((j) => { summary = j; }).catch(() => {});
  const open = () => { render(); const d = $('science'); if (!d.open) d.showModal(); };
  $('scienceBtn').addEventListener('click', open);
  $('cScience').addEventListener('click', open);
  $('science').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
}
