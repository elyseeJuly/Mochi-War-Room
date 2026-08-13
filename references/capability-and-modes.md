# Capability and Modes

This reference separates what a Host can expose from what a particular run happened to observe.

## Host Capability

The capability declaration describes stable host support:

| Capability | Meaning |
| --- | --- |
| `supports_real_agents` | Stable identities for real execution participants. |
| `supports_task_binding` | Participants can be associated with the current project task. |
| `supports_lifecycle` | Started, active, waiting, completed, failed, or interrupted states can be sourced. |
| `supports_artifacts` | Artifacts, diffs, reports, or test results can be sourced. |
| `supports_review_relation` | A reviewer, subject, or review relation can be sourced. |
| `supports_human_input` | Approval, permission, decision, or user-input requests can be sourced. |

Tier is calculated from capability, not event count:

- **Tier A — Collaboration Mode:** all six capabilities are available.
- **Tier B — Limited Collaboration Visibility:** real agents, task binding, and lifecycle are available, but at least one richer capability is absent.
- **Tier C — Unsupported:** the host cannot establish real agents, task association, or lifecycle context.

The fixture field `host_capability` is a replay-only declaration, not a production Runtime schema.

## Run Observation

Events describe what happened in this run. A Tier A host may have no handoff, review, approval, or blocker in a particular run. Absence of an event is not evidence that the Host lacks that capability. Only observed events may produce their corresponding projections.

## Participant Requirements

War Room activation requires at least two real participants with stable identities and a current task association. “Subagent” is not a required mechanism; parent/child, peer, worker, or thread-backed participants are valid when real and identifiable.

One real agent can produce a single-agent summary, but must not produce a multi-Mochi War Room.

## Fallback

- If the host is Tier B and has two real participants, enter Limited Mode.
- If the host is Tier C, or fewer than two real participants can be established, refuse multi-Mochi projection and explain the missing basis.
- Never invent Lead, Builder, QA, Reviewer, or any other role to fill a visual layout.

## Limited Mode

Limited Mode may show real participants, active/waiting/completed/failed state, artifact existence, Host approval or user-input requests, ambient behavior, and actions directly supported by observed evidence.

It must not show unconfirmed delegation, handoff, review relation, conflict, blocker relation, artifact transfer, or collaboration dialogue. Use the human-facing label:

> Limited Collaboration Visibility: the Host exposes Agent activity and some results, but not complete collaboration relations. Mochi shows only confirmed states, artifacts, and Human requests.

Show this explanation once by default; keep technical reasons in details.
