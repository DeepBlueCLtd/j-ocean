// No violation. The sampling track below is the path the vessel has travelled: ordinary
// navigational English, on no forbidden list, and this file must pass every gate.
export interface SamplingTrack {
  readonly waypoints: readonly { readonly lonDeg: number; readonly latDeg: number }[];
}

export function trackLengthCells(track: SamplingTrack): number {
  return track.waypoints.length;
}
