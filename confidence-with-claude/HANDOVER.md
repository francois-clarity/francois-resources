# Confidence with Claude landing page: handover from Claudia (30 Oct 2026)

Francois wants this live at events.francoisesterhuizen.com/confidence-with-claude as soon as possible.

- index.html: the page, self-contained, no build step. Approved by Francois.
- flyer.png: the flyer. og.png: share image (1200x630-ish crop of the flyer).
- Booking buttons already point at live Paystack pages:
  - https://paystack.shop/pay/confidence-with-claude (R2,500, all three mornings)
  - https://paystack.shop/pay/confidence-with-claude-morning (R900, one morning, asks which)
- Meta pixel: placeholder comment in <head>; add the snippet when Francois gives the pixel ID.

Claudia did not deploy: the tree had other sessions' uncommitted work (events/index.html and several AI-key folders), and deploy.sh rightly refuses. Please commit this folder by name and deploy with ./deploy.sh when the tree is clean, then check events.francoisesterhuizen.com/confidence-with-claude resolves (add a _redirects line if events/ routing needs it).
