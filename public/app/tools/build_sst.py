"""Build the sea-surface-temperature record from NASA SVS visualization 3912.

Source: https://svs.gsfc.nasa.gov/3912/  (Global Sea Surface Currents and Temperature)
  frames:   .../a003912/frames/2048x1024_1x1_30p/orig/flat_global_ecco2_2028x1024.<n>.tif
  dates:    .../a003912/flat_ecco2_dates.txt
  colorbar: .../a003912/sst_ecco2_cbar.png   (0 to 32 degrees C, linear)

Usage:
  python build_sst.py <dir with downloaded .tif frames, dates.txt and cbar.png> <output dir>

Needs Pillow and numpy. Writes NNN.jpg (1024x512), colorbar.png and data.json.
The colorbar is turned into a hue -> temperature lookup table, which is what
lets the app convert a pixel's color back into degrees.
"""
import colorsys
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

# --- colorbar -> hue lookup table -------------------------------------------
cb = np.asarray(Image.open(src / "cbar.png").convert("RGB")).astype(float)
X0, X1 = 14, 291          # first and last column of the gradient
T_MIN, T_MAX = 0.0, 32.0  # labels printed on the colorbar
hues, temps = [], []
for x in range(X0, X1 + 1):
    r, g, b = cb[40:55, x].mean(0) / 255
    h = colorsys.rgb_to_hsv(r, g, b)[0] * 360
    if h > 300:            # the red end wraps past 0 degrees of hue
        h -= 360
    hues.append(h)
    temps.append(T_MIN + (T_MAX - T_MIN) * (x - X0) / (X1 - X0))
hues, temps = np.array(hues), np.array(temps)
order = np.argsort(hues)
HUE_MIN, HUE_MAX = -10, 235
grid = np.arange(HUE_MIN, HUE_MAX + 1)
lut = np.interp(grid, hues[order], temps[order])

# --- frames -----------------------------------------------------------------
dates = {}
for line in (src / "dates.txt").read_text().split("\n"):
    parts = line.split()
    if len(parts) == 2:
        dates[int(parts[0])] = parts[1]

frames = []
tifs = sorted((src / "sst_tif").glob("*.tif"), key=lambda p: int(p.stem))
for i, tif in enumerate(tifs):
    n = int(tif.stem)
    im = Image.open(tif).convert("RGB").resize((1024, 512), Image.LANCZOS)
    name = f"{i:03d}.jpg"
    # subsampling=0 keeps full color resolution, which matters for the hue lookup
    im.save(out / name, quality=88, subsampling=0)
    frames.append({"file": name, "date": dates[n][:10], "svsFrame": n})

shutil.copy(src / "cbar.png", out / "colorbar.png")
(out / "data.json").write_text(json.dumps({
    "size": [1024, 512],
    "frames": frames,
    "lut": {"hueMin": HUE_MIN, "hueMax": HUE_MAX,
            "values": [round(float(v), 2) for v in lut]},
    "valueMin": T_MIN, "valueMax": T_MAX,
}, indent=1))
print(f"wrote {len(frames)} frames, {frames[0]['date']} to {frames[-1]['date']}")
