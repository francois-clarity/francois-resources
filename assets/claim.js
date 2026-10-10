/* Shows a book buyer the course they added to their order.
 *
 * The thank-you page knows nothing about what was bought. It sends the
 * Paystack reference to /api/claim, which checks the payment, puts the buyer
 * on the platform and answers with the course, or with nothing if the order
 * was the book on its own. So this script reveals a panel it cannot fill in
 * by itself, and a book-only buyer never sees it.
 *
 * Page needs: <div class="opened" id="opened" hidden> with #op-title,
 * #op-body and #op-cta inside it.
 */
(function () {
  var p = new URLSearchParams(location.search);
  var ref = p.get('reference') || p.get('trxref') || p.get('ref') || '';
  var box = document.getElementById('opened');
  if (!ref || !box) return;

  fetch('/api/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: ref }),
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok || !d.course) return;
      var c = d.course;
      document.getElementById('op-title').textContent = c.title;
      document.getElementById('op-body').textContent = d.enrolled
        ? c.lessons + ' short lessons, open now on my app. Check your email: there\'s a button in there that signs you in and takes you straight to the first one. No password to remember.'
        : 'It\'s paid for and it\'s yours. Something on my side didn\'t hand it over automatically, so email me at francois@francoisesterhuizen.com and I\'ll open it for you today.';
      var cta = document.getElementById('op-cta');
      if (d.enrolled) { cta.textContent = 'Open Clarity'; cta.href = 'https://clarity.francoisesterhuizen.com'; }
      else { cta.textContent = 'Email me'; cta.href = 'mailto:francois@francoisesterhuizen.com?subject=' + encodeURIComponent('My course from the book order (' + ref + ')'); }
      box.hidden = false;
      try { FUNNEL.track('bump_granted', c.slug); } catch (e) {}
    })
    .catch(function () {});
})();
