#!/usr/bin/env python3
"""Deterministic validator for the Mochi War Room V0.2 fixture contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


EVENT_KINDS = {
    "RoomLifecycle": {"started", "closed"},
    "AgentLifecycle": {"started", "stopped"},
    "TaskStateChanged": {"active", "waiting", "completed", "failed", "interrupted"},
    "AgentTaskBound": {"assigned", "attached", "reassigned"},
    "CollaborationObserved": {"handoff", "review", "finding", "blocker", "retry"},
    "EvidenceProduced": {"artifact_created", "artifact_updated", "diff", "test_failed", "test_passed", "report"},
    "AttentionRequested": {"approval", "permission", "user_input", "decision", "critical_blocker"},
    "HumanIntervention": {"pause", "resume", "cancel", "reassign", "approval", "permission", "decision"},
}
PROVENANCE = {"host_native", "evidence_backed", "agent_declared", "human_declared", "derived"}
FACTUAL = {"host_native", "evidence_backed"}
CAPABILITY_KEYS = {
    "supports_real_agents",
    "supports_task_binding",
    "supports_lifecycle",
    "supports_artifacts",
    "supports_review_relation",
    "supports_human_input",
}
INTERVENTION_STATUS = {"requested", "confirmed", "rejected", "failed"}
AMBIENT_ALLOWED = {"tea", "sleep", "walk", "sit", "idle_play"}
AMBIENT_FORBIDDEN = {
    "qa_review",
    "handoff",
    "task_complete",
    "blocked",
    "waiting_for_agent",
    "human_required",
    "approve",
    "celebrate_completion",
}
EVIDENCE_TYPES = {"artifact", "diff", "test", "report", "host_event"}
DERIVED_RULES = {"failure_notice", "confirmed_intervention"}
AMBIENT_SEMANTIC_FIELDS = {
    "event_id",
    "event_type",
    "kind",
    "task_ref",
    "provenance",
    "evidence_ref",
    "derived_from",
    "semantic_action",
    "attention_level",
    "status",
    "target_agent_ref",
    "source_mochi",
    "target_mochi",
}
AMBIENT_PAYLOAD_FIELDS = {"actor_ref", "kind", "timestamp"}
RELATION_ACTIONS = {
    "Handoff",
    "Deliver Artifact",
    "Inspect",
    "Return for Revision",
    "Approve",
    "Ask Another Mochi",
    "Gather",
}
TIER_B_FORBIDDEN = RELATION_ACTIONS

ACTION_MAP = {
    ("AgentLifecycle", "started"): {"Enter Park", "Begin Work"},
    ("TaskStateChanged", "active"): {"Continue Work"},
    ("TaskStateChanged", "waiting"): {"Wait"},
    ("TaskStateChanged", "completed"): {"Finish Work", "Leave Room / Settle Down", "Celebrate"},
    ("TaskStateChanged", "failed"): {"Report Failure"},
    ("AgentTaskBound", "assigned"): {"Assign"},
    ("AgentTaskBound", "attached"): {"Assign"},
    ("AgentTaskBound", "reassigned"): {"Assign"},
    ("CollaborationObserved", "handoff"): {"Handoff", "Deliver Artifact"},
    ("CollaborationObserved", "review"): {"Inspect", "Return for Revision", "Approve"},
    ("CollaborationObserved", "finding"): {"Report Finding"},
    ("CollaborationObserved", "blocker"): {"Report Critical Blocker"},
    ("CollaborationObserved", "retry"): {"Retry"},
    ("EvidenceProduced", "artifact_created"): {"Produce Artifact"},
    ("EvidenceProduced", "artifact_updated"): {"Update Artifact"},
    ("EvidenceProduced", "diff"): {"Produce Artifact", "Update Artifact"},
    ("EvidenceProduced", "test_failed"): {"Report Failure"},
    ("EvidenceProduced", "test_passed"): set(),
    ("EvidenceProduced", "report"): {"Report Finding", "Report Failure"},
    ("AttentionRequested", "approval"): {"Approach Human", "Request Approval"},
    ("AttentionRequested", "permission"): {"Approach Human", "Request Decision"},
    ("AttentionRequested", "user_input"): {"Approach Human", "Request Decision"},
    ("AttentionRequested", "decision"): {"Approach Human", "Request Decision"},
    ("AttentionRequested", "critical_blocker"): {"Approach Human", "Report Critical Blocker"},
}

EVIDENCE_COMPATIBILITY = {
    ("CollaborationObserved", "handoff"): {"host_event"},
    ("CollaborationObserved", "review"): {"host_event"},
    ("CollaborationObserved", "finding"): {"artifact", "diff", "test", "report"},
    ("CollaborationObserved", "blocker"): {"host_event", "report"},
    ("EvidenceProduced", "artifact_created"): {"artifact"},
    ("EvidenceProduced", "artifact_updated"): {"artifact"},
    ("EvidenceProduced", "diff"): {"diff"},
    ("EvidenceProduced", "test_failed"): {"test"},
    ("EvidenceProduced", "test_passed"): {"test"},
    ("EvidenceProduced", "report"): {"report"},
    ("AttentionRequested", "approval"): {"host_event"},
    ("AttentionRequested", "permission"): {"host_event"},
    ("AttentionRequested", "user_input"): {"host_event"},
    ("AttentionRequested", "decision"): {"host_event"},
    ("AttentionRequested", "critical_blocker"): {"host_event", "report"},
    ("HumanIntervention", "pause"): {"host_event"},
    ("HumanIntervention", "resume"): {"host_event"},
    ("HumanIntervention", "cancel"): {"host_event"},
    ("HumanIntervention", "reassign"): {"host_event"},
    ("HumanIntervention", "approval"): {"host_event"},
    ("HumanIntervention", "permission"): {"host_event"},
    ("HumanIntervention", "decision"): {"host_event"},
}


def strength(event: dict[str, Any], events_by_id: dict[str, dict[str, Any]]) -> str:
    source = event.get("provenance")
    if source in FACTUAL:
        return "factual"
    if source == "human_declared":
        return "authority"
    if source == "agent_declared":
        return "qualified"
    if source == "derived":
        refs = event.get("derived_from", [])
        if event.get("derived_rule") == "confirmed_intervention":
            if refs and any(
                events_by_id.get(ref, {}).get("event_type") == "HumanIntervention"
                and events_by_id.get(ref, {}).get("status") == "confirmed"
                and events_by_id.get(ref, {}).get("provenance") == "host_native"
                for ref in refs
            ):
                return "factual"
        if refs and all(r in events_by_id for r in refs) and all(strength(events_by_id[r], events_by_id) == "factual" for r in refs):
            return "factual"
    return "qualified"


def is_ambient_record(record: dict[str, Any]) -> bool:
    return "ambient_behavior" in record


def is_qualified_handoff(event: dict[str, Any]) -> bool:
    return (
        event.get("event_type") == "CollaborationObserved"
        and event.get("kind") == "handoff"
        and event.get("provenance") == "agent_declared"
    )


def evidence_type_for(
    event: dict[str, Any],
    evidence_registry: dict[str, dict[str, Any]],
) -> set[str] | None:
    evidence_ref = event.get("evidence_ref")
    if not evidence_ref:
        return None
    evidence = evidence_registry.get(evidence_ref)
    if not evidence:
        return set()
    if event.get("derived_rule") == "failure_notice":
        return {"test", "report"}
    return EVIDENCE_COMPATIBILITY.get((event.get("event_type"), event.get("kind")))


def append_qualified_handoff(
    projections: list[dict[str, Any]],
    warnings: list[str],
    event: dict[str, Any],
    participants: set[str],
) -> None:
    target = event.get("target_agent_ref")
    if target and target not in participants:
        warnings.append(
            f"event {event.get('event_id')}: Agent-declared handoff target {target!r} is unverified"
        )
    projections.append(
        {
            "event_id": event.get("event_id"),
            "source_mochi": event.get("source_mochi") or event.get("agent_ref"),
            "target_mochi": None,
            "action": "Report Handoff",
            "attention": 0,
            "projection_strength": "qualified",
            "provenance": "agent_declared",
            "evidence_ref": None,
            "human_text": speech_for(event, "Report Handoff"),
        }
    )


def read_jsonl(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    events: list[dict[str, Any]] = []
    errors: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [], [f"cannot read {path}: {exc}"]
    for line_no, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"line {line_no}: malformed JSON ({exc.msg})")
            continue
        if not isinstance(value, dict):
            errors.append(f"line {line_no}: record must be an object")
            continue
        value["_line"] = line_no
        events.append(value)
    return events, errors


def basic_event_is_valid(event: dict[str, Any]) -> bool:
    required = ("event_id", "event_type", "kind", "task_ref", "provenance", "timestamp", "evidence_ref", "derived_from")
    if any(field not in event for field in required):
        return False
    event_type = event.get("event_type")
    if event_type not in EVENT_KINDS or event.get("kind") not in EVENT_KINDS.get(event_type, set()):
        return False
    if event.get("provenance") not in PROVENANCE:
        return False
    if event.get("provenance") == "evidence_backed" and not event.get("evidence_ref"):
        return False
    return isinstance(event.get("derived_from"), list)


def tier_for(capability: dict[str, Any] | None) -> str:
    if not isinstance(capability, dict):
        return "C"
    if not all(capability.get(key) is True for key in {"supports_real_agents", "supports_task_binding", "supports_lifecycle"}):
        return "C"
    if all(capability.get(key) is True for key in CAPABILITY_KEYS):
        return "A"
    return "B"


def derive_action(event: dict[str, Any]) -> str | None:
    options = ACTION_MAP.get((event.get("event_type"), event.get("kind")), set())
    return sorted(options)[0] if len(options) == 1 else None


def speech_for(event: dict[str, Any], action: str | None) -> str | None:
    """Return only deterministic or explicitly qualified human-facing text."""
    event_type = event.get("event_type")
    kind = event.get("kind")
    if event_type == "AttentionRequested" and kind == "approval":
        return "需要你的批准才能继续。"
    if event_type == "AttentionRequested" and kind in {"permission", "user_input", "decision"}:
        return "需要你的决定才能继续。"
    if event_type == "EvidenceProduced" and kind == "test_failed":
        return "有测试没有通过。"
    if event_type == "TaskStateChanged" and kind == "failed":
        return "当前任务执行失败。"
    if event_type == "TaskStateChanged" and kind == "completed":
        return "当前任务已完成。"
    if event_type == "EvidenceProduced" and kind in {"artifact_created", "artifact_updated", "diff"}:
        return "产物已生成或更新。"
    if event_type == "CollaborationObserved" and kind == "retry":
        return "正在重新尝试。"
    if event_type == "CollaborationObserved" and kind == "finding":
        if event.get("provenance") == "agent_declared":
            return "Agent 报告：发现一个可能的问题。"
        return "发现了一个问题。"
    if event_type == "CollaborationObserved" and kind == "blocker":
        if event.get("provenance") == "agent_declared":
            return "Agent 报告：遇到一个可能的阻塞。"
        return "发现一个阻塞。"
    if event_type == "CollaborationObserved" and kind == "handoff" and event.get("provenance") == "agent_declared":
        return "Agent 报告：声称已完成交接。"
    return None


def validate_derived_event(
    event: dict[str, Any],
    events_by_id: dict[str, dict[str, Any]],
    errors: list[str],
    invalid_event_ids: set[str] | None = None,
) -> bool:
    """Validate only the explicitly whitelisted deterministic derivations."""
    line = event.get("_line", "?")
    rule = event.get("derived_rule")
    refs = event.get("derived_from", [])
    valid = True
    if rule not in DERIVED_RULES:
        errors.append(f"line {line}: derived_rule {rule!r} is not whitelisted")
        return False
    if not isinstance(refs, list) or not refs:
        errors.append(f"line {line}: derived event needs derived_from")
        return False
    if len(set(refs)) != len(refs):
        errors.append(f"line {line}: derived_from contains duplicate source events")
        valid = False
    sources: list[dict[str, Any]] = []
    for ref in refs:
        if ref not in events_by_id:
            errors.append(f"line {line}: derived_from references unknown event {ref}")
            valid = False
        elif ref == event.get("event_id"):
            errors.append(f"line {line}: derived event cannot reference itself")
            valid = False
        else:
            sources.append(events_by_id[ref])
            if invalid_event_ids is not None and ref in invalid_event_ids:
                errors.append(f"line {line}: derived_from references an invalid source event {ref}")
                valid = False
    if not valid:
        return False

    if rule == "failure_notice":
        if len(sources) != 2 or event.get("event_type") != "EvidenceProduced" or event.get("kind") != "report":
            errors.append("failure_notice requires exactly two sources and an EvidenceProduced.report target")
            return False
        failed = next(
            (
                source
                for source in sources
                if source.get("event_type") == "TaskStateChanged" and source.get("kind") == "failed"
            ),
            None,
        )
        test_failed = next(
            (
                source
                for source in sources
                if source.get("event_type") == "EvidenceProduced" and source.get("kind") == "test_failed"
            ),
            None,
        )
        if failed is None or test_failed is None:
            errors.append("failure_notice requires TaskStateChanged.failed plus EvidenceProduced.test_failed")
            valid = False
        else:
            if failed.get("provenance") not in FACTUAL:
                errors.append("failure_notice task failure source must be factual")
                valid = False
            if test_failed.get("provenance") != "evidence_backed":
                errors.append("failure_notice test failure source must be evidence_backed")
                valid = False
            if failed.get("task_ref") != test_failed.get("task_ref") or failed.get("agent_ref") != test_failed.get("agent_ref"):
                errors.append("failure_notice sources must share agent_ref and task_ref")
                valid = False
            if event.get("agent_ref") != failed.get("agent_ref") or event.get("task_ref") != failed.get("task_ref"):
                errors.append("failure_notice target must retain agent_ref and task_ref")
                valid = False
        if event.get("semantic_action") not in {None, "Report Failure"}:
            errors.append("failure_notice may only emit Report Failure")
            valid = False
        return valid

    if len(sources) != 2 or event.get("event_type") != "HumanIntervention" or event.get("status") != "confirmed":
        errors.append("confirmed_intervention requires two sources and a confirmed HumanIntervention target")
        return False
    request = next(
        (
            source
            for source in sources
            if source.get("event_type") == "HumanIntervention" and source.get("status") == "requested"
        ),
        None,
    )
    confirmation = next(
        (
            source
            for source in sources
            if source.get("event_type") == "HumanIntervention" and source.get("status") == "confirmed"
        ),
        None,
    )
    if request is None or confirmation is None:
        errors.append("confirmed_intervention requires a requested intervention plus a Host-confirmed intervention")
        valid = False
    else:
        if request.get("provenance") not in {"human_declared", "host_native"}:
            errors.append("confirmed_intervention request source has invalid provenance")
            valid = False
        if confirmation.get("provenance") != "host_native":
            errors.append("confirmed_intervention confirmation source must be host_native")
            valid = False
        if request.get("kind") != confirmation.get("kind") or request.get("kind") != event.get("kind"):
            errors.append("confirmed_intervention sources and target must share kind")
            valid = False
        if request.get("task_ref") != confirmation.get("task_ref") or request.get("task_ref") != event.get("task_ref"):
            errors.append("confirmed_intervention sources and target must share task_ref")
            valid = False
        if event.get("related_event_id") != request.get("event_id"):
            errors.append("confirmed_intervention target must identify the requested intervention")
            valid = False
    return valid


def validate(events: list[dict[str, Any]], parse_errors: list[str] | None = None) -> dict[str, Any]:
    errors = list(parse_errors or [])
    warnings: list[str] = []
    event_ids: set[str] = set()
    events_by_id: dict[str, dict[str, Any]] = {}
    ambient_records: list[dict[str, Any]] = []
    ambient_projections: list[dict[str, Any]] = []
    evidence_registry: dict[str, dict[str, Any]] = {}
    participants: set[str] = set()
    participant_tasks: dict[str, set[str]] = {}
    bindings: set[tuple[str, str]] = set()
    invalid_event_ids: set[str] = set()
    invalid_binding_events: set[str] = set()
    invalid_derived_events: set[str] = set()
    known_tasks: set[str] = set()
    task_states: dict[str, dict[str, str]] = {}
    projections: list[dict[str, Any]] = []
    rejected_projections: list[dict[str, Any]] = []
    interventions: dict[str, dict[str, Any]] = {}
    unresolved_attention: dict[str, dict[str, Any]] = {}
    capability: dict[str, Any] | None = None
    room_started = False
    room_closed = False

    for event in events:
        line = event.get("_line", "?")
        if is_ambient_record(event):
            ambient_records.append(event)
            continue
        event_id = event.get("event_id")
        if not isinstance(event_id, str) or not event_id:
            errors.append(f"line {line}: event_id is required")
            continue
        if event_id in event_ids:
            errors.append(f"line {line}: duplicate event_id {event_id}")
            invalid_event_ids.add(event_id)
        event_ids.add(event_id)
        events_by_id[event_id] = event
        for field in ("event_type", "kind", "task_ref", "provenance", "timestamp", "evidence_ref", "derived_from"):
            if field not in event:
                errors.append(f"line {line}: missing required field {field}")
        event_type = event.get("event_type")
        kind = event.get("kind")
        if event_type not in EVENT_KINDS:
            errors.append(f"line {line}: unknown event_type {event_type!r}")
        elif kind not in EVENT_KINDS[event_type]:
            errors.append(f"line {line}: invalid kind {kind!r} for {event_type}")
        if event.get("provenance") not in PROVENANCE:
            errors.append(f"line {line}: invalid provenance {event.get('provenance')!r}")
        if event.get("provenance") == "evidence_backed" and not event.get("evidence_ref"):
            errors.append(f"line {line}: evidence_backed event needs evidence_ref")
        if not isinstance(event.get("derived_from"), list):
            errors.append(f"line {line}: derived_from must be a list")
        if not basic_event_is_valid(event):
            invalid_event_ids.add(event_id)
        if event.get("event_type") == "RoomLifecycle" and event.get("kind") == "started":
            room_started = True
            if capability is None:
                capability = event.get("host_capability")
            if isinstance(event.get("task_ref"), str):
                known_tasks.add(event["task_ref"])
        if "task_registry" in event:
            registry_tasks = event.get("task_registry")
            if not isinstance(registry_tasks, list) or not all(isinstance(task, str) for task in registry_tasks):
                errors.append(f"line {line}: task_registry must be a list of task identifiers")
            else:
                known_tasks.update(registry_tasks)
        if "evidence_registry" in event:
            registry = event.get("evidence_registry")
            if not isinstance(registry, list):
                errors.append(f"line {line}: evidence_registry must be a list")
            else:
                for item in registry:
                    if not isinstance(item, dict):
                        errors.append(f"line {line}: evidence_registry entries must be objects")
                        continue
                    evidence_id = item.get("evidence_id")
                    evidence_type = item.get("evidence_type")
                    if not isinstance(evidence_id, str) or not evidence_id:
                        errors.append(f"line {line}: evidence_registry entry needs evidence_id")
                        continue
                    if evidence_id in evidence_registry:
                        errors.append(f"line {line}: duplicate evidence_id {evidence_id}")
                    if evidence_type not in EVIDENCE_TYPES:
                        errors.append(f"line {line}: invalid evidence_type {evidence_type!r}")
                    evidence_registry[evidence_id] = item
        if event.get("event_type") == "RoomLifecycle" and event.get("kind") == "closed":
            room_closed = True
        if event.get("event_type") == "AgentLifecycle" and event.get("kind") == "started":
            agent = event.get("agent_ref")
            if not isinstance(agent, str) or not agent:
                errors.append(f"line {line}: AgentLifecycle.started needs agent_ref")
            else:
                participants.add(agent)
                participant_tasks.setdefault(agent, set())
                if isinstance(event.get("task_ref"), str):
                    participant_tasks[agent].add(event["task_ref"])
        agent = event.get("agent_ref")

    for ambient in ambient_records:
        line = ambient.get("_line", "?")
        payload = ambient.get("ambient_behavior")
        if not isinstance(payload, dict):
            errors.append(f"line {line}: ambient_behavior must be an object")
            continue
        ambient_valid = True
        extra_payload_fields = set(payload) - AMBIENT_PAYLOAD_FIELDS
        if extra_payload_fields:
            errors.append(
                f"line {line}: ambient_behavior cannot carry extra semantic fields: "
                + ", ".join(sorted(extra_payload_fields))
            )
            ambient_valid = False
        extra_semantic_fields = AMBIENT_SEMANTIC_FIELDS.intersection(ambient)
        if extra_semantic_fields:
            errors.append(
                f"line {line}: Ambient Behavior cannot carry semantic fields: "
                + ", ".join(sorted(extra_semantic_fields))
            )
            ambient_valid = False
        for field in ("actor_ref", "kind", "timestamp"):
            if field not in payload:
                errors.append(f"line {line}: ambient_behavior missing {field}")
                ambient_valid = False
        actor = payload.get("actor_ref")
        kind = payload.get("kind")
        if actor not in participants:
            errors.append(f"line {line}: ambient actor {actor!r} is not a registered real participant")
            ambient_valid = False
        if kind in AMBIENT_FORBIDDEN:
            errors.append(f"line {line}: forbidden semantic leakage through Ambient Behavior: {kind!r}")
            ambient_valid = False
        elif kind not in AMBIENT_ALLOWED:
            errors.append(f"line {line}: invalid ambient kind {kind!r}")
            ambient_valid = False
        if ambient_valid:
            ambient_projections.append(
                {
                    "actor_ref": actor,
                    "kind": kind,
                    "projection_type": "ambient",
                    "attention": 0,
                }
            )

    if not room_started:
        errors.append("no RoomLifecycle.started event")
    if not isinstance(capability, dict):
        errors.append("RoomLifecycle.started needs host_capability for fixture replay")
        capability = {}
    else:
        missing = CAPABILITY_KEYS - set(capability)
        if missing:
            errors.append(f"host_capability missing keys: {', '.join(sorted(missing))}")
        for key in CAPABILITY_KEYS:
            if key in capability and not isinstance(capability[key], bool):
                errors.append(f"host_capability.{key} must be boolean")
    host_tier = tier_for(capability)
    mode = "Collaboration Mode" if host_tier == "A" else "Limited Collaboration Visibility" if host_tier == "B" else "Unsupported"

    for event in events:
        line = event.get("_line", "?")
        event_id = event.get("event_id")
        event_type = event.get("event_type")
        kind = event.get("kind")
        agent = event.get("agent_ref")
        if isinstance(agent, str) and agent and event_type not in {"AgentLifecycle", "RoomLifecycle"} and agent not in participants:
            errors.append(f"line {line}: source Agent {agent} is not a registered real participant")
            invalid_event_ids.add(event_id)
        qualified_handoff = is_qualified_handoff(event)
        target_agent = event.get("target_agent_ref")
        if isinstance(target_agent, str) and target_agent not in participants and not qualified_handoff:
            errors.append(f"line {line}: target Agent {target_agent} is not a registered real participant")
            invalid_event_ids.add(event_id)
        if event_type == "AgentLifecycle" and kind == "stopped" and agent not in participants:
            errors.append(f"line {line}: stopped Agent {agent} was never registered")
        source_mochi = event.get("source_mochi")
        target_mochi = event.get("target_mochi")
        for field, ref in (("source_mochi", source_mochi), ("target_mochi", target_mochi)):
            if ref is not None and ref not in participants:
                errors.append(f"line {line}: {field} {ref} is not a registered real participant")
                invalid_event_ids.add(event_id)
        if source_mochi is not None and isinstance(agent, str) and source_mochi != agent:
            errors.append(f"line {line}: source_mochi must match the event agent_ref")
            invalid_event_ids.add(event_id)
        if target_mochi is not None and event.get("target_agent_ref") is not None and target_mochi != event.get("target_agent_ref"):
            errors.append(f"line {line}: target_mochi must match target_agent_ref")
            invalid_event_ids.add(event_id)

        if event_type == "AgentTaskBound":
            if event.get("provenance") not in FACTUAL:
                invalid_binding_events.add(event_id)
                errors.append(f"line {line}: AgentTaskBound needs factual provenance")
            binding_valid = (
                isinstance(agent, str)
                and agent in participants
                and isinstance(event.get("task_ref"), str)
                and event.get("task_ref") in known_tasks
                and event.get("task_ref") in participant_tasks.get(agent, set())
            )
            if not binding_valid:
                invalid_binding_events.add(event_id)
                invalid_event_ids.add(event_id)
                if agent not in participants:
                    errors.append(f"line {line}: task binding source Agent {agent!r} is not registered")
                if event.get("task_ref") not in known_tasks:
                    errors.append(f"line {line}: task {event.get('task_ref')!r} is not registered for this fixture")
                if (
                    agent in participants
                    and event.get("task_ref") in known_tasks
                    and event.get("task_ref") not in participant_tasks.get(agent, set())
                ):
                    errors.append(
                        f"line {line}: participant {agent!r} has no declared association with task "
                        f"{event.get('task_ref')!r}"
                    )
            elif event.get("provenance") in FACTUAL:
                bindings.add((agent, event["task_ref"]))
        if event_type == "TaskStateChanged" and isinstance(agent, str) and agent in participants:
            task_states.setdefault(agent, {})[event.get("task_ref")] = kind
        if event_type == "AgentLifecycle" and kind == "started" and isinstance(agent, str):
            participant_tasks.setdefault(agent, set()).add(event.get("task_ref"))

        evidence_ref = event.get("evidence_ref")
        if evidence_ref:
            evidence = evidence_registry.get(evidence_ref)
            if evidence is None:
                errors.append(f"line {line}: evidence_ref {evidence_ref!r} is not declared in evidence_registry")
                invalid_event_ids.add(event_id)
            else:
                if evidence.get("task_ref") and evidence.get("task_ref") != event.get("task_ref"):
                    errors.append(f"line {line}: evidence_ref {evidence_ref!r} belongs to a different task")
                    invalid_event_ids.add(event_id)
                if evidence.get("source_agent") and evidence.get("source_agent") != event.get("agent_ref"):
                    errors.append(f"line {line}: evidence_ref {evidence_ref!r} belongs to a different source Agent")
                    invalid_event_ids.add(event_id)
                compatible = evidence_type_for(event, evidence_registry)
                if compatible is not None and evidence.get("evidence_type") not in compatible:
                    errors.append(
                        f"line {line}: evidence type {evidence.get('evidence_type')!r} is not valid for "
                        f"{event_type}.{kind}"
                    )
                    invalid_event_ids.add(event_id)

        if event.get("provenance") == "derived":
            # Derived records are validated and emitted after all direct source events
            # have been checked, so source validity is independent of JSONL order.
            continue

        if event_type == "AttentionRequested" and event.get("attention_level") == 2:
            if event.get("provenance") not in FACTUAL and event.get("provenance") != "derived":
                errors.append(f"line {line}: Level 2 Human Required needs strong Host/evidence provenance")
                invalid_event_ids.add(event_id)
            else:
                unresolved_attention[event_id] = event
        if event_type == "HumanIntervention":
            status = event.get("status")
            if status not in INTERVENTION_STATUS:
                errors.append(f"line {line}: intervention status must be requested/confirmed/rejected/failed")
                invalid_event_ids.add(event_id)
            related = event.get("related_event_id")
            derived_confirmation = (
                event.get("provenance") == "derived"
                and event.get("derived_rule") == "confirmed_intervention"
            )
            if status in {"confirmed", "rejected"}:
                if not derived_confirmation and (event.get("provenance") != "host_native" or not event.get("evidence_ref")):
                    errors.append(f"line {line}: {status} intervention needs Host confirmation and evidence_ref")
                    invalid_event_ids.add(event_id)
                if not related or related not in events_by_id:
                    errors.append(f"line {line}: {status} intervention needs a prior related request")
                    invalid_event_ids.add(event_id)
                else:
                    related_event = events_by_id[related]
                    related_is_attention = related_event.get("event_type") == "AttentionRequested"
                    related_is_intervention_request = (
                        related_event.get("event_type") == "HumanIntervention"
                        and related_event.get("status") == "requested"
                    )
                    if not (related_is_attention or related_is_intervention_request):
                        errors.append(
                            f"line {line}: related confirmation is not an AttentionRequested or requested HumanIntervention event"
                        )
                        invalid_event_ids.add(event_id)
                    elif related_event.get("kind") != event.get("kind"):
                        errors.append(f"line {line}: intervention kind does not match its related request")
                        invalid_event_ids.add(event_id)
                    elif event.get("provenance") == "host_native" or derived_confirmation:
                        if related_is_attention:
                            unresolved_attention.pop(related, None)
                        elif related_event.get("related_event_id"):
                            unresolved_attention.pop(related_event["related_event_id"], None)
            elif status == "requested":
                if event.get("provenance") not in {"human_declared", "host_native"}:
                    errors.append(f"line {line}: intervention request has invalid authority provenance")
                    invalid_event_ids.add(event_id)
                if related and related not in events_by_id:
                    errors.append(f"line {line}: intervention request references unknown event {related}")
                    invalid_event_ids.add(event_id)
            interventions[event_id] = event

        if qualified_handoff:
            action = event.get("semantic_action")
            if action not in {None, "Report Handoff"}:
                rejected_projections.append(
                    {
                        "event_id": event_id,
                        "action": action,
                        "reason": "agent_declared handoff can only emit a qualified report",
                    }
                )
                errors.append(f"line {line}: agent_declared handoff cannot emit confirmed action {action!r}")
                invalid_event_ids.add(event_id)
            if event.get("target_mochi") is not None:
                errors.append(f"line {line}: qualified handoff cannot target a Mochi")
                invalid_event_ids.add(event_id)
            if agent in participants:
                append_qualified_handoff(projections, warnings, event, participants)
            continue

        if event_id in invalid_event_ids or event_id in invalid_binding_events or event_id in invalid_derived_events:
            continue

        if event_type == "AgentTaskBound" and event.get("provenance") not in FACTUAL:
            if event.get("semantic_action") is not None:
                errors.append(f"line {line}: non-factual task binding cannot emit Assign")
            continue

        action = event.get("semantic_action")
        if action is not None:
            allowed = ACTION_MAP.get((event_type, kind), set())
            if action not in allowed:
                rejected_projections.append({"event_id": event_id, "action": action, "reason": "action not allowed by source event"})
                errors.append(f"line {line}: action {action!r} is not allowed for {event_type}.{kind}")
                invalid_event_ids.add(event_id)
                continue
            source_strength = strength(event, events_by_id)
            if event.get("provenance") == "agent_declared" and action not in {"Report Finding", "Report Critical Blocker", "Report Failure"}:
                rejected_projections.append({"event_id": event_id, "action": action, "reason": "agent_declared cannot create factual projection"})
                errors.append(f"line {line}: agent_declared cannot create confirmed action {action!r}")
                invalid_event_ids.add(event_id)
                continue
            if action in RELATION_ACTIONS:
                target = event.get("target_agent_ref") or target_mochi
                if not target or target not in participants:
                    errors.append(f"line {line}: relation action {action!r} needs a real target participant")
                    invalid_event_ids.add(event_id)
                if source_strength != "factual":
                    errors.append(f"line {line}: relation action {action!r} needs factual provenance")
                    invalid_event_ids.add(event_id)
                if not event.get("evidence_ref"):
                    errors.append(f"line {line}: relation action {action!r} needs relation evidence_ref")
                    invalid_event_ids.add(event_id)
                if host_tier == "B":
                    errors.append(f"line {line}: Tier B cannot project relation action {action!r}")
                    invalid_event_ids.add(event_id)
                if action == "Approve" and event.get("status") != "approved":
                    errors.append(f"line {line}: Approve requires an approved review status")
                    invalid_event_ids.add(event_id)
            if action == "Celebrate" and not (event_type == "TaskStateChanged" and kind == "completed"):
                errors.append(f"line {line}: Celebrate requires TaskStateChanged.completed")
                invalid_event_ids.add(event_id)
            if event_type == "AttentionRequested" and action in {"Approach Human", "Request Approval", "Request Decision"}:
                if event.get("attention_level") == 2 and event.get("provenance") not in FACTUAL and event.get("provenance") != "derived":
                    errors.append(f"line {line}: Human Required action lacks strong attention evidence")
                    invalid_event_ids.add(event_id)
            if source_strength == "qualified" and action in RELATION_ACTIONS:
                errors.append(f"line {line}: qualified source cannot be projected as factual relation")
                invalid_event_ids.add(event_id)
            if event_id in invalid_event_ids:
                continue
            projections.append({
                "event_id": event_id,
                "source_mochi": source_mochi or agent,
                "target_mochi": target_mochi or event.get("target_agent_ref"),
                "action": action,
                "attention": event.get("attention_level", 0),
                "projection_strength": source_strength,
                "provenance": event.get("provenance"),
                "evidence_ref": event.get("evidence_ref"),
                "human_text": speech_for(event, action),
            })
        elif event_type in EVENT_KINDS:
            inferred = derive_action(event)
            if inferred and agent in participants and not (
                event_type == "AgentTaskBound" and event.get("provenance") not in FACTUAL
            ):
                projections.append({
                    "event_id": event_id,
                    "source_mochi": agent,
                    "target_mochi": event.get("target_agent_ref"),
                    "action": inferred,
                    "attention": event.get("attention_level", 0),
                    "projection_strength": strength(event, events_by_id),
                    "provenance": event.get("provenance"),
                    "evidence_ref": event.get("evidence_ref"),
                    "human_text": speech_for(event, inferred),
                })

    for event in events:
        if event.get("provenance") != "derived":
            continue
        event_id = event.get("event_id")
        if not validate_derived_event(event, events_by_id, errors, invalid_event_ids):
            invalid_derived_events.add(event_id)
            invalid_event_ids.add(event_id)
            continue
        if event_id in invalid_event_ids:
            invalid_derived_events.add(event_id)
            continue
        event_type = event.get("event_type")
        agent = event.get("agent_ref")
        if event_type == "HumanIntervention":
            interventions[event_id] = event
            related = event.get("related_event_id")
            if related in interventions:
                related_event = interventions[related]
                if related_event.get("related_event_id"):
                    unresolved_attention.pop(related_event["related_event_id"], None)
            elif related:
                unresolved_attention.pop(related, None)
            continue
        action = event.get("semantic_action") or derive_action(event)
        if action and agent in participants:
            projections.append({
                "event_id": event_id,
                "source_mochi": event.get("source_mochi") or agent,
                "target_mochi": event.get("target_mochi") or event.get("target_agent_ref"),
                "action": action,
                "attention": event.get("attention_level", 0),
                "projection_strength": strength(event, events_by_id),
                "provenance": event.get("provenance"),
                "evidence_ref": event.get("evidence_ref"),
                "human_text": speech_for(event, action),
            })

    if len(participants) < 2:
        warnings.append("fewer than two real participants: multi-Mochi War Room is not eligible")
        if host_tier != "C":
            mode = "Unsupported"
    if host_tier == "C":
        warnings.append("Host Capability is insufficient for War Room projection")
    if not room_closed:
        warnings.append("room has not been closed; summary is an open-run snapshot")

    resolved_interventions: set[str] = set()
    for confirmation_id, confirmation in interventions.items():
        if confirmation_id in invalid_event_ids or confirmation.get("status") not in {"confirmed", "rejected"}:
            continue
        related = confirmation.get("related_event_id")
        if not related:
            continue
        if related in interventions:
            resolved_interventions.add(related)
        for request_id, request in interventions.items():
            if request.get("status") == "requested" and request.get("related_event_id") == related:
                resolved_interventions.add(request_id)

    summary = {
        "room": events[0].get("task_ref") if events else None,
        "host_tier": host_tier,
        "mode": mode,
        "participants": sorted(participants),
        "task_bindings": [{"agent_ref": a, "task_ref": t} for a, t in sorted(bindings)],
        "active_task_states": task_states,
        "unresolved_attention": sorted(unresolved_attention),
        "recent_events": [
            e.get("event_id")
            for e in events[-10:]
            if not is_ambient_record(e) and e.get("event_id") is not None
        ],
        "active_interventions": sorted(
            event_id for event_id, event in interventions.items()
            if event.get("status") in {"requested", "failed"} and event_id not in resolved_interventions
        ),
        "room_closed": room_closed,
        "projection_count": len(projections),
        "ambient_projection_count": len(ambient_projections),
        "rejected_projection_count": len(rejected_projections),
    }
    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "summary": summary,
        "projections": projections,
        "ambient_projections": ambient_projections,
        "rejected_projections": rejected_projections,
    }


def validate_path(path: Path) -> dict[str, Any]:
    events, parse_errors = read_jsonl(path)
    result = validate(events, parse_errors)
    result["fixture"] = str(path)
    return result


def print_result(result: dict[str, Any], expected: str | None = None, emit: bool = False) -> bool:
    actual = "pass" if result["ok"] else "fail"
    matches = expected is None or actual == expected
    label = "PASS" if matches and actual == "pass" else "EXPECTED FAIL" if matches else "FAIL"
    print(f"{label}: {result.get('fixture', '<stdin>')} [{actual}]")
    for error in result["errors"]:
        print(f"  error: {error}")
    for warning in result["warnings"]:
        print(f"  warning: {warning}")
    if emit:
        print(
            json.dumps(
                {
                    "summary": result["summary"],
                    "projections": result["projections"],
                    "ambient_projections": result.get("ambient_projections", []),
                    "rejected_projections": result["rejected_projections"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    return matches


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", action="append", type=Path, help="JSONL fixture to validate; repeatable")
    parser.add_argument("--all", action="store_true", help="validate all bundled fixtures with their expected outcomes")
    parser.add_argument("--stdin", action="store_true", help="read one JSONL fixture from stdin")
    parser.add_argument("--expect", choices=("pass", "fail"), help="expected outcome for --fixture or --stdin")
    parser.add_argument("--emit", action="store_true", help="emit the Projection Output and War Room Summary")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    checks: list[tuple[Path | None, str | None]] = []
    if args.all:
        checks.extend([
            (root / "examples/tier-a-events.jsonl", "pass"),
            (root / "examples/tier-b-events.jsonl", "pass"),
            (root / "examples/fake-collaboration-events.jsonl", "fail"),
            (root / "examples/human-required-events.jsonl", "pass"),
            (root / "examples/ambient-behavior-events.jsonl", "pass"),
            (root / "examples/ambient-leakage-events.jsonl", "fail"),
            (root / "examples/qualified-handoff-events.jsonl", "pass"),
            (root / "examples/qualified-handoff-no-target-events.jsonl", "pass"),
            (root / "examples/invalid-evidence-events.jsonl", "fail"),
            (root / "examples/derived-events.jsonl", "pass"),
            (root / "examples/invalid-derived-events.jsonl", "fail"),
            (root / "examples/attention-adversarial-events.jsonl", "pass"),
            (root / "examples/task-binding-adversarial-events.jsonl", "fail"),
        ])
    if args.fixture:
        checks.extend((path, args.expect) for path in args.fixture)
    if args.stdin:
        events, parse_errors = read_jsonl(Path("/dev/stdin"))
        result = validate(events, parse_errors)
        result["fixture"] = "<stdin>"
        return 0 if print_result(result, args.expect, args.emit) else 1
    if not checks:
        parser.error("choose --all, --fixture, or --stdin")
    ok = True
    for path, expected in checks:
        result = validate_path(path)  # type: ignore[arg-type]
        ok = print_result(result, expected, args.emit) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
