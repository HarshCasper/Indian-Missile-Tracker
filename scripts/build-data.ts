import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { z } from 'zod';
import {
  facilitySchema,
  missileSchema,
  testSchema,
  rangeBandFor,
  type Facility,
  type Missile,
  type MissileTest,
  type ResolvedTest,
  type RangeRing,
  type DataBundle,
  type Source,
} from '../src/schema.ts';
import { destinationPoint } from '../src/lib/geo.ts';

/** A record is properly cited if it has ≥1 source that isn't "further-reading". */
function hasPrimarySource(sources: Source[]): boolean {
  return sources.some((s) => s.tier !== 'further-reading');
}

/**
 * build-data.ts — compiles the hand-authored YAML in data/ into a single
 * validated public/data.json the app loads at runtime.
 *
 * Pipeline: read YAML → Zod-validate (fail loud per file) → check referential
 * integrity → precompute geometry (launch + destination points, range rings)
 * → write data.json. Run via `npm run build:data` (also wired to predev/prebuild).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const OUT = join(ROOT, 'public', 'data.json');

const errors: string[] = [];

function fail(file: string, err: unknown): void {
  if (err instanceof z.ZodError) {
    for (const issue of err.issues) {
      errors.push(`  ${file}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
  } else {
    errors.push(`  ${file}: ${(err as Error).message}`);
  }
}

function loadYaml(file: string): unknown {
  return yaml.load(readFileSync(file, 'utf8'));
}

/** Parse + validate every *.yaml in a directory into a list of records. */
function loadDir<S extends z.ZodTypeAny>(dir: string, schema: S): z.infer<S>[] {
  if (!existsSync(dir)) return [];
  const out: z.infer<S>[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort()) {
    const path = join(dir, f);
    try {
      out.push(schema.parse(loadYaml(path)));
    } catch (err) {
      fail(`data/${basename(dir)}/${f}`, err);
    }
  }
  return out;
}

// --- 1. Load + validate ----------------------------------------------------

let facilities: Facility[] = [];
const facPath = join(DATA_DIR, 'facilities.yaml');
if (existsSync(facPath)) {
  try {
    facilities = z.array(facilitySchema).parse(loadYaml(facPath));
  } catch (err) {
    fail('data/facilities.yaml', err);
  }
}

const missiles = loadDir(join(DATA_DIR, 'missiles'), missileSchema);
const tests = loadDir(join(DATA_DIR, 'tests'), testSchema);

// --- 2. Referential integrity ---------------------------------------------

const facById = new Map(facilities.map((f) => [f.id, f]));
const missileById = new Map(missiles.map((m) => [m.id, m]));

const dupCheck = (label: string, ids: string[]) => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`  duplicate ${label} id: ${id}`);
    seen.add(id);
  }
};
dupCheck('facility', facilities.map((f) => f.id));
dupCheck('missile', missiles.map((m) => m.id));
dupCheck('test', tests.map((t) => t.id));

for (const t of tests) {
  if (!missileById.has(t.missile_id)) {
    errors.push(`  test ${t.id}: missile_id "${t.missile_id}" does not match any missile`);
  }
  if (t.site_id !== null && !facById.has(t.site_id)) {
    errors.push(`  test ${t.id}: site_id "${t.site_id}" does not match any facility`);
  }
}

if (errors.length) {
  console.error(`\n✗ Data validation failed (${errors.length} issue(s)):\n${errors.join('\n')}\n`);
  process.exit(1);
}

// --- 3. Precompute geometry ------------------------------------------------

function maxRange(m: Missile | undefined): number | null {
  if (!m?.range_km) return null;
  return m.range_km.max ?? m.range_km.min ?? null;
}

function resolveTest(t: MissileTest): ResolvedTest {
  const m = missileById.get(t.missile_id)!;
  const fac = t.site_id ? facById.get(t.site_id) ?? null : null;

  // 0 means "range to target not the metric / not published" — fall back to the
  // catalog range so flight systems still get an indicative arc (e.g. Agni-Prime).
  const distance = t.range_tested_km || maxRange(m);
  let dest_lat: number | null = null;
  let dest_lon: number | null = null;
  let indicative = false;

  if (t.impact?.lat != null && t.impact?.lon != null) {
    // Real published impact point wins.
    dest_lat = t.impact.lat;
    dest_lon = t.impact.lon;
  } else if (fac && distance != null && distance > 0) {
    const bearing = t.bearing_deg ?? fac.default_bearing;
    indicative = t.bearing_deg == null;
    const d = destinationPoint(fac.lat, fac.lon, distance, bearing);
    dest_lat = d.lat;
    dest_lon = d.lon;
  }

  return {
    ...t,
    missile_name: m.name,
    category: m.category,
    range_class: m.range_class,
    status: m.status,
    nuclear_capable: m.nuclear_capable,
    range_band: rangeBandFor(maxRange(m)),
    site_name: fac?.name ?? null,
    site_lat: fac?.lat ?? null,
    site_lon: fac?.lon ?? null,
    dest_lat,
    dest_lon,
    indicative,
    needs_primary_source: !hasPrimarySource(t.sources),
  };
}

const resolvedTests = tests
  .map(resolveTest)
  .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id));

// One range ring per missile, centered on its primary (most-used, else latest) site.
function primarySiteId(missileId: string): string | null {
  const own = tests.filter((t) => t.missile_id === missileId && t.site_id);
  if (!own.length) return null;
  const counts = new Map<string, number>();
  for (const t of own) counts.set(t.site_id!, (counts.get(t.site_id!) ?? 0) + 1);
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];
}

const rings: RangeRing[] = [];
for (const m of missiles) {
  const radius = maxRange(m);
  const siteId = primarySiteId(m.id);
  if (radius == null || !siteId) continue;
  const fac = facById.get(siteId)!;
  rings.push({
    missile_id: m.id,
    missile_name: m.name,
    category: m.category,
    site_id: siteId,
    site_lat: fac.lat,
    site_lon: fac.lon,
    radius_km: radius,
  });
}

// --- 3b. Sourcing warnings (non-fatal) -------------------------------------
// Wikipedia-in-wrong-tier is a hard schema error; lacking ANY primary source is
// a soft warning surfaced in the UI via `needs_primary_source`.
const unsourcedMissiles = missiles.filter((m) => !hasPrimarySource(m.sources));
const unsourcedTests = resolvedTests.filter((t) => t.needs_primary_source);
if (unsourcedMissiles.length || unsourcedTests.length) {
  console.warn(
    `\n⚠ Sourcing: ${unsourcedMissiles.length} missile(s) and ${unsourcedTests.length} test(s) ` +
      `have no primary (PIB / Indian / foreign news) source — only further-reading.`,
  );
  for (const m of unsourcedMissiles) console.warn(`    missile  ${m.id}`);
  for (const t of unsourcedTests) console.warn(`    test     ${t.id}`);
  console.warn('');
}

// --- 4. Emit ---------------------------------------------------------------

const bundle: DataBundle = {
  facilities: facilities.sort((a, b) => a.id.localeCompare(b.id)),
  missiles: missiles.sort((a, b) => a.id.localeCompare(b.id)),
  tests: resolvedTests,
  rings,
  generated_at: new Date().toISOString(),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bundle, null, 2) + '\n');

// --- 5. RSS feed (newest tests) — lets people subscribe to new DB entries ---
const SITE_URL = 'https://indianmissiletracker.harshcasper.dev';
const xmlEsc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
const rssItems = resolvedTests
  .filter((t) => t.date)
  .slice(-60)
  .reverse() // resolvedTests are sorted ascending by date → newest last
  .map((t) => {
    const title = `${t.missile_name} — ${t.date} — ${t.outcome}`;
    const desc = [t.designation, t.site_name, t.description].filter(Boolean).join(' · ');
    return `    <item>
      <title>${xmlEsc(title)}</title>
      <link>${SITE_URL}/?test=${encodeURIComponent(t.id)}</link>
      <guid isPermaLink="false">${xmlEsc(t.id)}</guid>
      <pubDate>${new Date(t.date as string).toUTCString()}</pubDate>
      <category>${xmlEsc(t.category)}</category>
      <description>${xmlEsc(desc)}</description>
    </item>`;
  })
  .join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Indian Missile Tracker — flight-test register</title>
    <link>${SITE_URL}/</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>New entries in the citation-backed open-source database of India's missile flight tests.</description>
    <language>en-IN</language>
    <lastBuildDate>${new Date(bundle.generated_at).toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;
writeFileSync(join(ROOT, 'public', 'rss.xml'), rss);

console.log(
  `✓ data.json + rss.xml written: ${facilities.length} facilities, ${missiles.length} missiles, ` +
    `${resolvedTests.length} tests, ${rings.length} rings`,
);
