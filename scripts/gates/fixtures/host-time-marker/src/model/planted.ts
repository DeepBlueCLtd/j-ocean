// Planted violation for gate G-04: the exemption marker in a module that may not carry it.
// Constitution Principle I bounds the exemptions to the timing module and the
// seed-provisioning step, and says a third must be argued on its own merits.
export function jitter(): number {
  // j-ocean:allow-host-time it seemed convenient
  return Math.random();
}
