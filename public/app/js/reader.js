// Reads a latitude band out of a NASA frame and turns pixels back into data.
//
// Frames are plain global maps: x runs from 180 W to 180 E, y from 90 N to 90 S.
// For one latitude we cut the band into BINS equal steps of longitude and report,
// for each step, what the pixels say.

export const BINS = 48;                 // steps per trip around the planet
export const BIN_DEG = 360 / BINS;      // 7.5 degrees of longitude each
const BAND_HALF = 1.25;                 // the needle is 2.5 degrees of latitude wide

export class Reader {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.cache = new Map();
  }

  clear() { this.cache.clear(); }

  /** Rows of the frame covered by the needle at this latitude. */
  bandRows(lat, h) {
    const y0 = Math.max(0, Math.floor((90 - (lat + BAND_HALF)) / 180 * h));
    const y1 = Math.min(h, Math.ceil((90 - (lat - BAND_HALF)) / 180 * h));
    return [y0, Math.max(y0 + 1, y1)];
  }

  /**
   * Profile of one latitude in one frame: an array of BINS steps from west to
   * east, plus a summary. Cached, because the same band is read many times.
   */
  profile(record, data, frameIndex, img, lat) {
    const key = `${record.id}|${frameIndex}|${lat}`;
    let p = this.cache.get(key);
    if (p) return p;

    const w = img.naturalWidth, h = img.naturalHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    const [y0, y1] = this.bandRows(lat, h);
    this.ctx.clearRect(0, y0, w, y1 - y0);          // live maps are transparent where there is no data
    this.ctx.drawImage(img, 0, y0, w, y1 - y0, 0, y0, w, y1 - y0);
    const px = this.ctx.getImageData(0, y0, w, y1 - y0).data;
    const rows = y1 - y0;

    if (record.live) p = exactProfile(px, w, rows, data.lookup, record.minCover ?? 0.25);
    else if (record.kind === 'value') p = valueProfile(px, w, rows, data.lut);
    else p = eventProfile(px, w, rows, lat, data.landMask);
    this.cache.set(key, p);
    return p;
  }
}

/**
 * Live NASA GIBS maps: every data pixel is one of the colors in NASA's
 * published table for the layer, so the lookup is exact. Transparent pixels
 * carry no data (land on an ocean map, sea on a land map, dry sky on a rain map).
 */
function exactProfile(px, w, rows, lookup, minCover) {
  const steps = [];
  let sum = 0, weight = 0, valued = 0;
  for (let b = 0; b < BINS; b++) {
    const xa = Math.floor(b * w / BINS), xb = Math.floor((b + 1) * w / BINS);
    let count = 0, total = 0, acc = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4;
        total++;
        if (px[i + 3] < 128) continue;
        const v = lookup.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
        if (v === undefined) continue;
        acc += v; count++;
      }
    }
    const cover = total ? count / total : 0;
    const value = count && cover >= minCover ? acc / count : null;
    steps.push({ value, cover });
    if (value !== null) { sum += value * cover; weight += cover; valued++; }
  }
  return { steps, mean: weight ? sum / weight : null, share: valued / BINS };
}

/** Color -> value, using the lookup table built from NASA's colorbar. */
function valueProfile(px, w, rows, lut) {
  const steps = [];
  let sum = 0, weight = 0, oceanSteps = 0;
  for (let b = 0; b < BINS; b++) {
    const xa = Math.floor(b * w / BINS), xb = Math.floor((b + 1) * w / BINS);
    let colored = 0, land = 0, tw = 0, tsum = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4;
        const r = px[i], g = px[i + 1], bl = px[i + 2];
        const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
        if (mx < 25) continue;                    // too dark to say anything
        const sat = (mx - mn) / mx;
        if (sat <= 0.18) { if (mx > 30) land++; continue; }  // grey = land
        if (sat <= 0.3) continue;                 // in between: skip
        const d = mx - mn;
        let hue;
        if (mx === r) hue = ((g - bl) / d) % 6;
        else if (mx === g) hue = (bl - r) / d + 2;
        else hue = (r - g) / d + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
        if (hue > 300) hue -= 360;                // reds wrap around zero
        if (hue < lut.hueMin || hue > lut.hueMax) continue;
        const t = lut.values[Math.round(hue - lut.hueMin)];
        const wgt = sat * mx;                     // trust vivid pixels more
        tsum += t * wgt; tw += wgt; colored++;
      }
    }
    const seen = colored + land;
    const cover = seen ? colored / seen : 0;      // share of the step that is water
    const value = colored && cover >= 0.25 ? tsum / tw : null;
    steps.push({ value, cover });
    if (value !== null) { sum += value * cover; weight += cover; oceanSteps++; }
  }
  return {
    steps,
    mean: weight ? sum / weight : null,
    share: oceanSteps / BINS,                     // how much of the trip is water
  };
}

/**
 * Yellow flash pixels -> counts. The lightning map is too dark to tell forest
 * from sea, so land comes from a 1-degree mask made from the ocean frames.
 */
function eventProfile(px, w, rows, lat, mask) {
  const steps = [];
  let total = 0, peak = 0;
  const maskRow = mask ? mask[Math.min(179, Math.max(0, Math.floor(90 - lat)))] : null;
  for (let b = 0; b < BINS; b++) {
    const xa = Math.floor(b * w / BINS), xb = Math.floor((b + 1) * w / BINS);
    let hits = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4;
        const r = px[i], g = px[i + 1], bl = px[i + 2];
        if (r > 120 && g > 100 && r - bl > 70 && g - bl > 50) hits++;
      }
    }
    let land = false;
    if (maskRow) {
      let n = 0;
      const c0 = Math.round(b * BIN_DEG), c1 = Math.round((b + 1) * BIN_DEG);
      for (let c = c0; c < c1; c++) if (maskRow[c] === '1') n++;
      land = n > (c1 - c0) / 2;
    }
    steps.push({ value: hits, land });
    total += hits; if (hits > peak) peak = hits;
  }
  return { steps, mean: total, peak, share: null };
}
