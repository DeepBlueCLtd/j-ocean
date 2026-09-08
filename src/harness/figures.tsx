import type { ReactNode } from 'react';

/**
 * The surface's vocabulary for a figure (constitution Principle V, NFR-05).
 *
 * Three kinds of figure -- **declared** (a value in configuration, validated before anything
 * ran), **computed** (produced by the model or the analysis on this visit) and **derived**
 * (diagnosed from computed state) -- are typographically distinct and never change kind
 * between states, plus **host time**, which is how long the machinery took and is never
 * simulation time.
 *
 * They live in a module of their own rather than in the shell so that anything drawing a
 * figure reaches for these rather than inventing a second set. Panel help reaches for
 * `Declared` and for nothing else here on purpose: FR-055 says help teaches and does not
 * report, so the only number a help entry may carry is one that was decided in advance.
 */

export function Declared({ children }: { children: ReactNode }) {
  return <span className="figure declared" title="declared in configuration">{children}</span>;
}

export function Computed({ children }: { children: ReactNode }) {
  return <span className="figure computed" title="computed by the model">{children}</span>;
}

export function HostTime({ children }: { children: ReactNode }) {
  return (
    <span className="figure host-time" title="host time: how long the machinery took, not simulation time">
      {children}
    </span>
  );
}
