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
        "must": ["Join the waiting list", "data-woema-date", "/woema/", 'data-wl="couples-communication"',
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
    # The page that shows both books. It sat at R270 on both of them for
    # weeks after the prices changed, which is how somebody arrives at a
    # checkout that asks for a different number than the page promised.
    "books": {
        "must": ["The Empowering Truth of Responsibility", "10 Habits of Happy Relationships",
                 "/books/responsibility/", "/books/habits/", "R147", "R197"],
        "must_not": ["R270", "Free", "free ebook", "paystack.com/buy/"],
    },
    # Each must deliver the book AND open the course, if one was added at
    # checkout. The panel is empty markup until /api/claim fills it in, so
    # the guard checks the markup and the script that reaches for it: without
    # both, a buyer pays R297 for a course and never hears about it again.
    "thanks/responsibility": {
        # Post-purchase delivery + the added course + one upsell.
        "must": ["Download the ebook", "/api/download?book=responsibility",
                 "noindex", "Download your copy", "Save it somewhere",
                 "The Foundations of Clarity", "oto_view",
                 'id="opened"', 'id="op-title"', 'id="op-body"', 'id="op-cta"',
                 "/assets/claim.js"],
        "must_not": ["files/d/", "Pattern Breaker"],
    },
    "thanks/habits": {
        # Post-purchase delivery + the added course + one upsell.
        "must": ["Download the ebook", "/api/download?book=habits",
                 "noindex", "Download your copy", "Save it somewhere",
                 "oto_view",
                 'id="opened"', 'id="op-title"', 'id="op-body"', 'id="op-cta"',
                 "/assets/claim.js"],
        "must_not": ["files/d/", "Pattern Breaker"],
    },
    # Free from 30 Sep 2026: this book became the lead magnet, so the page
    # captures an email instead of taking R270. The guard was asserting the
    # old truth and correctly refused the deploy until it was told.
    # Both books are paid again from 10 Oct 2026, each with a one-click course
    # added at checkout. The old prices and the old Paystack buy links must not
    # creep back: the amount is worked out in /api/checkout now, and a stray buy
    # link would take money this site could not deliver against.
    "books/responsibility": {
        "must": ['data-book="responsibility"', 'data-price="14700"',
                 'data-bump-price="29700"', "assets/buy.js",
                 "For when you already know and still do not move", "responsibility-inside.png"],
        "must_not": ["noindex", "10-habits-of-happy", "paystack.com/buy/", "R270",
                     # the bump must never read as the book again
                     "based on the book", "course version"],
    },
    "books/habits": {
        "must": ['data-book="habits"', 'data-price="19700"',
                 'data-bump-price="29700"', "assets/buy.js",
                 "Why one of you chases and the other goes silent", "habits-inside.png"],
        "must_not": ["noindex", "read free", "the-empowering-truth",
                     "paystack.com/buy/", "R270",
                     "based on the book", "course version"],
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
    # WOEMA, the paid three-hour workshop (R1,500), built 15 Sep 2026. Its
    # dates are rewritten from his calendar by launch/events.py, so the
    # markers must survive every edit or the page freezes on an old date.
    # Public and shareable, unlike /events/: it must never pick up noindex.
    "woema": {
        "must": ["WOEMA", "Get out of your own way", "Understand your own potential",
                 "Find what's blocking it", "Reshape your paradigm",
                 "data-woema-date", "data-woema-time", "data-woema-where",
                 # one next date and the waiting list (16 Sep 2026)
                 "/api/waitlist", "event: 'woema'",
                 "/api/woema", "woema/og.png", 'id="reserve"', "0800 567 567",
                 # free, and the invitation to bring somebody (28 Sep 2026)
                 "Free", "I'd like to invite a friend", 'id="w-gift"', "action: 'reserve'",
                 "https://events.francoisesterhuizen.com/woema/"],
        "must_not": ["noindex", "mailto:", "Pattern Breaker", "once a month",
                     "resources.francoisesterhuizen.com/woema", "no payment on this page",
                     "How would you like to pay", "EFT, or I'm outside South Africa",
                     "three times", "three weeks apart", "every school term", "data-woema-stops",
                     # it is free now: no price, no card, no invoice, anywhere on the page
                     "R1,500", "R900", "R1,000", "R2,000", "paystack", "invoice",
                     "Are you part of one of my programmes?"],
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

# Reader-facing copy in a .js file lives in its string literals. Comments and
# code are not shown to anybody, so only the literals are judged: a comment
# explaining that something fails quietly is not a voice breach, and a line of
# copy inside quotes is.
STRINGS = re.compile(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"|`(?:\\.|[^`\\])*`", re.S)

def check_buybox():
    """The buy box is built in JavaScript, so nothing in the HTML proves the
    fields are there. Francois asked for a phone number on 10 Oct 2026 so he
    can follow a buyer up, and asked for the browser to fill all three in.
    Autofill only happens for named fields inside a real form, so the form
    and the names are the feature, not decoration."""
    import pathlib as _pl
    js = (_pl.Path(__file__).parent / "assets" / "buy.js").read_text()
    need = ['id="bx-form"', 'name="name"', 'name="email"', 'name="tel"',
            'autocomplete="name"', 'autocomplete="email"', 'autocomplete="tel"',
            'type="submit"', 'tidyPhone']
    missing = [n for n in need if n not in js]
    if missing:
        print("FAIL buy-box                           [local] assets/buy.js is missing: %s" % ", ".join(missing))
        return False
    print("ok   buy-box                           [local] name, email and phone, named and autofillable")
    return True

def check_bump_counts():
    """A bump may only promise what the course delivers. The responsibility
    page said seventeen lessons for sixteen weeks after the course was
    attached, and its bump described asking for what you want, which is one
    lesson out of sixteen. A buyer who counts is a buyer who writes to you.

    These numbers come from the platform, where the courses live:
    clarity-fundamentals has 16 published lessons, relationship-growth has 5.
    If a course gains or loses a lesson, change it here and on the page in the
    same breath."""
    import pathlib as _pl
    base = _pl.Path(__file__).parent
    bad = []
    r = (base / "books" / "responsibility" / "index.html").read_text()
    h = (base / "books" / "habits" / "index.html").read_text()
    if "sixteen short" not in r.lower():
        bad.append("books/responsibility does not say sixteen lessons")
    if "seventeen" in r.lower():
        bad.append("books/responsibility still promises seventeen lessons; the course has sixteen")
    if "five short" not in h.lower():
        bad.append("books/habits does not say five lessons")
    if bad:
        for b in bad:
            print("FAIL bump-counts                       [local] %s" % b)
        return False
    print("ok   bump-counts                       [local] each bump promises what its course delivers")
    return True

def check_prices_agree():
    """One price per book, everywhere a reader can see it. The books index
    sat at R270 for weeks after the change, and /library/ was still showing
    R270 after that was fixed, because nobody swept the second place. Every
    page that names a price is checked against the one in /api/checkout,
    which is the only place the amount is really decided.

    Also Francois, 10 Oct 2026: everything on the resources site is a low
    ticket offer. Anything over R500 shown here needs a reason."""
    import pathlib as _pl, re as _re
    base = _pl.Path(__file__).parent
    api = (base / "functions" / "api" / "checkout.js").read_text()
    want = {}
    for slug, cents in _re.findall(r"(\w+):\s*\{[^}]*?price:\s*(\d+)", api, _re.S):
        if slug in ("responsibility", "habits"):
            want[slug] = "R%d" % (int(cents) / 100)
    bad = []
    if set(want) != {"responsibility", "habits"}:
        bad.append("could not read both prices out of /api/checkout")
    stale = set()
    for f in sorted(base.glob("*/index.html")) + sorted(base.glob("*/*/index.html")) + [base / "index.html"]:
        try: t = f.read_text()
        except Exception: continue
        for m in _re.findall(r"R ?\d[\d  ,]{1,7}", t):
            v = m.replace(" ", "").replace("\u00a0", "").rstrip(",")
            if v in want.values():
                continue
            stale.add("%s shows %s" % (f.relative_to(base), v))
# Named exceptions. Each one is a price on this site that is not a book
    # price, left standing on purpose and not by accident. 
    # Named exceptions, each a price on this site that is not a book price and
    # stands on purpose. Empty since 11 Oct 2026: the R1 200 Cracking the
    # Conflict Code upsell came off the habits thank-you page on his word,
    # "it will no longer use that funnel because we now have a different
    # landing page with the bumps for the book". Nothing on this site is above
    # the low ticket line any more. Adding to this set is a deliberate act.
    OK_OVER = set()
    for row in sorted(stale):
        amount = int(_re.search(r"R(\d+)", row.split()[-1]).group(1))
        if row in OK_OVER:
            continue
        bad.append("%s, which is not one of %s" % (row, ", ".join(sorted(want.values()))))
    if bad:
        for b in bad[:8]:
            print("FAIL prices-agree                      [local] %s" % b)
        return False
    print("ok   prices-agree                      [local] every page shows %s" % ", ".join(sorted(want.values())))
    return True

def check_oneclick_rail():
    """The rail that bumps two and three ride on. It is built and switched
    off: every offer in /api/upsell has enabled=false and the page shows
    nothing until one is turned on. The guard holds the pieces together so a
    half-wired rail cannot ship, and it counts how many offers are live so
    turning one on is a deliberate act somebody notices.

    When Francois picks what goes in bump two and three, set enabled true,
    give the offer a deliver, and update EXPECT_LIVE below."""
    import pathlib as _pl, re as _re
    base = _pl.Path(__file__).parent
    EXPECT_LIVE = 2
    bad = []
    api = (base / "functions" / "api" / "upsell.js").read_text()
    js = (base / "assets" / "upsell.js").read_text()
    live = len(_re.findall(r"enabled:\s*true", api))
    if live != EXPECT_LIVE:
        bad.append("%d offer(s) are switched on in /api/upsell but EXPECT_LIVE is %d" % (live, EXPECT_LIVE))
    for n in ("onRequestGet", "onRequestPost", "charge_authorization", "WINDOW_MINUTES", "reusable !== true"):
        if n not in api:
            bad.append("functions/api/upsell.js is missing %s" % n)
    if "needsCheckout" not in js:
        bad.append("assets/upsell.js does not handle a card that cannot be charged again")
    for slug in ("habits", "responsibility"):
        page = (base / "thanks" / slug / "index.html").read_text()
        for n in ('id="oneclick"', 'id="oc-title"', 'id="oc-go"', "/assets/upsell.js"):
            if n not in page:
                bad.append("thanks/%s is missing %s" % (slug, n))
    if bad:
        for b in bad:
            print("FAIL oneclick-rail                    [local] %s" % b)
        return False
    print("ok   oneclick-rail                    [local] built, wired, and %d offers live" % live)
    return True

def check_free_book_off():
    """The free book and the paid book are the same book. Francois switched
    the free route off on 10 Oct 2026, once the paid funnel worked end to end
    and the two Wix pages feeding it were redirected. If either guard goes
    back to false, the site starts giving away a R147 book again and nothing
    would say so."""
    import pathlib as _pl
    base = _pl.Path(__file__).parent
    bad = []
    if "const OFF = true;" not in (base / "functions" / "api" / "ebook.js").read_text():
        bad.append("functions/api/ebook.js is minting free gift links again")
    if "const GIFTS_OFF = true;" not in (base / "functions" / "api" / "download.js").read_text():
        bad.append("functions/api/download.js is honouring free gift links again")
    for f in sorted(base.glob("*/index.html")) + sorted(base.glob("*/*/index.html")) + [base / "index.html"]:
        try: t = f.read_text()
        except Exception: continue
        if "/api/ebook" in t:
            bad.append("%s still points at the free book" % f.relative_to(base))
    if bad:
        for b in bad:
            print("FAIL free-book-off                     [local] %s" % b)
        return False
    print("ok   free-book-off                     [local] nothing gives the paid book away")
    return True

def check_banned_words():
    """Fail the deploy if a banned word reaches a reader. Born 21 Aug 2026,
    after 'quietly' turned up in a live sales page and two assessment results
    despite being a standing rule.

    Widened 10 Oct 2026 to the scripts. The guard only ever read index.html
    with its <script> blocks stripped, which was right when every page was
    static. It is not right any more: the buy box, the order bump and the
    course panel are all built by assets/*.js, and the words a buyer reads at
    the moment of paying were the one place on this site nothing checked.
    """
    import pathlib as _pl
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
    for f in sorted(base.glob("assets/*.js")) + sorted(base.glob("functions/**/*.js")):
        try: text = f.read_text()
        except Exception: continue
        for lit in STRINGS.finditer(strip_verbatim(text)):
            body = lit.group(0)
            for word, why in BANNED.items():
                for m in re.finditer(re.escape(word), body, re.I):
                    bad.append((f.relative_to(base), word, why, " ".join(body.split())[:110]))
    if bad:
        for f, w, why, sn in bad[:12]:
            print("FAIL banned-words                      [local] %s uses %r (%s)" % (f, w, why))
            print("       ...%s..." % sn)
        return False
    print("ok   banned-words                      [local] no banned wording on any page or in any script")
    return True

LIVE_AT = {
    "events": "https://events.francoisesterhuizen.com/",
    "woema": "https://events.francoisesterhuizen.com/woema/",
}

def fetch_live(url, tries=5):
    """Fetch a live page, retrying a connection failure before calling it broken.

    This connection drops TLS every so often, which is a fault of the route
    rather than of the deploy. A single attempt failing made the deploy script
    announce that a page was not serving what it should and tell Francois to
    roll back a deployment that was in fact fine. A check that cries wolf is
    worse than no check, because it teaches you to ignore it.

    A page that answers and is missing its markers still fails, immediately.
    Only the not-answering case is retried.

    Raised from three tries to five on 5 Oct 2026. Three was not enough: the
    route dropped every attempt inside one seven-second window and the deploy
    announced a failure that passed cleanly on a re-run minutes later. Five
    tries spread over about 26 seconds covers the outages seen so far.
    """
    import time
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh) gate-check"})
            return urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore"), None
        except Exception as e:
            last = e
            if attempt < tries - 1:
                time.sleep(2 + attempt * 3)   # 2, 5, 8, 11s
    return None, last


def main():
    base = pathlib.Path(__file__).parent
    live = "--live" in sys.argv
    all_ok = check_goal_words()
    all_ok &= check_no_attraction_items()
    all_ok &= check_ai_giveaways()
    all_ok &= check_discreet_subjects()
    all_ok &= check_banned_words()
    all_ok &= check_buybox()
    all_ok &= check_free_book_off()
    all_ok &= check_bump_counts()
    all_ok &= check_prices_agree()
    all_ok &= check_oneclick_rail()
    for name in GATES:
        html = (base / name / "index.html").read_text()
        all_ok &= check(name, html, "local")
        if live:
            # /events/ and /woema/ live on their own address since 16 Sep 2026
            url = LIVE_AT.get(name) or "https://resources.francoisesterhuizen.com/" + (name + "/" if name else "")
            h, err = fetch_live(url)
            if h is None:
                print("FAIL %-32s [live] unreachable after 5 tries: %s" % (name, err)); all_ok = False
            else:
                all_ok &= check(name, h, "live")
    sys.exit(0 if all_ok else 1)

main()
