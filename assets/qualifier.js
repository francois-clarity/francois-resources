/* Qualifier: one question, then an inline email gate, then redirect to /thanks/.
   Path comes from <body data-path="personal|relational">. */
(function () {
  'use strict';
  const path = document.body.dataset.path === 'relational' ? 'relational' : 'personal';
  const Q = FUNNEL.QUALIFIERS[path];
  const el = document.getElementById('qualifier');
  let chosen = null;

  FUNNEL.track('qualifier_view_' + path);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render() {
    const tool = chosen ? FUNNEL.TOOLS[chosen.tool] : null;
    el.innerHTML = `
      <p class="question">${esc(Q.question)}</p>
      <div class="answers">
        ${Q.answers.map(a => `
          <button type="button" class="answer ${chosen && chosen.key === a.key ? 'selected' : ''}" data-key="${esc(a.key)}">
            <span class="dot"></span><span>${esc(a.label)}</span>
          </button>`).join('')}
      </div>
      ${chosen ? `
        <form class="gate" id="gate" novalidate>
          <span class="lbl">The one that fits</span>
          <p><strong>${esc(tool.title)}.</strong> ${esc(tool.promise)}</p>
          <p>Where should I send it? One email, no drip campaign, and you can unsubscribe with one click.</p>
          <div class="row">
            <input type="text"  id="name"  placeholder="First name" autocomplete="given-name" maxlength="60">
            <input type="email" id="email" placeholder="you@example.com" autocomplete="email" maxlength="120" required>
            <button type="submit" class="btn" id="go">Send it to me</button>
          </div>
          <p class="err" id="err" role="alert"></p>
          <p class="fine">Your email goes to me only. It stays in my list and nowhere else. POPIA-compliant, one-click unsubscribe.</p>
        </form>` : ''}
    `;

    el.querySelectorAll('.answer').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        chosen = Q.answers.find(a => a.key === key) || null;
        FUNNEL.track('qualifier_answer_' + path, key);
        render();
        const gate = document.getElementById('gate');
        if (gate) {
          gate.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => { const n = document.getElementById('name'); if (n) n.focus(); }, 420);
        }
      });
    });

    const gate = document.getElementById('gate');
    if (gate) gate.addEventListener('submit', onSubmit);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const nameEl  = document.getElementById('name');
    const emailEl = document.getElementById('email');
    const err     = document.getElementById('err');
    const btn     = document.getElementById('go');
    const name  = nameEl.value.trim();
    const email = emailEl.value.trim().toLowerCase();
    err.textContent = '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      err.textContent = 'That does not look like an email address.';
      emailEl.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'One moment…';
    FUNNEL.track('optin_submit_' + path, chosen.key);

    try {
      await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, path, tool: chosen.tool, answer: chosen.key })
      });
    } catch (_) { /* never block the user on a failed sync */ }

    const q = new URLSearchParams({ p: path, t: chosen.tool, a: chosen.key });
    if (name) q.set('n', name);
    location.href = '/thanks/?' + q.toString();
  }

  render();
})();
