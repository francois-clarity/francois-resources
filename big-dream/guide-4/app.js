/* ============================================================
   Big Dream Guide 4, Build the First Process
   ============================================================ */

const STORAGE_KEY = "bigDreamGuide4:v1";

const memStore = {};
const storage = (() => {
  try {
    const g = (new Function("return this"))();
    const ls = g[["local", "Storage"].join("")];
    const probe = "__bdg4_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
      persistent: true
    };
  } catch (e) {
    return {
      get: (k) => (k in memStore ? memStore[k] : null),
      set: (k, v) => { memStore[k] = v; },
      remove: (k) => { delete memStore[k]; },
      persistent: false
    };
  }
})();

const GAP_OPTIONS = [
  "Lack of structure",
  "Scattered attention",
  "A conversation I am avoiding",
  "Poor health rhythm",
  "No protected thinking time",
  "Financial avoidance",
  "Fear of visibility",
  "Overcommitment",
  "Emotional avoidance",
  "Lack of skill or knowledge",
  "Lack of rest",
  "Environment that makes distraction too easy",
  "Relationship patterns that need repair"
];

const PROCESS_AREAS = [
  "Attention and focus",
  "Health and energy",
  "Relationship repair",
  "Creative work",
  "Money clarity",
  "Business or career building",
  "Spiritual or inner life practice",
  "Learning or skill development",
  "Environment design",
  "Rest and recovery",
  "Boundaries and saying no",
  "Other"
];

const FEELINGS = [
  "Anxious", "Excited", "Numb", "Heavy", "Restless", "Hopeful",
  "Hesitant", "Determined", "Tired", "Proud", "Afraid", "Curious"
];

const POPDUH_OPTIONS = [
  { value: "Procrastination", label: "Procrastination: putting off what matters" },
  { value: "Overthinking",    label: "Overthinking: analysing instead of acting" },
  { value: "Perfectionism",   label: "Perfectionism: refusing to start until it's perfect" },
  { value: "Distraction",     label: "Distraction: letting noise pull me away" },
  { value: "Undermining",     label: "Undermining: sabotaging progress with old habits" },
  { value: "Hustle",          label: "Hustle: proving worth through constant busyness" }
];

const STEPS = [
  { id: "welcome",      tpl: "tpl-welcome",      label: "Welcome" },
  { id: "examples",     tpl: "tpl-examples",     label: "Examples & method" },
  { id: "bigdream",     tpl: "tpl-bigdream",     label: "Big Dream" },
  { id: "current",      tpl: "tpl-current",      label: "Current reality" },
  { id: "gap",          tpl: "tpl-gap",          label: "The gap" },
  { id: "process-area", tpl: "tpl-process-area", label: "Process area" },
  { id: "friction",     tpl: "tpl-friction",     label: "Friction" },
  { id: "voices",       tpl: "tpl-voices",       label: "Voice of friction" },
  { id: "popduh",       tpl: "tpl-popduh",       label: "POPDUH pattern" },
  { id: "design",       tpl: "tpl-design",       label: "Design the process" },
  { id: "ifthen",       tpl: "tpl-ifthen",       label: "If-then plan" },
  { id: "firstsign",    tpl: "tpl-firstsign",    label: "First visible sign" },
  { id: "commitment",   tpl: "tpl-commitment",   label: "Commitment" },
  { id: "summary",      tpl: "tpl-summary",      label: "Summary" }
];

const defaultState = () => ({
  step: 0,
  data: {
    participant_name: "",
    participant_email: "",
    my_big_dream: "",
    current_reality: "",
    gap: [],
    gap_other_box: false,
    gap_other_text: "",
    process_area_first: "",
    process_area: "",
    process_why: "",
    feelings: [],
    feelings_other_box: false,
    feelings_other_text: "",
    friction_belief: "",
    avoidance_behaviour: "",
    voice: "",
    voice_speaks: "",
    popduh: "",
    popduh_shows_as: "",
    practise: "",
    what_will_do: "",
    when_do: "",
    where_do: "",
    how_long: "",
    what_remove: "",
    visible_outcome: "",
    if_text: "",
    then_text: "",
    complete_ifthen: "",
    first_visible_sign: "",
    within_24h: "",
    practising_this: "",
    when_friction: ""
  }
});

let state = loadState();

function loadState() {
  try {
    const raw = storage.get(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const fresh = defaultState();
    return { step: parsed.step ?? 0, data: { ...fresh.data, ...(parsed.data || {}) } };
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  try { storage.set(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

const AUDIO_MAP = {
  hero_footprints: "horizon.mp3",
  characters: "forest-birds.mp3",
  method: "breeze.mp3",
  current_reality: "breeze.mp3",
  gap: "breeze.mp3",
  process_area: "horizon.mp3",
  friction: "breeze.mp3",
  voices: "horizon.mp3",
  process: "horizon.mp3",
  ifthen: "breeze.mp3",
  first_sign: "horizon.mp3",
  summary: "forest-birds.mp3"
};
function attachStepAudio() {
  const imgs = app.querySelectorAll("img[src*='/images/']");
  imgs.forEach(function (img) {
    const m = img.getAttribute("src").match(/\/([^\/]+)\.(jpg|png|webp)$/i);
    if (!m) return;
    const file = AUDIO_MAP[m[1]];
    if (file) img.setAttribute("data-nature-audio", "../shared/audio/" + file);
  });
}

function render() {
  const stepDef = STEPS[state.step];
  const tpl = document.getElementById(stepDef.tpl);
  if (!tpl) return;
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  topbar.hidden = state.step === 0;
  const pct = Math.round((state.step / (STEPS.length - 1)) * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Step ${state.step + 1} of ${STEPS.length}`;

  if (stepDef.id === "gap")          buildGap();
  if (stepDef.id === "process-area") buildProcessArea();
  if (stepDef.id === "friction")     buildFeelings();
  if (stepDef.id === "voices")       hydrateRadio("voice");
  if (stepDef.id === "popduh")       buildPopduh();
  if (stepDef.id === "summary")      buildSummary();

  hydrateInputs();
  bindNavButtons();
  bindInputs();

  if (window.PhotoAttach) window.PhotoAttach.attachAll(STORAGE_KEY, app);
  attachStepAudio();
  if (window.NatureAudio) window.NatureAudio.scan(app);

  if (window.StepValidation) {
    window.StepValidation.attach(app, state, STORAGE_KEY, REQUIRED_BY_STEP, () => STEPS[state.step].id);
  }

  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  setTimeout(() => {
    const firstInput = app.querySelector("input[type='text'], input[type='email'], textarea");
    if (firstInput && state.step > 0 && state.step < STEPS.length - 1) {
      // Skip auto-focus on touch devices - on mobile, .focus() scrolls the
      // page down to the input and pops the keyboard, before the user has
      // had a chance to read the question.
      var isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (!firstInput.value && !isCoarsePointer) firstInput.focus();
    }
  }, 100);
}

function buildGap() {
  const grid = document.getElementById("gapChecks");
  grid.innerHTML = GAP_OPTIONS.map(text => `
    <label class="check-row compact">
      <input type="checkbox" data-group="gap" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");
  hydrateGroup("gap");
  bindGroup("gap");
}

function buildProcessArea() {
  const grid = document.getElementById("processAreaChecks");
  grid.innerHTML = PROCESS_AREAS.map(text => `
    <label class="check-row">
      <input type="radio" name="process_area" value="${escapeAttr(text)}" data-radio-key="process_area" />
      <span>${text}</span>
    </label>
  `).join("");
  hydrateRadio("process_area");
  bindRadio("process_area");
}

function buildFeelings() {
  const grid = document.getElementById("feelingsChecks");
  grid.innerHTML = FEELINGS.map(text => `
    <label class="check-row compact">
      <input type="checkbox" data-group="feelings" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");
  hydrateGroup("feelings");
  bindGroup("feelings");
}

function buildPopduh() {
  const grid = document.getElementById("popduhChecks");
  grid.innerHTML = POPDUH_OPTIONS.map(opt => `
    <label class="check-row">
      <input type="radio" name="popduh" value="${escapeAttr(opt.value)}" data-radio-key="popduh" />
      <span>${opt.label}</span>
    </label>
  `).join("");
  hydrateRadio("popduh");
  bindRadio("popduh");
}

function hydrateGroup(key) {
  const selected = state.data[key] || [];
  app.querySelectorAll(`input[data-group="${key}"]`).forEach(cb => {
    if (selected.includes(cb.value)) cb.checked = true;
  });
}
function bindGroup(key) {
  app.querySelectorAll(`input[data-group="${key}"]`).forEach(cb => {
    cb.addEventListener("change", () => {
      const set = new Set(state.data[key] || []);
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      state.data[key] = Array.from(set);
      saveState();
    });
  });
}
function hydrateRadio(key) {
  const val = state.data[key];
  if (!val) return;
  const radio = app.querySelector(`input[data-radio-key="${key}"][value="${cssEscape(val)}"]`);
  if (radio) radio.checked = true;
}
function bindRadio(key) {
  app.querySelectorAll(`input[data-radio-key="${key}"]`).forEach(r => {
    r.addEventListener("change", () => {
      if (r.checked) {
        state.data[key] = r.value;
        saveState();
      }
    });
  });
}
function cssEscape(s) {
  return String(s).replace(/(["\\])/g, "\\$1");
}

function hydrateInputs() {
  app.querySelectorAll("[data-key]").forEach(el => {
    const key = el.dataset.key;
    const val = state.data[key];
    if (val === undefined || val === null) return;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val;
  });
  // Voice radios use name="voice" - hydrate via dataset
  app.querySelectorAll('input[type="radio"][data-radio-key="voice"]').forEach(r => {
    if (r.value === state.data.voice) r.checked = true;
    r.addEventListener("change", () => {
      if (r.checked) {
        state.data.voice = r.value;
        saveState();
      }
    });
  });
}

function bindInputs() {
  app.querySelectorAll("[data-key]").forEach(el => {
    const key = el.dataset.key;
    const ev = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(ev, () => {
      state.data[key] = el.type === "checkbox" ? el.checked : el.value;
      saveState();
    });
  });
}

function bindNavButtons() {
  app.querySelectorAll("[data-action='next']").forEach(btn => {
    btn.addEventListener("click", () => goNext());
  });
  app.querySelectorAll("[data-action='prev']").forEach(btn => {
    btn.addEventListener("click", () => goPrev());
  });
  const dl = document.getElementById("downloadPdf");
  if (dl) dl.addEventListener("click", downloadPdf);
  const so = document.getElementById("startOver");
  if (so) so.addEventListener("click", confirmStartOver);
}

const REQUIRED_BY_STEP = {
  welcome:        ["participant_name", { type: "email", key: "participant_email" }],
  examples:       [],
  bigdream:       ["my_big_dream"],
  current:        ["current_reality"],
  gap:            [{ type: "checked", key: "gap", min: 1, otherTextKey: "gap_other_text" }],
  "process-area": ["process_area", "process_area_first", "process_why"],
  friction:       [{ type: "checked", key: "feelings", min: 1, otherTextKey: "feelings_other_text" }],
  voices:         ["friction_belief", "avoidance_behaviour", "voice", "voice_speaks"],
  popduh:         ["popduh", "popduh_shows_as"],
  design:         ["practise", "what_will_do", "when_do", "where_do", "how_long", "what_remove", "visible_outcome"],
  ifthen:         ["if_text", "then_text", "complete_ifthen"],
  firstsign:      ["first_visible_sign", "within_24h"],
  commitment:     ["practising_this", "when_friction"],
  summary:        []
};

function validateCurrent() {
  const id = STEPS[state.step].id;
  const rules = REQUIRED_BY_STEP[id] || [];
  if (window.StepValidation && window.StepValidation.isStepValid(state, STORAGE_KEY, rules)) {
    return true;
  }
  const firstUnfilled = app.querySelector("[data-key]:not([type='checkbox'])");
  if (firstUnfilled) {
    firstUnfilled.classList.add("error");
    try { firstUnfilled.focus(); } catch (e) {}
  }
  return false;
}

function goNext() {
  if (!validateCurrent()) return;
  state.step = Math.min(state.step + 1, STEPS.length - 1);
  saveState();
  render();
}
function goPrev() {
  state.step = Math.max(state.step - 1, 0);
  saveState();
  render();
}

// ---------- Summary ----------
function buildSummary() {
  const sub = document.getElementById("summarySubtitle");
  const name = (state.data.participant_name || "").trim();
  if (name) sub.textContent = `An insight document for ${name} to keep.`;

  const body = document.getElementById("summaryBody");

  const gap = [...(state.data.gap || [])];
  if (state.data.gap_other_box && state.data.gap_other_text?.trim()) {
    gap.push(state.data.gap_other_text.trim());
  }
  const feelings = [...(state.data.feelings || [])];
  if (state.data.feelings_other_box && state.data.feelings_other_text?.trim()) {
    feelings.push(state.data.feelings_other_text.trim());
  }

  const d = state.data;

  const processCard = `
    <div class="summary-card feature future-card">
      <span class="summary-eyebrow">My seven-day process</span>
      <blockquote>${d.practise?.trim() ? escapeHtml(d.practise) : "<span class='summary-empty'>Not yet written.</span>"}</blockquote>
      ${ph("practise")}
      <div class="process-grid">
        ${d.what_will_do?.trim() ? `<div class="process-cell"><span class="process-label">What I will do</span><p>${escapeHtml(d.what_will_do)}</p>${ph("what_will_do")}</div>` : ""}
        ${d.when_do?.trim() ? `<div class="process-cell"><span class="process-label">When</span><p>${escapeHtml(d.when_do)}</p>${ph("when_do")}</div>` : ""}
        ${d.where_do?.trim() ? `<div class="process-cell"><span class="process-label">Where</span><p>${escapeHtml(d.where_do)}</p>${ph("where_do")}</div>` : ""}
        ${d.how_long?.trim() ? `<div class="process-cell"><span class="process-label">How long</span><p>${escapeHtml(d.how_long)}</p>${ph("how_long")}</div>` : ""}
        ${d.what_remove?.trim() ? `<div class="process-cell wide"><span class="process-label">What I will remove</span><p>${escapeHtml(d.what_remove)}</p>${ph("what_remove")}</div>` : ""}
        ${d.visible_outcome?.trim() ? `<div class="process-cell wide"><span class="process-label">Visible outcome at day 7</span><p>${escapeHtml(d.visible_outcome)}</p>${ph("visible_outcome")}</div>` : ""}
      </div>
    </div>
  `;

  body.innerHTML = `
    ${d.my_big_dream?.trim() ? `
      <div class="summary-card future-card future-2">
        <span class="summary-eyebrow">My Big Dream</span>
        <blockquote>${escapeHtml(d.my_big_dream)}</blockquote>
      </div>
    ` : ""}

    <div class="summary-section-divider"><span>From dream to process</span></div>

    <div class="summary-card future-card future-1">
      <span class="summary-eyebrow">Step 2: Current reality</span>
      <p>${d.current_reality?.trim() ? escapeHtml(d.current_reality) : emptyText()}</p>
      ${ph("current_reality")}
    </div>

    <div class="summary-card future-card future-3">
      <span class="summary-eyebrow">Step 3: The gap</span>
      ${gap.length ? `<div class="tag-list">${gap.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
    </div>

    <div class="summary-card future-card future-2">
      <span class="summary-eyebrow">Step 4: Process area</span>
      <h3>${d.process_area_first?.trim() ? escapeHtml(d.process_area_first) : (d.process_area || "<span class='summary-empty'>No area chosen.</span>")}</h3>
      ${d.process_area && d.process_area_first?.trim() ? `<p class="muted-inline" style="display:block; margin-top:-6px;">Category: ${escapeHtml(d.process_area)}</p>` : ""}
      ${ph("process_area_first")}
      ${d.process_why?.trim() ? `<div class="future-section" style="margin-top:10px;"><div class="future-section-label">Why</div><p>${escapeHtml(d.process_why)}</p>${ph("process_why")}</div>` : ""}
    </div>

    <div class="summary-card future-card future-1">
      <span class="summary-eyebrow">Step 5: Friction</span>
      <h3>Feelings I notice when I imagine starting</h3>
      ${feelings.length ? `<div class="tag-list">${feelings.map(t => `<span class="tag tag-warm">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
    </div>

    <div class="summary-card future-card future-3">
      <span class="summary-eyebrow">Step 6: The voice of friction</span>
      ${d.voice ? `<h3>${escapeHtml(d.voice)}</h3>` : ""}
      ${d.friction_belief?.trim() ? `<div class="future-section"><div class="future-section-label">The story it tells</div><p>${escapeHtml(d.friction_belief)}</p>${ph("friction_belief")}</div>` : ""}
      ${d.avoidance_behaviour?.trim() ? `<div class="future-section"><div class="future-section-label">My usual avoidance</div><p>${escapeHtml(d.avoidance_behaviour)}</p>${ph("avoidance_behaviour")}</div>` : ""}
      ${d.voice_speaks?.trim() ? `<div class="future-section"><div class="future-section-label">What it usually says</div><p>${escapeHtml(d.voice_speaks)}</p>${ph("voice_speaks")}</div>` : ""}
    </div>

    ${d.popduh ? `
      <div class="summary-card future-card future-2">
        <span class="summary-eyebrow">Step 7: POPDUH pattern</span>
        <h3>${escapeHtml(d.popduh)}</h3>
        ${d.popduh_shows_as?.trim() ? `<p>${escapeHtml(d.popduh_shows_as)}</p>${ph("popduh_shows_as")}` : ""}
      </div>
    ` : ""}

    <div class="summary-section-divider"><span>The process itself</span></div>

    ${processCard}

    <div class="summary-card future-card future-3">
      <span class="summary-eyebrow">Step 9: If-then plan</span>
      ${d.complete_ifthen?.trim() ? `<blockquote>${escapeHtml(d.complete_ifthen)}</blockquote>${ph("complete_ifthen")}` : `<p>${emptyText()}</p>`}
      ${(d.if_text?.trim() || d.then_text?.trim()) ? `
        <div class="ifthen-summary">
          ${d.if_text?.trim() ? `<div class="ifthen-cell"><span class="process-label">If…</span><p>${escapeHtml(d.if_text)}</p>${ph("if_text")}</div>` : ""}
          ${d.then_text?.trim() ? `<div class="ifthen-cell"><span class="process-label">Then…</span><p>${escapeHtml(d.then_text)}</p>${ph("then_text")}</div>` : ""}
        </div>
      ` : ""}
    </div>

    <div class="summary-card future-card future-2">
      <span class="summary-eyebrow">Step 10: First visible sign</span>
      ${d.first_visible_sign?.trim() ? `<div class="future-section"><div class="future-section-label">The first sign</div><p>${escapeHtml(d.first_visible_sign)}</p>${ph("first_visible_sign")}</div>` : ""}
      ${d.within_24h?.trim() ? `<div class="future-section"><div class="future-section-label">Within the next 24 hours</div><p>${escapeHtml(d.within_24h)}</p>${ph("within_24h")}</div>` : `<p>${emptyText()}</p>`}
    </div>

    ${(d.practising_this?.trim() || d.when_friction?.trim()) ? `
      <div class="summary-card future-card future-1">
        <span class="summary-eyebrow">Step 11: Seven-day commitment</span>
        ${d.practising_this?.trim() ? `<div class="future-section"><div class="future-section-label">For the next seven days I am practising</div><p>${escapeHtml(d.practising_this)}</p>${ph("practising_this")}</div>` : ""}
        ${d.when_friction?.trim() ? `<div class="future-section"><div class="future-section-label">When friction arrives, I will</div><p>${escapeHtml(d.when_friction)}</p>${ph("when_friction")}</div>` : ""}
      </div>
    ` : ""}

    <div class="summary-signoff">
      <p><em>A dream you can practise for seven days is a dream you can live for seven years.</em></p>
      <p>Much love,</p>
      <p class="signoff-name" style="font-size:22px;">Francois</p>
      <p class="tiny-note">Francois Esterhuizen · <a href="https://francoisesterhuizen.com">francoisesterhuizen.com</a></p>
    </div>
  `;
}

function emptyText() {
  return `<span class="summary-empty">Left blank. You can go back and add this in.</span>`;
}

function ph(key) { return window.PhotoAttach ? window.PhotoAttach.renderSummaryPhotos(STORAGE_KEY, key) : ""; }

// ---------- PDF ----------
async function downloadPdf() {
  const btn = document.getElementById("downloadPdf");
  if (!btn) return;
  const name = (state.data.participant_name || "Big-Dream-Guide").trim().replace(/\s+/g, "-");
  try {
    await PgwPdf.export({
      containerSelector: ".summary",
      filename: `${name}-Build-the-First-Process.pdf`,
      guideTitle: "Guide 4 · Build the First Process",
      button: btn,
    });
  } catch (e) {
    console.error(e);
    alert("Sorry, something went wrong creating the PDF. Try again or use your browser's Print → Save as PDF.");
  }
}

function confirmStartOver() {
  showModal({
    title: "Start over?",
    body: "This will clear your answers for Guide 4 on this device. You will not be able to undo this.",
    confirmLabel: "Yes, start over",
    onConfirm: () => {
      storage.remove(STORAGE_KEY);
      if (window.PhotoAttach) window.PhotoAttach.clearAll(STORAGE_KEY);
      state = defaultState();
      render();
    }
  });
}

const modal = document.getElementById("modal");
function showModal({ title, body, confirmLabel, onConfirm }) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").textContent = body;
  const confirmBtn = document.getElementById("modalConfirm");
  confirmBtn.textContent = confirmLabel || "Confirm";
  modal.hidden = false;

  const cancel = () => { modal.hidden = true; cleanup(); };
  const confirm = () => { modal.hidden = true; cleanup(); onConfirm?.(); };
  function cleanup() {
    confirmBtn.removeEventListener("click", confirm);
    document.getElementById("modalCancel").removeEventListener("click", cancel);
  }
  confirmBtn.addEventListener("click", confirm);
  document.getElementById("modalCancel").addEventListener("click", cancel);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br/>");
}
function escapeAttr(str) {
  return String(str).replaceAll('"', "&quot;");
}

render();
