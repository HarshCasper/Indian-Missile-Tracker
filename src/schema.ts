import { z } from 'zod';

/**
 * schema.ts — the single source of truth for the dataset.
 *
 * These Zod schemas are reused in three places:
 *   1. scripts/build-data.ts validates every authored YAML record against them.
 *   2. The inferred TypeScript types describe the data throughout the app.
 *   3. The exported enum arrays drive the filter UI options (so the controls can
 *      never drift out of sync with what the schema actually allows).
 *
 * Design principles:
 *   - Nothing is asserted without provenance: every record carries `sources`,
 *     a `confidence` rating, and freeform `notes`.
 *   - Geospatial facts are nullable first-class citizens — the schema never
 *     forces a fabricated coordinate, apogee, or impact point.
 *   - Advertised capability (missile.range_km) is kept distinct from what a
 *     given flight actually demonstrated (test.range_tested_km).
 */

// ---------------------------------------------------------------------------
// Controlled vocabularies (also exported for the filter UI + legends)
// ---------------------------------------------------------------------------

/** Operational role of the system — the user-facing primary classification. */
export const CATEGORIES = [
  'surface-to-surface',
  'surface-to-air',
  'air-to-air',
  'air-to-surface',
  'anti-ship',
  'anti-tank',
  'anti-satellite',
  'ballistic-missile-defence',
  'submarine-launched',
  'cruise',
  'technology-demonstrator',
  'other',
] as const;

/** Range / propulsion class — secondary axis (ballistic tiers, cruise, etc.). */
export const RANGE_CLASSES = [
  'SRBM',
  'MRBM',
  'IRBM',
  'ICBM',
  'SLBM',
  'cruise',
  'SAM',
  'AAM',
  'AShM',
  'ATGM',
  'ASAT',
  'ABM',
  'other',
] as const;

/** Coarse range band used by the range-band filter. Derived, not authored. */
export const RANGE_BANDS = ['short', 'medium', 'intermediate', 'intercontinental'] as const;

export const STATUSES = ['development', 'operational', 'retired', 'cancelled', 'unknown'] as const;

export const OUTCOMES = ['success', 'partial', 'failure', 'unknown'] as const;

export const PROPULSIONS = [
  'solid',
  'liquid',
  'solid+liquid',
  'ramjet',
  'scramjet',
  'turbojet',
  'turbofan',
  'unknown',
] as const;

/** How well-supported a record is by public sources. */
export const CONFIDENCE = ['confirmed', 'reported', 'disputed'] as const;

/**
 * Source precedence, highest → lowest. Wikipedia (and other tertiary refs) may
 * ONLY be `further-reading`; they never count as a citation. Enforced below.
 *   pib            — Press Information Bureau / MoD / DRDO / ISRO official release
 *   indian-news    — Indian outlets (The Hindu, PTI, Indian Express, ANI, …)
 *   foreign-news   — reputable foreign press / think-tanks (Reuters, Janes, CSIS, …)
 *   further-reading — Wikipedia & tertiary refs; de-emphasized, never a citation
 */
export const SOURCE_TIERS = ['pib', 'indian-news', 'foreign-news', 'further-reading'] as const;

/** Tiers that count as a real citation (everything except further-reading). */
export const PRIMARY_TIERS = ['pib', 'indian-news', 'foreign-news'] as const;

/** Basis of a (possibly disputed) numeric/text claim. */
export const CLAIM_BASES = ['official', 'assessed', 'reported', 'demonstrated'] as const;

export type Category = (typeof CATEGORIES)[number];
export type RangeClass = (typeof RANGE_CLASSES)[number];
export type RangeBand = (typeof RANGE_BANDS)[number];
export type Status = (typeof STATUSES)[number];
export type Outcome = (typeof OUTCOMES)[number];
export type Propulsion = (typeof PROPULSIONS)[number];
export type Confidence = (typeof CONFIDENCE)[number];
export type SourceTier = (typeof SOURCE_TIERS)[number];
export type ClaimBasis = (typeof CLAIM_BASES)[number];

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/**
 * A citation. `url` is optional so books / non-web references are allowed.
 * `tier` encodes source precedence (PIB > Indian news > foreign news >
 * further-reading). Wikipedia URLs are constrained to `further-reading`.
 */
export const sourceSchema = z
  .object({
    url: z.string().url().optional(),
    title: z.string().min(1),
    publisher: z.string().optional(),
    tier: z.enum(SOURCE_TIERS),
    /** Publication date, ISO `YYYY-MM-DD` (or partial). */
    date: z.string().optional(),
    /** When the cited page was last accessed, ISO `YYYY-MM-DD`. */
    accessed: z.string().optional(),
  })
  .refine((s) => !(s.url && /(\.|^)wikipedia\.org/i.test(s.url)) || s.tier === 'further-reading', {
    message: 'Wikipedia URLs must use tier "further-reading" — never cited as a news source',
  });

/**
 * A single sourced claim about a (often disputed) figure — e.g. the officially
 * stated range vs. an independently assessed one. Each claim carries its own
 * source so conflicting public numbers are represented faithfully rather than
 * flattened into one value. `field` names what it refers to (e.g. "range_km").
 */
export const claimSchema = z
  .object({
    field: z.string().min(1),
    basis: z.enum(CLAIM_BASES),
    min: z.number().optional(),
    max: z.number().optional(),
    value: z.number().optional(),
    text: z.string().optional(),
    source: sourceSchema,
    note: z.string().optional(),
  })
  .refine((c) => c.min != null || c.max != null || c.value != null || c.text != null, {
    message: 'claim must specify at least one of min / max / value / text',
  });

/** Public figures vary widely, so a range is expressed as an open min/max. */
export const rangeKmSchema = z
  .object({
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional(),
  })
  .refine((r) => r.min !== undefined || r.max !== undefined, {
    message: 'range_km must specify at least one of min or max',
  });

export const variantSchema = z.object({
  name: z.string().min(1),
  range_km: rangeKmSchema.optional(),
  notes: z.string().optional(),
});

// ISO date (YYYY-MM-DD); partial dates are allowed via date_precision on tests.
const isoDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'expected ISO date YYYY[-MM[-DD]]');

// ---------------------------------------------------------------------------
// Facilities — finite, hand-maintained launch sites
// ---------------------------------------------------------------------------

export const facilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aka: z.array(z.string()).default([]),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  state: z.string().optional(),
  /**
   * Default outbound bearing (degrees clockwise from north) used to draw an
   * "indicative" test arc when the real firing azimuth is unknown — typically
   * pointing seaward into the Bay of Bengal test corridor.
   */
  default_bearing: z.number().min(0).max(360).default(135),
  sources: z.array(sourceSchema).default([]),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Missiles — the system / catalog entry
// ---------------------------------------------------------------------------

export const missileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aka: z.array(z.string()).default([]),
  category: z.enum(CATEGORIES),
  range_class: z.enum(RANGE_CLASSES).optional(),
  developer: z.string().optional(),
  operators: z.array(z.string()).default([]),
  status: z.enum(STATUSES).default('unknown'),
  range_km: rangeKmSchema.optional(),
  payload_kg: z.number().nonnegative().nullable().optional(),
  speed_mach: z.number().nonnegative().nullable().optional(),
  nuclear_capable: z.boolean().default(false),
  propulsion: z.enum(PROPULSIONS).optional(),
  launch_platform: z.array(z.string()).default([]),
  variants: z.array(variantSchema).default([]),
  first_test: isoDate.nullable().optional(),
  description: z.string().optional(),
  /** Disputed / multi-sourced figures (e.g. official vs assessed range). */
  claims: z.array(claimSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  confidence: z.enum(CONFIDENCE).default('reported'),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Tests — a single flight-test event
// ---------------------------------------------------------------------------

export const testSchema = z.object({
  id: z.string().min(1),
  missile_id: z.string().min(1),
  variant: z.string().nullable().optional(),
  /** ISO date; null when only "year unknown" etc. is recorded (see notes). */
  date: isoDate.nullable(),
  date_precision: z.enum(['day', 'month', 'year']).default('day'),
  designation: z.string().optional(),
  /** FK to a facility; null when the launch site is unknown. */
  site_id: z.string().nullable(),
  outcome: z.enum(OUTCOMES).default('unknown'),
  /** Distance flown in THIS test (km) — distinct from the catalog max range. */
  range_tested_km: z.number().nonnegative().nullable().optional(),
  /** Firing azimuth (deg from north). Null → fall back to facility default. */
  bearing_deg: z.number().min(0).max(360).nullable().optional(),
  apogee_km: z.number().nonnegative().nullable().optional(),
  impact: z
    .object({ lat: z.number().min(-90).max(90).nullable(), lon: z.number().min(-180).max(180).nullable() })
    .optional(),
  description: z.string().optional(),
  /** Disputed / multi-sourced figures for this specific flight. */
  claims: z.array(claimSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  confidence: z.enum(CONFIDENCE).default('reported'),
  notes: z.string().optional(),
});

export type Source = z.infer<typeof sourceSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type RangeKm = z.infer<typeof rangeKmSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Facility = z.infer<typeof facilitySchema>;
export type Missile = z.infer<typeof missileSchema>;
export type MissileTest = z.infer<typeof testSchema>;

// ---------------------------------------------------------------------------
// Resolved output types — what `public/data.json` actually contains.
// build-data.ts denormalizes missile attributes onto each test and precomputes
// the launch/destination coordinates so the globe can render without joins.
// ---------------------------------------------------------------------------

export interface ResolvedTest extends MissileTest {
  // Denormalized from the referenced missile (for fast filtering on the globe):
  missile_name: string;
  category: Category;
  range_class?: RangeClass;
  status: Status;
  nuclear_capable: boolean;
  range_band: RangeBand | null;
  // Precomputed geometry (null when site/distance unavailable):
  site_name: string | null;
  site_lat: number | null;
  site_lon: number | null;
  dest_lat: number | null;
  dest_lon: number | null;
  /** True when the arc direction came from the facility default, not a real azimuth. */
  indicative: boolean;
  /** True when the record has no primary (non-further-reading) source backing it. */
  needs_primary_source: boolean;
}

/** One operational range ring per missile, centered on its primary launch site. */
export interface RangeRing {
  missile_id: string;
  missile_name: string;
  category: Category;
  site_id: string;
  site_lat: number;
  site_lon: number;
  radius_km: number;
}

export interface DataBundle {
  facilities: Facility[];
  missiles: Missile[];
  tests: ResolvedTest[];
  rings: RangeRing[];
  /** ISO datetime the bundle was generated. */
  generated_at: string;
}

/** Map a max range (km) to a coarse band for the range-band filter. */
export function rangeBandFor(maxKm: number | undefined | null): RangeBand | null {
  if (maxKm == null) return null;
  if (maxKm < 1000) return 'short';
  if (maxKm < 3000) return 'medium';
  if (maxKm < 5500) return 'intermediate';
  return 'intercontinental';
}
