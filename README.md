# The Blue Record

**Hear the planet.** Pick a country on a 3D globe and hear what NASA's satellites see there, live.

Live site: **https://the-blue-record.vercel.app**  
Developer: [Beyrem](https://www.aboutbeyrem.com) and [Med Mehdi Ben Saad](https://www.aboutbeyrem.com), the only developers on a team of five.
The app, full screen: https://the-blue-record.vercel.app/app/index.html
Demo video (25 s): https://the-blue-record.vercel.app/demo/blue-record-demo.mp4

Built for the NASA Space Apps Challenge 2026, challenge
[The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).
Participant certificate, 14-15 November 2026: [PDF](docs/nasa-space-apps-2026-certificate.pdf).

## Why

NASA publishes its Earth data as maps. A map only works if you can see it. The Blue Record turns
the same data into sound, speech and keyboard controls, so people who cannot see a map can still
explore it.

## What it does

1. Spin the globe and click any of 242 countries, search for one, or use your location.
2. Choose what to hear: **temperature**, **rain**, **height of the land** or **greenness**.
3. The app asks NASA GIBS for a map of that country at NASA's newest date and looks every pixel up
   in NASA's published color table, which gives a real value (°C, mm/h, m, NDVI).
4. A scan line sweeps the country from west to east. Higher and louder means more. West is in the
   left ear, east in the right. Each kind of data has its own voice.
5. **W** says where you are, with the nearest city. **S** says what the data means.
6. A chart shows the line you are hearing: value against longitude.
7. A Mars check says FOUND or NOT FOUND: is any place in the country as cold as Mars's average
   (−63 °C, within 4 °C) or as bare as Mars (NDVI 0.1 or less)? A chime rings when the line crosses one.
8. **How is this calculated?** opens every formula with the live numbers, in an Easy version and
   an Expert version.

A second tab plays the whole planet as a vinyl record: the pole is the centre, the equator is the
edge, and the tonearm picks the latitude.

## How accurate is it

Each value is read exactly as the app reads it and compared with a second source at the same place
and time. Script: `public/app/tools/validate_live.py`. Results: `public/app/validation/`.

| Data | Compared with | Pairs | Result |
|---|---|---|---|
| Sea temperature | MERRA-2 (NASA POWER) | 108 | 0.28 °C mean error, r 0.999 |
| Height of the land | SRTM | 70 | 7.5 m median error, r 0.996 |
| Greenness | VIIRS NDVI | 228 | r 0.905 |
| Land temperature | MERRA-2 at 10:30 local | 124 | reads 2.2 °C cool, 3.4 °C mean error, r 0.894 |
| Rain | MERRA-2 daily rain | 106 | r 0.42, the weakest result |

Limits: the references are NASA products too, so this shows the sources agree with each other, not
that they match weather stations. The app has not yet been tested with blind or low-vision users.
An automated accessibility audit (axe-core) found zero violations; see
`public/app/validation/accessibility.txt`.

## NASA data

Live from [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) (no key, no login):

- `MODIS_Terra_L3_Land_Surface_Temp_8Day_Day` land surface temperature
- `GHRSST_L4_MUR_Sea_Surface_Temperature` sea surface temperature
- `IMERG_Precipitation_Rate_30min` rain and snow (NASA and JAXA)
- `ASTER_GDEM_Color_Index` elevation
- `MODIS_Terra_L3_NDVI_Monthly` vegetation index
- `BlueMarble_ShadedRelief_Bathymetry` the globe picture

Also: [NASA Earth Information Center](https://earth.gov/), NASA SVS
[3912](https://svs.gsfc.nasa.gov/3912/) and [5011](https://svs.gsfc.nasa.gov/5011/) for the
whole-planet records, the [NASA Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html),
and NASA POWER, VIIRS and SRTM for validation only. Country borders and city names are from
[Natural Earth](https://www.naturalearthdata.com/) (public domain), not NASA.

## Run it

```bash
npm install
npm run dev        # the project page, with the app inside it: http://localhost:5173
npm run build      # writes dist/, a plain static site
```

The app alone needs no build step:

```bash
cd public/app && python3 -m http.server 8000   # http://localhost:8000
```

## Where things are

```
src/                    the project page (React + Vite); all its text is in src/content.js
public/app/             the app: plain JavaScript modules, WebGL, Web Audio, no framework
  js/explore.js         pick a country, play it, charts, Mars check, speech
  js/categories.js      the four data types and how each is read from NASA GIBS
  js/audio.js           the sound engine: one voice per data type
  js/science.js         the "How is this calculated?" panel
  js/globe.js           the 3D globe
  js/turntable.js       the whole-planet record
  records/              NASA color tables, country shapes, bundled records
  tools/                Python scripts: data preparation, validation, demo video
  validation/           validation results
public/demo/            the demo video
```

## Use of AI

Claude Code (Anthropic) helped write the code, the data and validation scripts and the project
page. The output was reviewed and edited by the team. All maps are NASA's or screenshots of the
app, and every sound is synthesized live by the app's own code. No AI-generated images, video or
audio are used.

NASA does not endorse this project. No NASA logos are used in the project itself; the linked
participant certificate is NASA's own document.
