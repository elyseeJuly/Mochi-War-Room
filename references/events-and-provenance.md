# Events and Provenance

## Fixture-only Contract

V0.2 replays JSONL records. Each semantic event contains at least:

```json
{
  "event_id": "evt-001",
  "event_type": "AgentLifecycle",
  "kind": "started",
  "agent_ref": "builder-01",
  "task_ref": "task-01",
  "provenance": "host_native",
  "timestamp": "2026-08-13T00:00:01Z",
  "evidence_ref": null,
  "derived_from": []
}
```

Optional fixture fields are `project_ref`, `target_agent_ref`, `status`, `host_capability`, `task_registry`, `evidence_registry`, `attention_level`, `semantic_action`, `source_mochi`, and `target_mochi`. This is not a production Runtime schema. `project_ref` plus the `task_ref` on `RoomLifecycle.started` define the current room scope; records for another project or task are ignored for participants, valid bindings, task states, attention, evidence, recent events, and Projection.

The first `RoomLifecycle.started` record may also carry a small `fixture_expectations` object. It is test metadata, not a Runtime event. The validator supports `expected_result`, `expect_projection` (one object or a list of exact Projection fields), `forbid_projection_actions`, and `expect_summary` checks such as `active_task_refs_absent`, `active_task_states`, `unresolved_attention_contains`, and `unresolved_attention_absent`. These assertions protect output contract fields without introducing snapshot infrastructure.

Replay-only annotations such as `host_signal`, `stable_agent_id`, `parent_thread_ref`, `timed_out`, `closing_request_submitted`, and `previous_status` preserve a small amount of source-trace context. They never create a Semantic Event or Projection on their own. In particular, `timed_out: true` can only accompany a normalized `TaskStateChanged.interrupted`, and `previous_status: running` can only accompany `AgentLifecycle.stopped`.

An Ambient record is a separate typed input and is not a Semantic Event:

```json
{
  "ambient_behavior": {
    "actor_ref": "builder-01",
    "kind": "tea",
    "timestamp": "2026-08-13T00:00:20Z"
  }
}
```

V0.2 allows only `tea`, `sleep`, `walk`, `sit`, and `idle_play`. Semantic names such as `qa_review`, `handoff`, `task_complete`, `blocked`, `waiting_for_agent`, `human_required`, `approve`, and `celebrate_completion` are invalid Ambient kinds. Ambient input cannot carry task, evidence, attention, relation, status, or Semantic Action fields.

The optional fixture-only Evidence Registry contains `evidence_id`, `evidence_type`, and optionally `source_agent` and `task_ref`. Valid types are `artifact`, `diff`, `test`, `report`, and `host_event`. An `evidence_ref` must resolve to this registry and pass the event's minimal type compatibility check.

## Minimal Event Taxonomy

Do not add event types outside this list in V0.2.

| Event type | Allowed `kind` values | Meaning |
| --- | --- | --- |
| `RoomLifecycle` | `started`, `closed` | Room boundary. |
| `AgentLifecycle` | `started`, `stopped` | A real participant entered or left the observed run. |
| `TaskStateChanged` | `active`, `waiting`, `completed`, `failed`, `interrupted` | Observed task state. |
| `AgentTaskBound` | `assigned`, `attached`, `reassigned` | Real participant/task association. |
| `CollaborationObserved` | `handoff`, `review`, `finding`, `blocker`, `retry` | A sourced relation or collaboration observation. |
| `EvidenceProduced` | `artifact_created`, `artifact_updated`, `diff`, `test_failed`, `test_passed`, `report` | Artifact or verification evidence. |
| `AttentionRequested` | `approval`, `permission`, `user_input`, `decision`, `critical_blocker` | A Human attention request. |
| `HumanIntervention` | `pause`, `resume`, `cancel`, `reassign`, `approval`, `permission`, `decision` | Human request or Host-confirmed intervention. |

## Provenance

- `host_native`: a Host lifecycle, relation, approval, or input signal.
- `evidence_backed`: direct artifact, diff, test, or report evidence.
- `agent_declared`: an Agent claim that has not been Host or evidence confirmed.
- `human_declared`: a Human request or decision; it does not prove Runtime execution.
- `derived`: deterministically derived from earlier events; retain `derived_from`.

Projection strength is the safety boundary:

- **factual:** `host_native`, `evidence_backed`, or a valid strong `derived` chain.
- **qualified:** `agent_declared`; preserve “Agent reports/claims” wording.
- **authority:** `human_declared`; express the Human request or decision, not an executed Runtime state.

`derived` is strong only when every referenced source is factual and the derivation is an allowed deterministic transition. A source event must exist for every Semantic Action.

V0.2 whitelists only two deterministic rules:

- `failure_notice`: factual `TaskStateChanged.failed` plus evidence-backed `EvidenceProduced.test_failed` for the same Agent and Task may derive an `EvidenceProduced.report` with `Report Failure`.
- `confirmed_intervention`: a Human intervention request plus an explicit Host-confirmed intervention of the same kind and Task may derive a confirmed intervention state.

Temporal adjacency, Agent completion, artifact existence, or test failure alone never derives Handoff, Review, or another collaboration relation.

## Intervention State

Use only `requested`, `confirmed`, `rejected`, and `failed`.

`human_declared` may create a request. A `confirmed` intervention requires explicit Host confirmation (`host_native` in the fixture validator). A request to pause is not a paused task; the same rule applies to resume, cancel, reassign, approval, and permission.
