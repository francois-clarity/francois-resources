#!/usr/bin/env python3
"""Verify every gate page says what it claims to be. Run before AND after
deploy. A gate that fails any check blocks the deploy.

Born 5 Aug 2026, after the Headlights System page shipped with the Pattern
Breaker's entire content: the clone-and-swap missed strings that span HTML
tags, and the old 'verification' only checked HTTP 200 and the form tag.
Francois caught it live: "You have to build in checks so this does not
happen."
"""
import pathlib, re, sys, urllib.request

GATES = {
    # "" is the funnel welcome at the site root (since 2026-08-19).
    # It must split into Personal / Relational. It must NOT offer the library:
    # decided 2026-08-20, everyone goes through the gate rather than browsing.
    "": {
        "must": ["Something for me", "Something for us",
                 "/personal/", "/relational/",
                 "landing_choice_personal", "landing_choice_relational",
                 "funnel.css", "funnel.js"],
        "must_not": ["Story of Us", "storyofus", "Pattern Breaker", "/library/"],
    },
    # The full catalogue, formerly the root.
    "library": {
        "must": ["The Empowering Truth of Responsibility",
                 "10 Habits of Happy Relationships",
                 "/books/responsibility/", "/books/habits/",
                 "Pattern Breaker", "Headlights", "Unstuck Loop Map",
                 "Emotional Language Wheel", "The Tree of Clarity",
                 "Belief Inventory", "Four Voices", "Invisible Contracts",
                 "Family Mobile",
                 "Personal Growth Weekly"],
        "must_not": ["Story of Us", "storyofus"],
    },
    # Funnel qualifier pages. Each must set its path and load the shared logic.
    "personal": {
        "must": ['data-path="personal"', "qualifier.js", "funnel.js", 'id="qualifier"'],
        "must_not": ['data-path="relational"', "Story of Us", "/library/"],
    },
    "relational": {
        "must": ['data-path="relational"', "qualifier.js", "funnel.js", 'id="qualifier"'],
        "must_not": ['data-path="personal"', "Story of Us", "/library/"],
    },
    "events": {
        # Unlisted events page. Every workshop must offer a waiting list, and
        # the page must always carry a general one, so somebody arriving when
        # nothing is scheduled still has somewhere to put their name.
        "must": ["Join the waiting list", 'data-wl="couples-communication"',
                 'data-wl="confidence-with-claude"', 'data-wl="general"',
                 "/api/waitlist", 'name="phone"', 'name="email"', 'name="name"',
                 "noindex"],
        # a mailto loses everybody without a mail client configured
        "must_not": ["mailto:", "Pattern Breaker"],
    },
    "thanks": {
        "must": ["thankyou_view_", "tool_open_", "paid_tease_click_", "wa.me/27824441831"],
        "must_not": ["Story of Us", "/library/"],
    },
    "thanks/responsibility": {
        # Post-purchase delivery + one upsell (Foundations of Clarity).
        "must": ["Download the ebook", "/api/download?book=responsibility",
                 "noindex", "Download your copy", "Save it somewhere",
                 "The Foundations of Clarity", "oto_view"],
        "must_not": ["files/d/", "Pattern Breaker"],
    },
    "thanks/habits": {
        # Post-purchase delivery + one upsell (Cracking the Conflict Code).
        "must": ["Download the ebook", "/api/download?book=habits",
                 "noindex", "Download your copy", "Save it somewhere",
                 "Cracking the Conflict Code", "R1 200", "oto_view"],
        "must_not": ["files/d/", "Pattern Breaker"],
    },
    "books/responsibility": {
        "must": ["paystack.com/buy/the-empowering-truth-of-responsibility", "R270",
                 "responsibility-inside.png"],
        "must_not": ["noindex", "read free", "10-habits-of-happy"],
    },
    "books/habits": {
        "must": ["paystack.com/buy/10-habits-of-happy-relationships", "R270",
                 "habits-inside.png"],
        "must_not": ["noindex", "read free", "the-empowering-truth"],
    },
    "communication-styles": {
        # Free front door for the relational ladder. Built on the Romantic
        # Support-Seeking subscales. Email at the END, never the start.
        # No pronoun picker: the copy says "your partner" throughout, decided
        # 7 Sep 2026. The gate refuses a picker coming back by the side door.
        "must": ["Communication Styles", "Question 1 of 20",
                 "The Straight Ask", "The Reach", "The Long Way Round", "The Closed Door",
                 "What this gives your partner", "What it costs your partner",
                 "The gap between the two", "capitalization",
                 "Romantic Support-Seeking", "Christensen and Heavey",
                 "/api/assessment", "Show me my style", "also land in your inbox",
                 "/conflict-styles/", "Much love",
                 'role="radiogroup"', "setAttribute('role', 'radio')", "localStorage",
                 "out of 100", "Two to three minutes"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map",
                     "people with this style", "Some people walk in",
                     # the staging domain must never be visible in a CTA again
                     "survival-instinct-assessment.netlify.app",
                     'placeholder="Francois"'],
    },
    "windows-and-walls": {
        # Affair prevention, built on Glass. Three rules this gate enforces,
        # each from the research brief of 7 Sep 2026:
        #   1. no attraction items. Attraction is universal and predicts
        #      nothing; secrecy is the mechanism. Asking about it produces
        #      guilt and no signal.
        #   2. the email is OPTIONAL and comes AFTER results. A results email
        #      in a shared inbox is the exact harm this tool prevents.
        #   3. it never tells anybody to disclose an affair. That decision
        #      needs a person, not a page.
        "must": ['id="s-mail"', "Show me my results", "plain subject line", "Windows and Walls", "Question 1 of 17",
                 "Facing In", "Separate Rooms", "The Open Door", "Turned Around",
                 "built out of secrecy", "Is there a particular person",
                 "What is working", "Where it is thin", "The one move this week",
                 "This one stays on your phone", "0800 567 567", "0800 150 150",
                 "/api/assessment", "noindex", "Much love",
                 'role="radiogroup"', "localStorage"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map",
                     "survival-instinct-assessment.netlify.app",
                     "people with this style",
                     # never instruct disclosure of an affair
                     "you must tell", "confess to your partner",
                     ],
    },
    "two-different-problems": {
        # Porn, deliberately NOT an addiction test. Grubbs's finding is that
        # self-reported addiction tracks moral disapproval more than actual
        # use, so a single severity score would mostly measure shame and hand
        # it back with a clinical word on it. Two scales, never summed.
        "must": ['id="s-mail"', "Show me my results", "plain subject line", "Two Different Problems", "Question 1 of 14",
                 "Not The Thing", "The Fight With Yourself", "The Slow Leak", "Caught Between",
                 "What it is costing you", "how far it sits from what you believe",
                 "moral incongruence", "impulse control disorder",
                 "Compulsive Sexual Behaviour Disorder",
                 "This one stays on your phone", "0800 567 567",
                 "/api/assessment", "noindex", "Much love",
                 'role="radiogroup"', "localStorage", "/ 100"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map",
                     "survival-instinct-assessment.netlify.app",
                     # it must never hand somebody a verdict
                     "you are an addict", "you have an addiction",
                     "your score indicates", "severity level",
                     "sex addict", "porn addict."],
    },
    "invisible-contracts": {
        # Rebuilt 9 Sep 2026. He walked the old one before a PGW class and said
        # it was too much text, overwhelming and full of AI giveaways. Eleven
        # steps and 10,000 words became six steps and about 1,650, with one
        # destination: the contract in his words, and the request that replaces
        # it. These markers hold that shape.
        "must": ["/assets/capture.js", "CAPTURE.mount",
                 "Invisible Contracts", "Step 1 of 6",
                 "Where did you feel it", "Write the deal",
                 "then WHO should", "It means", "Where did you sign it",
                 "What I want is", "Would you be willing",
                 "Null and void", "underage when you signed",
                 "implicit relational knowing", "Boszormenyi-Nagy",
                 "Much love"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map",
                     # the sprawl that made it overwhelming
                     "Your family motto", "Your brothers and sisters",
                     "Which one sits deepest"],
    },
    "four-voices": {
        # Thoughts layer. No email gate; markers are content.
        "must": ["/assets/capture.js", "CAPTURE.mount", "Four Voices", "toc-voices", "The judge", "The cheerleader",
                 "The comforter", "The coach", "tried everything"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "belief-inventory": {
        # Guided sweep by life domain. No email gate; markers are content.
        "must": ["/assets/capture.js", "CAPTURE.mount", "Belief Inventory", "toc-inventory", "What you would say",
                 "What you live", "Identity statements"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "tree-of-clarity": {
        # Companion tool, no email gate. Markers are content.
        "must": ["/assets/capture.js", "CAPTURE.mount", "The Belief System Model", "toc-beliefs", "Identity statement",
                 "It excuses me", "badly outdated", "the belief system model",
                 "Three thoughts in total", "At least one of each",
                 "The comforter", "Between people", "toc-progress"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "emotional-language-wheel": {
        # No email gate on this one, so the markers are content, not MMERGE2.
        "must": ["/assets/capture.js", "CAPTURE.mount", "Emotional Language Wheel", "elw-checkins",
                 "Which of these is closest", "emotional granularity"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    # Guided-journey rebuild (other session) + funnel-aware email gate:
    # funnel visitors skip the gate (isFunnel), direct visitors get a soft
    # ask with a skip link (skipmail). Tracking restored (tool_start).
    "unstuck-loop-map": {
        "must": ["backbtn", "trail", "Back", "Unstuck Loop Map", "data-yt", "youtube-nocookie",
                 "MMERGE2=unstuck-loop-map", "isFunnel", "skipmail",
                 "tool_start", "placeholder="],
        "must_not": ["Pattern Breaker", "Headlights"],
    },
    # Guided-journey rebuild (other session) + funnel-aware email gate:
    # funnel visitors skip the gate (isFunnel), direct visitors get a soft
    # ask with a skip link (skipmail). Tracking restored (tool_start).
    "procrastination-pattern-breaker": {
        "must": ["backbtn", "trail", "Back", "Pattern Breaker", "data-yt", "youtube-nocookie",
                 "MMERGE2=pattern-breaker", "isFunnel", "skipmail",
                 "tool_start", "placeholder="],
        "must_not": ["Headlights", "Loop Map"],
    },
    # Interactive rebuild in progress (other session). Email form stays for
    # now: YouTube-direct visitors never pass the funnel gate, so this page
    # is its own capture point until that routing is decided.
    "headlights-system": {
        "must": ["backbtn", "trail", "Back", "Headlights", "MMERGE2=headlights-system",
                 "youtube-nocookie", "placeholder=", "next visible move"],
        "must_not": ["Pattern Breaker", "avoiding the feeling", "Loop Map"],
    },
    # Interactive rebuild (commit b3e7244): guided journey, no card-PDF
    # download. MMERGE2 here is the background tag sync, not an email ask.
    "ten-year-question": {
        "must": ["backbtn", "trail", "Back", "Ten-Year", "ten years", "MMERGE2=ten-year-question",
                 "youtube-nocookie", "placeholder="],
        "must_not": ["Headlights", "two-minute test", "Pattern Breaker"],
    },
}

def check(name, html, where):
    ok = True
    spec = GATES[name]
    for m in spec["must"]:
        if m.lower() not in html.lower():
            print("FAIL %-32s [%s] missing: %r" % (name, where, m)); ok = False
    for m in spec["must_not"]:
        if m.lower() in html.lower():
            print("FAIL %-32s [%s] contains leftover: %r" % (name, where, m)); ok = False
    if ok: print("ok   %-32s [%s]" % (name, where))
    return ok


def check_goal_words():
    """Every emotion named in the goals examples must exist in the wheel, or a
    reader will search for it and be told nothing matches. Born 15 Aug 2026:
    the examples said "Calm, curious, steady" and the wheel had none of the
    three except curious."""
    import pathlib as _pl
    html = (_pl.Path(__file__).parent / "tree-of-clarity" / "index.html").read_text()
    # anchor on the examples array, not on blankState's empty goals:[]
    m = re.search(r"goals:\[\s*\n(.*?)\n\s*\]", html, re.S)
    if not m or '"' not in m.group(1):
        print("FAIL goal-words                        [local] goals examples not found"); return False
    words = set()
    for line in re.findall(r'"([^"]+)"', m.group(1)):
        for w in line.split(","):
            w = w.strip()
            if w: words.add(w)
    wheel = set(w.lower() for w in re.findall(r'\["([A-Z][a-z]+)",\s*"', html))
    missing = sorted(w for w in words if w.lower() not in wheel)
    if missing:
        print("FAIL goal-words                        [local] not in the wheel: %s" % ", ".join(missing))
        return False
    print("ok   goal-words                        [local] all %d in the wheel" % len(words))
    return True


def strip_verbatim(html):
    """Remove any element marked data-verbatim, nesting and all.

    His own published words are not ghostwriting tics. Chapter One of the
    responsibility book is literally called "How taking responsibility for
    these things changes everything", so the banned-phrase check must not
    demand that his book be reworded. Depth tracking rather than a lazy regex,
    because the marked element contains nested tags of the same name and a
    non-greedy match closes on the first inner tag.
    """
    out, pos = [], 0
    for m in re.finditer(r"<([a-z]+)[^>]*\bdata-verbatim\b[^>]*>", html, re.I):
        if m.start() < pos:
            continue
        tag = m.group(1)
        out.append(html[pos:m.start()])
        depth, i = 1, m.end()
        pattern = re.compile(r"</?%s\b[^>]*>" % re.escape(tag), re.I)
        while depth and i < len(html):
            t = pattern.search(html, i)
            if not t:
                i = len(html)
                break
            depth += -1 if t.group(0).startswith("</") else 1
            i = t.end()
        pos = i
    out.append(html[pos:])
    return " ".join(out)


def check_no_attraction_items():
    """Windows and Walls must never ask about attraction, only about secrecy.

    Glass's finding is that attraction is universal and predicts nothing, while
    secrecy is the actual mechanism. An attraction item would produce guilt and
    no signal, and would make the tool feel like an accusation to the person who
    most needs it. The page is allowed to SAY it does not ask about attraction,
    so this scans the item bank rather than the whole page.
    """
    import pathlib as _pl
    f = _pl.Path(__file__).parent / "windows-and-walls" / "index.html"
    html = f.read_text()
    m = re.search(r"var ITEMS = \[([\s\S]*?)\n\];", html)
    if not m:
        print("FAIL attraction-items                  [local] item bank not found"); return False
    bank = m.group(1).lower()
    banned = ["attract", "fancy", "desire", "chemistry", "tempt", "flirt"]
    hits = [w for w in banned if w in bank]
    if hits:
        print("FAIL attraction-items                  [local] item bank asks about %s" % ", ".join(hits))
        return False
    print("ok   attraction-items                  [local] item bank asks about secrecy, not attraction")
    return True


GIVEAWAY_SECTIONS = [
    "Inflated verbs", "Copula-dodging verbs", "Corporate and brochure adjectives",
    "Prestige and metaphor nouns", "Connective adverbs", "The softening adverbs family",
]

def _prose(path):
    """Reader-facing words only: no script, no style, no comments, no URLs."""
    t = path.read_text()
    h = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", t, flags=re.I)
    h = re.sub(r"<!--[\s\S]*?-->", " ", h)
    out = re.sub(r"<[^>]+>", " ", h)
    for s in re.findall(r'"((?:[^"\\]|\\.){25,})"', t) + re.findall(r"'((?:[^'\\]|\\.){25,})'", t):
        if re.search(r"https?://|\.js|\.css|rgba|[0-9]px|function|innerHTML|querySelector|addEventListener|<[a-z]", s):
            continue
        out += " " + s
    return re.sub(r"\s+", " ", out)


def check_ai_giveaways():
    """Francois, 9 Sep 2026: "Almost all the assessments we have built reek of
    AI. Reference the skill I created ... and ALWAYS apply that to creating
    assessments or resources."

    The blacklist itself says density is the tell, not any single word, and
    that a hit is a flag for judgement rather than an auto-delete. So this
    counts rather than bans, and fails only above a density no honest page
    reaches. His own hard bans stay in check_banned_words, at zero tolerance.

    Source of truth is the skill file, read at deploy time, so adding a term
    there tightens every page here without touching this script.
    """
    import pathlib as _pl
    gv = _pl.Path.home() / ".claude/skills/francois-copywriter/ai-giveaways.md"
    if not gv.exists():
        print("ok   ai-giveaways                     [local] blacklist not on this machine, skipped")
        return True
    text = gv.read_text()
    terms = set()
    for head in GIVEAWAY_SECTIONS:
        m = re.search(r"### " + re.escape(head) + r"\n(.+?)\n", text, re.S)
        if not m:
            continue
        for raw in m.group(1).split(","):
            w = re.sub(r"\s*\(.*?\)\s*", "", raw.strip().strip('."')).strip().lower()
            if 3 < len(w) < 30:
                terms.add(w)

    base = _pl.Path(__file__).parent
    worst = []
    for f in sorted(base.glob("*/index.html")) + sorted(base.glob("*/*/index.html")):
        low = " " + _prose(f).lower() + " "
        words = len(low.split())
        if words < 200:
            continue
        hits = {}
        for w in terms:
            n = len(re.findall(r"\b" + re.escape(w) + r"\b", low))
            if n:
                hits[w] = n
        total = sum(hits.values())
        per1k = total / words * 1000
        if per1k >= 4.0:
            worst.append((per1k, f.relative_to(base), hits))

    if worst:
        for per1k, name, hits in sorted(worst, reverse=True)[:6]:
            top = ", ".join("%s x%d" % (w, n) for w, n in sorted(hits.items(), key=lambda x: -x[1])[:5])
            print("FAIL ai-giveaways                     [local] %s reads as machine writing: %.1f per 1k words (%s)"
                  % (name, per1k, top))
        return False
    print("ok   ai-giveaways                     [local] %d blacklist terms, no page above the density threshold" % len(terms))
    return True


def check_discreet_subjects():
    """Windows and Walls and Two Different Problems both promise the reader a
    plain subject line that says nothing about the topic, because an inbox
    somebody else reads is the harm those two tools exist to prevent.

    That promise lives on the page, but keeping it depends on a subject line in
    a different file. This checks the two have not drifted apart.
    """
    import pathlib as _pl
    base = _pl.Path(__file__).parent
    api = (base / "functions" / "api" / "assessment.js").read_text()
    ok = True
    for tool in ("windows-and-walls", "two-different-problems"):
        m = re.search(r"'%s':\s*\{[^}]*\}" % re.escape(tool), api)
        if not m:
            print("FAIL discreet-subjects                [local] %s missing from the mailer table" % tool); ok = False; continue
        block = m.group(0)
        if "discreet: true" not in block:
            print("FAIL discreet-subjects                [local] %s lost its discreet flag" % tool); ok = False
        subj = re.search(r"subject:\s*'([^']*)'", block)
        if not subj:
            print("FAIL discreet-subjects                [local] %s has no subject line" % tool); ok = False; continue
        # the subject must not name the topic
        naming = ["affair", "porn", "secrecy", "windows", "walls", "cheat", "sex", "betray"]
        hit = [w for w in naming if w in subj.group(1).lower()]
        if hit:
            print("FAIL discreet-subjects                [local] %s subject names the topic: %r" % (tool, subj.group(1))); ok = False
        # and the page must still be making the promise
        page = (base / tool / "index.html").read_text()
        if "plain subject line" not in page:
            print("FAIL discreet-subjects                [local] %s no longer promises a plain subject line" % tool); ok = False
    if ok:
        print("ok   discreet-subjects                [local] both sensitive tools keep their plain subject promise")
    return ok


BANNED = {
    # Standing voice rules. These are not style preferences, they are rules he
    # has had to repeat, so the deploy enforces them rather than trusting memory.
    # The francois-copywriter skill is the source of truth; this mirrors it.
    "quiet": "the whole family is banned, quiet/quietly/quieter, including literal uses",
    "most people": "he never says this, find another way",
    "most couples": "same rule as most people",
    "most of us": "same rule as most people",
    "you're not broken": "banned 4 Aug 2026, not his sentence",
    "changes everything": "grandiose claim, he earns weight by precision",
    "\u2014": "em dash, never used",
    "\u2013": "en dash, never used",
}

def check_banned_words():
    """Fail the deploy if a banned word reaches a page. Born 21 Aug 2026, after
    'quietly' turned up in a live sales page and two assessment results despite
    being a standing rule."""
    import pathlib as _pl, glob as _glob
    base = _pl.Path(__file__).parent
    bad = []
    for f in sorted(base.glob("*/index.html")) + sorted(base.glob("*/*/index.html")) + [base / "index.html"]:
        try: text = f.read_text()
        except Exception: continue
        # strip script and style: the rule is about what a reader sees
        body = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", text, flags=re.I)
        body = strip_verbatim(body)
        for word, why in BANNED.items():
            for m in re.finditer(re.escape(word), body, re.I):
                snippet = " ".join(body[max(0, m.start()-40):m.start()+40].split())
                bad.append((f.relative_to(base), word, why, snippet))
    if bad:
        for f, w, why, sn in bad[:12]:
            print("FAIL banned-words                      [local] %s uses %r (%s)" % (f, w, why))
            print("       ...%s..." % sn)
        return False
    print("ok   banned-words                      [local] no banned wording on any page")
    return True

def main():
    base = pathlib.Path(__file__).parent
    live = "--live" in sys.argv
    all_ok = check_goal_words()
    all_ok &= check_no_attraction_items()
    all_ok &= check_ai_giveaways()
    all_ok &= check_discreet_subjects()
    all_ok &= check_banned_words()
    for name in GATES:
        html = (base / name / "index.html").read_text()
        all_ok &= check(name, html, "local")
        if live:
            try:
                url = "https://resources.francoisesterhuizen.com/" + (name + "/" if name else "")
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh) gate-check"})
                h = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
                all_ok &= check(name, h, "live")
            except Exception as e:
                print("FAIL %-32s [live] unreachable: %s" % (name, e)); all_ok = False
    sys.exit(0 if all_ok else 1)

main()
