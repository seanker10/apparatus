# The Grid — Data Schema

Reference schema for The Grid, the geographic companion to The Apparatus. The data layer is two JSON files (`sites.json`, `links.json`) in this directory, fetched at runtime by the `/grid` page (with a build-time bundled fallback).

Where the Apparatus graph maps concepts, The Grid maps **places**: every site is a point on the US map with a layer, a status, and primary sources.

---

## Site schema (`sites.json`)

```jsonc
{
  "id": "stargate-i-abilene",          // unique, immutable, kebab-case
  "title": "Stargate I — Abilene",      // short display title
  "layer": "datacenter",                // one of 6 — see below
  "category": "hyperscale-ai",          // free-form sublabel within the layer
  "status": "operational",              // see status vocabulary below
  "lat": 32.45,                         // city-level accuracy is fine
  "lon": -99.73,
  "city": "Abilene",
  "state": "TX",                        // two-letter; "DC" points get the DC zoom view
  "date": "2025-01",                    // YYYY | YYYY-MM | YYYY-MM-DD
  "desc": "≤480 chars, factual, neutral",
  "actors": ["openai", "oracle"],       // kebab-case org ids, consistent across sites
  "sources": ["https://..."],           // 1-3 primary sources, required
  "tags": ["stargate", "ai-training"],
  "added":   "2026-06-10T00:00:00Z",
  "updated": "2026-06-10T00:00:00Z"
}
```

### Layers (7)

| layer          | meaning                                                        |
|----------------|----------------------------------------------------------------|
| `datacenter`   | hyperscale/AI compute build-out, current and planned           |
| `surveillance` | deployed surveillance infrastructure (ALPR, fusion centers, biometric checkpoints, border towers, crime centers) |
| `detention`    | ICE detention centers, processing facilities, and enforcement camps |
| `corporate`    | corporate expansion of control-grid firms (contracts, HQs, factories, funding) |
| `federal`      | executive orders, federal programs, contracts, enforcement — DC-anchored points use the issuing institution's coordinates |
| `legislation`  | state & local laws restraining surveillance / data center growth (statewide laws sit at the capital) |
| `resistance`   | protests, campaigns, lawsuits, rejections, community victories |

### Status vocabulary

- Infrastructure/corporate: `operational` · `under-construction` · `planned` · `proposed` · `active` · `expanding`
- Detention: `operational` · `expanding` · `planned` · `reopened`
- Federal: `signed` · `active` · `proposed` · `rescinded`
- Legislation: `passed` · `proposed` · `failed`
- Resistance: `ongoing` · `victory` · `ended`

Statuses `planned`, `proposed`, `under-construction`, `expanding`, and `ongoing` render with a pulsing ring ("in motion"); the Existing/Planned filter treats `planned`, `proposed`, and `under-construction` as planned.

### Conventions

- Multiple federal actions at the same building (e.g. White House EOs) may share coordinates — the map fans them out automatically when zoomed.
- Sites outside the Albers USA projection (e.g. Guantanamo Bay) don't plot on the map but remain reachable via search and keep their detail panel and connections.
- Null is honest, but for this dataset `date`, `city`, `state`, `lat`, `lon`, and at least one source are effectively required: a point with no place or no source doesn't belong on a map.
- `desc` hard limit: 480 chars.

---

## Link schema (`links.json`)

```jsonc
{
  "source": "naacp-xai-clean-air-lawsuit",  // site id
  "target": "xai-colossus-2-memphis",        // site id
  "type": "opposes",                          // one of 6 — see below
  "note": "Clean Air Act suit seeks shutdown until permitted"
}
```

### Link types (6)

| type        | direction                            | rendering    |
|-------------|--------------------------------------|--------------|
| `opposes`   | resistance → its target              | green dashed |
| `restricts` | legislation → what it restrains      | teal dashed  |
| `enables`   | policy/program → what it unlocks     | blue solid   |
| `operates`  | corporate HQ → what it runs/builds   | violet solid |
| `supplies`  | vendor/site → system it feeds        | violet dashed|
| `targets`   | enforcement → what it reaches for    | red dotted   |

Both endpoints must exist in `sites.json`. Arcs only render when both endpoints pass the active filters.

---

## Adding entries

Same discipline as the Apparatus graph: no duplicates, sources required, neutral factual tone. The page refetches from `main` every two minutes, so commits to this directory go live without a redeploy.
