/* "Ready for Guide N+1?" CTA on the summary screen.
 *
 * Detects which guide is currently open from location.pathname (/guide-N/),
 * then appends a small CTA card at the bottom of #summaryBody linking back
 * to the landing page. The card is auto-included in the PDF (because it's
 * part of the .summary DOM that pdf-export.js captures) and the URL is also
 * exposed to email-self.js via window.NextGuide.getInfo() so it ends up in
 * the email body too.
 *
 * Guide 4 (the last) gets a gentle "you have completed all four" close
 * instead of a CTA.
 */
(function () {
  "use strict";

  var TOTAL_GUIDES = 4;
  var LANDING_PAGE_URL = (location && location.origin ? location.origin : "") + "/big-dream/";

  // Short titles for each guide. Used in the CTA copy and the email body.
  var GUIDE_TITLES = {
    1: "Name the Drift",
    2: "Explore Possible Futures",
    3: "Clarify the Big Dream",
    4: "Build the First Process",
  };

  function getCurrentGuideNumber() {
    var m = (location.pathname || "").match(/\/guide-(\d+)\//);
    return m ? parseInt(m[1], 10) : null;
  }

  function getNextGuideInfo() {
    var current = getCurrentGuideNumber();
    if (!current) return { hasNext: false, isLast: false };
    if (current >= TOTAL_GUIDES) {
      return {
        hasNext: false,
        isLast: true,
        currentNumber: current,
        landingPageUrl: LANDING_PAGE_URL,
      };
    }
    var nextNum = current + 1;
    return {
      hasNext: true,
      isLast: false,
      currentNumber: current,
      nextNumber: nextNum,
      nextTitle: GUIDE_TITLES[nextNum] || ("Guide " + nextNum),
      landingPageUrl: LANDING_PAGE_URL,
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        "\"": "&quot;", "'": "&#39;"
      }[c];
    });
  }

  function buildCta(info) {
    var section = document.createElement("div");
    section.className = "summary-next-cta";
    section.id = "summaryNextCta";

    if (info.hasNext) {
      section.innerHTML =
        '<h3 class="summary-next-cta-title">' +
          'Ready for Guide ' + info.nextNumber + '?' +
        '</h3>' +
        '<p class="summary-next-cta-sub">' +
          escapeHtml(info.nextTitle) + ' is next.' +
        '</p>' +
        '<a class="btn-primary summary-next-cta-link" href="' +
          info.landingPageUrl + '">' +
          'Back to all guides &nbsp;<span class="arrow">&rarr;</span>' +
        '</a>' +
        '<p class="summary-next-cta-url">' +
          '<a href="' + info.landingPageUrl + '">' +
            escapeHtml(info.landingPageUrl) +
          '</a>' +
        '</p>';
    } else if (info.isLast) {
      // Guide 4 - gentle close, no CTA.
      section.innerHTML =
        '<h3 class="summary-next-cta-title">You have completed all four guides.</h3>' +
        '<p class="summary-next-cta-sub">' +
          'Thank you for showing up. Much love.' +
        '</p>';
    } else {
      // Not on a guide page - render nothing.
      return null;
    }
    return section;
  }

  function inject() {
    var body = document.getElementById("summaryBody");
    if (!body) return;
    if (document.getElementById("summaryNextCta")) return;

    var info = getNextGuideInfo();
    var section = buildCta(info);
    if (section) body.appendChild(section);
  }

  // Public API for other modules (email-self.js).
  window.NextGuide = {
    getInfo: getNextGuideInfo,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

  // Summary renders dynamically when the participant reaches the last step.
  var observer = new MutationObserver(function () { inject(); });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
