import type { Missile } from '../schema';

/**
 * agency.ts — the `developer` field is 23 messy "DRDO (…)" strings, but
 * `operators` cleanly implies the operating service. We normalize operators into
 * a small set of service branches for the analytics "by service" plate and the
 * dossier. A system can map to several branches (e.g. Army + Navy + Air Force).
 */

export const SERVICE_BRANCHES = [
  'Indian Army',
  'Indian Navy',
  'Indian Air Force',
  'Strategic Forces Command',
  'DRDO trials',
] as const;

export type ServiceBranch = (typeof SERVICE_BRANCHES)[number];

export function branchesFor(operators: string[] | undefined): ServiceBranch[] {
  const s = new Set<ServiceBranch>();
  for (const raw of operators ?? []) {
    const o = raw.toLowerCase();
    if (o.includes('army')) s.add('Indian Army');
    if (o.includes('navy')) s.add('Indian Navy');
    if (o.includes('air force')) s.add('Indian Air Force');
    if (o.includes('strategic forces')) s.add('Strategic Forces Command');
  }
  if (s.size === 0) s.add('DRDO trials');
  return [...s];
}

/** A short, de-noised developer label (collapse the long "DRDO (...)" strings). */
export function shortDeveloper(developer: string | undefined): string {
  if (!developer) return 'DRDO';
  if (/brahmos/i.test(developer)) return 'BrahMos Aerospace';
  const m = developer.match(/\b(DRDL|RCI|ADE|ARDE|ASL|HEMRL)\b/);
  if (/drdo/i.test(developer)) return m ? `DRDO · ${m[1]}` : 'DRDO';
  return developer;
}

export function branchesForMissile(m: Missile): ServiceBranch[] {
  return branchesFor(m.operators);
}
