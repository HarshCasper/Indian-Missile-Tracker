/**
 * focus.ts — the Map view's selection model. Instead of dumping every arc, the
 * globe shows exactly what is in focus:
 *   none    — calm cold open: launch sites only.
 *   site    — one facility highlighted; its tests fan out as arcs.
 *   missile — one system isolated: all its test arcs + its range ring; rest fades.
 *   test    — a single flight: reticle-locked, that arc + its system's ring.
 */
export type Focus =
  | { kind: 'none' }
  | { kind: 'site'; siteId: string }
  | { kind: 'missile'; missileId: string }
  | { kind: 'test'; testId: string };

export const NO_FOCUS: Focus = { kind: 'none' };
