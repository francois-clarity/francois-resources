/* ============================================================
   Big Dream Guide: Interactive
   ============================================================ */

const STORAGE_KEY = "bigDreamGuide:v1";

// Storage shim: persistent if available, in-memory fallback otherwise.
// Some preview/embed contexts disable browser persistence APIs; we keep the
// app working in-memory there.
const memStore = {};
const storage = (() => {
  try {
    const g = (new Function("return this"))();
    const ls = g[["local", "Storage"].join("")];
    const probe = "__bdg_probe__";
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

const DOMAINS = [
  { key: "score_health",       label: "Health and energy" },
  { key: "score_marriage",     label: "Marriage or intimate relationship" },
  { key: "score_family",       label: "Family and friendships" },
  { key: "score_work",         label: "Work, career or business" },
  { key: "score_money",        label: "Money and stewardship" },
  { key: "score_spiritual",    label: "Spiritual life or inner life" },
  { key: "score_growth",       label: "Personal growth and learning" },
  { key: "score_fun",          label: "Fun, adventure and aliveness" },
  { key: "score_contribution", label: "Contribution and impact" },
  { key: "score_environment",  label: "Environment and lifestyle" }
];

const DREAD_CHECKS = [
  "Becoming successful but disconnected",
  "Reacting to everyone else's urgency",
  "Tolerating exhaustion as if it is normal",
  "Losing my warmth and patience",
  "Never experiencing a calm, meaningful rhythm",
  "Relationships becoming practical arrangements",
  "Work becoming a machine I feed with my health",
  "Being kind to everyone but dishonest with myself",
  "Waiting for permission to live my own life",
  "Being last on my own list",
  "Losing my creativity or voice",
  "Living a life I never gave myself permission to choose"
];

const STEPS = [
  { id: "welcome",  tpl: "tpl-welcome",  label: "Welcome" },
  { id: "examples", tpl: "tpl-examples", label: "Method" },
  { id: "step1",    tpl: "tpl-step1",    label: "The Drift Question" },
  { id: "step2",    tpl: "tpl-step2",    label: "Life-Domain Reality Check" },
  { id: "step3",    tpl: "tpl-step3",    label: "What I Can No Longer Ignore" },
  { id: "step4",    tpl: "tpl-step4",    label: "Big Dread Sentence Stems" },
  { id: "step5",    tpl: "tpl-step5",    label: "My Big Dread Statement" },
  { id: "step6",    tpl: "tpl-step6",    label: "Clean Version" },
  { id: "summary",  tpl: "tpl-summary",  label: "Summary" }
];

// ---------- State ----------
const defaultState = () => ({
  step: 0,
  data: {
    participant_name: "",
    participant_email: "",
    drift_question: "",
    costing_most: "",
    pretending_fine: "",
    pattern_repeating: "",
    afraid_tolerating: "",
    afraid_lose: "",
    afraid_relationships: "",
    big_dread_paragraph: "",
    big_dread_clean: "",
    dread_checks: [],
    dread_other_box: false,
    dread_other_text: "",
    ...Object.fromEntries(DOMAINS.map(d => [d.key, null]))
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
  } catch (e) {
    /* swallow */
  }
}

// ---------- Render ----------
const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

// ---------- Required fields by step ----------
const REQUIRED_BY_STEP = {
  welcome:  ["participant_name", { type: "email", key: "participant_email" }],
  examples: [],
  step1:    ["drift_question"],
  step2:    [{ type: "scores", keys: DOMAINS.map(d => d.key) }],
  step3:    ["costing_most", "pretending_fine", "pattern_repeating"],
  step4:    [{ type: "checked", key: "dread_checks", min: 1, otherTextKey: "dread_other_text" }, "afraid_tolerating", "afraid_lose", "afraid_relationships"],
  step5:    ["big_dread_paragraph"],
  step6:    ["big_dread_clean"],
  summary:  []
};

// Image -> nature-audio mapping. Each filename suffix maps to an audio file in ../shared/audio/.
const AUDIO_MAP = {
  hero_walking: "forest-birds.mp3",
  characters: "forest-birds.mp3",
  journaling: "breeze.mp3",
  future_self: "horizon.mp3",
  life_wheel: "breeze.mp3",
  burden: "breeze.mp3",
  writing: "breeze.mp3",
  mirror: "horizon.mp3",
  energy: "horizon.mp3",
  extra: "forest-birds.mp3"
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
  if (state.step === 0 || state.step === STEPS.length - 1) {
    topbar.hidden = state.step === 0;
  } else {
    topbar.hidden = false;
  }
  const pct = Math.round((state.step / (STEPS.length - 1)) * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Step ${state.step + 1} of ${STEPS.length}`;

  // Hook up step-specific UI
  if (stepDef.id === "step2") buildDomains();
  if (stepDef.id === "step4") buildDreadChecks();
  if (stepDef.id === "summary") buildSummary();

  // Hydrate inputs
  hydrateInputs();

  // Bindings
  bindNavButtons();
  bindInputs();

  // Photo attach + nature audio (after DOM is in place)
  if (window.PhotoAttach) window.PhotoAttach.attachAll(STORAGE_KEY, app);
  attachStepAudio();
  if (window.NatureAudio) window.NatureAudio.scan(app);

  // Gate Next button on step completion
  if (window.StepValidation) {
    window.StepValidation.attach(app, state, STORAGE_KEY, REQUIRED_BY_STEP, () => STEPS[state.step].id);
  }

  // Scroll up
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  // Focus first input on form steps
  setTimeout(() => {
    const firstInput = app.querySelector("input[type='text'], input[type='email'], textarea");
    if (firstInput && state.step > 0 && state.step < STEPS.length - 1) {
      // Only focus textarea/text if not already filled
      // Skip auto-focus on touch devices - on mobile, .focus() scrolls the
      // page down to the input and pops the keyboard, before the user has
      // had a chance to read the question.
      var isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (!firstInput.value && !isCoarsePointer) firstInput.focus();
    }
  }, 100);
}

function buildDomains() {
  const grid = document.getElementById("domainsGrid");
  grid.innerHTML = DOMAINS.map(d => `
    <div class="domain">
      <div class="domain-title">${d.label}</div>
      <div class="domain-anchors">
        <span>Neglected, draining or misaligned</span>
        <span>Alive, aligned and meaningful</span>
      </div>
      <div class="scale" data-key="${d.key}" role="radiogroup" aria-label="${d.label}">
        ${[1,2,3,4,5,6,7,8,9,10].map(n => `
          <button type="button" class="scale-btn" data-value="${n}" aria-label="${n} out of 10">${n}</button>
        `).join("")}
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".scale-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.closest(".scale").dataset.key;
      const val = Number(btn.dataset.value);
      state.data[key] = val;
      btn.parentElement.querySelectorAll(".scale-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      saveState();
    });
  });

  // Hydrate selected scores
  DOMAINS.forEach(d => {
    const val = state.data[d.key];
    if (val) {
      const btn = grid.querySelector(`.scale[data-key="${d.key}"] .scale-btn[data-value="${val}"]`);
      if (btn) btn.classList.add("selected");
    }
  });
}

function buildDreadChecks() {
  const container = document.getElementById("dreadChecks");
  container.innerHTML = DREAD_CHECKS.map((text, i) => `
    <label class="check-row">
      <input type="checkbox" data-dread-check="${i}" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");

  container.querySelectorAll("input[data-dread-check]").forEach(cb => {
    if ((state.data.dread_checks || []).includes(cb.value)) cb.checked = true;
    cb.addEventListener("change", () => {
      const set = new Set(state.data.dread_checks || []);
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      state.data.dread_checks = Array.from(set);
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

  // Summary-specific buttons
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
  // Highlight the first unsatisfied field and focus it
  const firstUnfilled = app.querySelector("[data-key]:not([type='checkbox']):not(.scale-btn)");
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

  const scoresHtml = DOMAINS.map(d => {
    const val = state.data[d.key];
    const pct = val ? (val / 10) * 100 : 0;
    return `
      <div class="score-row">
        <div class="score-name">${d.label}</div>
        <div class="score-bar-wrap">
          <div class="score-bar"><div class="score-fill" style="width:${pct}%"></div></div>
          <div class="score-value">${val ?? "-"}</div>
        </div>
      </div>`;
  }).join("");

  const checks = state.data.dread_checks || [];
  const otherText = state.data.dread_other_box && state.data.dread_other_text?.trim()
    ? [state.data.dread_other_text.trim()] : [];
  const allTags = [...checks, ...otherText];

  body.innerHTML = `
    <div class="summary-card feature">
      <span class="summary-eyebrow">My Big Dread: clean version</span>
      <blockquote>${escapeHtml(state.data.big_dread_clean) || "<span class='summary-empty'>Not yet written.</span>"}</blockquote>
      ${ph("big_dread_clean")}
    </div>

    <div class="summary-card">
      <span class="summary-eyebrow">Step 1: The Drift Question</span>
      <h3>If I continue exactly as I am now, three to five years from now…</h3>
      <p>${escapeHtml(state.data.drift_question) || emptyText()}</p>
      ${ph("drift_question")}
    </div>

    <div class="summary-card">
      <span class="summary-eyebrow">Step 2: Life-Domain Reality Check</span>
      <h3>Where I feel <span class="italic">alive</span> and where I feel <span class="italic">neglected</span></h3>
      <div class="summary-scores">${scoresHtml}</div>
    </div>

    <div class="summary-card">
      <span class="summary-eyebrow">Step 3: What I Can No Longer Ignore</span>
      <h3>The area costing me the most</h3>
      <p>${escapeHtml(state.data.costing_most) || emptyText()}</p>
      ${ph("costing_most")}
      <h3 style="margin-top:18px;">The area I have been pretending is fine</h3>
      <p>${escapeHtml(state.data.pretending_fine) || emptyText()}</p>
      ${ph("pretending_fine")}
      <h3 style="margin-top:18px;">The pattern I am tired of repeating</h3>
      <p>${escapeHtml(state.data.pattern_repeating) || emptyText()}</p>
      ${ph("pattern_repeating")}
    </div>

    <div class="summary-card">
      <span class="summary-eyebrow">Step 4: Sentence Stems</span>
      <h3>Futures that scare me most</h3>
      ${allTags.length ? `<div class="tag-list">${allTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
      <h3 style="margin-top:22px;">I am afraid I will keep tolerating…</h3>
      <p>${escapeHtml(state.data.afraid_tolerating) || emptyText()}</p>
      ${ph("afraid_tolerating")}
      <h3 style="margin-top:18px;">I am afraid I will lose…</h3>
      <p>${escapeHtml(state.data.afraid_lose) || emptyText()}</p>
      ${ph("afraid_lose")}
      <h3 style="margin-top:18px;">I am afraid my relationships will become…</h3>
      <p>${escapeHtml(state.data.afraid_relationships) || emptyText()}</p>
      ${ph("afraid_relationships")}
    </div>

    <div class="summary-card">
      <span class="summary-eyebrow">Step 5: My Big Dread Statement</span>
      <h3>If nothing meaningful changes, I may slowly become someone who…</h3>
      <p>${escapeHtml(state.data.big_dread_paragraph) || emptyText()}</p>
      ${ph("big_dread_paragraph")}
    </div>

    <div class="summary-signoff">
      <p><em>Naming the future you do not want is a brave start.</em></p>
      <p>Much love,</p>
      <p class="signoff-name" style="font-size:22px;">Francois</p>
    </div>
  `;
}

function emptyText() {
  return `<span class="summary-empty">Left blank. You can go back and add this in.</span>`;
}

// ---------- PDF Download ----------
async function downloadPdf() {
  const btn = document.getElementById("downloadPdf");
  if (!btn) return;
  const name = (state.data.participant_name || "Big-Dream-Guide").trim().replace(/\s+/g, "-");
  try {
    await PgwPdf.export({
      containerSelector: ".summary",
      filename: `${name}-Name-the-Drift.pdf`,
      guideTitle: "Guide 1 · Name the Drift",
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
    body: "This will clear your answers from this device. You will not be able to undo this.",
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
