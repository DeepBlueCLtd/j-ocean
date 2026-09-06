"""The committed field container, written by the convert step and read by the harness.

One self-describing file per field artefact. The layout is deliberately small enough that
the TypeScript reader in ``src/truth/container.ts`` needs nothing but ``DataView``,
``TextDecoder`` and a typed array, which is what FR-009 means by "loadable without a
parsing library"::

    bytes 0..7      magic, ASCII "JOCEAN01"
    bytes 8..11     uint32 little-endian: the header length in bytes
    bytes 12..      the header, UTF-8 JSON, exactly that many bytes
                    zero padding to the next multiple of 4
    then            the payload: each variable at the byte offset the header declares

The payload is ``int16`` with a declared scale and offset, because that is exactly how
HYCOM stores these fields. Widening to ``float32`` would double the size in order to invent
precision the source does not have. Land carries a declared fill value and the reader turns
it into NaN.

Everything here must be deterministic: gate G-01 regenerates each artefact and compares it
byte for byte with what is committed, so a dictionary that iterated in a different order or
a float that formatted differently would be a build failure rather than a curiosity.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np

MAGIC = b"JOCEAN01"
HEADER_OFFSET = 12


@dataclass(frozen=True)
class Variable:
    """One field in a container: its name, its dimensions and how to read its numbers."""

    name: str
    units: str
    dims: Sequence[str]
    values: np.ndarray  # float64, NaN where there is no ocean
    scale_factor: float
    add_offset: float = 0.0
    fill_value: int = -30000

    def encode(self) -> np.ndarray:
        """Quantise to int16 exactly as the upstream product does, land included."""
        scaled = (self.values - self.add_offset) / self.scale_factor
        land = ~np.isfinite(scaled)
        # Round half up. numpy's default is half-to-even, which is better statistics and
        # worse for a gate: it is not the arithmetic a reader checking one value by hand
        # would do, and this quantisation has to be explicable, not merely correct.
        rounded = np.floor(np.where(land, 0.0, scaled) + 0.5)
        if np.any(rounded[~land] < -32767) or np.any(rounded[~land] > 32767):
            raise ValueError(
                f"{self.name}: a value does not fit in int16 at scale {self.scale_factor}"
            )
        return np.where(land, self.fill_value, rounded).astype("<i2")


def write_container(
    path: str,
    *,
    kind: str,
    domain: str,
    provenance: dict[str, Any],
    coordinates: dict[str, Sequence[float]],
    native_resolution_degrees: float,
    variables: Sequence[Variable],
) -> bytes:
    """Write a container and return the bytes written, so a caller can digest them."""
    payloads: list[bytes] = []
    described: list[dict[str, Any]] = []
    offset = 0
    for variable in variables:
        encoded = variable.encode()
        raw = encoded.tobytes(order="C")
        described.append(
            {
                "name": variable.name,
                "units": variable.units,
                "dims": list(variable.dims),
                "shape": list(encoded.shape),
                "dtype": "int16",
                "byteOrder": "little",
                "scaleFactor": variable.scale_factor,
                "addOffset": variable.add_offset,
                "fillValue": variable.fill_value,
                "byteOffset": offset,
                "byteLength": len(raw),
            }
        )
        payloads.append(raw)
        offset += len(raw)

    header = {
        "format": "j-ocean/field",
        "version": 1,
        "kind": kind,
        "domain": domain,
        "nativeResolutionDegrees": native_resolution_degrees,
        "coordinates": {name: list(values) for name, values in coordinates.items()},
        "variables": described,
        "provenance": provenance,
    }
    # separators and sort_keys make the header a function of its content and nothing else.
    encoded_header = json.dumps(header, sort_keys=True, separators=(",", ":")).encode("utf-8")
    padding = (-(HEADER_OFFSET + len(encoded_header))) % 4

    blob = b"".join(
        [
            MAGIC,
            struct.pack("<I", len(encoded_header)),
            encoded_header,
            b"\x00" * padding,
            *payloads,
        ]
    )
    with open(path, "wb") as handle:
        handle.write(blob)
    return blob


def read_container(path: str) -> tuple[dict[str, Any], dict[str, np.ndarray]]:
    """Read a container back. Used by the tests and by anybody inspecting an artefact."""
    with open(path, "rb") as handle:
        blob = handle.read()
    if blob[:8] != MAGIC:
        raise ValueError(f"{path} is not a j-ocean container")
    (header_length,) = struct.unpack("<I", blob[8:HEADER_OFFSET])
    header = json.loads(blob[HEADER_OFFSET : HEADER_OFFSET + header_length].decode("utf-8"))
    payload_start = HEADER_OFFSET + header_length
    payload_start += (-payload_start) % 4

    fields: dict[str, np.ndarray] = {}
    for variable in header["variables"]:
        start = payload_start + variable["byteOffset"]
        raw = blob[start : start + variable["byteLength"]]
        encoded = np.frombuffer(raw, dtype="<i2").reshape(variable["shape"])
        values = encoded.astype(np.float64) * variable["scaleFactor"] + variable["addOffset"]
        values[encoded == variable["fillValue"]] = np.nan
        fields[variable["name"]] = values
    return header, fields
