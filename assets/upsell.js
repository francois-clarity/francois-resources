/* The one-click offer on a thank-you page.
 *
 * The page does not know what is on offer. It asks /api/upsell what this
 * buyer can be shown, and that endpoint decides from the order it already
 * holds. So a buyer who paid for the wrong book, or who has already taken
 * the offer, or who paid by a method that cannot be charged again, never
 * sees a button that would fail.
 *
 * Nothing appears at all while no offer is switched on, which is the state
 * today: the rail is built, the products are not attached.
 *
 * Page needs: <div class="oneclick" id="oneclick" hidden> with #oc-title,
 * #oc-body, #oc-go and #oc-note inside it.
 */
(function () {
  var p = new URLSearchParams(location.search);
  var ref = p.get('reference') || p.get('trxref') || p.get('ref') || '';
  var box = document.getElementById('oneclick');
  if (!ref || !box) return;

  var title = document.getElementById('oc-title');
  var body = document.getElementById('oc-body');
  var go = document.getElementById('oc-go');
  var note = document.getElementById('oc-note');
  var offered = null;

  function rands(c) { return 'R' + (c / 100).toFixed(0); }

  fetch('/api/upsell?ref=' + encodeURIComponent(ref))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok || !d.offer) return;      // nothing on sale for them
      offered = d.offer;
      title.textContent = offered.title;
      body.textContent = offered.blurb;
      go.textContent = 'Add it for ' + rands(offered.price);
      box.hidden = false;
      try { FUNNEL.track('oneclick_view', offered.key); } catch (e) {}
    })
    .catch(function () {});

  go.addEventListener('click', function () {
    if (!offered || go.disabled) return;
    go.disabled = true;
    var was = go.textContent;
    go.textContent = 'One moment';
    note.textContent = '';
    fetch('/api/upsell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: ref, offer: offered.key }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          box.classList.add('done');
          go.hidden = true;
          title.textContent = offered.title + ', added';
          if (d.kind === 'book' && d.url) {
            body.textContent = 'Paid for. Download it here, and the link is in your email too.';
            var a = document.createElement('a');
            a.className = 'btn'; a.href = d.url; a.textContent = 'Download it';
            a.setAttribute('download', '');
            box.appendChild(a);
          } else if (d.delivered) {
            body.textContent = 'Paid for and open. Check your email for the way in.';
          } else {
            body.textContent = 'Paid for. Something on my side did not hand it over, ' +
              'so Francois has been told and will sort it out today.';
          }
          try { FUNNEL.track('oneclick_taken', offered.key); } catch (e) {}
          return;
        }
        /* A card that cannot be charged again is not a failure, it is a
           different route: send them through an ordinary checkout. */
        if (d && d.needsCheckout) {
          note.textContent = 'That payment method needs a fresh checkout. Email me and I will send a link.';
        } else {
          note.textContent = (d && d.error) || 'That did not go through. Nothing has been taken.';
        }
        go.disabled = false;
        go.textContent = was;
      })
      .catch(function () {
        note.textContent = 'That did not go through. Nothing has been taken.';
        go.disabled = false;
        go.textContent = was;
      });
  });
})();
