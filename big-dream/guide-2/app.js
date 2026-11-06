/* ============================================================
   Big Dream Guide 2, Explore Possible Futures
   ============================================================ */

const STORAGE_KEY = "bigDreamGuide2:v1";

// Storage shim - persistent if available, in-memory fallback otherwise.
const memStore = {};
const storage = (() => {
  try {
    const g = (new Function("return this"))();
    const ls = g[["local", "Storage"].join("")];
    const probe = "__bdg2_probe__";
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

const TOLERATE_OPTIONS = [
  "Constant availability",
  "Over-functioning",
  "Being last on my own list",
  "Performing for approval",
  "Financial avoidance",
  "Scattered attention",
  "Saying yes when I mean no",
  "Rescuing every problem",
  "Hiding behind \u201Ctoo busy\u201D",
  "Resentment as my baseline",
  "Treating my body like a rented machine",
  "Letting urgency decide my day"
];

const POSSIBLE_OPTIONS = [
  "Depth in close relationships",
  "Creative work that is mine",
  "Financial steadiness",
  "Genuine presence",
  "Mentoring or guiding others",
  "Real rest",
  "A sense of direction",
  "Work that grows me",
  "Honest expression",
  "Adventure and play"
];

const VALUES_OPTIONS = [
  "Freedom","Peace","Mastery","Contribution","Adventure","Family",
  "Creativity","Health","Faith","Stability","Beauty","Leadership",
  "Learning","Courage","Simplicity","Depth","Belonging","Excellence",
  "Service","Play","Honesty","Growth","Intimacy","Wisdom","Impact"
];

const ENERGY_QUESTIONS = [
  { key: "energy_most",      label: "The future that gives me the most energy is:" },
  { key: "energy_peace",     label: "The future that gives me the most peace is:" },
  { key: "energy_scary",     label: "The future that scares me in a meaningful way is:" },
  { key: "energy_approval",  label: "The future that feels most like approval-seeking is:" },
  { key: "energy_aligned",   label: "The future most aligned with who I want to become is:" }
];

const FUTURE_LABELS = {
  1: "Future 1: Current Path Improved",
  2: "Future 2: Courageous Path",
  3: "Future 3: Unexpected Path"
};

const STEPS = [
  { id: "welcome",  tpl: "tpl-welcome",  label: "Welcome" },
  { id: "examples", tpl: "tpl-examples", label: "Examples & method" },
  { id: "future1",  tpl: "tpl-future1",  label: "Future 1" },
  { id: "future2",  tpl: "tpl-future2",  label: "Future 2" },
  { id: "future3",  tpl: "tpl-future3",  label: "Future 3" },
  { id: "values",   tpl: "tpl-values",   label: "Values" },
  { id: "energy",   tpl: "tpl-energy",   label: "Energy scan" },
  { id: "choose",   tpl: "tpl-choose",   label: "Choose one" },
  { id: "summary",  tpl: "tpl-summary",  label: "Summary" }
];

// ---------- State ----------
function futureKeys(n) {
  return {
    [`f${n}_name`]: "",
    [`f${n}_week`]: "",
    [`f${n}_tolerate`]: [],
    [`f${n}_tolerate_other_box`]: false,
    [`f${n}_tolerate_other_text`]: "",
    [`f${n}_possible`]: [],
    [`f${n}_possible_other_box`]: false,
    [`f${n}_possible_other_text`]: ""
  };
}

const defaultState = () => ({
  step: 0,
  data: {
    participant_name: "",
    participant_email: "",
    ...futureKeys(1),
    ...futureKeys(2),
    ...futureKeys(3),
    values_selected: [],
    values_other_box: false,
    values_other_text: "",
    energy_most: "",
    energy_peace: "",
    energy_scary: "",
    energy_approval: "",
    energy_aligned: "",
    chosen_future: "",
    chosen_because: ""
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
  try {
    storage.set(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {/* swallow */}
}

// ---------- Render ----------
const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

// ---------- Required fields by step ----------
function futureRules(n) {
  return [
    `f${n}_name`,
    `f${n}_week`,
    { type: "checked", key: `f${n}_tolerate`, min: 1, otherTextKey: `f${n}_tolerate_other_text` },
    { type: "checked", key: `f${n}_possible`, min: 1, otherTextKey: `f${n}_possible_other_text` }
  ];
}
const REQUIRED_BY_STEP = {
  welcome:  ["participant_name", { type: "email", key: "participant_email" }],
  examples: [],
  future1:  futureRules(1),
  future2:  futureRules(2),
  future3:  futureRules(3),
  values:   [{ type: "checked", key: "values_selected", min: 1, otherTextKey: "values_other_text" }],
  energy:   ["energy_most", "energy_peace", "energy_scary", "energy_approval", "energy_aligned"],
  choose:   ["chosen_future", "chosen_because"],
  summary:  []
};

const AUDIO_MAP = {
  hero_crossroads: "horizon.mp3",
  characters: "forest-birds.mp3",
  method: "breeze.mp3",
  future1_current: "breeze.mp3",
  future2_courage: "horizon.mp3",
  future3_unexpected: "horizon.mp3",
  values: "breeze.mp3",
  energy_scan: "horizon.mp3",
  choose_one: "horizon.mp3",
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
  const node = tpl.content.cloneNode(true);
  app.appendChild(node);
  try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch(e) { window.scrollTo(0, 0); }

  // Progress bar visibility
  topbar.hidden = state.step === 0;
  const pct = Math.round((state.step / (STEPS.length - 1)) * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Step ${state.step + 1} of ${STEPS.length}`;

  // Step-specific UI
  if (stepDef.id === "future1") buildFutureChecks(1);
  if (stepDef.id === "future2") buildFutureChecks(2);
  if (stepDef.id === "future3") buildFutureChecks(3);
  if (stepDef.id === "values")  buildValues();
  if (stepDef.id === "energy")  buildEnergy();
  if (stepDef.id === "summary") buildSummary();

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

  // Focus first input on form steps
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

function buildFutureChecks(n) {
  const tol = app.querySelector(`[data-tolerate-checks="${n}"]`);
  const pos = app.querySelector(`[data-possible-checks="${n}"]`);
  const tolKey = `f${n}_tolerate`;
  const posKey = `f${n}_possible`;

  tol.innerHTML = TOLERATE_OPTIONS.map((text) => `
    <label class="check-row">
      <input type="checkbox" data-group="${tolKey}" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");

  pos.innerHTML = POSSIBLE_OPTIONS.map((text) => `
    <label class="check-row">
      <input type="checkbox" data-group="${posKey}" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");

  // Hydrate
  hydrateGroup(tolKey);
  hydrateGroup(posKey);

  // Bind
  bindGroup(tolKey);
  bindGroup(posKey);
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

function buildValues() {
  const grid = document.getElementById("valuesChecks");
  grid.innerHTML = VALUES_OPTIONS.map((text) => `
    <label class="check-row compact">
      <input type="checkbox" data-group="values_selected" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");

  const counter = document.getElementById("valuesCounter");
  const updateCounter = () => {
    const n = (state.data.values_selected || []).length;
    counter.textContent = `${n} of 5 selected`;
    counter.classList.toggle("warn", n > 5);
  };
  hydrateGroup("values_selected");
  updateCounter();
  app.querySelectorAll('input[data-group="values_selected"]').forEach(cb => {
    cb.addEventListener("change", () => {
      const set = new Set(state.data.values_selected || []);
      if (cb.checked) {
        if (set.size >= 5) {
          // Soft cap: uncheck and ignore (still allow but warn)
          // To make this a hard cap, uncomment next 2 lines:
          // cb.checked = false;
          // return;
        }
        set.add(cb.value);
      } else {
        set.delete(cb.value);
      }
      state.data.values_selected = Array.from(set);
      saveState();
      updateCounter();
    });
  });
}

function buildEnergy() {
  const container = document.getElementById("energyQuestions");
  container.innerHTML = ENERGY_QUESTIONS.map(q => `
    <div class="energy-q">
      <div class="field-label">${q.label}</div>
      <div class="radio-row">
        ${[1,2,3].map(n => `
          <label class="radio-pill">
            <input type="radio" name="${q.key}" value="${n}" data-radio="${q.key}" />
            <span>${FUTURE_LABELS[n]}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");

  // Hydrate + bind
  ENERGY_QUESTIONS.forEach(q => {
    const val = state.data[q.key];
    if (val) {
      const radio = container.querySelector(`input[name="${q.key}"][value="${val}"]`);
      if (radio) radio.checked = true;
    }
  });
  container.querySelectorAll("input[data-radio]").forEach(r => {
    r.addEventListener("change", () => {
      state.data[r.dataset.radio] = Number(r.value);
      saveState();
    });
  });
}

function hydrateInputs() {
  app.querySelectorAll("[data-key]").forEach(el => {
    const key = el.dataset.key;
    const val = state.data[key];
    if (val === undefined || val === null) return;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val;
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
function ph(key) { return window.PhotoAttach ? window.PhotoAttach.renderSummaryPhotos(STORAGE_KEY, key) : ""; }

function buildSummary() {
  const sub = document.getElementById("summarySubtitle");
  const name = (state.data.participant_name || "").trim();
  if (name) sub.textContent = `An insight document for ${name} to keep.`;

  const body = document.getElementById("summaryBody");

  const futureCard = (n, accent) => {
    const tolerate = [...(state.data[`f${n}_tolerate`] || [])];
    if (state.data[`f${n}_tolerate_other_box`] && state.data[`f${n}_tolerate_other_text`]?.trim()) {
      tolerate.push(state.data[`f${n}_tolerate_other_text`].trim());
    }
    const possible = [...(state.data[`f${n}_possible`] || [])];
    if (state.data[`f${n}_possible_other_box`] && state.data[`f${n}_possible_other_text`]?.trim()) {
      possible.push(state.data[`f${n}_possible_other_text`].trim());
    }
    const futureName = state.data[`f${n}_name`]?.trim();
    const week = state.data[`f${n}_week`]?.trim();

    const subtitle = ["Current Path Improved","Courageous Path","Unexpected Path"][n-1];

    return `
      <div class="summary-card future-card future-${n}">
        <span class="summary-eyebrow">Future ${n}: ${subtitle}</span>
        <h3 class="future-name">${futureName ? escapeHtml(futureName) : `<span class='summary-empty'>Unnamed</span>`}</h3>
        <div class="future-section">
          <div class="future-section-label">A normal week</div>
          <p>${week ? escapeHtml(week) : emptyText()}</p>
          ${ph(`f${n}_week`)}
        </div>
        <div class="future-section">
          <div class="future-section-label">I stop tolerating</div>
          ${tolerate.length ? `<div class="tag-list">${tolerate.map(t => `<span class="tag tag-warm">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
        </div>
        <div class="future-section">
          <div class="future-section-label">This future makes possible</div>
          ${possible.length ? `<div class="tag-list">${possible.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
        </div>
      </div>
    `;
  };

  // Values
  const values = [...(state.data.values_selected || [])];
  if (state.data.values_other_box && state.data.values_other_text?.trim()) {
    values.push(state.data.values_other_text.trim());
  }

  // Energy scan table
  const energyRows = ENERGY_QUESTIONS.map(q => {
    const val = state.data[q.key];
    return `
      <div class="energy-summary-row">
        <div class="energy-summary-label">${q.label}</div>
        <div class="energy-summary-value">${val ? FUTURE_LABELS[val] : `<span class="summary-empty">No answer</span>`}</div>
      </div>
    `;
  }).join("");

  body.innerHTML = `
    <div class="summary-card feature">
      <span class="summary-eyebrow">The future I want to look at more closely</span>
      <blockquote>${escapeHtml(state.data.chosen_future) || "<span class='summary-empty'>Not yet chosen.</span>"}</blockquote>
      ${ph("chosen_future")}
      ${state.data.chosen_because?.trim() ? `
        <h3 style="margin-top:18px;">Why I am choosing this future</h3>
        <p>${escapeHtml(state.data.chosen_because)}</p>
        ${ph("chosen_because")}
      ` : ""}
    </div>

    <div class="summary-section-divider">
      <span>The three futures I sketched</span>
    </div>

    ${futureCard(1)}
    ${futureCard(2)}
    ${futureCard(3)}

    <div class="summary-card">
      <span class="summary-eyebrow">Step 4: Values that kept showing up</span>
      <h3>My values, repeating across the futures</h3>
      ${values.length ? `<div class="tag-list values-tags">${values.map(t => `<span class="tag tag-value">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
    </div>

    <div class="summary-card">
      <span class="summary-eyebrow">Step 5: Energy scan</span>
      <h3>What my instinct said about each future</h3>
      <div class="energy-summary-grid">${energyRows}</div>
    </div>

    <div class="summary-signoff">
      <p><em>Three futures named. That takes courage.</em></p>
      <p>Much love,</p>
      <p class="signoff-name" style="font-size:22px;">Francois</p>
    </div>
  `;
}

function emptyText() {
  return `<span class="summary-empty">Left blank. You can go back and add this in.</span>`;
}

// ---------- PDF ----------
async function downloadPdf() {
  const btn = document.getElementById("downloadPdf");
  if (!btn) return;
  const name = (state.data.participant_name || "Big-Dream-Guide").trim().replace(/\s+/g, "-");
  try {
    await PgwPdf.export({
      containerSelector: ".summary",
      filename: `${name}-Explore-Possible-Futures.pdf`,
      guideTitle: "Guide 2 · Explore Possible Futures",
      button: btn,
    });
  } catch (e) {
    console.error(e);
    alert("Sorry, something went wrong creating the PDF. Try again or use your browser's Print → Save as PDF.");
  }
}

// ---------- Start over ----------
function confirmStartOver() {
  showModal({
    title: "Start over?",
    body: "This will clear your answers for Guide 2 on this device. You will not be able to undo this.",
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

// ---------- utils ----------
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

// ---------- Boot ----------
render();
