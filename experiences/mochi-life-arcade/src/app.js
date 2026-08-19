import {
  ATTENTION_STATES,
  ExperienceCoordinator,
  FOCUS,
  PublicSignalAdapter,
  STORAGE_KEY,
  createArcadeContext,
  loadLifeState,
  saveLifeState,
} from "./domain.js";

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nowIso = () => new Date().toISOString();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayName(resident) {
  return resident.nickname || (resident.base_form === "cloud" ? "Mallow" : "Pip");
}

function signalWorkMochi() {
  return [
    { id: "main", role: "Main / Lead", public_state: "working" },
    { id: "qa", role: "QA", public_state: "waiting" },
  ];
}

const life = loadLifeState(window.localStorage);
const coordinator = new ExperienceCoordinator({ warRoomActive: true });
const adapter = new PublicSignalAdapter((signal) => coordinator.consume(signal));

const appState = {
  life,
  selectedResidentId: null,
  visitor: null,
  encounterOpportunityUsed: false,
  encounterTimer: null,
  ambientTimer: null,
  ambientLastAction: null,
  interactionBusyUntil: 0,
  rewardOff: false,
  game: null,
  attentionClearTimer: null,
  completionTimer: null,
  lastCompletionLabel: null,
  level1Until: 0,
};

function persistLife() {
  appState.life = saveLifeState(window.localStorage, appState.life);
}

function setNote(message) {
  $("stage-note").textContent = message;
}

function showToast(message) {
  const region = $("toast-region");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function renderStatus() {
  const statusDot = $("room-status-dot");
  const statusText = $("room-status-text");
  const state = coordinator.state;
  statusDot.classList.toggle("active", state.war_room_active && state.attention_state === ATTENTION_STATES.NORMAL);
  statusDot.classList.toggle("quiet", !state.war_room_active && state.attention_state === ATTENTION_STATES.NORMAL);
  if (state.attention_state !== ATTENTION_STATES.NORMAL) {
    statusText.textContent = `Human Required · ${state.active_attention?.role || "Work Mochi"}`;
  } else if (state.war_room_active) {
    statusText.textContent = "War Room active · mock public signals";
  } else {
    statusText.textContent = "Quiet Park · waiting for next War Room";
  }
}

const workStateLabels = {
  enter: "enter",
  working: "working",
  waiting: "waiting",
  completion: "completion",
  completed: "completed",
};

function renderWork() {
  const list = $("work-mochi-list");
  const note = $("work-note");
  const state = coordinator.state;
  if (!state.war_room_active) {
    list.innerHTML = `<div class="work-quiet">这里今天很安静。<br />等待下一场 War Room，不会产生 fake progress。</div>`;
    note.textContent = "Quiet Park Mode · Work Mochi 只在真实工作会话中出现。";
    return;
  }
  if (!state.work_mochi_public_state.length) {
    list.innerHTML = `<div class="work-quiet">Work Mochi 正在从公开信号边界进入。</div>`;
    note.textContent = "等待 mock Work Signal…";
    return;
  }
  list.innerHTML = state.work_mochi_public_state.map((mochi) => {
    const workState = workStateLabels[mochi.public_state] || "working";
    return `<article class="work-mochi-card">
      <div class="work-avatar" aria-hidden="true">◈</div>
      <div class="work-meta"><strong>${escapeHtml(mochi.role)}</strong><small>真实 Agent Participant · public state</small></div>
      <span class="work-state ${workState}" data-work-state="${workState}">${workState}</span>
    </article>`;
  }).join("");
  note.textContent = state.level_1_notice || "工作事实只从 Public Signals 进入这里。";
}

function residentMarkup(resident) {
  const formClass = resident.base_form === "berry" ? "form-berry" : "form-cloud";
  const variantClass = resident.appearance_variant === "night" ? "variant-night" : "";
  const selectedClass = appState.selectedResidentId === resident.resident_id ? "selected" : "";
  return `<div class="mochi-entity ${formClass} ${variantClass} ${selectedClass}" data-id="${escapeHtml(resident.resident_id)}">
    <button class="mochi-hit" type="button" data-resident="${escapeHtml(resident.resident_id)}" aria-label="选择 ${escapeHtml(displayName(resident))}">
      <span class="mochi-shape" aria-hidden="true"></span>
      <span class="face-eye left" aria-hidden="true"></span><span class="face-eye right" aria-hidden="true"></span>
      <span class="face-mouth" aria-hidden="true"></span><span class="mochi-blush left" aria-hidden="true"></span><span class="mochi-blush right" aria-hidden="true"></span>
      ${resident.appearance_variant === "night" ? `<span class="mochi-mark" aria-hidden="true">✦</span>` : ""}
    </button>
    <span class="mochi-name">${escapeHtml(displayName(resident))}</span>
    <span class="mochi-tag">Resident · ${escapeHtml(resident.signature_behavior.replaceAll("_", " "))}</span>
  </div>`;
}

function renderResidents() {
  const layer = $("resident-layer");
  layer.innerHTML = appState.life.residents.map(residentMarkup).join("");
  layer.querySelectorAll("[data-resident]").forEach((button) => {
    button.addEventListener("click", () => selectResident(button.dataset.resident));
  });
  const selected = appState.life.residents.find((resident) => resident.resident_id === appState.selectedResidentId);
  $("selected-resident").textContent = selected
    ? `${displayName(selected)} 在这里 · Resident Mochi`
    : "请选择一只 Resident Mochi";
  document.querySelectorAll(".life-action").forEach((button) => {
    button.disabled = !selected || coordinator.state.attention_state !== ATTENTION_STATES.NORMAL;
  });
}

function renderMemoryShelf() {
  const items = [];
  appState.life.appearance_variants.slice(-3).forEach((variant) => items.push({ className: "variant", icon: "✦", label: `${variant.base_form} ${variant.appearance_variant} variant` }));
  appState.life.completion_memory_objects.slice(-3).forEach((memory) => items.push({ className: "", icon: "⚑", label: `completion memory ${memory.created_at}` }));
  appState.life.life_memories.slice(-2).forEach((memory) => items.push({ className: "life", icon: "◌", label: memory.kind }));
  const container = $("memory-items");
  container.innerHTML = items.length
    ? items.slice(-6).map((item) => `<span class="memory-token ${item.className}" title="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)}">${item.icon}</span>`).join("")
    : `<span class="empty-memory">这里暂时没有需要完成的成就，只有一些小小痕迹。</span>`;
}

function renderVisitor() {
  const slot = $("visitor-slot");
  const visitor = appState.visitor;
  if (!visitor) {
    slot.innerHTML = "";
    return;
  }
  if (visitor.revealed) {
    slot.innerHTML = `<div class="visitor-card found"><small>${appState.rewardOff ? "visitor seen" : visitor.isDuplicate ? "又来看看" : "新 appearance variant"}</small><span>${appState.rewardOff ? "没有写入长期收藏" : "Cloud · Night"}</span></div>`;
    return;
  }
  slot.innerHTML = `<div class="visitor-card"><small>边缘有一位访客</small><button type="button" id="discover-visitor">看看它</button></div>`;
  $("discover-visitor").addEventListener("click", discoverVisitor);
}

function renderAll() {
  renderStatus();
  renderWork();
  renderResidents();
  renderVisitor();
  renderMemoryShelf();
  renderAttention();
  $("reward-off-label").textContent = appState.rewardOff ? "ON" : "OFF";
}

function selectResident(residentId) {
  if (coordinator.state.attention_state !== ATTENTION_STATES.NORMAL) return;
  if (!appState.life.residents.some((resident) => resident.resident_id === residentId)) return;
  appState.selectedResidentId = residentId;
  renderResidents();
  setNote("选好了。可以摸摸、给它一个零食，或者把玩具推过去。");
}

function animateResident(residentId, animationClass, duration = 2200) {
  const node = [...document.querySelectorAll(".mochi-entity")].find((candidate) => candidate.dataset.id === residentId);
  if (!node) return;
  node.classList.remove(animationClass);
  void node.offsetWidth;
  node.classList.add(animationClass);
  window.setTimeout(() => node.classList.remove(animationClass), duration);
}

function performLifeAction(action) {
  if (coordinator.state.attention_state !== ATTENTION_STATES.NORMAL) return;
  const resident = appState.life.residents.find((item) => item.resident_id === appState.selectedResidentId);
  if (!resident) return;
  appState.interactionBusyUntil = performance.now() + 2600;
  const messages = {
    pet: `${displayName(resident)} 翻了个身，明显很开心。`,
    snack: `${displayName(resident)} 接住零食，小口小口吃掉了。`,
    toy: `${displayName(resident)} 把小球推了过来。`,
  };
  animateResident(resident.resident_id, `anim-${action}`);
  setNote(messages[action]);
  appState.ambientLastAction = action;
  if (action === "toy") {
    appState.life.toy_placement = "meadow";
    persistLife();
    const other = appState.life.residents.find((item) => item.resident_id !== resident.resident_id);
    if (other) window.setTimeout(() => {
      if (coordinator.state.attention_state === ATTENTION_STATES.NORMAL) {
        animateResident(other.resident_id, "anim-social", 3100);
        setNote(`${displayName(resident)} 和 ${displayName(other)} 坐在一起玩了一会儿。`);
      }
    }, 650);
  }
  renderResidents();
}

function runAmbient() {
  if (document.hidden || coordinator.state.attention_state !== ATTENTION_STATES.NORMAL) return;
  if (performance.now() < appState.interactionBusyUntil) return;
  const residents = appState.life.residents;
  if (!residents.length) return;
  const options = ["wander", "rest", "play", "inspect"];
  let action = options[Math.floor(Math.random() * options.length)];
  if (action === appState.ambientLastAction) action = options[(options.indexOf(action) + 1) % options.length];
  appState.ambientLastAction = action;
  const actor = residents[Math.floor(Math.random() * residents.length)];
  if (action === "play" && residents.length > 1 && Math.random() > 0.45) {
    const target = residents.find((resident) => resident.resident_id !== actor.resident_id);
    animateResident(actor.resident_id, "anim-social", 3100);
    animateResident(target.resident_id, "anim-social", 3100);
    $("ambient-state").textContent = "social moment";
    setNote("两只 Resident Mochi 碰了碰，一起看着草地上的小球。");
    return;
  }
  animateResident(actor.resident_id, `ambient-${action}`, 2600);
  $("ambient-state").textContent = action === "rest" ? "taking a tiny rest" : `quietly ${action}`;
  window.setTimeout(() => {
    if (coordinator.state.attention_state === ATTENTION_STATES.NORMAL) $("ambient-state").textContent = "quietly living";
  }, 2800);
}

function scheduleEncounter() {
  if (appState.encounterOpportunityUsed) return;
  appState.encounterOpportunityUsed = true;
  // One session opportunity; deliberately not derived from work duration,
  // tokens, tool calls, cost, or any task metric.
  const delay = 20000 + Math.random() * 40000;
  appState.encounterTimer = window.setTimeout(showVisitor, delay);
}

function showVisitor() {
  if (appState.visitor) return;
  appState.visitor = { base_form: "cloud", appearance_variant: "night", revealed: false, isDuplicate: false };
  renderVisitor();
  setNote("草地边缘有一只带着夜色花纹的 Mochi 访客。点它看看。");
  showToast("一个小小的 visitor encounter 出现了。");
}

function discoverVisitor() {
  if (!appState.visitor || appState.visitor.revealed) return;
  const isDuplicate = appState.life.appearance_variants.some((variant) => variant.base_form === "cloud" && variant.appearance_variant === "night");
  appState.visitor.revealed = true;
  appState.visitor.isDuplicate = isDuplicate;
  if (appState.rewardOff) {
    setNote("看到了夜色访客。Reward-off 开启，所以没有写入长期收藏。");
    showToast("Visitor seen · persistent collection disabled");
  } else if (isDuplicate) {
    appState.life.visitor_history.push({ base_form: "cloud", appearance_variant: "night", kind: "duplicate", created_at: nowIso() });
    persistLife();
    setNote("它又来看看了。没有碎片、货币或强化，只留下一个温柔的来访记录。");
    showToast("Duplicate encounter · a little visit memory");
  } else {
    appState.life.appearance_variants.push({ base_form: "cloud", appearance_variant: "night", discovered_at: nowIso() });
    appState.life.visitor_history.push({ base_form: "cloud", appearance_variant: "night", kind: "visitor", created_at: nowIso() });
    persistLife();
    setNote("发现了 Cloud 的 Night appearance variant。它只是一个新样子，不是战力稀有度。");
    showToast("New appearance variant discovered");
  }
  renderVisitor();
  renderMemoryShelf();
}

function addCompletionMemory(label) {
  appState.lastCompletionLabel = label;
  if (appState.rewardOff) {
    showToast("Completion happened · reward-off 没有写入纪念物");
    return;
  }
  appState.life.completion_memory_objects.push({ id: `completion-${Date.now()}`, kind: "completion-flag", created_at: nowIso() });
  persistLife();
  renderMemoryShelf();
  showToast("Resident Mochi 留下了一面小旗：这里今天完成过一件工作。");
}

function celebrateCompletion(label = "A work session completed.") {
  addCompletionMemory(label);
  appState.life.residents.forEach((resident) => animateResident(resident.resident_id, "anim-celebrate", 3000));
  setNote("Work Mochi 收起工作标签，Resident Mochi 庆祝了一小会儿。");
  window.setTimeout(() => {
    if (coordinator.state.war_room_active) adapter.emit({ type: "war_room_active", active: false });
  }, 3000);
}

function scheduleAttentionClear() {
  if (appState.attentionClearTimer) window.clearTimeout(appState.attentionClearTimer);
  appState.attentionClearTimer = window.setTimeout(() => {
    adapter.emit({ type: "attention_cleared" });
  }, 520);
}

function renderAttention() {
  const overlay = $("attention-overlay");
  const state = coordinator.state;
  if (state.attention_state === ATTENTION_STATES.NORMAL) {
    overlay.classList.add("hidden");
    renderResidents();
    return;
  }
  overlay.classList.remove("hidden");
  const attention = state.active_attention || { role: "Work Mochi", request: "Human input is required." };
  $("attention-request").textContent = `${attention.role}：${attention.request}`;
  const stateLine = $("attention-state-line");
  const actions = $("attention-actions");
  if (state.attention_state === ATTENTION_STATES.HUMAN_REQUIRED) {
    stateLine.textContent = "游戏已安全暂停，checkpoint 已保存。";
    actions.innerHTML = `<button class="primary-button" id="respond-human" type="button">我来处理</button>`;
    $("respond-human").addEventListener("click", () => adapter.emit({ type: "human_response", action: "human-confirmed-input" }));
  } else if (state.attention_state === ATTENTION_STATES.AWAITING_HOST_CONFIRMATION) {
    stateLine.textContent = "Human action received · Waiting for host confirmation";
    actions.innerHTML = `<button class="secondary-button" type="button" disabled>等待 Host confirmation…</button>`;
  } else {
    stateLine.textContent = state.host_outcome === "rejected" ? "Host rejected the mock action · returning safely" : "Host confirmed · returning safely";
    actions.innerHTML = `<button class="secondary-button" type="button" disabled>正在恢复体验…</button>`;
  }
}

function updateGameFocusForAttention(event) {
  if (!appState.game) return;
  if (event.kind === "attention_requested") {
    appState.game.pause("attention");
    setNote("Human Required 抢占了注意力；Arcade 已 checkpoint 并暂停。");
  }
  if (event.kind === "attention_cleared") {
    if (event.state.pending_game_completion) return;
    appState.game.resume();
    setNote("请求处理完成。回到刚才的小游戏位置。");
  }
  if (event.kind === "game_completion_released") {
    appState.game.finish(event.payload);
  }
}

class MochiCatchGame {
  constructor({ host, coordinator: gameCoordinator }) {
    this.host = host;
    this.coordinator = gameCoordinator;
    this.kind = "catch";
    this.canPause = true;
    this.canCheckpoint = true;
    this.lifecycle = "init";
    this.round = 0;
    this.rounds = 18;
    this.score = 0;
    this.items = [];
    this.nextSpawnAt = 0;
    this.spawnEvery = 1350;
    this.itemId = 0;
    this.basketX = 0.5;
    this.raf = null;
    this.completionQueued = false;
    this.feedbackTimer = null;
  }

  init() {
    this.lifecycle = "init";
    this.host.innerHTML = `<p class="game-instructions">左右移动小篮子接住落下的 Mochi。漏掉没有惩罚，固定短局；Level 2 到达时会安全暂停。</p>
      <div class="game-toolbar"><span class="game-score" id="catch-score">本局 0 · 0/${this.rounds}</span><div class="game-controls"><button class="secondary-button" id="catch-pause" type="button">暂停</button><button class="secondary-button" id="catch-restart" type="button">重开</button></div></div>
      <div class="catch-stage" id="catch-stage" aria-label="Mochi Catch play area"><div class="catch-feedback" id="catch-feedback">准备好了吗？</div><div class="catch-basket" id="catch-basket"></div></div>
      <div class="catch-touch-controls" aria-label="Catch controls"><button type="button" data-nudge="-1">←</button><button type="button" data-nudge="1">→</button></div>`;
    this.stage = $("catch-stage");
    this.basket = $("catch-basket");
    this.feedback = $("catch-feedback");
    $("catch-pause").addEventListener("click", () => this.lifecycle === "active" ? this.pause("manual") : this.resume());
    $("catch-restart").addEventListener("click", () => this.restart());
    this.stage.addEventListener("pointerdown", (event) => this.moveBasket(event.clientX));
    this.stage.addEventListener("pointermove", (event) => { if (event.buttons || event.pointerType === "touch") this.moveBasket(event.clientX); });
    this.host.querySelectorAll("[data-nudge]").forEach((button) => button.addEventListener("click", () => this.nudge(Number(button.dataset.nudge))));
    this.syncVisuals();
  }

  start() {
    if (this.lifecycle === "active" || this.lifecycle === "finished" || this.lifecycle === "disposed") return;
    this.lifecycle = "active";
    this.nextSpawnAt = performance.now() + 450;
    this.feedback.textContent = "接住它们吧";
    this.loop(performance.now());
  }

  loop(time) {
    if (this.lifecycle !== "active") return;
    if (time >= this.nextSpawnAt && this.round < this.rounds) {
      this.spawn(time);
      this.nextSpawnAt = time + this.spawnEvery;
    }
    const stageHeight = this.stage.clientHeight || 330;
    for (const item of [...this.items]) {
      const progress = clamp((time - item.born) / item.duration, 0, 1);
      item.y = -18 + progress * (stageHeight - 40);
      item.el.style.transform = `translate(${item.x}px, ${item.y}px)`;
      if (progress >= 1) {
        const basketCenter = this.basketX * (this.stage.clientWidth || 500);
        const caught = Math.abs(item.x + 10 - basketCenter) < 54;
        if (caught) {
          this.score += 1;
          this.feedback.textContent = "接住了 ✦";
        }
        item.el.remove();
        this.items = this.items.filter((candidate) => candidate !== item);
        this.syncVisuals();
      }
    }
    if (this.round >= this.rounds && this.items.length === 0 && !this.completionQueued) this.queueCompletion();
    this.raf = requestAnimationFrame((next) => this.loop(next));
  }

  spawn(time) {
    this.round += 1;
    const width = this.stage.clientWidth || 500;
    const x = 18 + Math.random() * Math.max(30, width - 54);
    const el = document.createElement("span");
    el.className = "falling-item";
    el.textContent = "●";
    this.stage.append(el);
    this.items.push({ id: ++this.itemId, x, y: -18, born: time, duration: 2200 + Math.random() * 500, el });
    this.syncVisuals();
  }

  moveBasket(clientX) {
    if (!this.stage || this.lifecycle !== "active") return;
    const rect = this.stage.getBoundingClientRect();
    this.basketX = clamp((clientX - rect.left) / rect.width, 0.07, 0.93);
    this.basket.style.left = `${this.basketX * 100}%`;
  }

  nudge(direction) {
    if (this.lifecycle !== "active") return;
    this.basketX = clamp(this.basketX + direction * 0.12, 0.07, 0.93);
    this.basket.style.left = `${this.basketX * 100}%`;
  }

  syncVisuals() {
    if (!this.host || !this.stage) return;
    const score = $("catch-score");
    if (score) score.textContent = `本局 ${this.score} · ${this.round}/${this.rounds}`;
    if (this.basket) this.basket.style.left = `${this.basketX * 100}%`;
  }

  checkpoint() {
    return {
      game: "catch",
      round: this.round,
      rounds: this.rounds,
      score: this.score,
      basket_x: this.basketX,
      falling_items: this.items.map((item) => ({ id: item.id, x: item.x, y: item.y, progress: 0 })),
      completion_state: this.completionQueued ? "queued" : "active",
    };
  }

  pause(reason = "manual") {
    if (!this.canPause || ["paused", "finished", "disposed"].includes(this.lifecycle)) return;
    this.lifecycle = "paused";
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.coordinator.checkpointGame(this.checkpoint());
    if (this.feedback) this.feedback.textContent = reason === "attention" ? "Human Required · checkpoint saved" : "已暂停 · checkpoint saved";
    const button = $("catch-pause");
    if (button) button.textContent = "继续";
  }

  resume() {
    if (this.lifecycle !== "paused") return;
    if (this.completionQueued) return;
    this.lifecycle = "active";
    this.nextSpawnAt = performance.now() + 350;
    const button = $("catch-pause");
    if (button) button.textContent = "暂停";
    this.loop(performance.now());
  }

  queueCompletion() {
    this.completionQueued = true;
    this.lifecycle = "paused";
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.coordinator.checkpointGame(this.checkpoint());
    if (this.feedback) this.feedback.textContent = "本局完成 · 等待安全结算";
    this.coordinator.queueGameCompletion({ score: this.score, local_only: true });
  }

  forceCompletionRace() {
    if (this.lifecycle === "finished" || this.lifecycle === "disposed") return;
    this.round = this.rounds;
    this.items.forEach((item) => item.el.remove());
    this.items = [];
    this.queueCompletion();
  }

  restart() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.items.forEach((item) => item.el.remove());
    this.items = [];
    this.round = 0;
    this.score = 0;
    this.itemId = 0;
    this.completionQueued = false;
    this.lifecycle = "init";
    this.syncVisuals();
    this.start();
  }

  finish(payload = {}) {
    if (this.lifecycle === "finished" || this.lifecycle === "disposed") return;
    this.lifecycle = "finished";
    this.completionQueued = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.host.innerHTML = `<div class="game-complete"><strong>Catch complete ✦</strong><span>本局接住 ${Number(payload.score ?? this.score)} 个 Mochi。只有本局反馈，不会进入长期竞争。</span><div class="game-controls" style="justify-content:center;margin-top:14px"><button class="primary-button" id="game-done" type="button">回到小世界</button></div></div>`;
    $("game-done").addEventListener("click", () => closeGame());
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.items.forEach((item) => item.el.remove());
    this.items = [];
    this.lifecycle = "disposed";
    this.host.innerHTML = "";
  }
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

class MochiMemoryGame {
  constructor({ host, coordinator: gameCoordinator }) {
    this.host = host;
    this.coordinator = gameCoordinator;
    this.kind = "memory";
    this.canPause = true;
    this.canCheckpoint = true;
    this.lifecycle = "init";
    this.deck = [];
    this.opened = [];
    this.matched = new Set();
    this.feedbackPhase = "none";
    this.mismatchTimer = null;
    this.completionQueued = false;
  }

  makeDeck() {
    const pairs = [
      ["cloud", "idle"], ["cloud", "happy"], ["cloud", "rest"],
      ["berry", "idle"], ["berry", "happy"], ["berry", "rest"],
    ];
    const cards = [];
    pairs.forEach(([baseForm, pose], pairId) => {
      cards.push({ card_id: `${pairId}-a`, pair_id: pairId, base_form: baseForm, pose });
      cards.push({ card_id: `${pairId}-b`, pair_id: pairId, base_form: baseForm, pose });
    });
    return shuffle(cards);
  }

  init() {
    this.deck = this.makeDeck();
    this.opened = [];
    this.matched = new Set();
    this.feedbackPhase = "none";
    this.completionQueued = false;
    this.lifecycle = "init";
    this.render();
  }

  start() {
    if (["active", "finished", "disposed"].includes(this.lifecycle)) return;
    this.lifecycle = "active";
    this.renderCards();
  }

  render() {
    this.host.innerHTML = `<p class="game-instructions">3 × 4 小牌面，Mochi 的姿势和表情组成六对。没有计时、生命或错误惩罚；随时暂停。</p>
      <div class="game-toolbar"><span class="game-score" id="memory-score">已找到 0/6 对</span><div class="game-controls"><button class="secondary-button" id="memory-pause" type="button">暂停</button><button class="secondary-button" id="memory-restart" type="button">重开</button></div></div>
      <div class="memory-grid" id="memory-grid"></div>`;
    $("memory-pause").addEventListener("click", () => this.lifecycle === "active" ? this.pause("manual") : this.resume());
    $("memory-restart").addEventListener("click", () => this.restart());
    this.grid = $("memory-grid");
    this.grid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-card-index]");
      if (card) this.select(Number(card.dataset.cardIndex));
    });
    this.renderCards();
  }

  renderCards() {
    if (!this.grid) return;
    this.grid.innerHTML = this.deck.map((card, index) => {
      const isOpen = this.opened.includes(index);
      const isMatched = this.matched.has(index);
      return `<button class="memory-card ${isOpen ? "is-open" : ""} ${isMatched ? "is-matched" : ""}" type="button" data-card-index="${index}" aria-label="${isOpen || isMatched ? `Mochi ${card.base_form} ${card.pose}` : "隐藏的 Mochi 卡牌"}">
        <span class="memory-face"><span class="mini-mochi ${card.base_form}"><span class="mini-face"></span></span></span>
      </button>`;
    }).join("");
    const score = $("memory-score");
    if (score) score.textContent = `已找到 ${this.matched.size / 2}/6 对`;
    const pause = $("memory-pause");
    if (pause) pause.textContent = this.lifecycle === "paused" ? "继续" : "暂停";
  }

  select(index) {
    if (this.lifecycle !== "active" || this.opened.length >= 2 || this.matched.has(index) || this.opened.includes(index)) return;
    this.opened.push(index);
    this.feedbackPhase = this.opened.length === 2 ? "pair-check" : "one-open";
    this.renderCards();
    if (this.opened.length !== 2) {
      this.coordinator.checkpointGame(this.checkpoint());
      return;
    }
    const [first, second] = this.opened;
    if (this.deck[first].pair_id === this.deck[second].pair_id) {
      this.matched.add(first);
      this.matched.add(second);
      this.opened = [];
      this.feedbackPhase = "pair-matched";
      this.renderCards();
      this.coordinator.checkpointGame(this.checkpoint());
      if (this.matched.size === this.deck.length && !this.completionQueued) this.queueCompletion();
      return;
    }
    this.mismatchTimer = window.setTimeout(() => {
      if (this.lifecycle !== "active") return;
      this.opened = [];
      this.feedbackPhase = "none";
      this.mismatchTimer = null;
      this.renderCards();
      this.coordinator.checkpointGame(this.checkpoint());
    }, 620);
    this.coordinator.checkpointGame(this.checkpoint());
  }

  checkpoint() {
    return {
      game: "memory",
      shuffled_deck: this.deck.map((card) => ({ card_id: card.card_id, pair_id: card.pair_id, base_form: card.base_form, pose: card.pose })),
      opened_cards: [...this.opened],
      completed_pairs: [...this.matched],
      selected_card: this.opened.length ? this.opened[this.opened.length - 1] : null,
      feedback_phase: this.feedbackPhase,
    };
  }

  pause(reason = "manual") {
    if (!this.canPause || ["paused", "finished", "disposed"].includes(this.lifecycle)) return;
    this.lifecycle = "paused";
    if (this.mismatchTimer) window.clearTimeout(this.mismatchTimer);
    this.mismatchTimer = null;
    this.coordinator.checkpointGame(this.checkpoint());
    this.renderCards();
  }

  resume() {
    if (this.lifecycle !== "paused") return;
    if (this.completionQueued) return;
    this.lifecycle = "active";
    this.renderCards();
    if (this.feedbackPhase === "pair-check" && this.opened.length === 2) {
      this.mismatchTimer = window.setTimeout(() => {
        if (this.lifecycle !== "active") return;
        this.opened = [];
        this.feedbackPhase = "none";
        this.renderCards();
        this.coordinator.checkpointGame(this.checkpoint());
      }, 620);
    }
  }

  queueCompletion() {
    this.completionQueued = true;
    this.lifecycle = "paused";
    this.coordinator.checkpointGame(this.checkpoint());
    this.coordinator.queueGameCompletion({ score: this.matched.size / 2, local_only: true });
  }

  restart() {
    if (this.mismatchTimer) window.clearTimeout(this.mismatchTimer);
    this.init();
    this.start();
  }

  finish(payload = {}) {
    if (this.lifecycle === "finished" || this.lifecycle === "disposed") return;
    this.lifecycle = "finished";
    this.completionQueued = false;
    this.host.innerHTML = `<div class="game-complete"><strong>Memory complete ✦</strong><span>找到 ${Number(payload.score ?? this.matched.size / 2)} 对。没有计时压力，只有一小段安静的集中。</span><div class="game-controls" style="justify-content:center;margin-top:14px"><button class="primary-button" id="game-done" type="button">回到小世界</button></div></div>`;
    $("game-done").addEventListener("click", () => closeGame());
  }

  dispose() {
    if (this.mismatchTimer) window.clearTimeout(this.mismatchTimer);
    this.mismatchTimer = null;
    this.lifecycle = "disposed";
    this.host.innerHTML = "";
  }
}

function openGameOverlay() {
  $("game-overlay").classList.remove("hidden");
}

function startGame(kind) {
  if (coordinator.state.attention_state !== ATTENTION_STATES.NORMAL) {
    showToast("Human Required 正在优先处理，Arcade 会等你回来。");
    return;
  }
  if (appState.game) {
    appState.game.dispose();
    coordinator.disposeGame();
  }
  if (!coordinator.beginGame(kind)) return;
  const context = createArcadeContext({
    residents: appState.life.residents,
    theme: "pet-park",
    sound: appState.life.game_preferences.sound,
    attentionState: coordinator.state.attention_state,
  });
  // Context is intentionally not used to expose any Work data. Keeping it in
  // this call makes that future isolation boundary explicit.
  void context;
  const host = $("game-host");
  appState.game = kind === "catch"
    ? new MochiCatchGame({ host, coordinator })
    : new MochiMemoryGame({ host, coordinator });
  $("game-title").textContent = kind === "catch" ? "Mochi Catch" : "Mochi Memory";
  $("game-kicker").textContent = kind === "catch" ? "ARCADE · 30–90S" : "ARCADE · 1–3M";
  appState.game.init();
  appState.game.start();
  openGameOverlay();
}

function closeGame() {
  if (!appState.game) return;
  if (coordinator.state.attention_state !== ATTENTION_STATES.NORMAL) {
    showToast("先处理 Human Required；游戏状态已经安全保存。");
    return;
  }
  appState.game.dispose();
  appState.game = null;
  coordinator.disposeGame();
  $("game-overlay").classList.add("hidden");
  coordinator.setFocus(FOCUS.LIFE);
}

function triggerLevel2() {
  adapter.emit({ type: "level_2_human_required", work_mochi_id: "qa", role: "QA Mochi", request: "请确认测试路径，然后我才能继续。" });
}

function triggerCompletion() {
  if (!coordinator.state.war_room_active) adapter.emit({ type: "war_room_active", active: true });
  adapter.emit({ type: "work_mochi_public_state", work_mochi_public_state: signalWorkMochi().map((mochi) => ({ ...mochi, public_state: "completed" })) });
  adapter.emit({ type: "completion", label: "A real public completion signal was received." });
}

function triggerCatchRace() {
  if (!appState.game || appState.game.kind !== "catch") startGame("catch");
  window.setTimeout(() => {
    if (appState.game?.kind === "catch") {
      appState.game.forceCompletionRace();
      // Same-turn order is deliberate: the coordinator holds the completion
      // before it lets the Human Required signal take over.
      triggerLevel2();
    }
  }, 80);
}

function resetLife() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

function bindEvents() {
  $("focus-work").addEventListener("click", () => {
    coordinator.setFocus(FOCUS.WORK);
    $("work-title").scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Work Area 是事实锚点；当前只显示 Public Signals。");
  });
  $("close-game").addEventListener("click", closeGame);
  document.querySelectorAll("[data-game]").forEach((button) => button.addEventListener("click", () => startGame(button.dataset.game)));
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => performLifeAction(button.dataset.action)));
  document.querySelectorAll("[data-dev]").forEach((button) => button.addEventListener("click", () => {
    switch (button.dataset.dev) {
      case "toggle-room":
        adapter.emit({ type: "war_room_active", active: !coordinator.state.war_room_active });
        if (coordinator.state.war_room_active) adapter.emit({ type: "work_mochi_public_state", work_mochi_public_state: signalWorkMochi() });
        break;
      case "notice":
        adapter.emit({ type: "level_1_notice", message: "Builder Mochi 发送了一个普通进度提示。" });
        break;
      case "attention":
        triggerLevel2();
        break;
      case "respond":
        adapter.emit({ type: "human_response", action: "mock-human-response" });
        break;
      case "confirm":
        if (coordinator.state.attention_state === ATTENTION_STATES.AWAITING_HOST_CONFIRMATION) {
          adapter.emit({ type: "host_confirmation", outcome: "confirmed" });
          scheduleAttentionClear();
        }
        break;
      case "reject":
        if (coordinator.state.attention_state === ATTENTION_STATES.AWAITING_HOST_CONFIRMATION) {
          adapter.emit({ type: "host_confirmation", outcome: "rejected" });
          scheduleAttentionClear();
        }
        break;
      case "completion":
        triggerCompletion();
        break;
      case "visitor":
        appState.encounterOpportunityUsed = true;
        showVisitor();
        break;
      case "race":
        triggerCatchRace();
        break;
      case "reward-off":
        appState.rewardOff = !appState.rewardOff;
        $("reward-off-label").textContent = appState.rewardOff ? "ON" : "OFF";
        showToast(appState.rewardOff ? "Reward-off ON · 不写入长期奖励" : "Reward-off OFF · 允许纪念和 appearance 记录");
        break;
      case "reset":
        resetLife();
        break;
      default:
        break;
    }
    renderAll();
  }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !appState.encounterOpportunityUsed) scheduleEncounter();
  });
}

coordinator.subscribe((event) => {
  updateGameFocusForAttention(event);
  switch (event.kind) {
    case "war_room_active":
      if (event.payload.active) {
        adapter.emit({ type: "work_mochi_public_state", work_mochi_public_state: signalWorkMochi() });
        setNote("Work Mochi 回到事实锚点；Resident Mochi 继续自己的生活。");
      } else {
        setNote("这里今天很安静。Resident Mochi 仍然会生活，但不会假装有工作进度。");
      }
      break;
    case "level_1_notice":
      appState.level1Until = Date.now() + 5000;
      showToast(event.payload.message);
      break;
    case "attention_requested":
      renderAttention();
      renderStatus();
      showToast("Level 2 · Human Required 已抢占当前体验");
      break;
    case "awaiting_host_confirmation":
      renderAttention();
      renderStatus();
      break;
    case "host_decision":
      renderAttention();
      renderStatus();
      scheduleAttentionClear();
      break;
    case "attention_cleared":
      renderAttention();
      renderStatus();
      break;
    case "completion_ready":
      celebrateCompletion(event.payload?.label);
      break;
    default:
      break;
  }
  renderStatus();
  if (["war_room_active", "work_mochi_public_state", "completion_ready"].includes(event.kind)) renderWork();
  if (event.kind === "attention_requested" || event.kind === "attention_cleared") renderResidents();
});

bindEvents();
adapter.emit({ type: "war_room_active", active: true });
adapter.emit({ type: "work_mochi_public_state", work_mochi_public_state: signalWorkMochi() });
renderAll();
scheduleEncounter();
appState.ambientTimer = window.setInterval(runAmbient, 6200);
