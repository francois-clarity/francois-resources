/* Step validation - gates the Next button on each guide step until the
   required inputs are filled. Either typed text OR an uploaded photo of
   the journal counts as completion for text-based prompts. */

(function () {
  // Returns true if the value is a meaningfully filled field.
  function hasText(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(v);
  }

  function hasPhoto(storageKey, fieldKey) {
    if (!window.PhotoAttach || !storageKey || !fieldKey) return false;
    try {
      const photos = window.PhotoAttach.getPhotos(storageKey, fieldKey);
      return Array.isArray(photos) && photos.length > 0;
    } catch (e) { return false; }
  }

  // A required key is satisfied if state.data[key] has text, OR a photo
  // exists for that key. Special cases handled by caller via rule objects.
  function keySatisfied(state, storageKey, rule) {
    if (typeof rule === "string") {
      return hasText(state.data[rule]) || hasPhoto(storageKey, rule);
    }
    if (rule && rule.type === "email") {
      const v = (state.data[rule.key] || "").trim();
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
    }
    if (rule && rule.type === "anyOf") {
      return rule.keys.some(k => hasText(state.data[k]) || hasPhoto(storageKey, k));
    }
    if (rule && rule.type === "allOf") {
      return rule.keys.every(k => hasText(state.data[k]) || hasPhoto(storageKey, k));
    }
    if (rule && rule.type === "checked") {
      const arr = state.data[rule.key];
      if (Array.isArray(arr) && arr.length >= (rule.min || 1)) return true;
      // An "Other" free-text entry also satisfies the group. The suggested
      // options live in state.data[rule.key] (an array), but the Other text
      // is stored in a separate field - pass its key as rule.otherTextKey.
      if (rule.otherTextKey && hasText(state.data[rule.otherTextKey])) return true;
      return false;
    }
    if (rule && rule.type === "scores") {
      // All keys must have a positive numeric value (0 = not answered)
      const min = (rule.min !== undefined) ? rule.min : 1;
      return rule.keys.every(k => Number.isFinite(state.data[k]) && state.data[k] >= min);
    }
    if (rule && rule.type === "custom") {
      try { return !!rule.check(state); } catch (e) { return false; }
    }
    return true;
  }

  // requiredForStep: array of rules. Step is valid only if ALL rules pass.
  function isStepValid(state, storageKey, rules) {
    if (!rules || rules.length === 0) return true;
    return rules.every(r => keySatisfied(state, storageKey, r));
  }

  // When the user types into a "Other:" companion text input (e.g.
  // `dread_other_text`), auto-tick the matching `dread_other_box` checkbox
  // so the answer counts as a selection and the Next button enables. Without
  // this, participants who only filled the Other text without manually
  // ticking the box got stuck unable to continue.
  function autoTickOtherCheckbox(target) {
    if (!target || target.tagName !== "INPUT") return;
    const id = target.id || "";
    const m = id.match(/^(.+)_other_text$/);
    if (!m) return;
    const box = document.getElementById(m[1] + "_other_box");
    if (!box || box.type !== "checkbox") return;
    const filled = (target.value || "").trim().length > 0;
    if (filled && !box.checked) {
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (!filled && box.checked) {
      box.checked = false;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Wires gating into a guide. Pass:
  //   - root: container element (usually document.getElementById("app"))
  //   - state: the guide's state object (with .step and .data)
  //   - storageKey: STORAGE_KEY for photo lookup
  //   - rulesByStepId: map of step id -> array of rule strings or rule objects
  //   - getStepId: () => current step id
  function attach(root, state, storageKey, rulesByStepId, getStepId) {
    function update() {
      const id = getStepId();
      const rules = rulesByStepId[id] || [];
      const valid = isStepValid(state, storageKey, rules);
      root.querySelectorAll("[data-action='next']").forEach(btn => {
        btn.disabled = !valid;
        btn.classList.toggle("is-disabled", !valid);
        btn.setAttribute("aria-disabled", String(!valid));
        if (!valid) {
          btn.title = "Please complete this step before continuing.";
        } else {
          btn.removeAttribute("title");
        }
        // A disabled button with no explanation leaves participants stuck
        // (they fill the visible fields and don't realise others above are
        // still required). Show an inline hint above the action buttons
        // whenever the step is incomplete.
        const actions = btn.closest(".actions") || btn.parentNode;
        if (actions && actions.parentNode) {
          let hint = actions.parentNode.querySelector(".step-incomplete-hint");
          if (!valid) {
            if (!hint) {
              hint = document.createElement("p");
              hint.className = "step-incomplete-hint";
              hint.setAttribute("role", "status");
              hint.textContent =
                "Please complete all the questions on this page to continue. Some may be further up.";
              actions.parentNode.insertBefore(hint, actions);
            }
            hint.hidden = false;
          } else if (hint) {
            hint.hidden = true;
          }
        }
      });
    }

    // Re-check on any input/change/click within the step
    const events = ["input", "change", "click"];
    events.forEach(ev => {
      root.addEventListener(ev, (e) => {
        if (ev === "input") autoTickOtherCheckbox(e.target);
        // micro-delay so state.data is updated before we re-check
        setTimeout(update, 0);
      }, true);
    });

    // Initial state
    update();

    return { update };
  }

  window.StepValidation = {
    isStepValid: isStepValid,
    keySatisfied: keySatisfied,
    hasText: hasText,
    hasPhoto: hasPhoto,
    attach: attach
  };
})();
