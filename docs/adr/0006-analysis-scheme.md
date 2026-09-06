# ADR-0006: The analysis is optimal interpolation with an isotropic covariance

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owed by:** SRD review R-7
- **Written before:** beat 005

## Context

The analysis combines a background, a set of observations and a climatology into an initial
condition, and in doing so decides how much each was worth in each cell. Those decisions
*are* the attribution field (Principle IV), so the choice of scheme is not only a choice
about accuracy — it is a choice about what the harness can explain.

Three schemes were considered.

**Optimal interpolation** with a declared background-error covariance. The gain matrix is
written down explicitly, so every cell's weights are available in closed form and the
attribution field is exactly the row sums of the gain. Its weakness is that the covariance is
*declared* and static: the influence radius a reader sees is a property of the declared length
scale rather than of the flow.

**3D-Var** with the same covariance. Identical weights, obtained by iterating rather than by
inverting a small dense matrix. More machinery, the same answer, and the gain is no longer
available in closed form — so the attribution would have to be estimated from the solution
instead of read from the arithmetic. That is the wrong direction for this project.

**An ensemble Kalman filter.** Flow-dependent covariance, which is the honest answer to the
static-covariance objection: the influence of an observation would then be a property of the
ocean rather than of a declared number. It needs an ensemble, and the ensemble is beat 012.

## Decision

**The analysis is optimal interpolation with an isotropic Gaussian background-error
covariance of declared length scale and variance, over interface depth as the state
variable.**

    x_a = x_p + K(y − H x_p),      K = B Hᵀ (H B Hᵀ + R)⁻¹
    B_ij = σ_b² exp(−d²_ij / 2L²),   R = diag(σ²_o)

`x_p` is the declared blend of the advected background and the climatology; `H` selects the
cell an observation sits in; `R` is diagonal, from each observation's own declared error.

**The state variable is interface depth**, not velocity and not temperature. It is the
model's own prognostic variable, it is what ADR-0005's observation operator produces, and it
is a quantity a reader can point at. Velocity is diagnosed geostrophically from the analysed
interface, as at initialisation. Analysing velocity directly was rejected because the
observations do not measure it and the operator would have to invent the link.

**The weights are exact, not estimated.** Because `H` selects one cell per observation,
`H·1 = 1`, and therefore at every cell

    Σ_k (I − K H)_ik + Σ_j K_ij = 1

The row sum of `K` is the weight the observations carried there; one minus it is the prior's
weight, which the declared blend splits between background and climatology. Nothing is
smoothed, normalised by hand or painted. That identity is why this scheme was chosen over
3D-Var, which gives the same numbers by a route that does not hand you them.

## Consequences

**Good.** The attribution field is the analysis, exported. A cell's breakdown is a row of the
gain. One observation's influence field is a column of it. All three come from the same
arithmetic as the answer, which is the whole of Principle IV, and it costs a Cholesky
factorisation of an m × m matrix where m is a few tens.

**Accepted costs, and the important one is review R-7's.** The covariance is isotropic and
static, so **the influence radius a reader sees is a property of the declared length scale,
not of the ocean.** An observation across a front influences cells on the other side of it
exactly as much as cells on its own, which is wrong in a way the flow would not be. The
surface therefore labels the radius **declared**, never computed, and says the length scale
beside it. Beat 012's ensemble spread is the flow-dependent answer, and ADR-0011 records the
trigger.

The one-sided bounds ADR-0005 produces are admitted with their error inflated by a declared
factor rather than as measurements, and the analysis record names which observations that
happened to.

**What would change this.** The ensemble arriving in beat 012, which makes a flow-dependent
covariance available for the cost of using it. That is a new ADR superseding this one, and the
interface it would have to satisfy — a gain whose rows and columns can be read — is already
what this one publishes.
