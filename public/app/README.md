# The Blue Record

NASA Earth Information Center visualizations, pressed onto a record you can play.

Built at the NASA Space Apps Challenge 2026 (Tunis) for the
challenge **The Earth Information Jukebox**.

## What it is

Two ways to listen to NASA's Earth data.

**1. Pick a country (the main mode).** Spin a 3D globe and click a country, or
search for one, or use your location. Choose what to hear: **temperature**,
**rain**, **height of the land** or **greenness**. The app asks NASA's Global
Imagery Browse Services for a map of just that country at NASA's newest date
(plus twelve earlier ones), looks every pixel up in NASA's own color table, and
a scan line sweeps the country from west to east as one tone. Higher and louder
means hotter, wetter, higher or greener. Silence means no reading. Each pass
moves time forward to NASA's newest map. "Where am I?" names the country and the
nearest city. When the data matches Mars, a chime rings.

**2. The whole-planet record.** The Earth pressed onto a vinyl record: the pole
is the centre and the equator the edge, so a groove is a line of latitude. The
tonearm picks the latitude, one spin goes once around the planet, and flipping
the record gives the other hemisphere.

The sound is made live in the browser from the pixels of NASA's maps. Nothing is
pre-recorded.

### Pick a country: what each category reads

| Category | NASA layer (GIBS) | Updates |
|---|---|---|
| Temperature, land | MODIS Land Surface Temperature, 8-day average (Terra) | every 8 days |
| Temperature, sea | MUR Sea Surface Temperature (NASA JPL) | daily |
| Rain | IMERG precipitation rate, 30 minutes (NASA and JAXA) | every 30 minutes |
| Height of the land | ASTER Global Digital Elevation Model | does not change |
| Greenness | MODIS vegetation index (NDVI), monthly (Terra) | monthly |

The globe's picture is NASA's Blue Marble. Country borders, sea names and cities
are from Natural Earth (public domain). The player shows, for every category, the
exact request it sent to NASA, with a link.

**Mars chime.** Two simple comparisons with NASA facts, not a scientific test:
a temperature within 4 °C of Mars's average, -63 °C (NASA Mars Fact Sheet), and
ground that is as bare as Mars (a greenness index of 0.1 or less, which NASA's
Earth Observatory gives for bare rock and sand).

### The whole-planet records

| Record | NASA source | What you hear |
|---|---|---|
| The Warm Current | [Global Sea Surface Currents and Temperature](https://svs.gsfc.nasa.gov/3912/) (SVS, bundled) | Higher note = warmer water. Silence = land. |
| The Ocean, Latest | Sea Surface Temperature, MUR, **live from NASA GIBS** | The same, for NASA's newest day and the twelve months before it. |
| Rain, Last 24 Hours | Precipitation Rate, IMERG 30-minute, **live from NASA GIBS** | A note = rain or snow. Higher = heavier. Silence = dry sky. |
| High Ground | Digital Elevation Model, ASTER GDEM, **from NASA GIBS** | Higher note = higher ground. Silence = sea. |
| Thunder Season | [Lightning Events Detected from the ISS 2017-2023](https://svs.gsfc.nasa.gov/5011/) (SVS, bundled) | Each crack = lightning under the needle. |

The three GIBS records are not stored in the app. They are requested from
NASA's Global Imagery Browse Services when you choose them, so they need an
internet connection. The two bundled records work offline.

## Run it

It is a static site with no build step and no dependencies.

```bash
cd blue-record
python3 -m http.server 8000
# open http://localhost:8000
```

It must be served over http (opening `index.html` directly will not load the
records). Any static host works, including GitHub Pages.

## Deploy

It is a static site, so any static host works. The project website in `../site`
bundles this app in `public/app` and deploys to Vercel with no configuration.
To refresh the copy after changing the app:

```bash
rsync -a --delete ../blue-record/ ../site/public/app/
```

## How to use it

- **Pick a country**: `Space` plays or pauses, `↑` `↓` move the scan line, `W` says where you are, `Esc` goes back.
- **Whole-planet record**: the big button or `Space` drops the needle.
- **Move the tonearm**: the slider, `←` `→`, or drag on the record.
- **Flip the record**: the button, or `F`.
- **Where am I?**: `W` speaks the place, the date and the value.
- **Choose a record**: `1`, `2`.

## How the data is read

1. A frame is a flat world map (180° W to 180° E, 90° N to 90° S).
2. For the needle's latitude we read a band 2.5° tall and cut it into 48 steps
   of 7.5° of longitude.
3. **Sea temperature.** Land in this visualization is grey and water is
   colored. For each colored pixel we take its hue and look it up in a table
   built from NASA's own colorbar (0 to 32 °C), which gives a temperature.
   Pixels are averaged per step. A step that is mostly grey is land.
4. **Lightning.** We count the yellow pixels in each step. That measures
   activity. It is not an exact count of flashes.
5. **Live records.** NASA publishes, for every GIBS layer, the table that says
   which color stands for which value. We bundle those tables
   (`records/live/`, built by `tools/build_live_colormaps.py`) and look each
   pixel up in them. When we checked one image per layer, every data pixel
   matched a table entry exactly, so the reading is as fine as NASA's table:
   0.15 °C steps for sea temperature. Transparent pixels mean no data.
6. Temperature maps to pitch at one semitone per °C, then snaps to the chosen
   scale. Rain uses a logarithmic scale and elevation a square-root scale. In "one semitone per °C" mode an octave is exactly 12 °C.

The code for steps 2 to 4 is in `js/reader.js`. The lookup table is built by
`tools/build_sst.py`.

## How accurate is it

The temperatures are recovered from the colors of a published visualization,
so they are approximate. We measured how approximate.

`tools/validate_sst.py` reads the temperature exactly the way the app does and
compares it with NASA POWER's daily Earth Skin Temperature (from the MERRA-2
reanalysis) for the same place and day. Result, in `validation/summary.json`:

| | |
|---|---|
| Comparisons | 1,980 (55 open-ocean points x 36 dates, latitudes 45° S to 45° N) |
| Average difference (bias) | -0.12 °C |
| Mean absolute error | 0.68 °C |
| Root-mean-square error | 0.97 °C |
| Correlation | 0.993 |
| Within 1 °C / within 2 °C | 79% / 93% |

Read this with three limits in mind:

- Only open-ocean steps were compared (at least 95% water in every frame).
  Steps along coasts mix land and water and will be less accurate.
- MERRA-2 and the ECCO2 model that NASA drew are different products, so part
  of the difference is the two disagreeing, not our color reading. Agreement
  is weakest at 45° N and 45° S (mean absolute error 1.2 to 1.3 °C).
- Latitudes beyond 45° were not checked, because sea ice makes skin
  temperature and water temperature different things there.

### The live categories

`tools/validate_live.py` does the same for the categories you can pick, against
other NASA data. Results are in `validation/live_summary.json`.

| Category | Compared with | Pairs | Result |
|---|---|---|---|
| Sea temperature | MERRA-2 skin temperature | 108 | off by 0.28 °C on average, correlation 0.999 |
| Height of the land | SRTM elevation | 70 | median error 7.5 m, correlation 0.996 |
| Greenness | VIIRS vegetation index (a second satellite) | 228 | correlation 0.91, off by 0.04 |
| Land temperature | MERRA-2 at the satellite's 10:30 hour | 124 | reads 2.2 °C cooler, off by 3.4 °C, correlation 0.89 |
| Rain | MERRA-2 corrected rainfall | 106 | **weakest:** correlation 0.42, wet or dry agreed 62% |

Land temperature needs care. It is the temperature of the ground itself at the
satellite's morning pass, not the air. NASA's afternoon satellite reads up to
10 °C hotter in the same place (Death Valley in August: 50 °C morning, 61 °C
afternoon), so "temperature" depends on the time of day. The app says so. We also
tried the afternoon satellite against MERRA-2 at 13:30: less biased (+0.9 °C) but
noisier (correlation 0.85), so we kept the morning one.

Greenness is checked by two satellites agreeing, which shows consistency, not truth.

The seasons also come out as they should: at 37.5° N the latitude average runs
from about 13 °C in March to 23 °C in September, and at 27.5° S it runs the
other way, coolest in September and warmest in February.

The lightning record is a measure of activity (yellow pixels counted), not a
count of flashes. NASA's movie has no clock on screen and does not run at a
constant speed, so frames are labelled by storm season, read from where the
lightning is, instead of by date.

## Accessibility

- Every control is a real button, slider or checkbox, and works by keyboard.
- "Where am I?" speaks the answer and also writes it to a live region for
  screen readers. Turn off "Spoken answers" if your screen reader reads it twice.
- Phones that support web vibration (Android) pulse with each note.
- With "reduce motion" switched on, the record stays still and a dot shows what
  is being read.
- Each chart has a sentence that says what it shows.

## Sources and credits

- Visualizations: NASA's Scientific Visualization Studio.
  - [SVS 3912](https://svs.gsfc.nasa.gov/3912/), Global Sea Surface Currents and
    Temperature, from the ECCO2 model (MIT/JPL). Frames, frame dates and colorbar.
  - [SVS 5011](https://svs.gsfc.nasa.gov/5011/), Lightning Events Detected from
    the International Space Station (ISS) 2017-2023, from the Lightning Imaging
    Sensor.
- Both are listed under Resources for the Earth Information Jukebox challenge.
- Live data: [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/), layers
  `GHRSST_L4_MUR_Sea_Surface_Temperature` (MUR analysis, NASA JPL),
  `IMERG_Precipitation_Rate_30min` (Global Precipitation Measurement mission,
  NASA and JAXA) and `ASTER_GDEM_Color_Index` (ASTER GDEM, NASA and Japan's METI).
- No third-party code libraries. Sound uses the Web Audio API; drawing uses
  WebGL and Canvas.

This project is not affiliated with or endorsed by NASA.

## Use of AI

Claude Code (Anthropic) was used to help write the code and this README. All
imagery is NASA's. All sound is synthesized live by the app. There are no
AI-generated images, video or audio.
