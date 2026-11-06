/* Reusable lead capture gate.
 *
 * Drop this script into any of Francois's Netlify-hosted assessments or
 * landing pages. On first visit it shows a modal asking for name + email +
 * "are you already on the list?" - submits to Mailchimp (Netlify Assessments
 * audience) tagged with a per-site SOURCE value so signups can be filtered
 * back to which assessment they came from. On returning visits it's silent
 * and just pre-fills any participant_name / participant_email inputs it finds.
 *
 * Per-site usage: before this script, set window.LEAD_CAPTURE_CONFIG.
 *
 *   <script>
 *     window.LEAD_CAPTURE_CONFIG = {
 *       mailchimpUrl: "https://francoisesterhuizen.us5.list-manage.com/subscribe/post?u=...&id=...&f_id=...",
 *       source: "big-dream-guides",     // unique per site
 *       title: "Before you begin",      // optional
 *       subtitle: "Tell me a little about yourself.", // optional
 *     };
 *   </script>
 *   <script src="shared/lead-capture.js"></script>
 *
 * Mailchimp embedded forms don't expose a JSON success/error path under CORS,
 * so this uses Mailchimp's documented JSONP endpoint (/subscribe/post-json).
 *
 * Storage: stores { name, email, isClient, source } in localStorage under
 * `francois_lead`. To reset for testing, run `LeadCapture.reset()` in the
 * browser console.
 */
(function () {
  "use strict";

  var config = window.LEAD_CAPTURE_CONFIG || {};
  var STORAGE_KEY = config.storageKey || "francois_lead";

  if (!config.mailchimpUrl || !config.source) {
    console.error("[lead-capture] missing required config (mailchimpUrl, source)");
    return;
  }

  // ---------- storage ----------
  function getLead() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function setLead(lead) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lead));
    } catch (e) { /* quota or disabled */ }
  }
  function resetLead() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // Public API for debugging or programmatic use.
  window.LeadCapture = {
    getLead: getLead,
    setLead: setLead,
    reset: resetLead,
  };

  // ---------- Mailchimp submission via JSONP ----------
  function submitToMailchimp(fields, callback) {
    var url = String(config.mailchimpUrl).replace(/\/post\?/, "/post-json?");
    var parts = [];
    for (var k in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, k)) {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(fields[k]));
      }
    }
    var cbName = "_mc_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e9);
    var fullUrl = url + "&" + parts.join("&") + "&c=" + cbName;

    var done = false;
    var script = document.createElement("script");

    function cleanup() {
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    function finish(err, response) {
      if (done) return;
      done = true;
      cleanup();
      callback(err, response);
    }

    window[cbName] = function (response) { finish(null, response); };
    script.onerror = function () { finish(new Error("network")); };
    setTimeout(function () { finish(new Error("timeout")); }, 12000);

    script.src = fullUrl;
    document.head.appendChild(script);
  }

  // ---------- pre-fill guide participant_name / participant_email ----------
  function prefillParticipantFields() {
    var lead = getLead();
    if (!lead) return;
    var nameInput = document.getElementById("participant_name");
    var emailInput = document.getElementById("participant_email");
    if (nameInput && !nameInput.value) {
      nameInput.value = lead.name || "";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (emailInput && !emailInput.value) {
      emailInput.value = lead.email || "";
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // ---------- UI ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        "\"": "&quot;", "'": "&#39;"
      }[c];
    });
  }

  function buildGate() {
    var title = config.title || "Before you begin";
    var subtitle = config.subtitle || "A few details, and you can begin.";
    var newLabel = config.newLabel || "No, I am new here";
    var clientLabel = config.clientLabel || "Yes, I am already on Francois's list";
    var radioLegend = config.radioLegend || "Are you already on my mailing list?";

    var gate = document.createElement("div");
    gate.id = "leadCaptureGate";
    gate.className = "lc-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "lc-title");
    gate.innerHTML =
      '<div class="lc-card">' +
        '<h2 id="lc-title" class="lc-title">' + escapeHtml(title) + '</h2>' +
        '<p class="lc-subtitle">' + escapeHtml(subtitle) + '</p>' +
        '<form id="leadCaptureForm" class="lc-form" novalidate>' +
          '<div class="lc-field">' +
            '<label class="lc-label" for="lc-name">Your name</label>' +
            '<input type="text" id="lc-name" class="lc-input" required autocomplete="name" />' +
          '</div>' +
          '<div class="lc-field">' +
            '<label class="lc-label" for="lc-email">Your email</label>' +
            '<input type="email" id="lc-email" class="lc-input" required autocomplete="email" inputmode="email" />' +
          '</div>' +
          '<fieldset class="lc-radio-group">' +
            '<legend class="lc-label">' + escapeHtml(radioLegend) + '</legend>' +
            '<label class="lc-radio">' +
              '<input type="radio" name="lc-client" value="new" checked />' +
              '<span>' + escapeHtml(newLabel) + '</span>' +
            '</label>' +
            '<label class="lc-radio">' +
              '<input type="radio" name="lc-client" value="client" />' +
              '<span>' + escapeHtml(clientLabel) + '</span>' +
            '</label>' +
          '</fieldset>' +
          '<p class="lc-error" id="lc-error" hidden></p>' +
          '<button type="submit" class="lc-submit">Begin <span class="arrow">→</span></button>' +
          '<p class="lc-fine">Your details are safe. Unsubscribe anytime.</p>' +
        '</form>' +
      '</div>';
    return gate;
  }

  function openGate() {
    if (document.getElementById("leadCaptureGate")) return;

    var gate = buildGate();
    document.body.appendChild(gate);
    document.body.classList.add("lc-locked");

    var nameInput = gate.querySelector("#lc-name");
    var emailInput = gate.querySelector("#lc-email");
    var form = gate.querySelector("#leadCaptureForm");
    var errorEl = gate.querySelector("#lc-error");
    var submitBtn = form.querySelector(".lc-submit");
    var submitBtnDefault = submitBtn.innerHTML;

    setTimeout(function () { nameInput.focus(); }, 50);

    function showError(text) {
      errorEl.textContent = text;
      errorEl.hidden = false;
    }
    function setSubmitting(submitting) {
      submitBtn.disabled = submitting;
      submitBtn.innerHTML = submitting ? "Saving…" : submitBtnDefault;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;

      var name = (nameInput.value || "").trim();
      var email = (emailInput.value || "").trim();
      var checked = form.querySelector('input[name="lc-client"]:checked');
      var isClient = checked && checked.value === "client";

      if (!name) {
        showError("Please enter your name.");
        nameInput.focus();
        return;
      }
      if (!isValidEmail(email)) {
        showError("Please enter a valid email address.");
        emailInput.focus();
        return;
      }

      var lead = {
        name: name,
        email: email,
        isClient: isClient,
        source: config.source,
        savedAt: new Date().toISOString(),
      };

      // Existing clients: don't push to Mailchimp, just save locally.
      if (isClient) {
        setLead(lead);
        closeGate(lead);
        return;
      }

      setSubmitting(true);

      var parts = name.split(/\s+/);
      var firstName = parts[0] || "";
      var lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";

      submitToMailchimp({
        EMAIL: email,
        FNAME: firstName,
        LNAME: lastName,
        SOURCE: config.source,
      }, function (err, response) {
        setSubmitting(false);

        if (err) {
          // Network or timeout - let them through, save locally, log it.
          console.warn("[lead-capture] submit failed:", err && err.message);
          setLead(lead);
          closeGate(lead);
          return;
        }

        var msg = (response && response.msg) || "";

        if (response && response.result === "success") {
          setLead(lead);
          closeGate(lead);
          return;
        }
        // "Already subscribed" is a soft success - they're effectively on the list.
        if (/already subscribed/i.test(msg) || /is already a list member/i.test(msg)) {
          setLead(lead);
          closeGate(lead);
          return;
        }
        // Real error: surface a clean version of Mailchimp's message.
        showError(msg.replace(/<[^>]*>/g, "") || "Could not save right now. Try again in a moment.");
      });
    });

    // Trap focus inside the modal while it's open.
    gate.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var focusable = gate.querySelectorAll(
        'input, button, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function closeGate(lead) {
    var gate = document.getElementById("leadCaptureGate");
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
    document.body.classList.remove("lc-locked");
    prefillParticipantFields();
    if (typeof config.onReady === "function") {
      try { config.onReady(lead); } catch (e) { /* user callback */ }
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ---------- init ----------
  function init() {
    var lead = getLead();
    if (lead && lead.email) {
      prefillParticipantFields();
      // Each guide step re-renders the DOM, so watch for new participant inputs.
      var observer = new MutationObserver(function () { prefillParticipantFields(); });
      observer.observe(document.body, { childList: true, subtree: true });
      return;
    }
    openGate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
