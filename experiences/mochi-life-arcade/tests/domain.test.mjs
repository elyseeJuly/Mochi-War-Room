import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTENTION_STATES,
  ExperienceCoordinator,
  PublicSignalAdapter,
  STORAGE_KEY,
  createArcadeContext,
  createDefaultLifeState,
  loadLifeState,
  normalizeLifeState,
  saveLifeState,
  sanitizePublicSignal,
} from "../src/domain.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("public signal boundary drops work internals", () => {
  const safe = sanitizePublicSignal({
    type: "level_2_human_required",
    work_mochi_id: "qa",
    role: "QA",
    request: "Choose a test path",
    repo: "secret-repo",
    source_code: "secret",
    evidence: { raw: true },
    agent_message: "secret message",
  });
  assert.deepEqual(safe, {
    type: "level_2_human_required",
    work_mochi_id: "qa",
    role: "QA",
    request: "Choose a test path",
  });
  assert.equal(sanitizePublicSignal({ type: "raw_event", payload: "secret" }), null);
});

test("coordinator gives Human Required priority over game completion", async () => {
  const coordinator = new ExperienceCoordinator({ warRoomActive: true });
  const events = [];
  coordinator.subscribe((event) => events.push(event.kind));
  const adapter = new PublicSignalAdapter((signal) => coordinator.consume(signal));

  assert.equal(coordinator.beginGame("catch"), true);
  assert.equal(coordinator.queueGameCompletion({ score: 4 }), true);
  adapter.emit({ type: "level_2_human_required", work_mochi_id: "qa", role: "QA", request: "Pick a path" });
  await Promise.resolve();

  assert.equal(coordinator.state.attention_state, ATTENTION_STATES.HUMAN_REQUIRED);
  assert.equal(coordinator.state.pending_game_completion.score, 4);
  assert.equal(events.includes("game_completion_released"), false);

  adapter.emit({ type: "human_response", action: "choose-a" });
  assert.equal(coordinator.state.attention_state, ATTENTION_STATES.AWAITING_HOST_CONFIRMATION);
  assert.equal(coordinator.clearAttention(), false, "confirmation is required before clearing");
  adapter.emit({ type: "host_confirmation", outcome: "confirmed" });
  assert.equal(coordinator.state.attention_state, ATTENTION_STATES.RESOLVED);
  adapter.emit({ type: "attention_cleared" });

  assert.equal(coordinator.state.attention_state, ATTENTION_STATES.NORMAL);
  assert.equal(coordinator.state.focus, "arcade");
  assert.equal(coordinator.state.pending_game_completion, null);
  assert.equal(events.includes("game_completion_released"), true);
});

test("completion waits while attention is active", () => {
  const coordinator = new ExperienceCoordinator();
  coordinator.consume({ type: "level_2_human_required", work_mochi_id: "qa", role: "QA", request: "Need a human" });
  assert.equal(coordinator.receiveCompletion({ type: "completion", label: "done" }), false);
  assert.equal(coordinator.state.pending_completion.label, "done");
  coordinator.respondHuman("respond");
  coordinator.hostDecision("rejected");
  coordinator.clearAttention();
  assert.equal(coordinator.state.pending_completion, null);
});

test("life persistence is durable but has no time-based decay", () => {
  const storage = memoryStorage();
  const initial = createDefaultLifeState("2026-08-01T00:00:00.000Z");
  initial.residents[0].nickname = "Mallow";
  initial.appearance_variants.push({ base_form: "cloud", appearance_variant: "night", discovered_at: "2026-08-01T00:00:00.000Z" });
  saveLifeState(storage, initial);
  const afterTwoWeeks = loadLifeState(storage, "2026-08-15T00:00:00.000Z");
  assert.equal(afterTwoWeeks.residents.length, 2);
  assert.equal(afterTwoWeeks.residents[0].nickname, "Mallow");
  assert.equal(afterTwoWeeks.appearance_variants[0].appearance_variant, "night");
  assert.equal(afterTwoWeeks.residents[0].health, undefined);
  assert.equal(afterTwoWeeks.residents[0].hunger, undefined);
});

test("corrupt local state falls back to a safe park", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{not-json" });
  const state = loadLifeState(storage);
  assert.equal(state.residents.length, 2);
  assert.equal(state.completion_memory_objects.length, 0);
});

test("normalization never creates work identity or progression fields", () => {
  const state = normalizeLifeState({
    residents: [{ resident_id: "resident-cloud", base_form: "cloud", level: 9, xp: 100, hunger: 0, health: 0 }],
  });
  assert.equal(state.residents[0].level, undefined);
  assert.equal(state.residents[0].xp, undefined);
  assert.equal(state.residents[0].hunger, undefined);
  assert.equal(state.residents[0].health, undefined);
  assert.equal(state.residents.some((resident) => resident.role), false);
});

test("arcade context is visual-only", () => {
  const context = createArcadeContext({
    residents: [{ resident_id: "resident-cloud", base_form: "cloud", appearance_variant: "default", known_poses: ["idle"] }],
    theme: "spring",
    sound: false,
    attentionState: ATTENTION_STATES.NORMAL,
  });
  assert.deepEqual(Object.keys(context).sort(), ["attention", "resident_visuals", "sound", "theme"]);
  assert.deepEqual(Object.keys(context.resident_visuals[0]).sort(), ["appearance_variant", "base_form", "known_poses", "resident_id"]);
});

