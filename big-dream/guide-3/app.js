/* ============================================================
   Big Dream Guide 3, Clarify the Big Dream
   ============================================================ */

const STORAGE_KEY = "bigDreamGuide3:v1";

// Storage shim - persistent if available, in-memory fallback otherwise.
const memStore = {};
const storage = (() => {
  try {
    const g = (new Function("return this"))();
    const ls = g[["local", "Storage"].join("")];
    const probe = "__bdg3_probe__";
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

const DOMAIN_OPTIONS = [
  "Inner life (faith, mind, emotions)",
  "Health and energy",
  "Closest relationships (partner, children, family)",
  "Family and friendships",
  "Work / business / calling",
  "Money and lifestyle",
  "Contribution and service",
  "Growth and learning",
  "Fun and aliveness"
];

const COMES_ALIVE_OPTIONS = [
  "My voice",
  "My creativity",
  "My leadership",
  "My courage",
  "My joy",
  "My honesty",
  "My body",
  "My mind",
  "My faith",
  "My role as a parent",
  "My role as a partner",
  "My role as a friend",
  "My warmth",
  "My discipline"
];

const KIND_OF_PERSON_OPTIONS = [
  "Calmer",
  "Braver",
  "More present",
  "More disciplined",
  "More rested",
  "More boundaried",
  "More honest",
  "More creative",
  "More decisive",
  "More compassionate",
  "More focused",
  "More playful"
];

const ALIGNMENT_QUESTIONS = [
  { key: "align1_choosing",       label: "1. This Big Dream feels chosen, not forced." },
  { key: "align2_energy",         label: "2. When I imagine this dream, my body feels more energy than fear." },
  { key: "align3_growth",         label: "3. This dream asks me to grow, not to prove." },
  { key: "align4_relationships",  label: "4. This dream improves my closest relationships, it does not damage them." },
  { key: "align5_direction",      label: "5. This dream gives me direction even when life is difficult." },
  { key: "align6_honest",         label: "6. This dream is more honest than impressive." },
  { key: "align7_influence",      label: "7. I would still want this dream if no one was watching." }
];

const STEPS = [
  { id: "welcome",      tpl: "tpl-welcome",       label: "Welcome" },
  { id: "examples",     tpl: "tpl-examples",      label: "Examples & method" },
  { id: "direction",    tpl: "tpl-direction",     label: "Direction" },
  { id: "domains",      tpl: "tpl-domains",       label: "Life domains" },
  { id: "observable",   tpl: "tpl-observable",    label: "Make it observable" },
  { id: "meaning",      tpl: "tpl-meaning",       label: "Meaning filter" },
  { id: "alignment",    tpl: "tpl-alignment",     label: "Alignment test" },
  { id: "draft",        tpl: "tpl-draft",         label: "Draft" },
  { id: "clean",        tpl: "tpl-clean",         label: "Clean version" },
  { id: "one-sentence", tpl: "tpl-one-sentence",  label: "One sentence" },
  { id: "summary",      tpl: "tpl-summary",       label: "Summary" }
];

// ---------- State ----------
const defaultState = () => ({
  step: 0,
  data: {
    participant_name: "",
    participant_email: "",
    bigDream_v1: "",
    domains_top3: [],
    domains_other_box: false,
    domains_other_text: "",
    domain1_text: "",
    domain2_text: "",
    domain3_text: "",
    normal_week: "",
    stop_tolerating: "",
    take_care: "",
    comes_alive: [],
    comes_alive_other_box: false,
    comes_alive_other_text: "",
    kind_of_person: [],
    kind_of_person_other_box: false,
    kind_of_person_other_text: "",
    matters_because: "",
    people_benefit: "",
    align1_choosing: 0,
    align2_energy: 0,
    align3_growth: 0,
    align4_relationships: 0,
    align5_direction: 0,
    align6_honest: 0,
    align7_influence: 0,
    direction_text: "",
    observable_text: "",
    meaning_text: "",
    big_dream_paragraph: "",
    bigDream_one_sentence: ""
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

const AUDIO_MAP = {
  hero_horizon: "horizon.mp3",
  characters: "forest-birds.mp3",
  method: "breeze.mp3",
  direction: "horizon.mp3",
  domains: "breeze.mp3",
  observable: "breeze.mp3",
  meaning: "horizon.mp3",
  alignment: "horizon.mp3",
  summary: "horizon.mp3"
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

  topbar.hidden = state.step === 0;
  const pct = Math.round((state.step / (STEPS.length - 1)) * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Step ${state.step + 1} of ${STEPS.length}`;

  if (stepDef.id === "domains")   buildDomains();
  if (stepDef.id === "meaning")   buildMeaning();
  if (stepDef.id === "alignment") buildAlignment();
  if (stepDef.id === "summary")   buildSummary();

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

function buildDomains() {
  const grid = document.getElementById("domainsChecks");
  grid.innerHTML = DOMAIN_OPTIONS.map((text) => `
    <label class="check-row">
      <input type="checkbox" data-group="domains_top3" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");

  const counter = document.getElementById("domainsCounter");
  const updateCounter = () => {
    const n = (state.data.domains_top3 || []).length;
    counter.textContent = `${n} of 3 selected`;
    counter.classList.toggle("warn", n > 3);
  };
  hydrateGroup("domains_top3");
  updateCounter();
  app.querySelectorAll('input[data-group="domains_top3"]').forEach(cb => {
    cb.addEventListener("change", () => {
      const set = new Set(state.data.domains_top3 || []);
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      state.data.domains_top3 = Array.from(set);
      saveState();
      updateCounter();
    });
  });
}

function buildMeaning() {
  const ca = document.getElementById("comesAliveChecks");
  ca.innerHTML = COMES_ALIVE_OPTIONS.map((text) => `
    <label class="check-row compact">
      <input type="checkbox" data-group="comes_alive" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");
  hydrateGroup("comes_alive");
  bindGroup("comes_alive");

  const kp = document.getElementById("kindOfPersonChecks");
  kp.innerHTML = KIND_OF_PERSON_OPTIONS.map((text) => `
    <label class="check-row compact">
      <input type="checkbox" data-group="kind_of_person" value="${escapeAttr(text)}" />
      <span>${text}</span>
    </label>
  `).join("");
  hydrateGroup("kind_of_person");
  bindGroup("kind_of_person");
}

function buildAlignment() {
  const container = document.getElementById("alignmentQuestions");
  container.innerHTML = ALIGNMENT_QUESTIONS.map(q => `
    <div class="alignment-q">
      <div class="field-label">${q.label}</div>
      <div class="alignment-scale" role="radiogroup" aria-label="${q.label}">
        ${[1,2,3,4,5].map(n => `
          <label class="alignment-pill">
            <input type="radio" name="${q.key}" value="${n}" data-radio="${q.key}" />
            <span>${n}</span>
          </label>
        `).join("")}
      </div>
      <div class="alignment-scale-legend"><span>not at all</span><span>deeply true</span></div>
    </div>
  `).join("");

  const updateScore = () => {
    const total = ALIGNMENT_QUESTIONS.reduce((sum, q) => sum + (Number(state.data[q.key]) || 0), 0);
    const out = document.getElementById("alignmentScore");
    if (out) out.textContent = String(total);
  };

  ALIGNMENT_QUESTIONS.forEach(q => {
    const val = state.data[q.key];
    if (val) {
      const radio = container.querySelector(`input[name="${q.key}"][value="${val}"]`);
      if (radio) radio.checked = true;
    }
  });
  updateScore();

  container.querySelectorAll("input[data-radio]").forEach(r => {
    r.addEventListener("change", () => {
      state.data[r.dataset.radio] = Number(r.value);
      saveState();
      updateScore();
    });
  });
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

const REQUIRED_BY_STEP = {
  welcome:       ["participant_name", { type: "email", key: "participant_email" }],
  examples:      [],
  direction:     ["bigDream_v1"],
  domains:       [{ type: "checked", key: "domains_top3", min: 1, otherTextKey: "domains_other_text" }, "domain1_text", "domain2_text", "domain3_text"],
  observable:    ["normal_week", "stop_tolerating", "take_care"],
  meaning:       [{ type: "checked", key: "comes_alive", min: 1, otherTextKey: "comes_alive_other_text" }, { type: "checked", key: "kind_of_person", min: 1, otherTextKey: "kind_of_person_other_text" }, "matters_because", "people_benefit"],
  alignment:     [{ type: "scores", keys: ["align1_choosing", "align2_energy", "align3_growth", "align4_relationships", "align5_direction", "align6_honest", "align7_influence"] }],
  draft:         ["direction_text", "observable_text", "meaning_text"],
  clean:         ["big_dream_paragraph"],
  "one-sentence":["bigDream_one_sentence"],
  summary:       []
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
function ph(key) { return window.PhotoAttach ? window.PhotoAttach.renderSummaryPhotos(STORAGE_KEY, key) : ""; }

function buildSummary() {
  const sub = document.getElementById("summarySubtitle");
  const name = (state.data.participant_name || "").trim();
  if (name) sub.textContent = `An insight document for ${name} to keep.`;

  const body = document.getElementById("summaryBody");

  const oneSentence = state.data.bigDream_one_sentence?.trim();
  const paragraph = state.data.big_dream_paragraph?.trim();

  // Domains
  const domains = [...(state.data.domains_top3 || [])];
  if (state.data.domains_other_box && state.data.domains_other_text?.trim()) {
    domains.push(state.data.domains_other_text.trim());
  }
  const domainTextRows = [
    state.data.domain1_text?.trim(),
    state.data.domain2_text?.trim(),
    state.data.domain3_text?.trim()
  ].map((t, i) => ({ domain: domains[i], text: t })).filter(d => d.domain || d.text);

  // Meaning lists
  const comesAlive = [...(state.data.comes_alive || [])];
  if (state.data.comes_alive_other_box && state.data.comes_alive_other_text?.trim()) {
    comesAlive.push(state.data.comes_alive_other_text.trim());
  }
  const kindOfPerson = [...(state.data.kind_of_person || [])];
  if (state.data.kind_of_person_other_box && state.data.kind_of_person_other_text?.trim()) {
    kindOfPerson.push(state.data.kind_of_person_other_text.trim());
  }

  // Alignment score
  const alignTotal = ALIGNMENT_QUESTIONS.reduce(
    (sum, q) => sum + (Number(state.data[q.key]) || 0), 0
  );
  const alignRows = ALIGNMENT_QUESTIONS.map(q => `
    <div class="energy-summary-row">
      <div class="energy-summary-label">${escapeHtml(q.label)}</div>
      <div class="energy-summary-value">${state.data[q.key] ? `${state.data[q.key]} / 5` : `<span class="summary-empty">No answer</span>`}</div>
    </div>
  `).join("");

  body.innerHTML = `
    <div class="summary-card feature future-card">
      <span class="summary-eyebrow">My Big Dream: one sentence</span>
      <blockquote>${oneSentence ? escapeHtml(oneSentence) : "<span class='summary-empty'>Not yet written.</span>"}</blockquote>
      ${ph("bigDream_one_sentence")}
    </div>

    ${paragraph ? `
      <div class="summary-card">
        <span class="summary-eyebrow">My Big Dream: clean paragraph</span>
        <p>${escapeHtml(paragraph)}</p>
        ${ph("big_dream_paragraph")}
      </div>
    ` : ""}

    <div class="summary-section-divider"><span>The direction</span></div>

    <div class="summary-card future-card future-2">
      <span class="summary-eyebrow">Step 1: Direction I am choosing</span>
      <p>${state.data.bigDream_v1?.trim() ? escapeHtml(state.data.bigDream_v1) : emptyText()}</p>
      ${ph("bigDream_v1")}
    </div>

    <div class="summary-card future-card future-3">
      <span class="summary-eyebrow">Step 2: Across life domains</span>
      <h3>The three domains that matter most</h3>
      ${domains.length ? `<div class="tag-list">${domains.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
      ${domainTextRows.length ? `
        <div class="future-section" style="margin-top:18px;">
          <div class="future-section-label">How the dream shows up in each</div>
          ${domainTextRows.map(d => `
            <p>${d.domain ? `<strong>${escapeHtml(d.domain)}:</strong> ` : ""}${d.text ? escapeHtml(d.text) : `<span class="summary-empty">Left blank.</span>`}</p>
          `).join("")}
        </div>
      ` : ""}
    </div>

    <div class="summary-card future-card future-1">
      <span class="summary-eyebrow">Step 3: Made observable</span>
      <div class="future-section">
        <div class="future-section-label">A normal week in this dream</div>
        <p>${state.data.normal_week?.trim() ? escapeHtml(state.data.normal_week) : emptyText()}</p>
        ${ph("normal_week")}
      </div>
      <div class="future-section">
        <div class="future-section-label">I have stopped tolerating</div>
        <p>${state.data.stop_tolerating?.trim() ? escapeHtml(state.data.stop_tolerating) : emptyText()}</p>
        ${ph("stop_tolerating")}
      </div>
      <div class="future-section">
        <div class="future-section-label">I take care of</div>
        <p>${state.data.take_care?.trim() ? escapeHtml(state.data.take_care) : emptyText()}</p>
        ${ph("take_care")}
      </div>
    </div>

    <div class="summary-card future-card future-2">
      <span class="summary-eyebrow">Step 4: Meaning filter</span>
      <h3>What comes alive in me</h3>
      ${comesAlive.length ? `<div class="tag-list">${comesAlive.map(t => `<span class="tag tag-value">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
      <h3 style="margin-top:18px;">The person I am becoming</h3>
      ${kindOfPerson.length ? `<div class="tag-list">${kindOfPerson.map(t => `<span class="tag tag-warm">${escapeHtml(t)}</span>`).join("")}</div>` : `<p>${emptyText()}</p>`}
      ${state.data.matters_because?.trim() ? `
        <div class="future-section" style="margin-top:18px;">
          <div class="future-section-label">This matters because</div>
          <p>${escapeHtml(state.data.matters_because)}</p>
          ${ph("matters_because")}
        </div>
      ` : ""}
      ${state.data.people_benefit?.trim() ? `
        <div class="future-section">
          <div class="future-section-label">Who benefits</div>
          <p>${escapeHtml(state.data.people_benefit)}</p>
          ${ph("people_benefit")}
        </div>
      ` : ""}
    </div>

    <div class="summary-card future-card future-3">
      <span class="summary-eyebrow">Step 5: Alignment test</span>
      <div class="alignment-summary-score">
        <span class="alignment-score-label">My alignment score</span>
        <span class="alignment-score-value">${alignTotal} <span class="alignment-score-max">/ 35</span></span>
      </div>
      <div class="energy-summary-grid" style="margin-top:14px;">${alignRows}</div>
    </div>

    ${state.data.direction_text?.trim() || state.data.observable_text?.trim() || state.data.meaning_text?.trim() ? `
      <div class="summary-card">
        <span class="summary-eyebrow">Step 6: Draft statement</span>
        ${state.data.direction_text?.trim() ? `<h3>The direction I am choosing</h3><p>${escapeHtml(state.data.direction_text)}</p>${ph("direction_text")}` : ""}
        ${state.data.observable_text?.trim() ? `<h3 style="margin-top:14px;">What this looks like in my actual life</h3><p>${escapeHtml(state.data.observable_text)}</p>${ph("observable_text")}` : ""}
        ${state.data.meaning_text?.trim() ? `<h3 style="margin-top:14px;">Why this matters and who I am becoming</h3><p>${escapeHtml(state.data.meaning_text)}</p>${ph("meaning_text")}` : ""}
      </div>
    ` : ""}

    <div class="summary-signoff">
      <p><em>A clear Big Dream changes the shape of your day.</em></p>
      <p>Much love,</p>
      <p class="signoff-name" style="font-size:22px;">Francois</p>
      <p class="tiny-note">Francois Esterhuizen · <a href="https://francoisesterhuizen.com">francoisesterhuizen.com</a></p>
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
      filename: `${name}-Clarify-the-Big-Dream.pdf`,
      guideTitle: "Guide 3 · Clarify the Big Dream",
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
    body: "This will clear your answers for Guide 3 on this device. You will not be able to undo this.",
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
