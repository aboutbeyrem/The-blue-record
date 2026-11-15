"""Check the live NASA layers against independent NASA data.

For each category the app plays, this reads a value from NASA GIBS exactly the
way the app does (look the pixel's color up in NASA's colormap) and compares it
with a second, independent NASA product at the same place and time.

  Land temperature   MODIS Terra 8-day land surface temperature, against MERRA-2
                     skin temperature (NASA POWER hourly) at the satellite's
                     ~10:30 local overpass, averaged over the same 8 days.
  Sea temperature    MUR sea surface temperature, against MERRA-2 skin
                     temperature over open ocean (NASA POWER daily).
  Rain               IMERG daily rain rate, against MERRA-2 corrected
                     precipitation (NASA POWER daily).
  Height of the land ASTER GDEM through GIBS, against SRTM elevation
                     (Open-Elevation service, which serves NASA's SRTM data).
  Greenness          MODIS Terra vegetation index against VIIRS (Suomi NPP) vegetation
                     index: two different satellites and instruments, same month.

Usage: python validate_live.py <records/live dir> <records/geo dir> <output dir>
Needs numpy, Pillow and curl.
"""
import csv
import io
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

live, geo, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
POWER = "https://power.larc.nasa.gov/api/temporal"


def curl(url, post=None):
    cmd = ["curl", "-s", "-m", "60", url]
    if post:
        cmd = ["curl", "-s", "-m", "60", "-X", "POST", url, "-H", "Content-Type: application/json", "-d", post]
    return subprocess.run(cmd, capture_output=True).stdout


def table(name):
    t = json.loads((live / f"{name}.json").read_text())
    return {(r << 16) | (g << 8) | b: v for r, g, b, v in t["entries"]}


TABLES = {k: table(k) for k in ("lst", "sst", "rain", "elevation", "ndvi")}


def gibs_value(layer, cm, lat, lon, time, half=0.03, size=7):
    """Median value of the data pixels in a small box around a point."""
    q = (f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={layer}&CRS=EPSG:4326"
         f"&BBOX={lat - half},{lon - half},{lat + half},{lon + half}&WIDTH={size}&HEIGHT={size}"
         f"&FORMAT=image/png&TRANSPARENT=true" + (f"&TIME={time}" if time else ""))
    try:
        a = np.asarray(Image.open(io.BytesIO(curl(q))).convert("RGBA")).astype(int)
    except Exception:
        return None
    vals = []
    for px in a.reshape(-1, 4):
        if px[3] > 127:
            v = TABLES[cm].get((px[0] << 16) | (px[1] << 8) | px[2])
            if v is not None:
                vals.append(v)
    return float(np.median(vals)) if vals else None


def power(kind, param, lat, lon, start, end, extra=""):
    q = (f"{POWER}/{kind}/point?parameters={param}&community=RE&longitude={lon}&latitude={lat}"
         f"&start={start}&end={end}&format=JSON{extra}")
    try:
        return json.loads(curl(q))["properties"]["parameter"][param]
    except Exception:
        return None


# ---- points ------------------------------------------------------------------
places = json.loads((geo / "places.json").read_text())
ids = np.asarray(Image.open(geo / "places.png").convert("RGB"))


def country_at(lat, lon):
    return int(ids[min(2047, int((90 - lat) / 180 * 2048)), min(4095, int((lon + 180) / 360 * 4096))][0])


cities = sorted([c for c in places["cities"] if c[3] >= 1_500_000 and -55 < c[1] < 70], key=lambda c: c[1])
land_pts = cities[:: max(1, len(cities) // 70)][:70]
ocean_pts = []
for lat in range(-50, 51, 15):
    for lon in range(-170, 171, 30):
        around = [country_at(lat + dy, lon + dx) for dy in (-3, 0, 3) for dx in (-3, 0, 3)]
        if not any(around):
            ocean_pts.append((lat, lon))
rows = []


def add(category, name, lat, lon, date, ours, ref):
    if ours is not None and ref is not None:
        rows.append({"category": category, "place": name, "lat": lat, "lon": lon, "date": date, "nasa_app": round(ours, 3), "reference": round(ref, 3)})


# ---- land temperature ----------------------------------------------------------
def land_job(args):
    (name, lat, lon, _), date = args
    ours = gibs_value("MODIS_Terra_L3_Land_Surface_Temp_8Day_Day", "lst", lat, lon, date)
    if ours is None:
        return
    ours -= 273.15
    y, m, d = map(int, date.split("-"))
    from datetime import date as D, timedelta
    end = D(y, m, d) + timedelta(days=7)
    ts = power("hourly", "TS", lat, lon, date.replace("-", ""), end.strftime("%Y%m%d"), "&time-standard=LST")
    if not ts:
        return
    vals = [v for k, v in ts.items() if k[-2:] in ("10", "11") and v > -900]
    if vals:
        add("land temperature (C)", name, lat, lon, date, ours, float(np.mean(vals)))


# ---- sea temperature ------------------------------------------------------------
def sea_job(args):
    (lat, lon), date = args
    ours = gibs_value("GHRSST_L4_MUR_Sea_Surface_Temperature", "sst", lat, lon, date)
    ts = power("daily", "TS", lat, lon, date.replace("-", ""), date.replace("-", ""))
    if ours is not None and ts:
        v = list(ts.values())[0]
        if v > -900:
            add("sea temperature (C)", f"{lat},{lon}", lat, lon, date, ours, v)


# ---- rain -----------------------------------------------------------------------
def rain_job(args):
    (lat, lon), date = args
    rate = gibs_value("IMERG_Precipitation_Rate", "rain", lat, lon, date, half=0.12, size=5)
    ours = (rate or 0.0) * 24          # no colored pixel means no rain: 0 mm/h
    p = power("daily", "PRECTOTCORR", lat, lon, date.replace("-", ""), date.replace("-", ""))
    if p:
        v = list(p.values())[0]
        if v > -900:
            add("rain (mm per day)", f"{lat},{lon}", lat, lon, date, ours, v)


# ---- greenness ------------------------------------------------------------------
def green_job(args):
    (name, lat, lon, _), date = args
    a = gibs_value("MODIS_Terra_L3_NDVI_Monthly", "ndvi", lat, lon, date)
    b = gibs_value("VIIRS_SNPP_L3_NDVI_Monthly", "ndvi", lat, lon, date)
    add("greenness (index)", name, lat, lon, date, a, b)


# ---- elevation ------------------------------------------------------------------
def elevation_rows():
    locs = [{"latitude": c[1], "longitude": c[2]} for c in land_pts]
    res = json.loads(curl("https://api.open-elevation.com/api/v1/lookup", json.dumps({"locations": locs})))["results"]
    for c, r in zip(land_pts, res):
        ours = gibs_value("ASTER_GDEM_Color_Index", "elevation", c[1], c[2], None)
        add("height of the land (m)", c[0], c[1], c[2], "static", ours if ours is not None else 0.0, r["elevation"])


DATES = ["2026-08-01", "2026-11-01"]
RAIN_DATES = ["2026-08-05", "2026-11-05"]
rain_pts = [(c[1], c[2]) for c in land_pts[::2]] + ocean_pts[::3]
with ThreadPoolExecutor(8) as ex:
    list(ex.map(land_job, [(p, d) for p in land_pts for d in DATES]))
    print("land temperature pairs:", sum(1 for r in rows if r["category"].startswith("land")))
    list(ex.map(sea_job, [(p, d) for p in ocean_pts for d in ["2026-08-05", "2026-11-05"]]))
    print("sea temperature pairs:", sum(1 for r in rows if r["category"].startswith("sea")))
    list(ex.map(rain_job, [(p, d) for p in rain_pts for d in RAIN_DATES]))
    print("rain pairs:", sum(1 for r in rows if r["category"].startswith("rain")))
    green_pts = land_pts + cities[::7]
    list(ex.map(green_job, [(p, d) for p in green_pts for d in ("2026-08-01", "2026-10-01")]))
    print("greenness pairs:", sum(1 for r in rows if r["category"].startswith("green")))
elevation_rows()
print("elevation pairs:", sum(1 for r in rows if r["category"].startswith("height")))

with open(out / "live_vs_reference.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

summary = {}
for cat in sorted({r["category"] for r in rows}):
    a = np.array([r["nasa_app"] for r in rows if r["category"] == cat])
    b = np.array([r["reference"] for r in rows if r["category"] == cat])
    d = a - b
    s = {"pairs": int(len(a)), "bias": round(float(d.mean()), 2), "mean_abs_error": round(float(np.abs(d).mean()), 2),
         "median_abs_error": round(float(np.median(np.abs(d))), 2), "rmse": round(float(np.sqrt((d ** 2).mean())), 2),
         "correlation_r": round(float(np.corrcoef(a, b)[0, 1]), 3) if len(a) > 2 and a.std() and b.std() else None}
    if cat.startswith("rain"):
        wet_a, wet_b = a >= 0.5, b >= 0.5
        s["wet_or_dry_agree"] = round(float((wet_a == wet_b).mean()), 3)
        s["correlation_log"] = round(float(np.corrcoef(np.log1p(a), np.log1p(b))[0, 1]), 3)
    summary[cat] = s
(out / "live_summary.json").write_text(json.dumps(summary, indent=1))
print(json.dumps(summary, indent=1))
