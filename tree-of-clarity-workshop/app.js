/* ============================================================
   The Tree of Clarity
   A single-page worksheet. No framework, no build step for logic.
   Everything a participant writes stays in localStorage on their device.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "treeOfClarity.v1";

  /* ---------------- state ---------------- */

  var defaultState = {
    screen: "welcome",
    completed: [],
    beliefSeq: 1,
    trigger: "",
    reactions: ["", "", ""],
    reactionAfter: "",
    emotions: [],
    body: [],
    judge: "",
    cheerleader: "",
    comforter: "",
    oldBeliefs: [],
    goals: [],
    behaviours: ["", "", ""],
    coachEncourage: "",
    coachInstruct: "",
    triedList: "",
    reframes: {},
    newBeliefs: [],
    atBest: { doPart: "", feelPart: "", thinkPart: "", believePart: "" },
    resetScript: "Sorry, can I quickly reset? Give me five minutes, then we try again.",
    rehearseWhen: "",
    name: ""
  };

  var state = load();

  function load() {
    var merged = JSON.parse(JSON.stringify(defaultState));
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return merged;
      var saved = JSON.parse(raw);
      Object.keys(saved).forEach(function (k) { merged[k] = saved[k]; });
    } catch (e) {}
    return merged;
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }, 250);
  }

  /* ---------------- flow ---------------- */

  var SCREENS = [
    "welcome", "red-intro", "trigger", "reaction", "emotions", "voices",
    "old-beliefs", "pause1", "green-intro", "goals", "behaviour", "coach",
    "new-beliefs", "integration", "practice", "pause2", "summary"
  ];

  var WORK_STEPS = [
    "trigger", "reaction", "emotions", "voices", "old-beliefs",
    "goals", "behaviour", "coach", "new-beliefs", "integration", "practice"
  ];

  /* which part of the tree each step draws */
  var STAGE_FOR = {
    "trigger": "trigger",
    "reaction": "reaction",
    "emotions": "emotions",
    "voices": "voices",
    "old-beliefs": "oldbeliefs",
    "goals": "goals",
    "behaviour": "behaviour",
    "coach": "coach",
    "new-beliefs": "newbeliefs",
    "integration": "integration",
    "practice": "practice"
  };

  var screenEl = document.getElementById("screen");
  var indicatorEl = document.getElementById("stepIndicator");
  var progressEl = document.getElementById("progressBar");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isDone(id) { return state.completed.indexOf(id) !== -1; }
  function markDone(id) { if (!isDone(id)) state.completed.push(id); }

  function paintTree(root) {
    (root || document).querySelectorAll(".tstage").forEach(function (g) {
      var stage = g.getAttribute("data-stage");
      var done = Object.keys(STAGE_FOR).some(function (step) {
        return STAGE_FOR[step] === stage && isDone(step);
      });
      g.classList.toggle("on", done);
    });
  }

  function paintProgress(id) {
    var i = WORK_STEPS.indexOf(id);
    var done = WORK_STEPS.filter(isDone).length;
    var pct = Math.round((done / WORK_STEPS.length) * 100);
    if (progressEl) progressEl.style.width = pct + "%";
    if (!indicatorEl) return;
    if (i === -1) {
      indicatorEl.textContent = done ? done + " of " + WORK_STEPS.length : "";
    } else {
      indicatorEl.textContent = (i < 5 ? "Dormant" : "Alive") + " · " + (i + 1) + " of " + WORK_STEPS.length;
    }
  }

  function go(id) {
    state.screen = id;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function screenAfter(id) {
    var i = SCREENS.indexOf(id);
    return SCREENS[Math.min(i + 1, SCREENS.length - 1)];
  }

  /* ---------------- validation ---------------- */

  function filled(v) { return String(v || "").trim().length > 0; }

  function validate(id) {
    var s = state;
    switch (id) {
      case "trigger": return filled(s.trigger) ? "" : "Name the situation first, even roughly.";
      case "reaction": return s.reactions.some(filled) ? "" : "Write down at least one thing you actually do.";
      case "emotions": return s.emotions.length ? "" : "Choose at least one feeling. Three is better.";
      case "voices": return (filled(s.judge) || filled(s.cheerleader) || filled(s.comforter))
        ? "" : "Catch at least one sentence from any of the three.";
      case "old-beliefs": return s.oldBeliefs.some(function (b) { return filled(b.text); })
        ? "" : "Add at least one belief. This is the deepest root, so take a moment.";
      case "goals": return s.goals.length ? "" : "Choose at least one feeling you would rather have.";
      case "behaviour": return s.behaviours.some(filled) ? "" : "Describe one thing this version of you would visibly do.";
      case "coach": return (filled(s.coachEncourage) || filled(s.coachInstruct))
        ? "" : "Give your Coach a line, either kind or practical.";
      case "new-beliefs":
        var any = Object.keys(s.reframes).some(function (k) { return filled(s.reframes[k]); })
          || s.newBeliefs.some(function (b) { return filled(b.text); });
        return any ? "" : "Plant at least one new belief before you move on.";
      case "integration":
        var a = s.atBest;
        return (filled(a.doPart) && filled(a.feelPart) && filled(a.thinkPart) && filled(a.believePart))
          ? "" : "Fill in all four parts. Short is fine.";
      default: return "";
    }
  }

  function next(fromId, toId) {
    var msg = validate(fromId);
    var hint = document.getElementById("stepHint");
    if (msg) {
      if (hint) { hint.textContent = msg; hint.classList.add("show"); }
      return;
    }
    if (STAGE_FOR[fromId]) markDone(fromId);
    go(toId);
  }

  /* ---------------- small view helpers ---------------- */

  function nav(backId, label, cls) {
    return '<div class="actions">' +
      (backId ? '<button class="btn ghost" data-act="back" data-to="' + backId + '">Back</button>' : "") +
      '<button class="btn ' + (cls || "primary") + '" data-act="next">' + label + "</button>" +
      "</div><div class=\"step-hint\" id=\"stepHint\"></div>";
  }

  function picked(list, cls) {
    var html = '<div class="picked-row">';
    state[list].forEach(function (w, i) {
      html += '<span class="picked ' + cls + '">' + esc(w) +
        '<button data-act="unpick" data-list="' + list + '" data-i="' + i + '" aria-label="Remove ' + esc(w) + '">&times;</button></span>';
    });
    if (!state[list].length) html += '<span class="note">Nothing chosen yet.</span>';
    return html + "</div>";
  }

  function chips(words, list, cls) {
    return words.map(function (w) {
      var on = state[list].indexOf(w) !== -1;
      return '<button class="chip' + (on ? " selected " + cls : "") + '" data-act="pick" data-list="' +
        list + '" data-w="' + esc(w) + '">' + esc(w) + "</button>";
    }).join("");
  }

  /* ---------------- screens ---------------- */

  var renderers = {

    "welcome": function () {
      var resuming = isDone("trigger");
      return '<div class="step-label">A worksheet</div>' +
        "<h1>The Tree of Clarity</h1>" +
        '<p class="pullquote">If you change your mind, you can transform your life.</p>' +
        '<p class="lede">You are going to map the pattern that keeps you stuck, root and branch. Then you are going to design the one that sets you free.</p>' +
        "<p>The tree above is bare. It fills in as you write, and by the end it is yours to keep.</p>" +
        '<p class="note">Write quickly. Rough notes are perfect, and nobody will ask you to read yours out. Everything stays on this device.</p>' +
        '<div class="actions">' +
        '<button class="btn primary" data-act="go" data-to="red-intro">' +
        (resuming ? "Continue" : "Begin") + "</button>" +
        (resuming ? '<button class="btn ghost" data-act="restart">Start again</button>' : "") +
        "</div>" +
        '<div class="elsewhere">' +
        "<p><strong>Here on your own?</strong> This version is built to be run with a facilitator, so it pauses to bring a room back together. " +
        'There is a self-serve version that walks you through the same process at your own pace, at ' +
        '<a href="https://resources.francoisesterhuizen.com/tree-of-clarity/" target="_blank" rel="noopener">resources.francoisesterhuizen.com/tree-of-clarity</a>.</p>' +
        "</div>";
    },

    "red-intro": function () {
      return '<div class="step-label old-side">Part one</div>' +
        "<h2>The side that grew in the dark</h2>" +
        '<p class="lede">First we map what actually happens now. No fixing yet, just honest observation.</p>' +
        "<p>This pattern was built to keep you safe and comfortable, and for a long time it worked. It is not a character flaw. It is simply out of date, and today you get to see it whole.</p>" +
        nav("welcome", "Show me the pattern", "primary");
    },

    "trigger": function () {
      return '<div class="step-label old-side">The trigger</div>' +
        "<h2>What sets it off?</h2>" +
        "<p>Think of a situation that reliably triggers you: it makes you act like someone you would rather not be. A certain person, a kind of conflict, a task you keep avoiding, a moment that keeps returning.</p>" +
        '<div class="field prompt">' +
        '<label class="field-label" for="f-trigger">One situation, as specific as you can make it</label>' +
        '<textarea id="f-trigger" data-bind="trigger" placeholder="When my partner points out something I did not finish...">' + esc(state.trigger) + "</textarea>" +
        "</div>" +
        '<p class="note">Keep this exact situation in mind throughout. It never changes. Everything else will.</p>' +
        nav("red-intro", "Next");
    },

    "reaction": function () {
      var rows = "";
      var ph = ["I go quiet and look away", "My tone gets short", "I pick up my phone"];
      for (var i = 0; i < 3; i++) {
        rows += '<div class="numbered-row"><span class="num">' + (i + 1) + "</span>" +
          '<input type="text" data-bind-arr="reactions" data-i="' + i + '" value="' +
          esc(state.reactions[i]) + '" placeholder="' + ph[i] + '" /></div>';
      }
      return '<div class="step-label old-side">The reaction</div>' +
        "<h2>What would a camera see?</h2>" +
        "<p>Not how you feel. Not what you think. Only what is observable: your face, your tone, your body, what you do or pointedly do not do.</p>" +
        '<div class="field prompt"><span class="field-label">Three things you actually do</span>' + rows + "</div>" +
        '<div class="field">' +
        '<label class="field-label" for="f-after">And afterwards, later that day?</label>' +
        '<input type="text" id="f-after" data-bind="reactionAfter" value="' + esc(state.reactionAfter) +
        '" placeholder="I replay it for hours" />' +
        "</div>" +
        nav("trigger", "Next");
    },

    "emotions": function () {
      var groups = TocEmotions.groups;
      var active = state._emoGroup || groups[0].key;
      var g = groups.filter(function (x) { return x.key === active; })[0] || groups[0];
      var tabs = groups.map(function (x) {
        return '<button class="group-tab' + (x.key === active ? " active" : "") +
          '" data-act="emo-group" data-key="' + x.key + '">' + x.label + "</button>";
      }).join("");
      return '<div class="step-label old-side">The emotions</div>' +
        "<h2>What drives it?</h2>" +
        "<p>You react that way because of what you feel. Mad and sad do not count, so go under them. Beneath anger there is often something closer to disrespected, rejected, unimportant.</p>" +
        '<div class="prompt"><span class="field-label">Choose the three that drive your reaction</span>' +
        picked("emotions", "old-pick") +
        '<div class="group-tabs">' + tabs + "</div>" +
        '<div class="chip-row">' + chips(g.words, "emotions", "old-pick") + "</div>" +
        '<div class="custom-add"><input type="text" id="customEmotion" placeholder="Your own word" />' +
        '<button class="btn ghost" data-act="add-custom" data-list="emotions" data-input="customEmotion">Add</button></div>' +
        "</div>" +
        '<hr class="section-break" />' +
        "<h3>Where do you feel it first?</h3>" +
        '<p class="note">Emotions arrive in the body before you have words for them. That signal will become your earliest clue.</p>' +
        '<div class="chip-row">' + chips(TocEmotions.bodyPlaces, "body", "old-pick") + "</div>" +
        nav("reaction", "Next");
    },

    "voices": function () {
      return '<div class="step-label old-side">The thoughts</div>' +
        "<h2>The three voices</h2>" +
        "<p>Why do you feel that way? Because of what runs through your head, automatically, every time. Three voices keep the pattern alive. They sound nothing like each other, and they do the same job: they all keep the responsibility away from you.</p>" +
        '<div class="card unwell"><div class="card-tag">Aims inward, shames you</div><h3>The Judge</h3>' +
        '<p class="note">Turns on you. Sometimes flatly: I am useless. More often as a small question that sounds like curiosity: what is wrong with me?</p>' +
        '<textarea data-bind="judge" placeholder="One line each">' + esc(state.judge) + "</textarea></div>" +
        '<div class="card unwell"><div class="card-tag">Aims outward, blames everyone else</div><h3>The Cheerleader</h3>' +
        '<p class="note">Always on your side, which is exactly why it is dangerous. It hands the whole thing to other people and to circumstances. It feels like loyalty.</p>' +
        '<textarea data-bind="cheerleader" placeholder="One line each">' + esc(state.cheerleader) + "</textarea></div>" +
        '<div class="card unwell"><div class="card-tag">Aims inward, lets you off</div><h3>The Comforter</h3>' +
        '<p class="note">The kindest sounding one, and the hardest to catch. It does not attack you and it does not blame anyone. It soothes. It tells you that you did your best, that you have done enough, that you should be grateful and let it go. It is not asking you to change anything, and that is the point.</p>' +
        '<textarea data-bind="comforter" placeholder="You did your best.&#10;It is not your fault.&#10;Just let it go.">' + esc(state.comforter) + "</textarea></div>" +
        '<p class="note">Listen for where each one leads. The Judge usually sits over the beliefs that stop you. The Comforter usually sits over the ones that excuse you, which is why it is worth catching: it is the voice that talks you out of changing anything.</p>' +
        nav("emotions", "Next");
    },

    "old-beliefs": function () {
      var cards = state.oldBeliefs.map(function (b) {
        var kind = { identity: "Identity", formula: "Formula", definition: "Definition" }[b.kind] || "Belief";
        var ph = {
          identity: "I am a people pleaser",
          formula: "If I say no, then they will not like me",
          definition: "My definition of success is putting others first"
        }[b.kind];
        return '<div class="card unwell">' +
          '<div class="belief-top"><span class="belief-kind">' + kind + "</span>" +
          '<button class="remove-belief" data-act="remove-belief" data-id="' + b.id + '" aria-label="Remove">&times;</button></div>' +
          '<input type="text" data-belief="' + b.id + '" value="' + esc(b.text) + '" placeholder="' + esc(ph) + '" />' +
          '<div class="belief-tags">' +
          '<button class="belief-tag' + (b.tag === "limiting" ? " active" : "") +
          '" data-act="tag-belief" data-id="' + b.id + '" data-tag="limiting">It stops me</button>' +
          '<button class="belief-tag' + (b.tag === "justifying" ? " active" : "") +
          '" data-act="tag-belief" data-id="' + b.id + '" data-tag="justifying">It excuses me</button>' +
          "</div></div>";
      }).join("");
      return '<div class="step-label old-side">The beliefs</div>' +
        "<h2>The deepest roots</h2>" +
        "<p>Why do you think those things? Because of what you believe underneath them. This is the hardest part of the work, and the part that changes everything.</p>" +
        "<p>You built these beliefs to survive, and they are not stupid. Some are simply old. They come in three shapes:</p>" +
        '<div class="belief-templates">' +
        '<button class="belief-template" data-act="add-belief" data-kind="identity">I am...</button>' +
        '<button class="belief-template" data-act="add-belief" data-kind="formula">If... then...</button>' +
        '<button class="belief-template" data-act="add-belief" data-kind="definition">My definition of...</button>' +
        "</div>" + cards +
        '<p class="note">We never ask whether a belief is right or wrong, true or false. Only whether it is healthy: does it help you show up the way you want to?</p>' +
        nav("voices", "I have found them", "primary");
    },

    "pause1": function () {
      return '<div class="step-label">Pause</div>' +
        "<h2>Pause here</h2>" +
        '<p class="lede">You have mapped the side that grew in the dark. That takes courage.</p>' +
        '<div class="recap-title">What you wrote</div>' +
        oldSideRecap() +
        '<p class="recap-hint">Tap any line to change it.</p>' +
        '<p class="pause-ask">Read it once, slowly. What surprised you on the way down to the roots?</p>' +
        "<p>None of this is who you are. It is a version of you, built for a season that has passed. Versions can be rewritten.</p>" +
        '<div class="actions"><button class="btn ghost" data-act="back" data-to="old-beliefs">Back</button>' +
        '<button class="btn btn-new" data-act="go" data-to="green-intro">Build the other side</button></div>';
    },

    "green-intro": function () {
      return '<div class="step-label new-side">Part two</div>' +
        "<h2>The side that grows in the light</h2>" +
        '<p class="lede">The situation does not change. That is the rule, and it is the whole point.</p>' +
        "<p>Everything from here is yours to choose: how you want to feel, how you would act, what your own coach says, and the beliefs holding it all up. The old side was built for safety. This one is built for risk and adventure.</p>" +
        nav("pause1", "Start with the feeling", "primary");
    },

    "goals": function () {
      return '<div class="step-label new-side">Emotional goals</div>' +
        "<h2>How would you rather feel?</h2>" +
        "<p>Same situation. Same person doing the same thing. Nothing outside you changes at all. Inside that, how would you rather feel?</p>" +
        '<div class="prompt"><span class="field-label">Choose three</span>' +
        picked("goals", "new-pick") +
        '<div class="chip-row">' + chips(TocEmotions.healthy, "goals", "new-pick") + "</div>" +
        '<div class="custom-add"><input type="text" id="customGoal" placeholder="Your own word" />' +
        '<button class="btn ghost" data-act="add-custom" data-list="goals" data-input="customGoal">Add</button></div>' +
        "</div>" +
        '<p class="note">If something in you says "how am I supposed to feel any different?", notice who is talking. That is the Cheerleader, or the Comforter. Feelings follow beliefs, and you are about to plant new ones.</p>' +
        nav("green-intro", "Next");
    },

    "behaviour": function () {
      var words = state.goals.length ? state.goals.join(", ").toLowerCase() : "that way";
      var rows = "";
      var ph = ["I stay in the room and keep my voice level", "I ask one question before I answer", "I let the silence sit"];
      for (var i = 0; i < 3; i++) {
        rows += '<div class="numbered-row"><span class="num">' + (i + 1) + "</span>" +
          '<input type="text" data-bind-arr="behaviours" data-i="' + i + '" value="' +
          esc(state.behaviours[i]) + '" placeholder="' + ph[i] + '" /></div>';
      }
      return '<div class="step-label new-side">The response</div>' +
        "<h2>The camera again</h2>" +
        "<p>Same moment, same trigger, but you are feeling <strong>" + esc(words) +
        "</strong>. What does the camera see now?</p>" +
        '<div class="field prompt"><span class="field-label">Three things this version of you does</span>' + rows + "</div>" +
        nav("goals", "Next");
    },

    "coach": function () {
      return '<div class="step-label new-side">The thoughts</div>' +
        "<h2>The third voice</h2>" +
        "<p>There is another voice available to you, and in almost everyone it is underused: the Coach. It does two jobs, so give it words for both.</p>" +
        '<div class="card well"><h3>It encourages</h3>' +
        '<p class="note">You can do this. You have handled harder.</p>' +
        '<textarea data-bind="coachEncourage" placeholder="What would it say to steady you?">' + esc(state.coachEncourage) + "</textarea></div>" +
        '<div class="card well"><h3>It instructs</h3>' +
        '<p class="note">Try this specific thing next time. Approach it this way instead.</p>' +
        '<textarea data-bind="coachInstruct" placeholder="What exactly would it tell you to do?">' + esc(state.coachInstruct) + "</textarea></div>" +
        '<hr class="section-break" />' +
        '<details><summary class="note" style="cursor:pointer">If you catch yourself thinking "I have tried everything"</summary>' +
        '<p class="note" style="margin-top:12px">List what you actually tried, one per line. Count the repeats. Then let the Coach suggest the fourth thing, the one you have never tried once.</p>' +
        '<textarea data-bind="triedList" placeholder="1. I told them&#10;2. I told them again">' + esc(state.triedList) + "</textarea></details>" +
        nav("behaviour", "Next");
    },

    "new-beliefs": function () {
      var reframes = state.oldBeliefs.filter(function (b) { return filled(b.text); }).map(function (b) {
        return '<div class="card well">' +
          '<div class="reframe-old">I used to believe that ' + esc(midSentence(b.text)) + ",</div>" +
          '<input type="text" data-reframe="' + b.id + '" value="' + esc(state.reframes[b.id] || "") + '" placeholder="but now..." />' +
          '<div class="softener-row">' +
          '<button class="softener" data-act="soften" data-id="' + b.id + '" data-text="but now I am starting to doubt that.">too big a leap?</button>' +
          '<button class="softener" data-act="soften" data-id="' + b.id + '" data-text="but now I am learning another way.">I am learning another way</button>' +
          "</div>" +
          '<div class="nudge-slot" data-nudge-for="reframe-' + b.id + '"></div>' +
          "</div>";
      }).join("");
      var planted = state.newBeliefs.map(function (b) {
        var kind = { identity: "Identity", formula: "Formula", definition: "Definition" }[b.kind] || "Belief";
        var ph = {
          identity: "I am an acquired taste",
          formula: "When she is direct, I know she trusts me with the truth",
          definition: "My definition of success is showing up as myself, more often, for longer"
        }[b.kind];
        return '<div class="card well">' +
          '<div class="belief-top"><span class="belief-kind">' + kind + "</span>" +
          '<button class="remove-belief" data-act="remove-new-belief" data-id="' + b.id + '" aria-label="Remove">&times;</button></div>' +
          '<input type="text" data-new-belief="' + b.id + '" value="' + esc(b.text) + '" placeholder="' + esc(ph) + '" />' +
          '<div class="nudge-slot" data-nudge-for="new-' + b.id + '"></div>' +
          "</div>";
      }).join("");
      return '<div class="step-label new-side">The beliefs</div>' +
        "<h2>Rewrite the roots</h2>" +
        "<p>Start with the opposite of the old one, then keep going until it sounds like you rather than like a poster. A new belief does not have to be true, or fair, or impressive. It has to be useful.</p>" +
        reframes +
        '<hr class="section-break" />' +
        "<h3>Plant something of your own</h3>" +
        '<div class="belief-templates">' +
        '<button class="belief-template" data-act="add-new-belief" data-kind="identity">I am...</button>' +
        '<button class="belief-template" data-act="add-new-belief" data-kind="formula">When... I know...</button>' +
        '<button class="belief-template" data-act="add-new-belief" data-kind="definition">My definition of...</button>' +
        "</div>" + planted +
        '<p class="note">Keep only what helps you think, feel and act the way you want. If a line does nothing for you, let it go.</p>' +
        nav("coach", "Next");
    },

    "integration": function () {
      prefillAtBest();
      var a = state.atBest;
      return '<div class="step-label new-side">At my best</div>' +
        "<h2>One sentence to carry</h2>" +
        "<p>Fold the whole living side into a single line. We have filled it in from your own answers. Edit each part until it sounds like you saying it.</p>" +
        '<div class="hero-sentence" id="heroPreview">' + heroSentenceHtml() + "</div>" +
        '<div class="field"><label class="field-label">At my best I...</label>' +
        '<input type="text" data-bind-ab="doPart" value="' + esc(a.doPart) + '" placeholder="stay in the room and ask a question" /></div>' +
        '<div class="field"><label class="field-label">because I feel...</label>' +
        '<input type="text" data-bind-ab="feelPart" value="' + esc(a.feelPart) + '" placeholder="calm, safe and curious" /></div>' +
        '<div class="field"><label class="field-label">because I think...</label>' +
        '<input type="text" data-bind-ab="thinkPart" value="' + esc(a.thinkPart) + '" placeholder="I can handle this" /></div>' +
        '<div class="field"><label class="field-label">and I believe...</label>' +
        '<input type="text" data-bind-ab="believePart" value="' + esc(a.believePart) + '" placeholder="I am an acquired taste" /></div>' +
        nav("new-beliefs", "Next");
    },

    "practice": function () {
      var body = state.body.length ? state.body.join(" and ").toLowerCase() : "your body";
      var feels = state.emotions.length ? state.emotions.join(", ").toLowerCase() : "the old feelings";
      var goals = state.goals.length ? state.goals.join(", ").toLowerCase() : "the way you chose";
      var move = state.behaviours.filter(filled)[0] || "your new first move";
      return '<div class="step-label new-side">Practice</div>' +
        "<h2>Making it stick</h2>" +
        "<h3>Your earliest clue</h3>" +
        "<p>You said you feel it first in your <strong>" + esc(body) +
        "</strong>. From today that signal is on your side. When " + esc(feels) +
        " turn up, thank them: they are telling you the old system has started running, and it is time to move across.</p>" +
        '<hr class="section-break" />' +
        "<h3>Rehearse the version you want</h3>" +
        "<p>Close your eyes and run the scene once. Same trigger. See yourself feeling " + esc(goals) +
        ". Hear your Coach. Watch yourself " + esc(lcFirst(stripLeadingI(stripFullStop(move)))) +
        ". Your mind does not keep a clean record of what was imagined and what was done, so rehearse the one you want.</p>" +
        '<div class="field"><label class="field-label" for="f-when">When will you rehearse it?</label>' +
        '<input type="text" id="f-when" data-bind="rehearseWhen" value="' + esc(state.rehearseWhen) +
        '" placeholder="Tomorrow morning with my coffee" /></div>' +
        '<hr class="section-break" />' +
        "<h3>For the times the old pattern wins</h3>" +
        "<p>It will, sometimes. That is the process working, not proof that you failed. Keep a line ready so you can start the moment over.</p>" +
        '<div class="field"><input type="text" data-bind="resetScript" value="' + esc(state.resetScript) + '" /></div>' +
        nav("integration", "Done", "primary");
    },

    "pause2": function () {
      return '<div class="step-label">Pause</div>' +
        "<h2>Pause here</h2>" +
        '<p class="lede">Both sides are standing now.</p>' +
        '<div class="recap-title">The version of you that you just built</div>' +
        newSideRecap() +
        '<p class="recap-hint">Tap any line to change it.</p>' +
        '<div class="hero-sentence">' + heroSentenceHtml() + "</div>" +
        '<p class="pause-ask">Read that last line out loud, once. Hearing yourself say it is part of planting it.</p>' +
        '<div class="actions"><button class="btn ghost" data-act="back" data-to="practice">Back</button>' +
        '<button class="btn primary" data-act="go" data-to="summary">See your tree</button></div>';
    },

    "summary": function () {
      WORK_STEPS.forEach(markDone);
      save();
      var s = state;
      var judge = listify(s.judge), cheer = listify(s.cheerleader), comf = listify(s.comforter);
      var oldB = s.oldBeliefs.filter(function (b) { return filled(b.text); });
      var newB = s.newBeliefs.filter(function (b) { return filled(b.text); });

      var h = '<div class="doc">';
      h += '<div class="doc-head"><div class="eyebrow">The Tree of Clarity</div>' +
        "<h1>" + (filled(s.name) ? esc(s.name) + "&rsquo;s tree" : "Your tree") + "</h1></div>";
      h += '<div class="doc-tree" id="docTree"></div>';
      h += '<p class="doc-caption">The trigger has not changed. The tree has.</p>';

      h += '<div class="sect side-old"><h3>The trigger</h3><p>' + esc(s.trigger) + "</p></div>";

      h += '<div class="sect side-old"><h3>What I used to do</h3><ul>' +
        s.reactions.filter(filled).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") +
        (filled(s.reactionAfter) ? "<li>" + esc(afterLabel(s.reactionAfter)) + "</li>" : "") + "</ul></div>";

      h += '<div class="sect side-old"><h3>What I felt</h3><div class="summary-chips">' +
        s.emotions.map(function (e) { return '<span class="rc-chip old-chip">' + esc(e) + "</span>"; }).join("") +
        "</div>" + (s.body.length ? '<p class="note" style="margin-top:10px">Felt first in my ' +
          esc(s.body.join(" and ").toLowerCase()) + "</p>" : "") + "</div>";

      if (judge.length || cheer.length || comf.length) {
        h += '<div class="sect side-old"><h3>What I said to myself</h3>';
        if (judge.length) h += '<div class="sub">The Judge</div><ul>' + judge.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
        if (cheer.length) h += '<div class="sub">The Cheerleader</div><ul>' + cheer.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
        if (comf.length) h += '<div class="sub">The Comforter</div><ul>' + comf.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
        h += "</div>";
      }
      if (oldB.length) {
        h += '<div class="sect side-old"><h3>What I believed underneath</h3><ul>' +
          oldB.map(function (b) {
            return "<li>" + esc(b.text) + (b.tag ? ' <span class="rc-tag">' +
              (b.tag === "limiting" ? "it stopped me" : "it excused me") + "</span>" : "") + "</li>";
          }).join("") + "</ul></div>";
      }

      h += '<div class="sect side-new"><h3>How I choose to feel</h3><div class="summary-chips">' +
        s.goals.map(function (g) { return '<span class="rc-chip new-chip">' + esc(g) + "</span>"; }).join("") + "</div></div>";

      h += '<div class="sect side-new"><h3>What I do instead</h3><ul>' +
        s.behaviours.filter(filled).map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul></div>";

      if (filled(s.coachEncourage) || filled(s.coachInstruct)) {
        h += '<div class="sect side-new"><h3>My Coach</h3>';
        if (filled(s.coachEncourage)) h += '<div class="sub">Encouragement</div><ul>' +
          listify(s.coachEncourage).map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
        if (filled(s.coachInstruct)) h += '<div class="sub">Instruction</div><ul>' +
          listify(s.coachInstruct).map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
        h += "</div>";
      }

      var reframes = oldB.filter(function (b) { return filled(s.reframes[b.id]); });
      if (reframes.length || newB.length) {
        h += '<div class="sect side-new"><h3>What I believe now</h3><ul>';
        reframes.forEach(function (b) {
          h += "<li>I used to believe that " + esc(midSentence(b.text)) + ", " + esc(s.reframes[b.id]) + "</li>";
        });
        newB.forEach(function (b) { h += "<li>" + esc(b.text) + "</li>"; });
        h += "</ul></div>";
      }

      h += '<div class="closing-sentence">' + heroSentenceHtml() + "</div>";

      h += '<div class="sect side-new"><h3>Making it stick</h3><ul>' +
        (s.body.length ? "<li>My earliest clue: " + esc(s.body.join(" and ").toLowerCase()) + "</li>" : "") +
        (filled(s.rehearseWhen) ? "<li>I rehearse: " + esc(s.rehearseWhen) + "</li>" : "") +
        (filled(s.resetScript) ? "<li>My reset line: &ldquo;" + esc(s.resetScript) + "&rdquo;</li>" : "") +
        "</ul></div>";
      h += "</div>";

      h += '<div class="dark-panel">' +
        "<h3>Take it with you</h3>" +
        "<p>Keep this somewhere you will see it again. Read the last sentence on the mornings you need it, and bring the whole thing to a one-on-one so we can go further, faster.</p>" +
        '<div class="field"><label class="field-label" for="f-name">Your name, for the document</label>' +
        '<input type="text" id="f-name" data-bind="name" value="' + esc(s.name) + '" placeholder="Optional" /></div>' +
        '<div class="actions" style="margin-top:24px">' +
        '<button class="btn primary" id="btnPdf">Download as PDF</button>' +
        '<button class="btn ghost" id="btnShare">Share</button>' +
        "</div></div>";

      h += '<div class="elsewhere">' +
        "<h3>If you want to go further on one layer</h3>" +
        "<p>Each of these takes one part of the tree and goes deeper than a workshop has time for. They are free, they work the same way as this, and nothing you write leaves your device.</p>" +
        '<ul class="tool-list">' +
        '<li><a href="https://resources.francoisesterhuizen.com/emotional-language-wheel/" target="_blank" rel="noopener">The Emotional Language Wheel</a>' +
        "<span>160 words for what you are feeling, when the usual four will not do.</span></li>" +
        '<li><a href="https://resources.francoisesterhuizen.com/four-voices/" target="_blank" rel="noopener">The Four Voices</a>' +
        "<span>The judge, the cheerleader and the comforter on the unhealthy side, and the coach on the other. How to catch which one is talking.</span></li>" +
        '<li><a href="https://resources.francoisesterhuizen.com/belief-inventory/" target="_blank" rel="noopener">The Belief Inventory</a>' +
        "<span>A guided sweep across the areas of your life, to find the beliefs running underneath all of them.</span></li>" +
        '<li><a href="https://resources.francoisesterhuizen.com/tree-of-clarity/" target="_blank" rel="noopener">The Tree of Clarity, on your own</a>' +
        "<span>This same walk, at your own pace, whenever you want to run another situation through it.</span></li>" +
        "</ul></div>";

      h += '<p class="signoff">Whatever you found today, the fact that you looked at all of it, roots included, is the work. ' +
        "Much love,<br /><span class=\"name\">Francois</span></p>";

      h += '<div class="actions">' +
        '<button class="btn ghost" data-act="back" data-to="pause2">Back</button>' +
        '<button class="btn ghost" data-act="restart">Start again</button></div>' +
        '<p class="tiny-note">Nothing you wrote has left this browser.</p>';
      return h;
    }
  };

  /* ---------------- recap ---------------- */

  function chipList(words, cls) {
    if (!words || !words.length) return "";
    return words.map(function (w) { return '<span class="rc-chip ' + cls + '">' + esc(w) + "</span>"; }).join("");
  }

  function linesHtml(text) {
    var lines = listify(text);
    if (!lines.length) return "";
    return lines.map(function (l) { return '<span class="rc-line">' + esc(l) + "</span>"; }).join("");
  }

  function recapRow(label, body, stepId, cls) {
    if (!body) return "";
    return '<button class="recap-row ' + cls + '" data-act="back" data-to="' + stepId + '">' +
      '<span class="recap-label">' + esc(label) + "</span>" +
      '<span class="recap-body">' + body + "</span></button>";
  }

  function afterLabel(t) {
    var s = String(t || "").trim().replace(/^afterwards[,:]?\s*/i, "");
    return "Afterwards: " + s;
  }

  function oldSideRecap() {
    var s = state, rows = "";
    rows += recapRow("What sets it off", esc(s.trigger), "trigger", "old-row");
    rows += recapRow("What I do", linesHtml(s.reactions.filter(filled).join("\n") +
      (filled(s.reactionAfter) ? "\n" + afterLabel(s.reactionAfter) : "")), "reaction", "old-row");
    rows += recapRow("What I feel", chipList(s.emotions, "old-chip") +
      (s.body.length ? '<span class="rc-line" style="margin-top:6px">Felt first in my ' +
        esc(s.body.join(" and ").toLowerCase()) + "</span>" : ""), "emotions", "old-row");
    var v = "";
    if (filled(s.judge)) v += '<span class="rc-sub">The Judge</span>' + linesHtml(s.judge);
    if (filled(s.cheerleader)) v += '<span class="rc-sub">The Cheerleader</span>' + linesHtml(s.cheerleader);
    if (filled(s.comforter)) v += '<span class="rc-sub">The Comforter</span>' + linesHtml(s.comforter);
    rows += recapRow("What I say to myself", v, "voices", "old-row");
    var b = s.oldBeliefs.filter(function (x) { return filled(x.text); }).map(function (x) {
      return '<span class="rc-line">' + esc(x.text) + (x.tag ? ' <span class="rc-tag">' +
        (x.tag === "limiting" ? "it stops me" : "it excuses me") + "</span>" : "") + "</span>";
    }).join("");
    rows += recapRow("What I believe underneath", b, "old-beliefs", "old-row");
    return rows ? '<div class="recap">' + rows + "</div>" : "";
  }

  function newSideRecap() {
    var s = state, rows = "";
    rows += recapRow("How I want to feel", chipList(s.goals, "new-chip"), "goals", "new-row");
    rows += recapRow("What I do instead", linesHtml(s.behaviours.filter(filled).join("\n")), "behaviour", "new-row");
    var c = "";
    if (filled(s.coachEncourage)) c += '<span class="rc-sub">Encouragement</span>' + linesHtml(s.coachEncourage);
    if (filled(s.coachInstruct)) c += '<span class="rc-sub">Instruction</span>' + linesHtml(s.coachInstruct);
    rows += recapRow("What my Coach says", c, "coach", "new-row");
    var nb = "";
    s.oldBeliefs.forEach(function (b) {
      if (filled(b.text) && filled(s.reframes[b.id])) {
        nb += '<span class="rc-line">I used to believe that ' + esc(midSentence(b.text)) + ", " + esc(s.reframes[b.id]) + "</span>";
      }
    });
    s.newBeliefs.forEach(function (b) { if (filled(b.text)) nb += '<span class="rc-line">' + esc(b.text) + "</span>"; });
    rows += recapRow("What I believe now", nb, "new-beliefs", "new-row");
    return rows ? '<div class="recap">' + rows + "</div>" : "";
  }

  /* ---------------- language helpers ---------------- */

  function stripFullStop(s) { return String(s || "").trim().replace(/[.…]+$/, ""); }
  function stripLeadingI(s) { return String(s || "").trim().replace(/^I\s+/i, ""); }

  function lcFirst(s) {
    s = String(s || "").trim();
    if (!s) return s;
    if (s.length > 1 && s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase()) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  /* lowercase the opening word unless it is the pronoun I */
  function midSentence(s) {
    s = stripFullStop(s);
    if (/^i\b/i.test(s)) return s.replace(/^i\b/i, "I");
    return lcFirst(s);
  }

  /* the Coach speaks to you; the sentence needs you speaking to yourself */
  function toFirstPerson(s) {
    return String(s || "")
      .replace(/\byou are\b/gi, "I am")
      .replace(/\byou're\b/gi, "I am")
      .replace(/\byou have\b/gi, "I have")
      .replace(/\byou've\b/gi, "I have")
      .replace(/\byou can\b/gi, "I can")
      .replace(/\byou will\b/gi, "I will")
      .replace(/\byou do\b/gi, "I do")
      .replace(/\byour\b/gi, "my")
      .replace(/\byourself\b/gi, "myself")
      .replace(/\byou\b/gi, "I");
  }

  function listify(s) {
    return String(s || "").split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function heroSentenceHtml() {
    var a = state.atBest;
    function slot(v, fallback) {
      return filled(v) ? '<span class="slot">' + esc(v) + "</span>"
        : '<span class="slot empty">' + fallback + "</span>";
    }
    return "At my best I " + slot(lcFirst(stripLeadingI(stripFullStop(a.doPart))), "&hellip;") +
      ", because I feel " + slot(midSentence(a.feelPart), "&hellip;") +
      ", because I think " + slot(midSentence(a.thinkPart), "&hellip;") +
      ", and I believe " + slot(midSentence(a.believePart), "&hellip;") + ".";
  }

  function prefillAtBest() {
    var a = state.atBest;
    if (!filled(a.doPart)) a.doPart = state.behaviours.filter(filled)[0] || "";
    if (!filled(a.feelPart)) a.feelPart = state.goals.join(", ").toLowerCase();
    if (!filled(a.thinkPart)) {
      var line = listify(state.coachEncourage)[0] || listify(state.coachInstruct)[0] || "";
      a.thinkPart = toFirstPerson(line);
    }
    if (!filled(a.believePart)) {
      var planted = (state.newBeliefs.filter(function (b) { return filled(b.text); })[0] || {}).text || "";
      var reframed = "";
      state.oldBeliefs.some(function (b) {
        if (filled(state.reframes[b.id])) {
          reframed = state.reframes[b.id].replace(/^but now\s*/i, "");
          return true;
        }
        return false;
      });
      a.believePart = planted || reframed;
    }
  }

  /* ---------------- nudges on new beliefs ---------------- */

  var FUTURE_RE = /\b(will|must|should|shall|going to|gonna|need to|have to|one day)\b/i;
  var NEGATION_RE = /\b(not|never|don.t|won.t|can.t|stop|no longer)\b/i;

  function nudgeFor(text) {
    var t = String(text || "").trim();
    if (!t) return "";
    if (FUTURE_RE.test(t)) return "Not will, not must. Pull it into the present: I do.";
    if (NEGATION_RE.test(t)) return "Say who you are, rather than what you are leaving behind.";
    if (t.length > 110) return "Shorter is stronger. Sharpen it until it points at the exact spot.";
    return "";
  }

  function showNudge(key, text) {
    var slot = document.querySelector('[data-nudge-for="' + key + '"]');
    if (!slot) return;
    var msg = nudgeFor(text);
    slot.innerHTML = msg ? '<div class="nudge">' + esc(msg) + "</div>" : "";
  }

  /* ---------------- render ---------------- */

  function render() {
    var id = renderers[state.screen] ? state.screen : "welcome";
    screenEl.innerHTML = renderers[id]();
    document.body.classList.toggle("is-doc", id === "summary");
    paintProgress(id);
    paintTree();

    if (id === "summary") {
      var mount = document.getElementById("docTree");
      var src = document.querySelector(".tree-figure svg");
      if (mount && src) {
        var clone = src.cloneNode(true);
        clone.removeAttribute("id");
        clone.querySelectorAll(".tstage").forEach(function (g) { g.classList.add("on"); });
        mount.appendChild(clone);
      }
      var pdf = document.getElementById("btnPdf");
      var share = document.getElementById("btnShare");
      if (pdf) pdf.addEventListener("click", function () { makePdf(false, pdf); });
      if (share) share.addEventListener("click", function () { makePdf(true, share); });
    }
  }

  /* ---------------- events ---------------- */

  screenEl.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    if (!act) return;

    if (act === "go" || act === "back") { go(btn.getAttribute("data-to")); return; }
    if (act === "next") { next(state.screen, screenAfter(state.screen)); return; }

    if (act === "restart") {
      if (window.confirm("Start a new tree? Everything on this device will be cleared.")) {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        state = JSON.parse(JSON.stringify(defaultState));
        render();
        window.scrollTo(0, 0);
      }
      return;
    }

    if (act === "emo-group") { state._emoGroup = btn.getAttribute("data-key"); render(); return; }

    if (act === "pick") {
      var list = btn.getAttribute("data-list");
      var w = btn.getAttribute("data-w");
      var arr = state[list];
      var cap = list === "body" ? 2 : 3;
      var at = arr.indexOf(w);
      if (at !== -1) arr.splice(at, 1);
      else { if (arr.length >= cap) arr.shift(); arr.push(w); }
      save(); render(); return;
    }

    if (act === "unpick") {
      state[btn.getAttribute("data-list")].splice(parseInt(btn.getAttribute("data-i"), 10), 1);
      save(); render(); return;
    }

    if (act === "add-custom") {
      var input = document.getElementById(btn.getAttribute("data-input"));
      var val = ((input && input.value) || "").trim();
      if (!val) return;
      var l = btn.getAttribute("data-list");
      if (state[l].indexOf(val) === -1) {
        if (state[l].length >= 3) state[l].shift();
        state[l].push(val);
      }
      save(); render(); return;
    }

    if (act === "add-belief" || act === "add-new-belief") {
      var target = act === "add-belief" ? state.oldBeliefs : state.newBeliefs;
      var entry = { id: state.beliefSeq++, kind: btn.getAttribute("data-kind"), text: "" };
      if (act === "add-belief") entry.tag = null;
      target.push(entry);
      save(); render();
      var sel = act === "add-belief" ? "[data-belief]" : "[data-new-belief]";
      var all = screenEl.querySelectorAll(sel);
      if (all.length) all[all.length - 1].focus();
      return;
    }

    if (act === "remove-belief") {
      var rid = parseInt(btn.getAttribute("data-id"), 10);
      state.oldBeliefs = state.oldBeliefs.filter(function (b) { return b.id !== rid; });
      delete state.reframes[rid];
      save(); render(); return;
    }

    if (act === "remove-new-belief") {
      var nid = parseInt(btn.getAttribute("data-id"), 10);
      state.newBeliefs = state.newBeliefs.filter(function (b) { return b.id !== nid; });
      save(); render(); return;
    }

    if (act === "tag-belief") {
      var tid = parseInt(btn.getAttribute("data-id"), 10);
      var tag = btn.getAttribute("data-tag");
      state.oldBeliefs.forEach(function (b) { if (b.id === tid) b.tag = (b.tag === tag ? null : tag); });
      save(); render(); return;
    }

    if (act === "soften") {
      state.reframes[btn.getAttribute("data-id")] = btn.getAttribute("data-text");
      save(); render(); return;
    }
  });

  screenEl.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.hasAttribute("data-bind")) {
      state[el.getAttribute("data-bind")] = el.value;
    } else if (el.hasAttribute("data-bind-arr")) {
      state[el.getAttribute("data-bind-arr")][parseInt(el.getAttribute("data-i"), 10)] = el.value;
    } else if (el.hasAttribute("data-bind-ab")) {
      state.atBest[el.getAttribute("data-bind-ab")] = el.value;
      var hero = document.getElementById("heroPreview");
      if (hero) hero.innerHTML = heroSentenceHtml();
    } else if (el.hasAttribute("data-belief")) {
      var bid = parseInt(el.getAttribute("data-belief"), 10);
      state.oldBeliefs.forEach(function (b) { if (b.id === bid) b.text = el.value; });
    } else if (el.hasAttribute("data-reframe")) {
      var rid = el.getAttribute("data-reframe");
      state.reframes[rid] = el.value;
      showNudge("reframe-" + rid, el.value);
    } else if (el.hasAttribute("data-new-belief")) {
      var nid = parseInt(el.getAttribute("data-new-belief"), 10);
      state.newBeliefs.forEach(function (b) { if (b.id === nid) b.text = el.value; });
      showNudge("new-" + nid, el.value);
    }
    save();
  });

  /* ---------------- the document ---------------- */

  function fileName() {
    var n = String(state.name || "").trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    return n ? "Tree-of-Clarity-" + n + ".pdf" : "Tree-of-Clarity.pdf";
  }

  function makePdf(shareIt, btn) {
    if (!window.TocReport) { window.alert("Still loading. Try again in a moment."); return; }
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";
    var done = function () { btn.disabled = false; btn.textContent = label; };

    TocReport.build(state, { blob: shareIt }).then(function (out) {
      if (!shareIt) { done(); return; }
      var file = new File([out], fileName(), { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "My Tree of Clarity" })
          .catch(function () {}).then(done, done);
      } else {
        var url = URL.createObjectURL(out);
        var a = document.createElement("a");
        a.href = url; a.download = fileName(); a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        done();
      }
    }).catch(function (e) {
      done();
      window.alert("Could not build the PDF: " + e.message);
    });
  }

  /* expose the bits the report needs */
  window.TocText = {
    filled: filled, listify: listify, midSentence: midSentence,
    lcFirst: lcFirst, stripLeadingI: stripLeadingI, stripFullStop: stripFullStop,
    afterLabel: afterLabel, fileName: fileName
  };

  render();
})();
