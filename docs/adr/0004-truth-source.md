# ADR-0004: The truth record is a HYCOM GLBv0.08 reanalysis subset, fetched and converted in two steps

- **Status:** Accepted
- **Date:** 2026-09-05
- **Owed by:** SRD PR-03, FR-09; review R-5, R-6
- **Written before:** beat 002

## Context

The harness's claims are worth what its truth record is worth. The record has to be freely
obtainable, at a resolution finer than anything the harness claims to resolve, over a
period with real mesoscale activity in one domain and real dullness in another, and it has
to be *regenerable*, because a truth record that cannot be regenerated cannot be trusted
(Principle IX).

Three questions had to be answered together.

**Which product.** HYCOM GOFS 3.1 GLBv0.08 expt_53.X is a 1/12°, 41-layer global reanalysis
covering 1994-01-01 to 2015-12-30 at three-hourly resolution, served over OPeNDAP from
`tds.hycom.org` without registration. Alternatives considered: GLORYS (CMEMS) needs an
account and a client library; the operational GOFS analyses do not cover a period with the
Argo density this harness wants; a 1/25° Gulf of Mexico reanalysis is finer but is the
wrong ocean for a Gulf Stream front.

**How the drift gate survives the network** (review R-5). A gate that re-fetches from a
server tests the server. A gate that re-converts a committed input tests the tree. These are
different tests and only the second is a drift gate.

**How big it is.** A five-degree box at 1/12° is about 60 × 60 cells. At six declared depth
levels, three-hourly over fourteen days, in float32, that is roughly 10 MB of temperature
per domain and 1.6 MB of surface elevation, so about 12 MB per domain and 24 MB for both.

## Decision

**The truth record is a HYCOM GLBv0.08 expt_53.X subset, taken server-side over OPeNDAP,
obtained by a fetch step and converted by a separate convert step.**

1. **`data/scripts/fetch.py`** issues the OPeNDAP request with the domain box, the period
   and the depth levels *in the request*, so the subset is taken on the server and not
   locally. It writes the raw NetCDF and a SHA-256 digest beside it. It is the only script
   in the project that touches the network, and it is never run by CI.
2. **`data/scripts/convert.py`** reads the raw file, verifies its digest against the
   recorded one, and writes the committed artefact. It has no network access at all. A
   digest mismatch is reported as *upstream changed*, naming both digests, and nothing is
   written — so a difference is attributed to the tree or to the upstream and never guessed.
3. **Gate G-01** runs the convert step into a temporary directory and compares byte for
   byte with what is committed, naming the artefact and the first differing offset.

**The raw subset is committed.** It is about 24 MB across both domains, which is a real cost
in a repository that will otherwise stay small, and it buys a drift gate that needs no
network, no credentials and no cache: a fresh checkout can regenerate every artefact and
prove it. The alternative — caching outside the tree with only the digest committed — makes
CI depend on a server that has no obligation to this project. This is recorded as a
Complexity Tracking entry in the beat 002 plan.

**The period is 2013-09-01T00:00:00Z to 2013-09-15T00:00:00Z**, fourteen days at
three-hourly resolution: seven days for spin-up and the issue-time range of beat 009, and
seven for the 96 h horizon from the latest issue time. The configuration schema enforces
that arithmetic rather than trusting it. The year is inside expt_53.X and comfortably after
Argo reached useful density in the North Atlantic.

> **Open, and the author's to overturn (review R-6).** The dates were chosen by this ADR
> because the beat could not otherwise start, on the grounds that any fourteen-day window in
> the period satisfies the arithmetic and the domain contrast. If the author wants a
> particular meander, changing the dates is an edit to configuration and a re-run of the two
> scripts, not a change to any code.

**The declared depth levels are 0, 50, 100, 200, 400 and 700 m**, which are exact HYCOM
levels, so no interpolation happens at build time.

## Consequences

**Good.** Regeneration is hermetic. `fetch.py` names its inputs and outputs and is run by a
person; `convert.py` is pure and is run by the gate. Because the levels are exact HYCOM
levels, the convert step does no vertical interpolation, so nothing is silently smoothed
between the server and the artefact.

**Accepted costs.** About 24 MB of raw NetCDF in the repository. A period fixed by this ADR
rather than by the author. And the resolution ceiling of review R-2: at 1/12° on a
five-degree box the truth is about 60 × 60 while the model grid is 100 × 100, so **the truth
is coarser than the model**. The artefact records its native resolution, the configuration
records the truth-to-model ratio, and beat 006 declines to score below the truth's own
resolution. The SRD §4 note that implies otherwise is to be corrected by its author.

**What would change this.** A product with the same openness at finer resolution over a
period with Argo, or a decision that the repository must not carry the raw subset. The
second is cheap: the convert step already takes a path, and the fetch step already writes a
digest.
