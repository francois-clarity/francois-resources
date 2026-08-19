/* Shared funnel helpers: tracking + tool catalogue + qualifier logic.
   No cookies, no PII in tracking. Only allowlisted event names hit /api/track. */

(function () {
  'use strict';

  // ---------- Tracking ----------
  function track(event, v) {
    try {
      const q = new URLSearchParams({ event });
      if (v) q.set('v', v);
      const url = '/api/track?' + q.toString();
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        fetch(url, { method: 'GET', keepalive: true }).catch(() => {});
      }
    } catch (e) { /* never break the page for analytics */ }
  }

  // ---------- Tool catalogue ----------
  // Each tool: key, path, title, one-line promise, URL, and the paid programme that follows it.
  const TOOLS = {
    // Personal
    'procrastination-pattern-breaker': {
      path: 'personal',
      title: 'The Procrastination Pattern Breaker',
      promise: 'A five-minute tool for the thing you keep not doing. It names the pattern underneath, so you stop fighting the wrong battle.',
      url: '/procrastination-pattern-breaker/',
      cta: 'Open the tool'
    },
    'unstuck-loop-map': {
      path: 'personal',
      title: 'The Unstuck Loop Map',
      promise: 'Maps the loop you keep going round so you can see it from the outside for the first time, and find the one place to cut it.',
      url: '/unstuck-loop-map/',
      cta: 'Open the map'
    },
    'emotional-language-wheel': {
      path: 'personal',
      title: 'The Emotional Language Wheel',
      promise: 'A hundred and sixty words for what you feel, arranged so you can find the one that fits. Naming it is half the work.',
      url: '/emotional-language-wheel/',
      cta: 'Open the wheel'
    },
    'belief-inventory': {
      path: 'personal',
      title: 'The Belief Inventory',
      promise: 'Surfaces the beliefs running underneath the pattern. Not to shame them, but to see them, so you get to decide whether they stay.',
      url: '/belief-inventory/',
      cta: 'Open the inventory'
    },
    'ten-year-question': {
      path: 'personal',
      title: 'The Ten-Year Question',
      promise: 'For choosing when both roads could work. Stop asking which is right. Ask which one takes you closer to who you want to be in ten years.',
      url: '/ten-year-question/',
      cta: 'Get the card'
    },
    // Relational
    'survival-instinct': {
      path: 'relational',
      title: 'The Survival Instinct Assessment',
      promise: 'Twelve minutes to see which survival instinct you default to under conflict, and, when your partner takes it too, the dance the two of you do.',
      url: 'https://survival.francoisesterhuizen.com/',
      cta: 'Take the assessment'
    },
    'vision-alignment': {
      path: 'relational',
      title: 'The Relationship Vision Alignment',
      promise: 'Do the two of you actually want the same future? Each of you answers, each of you guesses what the other will say, and the gap shows you where the real conversation is.',
      url: 'https://vision.francoisesterhuizen.com/',
      cta: 'Take the assessment'
    },
    'invisible-contracts': {
      path: 'relational',
      title: 'Invisible Contracts',
      promise: 'The unspoken deals running your relationship: if I do my part, you should do yours. This walks you from the resentment back to the contract underneath it.',
      url: '/invisible-contracts/',
      cta: 'Open the tool'
    },
    'ten-habits': {
      path: 'relational',
      title: '10 Habits of Happy Relationships',
      promise: 'Ten practical habits that happy couples keep, one chapter each, written for real relationships rather than perfect ones. Start at the introduction.',
      url: 'https://www.francoisesterhuizen.com/relationships-10-habits-intro',
      cta: 'Start reading'
    },
    'family-mobile': {
      path: 'relational',
      title: 'The Family Mobile',
      promise: 'Which role you learned to play in the family you came from, and how it shows up with the partner you chose. Twelve minutes, one result.',
      url: 'https://familymobile.francoisesterhuizen.com/',
      cta: 'Take the assessment'
    }
  };

  // ---------- Qualifiers ----------
  const QUALIFIERS = {
    personal: {
      question: 'What is loudest for you right now?',
      answers: [
        { key: 'know-but-not-doing', label: 'I know what I want, I just keep not doing it', tool: 'procrastination-pattern-breaker' },
        { key: 'stuck',              label: 'I am stuck and I cannot see my way out',        tool: 'unstuck-loop-map' },
        { key: 'cant-name-feeling',  label: 'I cannot tell what I am actually feeling',      tool: 'emotional-language-wheel' },
        { key: 'same-place',         label: 'I keep ending up in the same place',            tool: 'belief-inventory' },
        { key: 'which-way',          label: 'I do not know which way to go',                 tool: 'ten-year-question' }
      ],
      deeper: {
        kicker: 'If you want to go deeper',
        title: 'Clarity Quest',
        body: 'Ten weeks, one-on-one with me, to get unstuck properly: not the latest symptom but the wall underneath it, whether that wall is routine, uncertainty, or the low hum of going through the motions. You leave with a clear picture of what you actually want and the first real moves toward it.',
        price: 'Read the page for pricing and how it works',
        url: 'https://clarityquest.francoisesterhuizen.com/',
        ctaLabel: 'Read about Clarity Quest',
        alsoLabel: 'Or, a gentler first step',
        alsoText: 'Personal Growth Weekly is a live class on Wednesday mornings where we do this work in a room of people doing the same.',
        alsoUrl: 'https://www.getclarity.co.za/'
      }
    },
    relational: {
      question: 'Where are the two of you right now?',
      answers: [
        { key: 'same-fight',         label: 'We keep having the same fight',                            tool: 'survival-instinct' },
        { key: 'different-futures',  label: 'We want different things and we are not saying it',        tool: 'vision-alignment' },
        { key: 'one-gives-more',     label: 'One of us keeps giving more than the other',                tool: 'invisible-contracts' },
        { key: 'gone-flat',          label: 'We are okay, but something has gone flat',                  tool: 'ten-habits' },
        { key: 'why-am-i-like-this', label: 'I want to understand why I am like this with my partner',   tool: 'family-mobile' }
      ],
      deeper: {
        kicker: 'If you want to go deeper',
        title: 'The Get Close Couples Programme',
        body: 'Eight sessions for the two of you, with me, working through the actual pattern rather than the latest argument. Built around the same assessments you just used, read together in the room.',
        price: 'From R4 800 for the programme',
        url: 'https://www.getclarity.co.za/get-close',
        ctaLabel: 'Read about the programme'
      }
    }
  };

  window.FUNNEL = { track, TOOLS, QUALIFIERS };
})();
