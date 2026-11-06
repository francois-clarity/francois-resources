/* Page-level nature sound control.
 *
 * Replaces the previous design (a play button on every image) with a single
 * dropdown in the top bar of each guide. Four options: Sound off + three
 * ambient loops. One track plays at a time, with a gentle fade-in/out.
 *
 * Audio files live at /shared/audio/*.mp3.
 *
 * NatureAudio.scan() is kept as a no-op so the existing call sites in each
 * guide's app.js don't break.
 */
(function () {
  "use strict";

  var FADE_MS = 600;
  var VOLUME = 0.45;
  var AUDIO_BASE = "/big-dream/shared/audio/";

  // Dropdown options. The first (empty value) means "off".
  // ocean-waves.ogg is from Wikimedia Commons, CC BY 3.0 (Hugo Carvalho,
  // "Oceanwavescrushing.ogg"). Add credit on the site footer when there's
  // time. OGG audio is supported on all browsers we target (Chrome, Safari
  // 14.5+, Firefox, Edge - including iOS Safari).
  var SOUNDS = [
    { value: "",                  label: "Sound off"    },
    { value: "forest-birds.mp3",  label: "Forest birds" },
    { value: "breeze.mp3",        label: "Breeze"       },
    { value: "ocean-waves.ogg",   label: "Ocean waves"  },
  ];

  var currentAudio = null;

  // Each audio gets its OWN fade timer attached to it. The earlier version
  // used a single module-level timer, which meant: pick A → fade in; pick B
  // → A's fade-out timer was clobbered by B's fade-in timer, so A never
  // got pause()'d. Result: multiple tracks playing at once with no way to
  // stop them. Per-audio timers fix that.
  function fadeAudio(audio, targetVol, onDone) {
    if (audio._fadeTimer) {
      clearInterval(audio._fadeTimer);
      audio._fadeTimer = null;
    }
    var startVol = audio.volume;
    var steps = 12;
    var i = 0;
    audio._fadeTimer = setInterval(function () {
      i++;
      var v = startVol + (targetVol - startVol) * (i / steps);
      try { audio.volume = Math.max(0, Math.min(1, v)); } catch (e) {}
      if (i >= steps) {
        clearInterval(audio._fadeTimer);
        audio._fadeTimer = null;
        if (onDone) onDone();
      }
    }, FADE_MS / steps);
  }

  function stopCurrent() {
    if (!currentAudio) return;
    var audio = currentAudio;
    currentAudio = null;
    fadeAudio(audio, 0, function () {
      try { audio.pause(); } catch (e) {}
    });
  }

  function playSound(filename) {
    stopCurrent();
    var audio = new Audio(AUDIO_BASE + filename);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = "auto";
    var p = audio.play();
    if (p && p.catch) {
      p.catch(function (err) {
        // Most browsers require a user gesture before playing. The user has
        // just changed the dropdown, so this should normally work - but log
        // anything weird.
        console.warn("[nature-audio] play blocked:", err);
      });
    }
    currentAudio = audio;
    fadeAudio(audio, VOLUME);
  }

  function makeIconSvg() {
    return (
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
        '<path d="M11 5L6 9H2.5v6H6l5 4V5z" fill="currentColor"/>' +
        '<path d="M14.5 8.5a4 4 0 010 7M17 6a7 7 0 010 12"' +
          ' fill="none" stroke="currentColor" stroke-width="1.8"' +
          ' stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
    );
  }

  function inject() {
    var topbar = document.getElementById("topbar");
    if (!topbar) return;
    if (topbar.querySelector(".sound-control")) return;
    var inner = topbar.querySelector(".topbar-inner") || topbar;

    var wrap = document.createElement("div");
    wrap.className = "sound-control";

    var optionsHtml = SOUNDS.map(function (s) {
      return '<option value="' + s.value + '">' + s.label + '</option>';
    }).join("");

    wrap.innerHTML =
      '<span class="sound-icon">' + makeIconSvg() + '</span>' +
      '<select id="natureSoundSelect" class="sound-select"' +
        ' aria-label="Background nature sound">' +
        optionsHtml +
      '</select>';

    inner.appendChild(wrap);

    var select = wrap.querySelector("select");
    select.addEventListener("change", function () {
      var val = select.value;
      if (val) {
        playSound(val);
      } else {
        stopCurrent();
      }
    });

    // Stop the audio when the page is being hidden/unloaded so it doesn't
    // briefly leak into the next page load.
    window.addEventListener("pagehide", function () { stopCurrent(); });
  }

  // Old API (called by each guide's app.js after rendering a step). The
  // per-image play button design has been removed; this is a no-op now.
  window.NatureAudio = {
    scan: function () { /* no-op */ },
    stop: stopCurrent,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

  // Topbar is rendered by the guide's app.js and may appear after our first
  // inject attempt - watch for it.
  var observer = new MutationObserver(function () { inject(); });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
