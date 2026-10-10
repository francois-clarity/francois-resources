/* The buy box with the one-click course added.
 *
 *   <div class="buybox" data-book="responsibility"></div>
 *   <script src="/assets/buy.js" defer></script>
 *
 * Everything about the offer comes from data attributes on that div, so the
 * copy lives in the page and this file only moves money.
 *
 * The amount shown here is for the reader's benefit only. What they actually
 * pay is worked out on the server in /api/checkout, from its own price list,
 * and nothing this file sends can change it.
 *
 * The bump starts UNTICKED on purpose. Pre-ticking lifts the take rate and
 * it is the single thing buyers complain about most in this kind of
 * checkout, and a refund conversation costs more than the extra tick.
 */
(function () {
  'use strict';

  var rands = function (cents) { return 'R' + (cents / 100).toFixed(0); };

  function mount(box) {
    var book = box.dataset.book;
    var price = parseInt(box.dataset.price, 10);
    var bumpPrice = parseInt(box.dataset.bumpPrice, 10);
    var bumpTitle = box.dataset.bumpTitle || '';
    var bumpBody = box.dataset.bumpBody || '';

    /* The shape comes from three of Maria Wendt's live checkouts, read on
       10 Oct 2026, not from a guess. What they do that the first version
       did not:

         the bump sits OUTSIDE the order list, in its own bordered block,
           because a name-and-price row under the book reads as an invoice
           line, so the eye takes it as something already being charged
         it carries a recommendation, because a neutral box gets skipped
         it uses the verb: you upgrade your order to include the thing
         the tick itself says add, so the box says what ticking does twice
         the body leads with the help and puts the count at the end

       Two deliberate departures. Her button stays "Place Order Now" even
       when the bump is ticked; this one changes to the new amount, because
       Francois would rather nobody was ever surprised by a number. And her
       bump is always a done-for-you pack rather than a course, which is the
       stronger shape and a thing to fix in the product, not the page. */
    box.innerHTML =
      '<div class="bx-row"><span>' + esc(box.dataset.title || 'The book') + '</span>' +
        '<span class="bx-amt">' + rands(price) + '</span></div>' +

      '<div class="bx-bump-wrap">' +
        '<p class="bx-flag">Recommended</p>' +
        '<div class="bx-bump-head">' +
          '<strong>' + esc(bumpTitle) + '</strong>' +
          '<span class="bx-amt">' + rands(bumpPrice) + '</span>' +
        '</div>' +
        (box.dataset.bumpImage
          ? '<img class="bx-bump-img" src="' + esc(box.dataset.bumpImage) + '" alt="">' : '') +
        '<p class="bx-bump-body">' + esc(bumpBody) + '</p>' +
        '<label class="bx-tick">' +
          '<input type="checkbox" id="bump">' +
          '<span>Yes, add this to my order for ' + rands(bumpPrice) + '</span>' +
        '</label>' +
      '</div>' +

      '<div class="bx-total"><span>Total</span><span class="bx-amt" id="total">' + rands(price) + '</span></div>' +
      '<div class="bx-fields">' +
        '<input type="text" id="bx-name" placeholder="Your name" autocomplete="name" maxlength="80">' +
        '<input type="email" id="bx-email" placeholder="you@example.com" autocomplete="email" maxlength="120">' +
      '</div>' +
      '<button class="btn bx-go" id="bx-go">Pay ' + rands(price) + '</button>' +
      '<p class="bx-err" id="bx-err" role="alert"></p>' +
      '<p class="bx-fine">Card payment through Paystack. The book downloads the moment the payment clears, and the link is emailed to you as well.</p>';

    var bump = box.querySelector('#bump');
    var go = box.querySelector('#bx-go');
    var total = box.querySelector('#total');
    var err = box.querySelector('#bx-err');

    function retotal() {
      var t = price + (bump.checked ? bumpPrice : 0);
      total.textContent = rands(t);
      go.textContent = 'Pay ' + rands(t);
      box.classList.toggle('has-bump', bump.checked);
    }
    bump.addEventListener('change', retotal);

    go.addEventListener('click', function () {
      var name = box.querySelector('#bx-name').value.trim();
      var email = box.querySelector('#bx-email').value.trim().toLowerCase();
      err.textContent = '';
      if (!name) { err.textContent = 'I need a name for the receipt.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'That email does not look right.'; return; }
      go.disabled = true;
      go.textContent = 'One moment';
      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: book, bump: bump.checked, name: name, email: email }),
      }).then(function (r) { return r.json(); }).catch(function () { return null; })
        .then(function (out) {
          if (!out || !out.ok) {
            go.disabled = false; retotal();
            err.textContent = (out && out.error) || 'That did not go through. Try again in a moment.';
            return;
          }
          /* Paystack in a box on top of the page, so nobody leaves the page
             they were reading. If the script did not load, send them to the
             full page instead rather than stranding them. */
          if (out.accessCode && window.PaystackPop) {
            try {
              new window.PaystackPop().resumeTransaction(out.accessCode, {
                onCancel: function () {
                  go.disabled = false; retotal();
                  err.textContent = 'No payment was taken. The book is still here when you want it.';
                },
                onError: function () {
                  go.disabled = false; retotal();
                  err.textContent = 'The payment box had a problem. Try again, or email me.';
                },
              });
              return;
            } catch (e) { /* fall through to the redirect */ }
          }
          if (out.url) { location.href = out.url; return; }
          go.disabled = false; retotal();
          err.textContent = 'That did not go through. Try again in a moment.';
        });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function start() { document.querySelectorAll('.buybox[data-book]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
