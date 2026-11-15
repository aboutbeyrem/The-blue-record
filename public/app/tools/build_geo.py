"""Build the place data the globe and "Where am I?" use.

Inputs: three Natural Earth files (public domain, https://www.naturalearthdata.com/)
  ne_50m_admin_0_countries.geojson
  ne_110m_geography_marine_polys.geojson
  ne_10m_populated_places_simple.geojson

Outputs, in <out dir>:
  places.png     4096x2048 equirectangular picture. Red channel = country id,
                 green channel = named sea or ocean id, 0 = none. A pixel is
                 about 0.09 degrees, roughly 10 km.
  places.json    countries (id, name, ISO code, continent, bounding box, centre),
                 seas, and the larger cities.
  c/<id>.json    the border of each country as crisp vector rings (whole degrees
                 times 1000, flat lon,lat pairs), loaded only when a country is chosen.

Usage: python build_geo.py <dir with the three .geojson files> <output dir>
Needs Pillow.
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
W, H = 4096, 2048


def px(lon, lat):
    return ((lon + 180) / 360 * W, (90 - lat) / 180 * H)


def ring_area(ring):
    """Area in square degrees, shrunk by cos(latitude) so high latitudes are not inflated."""
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += x1 * y2 - x2 * y1
    lat = sum(p[1] for p in ring) / len(ring)
    return abs(a) / 2 * math.cos(math.radians(lat))


def simplify(ring, eps):
    """Douglas-Peucker: drop points that sit within eps degrees of the straight line."""
    if len(ring) < 4:
        return ring
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    # A closed ring starts and ends at the same point, which has no direction to
    # measure against, so split it at the point farthest from the start first.
    far0 = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    keep[far0] = True
    stack = [(0, far0), (far0, len(ring) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = ring[a], ring[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        far, idx = 0.0, -1
        for i in range(a + 1, b):
            d = abs(dy * (ring[i][0] - x1) - dx * (ring[i][1] - y1)) / norm
            if d > far:
                far, idx = d, i
        if far > eps and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(ring, keep) if k]


def all_rings(geom):
    """Every ring, outer boundaries and holes, so enclaves are cut out correctly."""
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return [r for poly in polys for r in poly]


def polygons(geom):
    """Outer rings only. Holes are skipped on purpose: an enclave such as Lesotho
    is drawn later and on top, because we draw big countries first."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    return [p[0] for p in geom["coordinates"]]


# ---- countries -------------------------------------------------------------
countries = json.loads((src / "ne_50m_admin_0_countries.geojson").read_text())["features"]
c_img = Image.new("L", (W, H), 0)
c_draw = ImageDraw.Draw(c_img)
order = sorted(countries, key=lambda f: -sum(ring_area(r) for r in polygons(f["geometry"])))
country_list = [None]          # id 0 means "no country"
for cid, f in enumerate(order, start=1):
    p = f["properties"]
    rings = polygons(f["geometry"])
    for ring in rings:
        c_draw.polygon([px(*pt) for pt in ring], fill=cid)
    shape_dir = out / "c"
    shape_dir.mkdir(exist_ok=True)
    flat = []
    for ring in all_rings(f["geometry"]):
        xs, ys = [q[0] for q in ring], [q[1] for q in ring]
        extent = max(max(xs) - min(xs), max(ys) - min(ys))
        pts = simplify([(x, y) for x, y in ring], min(0.004, extent * 0.01))   # small islands keep their shape
        if len(pts) >= 4:
            flat.append([int(round(v * 1000)) for pt in pts for v in pt])
    (shape_dir / f"{cid}.json").write_text(json.dumps({"r": flat}, separators=(",", ":")))
    biggest = max(rings, key=ring_area)
    xs, ys = [pt[0] for pt in biggest], [pt[1] for pt in biggest]
    country_list.append({
        "n": p["NAME"], "a": p.get("ADM0_A3") or p.get("ISO_A3"), "c": p.get("CONTINENT"),
        "b": [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
        "m": [round((min(ys) + max(ys)) / 2, 2), round((min(xs) + max(xs)) / 2, 2)],
    })
assert len(country_list) <= 256, "country ids must fit in one byte"

# ---- seas and oceans -------------------------------------------------------
marine = json.loads((src / "ne_110m_geography_marine_polys.geojson").read_text())["features"]
m_img = Image.new("L", (W, H), 0)
m_draw = ImageDraw.Draw(m_img)
m_order = sorted(marine, key=lambda f: -sum(ring_area(r) for r in polygons(f["geometry"])))
seas = [None]
for sid, f in enumerate(m_order, start=1):
    for ring in polygons(f["geometry"]):
        m_draw.polygon([px(*pt) for pt in ring], fill=sid)
    name = f["properties"]["name"]
    seas.append(name.title() if name.isupper() else name)

Image.merge("RGB", (c_img, m_img, Image.new("L", (W, H), 0))).save(out / "places.png", optimize=True)

# ---- cities ----------------------------------------------------------------
cities = []
for f in json.loads((src / "ne_10m_populated_places_simple.geojson").read_text())["features"]:
    p = f["properties"]
    cities.append([p["name"], round(p["latitude"], 3), round(p["longitude"], 3), int(p.get("pop_max") or 0)])

(out / "places.json").write_text(json.dumps(
    {"source": "Natural Earth, public domain", "countries": country_list, "seas": seas, "cities": cities},
    ensure_ascii=False, separators=(",", ":")))
print(f"{len(country_list) - 1} countries, {len(seas) - 1} seas, {len(cities)} cities")
