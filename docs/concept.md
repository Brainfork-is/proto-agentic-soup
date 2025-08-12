I’ve had a thought about modelling the future of software development as an agentic primodal soup.  The analogy is as follows: 

The easy access to good coding tools (like Claude Code and OpenAI Codex) will allow people to very quickly build products, services and agents that will completly swamp the internet. Agent-to-agent communication will quickly develop, and agent-building agents will create many interconnections between all these nodes. This will create a rich breading ground for super agents that will grow independently and eventually emerge from the soup winning via “survival of the fittest”. 

There are a number of recent statements that make me thing this is likely:
Sam Altman said “We are entering the fast fashion era of Saas” and Satya Nadella predicts everything will fold into an agent layer and we won’t have traditional software and operating systems. 

However, what I’m looking for is to run an experiment to test this in an environment where we can test this, can you design an experiment that tests this hypothosis. Can you also write a technical specification for it that I can use with a coding agent to build it. 

Hypothesis to test
Given (1) cheap/fast agent creation and (2) open inter-agent communication plus (3) selection pressure (limited resources + market-like rewards), agent populations will self-organize and produce a small number of high-fitness “super-agents” that dominate task share (“survival of the fittest”).

Context for why this is timely: Sam Altman recently called it the “fast fashion era of SaaS,” i.e., rapid, disposable software built and shipped by/with AI, and Satya Nadella has been arguing that many traditional apps will collapse into an agent layer. 
Blockchain News
Rangle
Windows Central
CX Today

Also, there’s prior art you can build on: open-world web environments for agents (WebArena), multi-agent frameworks (AutoGen), and social simulations that show emergent behavior (“Generative Agents”). 
WebArena
Microsoft GitHub
Microsoft
+1
arXiv
3DVar
Stanford HAI

Experiment design (end-to-end)
1) Environment (“the soup”)
Create a self-hosted, controllable world with three ingredients:

Task substrate (market): A continuous stream of heterogeneous jobs that agents can attempt: e.g., “book a flight on a replica site,” “draft & edit code PR,” “answer a support ticket,” “research X and produce a memo.” Use a mix of (a) WebArena-style sandboxed websites/APIs and (b) synthetic services you control. 
WebArena

Economy & scarcity: Jobs pay credits; running an agent costs credits (CPU tokens, tool calls, memory). Agents must earn ≥ spend to persist.

Communication fabric: A pub/sub bus (NATS/Kafka) where agents can post/subscribe to topics (LFG/builders, market signals, help requests). Limit bandwidth to force trade-offs.

2) Population & “genome”
Each agent = an immutable blueprint + mutable state.

Blueprint (genotype):

Model & decoding params (e.g., “gpt-x, temp=0.4”),

Tools: which external tools it can use (browser, code runner, vector search, payment, email),

Cognition modules: planner, memory, reflection, self-critique, negotiation,

Social policy: coop propensity (share, barter, free-ride), trust thresholds,

Reproduction rules: when/how it can spawn offspring (clones/mutants).

State (phenotype):

Episodic & semantic memory, reputation, current credit balance, current subscriptions, embeddings of past partners.

Store blueprints as JSON and treat them like DNA; state lives in a vector store + KV.

3) Variation (how the soup gets rich)
Mutation operators (applied on spawn or periodically):

Prompt edits (insert/delete constraints), tool set toggles, memory window size, goal-selection heuristic, cooperation threshold, pricing strategy.

Recombination (agent-building agents):

A “Builder” class composes two or more successful blueprints into a new one, optionally distills policies from logs (e.g., merges the planner from Parent A with the tool suite from Parent B).

Introduction & immigration: Periodically inject a few random agents to maintain diversity.

4) Fitness & selection pressure
Primary fitness: net credits over rolling window (earnings − costs).

Secondary fitness: task success rate, time-to-complete, customer rating (synthetic but consistent), reliability (crash rate).

Ecology-level pressure: message-bus quotas, tool-API rate limits, and supply/demand shifts in the job stream (concept drift).

Agents that drop below a credit threshold are culled; those above can reproduce (spawn clones/mutants) at a cost. Allow mergers: two agents can voluntarily merge state/blueprints for a fee.

5) Emergence signals (what would count as “super-agents”?)
Track whether a small fraction of agents (<10%) captures most credits or market share (>60%) and whether they also become central hubs in the message graph (betweenness/degree centrality), or act as keystone species (others’ performance collapses when they’re removed).

Key metrics:

Inequality: Gini coefficient of credits; top-k share over time.

Diversity: effective species count (cluster blueprints in embedding space); speciation rate.

Network power: centrality of communication/contract graphs.

Adaptation: fitness recovery after task-distribution shifts.

Ethical drift: if you add “alignment scores,” watch for survival vs. alignment trade-offs (see recent “survival vs ethics” agent work). 
arXiv

6) Protocol (how to run it)
Warm-start with N=200 diverse blueprints (10 archetypes × 20 mutations each).

Stream jobs at a fixed budget (e.g., 30/minute) and increase weekly.

Every 2 hours: apply reproduction/culling; every 12 hours: inject 5 immigrants.

Every 24 hours: shock the environment (e.g., change API rate limits, introduce a new task category).

Run ≥ 14 days. Snapshot all states daily for replayability.

Post-hoc ablations: remove message bus, remove reproduction, or fix tools to test necessity of each ingredient.
