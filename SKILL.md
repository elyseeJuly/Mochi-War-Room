---
name: mochi-war-room
description: Convert an explicitly activated multi-agent project task into a truthful, watchable Mochi collaboration projection. Use only when a current project has at least two real identifiable agents, a shared task association, and a long-running or multi-stage collaboration; validate recorded host-derived events, provenance, limited visibility, human requests, and projection contracts without inventing participants or collaboration.
---

# Mochi War Room

## Purpose

Convert real multi-agent work into a watchable collaboration projection while forbidding collaboration that has no source.

## When to Use

Use only when all of these are true:

- Human explicitly activates the War Room.
- The work belongs to the current project and a current multi-agent task.
- At least two real, identifiable Agent Participants exist.
- The task is long-running or has multiple meaningful phases.

## When Not to Use

Do not use for a single-agent task, a simple short task, ordinary Pet status, an unconfirmed Agent or Task association, or when the Human has not requested activation. Do not require the host to call its participants “Subagents”; stable real identities are what matter.

## Seven-Step Workflow

1. Confirm explicit activation.
2. Detect Host Capability Tier.
3. Register real participants and task bindings.
4. Normalize recorded host signals with provenance.
5. Classify Semantic Events and apply the communication threshold.
6. Emit Projection, Attention, and minimal state updates.
7. Close the room and produce a War Room Summary.

Read [capability-and-modes.md](references/capability-and-modes.md) for Tier rules, [events-and-provenance.md](references/events-and-provenance.md) for event and source rules, [projection-and-attention.md](references/projection-and-attention.md) for actions and speech, and [validation.md](references/validation.md) before validating a fixture or projection.

## Capability Summary

- **Tier A — Collaboration Mode:** the host can expose real participants, bindings, lifecycle, artifacts, review relations, and human input.
- **Tier B — Limited Collaboration Visibility:** the host exposes real work and some results, but not complete collaboration relations.
- **Tier C — Unsupported:** the host cannot establish the minimum real-participant and task context.

Tier is based on Host Capability, not on how many events happened in this run. A Tier A host does not become Tier B merely because no handoff or review has happened yet.

## Truthfulness Guardrails

- Host Truth First.
- Projection cannot be stronger than its source.
- Only real participants become Mochi.
- Collaboration cannot be acted out; ordinary life can be ambient.
- V0.2 uses recorded or replayable host-derived fixtures. It does not listen to a live Host.

## Attention and Completion

Human Required must have a legal Attention source. An intervention request is not runtime confirmation. Preserve `requested`, `confirmed`, `rejected`, and `failed` distinctly.

When the room closes, generate a War Room Summary from the observed state. Do not create a Pet Park, animation, runtime listener, Host adapter, or live Codex integration in V0.2.

For deterministic replay validation, run `python3 scripts/validate_projection.py --all` from this skill directory.
