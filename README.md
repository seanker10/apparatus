# The Apparatus

A typed-graph thinking instrument for mapping the architecture of authoritarianism. Personal tool for long-form essay work (The Wright Letters) and a book project (*Living in Truth*), drawing on Havel, Bonhoeffer, Arendt, and Paine.

The map is not a public encyclopedia, a news ticker, or a partisan scorecard. Every addition serves an argument that's already being made.

---

## What it is

Three components, one data layer:

```
   ┌──────────────┐      ┌────────────────────┐      ┌─────────────────────┐
   │  Telegram    │      │   Skill (Python)   │      │  Visualization      │
   │  (phone)     │ ───▶ │  extractor +       │ ───▶ │  Vite + React + D3  │
   │              │      │  github_writer     │      │  apparatus.vercel   │
   └──────────────┘      └────────────────────┘      └─────────────────────┘
          │                       │                          ▲
          │  share article URL    │  commit JSON             │  raw.github
          │  → Approve            ▼                          │  refresh 60s
          │              ┌────────────────┐                  │
          └─────────────▶│   data/*.json  │──────────────────┘
                         │   (git-backed) │
                         └────────────────┘
```

**Loop:** read article on phone → share to Telegram → JARVIS replies with a proposed node + categorization + proposed edges → tap Approve → graph at `apparatus.vercel.app` updates within ~60 seconds.

---

## Project structure

```
apparatus/
├── README.md
├── .gitignore
├── data/
│   ├── nodes.json       # typed nodes
│   ├── edges.json       # typed directed edges
│   └── schema.md        # full schema reference
├── skill/
│   ├── SKILL.md         # categorization instructions for the model
│   ├── handlers.py      # intent routing
│   ├── extractor.py     # Anthropic-powered extraction
│   ├── github_writer.py # commits to data/
│   ├── telegram_bot.py  # FastAPI webhook + python-telegram-bot
│   ├── dev.py           # local long-polling for testing
│   ├── requirements.txt
│   ├── Procfile         # Railway/Fly deploy
│   ├── fly.toml.example
│   └── .env.example
└── viz/
    ├── package.json
    ├── vite.config.js
    ├── vercel.json
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── ApparatusMap.jsx
        ├── hooks/useGraphData.js
        └── styles.css
```

---

## Schema in a paragraph

Seven **node types**: `technology`, `system`, `policy`, `action`, `event`, `concept`, `figure`.

Three orthogonal **dimensions** (any may be null):
- `domain` — identity, movement, economic, synthesis, narrative, infrastructure (+ 6 reserved)
- `function` — capability, legitimation, normalization, mobilization, coercion, resistance
- `phase` — precondition, capture, consolidation, operation

Eight **edge types**: `enables`, `requires`, `accelerates`, `legitimizes`, `precedent`, `obscures`, `counters`, `contradicts`.

Full reference: [`data/schema.md`](data/schema.md).

---

## Setup

### Convenience

```bash
# Optional — add to ~/.zshrc
alias apparatus='cd "/Volumes/Projects & Files/Claude Code/apparatus"'
```

### Data

Nothing to set up — `data/nodes.json` and `data/edges.json` ship with seed data and are edited via the skill (or by hand for the rare manual fix-up).

### Visualization (local)

```bash
cd viz
npm install
npm run dev          # http://localhost:5173
```

By default the viz reads from `https://raw.githubusercontent.com/seanker10/apparatus/main/data`. To point at a different repo for development, set `VITE_GITHUB_RAW_BASE` in a `viz/.env.local`.

### Visualization (Vercel deploy)

1. Push this repo to GitHub.
2. Import the **`viz/`** subdirectory into Vercel as a new project (root directory: `viz`).
3. Optional: set `VITE_GITHUB_RAW_BASE` env var if your repo path differs from default.
4. Deploy. Vercel returns a URL like `apparatus-<hash>.vercel.app`.
5. Copy the project's **deploy hook URL** into `skill/.env` as `VERCEL_DEPLOY_HOOK_URL` so commits trigger redeploys.

### Skill (local)

```bash
cd skill
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # then fill in the secrets
python dev.py              # long-polling, no webhook needed
```

Required environment variables (`skill/.env`):

| key                          | what                                                       |
|------------------------------|------------------------------------------------------------|
| `ANTHROPIC_API_KEY`          | for extractor                                              |
| `TELEGRAM_BOT_TOKEN`         | from @BotFather (regenerate via `/revoke` if ever leaked)  |
| `TELEGRAM_ALLOWED_USER_ID`   | Sean's Telegram user ID — only allowed sender              |
| `GITHUB_TOKEN`               | PAT with `repo` scope on `seanker10/apparatus`             |
| `GITHUB_REPO`                | default `seanker10/apparatus`                              |
| `GITHUB_BRANCH`              | default `main`                                             |
| `VERCEL_DEPLOY_HOOK_URL`     | optional — pinged after every commit                       |
| `ANTHROPIC_MODEL`            | default `claude-opus-4-7`                                  |

`.env` is gitignored. **Never commit it.** If a token ever lands in git history, regenerate it immediately — history is forever.

### Skill (production)

Deploy the FastAPI app (`telegram_bot:app`) to Fly.io or Railway:

```bash
# Fly.io
cd skill
cp fly.toml.example fly.toml      # then edit `app` name
fly launch --no-deploy
fly secrets set ANTHROPIC_API_KEY=... TELEGRAM_BOT_TOKEN=... GITHUB_TOKEN=... \
  TELEGRAM_ALLOWED_USER_ID=8170693789 GITHUB_REPO=seanker10/apparatus
fly deploy
# Then set the webhook:
curl -F "url=https://<your-app>.fly.dev/webhook" \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

---

## Discipline rules (read this when in doubt)

1. **Personal instrument, not public encyclopedia.** If an addition doesn't change at least one piece of analysis, don't add it.
2. **Sparsity over breadth.** Concepts especially. Bonhoeffer and Arendt mostly belong in the book project; they appear here only as load-bearing nodes.
3. **400-char description limit.** Enforced everywhere. If you can't say it in 400 chars, you don't understand it yet.
4. **No partisan personalities as `figure` nodes.** Apply the 5-year-relevance test. A theorist whose ideas shape policy counts; a politician saying inflammatory things doesn't.
5. **Null is honest.** Don't guess at dimensions to fill a field.
6. **No over-edging.** More than 4 edges from one node usually means at least one is trivial.

---

## Success criteria at 30 days

- 60+ nodes, 80+ edges, all properly categorized.
- The graph has surfaced at least one pattern Sean would not have seen by reading article by article.
- The Telegram → approve → graph-updated loop takes under 2 minutes end-to-end.
- A draft essay or book section cites the map directly.

---

## Bot commands

- `/start` — sanity check the bot is alive
- `/status` — node/edge counts, breakdown by type
- `/recent` — last 5 nodes added
- `/cancel` — abandon an in-progress edit session

Plain messages: send a URL, a paragraph of freeform text, or `add node: title=…, type=…, domain=…` for structured input.
