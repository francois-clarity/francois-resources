/* "Something not working?" Drop this on any page with one script tag:
 *
 *   <script src="https://resources.francoisesterhuizen.com/assets/report.js"
 *           data-tool="survival-instinct" defer></script>
 *
 * It adds a small link in the corner. Click it, say what happened, paste a
 * screenshot if you have one, send.
 *
 * WHY IT COLLECTS THINGS NOBODY TYPED. What people write is "it doesn't
 * work". What fixes it is the item number, the browser and the error the
 * page threw. A client reported "I selected but I can't continue" on the
 * Vision assessment in September and it took a screenshot and a conversation
 * to find. This would have said which item and what the console said.
 *
 * It starts listening for errors the moment it loads, so an error that
 * happened before somebody opened the box is still in the report.
 *
 * Self-contained on purpose: no styles borrowed from the host page, its own
 * class prefix, and nothing global left behind except the listener. It has
 * to work on a page that is already broken.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://resources.francoisesterhuizen.com/api/report';
  var script = document.currentScript;
  var TOOL = (script && script.dataset.tool) || location.hostname.split('.')[0];

  /* Catch errors from now on, whether or not anybody opens the box. */
  var errors = [];
  function note(e) { if (errors.length < 6) errors.push(e); }
  window.addEventListener('error', function (e) {
    note((e.message || 'error') + ' at ' + (e.filename || '?') + ':' + (e.lineno || '?'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    note('unhandled promise: ' + String((e.reason && e.reason.message) || e.reason).slice(0, 200));
  });

  /* What screen are they on. Every assessment names it differently, so try
     the things that are actually there and fall back to the heading. */
  function screenNow() {
    var step = document.querySelector('.q-step, .step-label, .progress-text, [data-step]');
    if (step) return (step.textContent || '').trim().slice(0, 120);
    var h = document.querySelector('h1, h2');
    return h ? (h.textContent || '').trim().slice(0, 120) : document.title;
  }

  var shot = null;
  var css = '' +
    '.fe-rep-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:500 13.5px/1 Manrope,system-ui,sans-serif;' +
    'background:rgba(20,32,43,.92);color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:11px 16px;' +
    'cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)}' +
    '.fe-rep-btn:hover{border-color:#18C0C0}' +
    '.fe-rep-back{position:fixed;inset:0;z-index:2147483001;background:rgba(10,15,20,.66);display:flex;align-items:center;' +
    'justify-content:center;padding:18px}' +
    '.fe-rep-box{background:#262E3B;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:24px;' +
    'width:100%;max-width:460px;font:300 15.5px/1.55 Manrope,system-ui,sans-serif;max-height:90vh;overflow:auto}' +
    '.fe-rep-box h2{margin:0 0 6px;font:700 21px/1.2 Manrope,system-ui,sans-serif}' +
    '.fe-rep-box p{margin:0 0 14px;color:rgba(255,255,255,.66);font-size:14.5px}' +
    '.fe-rep-box textarea{width:100%;min-height:96px;background:rgba(0,0,0,.2);color:#fff;border:1px solid rgba(255,255,255,.2);' +
    'border-radius:10px;padding:12px;font:300 15px/1.5 Manrope,system-ui,sans-serif;resize:vertical}' +
    '.fe-rep-box textarea:focus{outline:none;border-color:#18C0C0}' +
    '.fe-rep-paste{margin:12px 0 0;padding:14px;border:1px dashed rgba(255,255,255,.24);border-radius:10px;text-align:center;' +
    'font-size:13.5px;color:rgba(255,255,255,.55)}' +
    '.fe-rep-paste img{max-width:100%;border-radius:8px;display:block;margin:0 auto}' +
    '.fe-rep-row{display:flex;gap:10px;margin-top:16px}' +
    '.fe-rep-row button{flex:1;font:600 15px/1 Manrope,system-ui,sans-serif;padding:13px;border-radius:999px;cursor:pointer;border:1px solid transparent}' +
    '.fe-rep-send{background:#18C0C0;color:#14202B}' +
    '.fe-rep-cancel{background:transparent;color:#fff;border-color:rgba(255,255,255,.22)}' +
    '.fe-rep-note{margin:12px 0 0;font-size:13px;color:rgba(255,255,255,.45)}';

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function open() {
    var back = el('div', 'fe-rep-back');
    var box = el('div', 'fe-rep-box',
      '<h2>Something not working?</h2>' +
      '<p>Tell me what happened and I will fix it. You do not need to explain it well.</p>' +
      '<textarea placeholder="What were you doing, and what happened instead?"></textarea>' +
      '<div class="fe-rep-paste">Paste a screenshot here if you have one. Copy it, then press Ctrl and V, or Command and V.</div>' +
      '<div class="fe-rep-row">' +
        '<button class="fe-rep-send">Send it</button>' +
        '<button class="fe-rep-cancel">Cancel</button>' +
      '</div>' +
      '<p class="fe-rep-note"></p>');
    back.appendChild(box);
    document.body.appendChild(back);

    var ta = box.querySelector('textarea');
    var paste = box.querySelector('.fe-rep-paste');
    var note = box.querySelector('.fe-rep-note');
    ta.focus();

    function onPaste(e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          var file = items[i].getAsFile();
          var r = new FileReader();
          r.onload = function () {
            shot = r.result;
            paste.innerHTML = '';
            var img = new Image(); img.src = shot; paste.appendChild(img);
          };
          r.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    }
    back.addEventListener('paste', onPaste);

    function close() { back.remove(); shot = null; }
    box.querySelector('.fe-rep-cancel').addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });

    box.querySelector('.fe-rep-send').addEventListener('click', function () {
      var said = ta.value.trim();
      if (!said) { note.textContent = 'Say what happened, even in a few words.'; ta.focus(); return; }
      var btn = box.querySelector('.fe-rep-send');
      btn.disabled = true; btn.textContent = 'Sending';
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          said: said, shot: shot, tool: TOOL, url: location.href,
          screen: screenNow(), ua: navigator.userAgent,
          viewport: window.innerWidth + ' by ' + window.innerHeight,
          errors: errors,
        }),
      }).then(function (r) { return r.json(); }).catch(function () { return null; })
        .then(function (out) {
          if (out && out.ok) {
            box.innerHTML = '<h2>Thank you</h2><p>That has gone to Francois. If you left your own page open, ' +
              'you can carry on where you were.</p><div class="fe-rep-row">' +
              '<button class="fe-rep-cancel">Close</button></div>';
            box.querySelector('.fe-rep-cancel').addEventListener('click', close);
          } else {
            btn.disabled = false; btn.textContent = 'Send it';
            note.textContent = 'That did not get through. Try once more, or email francois@francoisesterhuizen.com.';
          }
        });
    });
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    var btn = el('button', 'fe-rep-btn', 'Something not working?');
    btn.type = 'button';
    btn.addEventListener('click', open);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
