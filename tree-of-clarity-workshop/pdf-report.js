/* ============================================================
   The Tree of Clarity — the take-home document.

   Typeset natively with jsPDF rather than photographed from the page,
   so the text stays sharp vector at any zoom and the file stays small.
   The tree itself is rasterised once, at 3x, and placed as artwork.
   ============================================================ */
(function (global) {
  "use strict";

  /* ---- page geometry, in points ---- */
  var PW = 595.28, PH = 841.89;      // A4
  var M = 62;                         // side margin
  var TOP = 74;
  var BOT = 74;
  var COL = PW - M * 2;

  /* ---- palette, matched to the screen ---- */
  var INK      = [14, 17, 18];
  var INK_SOFT = [42, 47, 49];
  var MUTED    = [131, 137, 139];
  var FAINT    = [169, 174, 176];
  var HAIR     = [228, 229, 230];
  var OLD      = [178, 79, 68];
  var NEW      = [78, 142, 99];
  var TEAL     = [31, 95, 92];

  function T() { return global.TocText; }

  /* ============================================================
     rasterise the tree for the cover
     ============================================================ */

  function treeImage(scale) {
    return new Promise(function (resolve, reject) {
      var src = document.querySelector(".tree-figure svg");
      if (!src) { resolve(null); return; }

      var clone = src.cloneNode(true);
      clone.removeAttribute("id");
      clone.querySelectorAll(".tstage").forEach(function (g) {
        g.classList.add("on");
        g.style.opacity = "1";
      });

      /* the page's stylesheet will not travel with the serialised svg,
         so bake the presentation in as inline attributes */
      var RULES = [
        [".ground", { stroke: "#B5A992", "stroke-width": "1.4", fill: "none", opacity: "0.5" }],
        [".ground-base", { opacity: "0.28" }],
        [".weather", { opacity: "0.13" }],
        [".weather path", { fill: "#9FA8AC" }],
        [".ink", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }],
        [".ink-old", { stroke: "#8E5B52" }],
        [".ink-new", { stroke: "#4E8E63" }],
        [".ink-trunk", { stroke: "#5A5450" }],
        [".trunk-wash", { fill: "#8F857C", opacity: "0.34" }],
        [".trunk-edge", { fill: "none", stroke: "#5A5450", "stroke-width": "1.5", opacity: "0.8" }],
        [".bark", { opacity: "0.36" }],
        [".wash-old", { opacity: "0.15" }],
        [".wash-new", { opacity: "0.15" }],
        [".wash-old ellipse", { fill: "#B24F44" }],
        [".wash-new ellipse", { fill: "#4E8E63" }],
        [".leaf-sick circle", { fill: "#B24F44" }],
        [".leaf-live circle", { fill: "#4E8E63" }],
        [".blossom circle", { fill: "#B8941F" }],
        [".grain", { opacity: "0.5" }]
      ];
      RULES.forEach(function (pair) {
        clone.querySelectorAll(pair[0]).forEach(function (el) {
          Object.keys(pair[1]).forEach(function (k) {
            if (k === "opacity" && el.getAttribute("opacity") != null) return;
            el.setAttribute(k, pair[1][k]);
          });
        });
      });

      var vb = (clone.getAttribute("viewBox") || "0 0 1000 700").split(/\s+/).map(Number);
      var w = vb[2], h = vb[3];
      clone.setAttribute("width", w);
      clone.setAttribute("height", h);

      var svgText = new XMLSerializer().serializeToString(clone);
      var blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);

      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = w * scale;
        c.height = h * scale;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#FCFCFB";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ data: c.toDataURL("image/jpeg", 0.92), w: w, h: h });
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /* ============================================================
     the writer: keeps a cursor, breaks pages, draws furniture
     ============================================================ */

  function Writer(pdf, meta) {
    this.pdf = pdf;
    this.y = TOP;
    this.page = 1;
    this.meta = meta;
    this.pageStarts = [];
    this.furniture(); // page 1
  }

  Writer.prototype.furniture = function () {
    var p = this.pdf;
    // running head
    p.setFont("times", "normal");
    p.setFontSize(9);
    p.setTextColor.apply(p, FAINT);
    p.text(this.meta.title, M, 44);
    p.text(this.meta.owner, PW - M, 44, { align: "right" });
    p.setDrawColor.apply(p, HAIR);
    p.setLineWidth(0.5);
    p.line(M, 52, PW - M, 52);
    // foot
    p.line(M, PH - 52, PW - M, PH - 52);
    p.setFontSize(8);
    p.setTextColor.apply(p, FAINT);
    p.text("francoisesterhuizen.com", M, PH - 38);
  };

  Writer.prototype.pageNumbers = function () {
    var p = this.pdf;
    var total = p.getNumberOfPages();
    for (var i = 1; i <= total; i++) {
      p.setPage(i);
      p.setFont("times", "normal");
      p.setFontSize(8);
      p.setTextColor.apply(p, FAINT);
      p.text(i + " / " + total, PW - M, PH - 38, { align: "right" });
    }
  };

  Writer.prototype.room = function (h) {
    if (this.y + h > PH - BOT) this.newPage();
  };

  Writer.prototype.newPage = function () {
    this.pdf.addPage();
    this.page++;
    this.y = TOP;
    this.furniture();
  };

  Writer.prototype.gap = function (h) { this.y += h; };

  Writer.prototype.rule = function (colour) {
    this.room(14);
    this.pdf.setDrawColor.apply(this.pdf, colour || HAIR);
    this.pdf.setLineWidth(0.5);
    this.pdf.line(M, this.y, PW - M, this.y);
    this.y += 1;
  };

  /* opens a new part of the document, in serif, with a rule beneath */
  Writer.prototype.chapter = function (text, colour) {
    var p = this.pdf;
    p.setFont("times", "normal");
    p.setFontSize(19);
    p.setTextColor.apply(p, INK);
    p.text(text, M, this.y);
    this.y += 13;
    p.setDrawColor.apply(p, colour);
    p.setLineWidth(0.8);
    p.line(M, this.y, M + 44, this.y);
    this.y += 28;
  };

  /* small caps style section label */
  Writer.prototype.label = function (text, colour) {
    this.room(30);
    var p = this.pdf;
    p.setFont("helvetica", "bold");
    p.setFontSize(7.2);
    p.setTextColor.apply(p, colour || FAINT);
    p.text(String(text).toUpperCase(), M, this.y, { charSpace: 1.15 });
    this.y += 15;
  };

  Writer.prototype.heading = function (text, size) {
    this.room((size || 20) + 14);
    var p = this.pdf;
    p.setFont("times", "normal");
    p.setFontSize(size || 20);
    p.setTextColor.apply(p, INK);
    var lines = p.splitTextToSize(text, COL);
    for (var i = 0; i < lines.length; i++) {
      this.room((size || 20) * 1.2);
      p.text(lines[i], M, this.y);
      this.y += (size || 20) * 1.18;
    }
    this.y += 4;
  };

  Writer.prototype.para = function (text, opts) {
    opts = opts || {};
    var p = this.pdf;
    var size = opts.size || 10.5;
    var lead = size * (opts.lead || 1.5);
    p.setFont(opts.font || "helvetica", opts.style || "normal");
    p.setFontSize(size);
    p.setTextColor.apply(p, opts.colour || INK_SOFT);
    var indent = opts.indent || 0;
    var lines = p.splitTextToSize(String(text), COL - indent);
    for (var i = 0; i < lines.length; i++) {
      this.room(lead);
      p.text(lines[i], M + indent, this.y);
      this.y += lead;
    }
    this.y += opts.after == null ? 6 : opts.after;
  };

  Writer.prototype.bullets = function (items, colour) {
    var p = this.pdf;
    var self = this;
    items.forEach(function (it) {
      var lines = p.splitTextToSize(String(it), COL - 16);
      for (var i = 0; i < lines.length; i++) {
        self.room(15.5);
        if (i === 0) {
          p.setFillColor.apply(p, colour || FAINT);
          p.circle(M + 3, self.y - 3, 1.4, "F");
        }
        p.setFont("helvetica", "normal");
        p.setFontSize(10.5);
        p.setTextColor.apply(p, INK);
        p.text(lines[i], M + 16, self.y);
        self.y += 15.5;
      }
      self.y += 2;
    });
    self.y += 4;
  };

  /* a row of soft pills, wrapping as needed */
  Writer.prototype.pills = function (words, fill, ink) {
    var p = this.pdf;
    var x = M, h = 17;
    this.room(h + 6);
    p.setFont("helvetica", "normal");
    p.setFontSize(10);
    for (var i = 0; i < words.length; i++) {
      var w = p.getTextWidth(words[i]) + 21;
      if (x + w > PW - M) { x = M; this.y += h + 6; this.room(h + 6); }
      p.setFillColor.apply(p, fill);
      p.roundedRect(x, this.y - 12, w, h, 8.5, 8.5, "F");
      p.setTextColor.apply(p, ink);
      p.text(words[i], x + 10.5, this.y);
      x += w + 6;
    }
    this.y += h + 8;
  };

  /* the closing sentence, framed by two rules */
  Writer.prototype.statement = function (text) {
    var p = this.pdf;
    p.setFont("times", "normal");
    p.setFontSize(14);
    var lines = p.splitTextToSize(text, COL - 24);
    var block = lines.length * 21 + 46;
    this.room(block);
    p.setDrawColor.apply(p, INK);
    p.setLineWidth(0.7);
    p.line(M, this.y, PW - M, this.y);
    this.y += 26;
    p.setTextColor.apply(p, INK);
    for (var i = 0; i < lines.length; i++) {
      p.text(lines[i], M + 12, this.y);
      this.y += 21;
    }
    this.y += 6;
    p.setDrawColor.apply(p, INK);
    p.line(M, this.y, PW - M, this.y);
    this.y += 22;
  };

  /* ============================================================
     compose
     ============================================================ */

  function build(state, opts) {
    opts = opts || {};
    var t = T();
    var f = t.filled;

    return treeImage(2).then(function (art) {
      var jsPDF = global.jspdf.jsPDF;
      var pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });

      var owner = f(state.name) ? String(state.name).trim() : "";
      var w = new Writer(pdf, { title: "The Tree of Clarity", owner: owner });

      /* ---------- cover ---------- */
      w.y = 132;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.2);
      pdf.setTextColor.apply(pdf, FAINT);
      pdf.text("THE TREE OF CLARITY", PW / 2, w.y, { align: "center", charSpace: 2.2 });
      w.y += 30;

      pdf.setFont("times", "normal");
      pdf.setFontSize(30);
      pdf.setTextColor.apply(pdf, INK);
      pdf.text(owner ? owner + "’s tree" : "Your tree", PW / 2, w.y, { align: "center" });
      w.y += 22;

      if (art) {
        var iw = COL + 40;
        var ih = iw * (art.h / art.w);
        var maxH = 330;
        if (ih > maxH) { ih = maxH; iw = ih * (art.w / art.h); }
        pdf.addImage(art.data, "JPEG", (PW - iw) / 2, w.y, iw, ih);
        w.y += ih + 14;
      }

      pdf.setFont("times", "italic");
      pdf.setFontSize(11);
      pdf.setTextColor.apply(pdf, MUTED);
      pdf.text("The trigger has not changed. The tree has.", PW / 2, w.y, { align: "center" });

      /* ---------- the dormant side ---------- */
      w.newPage();
      w.chapter("The side that grew in the dark", OLD);

      w.label("The trigger", OLD);
      w.para(state.trigger, { colour: INK, size: 11 });
      w.gap(10);

      var did = state.reactions.filter(f);
      if (f(state.reactionAfter)) did.push(t.afterLabel(state.reactionAfter));
      if (did.length) {
        w.label("What I used to do", OLD);
        w.bullets(did, OLD);
      }

      if (state.emotions.length) {
        w.label("What I felt", OLD);
        w.pills(state.emotions, [246, 236, 234], [142, 60, 51]);
        if (state.body.length) {
          w.para("Felt first in my " + state.body.join(" and ").toLowerCase(),
            { colour: MUTED, size: 9.5 });
        }
        w.gap(6);
      }

      var judge = t.listify(state.judge), cheer = t.listify(state.cheerleader),
          comf = t.listify(state.comforter);
      if (judge.length || cheer.length || comf.length) {
        w.label("What I said to myself", OLD);
        if (judge.length) {
          w.para("The Judge", { font: "helvetica", style: "bold", size: 9, colour: MUTED, after: 3 });
          w.bullets(judge, OLD);
        }
        if (cheer.length) {
          w.para("The Cheerleader", { font: "helvetica", style: "bold", size: 9, colour: MUTED, after: 3 });
          w.bullets(cheer, OLD);
        }
        if (comf.length) {
          w.para("The Comforter", { font: "helvetica", style: "bold", size: 9, colour: MUTED, after: 3 });
          w.bullets(comf, OLD);
        }
      }

      var oldB = state.oldBeliefs.filter(function (b) { return f(b.text); });
      if (oldB.length) {
        w.label("What I believed underneath", OLD);
        w.bullets(oldB.map(function (b) {
          return b.text + (b.tag ? "  (" + (b.tag === "limiting" ? "it stopped me" : "it excused me") + ")" : "");
        }), OLD);
      }

      /* ---------- the living side ---------- */
      w.newPage();
      w.chapter("The side that grows in the light", NEW);

      if (state.goals.length) {
        w.label("How I choose to feel", NEW);
        w.pills(state.goals, [235, 243, 237], [58, 107, 74]);
        w.gap(4);
      }

      var does = state.behaviours.filter(f);
      if (does.length) {
        w.label("What I do instead", NEW);
        w.bullets(does, NEW);
      }

      if (f(state.coachEncourage) || f(state.coachInstruct)) {
        w.label("My Coach", NEW);
        if (f(state.coachEncourage)) {
          w.para("It encourages", { font: "helvetica", style: "bold", size: 9, colour: MUTED, after: 3 });
          w.bullets(t.listify(state.coachEncourage), NEW);
        }
        if (f(state.coachInstruct)) {
          w.para("It instructs", { font: "helvetica", style: "bold", size: 9, colour: MUTED, after: 3 });
          w.bullets(t.listify(state.coachInstruct), NEW);
        }
      }

      var beliefs = [];
      oldB.forEach(function (b) {
        if (f(state.reframes[b.id])) {
          beliefs.push("I used to believe that " + t.midSentence(b.text) + ", " + state.reframes[b.id]);
        }
      });
      state.newBeliefs.forEach(function (b) { if (f(b.text)) beliefs.push(b.text); });
      if (beliefs.length) {
        w.label("What I believe now", NEW);
        w.bullets(beliefs, NEW);
      }

      /* ---------- the sentence ---------- */
      var a = state.atBest;
      if (f(a.doPart) || f(a.believePart)) {
        w.gap(12);
        w.statement(
          "At my best I " + t.lcFirst(t.stripLeadingI(t.stripFullStop(a.doPart))) +
          ", because I feel " + t.midSentence(a.feelPart) +
          ", because I think " + t.midSentence(a.thinkPart) +
          ", and I believe " + t.midSentence(a.believePart) + "."
        );
      }

      /* ---------- practice ---------- */
      var stick = [];
      if (state.body.length) stick.push("My earliest clue: " + state.body.join(" and ").toLowerCase());
      if (f(state.rehearseWhen)) stick.push("I rehearse: " + state.rehearseWhen);
      if (f(state.resetScript)) stick.push("My reset line: “" + state.resetScript + "”");
      if (stick.length) {
        w.label("Making it stick", NEW);
        w.bullets(stick, NEW);
      }

      w.gap(6);
      w.rule();
      w.gap(14);
      w.para("Bring this with you to a one-on-one and we will go further, faster.",
        { font: "times", style: "italic", size: 11, colour: TEAL });

      w.pageNumbers();

      if (opts.blob) return pdf.output("blob");
      pdf.save(t.fileName());
      return null;
    });
  }

  global.TocReport = { build: build };
})(window);
