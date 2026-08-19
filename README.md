# resources.francoisesterhuizen.com

Static site. One self-contained HTML file per resource, no build step, no
framework. Dark navy and teal, Manrope, everything stored on the reader's own
device.

## Read this before changing anything

**Two Claude sessions work in this folder.** One looks after the hub page and
the marketing surfaces, the other looks after the interactive tools. They have
collided before, so:

| Area | Owner |
|---|---|
| `index.html`, `assets/`, `events/` | the hub session |
| `tree-of-clarity/`, `four-voices/`, `belief-inventory/`, `invisible-contracts/`, `emotional-language-wheel/`, `books/` | the tools session |
| `check-gates.py`, `deploy.sh` | shared, so add to them rather than rewriting them |

Before you start: `git status` and `git log --oneline -3`, to see what the other
one has just done.

When you commit, **stage your own files by name** rather than `git add -A`.
Sweeping everything up puts the other session's work inside a commit whose
message says nothing about it, which is how the comforter ended up filed under
a commit about homepage photography.

## Deploying

**Pushing to GitHub publishes nothing.** This is a Cloudflare Pages project with
no git provider connected; it only updates on a direct upload. Always use:

```
./deploy.sh
```

That refuses to publish while there are uncommitted changes in the folder,
because `wrangler pages deploy .` uploads whatever is on disk, including another
session's half-finished work. It then runs the gate checks, publishes, and reads
the live pages back to prove what shipped.

If it stops you, commit what is ready or wait. `./deploy.sh --force` exists for
when you are certain, and you should be able to say why out loud.

## check-gates.py

The guard. It verifies every page still says what it claims to, locally and
live. Born after the Headlights page shipped carrying the Pattern Breaker's
entire content.

It has since caught: a brand-new page serving the hub's content through the 404
fallback (a 200 from this site never proves a page shipped), a stale marker after
a folder rename, and goals examples naming emotions that do not exist in the
wheel, so readers searched for them and were told nothing matched.

Add a gate whenever you add a page, and prefer markers that are content rather
than markup.

## Rolling back

Cloudflare dashboard, Pages, `francois-resources`, Deployments. Every deploy is
kept and any one can be promoted back to live.

## Sites that moved off this project

`family-mobile/` shipped here first on 2026-08-18, then moved the same day to its
own repo (`~/family-mobile`, GitHub `francois-clarity/family-mobile`) and Pages
project `family-mobile` at familymobile.francoisesterhuizen.com. `_redirects`
carries the 301. Do not recreate the folder here.
