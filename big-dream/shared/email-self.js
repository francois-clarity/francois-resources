/* "Email it to me" button on the summary / insight document screen.
 *
 * Generates the PDF, then either:
 *   (a) on mobile / supported browsers - uses navigator.share with the PDF
 *       attached as a file. The user picks their mail app, the email is
 *       composed with subject, body, AND the PDF already attached.
 *   (b) on desktop / unsupported browsers - saves the PDF to disk and
 *       opens a mailto: link with the recipient and a short body asking
 *       them to attach the file that just downloaded.
 *
 * No backend. No third-party service. PgwPdf is invoked with output:'blob'
 * (see shared/pdf-export.js).
 *
 * Picks the recipient from (in order):
 *   1. localStorage "francois_lead" (set by shared/lead-capture.js)
 *   2. the #participant_email input on the page (if filled in)
 */
(function () {
  "use strict";

  var STORAGE_KEY = "francois_lead";

  function getStored(field) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "";
      var data = JSON.parse(raw);
      return (data && data[field]) || "";
    } catch (e) {
      return "";
    }
  }

  function getRecipientEmail() {
    var stored = getStored("email");
    if (stored) return stored;
    var input = document.getElementById("participant_email");
    return (input && input.value) || "";
  }

  function getParticipantName() {
    var stored = getStored("name");
    if (stored) return stored;
    var input = document.getElementById("participant_name");
    return (input && input.value) || "";
  }

  /**
   * Derives the guide's short title from the page's <title> ("Big Dream
   * Guide 1: Name the Drift" → "Big Dream Guide 1: Name the Drift") and
   * also a shorter "subject-friendly" version ("Name the Drift").
   */
  function getTitles() {
    var pageTitle = (document.title || "").trim();
    // e.g. "Big Dream Guide 1: Name the Drift"
    var short = pageTitle;
    var m = pageTitle.match(/:\s*(.+)$/);
    if (m) short = m[1].trim();
    if (!short) short = "Your insight document";
    return { full: pageTitle || short, short: short };
  }

  function buildFilename(participantName, shortTitle) {
    var who = (participantName || "Big-Dream-Guide").trim().replace(/\s+/g, "-");
    var what = shortTitle.replace(/[^a-zA-Z0-9\-\s]/g, "").trim().replace(/\s+/g, "-");
    return who + "-" + (what || "Insight-Document") + ".pdf";
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function generatePdfBlob(shortTitle, filename) {
    if (!window.PgwPdf || typeof window.PgwPdf.export !== "function") {
      throw new Error("PDF generator not available");
    }
    var blob = await window.PgwPdf.export({
      containerSelector: ".summary",
      filename: filename,
      guideTitle: "Guide · " + shortTitle,
      output: "blob",
    });
    if (!blob) throw new Error("PDF generator returned no blob");
    return blob;
  }

  function buildMailto(email, subject, body) {
    return (
      "mailto:" + encodeURIComponent(email) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body)
    );
  }

  function canShareFiles(files) {
    try {
      return (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        typeof navigator.share === "function" &&
        navigator.canShare({ files: files })
      );
    } catch (e) {
      return false;
    }
  }

  async function onEmailClick(btn) {
    var email = getRecipientEmail();
    if (!email) {
      alert(
        "I do not have your email address yet. Please fill it in on the welcome screen, then try again."
      );
      return;
    }

    var titles = getTitles();
    var participantName = getParticipantName();
    var filename = buildFilename(participantName, titles.short);
    var subject = titles.full + ": your insight document";
    var body =
      "Please find attached your insight document for " + titles.full + ".";

    // Append a "Ready for the next guide?" line so the participant can
    // jump straight back from the email. Skip on the last guide.
    var nextInfo = (window.NextGuide && window.NextGuide.getInfo)
      ? window.NextGuide.getInfo() : { hasNext: false };
    if (nextInfo && nextInfo.hasNext) {
      body +=
        "\n\nReady for Guide " + nextInfo.nextNumber + " (" +
        nextInfo.nextTitle + ")? Continue here: " + nextInfo.landingPageUrl;
    }

    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";

    try {
      var blob = await generatePdfBlob(titles.short, filename);
      var file = new File([blob], filename, { type: "application/pdf" });

      // Mobile-friendly path: native share sheet with the PDF attached.
      if (canShareFiles([file])) {
        try {
          await navigator.share({
            title: subject,
            text: body,
            files: [file],
          });
          // Successful share - no fallback needed.
          return;
        } catch (shareErr) {
          // AbortError = user cancelled the share sheet. Stop without a message.
          if (shareErr && shareErr.name === "AbortError") return;
          // Otherwise fall through to the download + mailto path.
          console.warn("[email-self] share failed, falling back:", shareErr);
        }
      }

      // Desktop / unsupported path: save the PDF and open the user's mail
      // client with a pre-filled message reminding them to attach it.
      downloadBlob(blob, filename);
      var fallbackBody =
        "Please find attached your insight document for " + titles.full + "." +
        "\n\n(The PDF was just downloaded to your device. Attach the file " +
        '"' + filename + '" to this email before sending.)';
      window.location.href = buildMailto(email, subject, fallbackBody);
    } catch (e) {
      console.error("[email-self] failed:", e);
      alert(
        "Sorry, something went wrong preparing the email. You can still tap " +
          "Download PDF and email it yourself."
      );
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  function makeButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "emailSelf";
    btn.className = "btn-secondary";
    btn.textContent = "Email it to me";
    btn.addEventListener("click", function () { onEmailClick(btn); });
    return btn;
  }

  function inject() {
    var dl = document.getElementById("downloadPdf");
    if (!dl || dl.dataset.emailSelfInjected === "1") return;
    if (document.getElementById("emailSelf")) return;
    dl.dataset.emailSelfInjected = "1";

    var btn = makeButton();
    if (dl.nextSibling) {
      dl.parentNode.insertBefore(btn, dl.nextSibling);
    } else {
      dl.parentNode.appendChild(btn);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

  var observer = new MutationObserver(function () { inject(); });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
