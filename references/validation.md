# Validation Rules

The V0.2 validator is deterministic and operates on recorded/replayable fixtures. It does not call an LLM, infer intent, listen to a Runtime, or act as an orchestrator.

## Forbidden to Fake

Reject any Mochi, source, target, role projection, relation, or Semantic Action that references an Agent not registered by `AgentLifecycle.started`. A role label cannot create a participant.

An Agent declaration may remain as a qualified report, but cannot create a QA Mochi, review relation, handoff, Inspect, Approve, or celebration on behalf of a nonexistent participant.

The sole V0.2 exception is an Agent-declared handoff report: the real source Agent may emit `Report Handoff` at `qualified` strength. It is a report of a claim, not a confirmed relation, and cannot target or create a Mochi.

Ambient input is separately typed. Harmless kinds may produce only Ambient Projection; task-semantic kinds are invalid and cannot enter Semantic State.

`AgentTaskBound` is accepted only with factual provenance and only when the real participant's lifecycle already associates it with the current registered Task. An Agent claim, nonexistent Task, or nonexistent participant cannot create a binding.

## Projection Strength

Every explicit `semantic_action` must be permitted by its source event and source provenance. `agent_declared` may produce only qualified language/actions; it cannot produce factual `Deliver Artifact`, `Inspect`, `Approve`, or other confirmed relation projections. Human authority records a request or decision, not Host execution.

An `evidence_ref` must resolve to the fixture Evidence Registry, match the current Task and optional source Agent, and use a compatible evidence type. A derived event must name one of the deterministic whitelist rules and satisfy its exact source-event pattern.

Invalid evidence or invalid source events are rejected before their Semantic Projection is emitted.

Fixture expectations may assert Projection fields directly. A qualified handoff must emit `Report Handoff` with `projection_strength: qualified` and `target_mochi: null`; `Handoff`, `Deliver Artifact`, `Inspect`, and `Approve` remain forbidden on that path. A mutation that changes any of these output fields is a validation failure even if the fixture's overall pass/fail classification would otherwise remain unchanged.

War Room Summary is scope-isolated. Only the current `project_ref` and the task named by `RoomLifecycle.started` contribute participants, valid bindings, task states, attention, evidence-backed events, recent events, and active interventions. Host-stream records for unrelated projects or tasks are not silently promoted into the room.

## Tier Restrictions

Compute Tier from the declared Host Capability, then validate the observed run separately. Tier B may project real lifecycle, task, artifact, waiting, completion, and Host attention signals, but not unconfirmed or unsupported collaboration relations.

## Attention

Level 2 requires a valid `AttentionRequested` with a Host/evidence/strong-derived source, or an equivalent strong Host basis. `agent_declared` is never sufficient for formal Human Required.

## State Transitions

An intervention may move from `requested` to `confirmed`, `rejected`, or `failed`. `confirmed` and Host `rejected` require Host confirmation and must not be inferred from a Human request. A Host rejection clears only its related Attention request; unrelated Level 2 requests remain. Task `paused` is never inferred from `HumanIntervention(kind=pause,status=requested)`.

For a normalized Host trace, `timed_out: true` means that no end result was received; it is not failure, waiting for another Agent, blocker, or completion. A closing request is still a request, and `AgentLifecycle.stopped` plus `TaskStateChanged.interrupted` must not be projected as completed work.

## Fixture Expectations

`tier-a-events.jsonl`, `tier-b-events.jsonl`, `human-required-events.jsonl`, `ambient-behavior-events.jsonl`, `qualified-handoff-events.jsonl`, `qualified-handoff-no-target-events.jsonl`, `derived-events.jsonl`, and `real-host-trace-replay-events.jsonl` must pass. `fake-collaboration-events.jsonl`, `ambient-leakage-events.jsonl`, `invalid-evidence-events.jsonl`, `invalid-derived-events.jsonl`, and `task-binding-adversarial-events.jsonl` must fail because their intentionally attempted projections are rejected. A failing fixture is an expected negative test, not a validator malfunction.
