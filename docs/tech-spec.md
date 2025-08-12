# Agentic Soup — MVP with Web Browsing (TypeScript) — Updated Spec

**Owner:** Phil Bennett (@me)
**Repo target:** Brainfork-is/agentic-soup
**Objective:** Prove/deny early signs of “survival of the fittest” among agents (credit inequality, hub formation, keystone effects) **with a web-browsing task substrate**, while keeping cost/complexity low.

---

## 1) Scope & Constraints (what’s in/out)

**In (MVP):**

* Single machine / single VM (Node 20 + TypeScript).
* Redis (BullMQ) for queues + pub/sub.
* SQLite (Prisma) for state/ledger/edges.
* Local **Browser Gateway** (Playwright) + **local knowledge-base site** as a deterministic “web”.
* Agents with minimal tools: `browser`, `retrieval-local`, `stringKit`, `calc`.
* A2A-lite messaging (Redis pub/sub) for cooperation & subcontracting.
* Simple selection pressure (credits, costs, reproduction, culling).

**Out (MVP):** Kubernetes, external internet, code-exec sandbox, long-term storage analytics, complex auth.

---

## 2) High-Level Architecture

**Apps:**

* `soup-runner` (Fastify): orchestrator + market + bank + observability, Prisma/SQLite, BullMQ job queue.
* `browser-gateway` (Fastify + Playwright): headless browser API with host allow-list.
* `site-kb` (Fastify static): tiny website with pages for agents to browse/search.

**Packages:**

* `@soup/common`: types (Blueprint, AgentState, Job), metrics (Gini), util.
* `@soup/agents`: agent loop (`plan→act→reflect→learn`), tool adapters (incl. `browserRun`).

**Infra:** Redis via docker-compose; `.env` for caps (agents, jobs/min, epoch length, costs).

---

## 3) Data Model (Prisma, SQLite)

```prisma
model Blueprint {
  id           String   @id @default(cuid())
  version      Int
  llmModel     String
  temperature  Float
  tools        String    // CSV of tool ids
  coopThreshold Float
  minBalance   Int
  mutationRate Float
  maxOffspring Int
  createdAt    DateTime @default(now())
}

model AgentState {
  id           String   @id @default(cuid())
  blueprintId  String
  balance      Int
  reputation   Float
  attempts     Int
  wins         Int
  meanTtcSec   Int
  alive        Boolean  @default(true)
  lastBeat     DateTime @default(now())
}

model Job {
  id         String   @id @default(cuid())
  category   String   // web_research|summarize|classify|math
  payload    String   // JSON
  payout     Int
  deadlineS  Int
  createdAt  DateTime @default(now())
}

model Ledger { id String @id @default(cuid()); agentId String; delta Int; reason String; ts DateTime @default(now()) }
model Edge   { id String @id @default(cuid()); fromId String; toId String; topic String; ts DateTime @default(now()) }
```

---

## 4) Tasks & Auto‑Grading (Deterministic)

**Categories:**

* **web\_research**: navigate `site-kb` pages, extract an answer (e.g., “One advantage of PGVector”). Grader checks substring/regex.
* **summarize**: compress text to ≤N words; grader checks length + simple n‑gram overlap/embedding cosine (optional later).
* **classify**: label among fixed classes; grader exact‑match.
* **math**: simple expression eval; grader runs JS eval safely.

**Generator:** \~10 jobs/min; per-job `payout` & `deadlineS` set; stream into BullMQ.

---

## 5) Agents (Runtime & Tools)

**Loop:**

```
while (alive) {
  job = market.claim();
  plan = planner(job, memory, tools);         // mock or LLM-backed
  act  = actor(plan, tools);                  // call browser/retrieval/etc
  ok   = grader(job, act);
  bank.settle(agent, ok ? payout : -penalty);
  social.maybeMessagePeers();                 // A2A-lite via Redis
  learn(job, act, ok);
  heartbeat();
}
```

**Tools (MVP):**

* `browser` → `browser-gateway /run { url, steps[] }` (click, type, wait, extract) with host allow‑list.
* `retrieval-local` → search over a JSON corpus of the site content (exact matching first; embed later).
* `stringKit` → summarize/extract/classify with prompt templates.
* `calc` → arithmetic evaluator.

**Planner options:** start with **mock heuristic**; enable LLM via `LLM_PROVIDER=openai` env when credits available.

---

## 6) Communication (A2A‑lite → path to standards)

* Redis pub/sub subjects:

  * `a2a.discover {agentId, traits}`
  * `a2a.help {jobId, need}`
  * `a2a.offer {jobId, payoutShare}`
  * `a2a.contract {jobId, accept}`
* Record every message in `Edge` to compute degree/betweenness.
* **Future‑proofing:** keep message schemas compatible with A2A HTTP/gRPC so we can swap transports; allow an **external agent** (e.g., Google ADK or LangGraph graph) to join via a small bridge service.

---

## 7) Selection Pressure & Evolution

* **Costs:** charge per LLM call (fixed), per browser step, and per message.
* **Reproduction (epoch boundary):** if `balance ≥ minBalance`, spawn 1–2 offspring (clone + mutation), cost deducted.
* **Culling:** kill bottom 20% by balance or any `balance < 0` at epoch.
* **Mutation (discrete toggles):**

  * temperature ∈ {0.1, 0.3, 0.5}
  * tools subset ⊆ {browser, retrieval-local, stringKit, calc}
  * coopThreshold ∈ {0.3, 0.6, 0.9}
  * planner style ∈ {reactive, reflective}

---

## 8) Metrics & Signals (Observability)

* **Inequality:** Gini coefficient on `balance`; top‑k share (k=5,10) over rolling windows.
* **Network:** degree & betweenness centrality from `Edge` (daily/2‑hour windows).
* **Throughput:** jobs/min, win‑rate, mean TTC.
* **Emergence:** stability of top‑k (overlap across windows); **keystone ablation** effect size (∆ throughput after removing #1 agent).

**Outputs:** CSVs under `./runs/<ts>/metrics/` + minimal web dashboard in `soup-runner` (ECharts/Chart.js).

---

## 9) Run Protocol

* Seed **N=60** agents: 6 archetypes × 10 mutations (Forager, Negotiator, Sprinter, Scholar, Cheapskate, Socialite).
* Stream **\~10 jobs/min**; **epoch=120 min**; run **24h**.
* **Shock @ hour 12:** change category weights (↑ web\_research), increase message & browser step cost by 50%.
* **Ablation @ hour 20:** remove top earner for 30 min → observe throughput drop and redistribution.

**Success (MVP):** top‑5 share ≥ 60% for ≥ 2 consecutive hours **or** Gini ≥ 0.6; top node betweenness ≥ 4× median; ablation drop ≥ 15%.

---

## 10) Tickets (bite‑sized)

**Epic M — Foundations (4–6 pts)**

1. Monorepo + pnpm + tsconfig; docker‑compose for Redis. (2)
2. Prisma schema + migrations; Fastify healthz. (2)

**Epic N — Browser Substrate (6–9 pts)**

1. `browser-gateway` Playwright API with host allow‑list + /run. (3)
2. `site-kb` static site (RAG guide, vector DBs, policy pages). (2)
3. Browser step metering & error handling. (1–2)

**Epic O — Market & Bank (6–9 pts)**

1. Job generator (10/min) across 4 categories. (2)
2. Auto‑graders per category (regex/length/eval). (2–3)
3. Payout/charge + ledger + leaderboard endpoint. (2–3)

**Epic P — Agent Runtime (8–12 pts)**

1. Agent loop (mock planner), tools adapters (browser, retrieval, stringKit, calc). (4)
2. Memory stub (in‑proc map) + heartbeat; later swap for SQLite. (2)
3. Seed 6 archetypes + mutation ops. (2–3)

**Epic Q — Orchestrator & Evolution (6–9 pts)**

1. Epoch scheduler (reproduce/cull) with caps; immigration option. (3)
2. Shock & ablation scripts triggered by clock. (2–3)

**Epic R — Metrics & Dashboard (6–9 pts)**

1. Gini & top‑k; centrality from `Edge`; CSV exports. (3–4)
2. Minimal dashboard page (throughput, inequality, centrality). (3–5)

*(Stretch)*: Embedding‑based grading; LangGraph.js planner; A2A HTTP bridge; external ADK agent competitor.

---

## 11) Configuration & Cost Guardrails

* `.env`: `MAX_AGENTS`, `JOBS_PER_MIN`, `EPOCH_MINUTES`, `BROWSER_STEP_COST`, `MSG_COST`, `LLM_COST_PERK`, `SPEND_CAP_CREDITS`.
* Fail‑closed when cap exceeded; write cap event to CSV.

---

## 12) Risks & Mitigations

* **Flat fitness landscape** → adjust payouts/penalties, raise message cost, increase job heterogeneity.
* **Planner overfits** → inject random immigrants and perturbation noise in policies.
* **Browser flakiness** → keep site deterministic, add `wait` steps and retries.

---

## 13) Deliverables (MVP)

* Running stack on one machine (Redis, Playwright, three Node apps).
* 24h experiment logs + CSVs; dashboard screenshots of inequality & network skew.
* Seed archetypes JSON; runbook with ablations & shocks.

