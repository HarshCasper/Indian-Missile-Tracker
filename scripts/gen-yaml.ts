import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { z } from 'zod';
import { facilitySchema, missileSchema, testSchema } from '../src/schema.ts';

/**
 * gen-yaml.ts — turn a JSON research blob into clean, schema-valid YAML files
 * under data/. Used to import the output of the data-compilation workflows.
 *
 *   tsx scripts/gen-yaml.ts <blob.json>
 *
 * Blob shape: { facilities?: [], missiles?: [], tests?: [] }
 * Each record is cleaned (empty strings / empty arrays / empty objects / null
 * dropped), validated against the Zod schema (fails loud per record), then
 * written to data/<kind>/<id>.yaml (facilities to data/facilities.yaml as one list).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');

const blobPath = process.argv[2];
if (!blobPath) {
  console.error('usage: tsx scripts/gen-yaml.ts <blob.json>');
  process.exit(1);
}
const blob = JSON.parse(readFileSync(blobPath, 'utf8')) as {
  facilities?: unknown[];
  missiles?: unknown[];
  tests?: unknown[];
};

const DUMP_OPTS: yaml.DumpOptions = { lineWidth: 100, noRefs: true, quotingType: '"', forceQuotes: false };

/** Recursively drop undefined/null/''/[]/{} so generated YAML stays terse. */
function clean<T>(v: T): T | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v.trim() === '' ? undefined : (v as T);
  if (Array.isArray(v)) {
    const arr = v.map(clean).filter((x) => x !== undefined);
    return (arr.length ? (arr as T) : undefined);
  }
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const c = clean(val);
      if (c !== undefined) out[k] = c;
    }
    return (Object.keys(out).length ? (out as T) : undefined);
  }
  return v;
}

let written = 0;
const errors: string[] = [];

function emit<S extends z.ZodTypeAny>(
  kind: string,
  raw: unknown,
  schema: S,
  idOf: (r: z.infer<S>) => string,
  dir: string,
  // Keys that are required-but-nullable: re-assert as null after cleaning so a
  // genuinely-unknown value still satisfies the schema (clean() drops nulls).
  forceNullKeys: string[] = [],
) {
  const cleaned = (clean(raw) ?? {}) as Record<string, unknown>;
  for (const k of forceNullKeys) if (!(k in cleaned)) cleaned[k] = null;
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const id = (cleaned.id as string) ?? '(no id)';
    for (const issue of parsed.error.issues) {
      errors.push(`  ${kind} ${id}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return;
  }
  const id = idOf(parsed.data);
  mkdirSync(dir, { recursive: true });
  // Write the CLEANED (pre-default) object so YAML stays minimal; build-data re-applies defaults.
  writeFileSync(join(dir, `${id}.yaml`), yaml.dump(cleaned, DUMP_OPTS));
  written++;
}

for (const m of blob.missiles ?? []) {
  emit('missile', m, missileSchema, (r) => r.id, join(DATA, 'missiles'));
}
for (const t of blob.tests ?? []) {
  emit('test', t, testSchema, (r) => r.id, join(DATA, 'tests'), ['date', 'site_id']);
}

// Facilities are a single list file; merge-by-id with any existing ones.
if (blob.facilities?.length) {
  const cleanedFacs = blob.facilities.map((f) => clean(f)).filter(Boolean) as Record<string, unknown>[];
  const ok: unknown[] = [];
  for (const f of cleanedFacs) {
    const parsed = facilitySchema.safeParse(f);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`  facility ${(f.id as string) ?? '?'}: ${issue.path.join('.')} — ${issue.message}`);
    } else ok.push(f);
  }
  if (ok.length) {
    writeFileSync(join(DATA, 'facilities.yaml'), yaml.dump(ok, DUMP_OPTS));
    written += ok.length;
  }
}

if (errors.length) {
  console.error(`\n✗ gen-yaml: ${errors.length} record(s) failed validation:\n${errors.join('\n')}\n`);
  process.exit(1);
}
console.log(`✓ gen-yaml: wrote ${written} record(s)`);
