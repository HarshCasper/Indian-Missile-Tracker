# Data schema reference

All records are YAML under `data/`, validated by the Zod schemas in
[`src/schema.ts`](../src/schema.ts) (the authoritative definition — this document
describes it in prose). Three record types: **facilities**, **missiles**, **tests**.

Common principles:

- **Provenance everywhere.** Every missile and test carries `sources`, a
  `confidence` rating (`confirmed` | `reported` | `disputed`), and freeform `notes`.
- **Nullable geo.** Coordinates, apogee, bearing, and impact are optional/nullable;
  the schema never forces a fabricated value.
- **Capability vs. demonstrated.** `missile.range_km` is advertised capability;
  `test.range_tested_km` is what a specific flight actually flew.

## `source` (shared sub-object)

| field       | type   | notes                                  |
| ----------- | ------ | -------------------------------------- |
| `title`     | string | required                               |
| `url`       | string | optional (omit for books/offline refs) |
| `publisher` | string | e.g. "PIB", "The Hindu", "Reuters"     |
| `tier`      | enum   | **required** — `pib` \| `indian-news` \| `foreign-news` \| `further-reading` |
| `date`      | string | publication date, ISO `YYYY[-MM[-DD]]` |
| `accessed`  | string | when the page was last checked, ISO    |

### Source precedence & the Wikipedia rule

`tier` encodes precedence, highest → lowest:

1. **`pib`** — Press Information Bureau / MoD / DRDO / ISRO official releases.
2. **`indian-news`** — Indian outlets (The Hindu, PTI, Indian Express, ANI, …).
3. **`foreign-news`** — reputable foreign press / think-tanks (Reuters, Janes, CSIS, NTI, …).
4. **`further-reading`** — Wikipedia & other tertiary refs. **Never a citation.**

Hard rule (schema-enforced): any source whose `url` is on `wikipedia.org` **must** be
`tier: further-reading`. A record whose only sources are `further-reading` has no
primary citation — `build-data.ts` warns and the app marks it `needs_primary_source`.

## `claim` (shared sub-object) — disputed / multi-sourced figures

Public figures often conflict (e.g. the government understates Agni-V's range while
analysts assess higher). Rather than flatten to one number, store each as a `claim`
with its own source. The headline scalar fields (`range_km`, …) stay canonical for
geometry/filtering; `claims` carry the alternatives the UI shows alongside.

| field    | type     | notes                                                       |
| -------- | -------- | ----------------------------------------------------------- |
| `field`  | string   | what it refers to, e.g. `range_km`, `payload_kg`, `apogee_km` |
| `basis`  | enum     | `official` \| `assessed` \| `reported` \| `demonstrated`    |
| `min`/`max`/`value` | number? | numeric claim (range or point); at least one required (or `text`) |
| `text`   | string?  | non-numeric claim                                           |
| `source` | source   | **each claim carries its own source**                       |
| `note`   | string?  | optional                                                    |

## `data/facilities.yaml` — list of launch sites

| field             | type      | notes                                                       |
| ----------------- | --------- | ----------------------------------------------------------- |
| `id`              | string    | slug, referenced by `test.site_id`                          |
| `name`            | string    |                                                             |
| `aka`             | string[]  | alternative names                                           |
| `lat`, `lon`      | number    | decimal degrees                                             |
| `state`           | string    | optional                                                    |
| `default_bearing` | number    | 0–360°; seaward/down-range azimuth for **indicative** arcs  |
| `sources`         | source[]  |                                                             |
| `notes`           | string    | optional                                                    |

## `data/missiles/<id>.yaml` — one system

| field             | type     | notes                                                                 |
| ----------------- | -------- | --------------------------------------------------------------------- |
| `id`              | string   | slug, referenced by `test.missile_id`                                 |
| `name`            | string   |                                                                       |
| `aka`             | string[] | alternative designations                                              |
| `category`        | enum     | operational role — see **Categories**                                 |
| `range_class`     | enum?    | range/propulsion class — see **Range classes**                        |
| `developer`       | string?  |                                                                       |
| `operators`       | string[] |                                                                       |
| `status`          | enum     | `development` \| `operational` \| `retired` \| `cancelled` \| `unknown` |
| `range_km`        | {min?,max?} | at least one of min/max                                            |
| `payload_kg`      | number?  |                                                                       |
| `speed_mach`      | number?  |                                                                       |
| `nuclear_capable` | boolean  | default `false`                                                       |
| `propulsion`      | enum?    | `solid` \| `liquid` \| `solid+liquid` \| `ramjet` \| `scramjet` \| `turbojet` \| `turbofan` \| `unknown` |
| `launch_platform` | string[] |                                                                       |
| `variants`        | variant[] | `{ name, range_km?, notes? }`                                        |
| `first_test`      | string?  | ISO date or null                                                      |
| `description`     | string?  | markdown-ish freeform                                                 |
| `claims`          | claim[]  | disputed / multi-sourced figures (e.g. official vs assessed range)    |
| `sources`         | source[] |                                                                       |
| `confidence`      | enum     | default `reported`                                                    |
| `notes`           | string?  |                                                                       |

## `data/tests/<date>-<id>.yaml` — one flight test

| field             | type     | notes                                                          |
| ----------------- | -------- | -------------------------------------------------------------- |
| `id`              | string   | unique; convention `YYYY[-MM[-DD]]-<missile>-<desc>`           |
| `missile_id`      | string   | **must** match a missile `id`                                  |
| `variant`         | string?  | optional variant name                                          |
| `date`            | string?  | ISO `YYYY[-MM[-DD]]`, or `null` if unknown                     |
| `date_precision`  | enum     | `day` \| `month` \| `year` (default `day`)                     |
| `designation`     | string?  | e.g. "Mission Divyastra"                                       |
| `site_id`         | string?  | **must** match a facility `id`, or `null` if unknown           |
| `outcome`         | enum     | `success` \| `partial` \| `failure` \| `unknown`               |
| `range_tested_km` | number?  | distance flown in this test                                    |
| `bearing_deg`     | number?  | real firing azimuth; `null` → facility default (→ indicative)  |
| `apogee_km`       | number?  |                                                                |
| `impact`          | {lat,lon}? | published impact point (wins over computed endpoint)         |
| `description`     | string?  |                                                                |
| `claims`          | claim[]  | disputed / multi-sourced figures for this specific flight      |
| `sources`         | source[] |                                                                |
| `confidence`      | enum     | default `reported`                                             |
| `notes`           | string?  |                                                                |

### How a test's globe geometry is derived (in `build-data.ts`)

1. If `impact.lat/lon` is given → that's the arc endpoint (not indicative).
2. Else if the site and a distance (`range_tested_km`, else the missile's max
   `range_km`) are known → endpoint = great-circle destination from the site,
   using `bearing_deg` if present, otherwise the facility `default_bearing`
   (and the test is flagged `indicative: true`).
3. Else no arc is drawn (the test still appears in filters and the drawer).

## Categories

`surface-to-surface`, `surface-to-air`, `air-to-air`, `air-to-surface`,
`anti-ship`, `anti-tank`, `anti-satellite`, `ballistic-missile-defence`,
`submarine-launched`, `cruise`, `technology-demonstrator`, `other`.

## Range classes

`SRBM`, `MRBM`, `IRBM`, `ICBM`, `SLBM`, `cruise`, `SAM`, `AAM`, `AShM`, `ATGM`,
`ASAT`, `ABM`, `other`.

## Range bands (derived, used by the filter)

Computed from a missile's max range: `short` (<1000 km), `medium` (<3000 km),
`intermediate` (<5500 km), `intercontinental` (≥5500 km).
