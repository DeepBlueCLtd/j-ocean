#!/usr/bin/env python3
"""The fetch step: the only thing in j-ocean that touches the network.

    python3 data/scripts/fetch.py [--domain <id>] [--skip-hycom] [--skip-argo]

Inputs:  config/j-ocean.json -- the declared domains, period, levels and sources
Outputs: data/raw/**         -- the raw subsets, exactly as the servers returned them
         data/raw/digests.json -- a SHA-256 for every raw file, and the request that made it

It is run by a person, never by CI, and the convert step and gate G-01 never call it. That
split is the whole point (review R-5): a gate that re-fetched from a server would be testing
the server, and a drift gate exists to test the tree.

The subset is taken server-side. Each request carries the domain box, the period, the stride
and one depth level, and the server returns a compressed NetCDF-4 file of just that. See
docs/adr/0004-truth-source.md for why this is the NetCDF Subset Service rather than the DAP
protocol -- both are server-side, and only one of them returns inside a minute.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.path.join(ROOT, "config", "j-ocean.json")
RAW = os.path.join(ROOT, "data", "raw")
DIGESTS = os.path.join(RAW, "digests.json")

USER_AGENT = "j-ocean/0.1 (teaching harness; https://github.com/DeepBlueCLtd/j-ocean)"


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def get(url: str, timeout: int = 600) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def write(path: str, blob: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(blob)


def ncss_url(base: str, domain: dict, variable: str, window: dict, level: float | None) -> str:
    query = [
        ("var", variable),
        ("north", f"{domain['north']}"),
        ("south", f"{domain['south']}"),
        ("west", f"{domain['west']}"),
        ("east", f"{domain['east']}"),
        ("horizStride", "1"),
        ("time_start", window["start"]),
        ("time_end", window["end"]),
        ("timeStride", str(window["strideHours"] // 3)),
        ("accept", "netcdf4"),
    ]
    if level is not None:
        query.append(("vertCoord", f"{level:g}"))
    year = window["start"][:4]
    return f"{base}/{year}?" + urllib.parse.urlencode(query)


def fetch_field(records: dict, base: str, domain: dict, kind: str, window: dict, levels: list[float]) -> None:
    """One request for each two-dimensional field, and one per declared depth level.

    Surface velocity is fetched for the truth record and not for the climatology: the model
    is initialised in geostrophic balance with its own layer thickness, and the truth
    velocity is what that initialisation is *checked against* (FR-013). A mean velocity over
    two months is not a thing that check would mean anything against.
    """
    jobs = [("surf_el", None, f"{kind}/{domain['id']}/surf_el.nc")]
    if kind == "truth":
        jobs += [
            ("water_u", 0.0, f"{kind}/{domain['id']}/water_u-0m.nc"),
            ("water_v", 0.0, f"{kind}/{domain['id']}/water_v-0m.nc"),
        ]
    jobs += [
        ("water_temp", level, f"{kind}/{domain['id']}/water_temp-{level:g}m.nc")
        for level in levels
    ]
    for variable, level, relative in jobs:
        url = ncss_url(base, domain, variable, window, level)
        sys.stdout.write(f"  {relative} ... ")
        sys.stdout.flush()
        blob = get(url)
        write(os.path.join(RAW, relative), blob)
        records[relative] = {"sha256": sha256(blob), "bytes": len(blob), "url": url}
        sys.stdout.write(f"{len(blob) // 1024} KiB\n")


def parse_instant(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def fetch_argo(records: dict, source: dict, domains: list[dict], period: dict) -> None:
    """Filter the global profile index by box and period *before* downloading anything."""
    sys.stdout.write(f"  index {source['indexUrl']} ... ")
    sys.stdout.flush()
    raw_index = get(source["indexUrl"])
    if source["indexUrl"].endswith(".gz"):
        raw_index = gzip.decompress(raw_index)
    sys.stdout.write(f"{len(raw_index) // (1024 * 1024)} MiB\n")

    start = parse_instant(period["start"])
    end = parse_instant(period["end"])

    selected: dict[str, list[dict]] = {domain["id"]: [] for domain in domains}
    for line in io.StringIO(raw_index.decode("utf-8", errors="replace")):
        if line.startswith("#") or line.startswith("file,"):
            continue
        parts = line.rstrip("\n").split(",")
        if len(parts) < 4:
            continue
        path, date_text, lat_text, lon_text = parts[0], parts[1], parts[2], parts[3]
        if not (date_text and lat_text and lon_text):
            continue
        try:
            when = datetime.strptime(date_text[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            lat, lon = float(lat_text), float(lon_text)
        except ValueError:
            continue
        if not (start <= when <= end):
            continue
        for domain in domains:
            if domain["south"] <= lat <= domain["north"] and domain["west"] <= lon <= domain["east"]:
                selected[domain["id"]].append(
                    {"path": path, "instant": when.isoformat().replace("+00:00", "Z"), "lat": lat, "lon": lon}
                )

    for domain in domains:
        rows = sorted(selected[domain["id"]], key=lambda row: (row["instant"], row["path"]))
        sys.stdout.write(f"  {domain['id']}: {len(rows)} profiles in the box and period\n")
        listing = {"domain": domain["id"], "source": source["id"], "profiles": rows}
        blob = json.dumps(listing, sort_keys=True, indent=2).encode("utf-8") + b"\n"
        relative = f"obs/{domain['id']}/index.json"
        write(os.path.join(RAW, relative), blob)
        records[relative] = {"sha256": sha256(blob), "bytes": len(blob), "url": source["indexUrl"]}

        for row in rows:
            url = f"{source['profileBaseUrl']}/{row['path']}"
            name = row["path"].replace("/", "_")
            profile_relative = f"obs/{domain['id']}/{name}"
            sys.stdout.write(f"    {name} ... ")
            sys.stdout.flush()
            profile = get(url)
            write(os.path.join(RAW, profile_relative), profile)
            records[profile_relative] = {"sha256": sha256(profile), "bytes": len(profile), "url": url}
            sys.stdout.write(f"{len(profile) // 1024} KiB\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", action="append", help="restrict to one domain id")
    parser.add_argument("--skip-hycom", action="store_true")
    parser.add_argument("--skip-argo", action="store_true")
    arguments = parser.parse_args()

    with open(CONFIG, encoding="utf-8") as handle:
        config = json.load(handle)

    domains = config["domains"]["list"]
    if arguments.domain:
        domains = [d for d in domains if d["id"] in arguments.domain]
        if not domains:
            parser.error(f"no domain matches {arguments.domain}")

    records: dict[str, dict] = {}
    if os.path.exists(DIGESTS):
        with open(DIGESTS, encoding="utf-8") as handle:
            records = json.load(handle)["files"]

    base = config["truth"]["source"]["baseUrl"]
    levels = config["truth"]["depthLevelsMetres"]

    if not arguments.skip_hycom:
        for domain in domains:
            sys.stdout.write(f"truth: {domain['id']}\n")
            fetch_field(records, base, domain, "truth", config["truth"]["period"], levels)
            sys.stdout.write(f"climatology: {domain['id']}\n")
            fetch_field(records, base, domain, "clim", config["climatology"]["window"], levels)

    if not arguments.skip_argo:
        sys.stdout.write("observations:\n")
        fetch_argo(records, config["observations"]["source"], domains, config["truth"]["period"])

    write(
        DIGESTS,
        json.dumps({"files": dict(sorted(records.items()))}, sort_keys=True, indent=2).encode("utf-8") + b"\n",
    )
    sys.stdout.write(f"\n{len(records)} raw files, digests written to data/raw/digests.json\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
