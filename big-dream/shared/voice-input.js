/* Voice typing for textareas.
 *
 * Adds a small mic button at the top-right corner of every <textarea class="textarea">.
 * Click to start speech-to-text, click again to stop. Recognised speech is appended
 * to whatever is already in the textarea (typed or previously dictated). An 'input'
 * event is fired so the existing app.js save logic captures it.
 *
 * Uses the browser's built-in Web Speech API. Works in Chrome, Safari (Mac + iOS),
 * Edge. Gracefully does nothing in Firefox or other browsers that lack support.
 *
 * Self-contained: just include this script on a page and it auto-attaches to any
 * matching textarea, including textareas added later via DOM updates.
 */
(function () {
  "use strict";

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // Do nothing in unsupported browsers.
    return;
  }

  function makeMicButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "voice-mic-btn";
    btn.setAttribute("aria-label", "Start voice typing");
    btn.setAttribute("title", "Voice typing: click to speak");
    btn.innerHTML =
      '<svg class="voice-mic-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"/>' +
      '<path d="M19 11a1 1 0 00-2 0 5 5 0 01-10 0 1 1 0 00-2 0 7 7 0 006 6.92V20H8a1 1 0 000 2h8a1 1 0 000-2h-3v-2.08A7 7 0 0019 11z"/>' +
      "</svg>" +
      '<span class="voice-mic-dot" aria-hidden="true"></span>';
    return btn;
  }

  function attachTo(textarea) {
    if (!textarea || textarea.dataset.voiceAttached === "1") return;
    textarea.dataset.voiceAttached = "1";

    // Wrap textarea so we can absolute-position the mic button over it.
    var wrap = document.createElement("div");
    wrap.className = "voice-wrap";
    var parent = textarea.parentNode;
    if (!parent) return;
    parent.insertBefore(wrap, textarea);
    wrap.appendChild(textarea);

    var btn = makeMicButton();
    wrap.appendChild(btn);

    var recognition = null;
    var baseText = "";

    function stop() {
      if (recognition) {
        try { recognition.stop(); } catch (e) { /* noop */ }
      }
    }

    function start() {
      try {
        recognition = new SR();
      } catch (e) {
        recognition = null;
        return;
      }
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        document.documentElement.lang || navigator.language || "en-US";

      // Snapshot the textarea's text BEFORE we start listening. New speech is
      // appended to this snapshot. The snapshot never changes during a session
      // - we rebuild the textarea from snapshot + event.results on every
      // onresult event, which is the only correct way (event.results is the
      // authoritative full list of results so far).
      baseText = textarea.value || "";
      if (baseText && !/\s$/.test(baseText)) {
        baseText += " ";
      }
      // `committedFinal` is the concatenation of all final results from the
      // CURRENT session. Used by onend to commit final text and discard any
      // unfinalised interim.
      var committedFinal = "";

      recognition.onresult = function (event) {
        var finalPart = "";
        var interimPart = "";
        // Rebuild from the full result list every time - do NOT use
        // event.resultIndex as an "only handle new ones" hint, because results
        // can transition from interim to final between events and we'd double-
        // count them.
        for (var i = 0; i < event.results.length; i++) {
          var result = event.results[i];
          var transcript = (result[0] && result[0].transcript) || "";
          if (result.isFinal) {
            finalPart += transcript;
          } else {
            interimPart += transcript;
          }
        }
        committedFinal = finalPart;
        textarea.value = baseText + finalPart + interimPart;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      };

      recognition.onend = function () {
        btn.classList.remove("listening");
        btn.setAttribute("aria-label", "Start voice typing");
        btn.setAttribute("title", "Voice typing: click to speak");
        recognition = null;
        // Drop any unfinalised interim - keep only the committed final text.
        textarea.value = (baseText + committedFinal).replace(/\s+$/, "");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      };

      recognition.onerror = function (event) {
        var err = event && event.error ? event.error : "unknown";
        if (err === "not-allowed" || err === "service-not-allowed") {
          alert(
            "To use voice typing, allow microphone access in your browser " +
              "settings, then click the mic again."
          );
        } else if (err === "no-speech" || err === "aborted") {
          // Silent - normal user flow (paused, then nothing heard).
        } else {
          console.warn("[voice-input] recognition error:", err);
        }
      };

      try {
        recognition.start();
        btn.classList.add("listening");
        btn.setAttribute("aria-label", "Stop voice typing");
        btn.setAttribute("title", "Listening: click to stop");
      } catch (e) {
        // start() throws if recognition is already started; ignore.
        console.warn("[voice-input] start failed:", e);
      }
    }

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (recognition) {
        stop();
      } else {
        start();
      }
    });
  }

  function scan(root) {
    root = root || document;
    var nodes = root.querySelectorAll("textarea.textarea");
    for (var i = 0; i < nodes.length; i++) attachTo(nodes[i]);
  }

  // Initial pass.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(); });
  } else {
    scan();
  }

  // Watch for new textareas added by the guide step renderer.
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type !== "childList" || !m.addedNodes || !m.addedNodes.length) continue;
      for (var j = 0; j < m.addedNodes.length; j++) {
        var node = m.addedNodes[j];
        if (!node || node.nodeType !== 1) continue;
        if (node.matches && node.matches("textarea.textarea")) {
          attachTo(node);
        } else if (node.querySelectorAll) {
          scan(node);
        }
      }
    }
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
