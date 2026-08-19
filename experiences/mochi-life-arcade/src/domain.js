/**
 * Mochi Life & Arcade V0.1
 *
 * This module is deliberately small. It is the Experience Layer's state
 * boundary, not a replacement for War Room Protocol or its runtime.
 */

export const STORAGE_KEY = "mochi-war-room:life-arcade:v0.1";

export const ATTENTION_STATES = Object.freeze({
  NORMAL: "normal",
  PENDING: "pending",
  HUMAN_REQUIRED: "human_required",
  AWAITING_HOST_CONFIRMATION: "awaiting_host_confirmation",
  RESOLVED: "resolved",
});

export const FOCUS = Object.freeze({
  WORK: "work",
  LIFE: "life",
  ARCADE: "arcade",
});

const PUBLIC_SIGNAL_TYPES = new Set([
  "war_room_active",
  "work_mochi_public_state",
  "level_1_notice",
  "level_2_human_required",
  "attention_cleared",
  "milestone",
  "completion",
  "human_response",
  "host_confirmation",
]);

const WORK_STATES = new Set(["enter", "working", "waiting", "completion", "completed"]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isoNow(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function cleanText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
}

function cleanId(value, fallback) {
  return cleanText(value, fallback).replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 80);
}

function cleanVariant(value, fallback = "default") {
  return cleanText(value, fallback).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
}

function cleanBaseForm(value, fallback = "cloud") {
  return ["cloud", "berry"].includes(value) ? value : fallback;
}

function cleanPoseList(value) {
  if (!Array.isArray(value)) return ["idle", "happy", "rest"];
  const poses = value.filter((pose) => typeof pose === "string").map((pose) => cleanVariant(pose)).slice(0, 12);
  return poses.length ? [...new Set(poses)] : ["idle", "happy", "rest"];
}

function normalizeResident(input, fallback, now) {
  const source = input && typeof input === "object" ? input : {};
  return {
    resident_id: cleanId(source.resident_id, fallback.resident_id),
    base_form: cleanBaseForm(source.base_form, fallback.base_form),
    appearance_variant: cleanVariant(source.appearance_variant, fallback.appearance_variant),
    ...(cleanText(source.nickname) ? { nickname: cleanText(source.nickname, "").slice(0, 24) } : {}),
    discovered_at: cleanText(source.discovered_at, now),
    signature_behavior: cleanVariant(source.signature_behavior, fallback.signature_behavior),
    equipped_accessory: null,
    known_poses: cleanPoseList(source.known_poses),
    visit_memories: Array.isArray(source.visit_memories)
      ? source.visit_memories.filter((entry) => entry && typeof entry === "object").slice(-12).map((entry) => ({
          kind: cleanVariant(entry.kind, "visit"),
          created_at: cleanText(entry.created_at, now),
        }))
      : [],
  };
}

export function createDefaultLifeState(now = new Date()) {
  const createdAt = isoNow(now);
  return {
    schema_version: 1,
    residents: [
      normalizeResident({
        resident_id: "resident-cloud",
        base_form: "cloud",
        appearance_variant: "default",
        nickname: "Mallow",
        signature_behavior: "wander",
        known_poses: ["idle", "happy", "rest"],
      }, {
        resident_id: "resident-cloud",
        base_form: "cloud",
        appearance_variant: "default",
        signature_behavior: "wander",
      }, createdAt),
      normalizeResident({
        resident_id: "resident-berry",
        base_form: "berry",
        appearance_variant: "default",
        nickname: "Pip",
        signature_behavior: "inspect_object",
        known_poses: ["idle", "happy", "rest"],
      }, {
        resident_id: "resident-berry",
        base_form: "berry",
        appearance_variant: "default",
        signature_behavior: "inspect_object",
      }, createdAt),
    ],
    appearance_variants: [],
    toy_placement: "meadow",
    visitor_history: [],
    life_memories: [],
    completion_memory_objects: [],
    game_preferences: { sound: true },
  };
}

export function normalizeLifeState(input, now = new Date()) {
  const fallback = createDefaultLifeState(now);
  if (!input || typeof input !== "object") return fallback;

  const byId = new Map(Array.isArray(input.residents) ? input.residents.map((resident) => [resident?.resident_id, resident]) : []);
  const residents = fallback.residents.map((resident) => normalizeResident(byId.get(resident.resident_id), resident, fallback.residents[0].discovered_at));

  const variants = Array.isArray(input.appearance_variants)
    ? input.appearance_variants.filter((variant) => variant && typeof variant === "object").slice(-24).map((variant) => ({
        base_form: cleanBaseForm(variant.base_form),
        appearance_variant: cleanVariant(variant.appearance_variant),
        discovered_at: cleanText(variant.discovered_at, fallback.residents[0].discovered_at),
      }))
    : [];

  const memoryObjects = Array.isArray(input.completion_memory_objects)
    ? input.completion_memory_objects.filter((memory) => memory && typeof memory === "object").slice(-24).map((memory) => ({
        id: cleanId(memory.id, `memory-${Date.now()}`),
        kind: "completion-flag",
        created_at: cleanText(memory.created_at, fallback.residents[0].discovered_at),
      }))
    : [];

  return {
    ...fallback,
    residents,
    appearance_variants: variants,
    toy_placement: input.toy_placement === "meadow" ? "meadow" : "meadow",
    visitor_history: Array.isArray(input.visitor_history)
      ? input.visitor_history.filter((entry) => entry && typeof entry === "object").slice(-24).map((entry) => ({
          base_form: cleanBaseForm(entry.base_form),
          appearance_variant: cleanVariant(entry.appearance_variant),
          kind: entry.kind === "duplicate" ? "duplicate" : "visitor",
          created_at: cleanText(entry.created_at, fallback.residents[0].discovered_at),
        }))
      : [],
    life_memories: Array.isArray(input.life_memories)
      ? input.life_memories.filter((entry) => entry && typeof entry === "object").slice(-24).map((entry) => ({
          kind: cleanVariant(entry.kind, "life"),
          created_at: cleanText(entry.created_at, fallback.residents[0].discovered_at),
        }))
      : [],
    completion_memory_objects: memoryObjects,
    game_preferences: { sound: input.game_preferences?.sound !== false },
  };
}

export function loadLifeState(storage, now = new Date()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return createDefaultLifeState(now);
    return normalizeLifeState(JSON.parse(raw), now);
  } catch (_error) {
    return createDefaultLifeState(now);
  }
}

export function saveLifeState(storage, state) {
  const safe = normalizeLifeState(state);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch (_error) {
    // A full or restricted browser store should not break the park experience.
  }
  return safe;
}

function safeWorkMochi(input) {
  const source = input && typeof input === "object" ? input : {};
  const publicState = cleanText(source.public_state, "working");
  return {
    id: cleanId(source.id, "work-mochi"),
    role: cleanText(source.role, "Agent Participant").slice(0, 40),
    public_state: WORK_STATES.has(publicState) ? publicState : "working",
  };
}

/**
 * Public Signal Boundary. Only the allow-listed projection is passed inward.
 * Deliberately drops repo, source, evidence, diff, messages, and raw events.
 */
export function sanitizePublicSignal(signal) {
  if (!signal || typeof signal !== "object" || !PUBLIC_SIGNAL_TYPES.has(signal.type)) return null;
  switch (signal.type) {
    case "war_room_active":
      return { type: signal.type, active: signal.active === true };
    case "work_mochi_public_state":
      return {
        type: signal.type,
        work_mochi_public_state: Array.isArray(signal.work_mochi_public_state)
          ? signal.work_mochi_public_state.slice(0, 8).map(safeWorkMochi)
          : [],
      };
    case "level_1_notice":
      return { type: signal.type, message: cleanText(signal.message, "A public work notice is available.") };
    case "level_2_human_required":
      return {
        type: signal.type,
        work_mochi_id: cleanId(signal.work_mochi_id, "work-mochi"),
        role: cleanText(signal.role, "Agent Participant").slice(0, 40),
        request: cleanText(signal.request, "Human input is required.").slice(0, 160),
      };
    case "attention_cleared":
      return { type: signal.type };
    case "milestone":
      return { type: signal.type, label: cleanText(signal.label, "A work milestone was reached.").slice(0, 100) };
    case "completion":
      return { type: signal.type, label: cleanText(signal.label, "A work session completed.").slice(0, 100) };
    case "human_response":
      return { type: signal.type, action: cleanText(signal.action, "mock-human-response").slice(0, 80) };
    case "host_confirmation":
      return { type: signal.type, outcome: signal.outcome === "rejected" ? "rejected" : "confirmed" };
    default:
      return null;
  }
}

export class PublicSignalAdapter {
  constructor(consumer) {
    this.consumer = typeof consumer === "function" ? consumer : () => {};
  }

  emit(signal) {
    const safe = sanitizePublicSignal(signal);
    if (!safe) return false;
    this.consumer(clone(safe));
    return true;
  }
}

function safeAttentionPayload(signal) {
  return {
    work_mochi_id: cleanId(signal.work_mochi_id, "work-mochi"),
    role: cleanText(signal.role, "Agent Participant").slice(0, 40),
    request: cleanText(signal.request, "Human input is required.").slice(0, 160),
  };
}

export class ExperienceCoordinator {
  constructor({ warRoomActive = false } = {}) {
    this.listeners = new Set();
    this.state = {
      focus: FOCUS.LIFE,
      attention_state: ATTENTION_STATES.NORMAL,
      previous_focus: null,
      active_game: null,
      game_checkpoint: null,
      pending_game_completion: null,
      pending_completion: null,
      active_attention: null,
      human_action: null,
      host_outcome: null,
      war_room_active: Boolean(warRoomActive),
      work_mochi_public_state: [],
      level_1_notice: null,
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return clone(this.state);
  }

  notify(kind, payload = null) {
    const event = { kind, payload: clone(payload), state: this.snapshot() };
    for (const listener of this.listeners) listener(event);
  }

  consume(signal) {
    const safe = sanitizePublicSignal(signal);
    if (!safe) return false;
    switch (safe.type) {
      case "war_room_active":
        this.state.war_room_active = safe.active;
        if (!safe.active) this.state.work_mochi_public_state = [];
        this.notify("war_room_active", { active: safe.active });
        return true;
      case "work_mochi_public_state":
        this.state.work_mochi_public_state = clone(safe.work_mochi_public_state);
        this.notify("work_mochi_public_state", safe.work_mochi_public_state);
        return true;
      case "level_1_notice":
        this.state.level_1_notice = safe.message;
        this.notify("level_1_notice", { message: safe.message });
        return true;
      case "level_2_human_required":
        this.requestHuman(safe);
        return true;
      case "attention_cleared":
        this.clearAttention();
        return true;
      case "human_response":
        this.respondHuman(safe.action);
        return true;
      case "host_confirmation":
        this.hostDecision(safe.outcome);
        return true;
      case "completion":
        this.receiveCompletion(safe);
        return true;
      case "milestone":
        this.notify("milestone", safe);
        return true;
      default:
        return false;
    }
  }

  setFocus(focus) {
    if (!Object.values(FOCUS).includes(focus)) return false;
    if (this.state.attention_state !== ATTENTION_STATES.NORMAL && focus !== FOCUS.WORK) return false;
    this.state.focus = focus;
    this.notify("focus_changed", { focus });
    return true;
  }

  beginGame(gameId) {
    if (this.state.attention_state !== ATTENTION_STATES.NORMAL) return false;
    this.state.active_game = cleanId(gameId, "arcade-game");
    this.state.game_checkpoint = null;
    this.state.focus = FOCUS.ARCADE;
    this.notify("game_started", { game_id: this.state.active_game });
    return true;
  }

  checkpointGame(checkpoint) {
    if (!this.state.active_game || !checkpoint || typeof checkpoint !== "object") return false;
    this.state.game_checkpoint = clone(checkpoint);
    this.notify("game_checkpoint", { game_id: this.state.active_game, checkpoint });
    return true;
  }

  disposeGame() {
    const gameId = this.state.active_game;
    this.state.active_game = null;
    this.state.game_checkpoint = null;
    this.state.pending_game_completion = null;
    this.notify("game_disposed", { game_id: gameId });
  }

  queueGameCompletion(completion) {
    if (!this.state.active_game) return false;
    this.state.pending_game_completion = clone({
      game_id: this.state.active_game,
      ...(completion && typeof completion === "object" ? completion : {}),
    });
    this.notify("game_completion_queued", this.state.pending_game_completion);
    // The microtask lets a same-turn Human Required signal win over the game's
    // completion animation. The result remains held, never discarded.
    queueMicrotask(() => {
      if (!this.state.pending_game_completion) return;
      if (this.state.attention_state === ATTENTION_STATES.NORMAL) this.releaseGameCompletion();
      else this.notify("game_completion_held", this.state.pending_game_completion);
    });
    return true;
  }

  releaseGameCompletion() {
    if (!this.state.pending_game_completion) return false;
    const completion = this.state.pending_game_completion;
    this.state.pending_game_completion = null;
    this.notify("game_completion_released", completion);
    return true;
  }

  requestHuman(signal) {
    if (this.state.attention_state !== ATTENTION_STATES.NORMAL) return false;
    this.state.previous_focus = this.state.focus;
    this.state.focus = FOCUS.WORK;
    this.state.attention_state = ATTENTION_STATES.HUMAN_REQUIRED;
    this.state.active_attention = safeAttentionPayload(signal);
    this.state.human_action = null;
    this.state.host_outcome = null;
    this.notify("attention_requested", this.state.active_attention);
    return true;
  }

  respondHuman(action = "mock-human-response") {
    if (this.state.attention_state !== ATTENTION_STATES.HUMAN_REQUIRED) return false;
    this.state.human_action = cleanText(action, "mock-human-response").slice(0, 80);
    this.state.attention_state = ATTENTION_STATES.AWAITING_HOST_CONFIRMATION;
    this.notify("awaiting_host_confirmation", { action: this.state.human_action });
    return true;
  }

  hostDecision(outcome = "confirmed") {
    if (this.state.attention_state !== ATTENTION_STATES.AWAITING_HOST_CONFIRMATION) return false;
    this.state.host_outcome = outcome === "rejected" ? "rejected" : "confirmed";
    this.state.attention_state = ATTENTION_STATES.RESOLVED;
    this.notify("host_decision", { outcome: this.state.host_outcome });
    return true;
  }

  clearAttention() {
    if (![ATTENTION_STATES.RESOLVED, ATTENTION_STATES.AWAITING_HOST_CONFIRMATION, ATTENTION_STATES.HUMAN_REQUIRED].includes(this.state.attention_state)) {
      return false;
    }
    if (this.state.attention_state !== ATTENTION_STATES.RESOLVED) return false;
    const restoredFocus = this.state.previous_focus || FOCUS.LIFE;
    this.state.attention_state = ATTENTION_STATES.NORMAL;
    this.state.focus = restoredFocus;
    this.state.previous_focus = null;
    this.state.active_attention = null;
    this.notify("attention_cleared", { host_outcome: this.state.host_outcome });
    if (this.state.pending_game_completion) this.releaseGameCompletion();
    if (this.state.pending_completion) this.releaseCompletion();
    return true;
  }

  receiveCompletion(completion) {
    if (this.state.attention_state !== ATTENTION_STATES.NORMAL) {
      this.state.pending_completion = clone(completion);
      this.notify("completion_held", completion);
      return false;
    }
    this.notify("completion_ready", completion);
    return true;
  }

  releaseCompletion() {
    if (!this.state.pending_completion) return false;
    const completion = this.state.pending_completion;
    this.state.pending_completion = null;
    this.notify("completion_ready", completion);
    return true;
  }
}

export function createArcadeContext({ residents = [], theme = "pet-park", sound = true, attentionState = ATTENTION_STATES.NORMAL } = {}) {
  return {
    resident_visuals: residents.map((resident) => ({
      resident_id: resident.resident_id,
      base_form: resident.base_form,
      appearance_variant: resident.appearance_variant,
      known_poses: Array.isArray(resident.known_poses) ? resident.known_poses.slice(0, 12) : [],
    })),
    theme: cleanVariant(theme, "pet-park"),
    sound: sound !== false,
    attention: { state: attentionState },
  };
}

