# The Apparatus — Data Schema

This is the reference schema for The Apparatus typed graph. The data layer is two JSON files (`nodes.json`, `edges.json`) backed by git history.

The schema is deliberately small. Three orthogonal dimensions, eight edge types, seven node types. The discipline is in restraint: null is acceptable, sparsity is a feature, duplicates are forbidden.

---

## Node schema

```jsonc
{
  "id": "kebab-case-stable-id",        // unique, immutable, used in edges
  "title": "Human-Readable Title",      // proper noun preferred
  "type": "technology",                 // one of 7 — see below
  "domain": "identity",                 // dimension 1, may be null
  "function": "capability",             // dimension 2, may be null
  "phase": "operation",                 // dimension 3, may be null
  "desc": "≤400 chars",                 // hard limit, enforced
  "tags": ["tag-1", "tag-2"],           // 3-5 lowercase kebab tags
  "date": "2025-05",                    // YYYY | YYYY-MM | YYYY-MM-DD | null
  "sources": ["https://..."],           // urls supporting the node
  "added":   "2026-05-26T00:00:00Z",    // ISO 8601 UTC
  "updated": "2026-05-26T00:00:00Z"     // ISO 8601 UTC
}
```

### Required fields

`id`, `title`, `type`, `desc`, `tags`, `added`, `updated`.

`domain`, `function`, `phase`, `date`, `sources` may be `null` (or `[]` for sources) when genuinely unknown. **Null is honest.** Do not guess to fill a field.

---

## Node types (7)

| type         | meaning                                                          | example                                |
|--------------|------------------------------------------------------------------|----------------------------------------|
| `technology` | a specific product or technical system                           | Flock ALPRs, USDC                      |
| `system`     | an institution or ongoing program                                | HSTF, Operation Choke Point 2.0        |
| `policy`     | a law, regulation, or executive order                            | REAL ID, GENIUS Act                    |
| `action`     | a discrete civic or corporate move                               | Mountain View ALPR cancellation        |
| `event`      | a dated occurrence                                               | trucker freeze, CISA advisory          |
| `concept`    | a theoretical or rhetorical frame                                | friction-collapse, post-totalitarian   |
| `figure`     | a load-bearing person (5-year-relevance bar)                     | a specific judge, theorist, platform CEO |

For `figure`: focus on intellectual/institutional architecture, not partisan personalities. A theorist whose ideas shape policy is a figure; a politician saying inflammatory things usually isn't.

---

## Dimensions (3 orthogonal axes)

Each dimension is independent. A node may have all three, or any may be `null`.

### Domain — sphere of authoritarian architecture

**Active values** (use these for new nodes):
- `identity` — who you are, attested digitally
- `movement` — where you've been, where you're going
- `economic` — payment rails, account access, programmable money
- `synthesis` — joining the layers (query infra, fusion)
- `narrative` — rhetorical, theoretical, legitimating frames
- `infrastructure` — physical substrate (compute, energy, networks)

**Reserved values** (do not use until real nodes appear that require them):
`information`, `legal`, `electoral`, `civic`, `coercive`, `international`

### Function — role in the authoritarian process

- `capability` — the tool/system exists and works
- `legitimation` — the rhetorical or legal cover
- `normalization` — precedent and habituation
- `mobilization` — rallying support, building coalitions
- `coercion` — actual enforcement
- `resistance` — counter-moves

### Phase — position in the authoritarian trajectory

Levitsky/Snyder/Arendt synthesis:

- `precondition` — the soil (inequality, distrust, institutional decay)
- `capture` — institutional takeover in progress
- `consolidation` — lock-in mechanisms being built
- `operation` — running system

---

## Edge types (8)

Edges are directed: `source` → `target`.

| type          | meaning                                                                              |
|---------------|--------------------------------------------------------------------------------------|
| `enables`     | without source, target doesn't function as it does                                   |
| `requires`    | source is a *necessary precondition* (stronger than enables)                         |
| `accelerates` | source increases adoption/scale of target                                            |
| `legitimizes` | source provides rhetorical or legal cover for target                                 |
| `precedent`   | source establishes pattern target follows                                            |
| `obscures`    | source cynically masks target from public attention                                  |
| `counters`    | source acts against target (civic resistance, institutional pushback)                |
| `contradicts` | principled tension *inside* the authoritarian project (a pressure point)             |

### Edge schema

```jsonc
{
  "source": "node-id-1",
  "target": "node-id-2",
  "type":   "enables",
  "note":   "one-line explanation",
  "added":  "2026-05-26T00:00:00Z"
}
```

Both `source` and `target` MUST match existing node `id`s. Validate before writing.

---

## Discipline rules

1. **Sparsity over breadth.** Each node should change at least one piece of analysis. If it doesn't, don't add it.
2. **No duplicates.** Before adding, search existing nodes for similar titles. Edit the existing one instead.
3. **Description ≤ 400 chars.** Enforced everywhere. If you can't say it in 400 chars, you don't understand it yet.
4. **Concepts are sparse.** Don't propose new concept nodes unless they're load-bearing across multiple essays.
5. **Bonhoeffer and Arendt material** belongs primarily in the *Living in Truth* book project. They appear here only as concept/figure nodes when load-bearing.
6. **No over-edging.** More than 4 edges from a single node usually means at least one is trivial.
7. **No vague edge notes.** "They're related" is not a note.
8. **Null is acceptable** for any dimension when the source genuinely doesn't justify a value.
9. **Personal instrument, not public encyclopedia.** Every addition should serve essay/book work, not news-ticker completeness.
