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
    # It must split into Personal / Relational and link the full library.
    "": {
        "must": ["Something for me", "Something for us",
                 "/personal/", "/relational/", "/library/",
                 "landing_choice_personal", "landing_choice_relational",
                 "funnel.css", "funnel.js"],
        "must_not": ["Story of Us", "storyofus", "Pattern Breaker"],
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
        "must_not": ['data-path="relational"', "Story of Us"],
    },
    "relational": {
        "must": ['data-path="relational"', "qualifier.js", "funnel.js", 'id="qualifier"'],
        "must_not": ['data-path="personal"', "Story of Us"],
    },
    "thanks": {
        "must": ["thankyou_view_", "tool_open_", "paid_tease_click_", "wa.me/27824441831"],
        "must_not": ["Story of Us"],
    },
    "thanks/responsibility": {
        # Post-purchase delivery. Must hand over the right file and stay hidden.
        "must": ["Download the ebook", "/api/download?book=responsibility",
                 "noindex", "Download your copy", "Save it somewhere"],
        "must_not": ["files/d/", "Pattern Breaker"],
    },
    "thanks/habits": {
        "must": ["Download the ebook", "/api/download?book=habits",
                 "noindex", "Download your copy", "Save it somewhere"],
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
    "invisible-contracts": {
        # Contracts you keep. No email gate; markers are content.
        "must": ["Invisible Contracts", "ic-contracts", "then you should",
                 "if you do not, it means", "Null and void", "Would you be willing",
                 "underage when you signed"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "four-voices": {
        # Thoughts layer. No email gate; markers are content.
        "must": ["Four Voices", "toc-voices", "The judge", "The cheerleader",
                 "The comforter", "The coach", "tried everything"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "belief-inventory": {
        # Guided sweep by life domain. No email gate; markers are content.
        "must": ["Belief Inventory", "toc-inventory", "What you would say",
                 "What you live", "Identity statements"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "tree-of-clarity": {
        # Companion tool, no email gate. Markers are content.
        "must": ["The Belief System Model", "toc-beliefs", "Identity statement",
                 "It excuses me", "badly outdated", "the belief system model",
                 "Three thoughts in total", "At least one of each",
                 "The comforter", "Between people", "toc-progress"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "emotional-language-wheel": {
        # No email gate on this one, so the markers are content, not MMERGE2.
        "must": ["Emotional Language Wheel", "elw-checkins",
                 "Which of these is closest", "emotional granularity"],
        "must_not": ["Pattern Breaker", "Headlights", "Loop Map"],
    },
    "unstuck-loop-map": {
        "must": ["Unstuck Loop Map", "MMERGE2=loop-map"],
        "must_not": ["Pattern Breaker", "Headlights"],
    },
    "procrastination-pattern-breaker": {
        "must": ["Pattern Breaker", "MMERGE2=pattern-breaker",
                 "Procrastination_Pattern_Breaker.pdf"],
        "must_not": ["Headlights", "Loop Map"],
    },
    "headlights-system": {
        "must": ["Headlights", "MMERGE2=headlights-system",
                 "Headlights_System_Card.pdf", "next visible move"],
        "must_not": ["Pattern Breaker", "avoiding the feeling", "Loop Map"],
    },
    "ten-year-question": {
        "must": ["Ten-Year", "MMERGE2=ten-year-question",
                 "Ten_Year_Question_Card.pdf", "who you want to become"],
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

def main():
    base = pathlib.Path(__file__).parent
    live = "--live" in sys.argv
    all_ok = check_goal_words()
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
