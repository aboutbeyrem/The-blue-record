"""Check the temperatures the app recovers from colors against independent data.

For a grid of open-ocean points and every frame of the sea-temperature record,
this reads the temperature exactly the way js/reader.js does (same band, same
7.5-degree step, same color lookup) and compares it with NASA POWER's daily
"Earth Skin Temperature" (TS) for the same place and day. POWER takes TS from
the MERRA-2 reanalysis, where the ocean surface follows observed sea surface
temperature. It is a different product from the ECCO2 model that NASA drew, so
part of any difference is the two products disagreeing, not our color reading.

Usage: python validate_sst.py <records/sst dir> <output dir>
Needs Pillow, numpy and curl. Writes sst_vs_merra2.csv and summary.json.
"""
import csv
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
data = json.loads((src / "data.json").read_text())
lut = data["lut"]
BINS, BAND_HALF = 48, 1.25


def read_step(a, lat, b):
    """Port of valueProfile() in js/reader.js for one step. Returns (value, cover)."""
    h, w, _ = a.shape
    y0 = max(0, int(np.floor((90 - (lat + BAND_HALF)) / 180 * h)))
    y1 = min(h, int(np.ceil((90 - (lat - BAND_HALF)) / 180 * h)))
    px = a[y0:max(y0 + 1, y1), b * w // BINS:(b + 1) * w // BINS].reshape(-1, 3)
    r, g, bl = px[:, 0], px[:, 1], px[:, 2]
    mx, mn = px.max(1), px.min(1)
    ok = mx >= 25
    sat = np.where(ok, (mx - mn) / np.maximum(mx, 1), 0)
    land = ok & (sat <= 0.18) & (mx > 30)
    col = ok & (sat > 0.3)
    d = np.maximum(mx - mn, 1e-9)
    hue = np.where(mx == r, ((g - bl) / d) % 6, np.where(mx == g, (bl - r) / d + 2, (r - g) / d + 4)) * 60
    hue = np.where(hue < 0, hue + 360, hue)
    hue = np.where(hue > 300, hue - 360, hue)
    col &= (hue >= lut["hueMin"]) & (hue <= lut["hueMax"])
    n_col, n_land = int(col.sum()), int(land.sum())
    if n_col + n_land == 0:
        return None, 0.0
    cover = n_col / (n_col + n_land)
    if not n_col or cover < 0.25:
        return None, cover
    idx = np.clip(np.floor(hue[col] - lut["hueMin"] + 0.5).astype(int), 0, len(lut["values"]) - 1)
    t = np.array(lut["values"])[idx]
    wgt = (sat * mx)[col]
    return float((t * wgt).sum() / wgt.sum()), cover


frames = [np.asarray(Image.open(src / f["file"]).convert("RGB")).astype(float) for f in data["frames"]]
dates = [f["date"].replace("-", "") for f in data["frames"]]

rows = []
for lat in (-45, -30, -15, 0, 15, 30, 45):
    for b in range(0, BINS, 4):
        lon = -180 + (b + 0.5) * 360 / BINS
        ours = [read_step(a, lat, b) for a in frames]
        if any(v is None or c < 0.95 for v, c in ours):
            continue                      # keep open ocean only
        url = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=TS&community=RE"
               f"&longitude={lon}&latitude={lat}&start={dates[0]}&end={dates[-1]}&format=JSON")
        res = subprocess.run(["curl", "-s", "-m", "60", url], capture_output=True, text=True)
        try:
            ts = json.loads(res.stdout)["properties"]["parameter"]["TS"]
        except Exception:
            print("no answer for", lat, lon)
            continue
        for (v, _), day, fr in zip(ours, dates, data["frames"]):
            ref = ts.get(day, -999)
            if ref > -900:
                rows.append({"lat": lat, "lon": lon, "date": fr["date"],
                             "recovered_c": round(v, 2), "merra2_ts_c": ref})
    print("latitude", lat, "done,", len(rows), "pairs so far")

with open(out / "sst_vs_merra2.csv", "w", newline="") as f:
    wr = csv.DictWriter(f, fieldnames=list(rows[0]))
    wr.writeheader()
    wr.writerows(rows)

ours = np.array([r["recovered_c"] for r in rows])
ref = np.array([r["merra2_ts_c"] for r in rows])
diff = ours - ref
summary = {
    "pairs": len(rows),
    "points": len({(r["lat"], r["lon"]) for r in rows}),
    "dates": len(dates),
    "bias_c": round(float(diff.mean()), 2),
    "mean_abs_error_c": round(float(np.abs(diff).mean()), 2),
    "rmse_c": round(float(np.sqrt((diff ** 2).mean())), 2),
    "correlation_r": round(float(np.corrcoef(ours, ref)[0, 1]), 3),
    "within_1c_share": round(float((np.abs(diff) <= 1).mean()), 3),
    "within_2c_share": round(float((np.abs(diff) <= 2).mean()), 3),
    "reference": "NASA POWER daily TS (Earth Skin Temperature), from MERRA-2",
}
(out / "summary.json").write_text(json.dumps(summary, indent=1))
print(json.dumps(summary, indent=1))
for lat in sorted({r["lat"] for r in rows}):
    d = np.array([r["recovered_c"] - r["merra2_ts_c"] for r in rows if r["lat"] == lat])
    print(f"  lat {lat:>4}: n={len(d):4d}  bias {d.mean():+.2f}  mae {np.abs(d).mean():.2f}")
