# Projection and Attention

## Semantic Action Contract

The validator derives or checks only actions supported by an observed source event.

| Source event | Allowed Mochi action | Human interpretation |
| --- | --- | --- |
| `AgentLifecycle.started` | `Enter Park`, `Begin Work` | A real participant appeared. |
| `TaskStateChanged.active` | `Continue Work` | The observed task is active. |
| `TaskStateChanged.waiting` | `Wait` | The task is waiting; no dependency is implied. |
| `TaskStateChanged.completed` | `Finish Work`, `Leave Room / Settle Down`, `Celebrate` | The referenced task reached completion. |
| `TaskStateChanged.failed` | `Report Failure` | The referenced task failed. |
| `AgentTaskBound` | `Assign` | A real task binding exists. |
| `CollaborationObserved.handoff` | `Handoff`, `Deliver Artifact` | A sourced transfer relation exists. |
| `CollaborationObserved.review` | `Inspect`, `Return for Revision`, `Approve` | A sourced review relation exists; approval requires an approved review. |
| `CollaborationObserved.finding` | `Report Finding` | A finding was observed or reported, with source strength preserved. |
| `CollaborationObserved.blocker` | `Report Critical Blocker` | A blocker was reported; certainty follows provenance. |
| `CollaborationObserved.retry` | `Retry` | A new execution attempt was observed. |
| `EvidenceProduced` | `Produce Artifact`, `Update Artifact`, `Report Failure`, `Report Finding` | Evidence exists. |
| `AttentionRequested` | `Approach Human`, `Request Approval`, `Request Decision` | Human attention is requested. |

Tier B forbids relation-dependent actions: `Handoff`, `Deliver Artifact`, `Inspect`, `Return for Revision`, `Approve`, `Ask Another Mochi`, and `Gather`.

An `agent_declared` `CollaborationObserved.handoff` is the one qualified relation report allowed in V0.2. It emits `Report Handoff` with `projection_strength: qualified` and a qualified speech bubble. It never creates `target_mochi`, Handoff/Deliver Artifact semantics, task-binding changes, artifact ownership transfer, Review Started, or completion. If the named target is not a registered participant, retain only the source Agent's qualified report and mark the target unverified.

## Ambient Behavior Contract

Ambient Behavior is a typed input, but not an Event, and never enters the Semantic Event stream or task state. Allowed kinds are `tea`, `sleep`, `walk`, `sit`, and `idle_play`. It may produce only an Ambient Projection.

Ambient behavior must not change Task State, Attention, Evidence, or Collaboration Relations. Semantic kinds such as `qa_review`, `handoff`, `task_complete`, `blocked`, `waiting_for_agent`, `human_required`, `approve`, and `celebrate_completion` are invalid and must be rejected. At Level 2, reduce ambient frequency, keep the attention signal unobscured, and do not use celebration or sleep to mask the request.

> Collaboration cannot be acted out; ordinary life can be ambient.

## Speech Bubbles

Use a hybrid contract:

- Deterministic templates for approval, Human Required, completion, failure, review start, artifact production, retry, and attention signals. Examples: “需要你的批准才能继续。” and “有测试没有通过。”
- Qualified natural-language projection for findings, blockers, handoffs, and short coordination acknowledgments. Example: “QA 报告：发现一个可能的问题。”

Never show Chain of Thought, tool logs, meaningless progress, invented dialogue, or a qualified Agent claim as a confirmed fact.

## Attention Levels

- **Level 0 — Ambient:** ordinary work, waiting, artifact activity, or safe progress.
- **Level 1 — Notice:** milestone, artifact, review started, retry, or phase completion that needs no action.
- **Level 2 — Human Required:** Host approval, permission, user input, decision, or a strongly supported critical blocker.

Level 2 can clear only after a Host-confirmed/rejected intervention, an answered input acknowledged by the Host, a resolved blocker, or explicit task cancellation/closure. An Agent claim, unrelated task completion, timeout, or ambient action cannot clear it.
