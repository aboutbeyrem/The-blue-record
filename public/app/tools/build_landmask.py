"""Build a 1-degree land mask from the sea-temperature record.

In NASA SVS 3912 the land is drawn in neutral grey and the ocean in color, so
a pixel that is grey in every frame we check is land. The mask is used by the
lightning record, whose own map is too dark to tell rainforest from sea.

Usage: python build_landmask.py <records/sst dir> <output json>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
votes = None
picks = ["000.jpg", "012.jpg", "024.jpg"]
for name in picks:
    a = np.asarray(Image.open(src / name).convert("RGB")).astype(float)
    mx, mn = a.max(2), a.min(2)
    grey = ((mx - mn) / np.maximum(mx, 1) <= 0.18) & (mx > 30)
    votes = grey.astype(int) if votes is None else votes + grey
land = votes == len(picks)

h, w = land.shape
rows = []
for lat_i in range(180):
    y0, y1 = int(lat_i * h / 180), int((lat_i + 1) * h / 180)
    row = ""
    for lon_i in range(360):
        x0, x1 = int(lon_i * w / 360), int((lon_i + 1) * w / 360)
        row += "1" if land[y0:y1, x0:x1].mean() > 0.5 else "0"
    rows.append(row)
out.write_text(json.dumps({
    "note": "1 = land. Row 0 is 90N to 89N; column 0 is 180W to 179W.",
    "rows": rows}))
print("land share:", round(sum(r.count("1") for r in rows) / (360 * 180), 3))
