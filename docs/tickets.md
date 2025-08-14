# Agentic Soup Tickets / Progress

# Agentic Soup — MVP Web Browsing: Detailed Ticket Backlog
**Scope:** Single‑machine MVP with web browsing via local Browser Gateway + local site. Redis (BullMQ), SQLite (Prisma), Fastify services, TS/Node 20. Target: 60 agents, 24‑hour run, basic emergence signals.
**Notational key:** [EPIC-CARD] → story ID. Estimates are **points** (S=1, M=2, L=3, XL=5) roughly.


# Epic M — Foundations
- [x] **[M-1] Monorepo bootstrap (pnpm + TS config)** — S **Desc:** Initialize workspace, tsconfig base, path aliases for packages, scripts (build/dev/test). **AC:** pnpm i, pnpm -r build, pnpm dev (no runtime errors). **Tasks:** Create pnpm-workspace.yaml; root package.json scripts; tsconfig.base.json; .gitignore.
- [x] **[M-2] Dev env & env vars** — S **Desc:** .env.example with Redis/DB/LLM caps; config loader. **AC:** dotenv loads; missing var → sensible defaults. **Tasks:** Config module; runtime validation with zod.
- [x] **[M-3] Docker Compose: Redis** — S **Desc:** Single Redis service on 6379 for queues + pub/sub. **AC:** docker compose up -d → health OK; app connects.
- [ ] **[M-4] Health endpoints** — S **Desc:** GET /healthz for all apps. **AC:** Returns { ok: true } and timestamp.
- [ ] **[M-5] Prisma + SQLite setup** — M **Desc:** Prisma schema + migrations; generate client. **AC:** pnpm prisma:migrate creates dev.db; seed script runs.
- [ ] **[M-6] CI skeleton** — M **Desc:** GitHub Actions: install, build, typecheck. **AC:** PRs block on build; cache pnpm.

# Epic N — Browser Substrate
- [ ] **[N-1] Browser Gateway skeleton (Fastify + Playwright)** — M **Desc:** /healthz, /run endpoint with steps: click, type, wait, extract. **AC:** Example POST runs steps on site-kb; returns lastText, contentLength.
- [ ] **[N-2] Host allow‑list & errors** — S **Desc:** Validate URL host in ALLOWED_HOSTS; return 400 if disallowed; 500 on browser fault. **AC:** Requests to non‑allowed host rejected; retries configurable.
- [ ] **[N-3] Step metering** — S **Desc:** Count steps per /run; return stepsUsed. **AC:** Response includes integer count; zero if no steps.
- [ ] **[N-4] Local KB site** — S **Desc:** Serve static pages: index, guides/rag.html, docs/vector-db.html, policies/coop.html. **AC:** Pages reachable; deterministic text in anchors for extraction.
- [ ] **[N-5] Synthetic search page (optional)** — M **Desc:** Simple search form listing page links; supports typing + click flows. **AC:** Agents can type query, click result, extract text.

# Epic O — Market & Bank
- [ ] **[O-1] Job generator** — M **Desc:** Generate ~10 jobs/min across web_research|summarize|classify|math; enqueue to BullMQ. **AC:** Queue depth rises at expected rate; payload JSON valid.
- [ ] **[O-2] Job claim/ack flow** — M **Desc:** Provide API/queue pattern for agents to claim one job atomically. **AC:** No double assignment; unacknowledged jobs requeued after timeout.
- [ ] **[O-3] Auto‑graders** — L **Desc:** Deterministic graders: regex substring for web_research; length & n‑gram/ratio for summarize; exact for classify; safe eval for math. **AC:** Unit tests cover pass/fail cases per category.
- [ ] **[O-4] Ledger & payouts** — M **Desc:** Single‑entry deltas (credits) for MVP; /payout and /charge internally invoked. **AC:** Balance updates transactional; leaderboard query returns top agents.
- [ ] **[O-5] Penalties & deadlines** — S **Desc:** Late/failed submission incurs fixed penalty. **AC:** Missed deadlineS → negative ledger entry.
- [ ] **[O-6] Cost schema** — S **Desc:** Unit costs: per LLM call, per browser step, per message. **AC:** Costs applied consistently; toggled via .env.

# Epic P — Agent Runtime
- [ ] **[P-1] Agent loop (mock planner)** — L **Desc:** Baseline planner (heuristics); actor executes tool calls; reflector adjusts plan; heartbeat. **AC:** Agent completes at least one job in each category using heuristics.
- [ ] **[P-2] Tools: browser adapter** — S **Desc:** browserRun({ url, steps[] }) wrapper to /run. **AC:** Returns lastText and contentLength to the actor.
- [ ] **[P-3] Tools: retrieval‑local** — M **Desc:** Load site content into in‑memory corpus; simple keyword search; return snippet. **AC:** Query for “PGVector” returns section mentioning joins.
- [ ] **[P-4] Tools: stringKit & calc** — S **Desc:** Summarize/extract/classify prompt wrappers; arithmetic eval. **AC:** Unit tests for each helper.
- [ ] **[P-5] Memory stub** — S **Desc:** In‑process KV for last K jobs; later swap to SQLite table. **AC:** remember/recall works across ticks.
- [ ] **[P-6] Archetype seeds (6 types × 10 variants)** — M **Desc:** JSON blueprints differing in temperature, tools, coop threshold, planner style. **AC:** Loader spawns 60 agents from seeds.
- [ ] **[P-7] Optional LLM planner** — M **Desc:** Switchable planner using OpenAI when keys present; token budget aware. **AC:** Environment toggle; fallback to mock when rate‑limited.

# Epic Q — Orchestrator & Evolution
- [ ] **[Q-1] Epoch scheduler** — M **Desc:** Clock‑driven epochs (default 120 min). Triggers reproduction/culling and metrics snapshot. **AC:** Logs show epoch boundaries; hooks fire reliably.
- [ ] **[Q-2] Reproduction** — M **Desc:** If balance ≥ minBalance, spawn 1–2 offspring with discrete mutation (temp/tools/coop/planner). Deduct spawn cost. **AC:** Offspring inherit parent + diff; lineage recorded in log.
- [ ] **[Q-3] Culling** — S **Desc:** Kill bottom 20% by balance or any negative balance at epoch end. **AC:** Agents marked not alive; stop claiming jobs.
- [ ] **[Q-4] Shock script** — S **Desc:** At hour 12, shift job mix (+web_research), +50% message/browser costs. **AC:** Config changes applied; job distribution/charges reflect.
- [ ] **[Q-5] Ablation script** — S **Desc:** At hour 20, pause/remove top earner for 30 minutes; record throughput delta. **AC:** CSV shows before/after jobs/min; agent reinstated.

# Epic R — Metrics, Exports & Dashboard
- [ ] **[R-1] Inequality metrics** — M **Desc:** Compute Gini and top‑k share (k=5,10) over rolling 1h/2h windows. **AC:** CSV written runs/<ts>/metrics/inequality.csv with timestamps.
- [ ] **[R-2] Network metrics** — L **Desc:** Track message edges; compute degree & betweenness centrality (approx) per hour window. **AC:** CSV network.csv with per‑agent metrics.
- [ ] **[R-3] Throughput & reliability** — S **Desc:** Jobs/min, success rate, mean TTC; failure modes. **AC:** throughput.csv and reliability.csv exported.
- [ ] **[R-4] Minimal dashboard** — M **Desc:** Static page served by soup-runner showing 3 charts (inequality, throughput, centrality). **AC:** Loads without backend errors; updates on refresh.
- [ ] **[R-5] Cap/guardrail logging** — S **Desc:** When spend/token caps hit, write cap events. **AC:** caps.csv exists; process halts safely if configured.

# Epic S — A2A‑lite Messaging
- [ ] **[S-1] Redis pub/sub channels** — S **Desc:** Channels: a2a.discover, a2a.help, a2a.offer, a2a.contract. **AC:** Messages published/received by at least 2 agents.
- [ ] **[S-2] Edge recorder** — S **Desc:** Persist (fromId,toId,topic,ts) per message. **AC:** Edge table fills; duplicates de‑bounced.
- [ ] **[S-3] Cooperation policy** — M **Desc:** Negotiation flow: offer subcontract with payout share; accept/decline; revenue split. **AC:** E2E: Agent A outsources to B; B completes; split recorded in ledger.

# Stretch Epics (post‑MVP)
- [ ] **[T-1] A2A HTTP/gRPC bridge** — XL **Desc:** Align message schema to community A2A; expose HTTP/gRPC endpoints; auth tokens. **AC:** External agent can discover and contract with an internal agent.
- [ ] **[T-2] LangGraph.js planner** — M **Desc:** Replace heuristic planner with small graph (plan → browse → reflect). **AC:** Same AC as [P‑1], with node transitions persisted.
- [ ] **[T-3] External ADK agent competitor** — L **Desc:** HTTP shim to register a Google ADK agent as a species. **AC:** ADK agent completes web_research jobs and appears in leaderboards.
- [ ] **[T-4] Embedding-based grading** — M **Desc:** Use small local embeddings to grade summarize tasks by cosine similarity. **AC:** Thresholded pass/fail consistent across seeds.

# Operational Tickets
- [ ] **[OPS-1] Runbook & scripts** — S **Desc:** Shell/Node scripts: start, seed, run 24h, export, clean. **AC:** pnpm run run24 executes full protocol.
- [ ] **[OPS-2] Logging & rotation** — S **Desc:** Per‑agent JSONL logs; rotate daily; gzip older than 2 days. **AC:** Disk bounded; log index files present.
- [ ] **[OPS-3] Cost caps** — S **Desc:** Env caps for agents, jobs/min, LLM tokens; hard stop on breach. **AC:** Breach triggers halt + CSV event.

# Dependencies & Order of Work (happy path)
1 Foundations (M) → Browser Substrate (N) → Market/Bank (O).
2 Agent Runtime (P) → Orchestrator (Q) → Messaging (S).
3 Metrics/Dashboard (R) → Ops. **Milestones:**
* **Milestone A (Day 2–3):** N-1..N-4, O-1, M-5; manual job solved via Browser Gateway.
* **Milestone B (Day 4–5):** P-1..P-4; single agent finishing all categories.
* **Milestone C (Day 6–7):** P-6, Q-1..Q-3; 60 agents alive; epochs running.
* **Milestone D (Day 8–9):** R-1..R-3 + O-4..O-6; CSV metrics flowing.
* **Milestone E (Day 10):** Q-4, Q-5 (shock/ablation) + R-4 dashboard.

⠀
# Definition of Done (MVP)
* 60 agents seeded; ≥1k jobs processed over 24h.
* Reproduction & culling executed at least 10 times.
* Inequality (Gini or top‑k) and network skew visible; ablation shows ≥15% throughput dip.
* All caps configurable; fail‑closed works; dashboard renders three core charts.
