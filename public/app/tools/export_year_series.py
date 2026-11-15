"""Export the average sea temperature around one latitude, frame by frame.

This is the curve the app's drone and "This latitude through time" chart
follow. The project website uses it for its short "hear a year" player.

The reading is the same as js/reader.js: a 2.5-degree band, 48 steps of
7.5 degrees of longitude, color -> degrees through NASA's colorbar, a step
counts as water when at least 25% of its readable pixels are colored, and the
latitude mean is weighted by how much of each step is water.

Usage: python export_year_series.py <records/sst dir> <output json> [lat ...]
Default latitudes: 37.5 (Tunis) and -27.5 (its southern mirror for the demo).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
lats = [float(v) for v in sys.argv[3:]] or [37.5, -27.5]
data = json.loads((src / "data.json").read_text())
lut = data["lut"]
LUT = np.array(lut["values"])
BINS, BAND_HALF = 48, 1.25


def latitude_mean(a, lat):
    h, w, _ = a.shape
    y0 = max(0, int(np.floor((90 - (lat + BAND_HALF)) / 180 * h)))
    y1 = min(h, int(np.ceil((90 - (lat - BAND_HALF)) / 180 * h)))
    band = a[y0:max(y0 + 1, y1)]
    total = weight = 0.0
    for b in range(BINS):
        px = band[:, b * w // BINS:(b + 1) * w // BINS].reshape(-1, 3)
        r, g, bl = px[:, 0], px[:, 1], px[:, 2]
        mx, mn = px.max(1), px.min(1)
        ok = mx >= 25
        sat = np.where(ok, (mx - mn) / np.maximum(mx, 1), 0)
        land = ok & (sat <= 0.18) & (mx > 30)
        col = ok & (sat > 0.3)
        d = np.maximum(mx - mn, 1e-9)
        hue = np.where(mx == r, ((g - bl) / d) % 6,
                       np.where(mx == g, (bl - r) / d + 2, (r - g) / d + 4)) * 60
        hue = np.where(hue < 0, hue + 360, hue)
        hue = np.where(hue > 300, hue - 360, hue)
        col &= (hue >= lut["hueMin"]) & (hue <= lut["hueMax"])
        n_col, n_land = int(col.sum()), int(land.sum())
        if not n_col or n_col / (n_col + n_land) < 0.25:
            continue
        cover = n_col / (n_col + n_land)
        idx = np.clip(np.floor(hue[col] - lut["hueMin"] + 0.5).astype(int), 0, len(LUT) - 1)
        wgt = (sat * mx)[col]
        total += float((LUT[idx] * wgt).sum() / wgt.sum()) * cover
        weight += cover
    return round(total / weight, 2) if weight else None


frames = [np.asarray(Image.open(src / f["file"]).convert("RGB")).astype(float) for f in data["frames"]]
series = []
for lat in lats:
    values = [latitude_mean(a, lat) for a in frames]
    series.append({"lat": lat, "values": values})
    known = [v for v in values if v is not None]
    print(f"lat {lat:+.1f}: {min(known):.1f} to {max(known):.1f} C over {len(values)} frames")

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({
    "source": "NASA SVS 3912, read with the Blue Record method (tools/export_year_series.py)",
    "unit": "°C",
    "dates": [f["date"] for f in data["frames"]],
    "series": series,
}, indent=1, ensure_ascii=False))
