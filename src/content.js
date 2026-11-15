// Every word on the page lives here. Edit this file, not the components.

export const project = {
  name: 'The Blue Record',
  line: 'Hear the planet.',
  pitch: 'Spin the globe, pick a country, and hear what NASA’s satellites see there, live.',
  event: 'NASA Space Apps Challenge · Tunis 2026',
  members: [],
  challenge: 'The Earth Information Jukebox',
  challengeUrl: 'https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/',
};

export const sections = [
  { id: 'play', label: 'Play' },
  { id: 'summary', label: 'Summary' },
  { id: 'demo', label: 'Demo' },
  { id: 'project', label: 'Project link' },
  { id: 'details', label: 'Details' },
  { id: 'ai', label: 'Use of AI' },
  { id: 'nasa-data', label: 'NASA data' },
  { id: 'references', label: 'References' },
];

// 1. High-level summary (the form asks for 50 to 200 words).
export const summary = {
  paragraphs: [
    'The Blue Record turns NASA’s live Earth data into sound, one country at a time. Spin a 3D globe and pick a country. Choose what to hear: temperature, rain, the height of the land, or greenness. The app asks NASA’s imagery service for that country, fetches the newest maps, and looks up every pixel in NASA’s own color table to get a real value.',
    'A scan line then sweeps the country from west to east as one tone. Higher and louder means hotter, wetter, higher or greener, and silence means no reading. Each pass moves time forward to NASA’s newest map. “What did I hear?” says the hottest and coolest places and how the data changed, and “Where am I?” names the nearest city. When the data matches Mars, a chime rings.',
    'It answers the Earth Information Jukebox challenge: NASA data made audible, for people who cannot see a map. We checked all five data types against a second source and publish the errors, including the bad ones.',
  ],
  facts: [
    { value: '242', label: 'countries you can pick' },
    { value: '4', label: 'live NASA data types' },
    { value: '5 of 5', label: 'data types checked against a second source' },
  ],
};

// 2. Project demo: ONE public link. A deck of 7 slides at most (the title
// slide counts) OR a video of 30 seconds at most.
export const demo = {
  // The demo is the 25-second video hosted on this site, so the link needs no login.
  kind: 'video',
  url: './demo/blue-record-demo.mp4',
  poster: './demo/poster.jpg',
  length: '25 seconds',
  plan: {
    title: 'The 30-second video we are recording',
    beats: [
      { time: '0:00', text: 'Black screen. “Close your eyes.” The sound starts.' },
      { time: '0:03', text: 'The 3D globe spins. A click picks Tunisia, and it glows.' },
      { time: '0:08', text: 'Pick “Temperature”. “Asking NASA…” then Tunisia appears in NASA’s colors, with yesterday’s date.' },
      { time: '0:13', text: 'The scan line sweeps the country. Higher and louder means hotter. Press W: “You are in Tunisia, near Tunis.”' },
      { time: '0:20', text: 'Switch to Greenness. The desert in the south rings the Mars chime.' },
      { time: '0:26', text: '“So everyone can hear their country.” Link to the prototype.' },
    ],
    note: 'English captions are burned in, so the video works muted and for deaf viewers.',
  },
};

// 3. Final project link: where judges can open the project.
export const projectLinks = [
  {
    title: 'Live prototype',
    text: 'The working app, the same one you can play at the top of this page. Runs in any modern browser, on a laptop or a phone. No login, no install.',
    url: './app/index.html',
    action: 'Open it full screen',
  },
  {
    title: 'Source code',
    text: 'The app, the scripts that prepare NASA frames, the accuracy check and this page.',
    url: 'https://github.com/aboutbeyrem/The-blue-record',
    action: 'View on GitHub',
  },
];

// 4. Project details.
export const details = {
  steps: [
    {
      title: 'A 3D globe',
      text: 'NASA’s Blue Marble image is drawn on a spinning globe in WebGL. Country borders come from Natural Earth, so you can click any of 242 countries, search for one, or use your location.',
    },
    {
      title: 'Ask NASA, live',
      text: 'For the country you pick, the app asks NASA’s Global Imagery Browse Services for a map of just that area, at NASA’s newest date, plus twelve earlier dates. No key and no login.',
    },
    {
      title: 'Color back into data',
      text: 'NASA publishes a table for each layer that says which color means which value. Every pixel is looked up in it: degrees, millimetres of rain per hour, metres of height, or a greenness index.',
    },
    {
      title: 'A scan line crosses the country',
      text: 'The line sweeps west to east in 64 steps. Pixels outside the country are cut away using its real border. You choose the line’s latitude, and each pass moves time forward.',
    },
    {
      title: 'Data into sound',
      text: 'Each data type has its own voice. Temperature is a warm tone that brightens as it gets hotter. Rain patters, with more drops when it pours. Height of the land is a deep organ tone over a rumble. Greenness is an airy pad with bird-like chirps where it is lush. All of them glide with the value and go silent where there is no reading. Sound moves from the left ear to the right as the line moves west to east.',
    },
    {
      title: 'Where am I, and Mars',
      text: '“Where am I?” says the country, the nearest city and the value. When the data matches Mars, for example ground as barren as Mars or a place as cold as its average day, a chime rings.',
    },
  ],
  validation: {
    title: 'We checked that the sound tells the truth.',
    text: 'For all five data types we read the value exactly as the app does and compared it with a second, independent NASA dataset or satellite at the same place and time. We publish the errors, including the bad ones.',
    rows: [
      ['Sea temperature', '0.3 °C off'],
      ['Height of the land', '7.5 m off (median)'],
      ['Greenness', 'correlation 0.91'],
      ['Land temperature', '3.4 °C off'],
      ['Rain', 'correlation 0.42, weakest'],
    ],
    limits: [
      'Sea temperature vs MERRA-2: 108 comparisons, average error 0.28 °C, correlation 0.999. Height vs SRTM: 70 comparisons, median error 7.5 m, correlation 0.996. Greenness vs a second satellite (VIIRS): 228 comparisons, correlation 0.91.',
      'Land temperature is the ground itself at about 10:30 in the morning, not the air. It reads 2.2 °C cooler than MERRA-2 at that hour (124 comparisons, correlation 0.89). NASA’s afternoon satellite reads up to 10 °C hotter in the same place, so the time of day matters.',
      'Rain is our weakest result: against MERRA-2 daily rainfall (106 comparisons) the correlation is only 0.42, and they agreed on wet or dry 62% of the time. Treat rain as a rough guide.',
      'Greenness is checked by two satellites agreeing, which shows consistency, not truth. Over ice, NASA’s height data has spikes, so Antarctica’s highest values are unreliable.',
      'The saved 2007 ocean record was checked too: 1,980 comparisons, 0.68 °C average error.',
    ],
  },
  benefits: [
    {
      title: 'Data you can hear',
      text: 'Blind and low-vision people can explore NASA Earth data by ear, by voice and by keyboard, not through a description of a chart.',
    },
    {
      title: 'Honest by design',
      text: 'Every note comes from a pixel of a NASA frame, and we published how accurate that reading is.',
    },
    {
      title: 'Nothing to install',
      text: 'A web page. It runs on a school laptop or a phone, and Android phones vibrate with the data.',
    },
    {
      title: 'Always current',
      text: 'The live records ask NASA for its newest data each time, so the record you play tomorrow is not the one you played today.',
    },
  ],
  tools: [
    { group: 'The app', items: ['JavaScript', 'Web Audio API', 'WebGL', 'Canvas', 'Web Speech API', 'HTML and CSS'] },
    { group: 'Data preparation and checks', items: ['Python', 'Pillow', 'NumPy', 'FFmpeg', 'NASA POWER API'] },
    { group: 'Testing', items: ['Playwright, headless Chromium'] },
    { group: 'This page', items: ['React', 'Vite', 'Lucide icons'] },
  ],
};

// 5. Use of AI ("SI" on the submission form).
export const aiUse = {
  used: [
    {
      tool: 'Claude Code (Anthropic)',
      where: 'Helped write the app code, the data-preparation and accuracy-check scripts, and this page. Helped draft the text, which the team reviewed and edited.',
    },
  ],
  notUsed: 'No AI-generated images, video or audio. Every image is NASA’s or a screenshot of our own app, and every sound is synthesized live by our code.',
  watermark: 'Because there is no AI-generated media, there is nothing to watermark. If we add any, it will carry a visible “AI-generated” label.',
};

// 6. NASA data: at least one NASA resource, and how it was used.
export const nasaData = [
  {
    name: 'MODIS Land Surface Temperature, 8-day average (Terra)',
    id: 'GIBS · live',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    from: 'NASA Global Imagery Browse Services; data from the MODIS instrument on NASA’s Terra satellite',
    used: 'Pulled live for the Temperature category: the country’s land, newest 8-day map and twelve earlier ones, read with NASA’s published color table.',
    listed: false,
  },
  {
    name: 'Sea Surface Temperature (L4, MUR, GHRSST)',
    id: 'GIBS · live',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    from: 'NASA Global Imagery Browse Services; data from the MUR analysis, NASA JPL',
    used: 'Pulled live for the Temperature category: the sea around coastal countries. Also the whole-planet record “The Ocean, Latest”.',
    listed: false,
  },
  {
    name: 'Precipitation Rate, 30-minute average (IMERG)',
    id: 'GIBS · live',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    from: 'NASA Global Imagery Browse Services; data from the Global Precipitation Measurement mission, NASA and JAXA',
    used: 'Pulled live for the Rain category: the newest half hour and the 24 hours before it, over land and sea.',
    listed: false,
  },
  {
    name: 'Digital Elevation Model (Color Index, ASTER, Terra)',
    id: 'GIBS',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    from: 'NASA Global Imagery Browse Services; data from ASTER GDEM, NASA and Japan’s METI',
    used: 'Pulled from NASA for the Height of the land category.',
    listed: false,
  },
  {
    name: 'MODIS Vegetation Index (NDVI), monthly (Terra)',
    id: 'GIBS · live',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    from: 'NASA Global Imagery Browse Services; data from the MODIS instrument on NASA’s Terra satellite',
    used: 'Pulled live for the Greenness category: thirteen months up to the newest. Bare ground reads 0.1 or less.',
    listed: false,
  },
  {
    name: 'Blue Marble: Shaded Relief and Bathymetry',
    id: 'GIBS',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    from: 'NASA Earth Observatory, through GIBS',
    used: 'The picture of the Earth on the 3D globe.',
    listed: false,
  },
  {
    name: 'NASA Earth Information Center',
    id: 'EIC',
    url: 'https://earth.gov/',
    from: 'NASA, the home of the Earth Information Jukebox challenge',
    used: 'The challenge’s own resource. It shows NASA’s view of the Earth, and we link to it from the app. Our readings come from the NASA GIBS layers listed here.',
    listed: true,
  },
  {
    name: 'Global Sea Surface Currents and Temperature',
    id: 'SVS 3912',
    url: 'https://svs.gsfc.nasa.gov/3912/',
    from: 'NASA Scientific Visualization Studio, from the ECCO2 ocean model (MIT/JPL)',
    used: '36 frames from March 2007 to February 2008, used by the whole-planet record “The Warm Current”.',
    listed: true,
  },
  {
    name: 'Lightning Events Detected from the International Space Station (ISS) 2017–2023',
    id: 'SVS 5011',
    url: 'https://svs.gsfc.nasa.gov/5011/',
    from: 'NASA Scientific Visualization Studio, from the Lightning Imaging Sensor on the ISS',
    used: '91 frames, used by the whole-planet record “Thunder Season”.',
    listed: true,
  },
  {
    name: 'NASA POWER daily API: Earth Skin Temperature',
    id: 'MERRA-2',
    url: 'https://power.larc.nasa.gov/',
    from: 'NASA Langley Research Center, from the MERRA-2 reanalysis (NASA GMAO)',
    used: 'Independent check of the temperatures our method reads from colors: 1,980 comparisons.',
    listed: false,
  },
  {
    name: 'Mars Fact Sheet',
    id: 'NSSDCA',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
    from: 'NASA Space Science Data Coordinated Archive',
    used: 'Mars’s average temperature, −63 °C, for the Mars chime.',
    listed: false,
  },
];

// 7. References: space agency data (optional) and every source used.
export const references = [
  {
    group: 'Space agency data',
    items: [
      { text: 'NASA GIBS: live imagery and published color tables for MODIS land temperature, MUR sea temperature, IMERG rain, ASTER elevation, MODIS NDVI and Blue Marble', url: 'https://nasa-gibs.github.io/gibs-api-docs/' },
      { text: 'NASA Earth Information Center, the home of the Earth Information Jukebox challenge', url: 'https://earth.gov/' },
      { text: 'NASA SVS 3912, Global Sea Surface Currents and Temperature', url: 'https://svs.gsfc.nasa.gov/3912/' },
      { text: 'NASA SVS 5011, Lightning Events Detected from the ISS 2017–2023', url: 'https://svs.gsfc.nasa.gov/5011/' },
      { text: 'NASA POWER hourly and daily APIs: Earth Skin Temperature and corrected rainfall (MERRA-2), used only to check our readings', url: 'https://power.larc.nasa.gov/' },
      { text: 'SRTM elevation (NASA and NGA), through the Open-Elevation service, used only to check our height readings', url: 'https://www.open-elevation.com/' },
      { text: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
      { text: 'NASA Earth Observatory, Measuring Vegetation (NDVI)', url: 'https://earthobservatory.nasa.gov/features/MeasuringVegetation' },
      { text: 'IMERG comes from the Global Precipitation Measurement mission, run jointly by NASA and JAXA.' },
    ],
  },
  {
    group: 'Other data',
    items: [
      { text: 'Natural Earth: country borders, sea names and populated places, public domain', url: 'https://www.naturalearthdata.com/' },
    ],
  },
  {
    group: 'Code',
    items: [
      { text: 'React, MIT license', url: 'https://react.dev/' },
      { text: 'Vite, MIT license', url: 'https://vite.dev/' },
      { text: 'Lucide icons, ISC license', url: 'https://lucide.dev/' },
      { text: 'Pillow, MIT-CMU license', url: 'https://python-pillow.org/' },
      { text: 'NumPy, BSD license', url: 'https://numpy.org/' },
      { text: 'FFmpeg, via imageio-ffmpeg', url: 'https://ffmpeg.org/' },
      { text: 'Playwright, Apache 2.0 license', url: 'https://playwright.dev/' },
      { text: 'Browser APIs: Web Audio, WebGL, Canvas, Web Speech, documented on MDN', url: 'https://developer.mozilla.org/' },
    ],
  },
  {
    group: 'Text and fonts',
    items: [
      { text: 'Challenge statement: The Earth Information Jukebox', url: 'https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/' },
      { text: 'Dataset descriptions paraphrased from the NASA pages above' },
      { text: 'Inter typeface, SIL Open Font License', url: 'https://rsms.me/inter/' },
    ],
  },
  {
    group: 'Images',
    items: [
      { text: 'The globe picture and all maps: NASA, through GIBS and the Scientific Visualization Studio' },
      { text: 'Pictures on this page: screenshots of our own app' },
    ],
  },
];
