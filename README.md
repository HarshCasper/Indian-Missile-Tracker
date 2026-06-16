# Indian Missile Tracker

An interactive globe and a database of Indian missile flight tests. It covers 362 tests across 47 systems between 1985 and 2026, put together from public reporting.

There isn't a single public record of these tests. What exists is scattered across news stories, government press notes, and think-tank writeups. This project pulls that together into one place, keeps it as plain text, and draws it on a map.

## Data

The dataset lives in `data/` as YAML: one file per missile system, one file per test.

```
data/facilities.yaml          launch sites
data/missiles/<id>.yaml       a system (specs, variants, sources)
data/tests/<date>-<id>.yaml   a single flight test
```

A build step validates every record against the Zod schema in `src/schema.ts`, checks that each test points at a system and a site that actually exist, precomputes the map geometry, and writes `public/data.json`. That JSON is generated rather than committed, so you run the build to produce it.

Figures in this area are often approximate or contested. India rarely publishes firing azimuths or impact points, so most arcs show an indicative direction out to sea, south of the peninsula, instead of a real flight path. When two sources disagree on a number such as range, both are kept as separate claims, each with its own citation.

## Sourcing

Every record carries its sources and a confidence rating. Sources are ranked: government releases first (PIB, MoD, DRDO, ISRO), then Indian outlets, then foreign press and think-tanks. Wikipedia counts as further reading and is never used as a citation. The build rejects a Wikipedia URL placed in any other tier.

## Views

There are three views.

The map is a globe of launch sites. Pick a system and its tests show up as arcs with a range ring around the site. Short-range systems such as air-to-air or anti-tank missiles show only the ring, since a directional arc doesn't mean much for them. A playback control runs through the years and adds each system as it first appears.

Analytics is a set of small charts: tests per year, a split by role and by service, a category-by-year heatmap, the most-tested systems, a reliability ranking, and a range ladder.

The database is a sortable table of every test with its outcome, launch site, confidence, and source count. It also exposes an RSS feed so you can follow new entries.

## Stack

Vite, React, and TypeScript. The globe is react-globe.gl, which sits on three.js. Schema validation is Zod and the geodesy is Turf. Type is B612, B612 Mono, and Saira Semi Condensed.

## Running it

```
npm install
npm run dev      # builds data.json, then starts the dev server on :5173
```

Other scripts:

```
npm run build:data   # validate the YAML and write public/data.json
npm run build        # type-check and build for production
npm test             # unit tests for the filter, geometry, and analytics code
```

## Layout

```
data/                  the dataset (YAML)
scripts/build-data.ts  YAML to public/data.json
src/schema.ts          schemas and shared types
src/lib/               geometry, colors, analytics, classification
src/components/        globe, header, search, sidebar, dossier, timeline
src/views/             map, analytics, database
src/styles/            CSS, split by area
docs/                  schema reference and contributing notes
```

See `docs/SCHEMA.md` for the field reference and `docs/CONTRIBUTING.md` for how to add a record.

## Notes

Trajectories are indicative unless a real impact point was published. The project is not affiliated with the Government of India or DRDO, and it does not claim to be complete.
