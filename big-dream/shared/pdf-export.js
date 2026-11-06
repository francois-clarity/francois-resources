/* ============================================================
   Shared PDF export: smart page breaks, branded header & footer
   ============================================================
   Usage from a guide:
     await PgwPdf.export({
       containerSelector: ".summary",
       filename: "Francois-Name-the-Drift.pdf",
       guideTitle: "Name the Drift",
     });
*/
(function (global) {
  "use strict";

  // Brand constants shown on every page
  var BRAND_NAME = "Francois Esterhuizen";
  var BRAND_TAGLINE = "Personal Growth Weekly";
  var BRAND_URL_TOP = "francoisesterhuizen.com";
  var BRAND_URL_BOTTOM = "getclarity.co.za";
  // Calm teal accent matching the site (Nexus palette teal-600)
  var TEAL_R = 47, TEAL_G = 106, TEAL_B = 98;     // #2f6a62
  var INK_R = 28, INK_G = 38, INK_B = 41;          // #1c2629
  var MUTED_R = 122, MUTED_G = 138, MUTED_B = 139; // #7a8a8b

  // Atomic block selectors - never split across pages
  var ATOMIC_SELECTORS = [
    ".summary-card",
    ".section-card",
    ".life-wheel",
    ".process-grid",
    ".process-row",
    ".future-card",
    ".summary-photos",
    ".summary-photo",
    ".values-grid",
    ".value-pill",
    ".scale-row",
    ".wheel-row",
    ".dream-statement",
    ".horizon-card",
    ".ifthen-card",
    ".voice-card",
    ".step-block",
    ".reflection-card",
    ".result-card",
    ".summary-next-cta",
    ".tag-list",
  ];

  function drawHeader(pdf, pageW, margin, headerH) {
    // Subtle accent dot on the left
    pdf.setFillColor(TEAL_R, TEAL_G, TEAL_B);
    pdf.circle(margin + 4, headerH / 2 + 4, 3.5, "F");

    // Name (Lora-like via jsPDF default Times)
    pdf.setFont("times", "normal");
    pdf.setFontSize(13);
    pdf.setTextColor(INK_R, INK_G, INK_B);
    pdf.text(BRAND_NAME, margin + 16, headerH / 2 + 6);

    // Tagline on the right
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(MUTED_R, MUTED_G, MUTED_B);
    var rightX = pageW - margin;
    pdf.text(BRAND_TAGLINE, rightX, headerH / 2 + 6, { align: "right" });

    // Hairline under header
    pdf.setDrawColor(216, 210, 196); // soft tan #d8d2c4
    pdf.setLineWidth(0.4);
    pdf.line(margin, headerH + 4, pageW - margin, headerH + 4);
  }

  function drawFooter(pdf, pageW, pageH, margin, footerH, pageNum, pageTotal, guideTitle) {
    var y = pageH - footerH;
    // Hairline above footer
    pdf.setDrawColor(216, 210, 196);
    pdf.setLineWidth(0.4);
    pdf.line(margin, y, pageW - margin, y);

    // Both URLs centered, separated by a dot
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(TEAL_R, TEAL_G, TEAL_B);
    var midY = y + 14;
    var cx = pageW / 2;
    var sep = "  ·  ";
    var topW = pdf.getTextWidth(BRAND_URL_TOP);
    var sepW = pdf.getTextWidth(sep);
    var botW = pdf.getTextWidth(BRAND_URL_BOTTOM);
    var totalW = topW + sepW + botW;
    var startX = cx - totalW / 2;
    pdf.text(BRAND_URL_TOP, startX, midY);
    pdf.setTextColor(MUTED_R, MUTED_G, MUTED_B);
    pdf.text(sep, startX + topW, midY);
    pdf.setTextColor(TEAL_R, TEAL_G, TEAL_B);
    pdf.text(BRAND_URL_BOTTOM, startX + topW + sepW, midY);

    // Guide title (left) + page number (right) in muted ink
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(MUTED_R, MUTED_G, MUTED_B);
    if (guideTitle) pdf.text(guideTitle, margin, midY + 12);
    pdf.text("Page " + pageNum + " of " + pageTotal, pageW - margin, midY + 12, { align: "right" });
  }

  /**
   * Compute "safe" Y break points: the bottom edge of every non-atomic top-level block,
   * and the bottom edge of each atomic block (so we never break inside one).
   * All measurements are in CSS pixels relative to the rendered clone container.
   */
  function collectBreakpoints(container) {
    var rect = container.getBoundingClientRect();
    var baseTop = rect.top;
    var points = new Set();
    points.add(0);

    // Collect all atomic blocks within the container
    var atomicEls = container.querySelectorAll(ATOMIC_SELECTORS.join(","));
    var atomicRanges = [];
    atomicEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var top = r.top - baseTop;
      var bot = r.bottom - baseTop;
      atomicRanges.push({ top: top, bot: bot });
    });

    // Also consider direct children of the container - their tops are great break candidates
    Array.prototype.forEach.call(container.children, function (el) {
      var r = el.getBoundingClientRect();
      points.add(r.top - baseTop);
      points.add(r.bottom - baseTop);
    });

    // Add every atomic block's top and bottom
    atomicRanges.forEach(function (a) {
      points.add(a.top);
      points.add(a.bot);
    });

    // Convert to sorted array, dedupe, round
    var arr = Array.from(points).map(function (n) { return Math.max(0, Math.round(n)); });
    arr.sort(function (a, b) { return a - b; });
    var dedup = [];
    for (var i = 0; i < arr.length; i++) {
      if (i === 0 || arr[i] !== arr[i - 1]) dedup.push(arr[i]);
    }
    return { points: dedup, atomic: atomicRanges };
  }

  /**
   * Given a target page bottom in CSS px, return the highest breakpoint at or before
   * the target that does not fall inside an atomic block.
   */
  function snapBreak(breakpoints, atomicRanges, target, minY) {
    function insideAtomic(y) {
      for (var i = 0; i < atomicRanges.length; i++) {
        var a = atomicRanges[i];
        if (y > a.top + 1 && y < a.bot - 1) return true;
      }
      return false;
    }
    // Find candidate ≤ target
    var best = null;
    for (var i = breakpoints.length - 1; i >= 0; i--) {
      var p = breakpoints[i];
      if (p <= target && p > minY + 20 && !insideAtomic(p)) {
        best = p;
        break;
      }
    }
    return best;
  }

  async function exportPdf(opts) {
    opts = opts || {};
    var containerSelector = opts.containerSelector || ".summary";
    var filename = opts.filename || "guide.pdf";
    var guideTitle = opts.guideTitle || "";

    var btn = opts.button || null;
    var originalLabel = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Preparing your insight document…"; }

    // Off-screen clone sized to print width
    var printContainer = document.createElement("div");
    printContainer.style.cssText = "position:fixed;left:-10000px;top:0;width:720px;background:#ffffff;";
    printContainer.className = "printing";
    var src = document.querySelector(containerSelector);
    if (!src) throw new Error("PDF source not found: " + containerSelector);
    var clone = src.cloneNode(true);
    clone.querySelectorAll(".actions, .tiny-note").forEach(function (n) { n.remove(); });
    printContainer.appendChild(clone);
    document.body.appendChild(printContainer);

    try {
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ unit: "pt", format: "a4" });
      var pageW = pdf.internal.pageSize.getWidth();   // 595
      var pageH = pdf.internal.pageSize.getHeight();  // 842
      var margin = 36;
      var headerH = 30;          // height reserved at top for header
      var footerH = 36;          // height reserved at bottom for footer
      var contentTopPt = headerH + 16;                // 46
      var contentBottomPt = pageH - footerH - 8;      // 798
      var contentHpt = contentBottomPt - contentTopPt; // ~752

      await new Promise(function (r) { setTimeout(r, 200); });
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }

      // Collect breakpoints BEFORE html2canvas wipes the layout
      var bps = collectBreakpoints(printContainer);

      var canvas = await window.html2canvas(printContainer, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: 720,
        width: 720,
        height: printContainer.scrollHeight,
      });

      // Layout math
      var imgWpt = pageW - margin * 2;
      var pxPerPt = canvas.width / imgWpt;
      var pageContentHpx = Math.floor(contentHpt * pxPerPt);
      var totalHpx = canvas.height;

      // Convert CSS px breakpoints → canvas px (scale factor = canvas.width / 720)
      var cssToCanvas = canvas.width / 720;
      var bpCanvas = bps.points.map(function (p) { return Math.round(p * cssToCanvas); });
      var atomicCanvas = bps.atomic.map(function (a) {
        return { top: Math.round(a.top * cssToCanvas), bot: Math.round(a.bot * cssToCanvas) };
      });

      // Build slices using snapBreak so we never cut through an atomic block
      var slices = [];
      var srcY = 0;
      var safetyCounter = 0;
      while (srcY < totalHpx && safetyCounter < 50) {
        safetyCounter++;
        var target = srcY + pageContentHpx;
        var sliceEnd;
        if (target >= totalHpx) {
          sliceEnd = totalHpx;
        } else {
          sliceEnd = snapBreak(bpCanvas, atomicCanvas, target, srcY);
          if (sliceEnd == null || sliceEnd <= srcY) {
            // No safe break found - force-cut. Better than infinite loop.
            sliceEnd = target;
          }
        }
        slices.push({ top: srcY, bot: sliceEnd });
        srcY = sliceEnd;
      }

      var pageTotal = slices.length;

      var sliceCanvas = document.createElement("canvas");
      var sliceCtx = sliceCanvas.getContext("2d");
      sliceCanvas.width = canvas.width;

      for (var pi = 0; pi < slices.length; pi++) {
        var s = slices[pi];
        var slicePx = s.bot - s.top;
        if (slicePx <= 0) continue;
        sliceCanvas.height = slicePx;
        sliceCtx.fillStyle = "#ffffff";
        sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceCtx.drawImage(canvas, 0, s.top, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        var sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
        if (pi > 0) pdf.addPage();
        var sliceHpt = slicePx / pxPerPt;
        // Place content between header and footer
        pdf.addImage(sliceData, "JPEG", margin, contentTopPt, imgWpt, sliceHpt);
        drawHeader(pdf, pageW, margin, headerH);
        drawFooter(pdf, pageW, pageH, margin, footerH, pi + 1, pageTotal, guideTitle);
      }

      if (opts.output === "blob") {
        return pdf.output("blob");
      }
      pdf.save(filename);
    } finally {
      if (printContainer.parentNode) printContainer.parentNode.removeChild(printContainer);
      if (btn && originalLabel != null) { btn.disabled = false; btn.textContent = originalLabel; }
    }
  }

  global.PgwPdf = { export: exportPdf };
})(window);
