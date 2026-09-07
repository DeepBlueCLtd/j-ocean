---
title: "Beat 014: the narrative leaves the application"
summary: Every panel carried an aside explaining why it was there. The asides were the reason the surface could be trusted, and they were read once and occupied the screen forever — so thirty-one of them left for this site or for a help entry that does not exist yet, and a record on disk says where each one went.
date: 2026-09-19
---

# Beat 014: the narrative leaves the application

Beat 013 divided the application into four regions and folded every narrative panel into the
controls column's disclosures. It deliberately did not delete the prose: deleting prose is this
beat's job, and doing it inside a layout beat would have made 013's scope claim untrue.

So this beat opened each disclosure and asked one question of what was in it. **Does a reader
drive this, or read a live figure from it, or is it an explanation?**

- Drives it, or reads a live figure from it — it stays, compacted, in the region that owns it.
- Explains a panel that stays — it goes to that panel's help, which beat 016 builds.
- States no live figure at all — it goes to this site.

Forty-five pieces of matter were asked the question. Fourteen stayed, twenty-three came here,
and eight are owed to beat 016. [The disposition](../disposition.html) is the record of all
forty-five, and it is generated from
[`docs/narrative-disposition.json`](https://github.com/DeepBlueCLtd/j-ocean/blob/main/docs/narrative-disposition.json)
rather than written beside it.

## The record is the point, not the tidying

*We tidied the page* and *we deleted the explanation* look identical from the outside, and they
look identical six months later to the person who wrote both. The record is what keeps them
apart: it carries the words themselves, so a paragraph bound for a help entry that does not
exist yet is in the repository rather than in a diff nobody will find again.

`tests/docs/disposition.test.ts` holds it three ways. Every entry that went to the site has to
resolve to a heading that exists in a page here, and that section has to contain the words —
not a paraphrase of them. Every entry that stayed has to name one of the four regions. And
every entry owed to beat 016 is counted, so the holes cannot quietly grow: the number is
asserted, and the day somebody sends a ninth paragraph into a destination that does not exist,
the suite says so.

It was watched failing before it was trusted, on an entry pointing at a heading no page has.
The failure names the entry and the destination it expected, which is the whole of SC-002.

## What the record found

Three of the spec's proposed dispositions were wrong about the surface as built, and the built
surface won.

**The truth record is not static.** The spec proposed moving the whole *record this run is
scored against* panel here, on the ground that derived-artefact facts do not change while a
reader works. On the built surface they do: beat 013 added the domain choice of SRD-v1 FR-11,
and choosing the other domain changes every figure in that panel. So the figures stayed in the
controls region, which owns that cause, and only the sentences explaining them came here.

**The footprint figures were already where they belong.** The spec proposed sending them to the
detail region. The detail region is FR-047's — whatever was last selected — and the footprint
counts had been drawn in the controls column beside the toggles that change them since beat
008. They stayed.

**There is no footer aside to move.** The spec's table has a row for one. Beat 013 had already
removed it.

## Two figures that had never said what they were

A beat that is forbidden to change any number is good at finding numbers that were being drawn
wrongly, because removing the sentence around a figure means looking at the figure.

The cell breakdown prints, for a selected cell, the individual observations that carried its
weight: `ownship-xbt/0003/interface 0.3%`. Those percentages have been **computed figures
printed as plain text since beat 005** — no kind, no provenance, indistinguishable from prose,
which is exactly what Principle V exists to prevent. They are drawn as computed now.

The same for the recorded case's label. `run.recordedCaseLabel` is a declared value and the
sentence carrying it was drawing it as ordinary text. It is declared now, and looks it.

Neither is a change to what is computed. Both were found by the test that counts prose, because
a block with no figure in it is prose — and a figure that is not drawn as one is invisible to
that rule, which is how the rule found them.

## Nothing computed moved

Gate **G-07** walks the recorded case from the declared seed and digests forty-one quantities.
Removing prose computes nothing, so any digest that moved would mean a figure was being computed
in order to be written into a sentence — a finding under FR-40 rather than a thing to re-record.

**All forty-one are byte-identical, and `scripts/gates/records/surface-invariance.json` is
untouched by this beat.** There was nothing to find.

## The floor did not fall

Beat 013 measured the smallest viewport the four regions hold at 2,038 × 682 CSS pixels, and
this beat removes content, so the floor was re-measured rather than assumed.

It is **2,038 × 682**, unchanged. That is not a surprise once the measurement is read: the floor
is set by the centre stack — six panels at their declared minimum, and the score statements
beneath them — and the prose this beat removed was in the controls column, in the disclosures
and in the detail region. Removing it left the column shorter and the floor where it was. So no
declared figure changed and no digest was re-recorded.

## What a reader loses between here and beat 016

Eight explanations are gone from the application and their help entries do not exist yet. A
reader who wonders how to reach the profile editor, or why a breakdown is of a cell and never of
a panel, has to come here for the answer until beat 016 builds panel help.

That is the trade the beat's plan accepted and it is worth saying plainly. Holding this beat
until 016 would have left 013's viewport unwinnable, and the alternative — a paragraph deleted
without a destination — is the thing this whole beat exists to prevent.

## Measured

Thirty-one paragraphs off the application page. Zero prose blocks outside the not-operational
statement, measured in the browser in seven states — on arrival, with every disclosure open,
with the row built, scored, a panel enlarged, a cell selected, and below the declared floor.
The statement of FR-02 is still there, still without interaction, still measured rather than
asserted.

266 headless tests, 59 shell tests, eight gates, and forty-one digests that did not move.
