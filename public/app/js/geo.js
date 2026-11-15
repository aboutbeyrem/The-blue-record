// Rough place names for "Where am I?". These are coarse boxes, good enough to
// say "North Atlantic" or "Africa", not for navigation.

/** Longitude of the line between the Pacific and the Atlantic in the Americas. */
function americasDivide(lat) {
  if (lat >= 18) return -98;
  if (lat >= 9) return -84 - (lat - 9) * 1.5;
  return -70;
}

export function oceanName(lat, lon) {
  if (lat >= 66) return 'the Arctic Ocean';
  if (lat <= -60) return 'the Southern Ocean';
  if (lat >= 30 && lat <= 46 && lon >= -6 && lon <= 36) return 'the Mediterranean Sea';
  if (lat >= 18 && lat <= 31 && lon >= -98 && lon <= -81) return 'the Gulf of Mexico';
  if (lat >= 9 && lat <= 22 && lon >= -88 && lon <= -60) return 'the Caribbean Sea';
  const half = lat >= 0 ? 'North' : 'South';
  const west = americasDivide(lat);
  if (lon >= west && lon < 20) return `the ${half} Atlantic`;
  const indianEast = lat < -10 ? 147 : 100;
  if (lon >= 20 && lon < indianEast && lat < 30) return 'the Indian Ocean';
  return `the ${half} Pacific`;
}

export function landName(lat, lon) {
  if (lat <= -60) return 'Antarctica';
  if (lat >= 59 && lon >= -74 && lon <= -11) return 'Greenland';
  if (lat >= -45 && lat <= -10 && lon >= 112 && lon <= 155) return 'Australia';
  if (lat >= -56 && lat <= 13 && lon >= -82 && lon <= -34) return 'South America';
  if (lat >= 7 && lon >= -170 && lon <= -52) return 'North America';
  if (lat >= 36 && lon >= -11 && lon <= 40) return 'Europe';
  if (lat >= -35 && lat <= 37 && lon >= -18 && lon <= 52) return 'Africa';
  if (lat >= 1 && (lon >= 40 || lon <= -168)) return 'Asia';
  return 'land';
}

export function fmtLat(lat) {
  const a = Math.abs(lat);
  const n = Number.isInteger(a) ? a : a.toFixed(1);
  return `${n}° ${lat >= 0 ? 'N' : 'S'}`;
}

export function sayLat(lat) {
  return `${Math.abs(lat)} degrees ${lat >= 0 ? 'north' : 'south'}`;
}

export function fmtLon(lon) {
  const a = Math.round(Math.abs(lon));
  if (a === 0) return '0°';
  return `${a}° ${lon >= 0 ? 'E' : 'W'}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** "2007-06-19" -> "19 June 2007"; "2019-07" -> "July 2019". */
export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return d ? `${d} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

export function shortDate(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** Wrap a longitude into -180..180. */
export function wrapLon(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}
