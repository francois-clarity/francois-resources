/* Photo attach - lets participants add photos of paper-journal pages
   next to any text input. Photos are downscaled and stored alongside
   the guide's state. Exposes window.PhotoAttach for the rest of the app. */

(function () {
  "use strict";

  // Storage shim - same dynamic-access pattern used in app.js to avoid
  // static iframe checks. Falls back gracefully.
  const storageKeyName = ["local", "Storage"].join("");
  const _ls = (function () { try { return window[storageKeyName]; } catch (e) { return null; } })();

  const MAX_W = 1200;          // px - long-edge cap for stored image
  const MAX_BYTES = 700 * 1024; // ~700kb per image after compression
  const MIME = "image/jpeg";
  const QUALITY = 0.78;

  // namespace + field key -> array of {id, dataUrl, ts}
  // Storage layout: <STORAGE_KEY>:photos = JSON { fieldKey: [...] }
  function photosStorageKey(ns) { return ns + ":photos"; }

  function readAllPhotos(ns) {
    if (!_ls) return {};
    try { return JSON.parse(_ls.getItem(photosStorageKey(ns)) || "{}"); }
    catch (e) { return {}; }
  }
  function writeAllPhotos(ns, obj) {
    if (!_ls) return;
    try { _ls.setItem(photosStorageKey(ns), JSON.stringify(obj)); }
    catch (e) {
      // Likely quota exceeded - try removing oldest photo
      const keys = Object.keys(obj);
      if (keys.length) {
        for (const k of keys) {
          if (obj[k] && obj[k].length) { obj[k].shift(); break; }
        }
        try { _ls.setItem(photosStorageKey(ns), JSON.stringify(obj)); }
        catch (e2) {
          alert("Photo storage is full. Please remove some photos to add new ones.");
        }
      }
    }
  }

  function getPhotos(ns, fieldKey) {
    const all = readAllPhotos(ns);
    return all[fieldKey] || [];
  }
  function setPhotos(ns, fieldKey, arr) {
    const all = readAllPhotos(ns);
    if (!arr || !arr.length) delete all[fieldKey];
    else all[fieldKey] = arr;
    writeAllPhotos(ns, all);
  }

  function downscale(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = () => {
        img.onerror = () => reject(new Error("Could not decode image"));
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return reject(new Error("Image has no dimensions"));
          const scale = Math.min(1, MAX_W / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          // White background - paper journals look better on white
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          // Iterative quality drop until under MAX_BYTES
          let q = QUALITY;
          let dataUrl = canvas.toDataURL(MIME, q);
          while (dataUrl.length * 0.75 > MAX_BYTES && q > 0.4) {
            q -= 0.08;
            dataUrl = canvas.toDataURL(MIME, q);
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function isMobile() {
    try {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && window.matchMedia("(pointer:coarse)").matches);
    } catch (e) { return false; }
  }

  // ---------- File picker (lets the user choose from camera or gallery) ----------
  function openFilePicker() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.position = "fixed";
      input.style.left = "-9999px";
      input.style.top = "-9999px";
      let settled = false;
      const finish = (val) => { if (settled) return; settled = true; try { input.remove(); } catch (e) {} resolve(val); };
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return finish(null);
        downscale(file).then(finish).catch((err) => {
          console.warn("Photo processing error:", err);
          alert("Could not process that photo. Try a different one.");
          finish(null);
        });
      });
      // If the user cancels, there's no 'change' event. We resolve null on next focus.
      const onFocus = () => {
        setTimeout(() => { if (!input.files || !input.files.length) finish(null); window.removeEventListener("focus", onFocus); }, 500);
      };
      window.addEventListener("focus", onFocus);
      document.body.appendChild(input);
      input.click();
    });
  }

  // ---------- Live camera modal (kept available but no longer used by default) ----------
  function openCameraModal() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "camera-overlay";
      overlay.innerHTML = `
        <div class="camera-stage">
          <video class="camera-video" autoplay playsinline muted></video>
          <canvas class="camera-canvas" style="display:none;"></canvas>
          <div class="camera-status">Starting camera…</div>
        </div>
        <div class="camera-controls">
          <button type="button" class="camera-cancel">Cancel</button>
          <button type="button" class="camera-shutter" aria-label="Take photo"><span></span></button>
          <button type="button" class="camera-flip" aria-label="Switch camera">↻</button>
        </div>
        <div class="camera-preview" style="display:none;">
          <img class="camera-preview-img" alt="Captured photo" />
          <div class="camera-preview-controls">
            <button type="button" class="camera-retake">Retake</button>
            <button type="button" class="camera-use">Use photo</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.body.style.overflow = "hidden";

      const video = overlay.querySelector(".camera-video");
      const canvas = overlay.querySelector(".camera-canvas");
      const status = overlay.querySelector(".camera-status");
      const shutter = overlay.querySelector(".camera-shutter");
      const cancel = overlay.querySelector(".camera-cancel");
      const flip = overlay.querySelector(".camera-flip");
      const stage = overlay.querySelector(".camera-stage");
      const previewWrap = overlay.querySelector(".camera-preview");
      const previewImg = overlay.querySelector(".camera-preview-img");
      const retake = overlay.querySelector(".camera-retake");
      const useBtn = overlay.querySelector(".camera-use");

      let stream = null;
      let facing = "environment"; // start with rear camera
      let lastCaptureDataUrl = null;

      function cleanup() {
        try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        overlay.remove();
        document.body.style.overflow = "";
      }

      function finish(dataUrl) {
        cleanup();
        resolve(dataUrl);
      }

      async function startStream() {
        status.textContent = "Starting camera…";
        status.style.display = "";
        try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        // Detect device orientation - if portrait, ask for taller-than-wide frames
        const portrait = window.innerHeight >= window.innerWidth;
        const want = portrait
          ? { width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } };
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: Object.assign({ facingMode: { ideal: facing } }, want),
            audio: false,
          });
          video.srcObject = stream;
          await video.play().catch(() => {});
          // Note: we never force-rotate. Browsers already display the camera
          // stream in the correct orientation - rotating it tips the preview
          // and the captured photo on its side.
          video.classList.remove("is-rotated");
          status.style.display = "none";
        } catch (err) {
          console.warn("Camera error:", err);
          let msg = "Could not access the camera.";
          if (err && err.name === "NotAllowedError") {
            msg = "Camera permission was blocked. Tap the lock or info icon in your browser's address bar, allow camera access for this site, then close and reopen this page.";
          } else if (err && err.name === "NotFoundError") {
            msg = "No camera was found on this device.";
          } else if (err && err.name === "NotReadableError") {
            msg = "The camera is being used by another app. Close other camera apps and try again.";
          } else if (err && err.message) {
            msg += " (" + err.message + ")";
          }
          status.textContent = msg;
          status.style.display = "";
        }
      }

      shutter.addEventListener("click", () => {
        if (!stream) return;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;
        // Compute the crop the user sees on screen (object-fit: cover).
        // The video element fills the stage; the source frame is scaled to
        // cover, so the visible region is a centered crop of the source.
        const rect = video.getBoundingClientRect();
        const dispW = rect.width || vw;
        const dispH = rect.height || vh;
        const sourceAspect = vw / vh;
        const dispAspect = dispW / dispH;
        let sx, sy, sw, sh;
        if (sourceAspect > dispAspect) {
          // Source is wider than display - crop left/right
          sh = vh;
          sw = Math.round(vh * dispAspect);
          sx = Math.round((vw - sw) / 2);
          sy = 0;
        } else {
          // Source is taller than display - crop top/bottom
          sw = vw;
          sh = Math.round(vw / dispAspect);
          sx = 0;
          sy = Math.round((vh - sh) / 2);
        }
        const cw = sw, ch = sh;
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
        // Now downscale to MAX_W with quality iteration
        let w = cw, h = ch;
        const s = Math.min(1, MAX_W / Math.max(w, h));
        w = Math.round(w * s); h = Math.round(h * s);
        const out = document.createElement("canvas");
        out.width = w; out.height = h;
        const octx = out.getContext("2d");
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, w, h);
        octx.drawImage(canvas, 0, 0, w, h);
        let q = QUALITY;
        let dataUrl = out.toDataURL(MIME, q);
        while (dataUrl.length * 0.75 > MAX_BYTES && q > 0.4) {
          q -= 0.08;
          dataUrl = out.toDataURL(MIME, q);
        }
        lastCaptureDataUrl = dataUrl;
        previewImg.src = dataUrl;
        stage.style.display = "none";
        overlay.querySelector(".camera-controls").style.display = "none";
        previewWrap.style.display = "";
      });

      retake.addEventListener("click", () => {
        previewWrap.style.display = "none";
        stage.style.display = "";
        overlay.querySelector(".camera-controls").style.display = "";
        lastCaptureDataUrl = null;
      });

      useBtn.addEventListener("click", () => {
        if (lastCaptureDataUrl) finish(lastCaptureDataUrl);
      });

      flip.addEventListener("click", () => {
        facing = (facing === "environment") ? "user" : "environment";
        startStream();
      });

      cancel.addEventListener("click", () => finish(null));

      // Close on escape (desktop testing)
      const keyHandler = (e) => { if (e.key === "Escape") { document.removeEventListener("keydown", keyHandler); finish(null); } };
      document.addEventListener("keydown", keyHandler);

      startStream();
    });
  }

  function renderField(container, ns, fieldKey, label) {
    const photos = getPhotos(ns, fieldKey);
    container.innerHTML = "";
    // Desktop: don't render photo UI at all
    if (!isMobile()) { container.style.display = "none"; return; }
    container.style.display = "";
    // Bar with button + count
    const bar = document.createElement("div");
    bar.className = "photo-bar";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "photo-add-btn";
    btn.innerHTML = '<span class="photo-icon" aria-hidden="true">📷</span> ' +
      (photos.length ? "Upload another photo" : "Upload a photo of your journal");
    bar.appendChild(btn);

    const hint = document.createElement("span");
    hint.className = "photo-hint";
    hint.textContent = photos.length
      ? (photos.length === 1 ? "1 photo attached" : photos.length + " photos attached")
      : "If you prefer writing, you can upload a photo of your journal here.";
    bar.appendChild(hint);
    container.appendChild(bar);

    // Thumbs
    const thumbs = document.createElement("div");
    thumbs.className = "photo-thumbs";
    container.appendChild(thumbs);

    function paintThumbs() {
      const list = getPhotos(ns, fieldKey);
      thumbs.innerHTML = "";
      list.forEach((p, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "photo-thumb";
        const img = document.createElement("img");
        img.src = p.dataUrl;
        img.alt = "Journal photo " + (idx + 1);
        wrap.appendChild(img);
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "photo-thumb-remove";
        rm.setAttribute("aria-label", "Remove photo");
        rm.innerHTML = "×";
        rm.onclick = function () {
          const arr = getPhotos(ns, fieldKey).filter(x => x.id !== p.id);
          setPhotos(ns, fieldKey, arr);
          notifyValidation(fieldKey);
          paintThumbs();
          // Update hint & button text
          hint.textContent = arr.length
            ? (arr.length === 1 ? "1 photo attached" : arr.length + " photos attached")
            : "If you prefer writing, you can upload a photo of your journal here.";
          btn.innerHTML = '<span class="photo-icon" aria-hidden="true">📷</span> ' +
            (arr.length ? "Upload another photo" : "Upload a photo of your journal");
        };
        wrap.appendChild(rm);
        thumbs.appendChild(wrap);
      });
    }
    paintThumbs();

    btn.onclick = async function () {
      btn.disabled = true;
      const oldHtml = btn.innerHTML;
      btn.innerHTML = '<span class="photo-icon" aria-hidden="true">⏳</span> Opening…';
      try {
        const dataUrl = await openFilePicker();
        if (dataUrl) {
          const arr = getPhotos(ns, fieldKey);
          arr.push({ id: uid(), dataUrl: dataUrl, ts: Date.now() });
          setPhotos(ns, fieldKey, arr);
          notifyValidation(fieldKey);
        }
      } catch (e) { console.warn("Photo upload failed:", e); }
      finally {
        btn.disabled = false;
        const arr = getPhotos(ns, fieldKey);
        btn.innerHTML = '<span class="photo-icon" aria-hidden="true">📷</span> ' +
          (arr.length ? "Upload another photo" : "Upload a photo of your journal");
        hint.textContent = arr.length
          ? (arr.length === 1 ? "1 photo attached" : arr.length + " photos attached")
          : "If you prefer writing, you can upload a photo of your journal here.";
        paintThumbs();
      }
    };
  }

  // After saving photos, notify the validation listener (which watches for
  // input/change events) that the field's "value" has effectively changed,
  // so the Next button enables without the user having to tap elsewhere.
  function notifyValidation(fieldKey) {
    const field = document.getElementById(fieldKey);
    if (field && field.dispatchEvent) {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Public API: scan DOM, attach to fields marked with data-photo (textarea or input[data-key])
  function attachAll(ns, root) {
    root = root || document;
    const fields = root.querySelectorAll("[data-photo][data-key]");
    fields.forEach(function (field) {
      const key = field.getAttribute("data-key");
      // Find or create a container right after the field
      let container = field.nextElementSibling;
      if (!container || !container.classList || !container.classList.contains("photo-attach")) {
        container = document.createElement("div");
        container.className = "photo-attach";
        field.parentNode.insertBefore(container, field.nextSibling);
      }
      renderField(container, ns, key, "");
    });
  }

  // For summary/PDF rendering
  function renderSummaryPhotos(ns, fieldKey) {
    const photos = getPhotos(ns, fieldKey);
    if (!photos.length) return "";
    const items = photos.map(function (p) {
      return '<div class="summary-photo"><img src="' + p.dataUrl + '" alt="Journal photo" /></div>';
    }).join("");
    return '<div class="summary-photos">' + items + '</div>';
  }

  function clearAll(ns) {
    if (!_ls) return;
    try { _ls.removeItem(photosStorageKey(ns)); } catch (e) {}
  }

  window.PhotoAttach = {
    attachAll: attachAll,
    getPhotos: getPhotos,
    setPhotos: setPhotos,
    renderSummaryPhotos: renderSummaryPhotos,
    clearAll: clearAll
  };
})();
