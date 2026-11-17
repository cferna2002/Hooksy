/*
  Hooksy game engine + daily game.
  Works entirely offline from static files. Premium games reuse the same Game class (see premium.js).
*/
(function () {
  'use strict';

  const CFG = window.HOOKSY_CONFIG || {};
  const Scene = window.HooksyScene;
  const ROUNDS = 3;
  const MAX_GUESSES = 5;
  const MAX_HINTS = 5;
  const ROUND_MS = (CFG.ROUND_SECONDS || 60) * 1000;
  const NAME = CFG.GAME_NAME || 'Hooksy';

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const memory = {};
  const store = {
    get(k) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
      catch (e) { return memory[k] ? JSON.parse(memory[k]) : null; }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      try { localStorage.setItem(k, s); } catch (e) { memory[k] = s; }
    },
    keys() { try { return Object.keys(localStorage); } catch (e) { return Object.keys(memory); } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { delete memory[k]; } },
  };

  function localDateKey(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function daysBetween(a, b) {
    const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((u(b) - u(a)) / 86400000);
  }
  function msUntilMidnight() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
  }
  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = n => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  let toastTimer = null;
  function toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 250); }, ms);
  }

  // ---------------------------------------------------------------- modals
  let lastFocus = null;
  function openModal(id) {
    const m = document.getElementById(id);
    lastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('open'));
    const f = m.querySelector('input, button:not(.modal-close), [href]');
    if (f) setTimeout(() => f.focus(), 50);
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m || m.hidden) return;
    m.classList.remove('open');
    setTimeout(() => { m.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', e => {
    const m = e.target.closest('.modal');
    if (!m) return;
    if (e.target === m || e.target.closest('[data-close]')) closeModal(m.id);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(m => closeModal(m.id));
  });

  // ---------------------------------------------------------------- words
  function decodeEntry(i) {
    const W = window.HOOKSY_WORDS;
    const raw = atob(W.d[i]);
    let out = '';
    for (let j = 0; j < raw.length; j++) out += String.fromCharCode(raw.charCodeAt(j) ^ W.k.charCodeAt((i + j) % W.k.length));
    const [word, ...hints] = out.split('|');
    return { word, hints };
  }
  function dailyPuzzle(dateKey) {
    const days = window.HOOKSY_WORDS.days;
    const n = daysBetween(CFG.DAILY_START_DATE || '2026-11-14', dateKey);
    const idx = ((n % days) + days) % days;
    return { number: n + 1, words: [0, 1, 2].map(r => decodeEntry(idx * ROUNDS + r)) };
  }

  // ---------------------------------------------------------------- scoring
  function scoreRound(correct, elapsedMs, guessNo) {
    if (!correct) return { base: 0, time: 0, guess: 0, total: 0 };
    const s = elapsedMs / 1000;
    const time = s < 10 ? 3 : s < 20 ? 2 : s < 30 ? 1 : 0;
    const guess = guessNo === 1 ? 3 : guessNo === 2 ? 2 : guessNo === 3 ? 1 : 0;
    return { base: 3, time, guess, total: 3 + time + guess };
  }
  function fishFor(total) {
    if (total <= 6) return 'goldfish';
    if (total <= 12) return 'bass';
    if (total <= 18) return 'salmon';
    if (total <= 24) return 'tuna';
    return 'swordfish';
  }
  const normalize = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // ---------------------------------------------------------------- Game
  /*
    opts: {
      storageKey, title, shareTitle, words: [{word, hints}] x3,
      dateKey (optional), renderExtra(el, game) (optional), onFinish(state) (optional, returns Promise)
    }
  */
  class Game {
    constructor(opts) {
      this.o = opts;
      this.words = opts.words;
      this.timer = null;
      this.extraTimer = null;
      this.pending = [];
      this.card = $('#card');
      this.state = store.get(opts.storageKey) || this.freshState();

      // Anti-refresh rule: a round that was running when the page was left counts as failed.
      let changed = false;
      this.state.rounds.forEach(r => {
        if (r.status === 'active') {
          Object.assign(r, { status: 'done', correct: false, reason: 'refresh', points: 0, timeMs: null });
          this.state.forfeitNotice = true;
          changed = true;
        }
      });
      if (changed) { this.recount(); this.save(); }
    }

    freshState() {
      return {
        v: 1,
        rounds: Array.from({ length: ROUNDS }, () => ({ status: 'pending', guesses: [], startedAt: null, correct: false, timeMs: null, points: 0, reason: null })),
        total: 0, finished: false, finaleShown: false, reported: false,
      };
    }

    get index() { return this.state.rounds.findIndex(r => r.status !== 'done'); }
    get isRoundActive() { return !!this.timer; }
    recount() {
      this.state.total = this.state.rounds.reduce((a, r) => a + (r.points || 0), 0);
      this.state.finished = this.state.rounds.every(r => r.status === 'done');
    }
    save() { store.set(this.o.storageKey, this.state); }
    later(fn, ms) { const id = setTimeout(fn, ms); this.pending.push(id); return id; }

    mount() {
      if (this.state.finished) {
        if (this.state.finaleShown) {
          Scene.showCatch(fishFor(this.state.total));
          this.renderResults();
        } else {
          Scene.reset();
          this.finale();
        }
        this.report();
      } else {
        Scene.reset();
        this.renderIntro();
      }
    }

    unmount() {
      this.stopTimer();
      clearInterval(this.extraTimer);
      this.pending.forEach(clearTimeout);
      this.pending = [];
      this.card.classList.remove('card--away');
    }

    report() {
      if (!this.state.finished || this.state.reported || !this.o.onFinish) return;
      Promise.resolve(this.o.onFinish(this.state)).then(ok => {
        if (ok !== false) { this.state.reported = true; this.save(); }
      }).catch(() => {});
    }

    // ---------- screens ----------
    pips() {
      return `<ol class="pips" aria-label="Rounds">${this.state.rounds.map((r, i) => {
        const cls = r.status !== 'done' ? (i === this.index ? 'now' : '') : (r.correct ? 'win' : 'miss');
        const label = r.status !== 'done' ? `Round ${i + 1}` : `Round ${i + 1}: ${r.correct ? r.points + ' points' : 'missed'}`;
        return `<li class="pip ${cls}" title="${label}"><span>${r.status === 'done' ? (r.correct ? '+' + r.points : '✕') : i + 1}</span></li>`;
      }).join('')}</ol>`;
    }

    renderIntro() {
      const i = this.index;
      const first = i === 0;
      let notice = '';
      if (this.state.forfeitNotice) {
        notice = `<p class="notice">The page was reloaded during a round, so that round was counted as a miss.</p>`;
        this.state.forfeitNotice = false; this.save();
      }
      this.card.innerHTML = `
        <p class="eyebrow">${esc(this.o.title)}</p>
        <h1 class="headline">${first ? 'Ready to cast?' : `Round ${i + 1} of ${ROUNDS}`}</h1>
        ${this.pips()}
        ${notice}
        <p class="lede">${first
          ? 'Three secret words are swimming below. Each round you get <b>60 seconds</b>, <b>5 guesses</b>, and a new hint after every miss.'
          : `Score so far: <b>${this.state.total}</b> point${this.state.total === 1 ? '' : 's'}. The timer starts when you press the button.`}</p>
        <button class="btn btn-primary btn-big" id="begin-btn" type="button">🎣 Begin Reeling</button>
        ${first ? '<p class="muted small center">Round 1 of 3 · the timer starts when you press it</p>' : ''}
      `;
      $('#begin-btn').addEventListener('click', () => this.startRound());
    }

    startRound() {
      // Daily game opened before midnight but started after it: load the new day instead.
      if (this.o.dateKey && this.o.dateKey !== localDateKey() && this.index === 0) { location.reload(); return; }
      const r = this.state.rounds[this.index];
      Object.assign(r, { status: 'active', startedAt: Date.now(), guesses: [] });
      this.save();
      this.renderRound();
      Scene.setActive(true);
      this.timer = setInterval(() => this.tick(), 100);
      this.tick();
    }

    renderRound() {
      const i = this.index;
      this.card.innerHTML = `
        <div class="round-head">
          <span class="eyebrow">${esc(this.o.title)} · Round ${i + 1}/${ROUNDS}</span>
          <span class="timer" id="timer" aria-label="Seconds left"><span id="time-left">${Math.ceil(ROUND_MS / 1000)}</span>s</span>
        </div>
        <div class="timebar" aria-hidden="true"><div class="timebar-fill" id="timebar"></div></div>
        <form class="guess-form" id="guess-form" autocomplete="off">
          <label class="sr-only" for="guess-input">Your guess</label>
          <input id="guess-input" class="guess-input" type="text" inputmode="text" enterkeyhint="go"
                 autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="30"
                 placeholder="Type your guess…">
          <button class="btn btn-primary" type="submit">Cast</button>
        </form>
        <div class="hooks" id="hooks" aria-label="Guesses left"></div>
        <p class="hint-label">Hints</p>
        <ol class="hints" id="hints"></ol>
        <div class="tried" id="tried"></div>
        <p class="feedback" id="feedback" aria-live="polite"></p>
      `;
      const form = $('#guess-form');
      const input = $('#guess-input');
      form.addEventListener('submit', e => { e.preventDefault(); this.guess(input.value); });
      this.updateRound(false);
      input.focus();
    }

    updateRound(animateNewHint) {
      const r = this.state.rounds[this.index];
      const w = this.words[this.index];
      const misses = r.guesses.length;
      const shown = Math.min(MAX_HINTS, 1 + misses);
      $('#hints').innerHTML = w.hints.slice(0, shown).map((h, k) =>
        `<li class="hint ${animateNewHint && k === shown - 1 ? 'new' : ''}"><span class="hint-n">${k + 1}</span>${esc(h)}</li>`).join('');
      const left = MAX_GUESSES - r.guesses.length;
      $('#hooks').innerHTML = Array.from({ length: MAX_GUESSES }, (_, k) =>
        `<span class="hook-ico ${k < left ? '' : 'used'}" aria-hidden="true"></span>`).join('') +
        `<span class="sr-only">${left} guesses left</span><span class="hooks-label">${left} guess${left === 1 ? '' : 'es'} left</span>`;
      $('#tried').innerHTML = r.guesses.map(g => `<span class="chip-miss">${esc(g)}</span>`).join('');
    }

    tick() {
      const r = this.state.rounds[this.index];
      if (!r || r.status !== 'active') return;
      const elapsed = Date.now() - r.startedAt;
      const left = Math.max(0, ROUND_MS - elapsed);
      const tl = $('#time-left'), bar = $('#timebar'), timer = $('#timer');
      if (tl) tl.textContent = Math.ceil(left / 1000);
      if (bar) bar.style.transform = `scaleX(${left / ROUND_MS})`;
      if (timer) timer.classList.toggle('low', left <= 10000);
      if (bar) bar.classList.toggle('low', left <= 10000);
      if (left <= 0) this.endRound(false, 'time');
    }

    stopTimer() { clearInterval(this.timer); this.timer = null; }

    guess(raw) {
      const r = this.state.rounds[this.index];
      if (!r || r.status !== 'active') return;
      const g = normalize(raw);
      const input = $('#guess-input');
      const fb = $('#feedback');
      if (!g) { input.focus(); return; } // empty guesses don't count
      if (r.guesses.includes(g)) {
        fb.textContent = `You already tried “${g}”.`;
        input.select(); this.shake(); return;
      }
      const elapsed = Date.now() - r.startedAt;
      if (elapsed >= ROUND_MS) { this.endRound(false, 'time'); return; }
      const answer = normalize(this.words[this.index].word);
      if (g === answer) {
        r.guesses.push(g);
        this.endRound(true, 'correct', elapsed);
        return;
      }
      r.guesses.push(g);
      this.save();
      input.value = '';
      Scene.nibble();
      if (r.guesses.length >= MAX_GUESSES) { this.endRound(false, 'guesses', elapsed); return; }
      fb.textContent = r.guesses.length < MAX_HINTS ? 'Just a nibble… here’s another hint.' : 'Last chance!';
      this.shake();
      this.updateRound(true);
      input.focus();
    }

    shake() {
      const f = $('#guess-form'); if (!f) return;
      f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    }

    endRound(correct, reason, elapsedMs) {
      this.stopTimer();
      const i = this.index;
      const r = this.state.rounds[i];
      const elapsed = Math.min(ROUND_MS, elapsedMs != null ? elapsedMs : Date.now() - r.startedAt);
      const sc = scoreRound(correct, elapsed, r.guesses.length);
      Object.assign(r, { status: 'done', correct, reason, timeMs: elapsed, points: sc.total, breakdown: sc });
      this.recount();
      this.save();
      Scene.setActive(false);
      if (correct) Scene.cheer();
      this.renderRoundResult(i, sc);
      if (this.state.finished) this.report();
    }

    renderRoundResult(i, sc) {
      const r = this.state.rounds[i];
      const word = this.words[i].word;
      const why = { time: 'Time ran out', guesses: 'Out of guesses', refresh: 'Round forfeited' }[r.reason] || '';
      const secs = (r.timeMs / 1000).toFixed(1);
      this.card.innerHTML = `
        <p class="eyebrow">${esc(this.o.title)} · Round ${i + 1}/${ROUNDS}</p>
        <h1 class="headline">${r.correct ? 'Hooked it!' : 'It got away…'}</h1>
        <p class="reveal-label">The word was</p>
        <p class="reveal">${esc(word.toUpperCase())}</p>
        <div class="round-points ${r.correct ? 'win' : 'miss'}">
          <span class="pts">+${sc.total}</span><span class="pts-label">point${sc.total === 1 ? '' : 's'}</span>
        </div>
        ${r.correct ? `
          <ul class="breakdown">
            <li><span>Correct word</span><b>+${sc.base}</b></li>
            <li><span>Speed (${secs}s)</span><b>+${sc.time}</b></li>
            <li><span>Guess #${r.guesses.length}</span><b>+${sc.guess}</b></li>
          </ul>` : `<p class="muted center">${why}. No points this round.</p>`}
        ${this.pips()}
        <div class="next-slot" id="next-slot"></div>
      `;
      const slot = $('#next-slot');
      if (this.state.finished) {
        slot.innerHTML = `<p class="muted center small reel-msg">Reeling in your catch…</p>`;
        this.later(() => this.finale(), 2600);
      } else {
        this.later(() => {
          slot.innerHTML = `<button class="btn btn-primary btn-big appear" id="begin-btn" type="button">🎣 Begin Reeling <span class="small">· Round ${i + 2}</span></button>`;
          $('#begin-btn').addEventListener('click', () => this.startRound());
          $('#begin-btn').focus();
        }, 1300);
      }
    }

    async finale() {
      this.state.finaleShown = true;
      this.save();
      this.card.classList.add('card--away');
      await Scene.reelIn(fishFor(this.state.total));
      await new Promise(res => this.later(res, 500));
      this.card.classList.remove('card--away');
      this.renderResults(true);
    }

    renderResults(fresh) {
      const s = this.state;
      const fish = fishFor(s.total);
      const F = Scene.FISH[fish];
      const rows = s.rounds.map((r, i) => `
        <tr class="${r.correct ? 'win' : 'miss'}">
          <td>${i + 1}</td>
          <td class="word">${esc(cap(this.words[i].word))}</td>
          <td>${r.correct ? `✓ ${r.guesses.length}/5` : (r.reason === 'time' ? '⏰' : r.reason === 'refresh' ? '↻' : '✕')}</td>
          <td>${r.correct ? (r.timeMs / 1000).toFixed(1) + 's' : '–'}</td>
          <td class="pts">${r.points}</td>
        </tr>`).join('');
      this.card.innerHTML = `
        <p class="eyebrow">${esc(this.o.title)}</p>
        <div class="fish-stage ${fresh ? 'fresh' : ''}">${Scene.fishSVG(fish, 'fish-svg fish-' + fish)}</div>
        <h1 class="headline center">You caught a ${esc(F.name)}!</h1>
        <p class="total"><span>${s.total}</span>/27</p>
        <table class="results-table">
          <thead><tr><th>#</th><th>Word</th><th>Guesses</th><th>Time</th><th>Pts</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button class="btn btn-primary btn-big" id="share-btn" type="button">Share result</button>
        <div class="extra" id="extra"></div>
      `;
      $('#share-btn').addEventListener('click', () => this.share());
      if (this.o.renderExtra) this.o.renderExtra($('#extra'), this);
    }

    shareText() {
      const s = this.state;
      const fish = Scene.FISH[fishFor(s.total)].name;
      const lines = s.rounds.map((r, i) => {
        const squares = r.guesses.map((g, k) => (r.correct && k === r.guesses.length - 1) ? '🟩' : '🟥').join('');
        if (r.correct) return `R${i + 1} ${squares} ⏱️${Math.round(r.timeMs / 1000)}s +${r.points}`;
        if (r.reason === 'time') return `R${i + 1} ${squares || '⬜'} ⏰ +0`;
        if (r.reason === 'refresh') return `R${i + 1} ✖️ +0`;
        return `R${i + 1} ${squares} +0`;
      });
      const url = CFG.SITE_URL || (location.origin + location.pathname);
      return `${this.o.shareTitle} 🎣 ${s.total}/27\nCaught a ${fish}!\n${lines.join('\n')}\n${url}`;
    }

    async share() {
      const text = this.shareText();
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
        ta.remove();
      }
      toast(ok ? 'Copied! Paste it anywhere to share.' : 'Couldn’t copy automatically. Here it is:\n' + text, ok ? 2200 : 6000);
    }
  }

  // ---------------------------------------------------------------- daily game + app
  function renderDailyExtra(el, game) {
    el.innerHTML = `
      <div class="countdown">
        <span class="muted small">Next daily catch in</span>
        <span class="clock" id="countdown">${fmtCountdown(msUntilMidnight())}</span>
      </div>
      <div id="premium-cta"></div>`;
    clearInterval(game.extraTimer);
    game.extraTimer = setInterval(() => {
      const ms = msUntilMidnight();
      const c = $('#countdown');
      if (c) c.textContent = fmtCountdown(ms);
      if (localDateKey() !== game.o.dateKey) location.reload();
    }, 1000);
    document.dispatchEvent(new CustomEvent('hooksy:results-shown', { detail: { el: $('#premium-cta'), mode: 'daily' } }));
  }

  function cleanupOldGames() {
    const today = localDateKey();
    store.keys().forEach(k => {
      const m = k.match(/^hooksy:(daily|premium):(\d{4}-\d{2}-\d{2})/);
      if (m && daysBetween(m[2], today) > 14) store.remove(k);
    });
  }

  const App = {
    current: null,
    play(game) {
      if (this.current) this.current.unmount();
      this.current = game;
      game.mount();
    },
    startDaily() {
      const dateKey = localDateKey();
      const p = dailyPuzzle(dateKey);
      this.play(new Game({
        storageKey: `hooksy:daily:${dateKey}`,
        dateKey,
        title: `Daily Catch #${p.number}`,
        shareTitle: `${NAME} #${p.number}`,
        words: p.words,
        renderExtra: renderDailyExtra,
      }));
    },
  };

  window.Hooksy = { App, Game, store, toast, openModal, closeModal, localDateKey, fishFor, scoreRound, esc, $ };

  // ---------------------------------------------------------------- boot
  $('#help-btn').addEventListener('click', () => openModal('help-modal'));
  cleanupOldGames();
  App.startDaily();
  if (!store.get('hooksy:seen-help')) {
    store.set('hooksy:seen-help', true);
    setTimeout(() => openModal('help-modal'), 400);
  }
})();
