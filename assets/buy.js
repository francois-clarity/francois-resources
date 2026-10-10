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

    box.innerHTML =
      '<div class="bx-row"><span>' + esc(box.dataset.title || 'The book') + '</span>' +
        '<span class="bx-amt">' + rands(price) + '</span></div>' +
      '<label class="bx-bump">' +
        '<input type="checkbox" id="bump">' +
        '<span class="bx-bump-text">' +
          '<strong>' + esc(bumpTitle) + '</strong>' +
          '<span class="bx-bump-body">' + esc(bumpBody) + '</span>' +
        '</span>' +
        '<span class="bx-amt">' + rands(bumpPrice) + '</span>' +
      '</label>' +
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
          if (out && out.ok && out.url) { location.href = out.url; return; }
          go.disabled = false; retotal();
          err.textContent = (out && out.error) || 'That did not go through. Try again in a moment.';
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
