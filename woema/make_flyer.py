#!/usr/bin/env python3
"""Render woema/flyer.html to woema/flyer.png, 1080x1350.

    /usr/bin/python3 woema/make_flyer.py

The flyer is what people send to a friend on WhatsApp, so it is built from
HTML rather than drawn by hand: when the workshop changes, the words change in
one place and this re-renders it. Headless Chrome is the renderer, the same one
that makes the og images, because it has the real Manrope and Newsreader from
Google Fonts rather than a substitute.

Written 28 Sep 2026, when WOEMA became free and the R1,500 and R1,000 cells on
the old flyer had to go. The old PNG had no source; this one does.
"""
import pathlib, shutil, subprocess, sys, tempfile, time

HERE = pathlib.Path(__file__).resolve().parent
# `make_flyer.py og` renders the share image (og.html -> og.png, 1200x630) the same way.
OG = len(sys.argv) > 1 and sys.argv[1] == 'og'
SRC = HERE / ('og.html' if OG else 'flyer.html')
OUT = HERE / ('og.png' if OG else 'flyer.png')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = (1200, 630) if OG else (1080, 1350)

if not pathlib.Path(CHROME).exists():
    sys.exit('Chrome is not where I expected it: ' + CHROME)
if not SRC.exists():
    sys.exit('missing ' + str(SRC))

with tempfile.TemporaryDirectory() as tmp:
    shot = pathlib.Path(tmp) / 'flyer.png'
    subprocess.run([
        CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=%d,%d' % (W, H),
        '--screenshot=' + str(shot),
        # The fonts come off the network, so give them a moment to arrive.
        # Old headless with a virtual time budget is what works on this Mac:
        # --headless=new never returns here, whatever the timeout says. It
        # takes two or three minutes, which is why this is a script and not
        # something anybody runs by hand twice.
        '--virtual-time-budget=6000',
        '--user-data-dir=' + tmp + '/profile',
        SRC.as_uri(),
    ], check=True, capture_output=True)
    if not shot.exists():
        sys.exit('Chrome produced no image')
    shutil.copyfile(shot, OUT)

size = OUT.stat().st_size
print('wrote %s, %d x %d, %.0f KB' % (OUT.relative_to(HERE.parent), W, H, size / 1024))
if size < 40_000:
    print('WARNING: that is small for this design. Open it before you publish it,')
    print('because a font that did not load in time looks like this.')
