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
      /* A real <form>, with a name on every field and the matching
         autocomplete token. Browsers fill a checkout from the card they have
         on file, and they decide whether to offer it from the form and those
         names; loose inputs with a placeholder and nothing else get skipped,
         which is why this never filled itself in before. type="submit" also
         makes the Enter key work, which it did not. */
      '<form class="bx-fields" id="bx-form" novalidate>' +
        '<label class="bx-lab" for="bx-name">Your name</label>' +
        '<input type="text" id="bx-name" name="name" placeholder="Your name"' +
          ' autocomplete="name" autocapitalize="words" maxlength="80">' +
        '<label class="bx-lab" for="bx-email">Your email</label>' +
        '<input type="email" id="bx-email" name="email" placeholder="you@example.com"' +
          ' autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" maxlength="120">' +
        '<label class="bx-lab" for="bx-phone">Your phone number</label>' +
        '<input type="tel" id="bx-phone" name="tel" placeholder="082 123 4567"' +
          ' autocomplete="tel" inputmode="tel" maxlength="24">' +
        '<button class="btn bx-go" id="bx-go" type="submit">Pay ' + rands(price) + '</button>' +
      '</form>' +
      '<p class="bx-err" id="bx-err" role="alert"></p>' +
      '<p class="bx-fine">Card payment through Paystack. You will be able to download the book, access the course, and the links will also be in your inbox.</p>';

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

    box.querySelector('#bx-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = box.querySelector('#bx-name').value.trim();
      var email = box.querySelector('#bx-email').value.trim().toLowerCase();
      var phone = tidyPhone(box.querySelector('#bx-phone').value);
      err.textContent = '';
      if (!name) { err.textContent = 'I need a name for the receipt.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'That email does not look right.'; return; }
      if (!phone) { err.textContent = 'I need a phone number.'; return; }
      go.disabled = true;
      go.textContent = 'One moment';
      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: book, bump: bump.checked, name: name, email: email, phone: phone }),
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

/* South Africans write their number half a dozen ways: 082 123 4567,
   0821234567, +27 82 123 4567, 27821234567, with dashes or brackets. All of
   them are the same number, so take the digits and settle on one shape
   rather than refusing a number that is perfectly fine.
   Returns '' when it is not a number anybody could ring. */
function tidyPhone(raw) {
  var d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.indexOf('+') > 0) d = d.replace(/\+/g, '');       // a stray + mid-string
  if (d.slice(0, 4) === '0027') d = '+27' + d.slice(4);
  else if (d.slice(0, 3) === '+27') d = '+27' + d.slice(3);
  else if (d.slice(0, 2) === '27' && d.length >= 11) d = '+27' + d.slice(2);
  else if (d.charAt(0) === '0') d = '+27' + d.slice(1);
  /* Anything else is kept as given: an overseas buyer's number is theirs,
     not ours to reshape. */
  var digits = d.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return '';
  return d;
}
