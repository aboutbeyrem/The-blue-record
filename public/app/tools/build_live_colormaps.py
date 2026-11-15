"""Turn NASA GIBS colormaps into the small lookup tables the live records use.

NASA's Global Imagery Browse Services (GIBS) publishes, for every data layer,
the exact table that says which color stands for which value. We bundle those
tables so the app can turn a pixel of a live GIBS image back into a number
without guessing.

  https://gibs.earthdata.nasa.gov/colormaps/v1.3/<name>.xml

Usage: python build_live_colormaps.py <dir with downloaded .xml files> <output dir>
"""
import json
import re
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

# colormap file -> (output name, which <ColorMap title="..."> blocks hold data)
MAPS = {
    "GHRSST_Sea_Surface_Temperature": ("sst", ["Sea Surface Temperature"]),
    "GPM_Precipitation_Rate": ("rain", ["Rain Rate", "Snow Rate"]),
    "ASTER_GDEM_Color_Index": ("elevation", ["Elevation"]),
    "MODIS_Land_Surface_Temp": ("lst", ["Land Surface Temperature"]),   # values in kelvin
    "MODIS_L3_NDVI": ("ndvi", ["Vegetation Indices"]),
}


def bound(text):
    return None if "INF" in text else float(text)


for name, (short, titles) in MAPS.items():
    xml = (src / f"cm_{name}.xml").read_text(encoding="utf-8")
    entries, units = [], None
    for block in re.findall(r"<ColorMap .*?</ColorMap>", xml, re.S):
        title = re.search(r'title="([^"]*)"', block).group(1)
        if title not in titles:
            continue
        m = re.search(r'units="([^"]*)"', block)
        units = m.group(1) if m else "index"      # the vegetation index has no unit
        for e in re.findall(r"<ColorMapEntry [^>]*>", block):
            if 'transparent="true"' in e or "nodata" in e:
                continue
            r, g, b = map(int, re.search(r'rgb="(\d+),(\d+),(\d+)"', e).group(1, 2, 3))
            lo, hi = re.search(r' value="[\[(]([^,]+),([^\])]+)[\])]"', e).group(1, 2)
            lo, hi = bound(lo), bound(hi)
            # Middle of the range the color stands for; open-ended ranges use their finite end.
            value = lo if hi is None else hi if lo is None else (lo + hi) / 2
            entries.append([r, g, b, round(value, 3)])
    values = [e[3] for e in entries]
    (out / f"{short}.json").write_text(json.dumps({
        "source": f"https://gibs.earthdata.nasa.gov/colormaps/v1.3/{name}.xml",
        "units": units,
        "min": min(values), "max": max(values),
        "entries": entries,
    }))
    print(f"{short}: {len(entries)} colors, {min(values)} to {max(values)} {units}")
