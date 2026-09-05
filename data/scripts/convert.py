#!/usr/bin/env python3
"""The convert step: raw subsets in, committed artefacts out. No network.

    python3 data/scripts/convert.py [--out <directory>] [--domain <id>]

Inputs:  config/j-ocean.json, data/raw/**, data/raw/digests.json
Outputs: data/truth/<domain>.jocean, data/clim/<domain>.jocean, data/obs/<domain>.json

Every raw file is checked against its recorded digest before it is read. A mismatch is
reported as *upstream changed*, naming both digests, and nothing is written -- so a
difference is attributed to the tree or to the upstream and never guessed at.

This program must be a pure function of its inputs, because gate G-01 runs it into a
temporary directory and compares the result byte for byte with what is committed. It reads
no clock, draws no randomness, and iterates nothing whose order is not fixed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import warnings
from datetime import datetime, timedelta, timezone

import numpy as np
import netCDF4

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jocean_format import Variable, write_container  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.path.join(ROOT, "config", "j-ocean.json")
RAW = os.path.join(ROOT, "data", "raw")
DIGESTS = os.path.join(RAW, "digests.json")

SEA_SURFACE_ELEVATION = "surface_elevation"
WATER_TEMPERATURE = "water_temperature"
VELOCITY_EAST = "velocity_east"
VELOCITY_NORTH = "velocity_north"

# The quantisation the artefacts carry. Both match how HYCOM stores these fields, so the
# committed record has the source's precision and neither more nor less.
ELEVATION_SCALE = 0.001
TEMPERATURE_SCALE = 0.001
VELOCITY_SCALE = 0.001


class UpstreamChanged(Exception):
    """A raw input no longer digests to what was recorded when it was fetched."""


class GapTooLarge(Exception):
    """The source is missing more consecutive snapshots than the configuration tolerates."""


def verify(relative: str, records: dict) -> str:
    """Return the absolute path of a raw file, having checked it against its digest."""
    record = records.get(relative)
    if record is None:
        raise UpstreamChanged(f"{relative} has no recorded digest; re-run data/scripts/fetch.py")
    path = os.path.join(RAW, relative)
    if not os.path.exists(path):
        raise UpstreamChanged(f"{relative} is recorded in digests.json but is not in data/raw/")
    with open(path, "rb") as handle:
        actual = hashlib.sha256(handle.read()).hexdigest()
    if actual != record["sha256"]:
        raise UpstreamChanged(
            f"upstream changed: {relative}\n"
            f"  recorded  {record['sha256']}\n"
            f"  on disk   {actual}\n"
            "Nothing was written. Either the upstream product changed, in which case re-run\n"
            "data/scripts/fetch.py and commit the new raw file and digest, or the file was\n"
            "edited by hand, which no file under data/raw/ ever should be."
        )
    return path


def instants_ms(dataset: netCDF4.Dataset) -> list[int]:
    variable = dataset.variables["time"]
    values = netCDF4.num2date(
        variable[:], variable.units, only_use_cftime_datetimes=False, only_use_python_datetimes=True
    )
    return [int(round(when.replace(tzinfo=timezone.utc).timestamp() * 1000)) for when in values]


def masked_to_nan(array) -> np.ndarray:
    """One representation for "no ocean here", whatever the file used to say it."""
    values = np.ma.filled(np.ma.masked_invalid(np.ma.asarray(array, dtype=np.float64)), np.nan)
    return np.asarray(values, dtype=np.float64)


def gaps_hours(times: list[int]) -> list[float]:
    """The spacing between consecutive instants, in hours. Not assumed to be uniform."""
    return [round((b - a) / 3_600_000, 6) for a, b in zip(times, times[1:])]


def check_gaps(kind: str, domain_id: str, times: list[int], maximum: float | None) -> list[float]:
    """The source is not perfectly regular: expt_53.X is missing occasional snapshots, so a
    six-hourly stride lands on a nine-hour step twice in this fortnight.

    Nothing is interpolated here to hide that. The gaps are measured, recorded in the
    artefact's provenance, and refused if any exceeds the declared maximum -- so a genuinely
    missing day fails the build and names the instants, while the product's ordinary
    irregularity is carried through as a fact about the record.
    """
    spacing = gaps_hours(times)
    if maximum is None:
        return spacing
    offending = [
        (times[i], times[i + 1], gap) for i, gap in enumerate(spacing) if gap > maximum + 1e-9
    ]
    if offending:
        lines = "\n".join(
            f"  {datetime.fromtimestamp(a / 1000, timezone.utc).isoformat()} -> "
            f"{datetime.fromtimestamp(b / 1000, timezone.utc).isoformat()}  ({gap:g} h)"
            for a, b, gap in offending
        )
        raise GapTooLarge(
            f"{kind}/{domain_id}: the source is missing snapshots and the gap exceeds the "
            f"declared maximum of {maximum:g} h:\n{lines}\n"
            "Nothing was written. Either widen truth.period.maxInstantGapHours with a reason, "
            "or choose a period the source actually covers. A gap is never interpolated here."
        )
    return spacing


def read_field(kind: str, domain_id: str, levels: list[float], records: dict) -> dict:
    """Assemble one domain's elevation and temperature from the per-level raw files."""
    elevation_path = verify(f"{kind}/{domain_id}/surf_el.nc", records)
    with netCDF4.Dataset(elevation_path) as dataset:
        times = instants_ms(dataset)
        lat = [float(v) for v in dataset.variables["lat"][:]]
        lon = [float(v) for v in dataset.variables["lon"][:]]
        elevation = masked_to_nan(dataset.variables["surf_el"][:])

    temperature = np.empty((len(times), len(levels), len(lat), len(lon)), dtype=np.float64)
    for index, level in enumerate(levels):
        path = verify(f"{kind}/{domain_id}/water_temp-{level:g}m.nc", records)
        with netCDF4.Dataset(path) as dataset:
            if instants_ms(dataset) != times:
                raise UpstreamChanged(
                    f"{kind}/{domain_id}: the {level:g} m temperature file has different "
                    "instants from the elevation file"
                )
            values = masked_to_nan(dataset.variables["water_temp"][:])
            # NCSS returns a length-1 depth axis when a single vertical coordinate is asked
            # for; squeeze it rather than assuming which shape came back.
            temperature[:, index] = values.reshape(len(times), len(lat), len(lon))

    field = {"times": times, "lat": lat, "lon": lon, "elevation": elevation, "temperature": temperature}

    # Surface velocity, for the truth record only. The model is initialised in geostrophic
    # balance with its own layer thickness; this is what that initialisation is checked
    # against (FR-013), which is a use a two-month mean would not support.
    if kind == "truth":
        for name, variable in ((VELOCITY_EAST, "water_u"), (VELOCITY_NORTH, "water_v")):
            path = verify(f"{kind}/{domain_id}/{variable}-0m.nc", records)
            with netCDF4.Dataset(path) as dataset:
                values = masked_to_nan(dataset.variables[variable][:])
                field[name] = values.reshape(len(times), len(lat), len(lon))
    return field


def provenance_for(kind: str, domain_id: str, levels: list[float], records: dict, config: dict) -> dict:
    names = [f"{kind}/{domain_id}/surf_el.nc"]
    if kind == "truth":
        names += [f"{kind}/{domain_id}/water_u-0m.nc", f"{kind}/{domain_id}/water_v-0m.nc"]
    names += [f"{kind}/{domain_id}/water_temp-{level:g}m.nc" for level in levels]
    return {
        "source": config["truth"]["source"]["id"],
        "sourceLabel": config["truth"]["source"]["label"],
        "service": config["truth"]["source"]["service"],
        "rawInputs": [{"file": name, "sha256": records[name]["sha256"], "url": records[name]["url"]} for name in names],
        "producedBy": "data/scripts/convert.py",
        "note": (
            "The depth levels are exact levels of the source product, so this artefact "
            "carries no build-time vertical interpolation."
        ),
    }


def parse_instant(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def overlap_days(a: dict, b: dict) -> float:
    start = max(parse_instant(a["start"]), parse_instant(b["start"]))
    end = min(parse_instant(a["end"]), parse_instant(b["end"]))
    return max(0.0, (end - start) / timedelta(days=1))


def convert_truth(domain: dict, config: dict, records: dict, out: str) -> str:
    levels = config["truth"]["depthLevelsMetres"]
    field = read_field("truth", domain["id"], levels, records)
    spacing = check_gaps(
        "truth", domain["id"], field["times"], config["truth"]["period"].get("maxInstantGapHours")
    )
    path = os.path.join(out, "truth", f"{domain['id']}.jocean")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_container(
        path,
        kind="truth",
        domain=domain["id"],
        provenance={
            **provenance_for("truth", domain["id"], levels, records, config),
            "period": config["truth"]["period"],
            "instantSpacingHours": sorted(set(spacing)),
            "instantCount": len(field["times"]),
            "gapNote": (
                "The source is missing occasional snapshots, so the instants are not evenly "
                "spaced. They are recorded as the source has them; nothing is interpolated "
                "at build time, and a gap larger than the declared maximum fails the build."
            ),
        },
        coordinates={
            "timeMs": field["times"],
            "depthMetres": [float(level) for level in levels],
            "latDegrees": field["lat"],
            "lonDegrees": field["lon"],
        },
        native_resolution_degrees=config["truth"]["source"]["nativeResolutionDegrees"],
        variables=[
            Variable(SEA_SURFACE_ELEVATION, "m", ["time", "lat", "lon"], field["elevation"], ELEVATION_SCALE),
            Variable(
                WATER_TEMPERATURE, "degC", ["time", "depth", "lat", "lon"], field["temperature"], TEMPERATURE_SCALE
            ),
            Variable(VELOCITY_EAST, "m s-1", ["time", "lat", "lon"], field[VELOCITY_EAST], VELOCITY_SCALE),
            Variable(VELOCITY_NORTH, "m s-1", ["time", "lat", "lon"], field[VELOCITY_NORTH], VELOCITY_SCALE),
        ],
    )
    return path


def convert_climatology(domain: dict, config: dict, records: dict, out: str) -> str:
    levels = config["truth"]["depthLevelsMetres"]
    field = read_field("clim", domain["id"], levels, records)
    window = config["climatology"]["window"]
    # A mean over the window, land excluded rather than counted as zero. A column that is
    # land at every instant averages to NaN, which is the right answer and which numpy warns
    # about; the warning is silenced here and nowhere else.
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Mean of empty slice", category=RuntimeWarning)
        elevation_mean = np.nanmean(field["elevation"], axis=0)
        temperature_mean = np.nanmean(field["temperature"], axis=0)

    path = os.path.join(out, "clim", f"{domain['id']}.jocean")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_container(
        path,
        kind="climatology",
        domain=domain["id"],
        provenance={
            **provenance_for("clim", domain["id"], levels, records, config),
            "window": window,
            "instantsAveraged": len(field["times"]),
            # ADR-0008: the climatology comes from the same subset as the truth record, and
            # what that costs in independence is recorded rather than hidden. Beat 006 turns
            # this figure into an on-screen caveat beside every skill-against-climatology score.
            "overlapWithRunPeriodDays": overlap_days(window, config["truth"]["period"]),
            "runPeriod": config["truth"]["period"],
            "independenceNote": (
                "Computed from the same product and region as the truth record it is scored "
                "against. Skill against this reference is therefore not a fully independent "
                "measure; the overlap in days is stated so a reader can judge how much less."
            ),
        },
        coordinates={
            "depthMetres": [float(level) for level in levels],
            "latDegrees": field["lat"],
            "lonDegrees": field["lon"],
        },
        native_resolution_degrees=config["truth"]["source"]["nativeResolutionDegrees"],
        variables=[
            Variable(SEA_SURFACE_ELEVATION, "m", ["lat", "lon"], elevation_mean, ELEVATION_SCALE),
            Variable(WATER_TEMPERATURE, "degC", ["depth", "lat", "lon"], temperature_mean, TEMPERATURE_SCALE),
        ],
    )
    return path


def decode_flags(variable) -> list[int]:
    """Argo quality flags are single characters. A missing flag is 0, "no QC performed"."""
    raw = np.ma.filled(variable[:], b" ")
    out: list[int] = []
    for value in np.asarray(raw).reshape(-1):
        text = value.decode("ascii", errors="replace") if isinstance(value, bytes) else str(value)
        out.append(int(text) if text.strip().isdigit() else 0)
    return out


def convert_observations(domain: dict, config: dict, records: dict, out: str) -> str:
    listing_path = verify(f"obs/{domain['id']}/index.json", records)
    with open(listing_path, encoding="utf-8") as handle:
        listing = json.load(handle)

    profiles: list[dict] = []
    # Counted from the raw arrays, before conversion, so that the TypeScript test can count
    # the same thing from the committed record and compare (SC-002). Two independent
    # computations of one fact is the only way this assertion is worth making.
    raw_levels = 0
    raw_flag_counts: dict[str, int] = {}
    for row in listing["profiles"]:
        name = row["path"].replace("/", "_")
        path = verify(f"obs/{domain['id']}/{name}", records)
        with netCDF4.Dataset(path) as dataset:
            juld = dataset.variables["JULD"]
            when = netCDF4.num2date(
                juld[:], juld.units, only_use_cftime_datetimes=False, only_use_python_datetimes=True
            )
            latitudes = np.ma.filled(dataset.variables["LATITUDE"][:], np.nan)
            longitudes = np.ma.filled(dataset.variables["LONGITUDE"][:], np.nan)
            platform = dataset.variables["PLATFORM_NUMBER"][:]
            cycles = np.ma.filled(dataset.variables["CYCLE_NUMBER"][:], -1)

            pressure = masked_to_nan(dataset.variables["PRES"][:])
            temperature = masked_to_nan(dataset.variables["TEMP"][:])
            salinity = masked_to_nan(dataset.variables["PSAL"][:]) if "PSAL" in dataset.variables else None
            pressure_flags = np.asarray(decode_flags(dataset.variables["PRES_QC"])).reshape(pressure.shape)
            temperature_flags = np.asarray(decode_flags(dataset.variables["TEMP_QC"])).reshape(temperature.shape)
            salinity_flags = (
                np.asarray(decode_flags(dataset.variables["PSAL_QC"])).reshape(pressure.shape)
                if salinity is not None
                else None
            )

            finite = np.isfinite(pressure)
            raw_levels += int(np.count_nonzero(finite))
            for flag in np.asarray(temperature_flags)[finite].reshape(-1).tolist():
                key = str(int(flag))
                raw_flag_counts[key] = raw_flag_counts.get(key, 0) + 1

            for index in range(pressure.shape[0]):
                identifier = b"".join(np.asarray(platform[index]).reshape(-1).tolist()).decode("ascii").strip()
                levels = []
                for level in range(pressure.shape[1]):
                    if not np.isfinite(pressure[index, level]):
                        continue
                    entry = {
                        "pressureDbar": round(float(pressure[index, level]), 4),
                        "pressureFlag": int(pressure_flags[index, level]),
                        "temperatureDegC": (
                            round(float(temperature[index, level]), 4)
                            if np.isfinite(temperature[index, level])
                            else None
                        ),
                        "temperatureFlag": int(temperature_flags[index, level]),
                    }
                    if salinity is not None:
                        entry["salinityPsu"] = (
                            round(float(salinity[index, level]), 4)
                            if np.isfinite(salinity[index, level])
                            else None
                        )
                        entry["salinityFlag"] = int(salinity_flags[index, level])
                    levels.append(entry)
                if not levels:
                    continue
                profiles.append(
                    {
                        "platform": identifier,
                        "cycle": int(cycles[index]),
                        "file": row["path"],
                        # As reported. A float drifts through its cycle; the record does not
                        # pretend to know where it was at any instant but the reported one.
                        "instant": when[index].replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
                        "latDegrees": round(float(latitudes[index]), 5),
                        "lonDegrees": round(float(longitudes[index]), 5),
                        "levels": levels,
                    }
                )

    profiles.sort(key=lambda p: (p["instant"], p["platform"], p["cycle"]))
    document = {
        "format": "j-ocean/observations",
        "version": 1,
        "domain": domain["id"],
        "provenance": {
            "source": config["observations"]["source"]["id"],
            "sourceLabel": config["observations"]["source"]["label"],
            "period": config["truth"]["period"],
            "producedBy": "data/scripts/convert.py",
            "flagNote": (
                "Argo quality flags are carried through at every level and are never used "
                "to drop a level. A flagged observation is drawn as flagged, not omitted."
            ),
            "levelsInRaw": raw_levels,
            "temperatureFlagCountsInRaw": dict(sorted(raw_flag_counts.items())),
            "rawInputs": [
                {"file": f"obs/{domain['id']}/index.json", "sha256": records[f"obs/{domain['id']}/index.json"]["sha256"]}
            ]
            + [
                {
                    "file": f"obs/{domain['id']}/{row['path'].replace('/', '_')}",
                    "sha256": records[f"obs/{domain['id']}/{row['path'].replace('/', '_')}"]["sha256"],
                }
                for row in listing["profiles"]
            ],
        },
        "profiles": profiles,
    }
    path = os.path.join(out, "obs", f"{domain['id']}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(json.dumps(document, sort_keys=True, indent=2).encode("utf-8") + b"\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=os.path.join(ROOT, "data"), help="where the artefacts go")
    parser.add_argument("--domain", action="append", help="restrict to one domain id")
    arguments = parser.parse_args()

    with open(CONFIG, encoding="utf-8") as handle:
        config = json.load(handle)
    with open(DIGESTS, encoding="utf-8") as handle:
        records = json.load(handle)["files"]

    domains = config["domains"]["list"]
    if arguments.domain:
        domains = [d for d in domains if d["id"] in arguments.domain]

    written: list[str] = []
    try:
        for domain in domains:
            written.append(convert_truth(domain, config, records, arguments.out))
            written.append(convert_climatology(domain, config, records, arguments.out))
            written.append(convert_observations(domain, config, records, arguments.out))
    except (UpstreamChanged, GapTooLarge) as failure:
        sys.stderr.write(f"{failure}\n")
        return 2

    for path in written:
        sys.stdout.write(f"{os.path.relpath(path, ROOT)}  {os.path.getsize(path)} bytes\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
