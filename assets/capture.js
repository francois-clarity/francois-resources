/* Shared email capture for every tool on this site.
 *
 * Francois, 8 Sep 2026: "I want all tools to capture emails. Even if it is
 * sensitive." Five tools captured nothing at all before this.
 *
 * One component rather than five bespoke forms, so the wording, the validation
 * and the failure behaviour are the same everywhere and a new tool is one line.
 *
 * Usage, at the end screen of a tool:
 *   CAPTURE.mount({
 *     el: someElement,            // where to render
 *     tool: 'invisible-contracts',// must also exist in functions/api/assessment.js
 *     heading: '...',             // optional
 *     blurb: '...',               // optional
 *     result: { key, name, line } // optional, written into merge fields
 *     discreet: true              // sensitive tools: warn about shared inboxes
 *   });
 *
 * Discreet mode does NOT reduce capture. The email is still asked for in the
 * same way. It changes what the person is told about the email that arrives,
 * because a subject line naming the topic is the thing that does the damage,
 * not the capture itself.
 *
 * Never blocks. A failed sync tells the reader plainly and leaves the page
 * usable, because these tools are the deliverable, not the email.
 */
(function (w, d) {
  'use strict';

  var CSS = '' +
    '.cap{margin-top:26px;border:1px solid rgba(255,255,255,.14);border-radius:20px;' +
      'padding:22px 24px;background:linear-gradient(180deg,rgba(24,192,192,.10),rgba(24,192,192,.02));' +
      'font-family:Manrope,system-ui,-apple-system,sans-serif}' +
    '.cap h4{margin:0 0 8px;font-size:18.5px;font-weight:800;letter-spacing:-.015em;color:#fff}' +
    '.cap p{margin:0;color:rgba(255,255,255,.66);font-weight:300;font-size:15.5px;line-height:1.6}' +
    '.cap .warn{margin-top:12px;padding:12px 15px;border-radius:10px;font-size:14.5px;font-weight:500;' +
      'color:#fff;background:rgba(232,181,81,.10);border:1px solid rgba(232,181,81,.38)}' +
    '.cap .row{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}' +
    '.cap input{flex:1 1 190px;min-width:0;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.18);' +
      'border-radius:12px;padding:13px 15px;color:#fff;font-family:inherit;font-size:16px}' +
    '.cap input:focus{outline:none;border-color:#18C0C0;box-shadow:0 0 0 4px rgba(24,192,192,.10)}' +
    '.cap input[aria-invalid="true"]{border-color:#E38070}' +
    '.cap button{cursor:pointer;font-family:inherit;font-weight:800;font-size:15.5px;padding:13px 24px;' +
      'border:0;border-radius:12px;background:#18C0C0;color:#1B222D;display:inline-flex;align-items:center;gap:9px}' +
    '.cap button:hover{filter:brightness(1.08)}' +
    '.cap button:disabled{opacity:.5;cursor:progress;filter:none}' +
    '.cap .sp{width:14px;height:14px;border:2px solid rgba(27,34,45,.3);border-top-color:#1B222D;' +
      'border-radius:50%;animation:capspin .7s linear infinite;display:none}' +
    '.cap button.busy .sp{display:block}' +
    '@keyframes capspin{to{transform:rotate(360deg)}}' +
    '.cap .err{display:none;margin-top:10px;color:#E38070;font-size:14px;font-weight:500}' +
    '.cap .err.on{display:block}' +
    '.cap .ok{display:none;margin-top:6px;color:#5FCB89;font-size:15.5px;font-weight:600}' +
    '.cap .ok.on{display:block}' +
    '.cap .fine{margin-top:12px;font-size:13px;color:rgba(255,255,255,.42);font-weight:300}' +
    '@media print{.cap{display:none}}';

  var styled = false;
  function style() {
    if (styled) return;
    styled = true;
    var s = d.createElement('style');
    s.textContent = CSS;
    d.head.appendChild(s);
  }

  function valid(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function key(tool) { return 'cap.' + tool; }

  function already(tool) {
    try { return !!localStorage.getItem(key(tool)); } catch (e) { return false; }
  }
  function remember(tool) {
    try { localStorage.setItem(key(tool), '1'); } catch (e) {}
  }

  function mount(opts) {
    if (!opts || !opts.el || !opts.tool) return;
    style();

    var box = d.createElement('div');
    box.className = 'cap';

    var h = d.createElement('h4');
    h.textContent = opts.heading || 'Want this emailed to you?';
    box.appendChild(h);

    var p = d.createElement('p');
    p.textContent = opts.blurb ||
      'This page lives on your phone and disappears if you clear your browser. An email gives you a copy you can come back to.';
    box.appendChild(p);

    if (opts.discreet) {
      var wdiv = d.createElement('div');
      wdiv.className = 'warn';
      wdiv.textContent = 'The email comes from me with a plain subject line and says nothing about the topic, ' +
        'so it is safe in a normal inbox. Even so, do not use one somebody else reads.';
      box.appendChild(wdiv);
    }

    // already sent on this device: say so instead of asking again
    if (already(opts.tool)) {
      var done = d.createElement('p');
      done.className = 'fine';
      done.textContent = 'Already sent to you from this device.';
      box.appendChild(done);
      opts.el.appendChild(box);
      return;
    }

    var form = d.createElement('form');
    form.setAttribute('novalidate', '');

    var row = d.createElement('div');
    row.className = 'row';
    var name = d.createElement('input');
    name.type = 'text'; name.placeholder = 'First name'; name.autocomplete = 'given-name';
    name.setAttribute('aria-label', 'Your first name');
    var mail = d.createElement('input');
    mail.type = 'email'; mail.placeholder = 'you@example.com'; mail.autocomplete = 'email';
    mail.setAttribute('inputmode', 'email');
    mail.setAttribute('aria-label', 'Your email address');
    var btn = d.createElement('button');
    btn.type = 'submit';
    var sp = d.createElement('span'); sp.className = 'sp';
    var lab = d.createElement('span'); lab.textContent = opts.cta || 'Send it to me';
    btn.appendChild(sp); btn.appendChild(lab);
    row.appendChild(name); row.appendChild(mail); row.appendChild(btn);
    form.appendChild(row);

    var err = d.createElement('div'); err.className = 'err';
    form.appendChild(err);

    var fine = d.createElement('p');
    fine.className = 'fine';
    fine.textContent = 'One email. You can leave the list at any time and I will not chase you.';
    form.appendChild(fine);

    var ok = d.createElement('div'); ok.className = 'ok';
    ok.textContent = 'Sent. Check your inbox in a minute or two.';

    box.appendChild(form);
    box.appendChild(ok);
    opts.el.appendChild(box);

    function clear() {
      err.classList.remove('on');
      name.removeAttribute('aria-invalid');
      mail.removeAttribute('aria-invalid');
    }
    name.addEventListener('input', clear);
    mail.addEventListener('input', clear);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (btn.disabled) return;
      var n = name.value.trim(), m = mail.value.trim().toLowerCase();
      if (!n) {
        err.textContent = 'I need a first name so the email does not open with "Hi there".';
        err.classList.add('on'); name.setAttribute('aria-invalid', 'true'); name.focus(); return;
      }
      if (!valid(m)) {
        err.textContent = 'That email does not look right. Check it and try again.';
        err.classList.add('on'); mail.setAttribute('aria-invalid', 'true'); mail.focus(); return;
      }
      clear();
      btn.disabled = true; btn.classList.add('busy'); lab.textContent = 'Sending';

      var r = opts.result || {};
      var body = {
        tool: opts.tool, name: n, email: m,
        resultKey: r.key || '', resultName: r.name || '',
        line: r.line || '', link: w.location.href
      };

      var settle = function (sent) {
        btn.classList.remove('busy');
        if (sent) {
          remember(opts.tool);
          form.style.display = 'none';
          ok.classList.add('on');
        } else {
          btn.disabled = false; lab.textContent = opts.cta || 'Send it to me';
          err.textContent = 'That did not go through. Use the print button above to keep a copy, and try again later.';
          err.classList.add('on');
        }
      };

      var timer = setTimeout(function () { settle(false); }, 12000);
      fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().catch(function () { return { ok: false }; });
      }).then(function (j) {
        clearTimeout(timer); settle(!!(j && j.ok));
      }).catch(function () {
        clearTimeout(timer); settle(false);
      });
    });
  }

  w.CAPTURE = { mount: mount, sent: already };
})(window, document);
