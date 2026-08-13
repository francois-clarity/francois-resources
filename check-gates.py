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
    # "" is the hub page at the site root
    "": {
        "must": ["The Empowering Truth of Responsibility",
                 "10 Habits of Happy Relationships",
                 "francoisesterhuizen.com/own-it",
                 "francoisesterhuizen.com/relationships-10-habits-intro",
                 "Pattern Breaker", "Headlights", "Unstuck Loop Map",
                 "Emotional Language Wheel", "Personal Growth Weekly"],
        "must_not": ["Story of Us", "storyofus"],
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

def main():
    base = pathlib.Path(__file__).parent
    live = "--live" in sys.argv
    all_ok = True
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
