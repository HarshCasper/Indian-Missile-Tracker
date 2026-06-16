# Contributing data

The dataset is the heart of this project. Adding a missile or a test is just
writing a small YAML file and running the validator. See
[`SCHEMA.md`](SCHEMA.md) for every field.

## Golden rules

1. **Cite everything.** Each record needs at least one entry in `sources`. Prefer
   primary/official statements, then reputable news, then encyclopedic summaries.
2. **Be honest about uncertainty.** Use `confidence`:
   - `confirmed` — officially acknowledged / multiple strong sources agree.
   - `reported` — credible reporting, but figures may vary (the common case).
   - `disputed` — sources conflict; explain in `notes`.
3. **Never invent coordinates.** Leave `bearing_deg`, `apogee_km`, and `impact`
   null if not published. An unknown firing direction is fine — the globe will
   draw an indicative seaward arc from the launch facility and label it as such.
4. **Capability vs. test.** Put advertised reach in `missile.range_km`; put what a
   specific flight flew in `test.range_tested_km`.

## Add a missile

Create `data/missiles/<slug>.yaml` (e.g. `agni-vi.yaml`). Minimum:

```yaml
id: agni-vi
name: "Agni-VI"
category: "surface-to-surface"  # see SCHEMA.md → Categories
status: "development"
range_km: { min: 8000, max: 12000 }
nuclear_capable: true
confidence: "reported"
sources:
  - url: "https://..."
    title: "..."
    publisher: "..."
    accessed: "2026-06-15"
```

## Add a test

Create `data/tests/<YYYY-MM-DD>-<missile>-<desc>.yaml`:

```yaml
id: 2025-01-01-agni-vi-first-flight
missile_id: agni-vi          # must match a missile id
date: "2025-01-01"
site_id: abdul-kalam-island  # must match a facility id (or null)
outcome: "success"           # success | partial | failure | unknown
range_tested_km: 8000
bearing_deg: null            # null → indicative seaward arc
confidence: "reported"
sources:
  - { url: "https://...", title: "...", publisher: "...", accessed: "2026-06-15" }
```

For a partially known date, set `date` to `"2025"` or `"2025-01"` and
`date_precision: year` (or `month`).

## Add a launch facility

Append to `data/facilities.yaml`. Set `default_bearing` to the realistic
seaward/down-range azimuth (most coastal sites fire SE into the Bay of Bengal).

## Validate

```bash
npm run build:data
```

This Zod-validates every file, checks that all `missile_id` / `site_id`
references resolve, and rejects duplicate ids — failing loudly with the offending
file and field. Fix any reported issues until it prints the success summary.
Then `npm run dev` to see your record on the globe.
