# The data pipeline

Two Python scripts and nothing else. Python is the one permitted second runtime, it is a
build step, and it is never imported or spawned by the application (constitution,
Technology).

## Running it

```sh
python3 -m pip install -r data/scripts/requirements.txt

# The network step. Run by a person, never by CI.
python3 data/scripts/fetch.py

# The pure step. Run by a person and by gate G-01.
python3 data/scripts/convert.py
```

`fetch.py` accepts `--domain <id>`, `--skip-hycom` and `--skip-argo`.
`convert.py` accepts `--domain <id>` and `--out <directory>`.

## Why there are two scripts and not one

A gate that re-fetched from a server would be testing the server. A gate that re-converts a
committed input is testing the tree, which is what a drift gate is for (review R-5).

So `fetch.py` is the only thing in the project that touches the network, and it writes a
SHA-256 for every raw file into `data/raw/digests.json`. `convert.py` has no network access
at all and refuses to run when a raw file does not match its recorded digest, reporting
*upstream changed* and naming both digests. A difference is therefore attributed to the
upstream or to the tree, and never guessed at.

## What is where

| Path | What it is | Committed? |
|---|---|---|
| `data/raw/truth/<domain>/` | The HYCOM subsets, one per variable and depth level, as the server returned them | Yes |
| `data/raw/clim/<domain>/` | The same over the climatology window | Yes |
| `data/raw/obs/<domain>/` | The Argo profiles inside the box and period, and the index rows that selected them | Yes |
| `data/raw/digests.json` | A SHA-256 and the request URL for every raw file | Yes |
| `data/truth/<domain>.jocean` | The committed truth field | Yes, and gated |
| `data/clim/<domain>.jocean` | The committed climatology, with its overlap recorded | Yes, and gated |
| `data/obs/<domain>.json` | The committed profiles, with every flag carried through | Yes, and gated |

The raw subset is committed on purpose, and it costs about 5 MB. It buys a drift gate that
needs no network, no credentials and no cache: a fresh checkout can regenerate every
artefact and prove it. See `docs/adr/0004-truth-source.md` and the Complexity Tracking entry
in `specs/002-truth-and-observation-records/plan.md`.

## Never edit an artefact

Nothing under `data/truth/`, `data/clim/` or `data/obs/` is edited by hand. Gate G-01
regenerates each one and compares it byte for byte; a hand edit fails the build by
construction, which is the point.
