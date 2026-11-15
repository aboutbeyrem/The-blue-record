"""Build the lightning record from NASA SVS visualization 5011.

Source: https://svs.gsfc.nasa.gov/5011/
  movie: .../a005011/iss_lightning_sos_yearly_07312023_2048p60.mp4  (flat map, 4096x2048)

First extract two frames per second of the movie, scaled to 1024x512:
  ffmpeg -i movie.mp4 -vf "fps=2,scale=1024:512:flags=area" frames/%04d.png

Usage:
  python build_lightning.py <dir with those frames> <output dir>

The movie has no clock on screen and does not run at a constant speed, so we do
not claim calendar dates. Instead each frame is labelled by storm season, read
from the data itself: lightning sits north of its long-run average latitude in
the northern warm season and south of it in the southern one. The data covers
March 2017 to July 2023, which is seven northern seasons, 2017 to 2023.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
FIRST_YEAR = 2017


def flashes(a):
    """Yellow lightning pixels. Must match eventProfile() in js/reader.js."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 120) & (g > 100) & (r - b > 70) & (g - b > 50)


files = sorted(src.glob("*.png"))
lats = 90 - (np.arange(512) + 0.5) / 512 * 180
centroid, total = [], []
for f in files:
    y = flashes(np.asarray(Image.open(f).convert("RGB")).astype(int))
    rows = y.sum(1)
    n = rows.sum()
    total.append(int(n))
    centroid.append(float((rows * lats).sum() / n) if n > 50 else np.nan)
centroid, total = np.array(centroid), np.array(total)
mean_lat = float(np.nanmean(centroid))
smooth = np.convolve(np.nan_to_num(centroid, nan=mean_lat), np.ones(5) / 5, mode="same")

# Keep one frame per second of movie. The movie fades in over its first seconds
# (the sensor started work in March 2017), so begin once the map has filled in.
start = int(np.argmax(total > 1000))
picks = list(range(start, len(files), 2))

frames, north_seasons, was_north = [], 0, False
for i, idx in enumerate(picks):
    north = smooth[idx] >= mean_lat
    if north and not was_north:
        north_seasons += 1
    was_north = north
    if north:
        year = FIRST_YEAR + north_seasons - 1
        label, short = f"Northern storm season {year}", f"N {year}"
    else:
        y0 = FIRST_YEAR + north_seasons - 1
        label, short = f"Southern storm season {y0}–{str(y0 + 1)[2:]}", f"S {y0}–{str(y0 + 1)[2:]}"
    name = f"{i:03d}.jpg"
    Image.open(files[idx]).convert("RGB").save(out / name, quality=92, subsampling=0)
    frames.append({"file": name, "label": label, "short": short, "movieSecond": idx / 2})

# Loudness reference: a strong step, measured on the files the browser will read.
counts = []
for fr in frames[::3]:
    y = flashes(np.asarray(Image.open(out / fr["file"]).convert("RGB")).astype(int))
    for lat in np.arange(-50, 51, 2.5):
        y0 = int((90 - (lat + 1.25)) / 180 * 512)
        y1 = int(np.ceil((90 - (lat - 1.25)) / 180 * 512))
        band = y[y0:y1]
        for b in range(48):
            n = int(band[:, b * 1024 // 48:(b + 1) * 1024 // 48].sum())
            if n:
                counts.append(n)
event_ref = int(np.percentile(counts, 97))

(out / "data.json").write_text(json.dumps({
    "size": [1024, 512],
    "frames": frames,
    "eventRef": event_ref,
    "meanLatitude": round(mean_lat, 1),
}, indent=1))
print(f"wrote {len(frames)} frames; {north_seasons} northern seasons; "
      f"mean latitude {mean_lat:.1f}; eventRef {event_ref}")
print("labels:", [f["short"] for f in frames[::6]])
