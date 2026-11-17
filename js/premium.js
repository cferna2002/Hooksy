/*
  Hooksy Premium: sign-in (email magic link via Supabase), Stripe checkout link,
  "games left today" tracker, Stripe customer portal, and the 5 extra daily games.

  Premium words are fetched from the server ONLY for signed-in, active subscribers.
  If SUPABASE_URL / SUPABASE_ANON_KEY are empty in config.js, this file does nothing
  and Hooksy runs as a free daily game.
*/
(function () {
  'use strict';

  const CFG = window.HOOKSY_CONFIG || {};
  const H = window.Hooksy;
  if (!H) return;
  const { $, esc, toast, openModal, closeModal, localDateKey } = H;

  const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const btn = $('#premium-btn');
  const badge = $('#premium-badge');
  const body = $('#premium-body');
  const PER_DAY = CFG.PREMIUM_GAMES_PER_DAY || 5;
  const PRICE = CFG.PREMIUM_PRICE_LABEL || '$4.99/month';
  const SITE = CFG.SITE_URL || (location.origin + location.pathname);

  if (!configured) return; // free-only mode: the Premium button stays hidden

  btn.hidden = false;

  let sb = null;          // Supabase client
  let session = null;
  let status = null;      // last /premium status response
  let loading = false;
  let view = 'main';      // 'main' | 'signin' | 'sent' | 'welcome'
  let sentTo = '';
  const fromMagicLink = /access_token=|error_description=/.test(location.hash);

  // ------------------------------------------------------------ setup
  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load the sign-in library. Check your connection.'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    try {
      await loadSupabase();
    } catch (e) { badge.textContent = 'Premium'; return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await sb.auth.getSession();
    session = data.session;

    sb.auth.onAuthStateChange((event, s) => {
      session = s;
      if (event === 'SIGNED_IN') { view = 'main'; refreshStatus(); }
      if (event === 'SIGNED_OUT') { status = null; view = 'main'; updateBadge(); renderIfOpen(); renderPromo(); }
    });

    const params = new URLSearchParams(location.search);
    const paid = params.get('premium') === 'success';
    if (paid) history.replaceState(null, '', location.pathname + location.hash);

    if (session) await refreshStatus();
    else updateBadge();

    if (paid) {
      view = session ? 'main' : 'welcome';
      openPremium();
      if (session) pollForSubscription();
    } else if (fromMagicLink) {
      if (/error_description=/.test(location.hash)) toast('That sign-in link has expired. Please request a new one.', 4000);
      openPremium();
    }
  }

  // ------------------------------------------------------------ server calls
  async function api(action, extra) {
    const { data, error } = await sb.functions.invoke('premium', {
      body: Object.assign({ action, date: localDateKey() }, extra || {}),
    });
    if (error) {
      let msg = error.message || 'Something went wrong';
      try { const j = await error.context.json(); msg = j.message || j.error || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return data;
  }

  async function refreshStatus() {
    if (!session) { status = null; updateBadge(); renderIfOpen(); return null; }
    loading = true; renderIfOpen();
    try { status = await api('status'); }
    catch (e) { status = { error: e.message }; }
    loading = false;
    updateBadge(); renderIfOpen(); renderPromo();
    return status;
  }

  async function pollForSubscription() {
    // Stripe's webhook usually lands within a few seconds of checkout.
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const s = await refreshStatus();
      if (s && s.premium) { toast('Welcome to Hooksy Premium! 🎣'); return; }
    }
  }

  // ------------------------------------------------------------ UI
  function updateBadge() {
    if (status && status.premium) badge.textContent = `${status.gamesLeft}/${PER_DAY} extra left`;
    else badge.textContent = 'Go Premium';
  }

  function isOpen() { return !$('#premium-modal').hidden; }
  function renderIfOpen() { if (isOpen()) render(); }
  function openPremium() { render(); openModal('premium-modal'); }

  function checkoutUrl() {
    const u = new URL(CFG.STRIPE_PAYMENT_LINK);
    if (session && session.user) {
      u.searchParams.set('client_reference_id', session.user.id);
      if (session.user.email) u.searchParams.set('prefilled_email', session.user.email);
    }
    return u.toString();
  }

  function trackerHTML(left) {
    const used = PER_DAY - left;
    return `<div class="tracker" aria-hidden="true">${Array.from({ length: PER_DAY }, (_, i) => `<span class="dot ${i < used ? 'used' : ''}"></span>`).join('')}</div>
      <p class="tracker-label">${left} of ${PER_DAY} extra games left today</p>`;
  }

  function render() {
    if (!sb) { body.innerHTML = `<h2>Hooksy Premium</h2><p class="muted">Loading…</p>`; return; }

    if (view === 'sent') {
      body.innerHTML = `
        <h2>Check your email</h2>
        <p>We sent a sign-in link to <b>${esc(sentTo)}</b>. Open it on this device to finish signing in.</p>
        <p class="fine">No email after a minute? Check your spam folder, or go back and try again.</p>
        <button class="btn btn-secondary" type="button" id="p-back">Back</button>`;
      $('#p-back').onclick = () => { view = 'signin'; render(); };
      return;
    }

    if (!session && (view === 'signin' || view === 'welcome')) {
      body.innerHTML = `
        <h2>${view === 'welcome' ? 'Thanks for subscribing!' : 'Subscriber sign-in'}</h2>
        <p>${view === 'welcome'
          ? 'One last step: sign in with the <b>same email you used at checkout</b> so we can unlock your extra games.'
          : 'Enter the email you used to subscribe. We’ll send you a one-tap sign-in link, no password needed.'}</p>
        <form id="p-signin">
          <label class="sr-only" for="p-email">Email</label>
          <input class="field" id="p-email" type="email" autocomplete="email" required placeholder="you@example.com">
          <button class="btn btn-primary" type="submit" id="p-send">Email me a sign-in link</button>
        </form>
        ${view === 'signin' ? `<button class="btn btn-ghost" type="button" id="p-back">Back</button>` : ''}
        <p class="fine">Only premium subscribers need an account. The daily game is always free, no sign-in required.</p>`;
      $('#p-signin').onsubmit = sendLink;
      const back = $('#p-back'); if (back) back.onclick = () => { view = 'main'; render(); };
      return;
    }

    if (!session) {
      body.innerHTML = `
        <h2>Hooksy Premium</h2>
        <p class="price">${esc(PRICE)}</p>
        <ul class="perks">
          <li><b>5 extra games every day</b>, each with 3 brand-new words</li>
          <li>Different words from the daily game and from each other</li>
          <li>Cancel any time from your Stripe billing page</li>
        </ul>
        <a class="btn btn-primary btn-big" id="p-buy" href="${esc(checkoutUrl())}">Go Premium</a>
        <p class="center"><button class="btn btn-ghost" type="button" id="p-have">Already subscribed? Sign in</button></p>
        <p class="fine">Payments are handled securely by Stripe. After paying you’ll come back here and sign in with the same email.</p>`;
      $('#p-have').onclick = () => { view = 'signin'; render(); };
      return;
    }

    // Signed in
    const email = esc(session.user.email || '');
    if (loading && !status) { body.innerHTML = `<h2>Hooksy Premium</h2><p class="muted">Checking your subscription…</p>`; return; }
    if (status && status.error) {
      body.innerHTML = `<h2>Hooksy Premium</h2><p class="notice">${esc(status.error)}</p>
        <div class="btn-row"><button class="btn btn-secondary" id="p-retry" type="button">Try again</button><button class="btn btn-ghost" id="p-out" type="button">Sign out</button></div>`;
      $('#p-retry').onclick = refreshStatus; $('#p-out').onclick = signOut;
      return;
    }

    if (!status || !status.premium) {
      body.innerHTML = `
        <h2>Hooksy Premium</h2>
        <p>Signed in as <b>${email}</b>.</p>
        <p class="notice">${status && status.hasCustomer
          ? `Your subscription isn’t active right now (status: ${esc(status.status)}).`
          : 'We couldn’t find an active subscription for this email yet.'}</p>
        <p class="price">${esc(PRICE)}</p>
        <a class="btn btn-primary btn-big" href="${esc(checkoutUrl())}">Subscribe now</a>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-secondary" id="p-refresh" type="button">I just paid, check again</button>
          ${status && status.hasCustomer ? `<button class="btn btn-secondary" id="p-portal" type="button">Manage subscription</button>` : ''}
        </div>
        <p class="center"><button class="btn btn-ghost" id="p-out" type="button">Sign out</button></p>`;
      $('#p-refresh').onclick = refreshStatus;
      $('#p-out').onclick = signOut;
      const portal = $('#p-portal'); if (portal) portal.onclick = openPortal;
      return;
    }

    const left = status.gamesLeft;
    const resume = status.resumeGameNo;
    body.innerHTML = `
      <h2>Hooksy Premium ⭐</h2>
      <p class="muted small">Signed in as ${email}</p>
      ${trackerHTML(left)}
      ${resume ? `<button class="btn btn-primary btn-big" id="p-play" type="button">Continue extra game ${resume}</button>`
        : left > 0 ? `<button class="btn btn-primary btn-big" id="p-play" type="button">🎣 Play extra game ${PER_DAY - left + 1}</button>`
        : `<p class="center">You’ve played all your extra games today. New ones arrive at midnight!</p>`}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-secondary" id="p-portal" type="button">Manage subscription</button>
        <button class="btn btn-secondary" id="p-out" type="button">Sign out</button>
      </div>`;
    const play = $('#p-play'); if (play) play.onclick = playExtra;
    $('#p-portal').onclick = openPortal;
    $('#p-out').onclick = signOut;
  }

  async function sendLink(e) {
    e.preventDefault();
    const email = $('#p-email').value.trim();
    if (!email) return;
    const b = $('#p-send'); b.disabled = true; b.textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: SITE, shouldCreateUser: true } });
    if (error) { b.disabled = false; b.textContent = 'Email me a sign-in link'; toast(error.message, 4000); return; }
    sentTo = email; view = 'sent'; render();
  }

  async function signOut() { await sb.auth.signOut(); toast('Signed out'); }

  async function openPortal() {
    try {
      const { url } = await api('portal');
      location.href = url;
    } catch (e) { toast(e.message, 4000); }
  }

  // ------------------------------------------------------------ extra games
  async function playExtra() {
    const cur = H.App.current;
    if (cur && cur.isRoundActive) { toast('Finish your current round first!'); return; }
    const b = $('#p-play'); if (b) { b.disabled = true; b.textContent = 'Casting…'; }
    let res;
    try { res = await api('start'); }
    catch (e) { toast(e.message, 4000); refreshStatus(); return; }
    closeModal('premium-modal');
    startPremiumGame(res);
    refreshStatus();
  }

  function startPremiumGame(res) {
    const game = new H.Game({
      storageKey: `hooksy:premium:${res.date}:${res.gameNo}`,
      title: `Extra Catch ${res.gameNo}/${PER_DAY}`,
      shareTitle: `${CFG.GAME_NAME || 'Hooksy'} Extra ${res.gameNo}`,
      words: res.words,
      onFinish: async state => {
        try {
          await api('finish', {
            date: res.date,
            gameNo: res.gameNo,
            score: state.total,
            rounds: state.rounds.map(r => ({ correct: !!r.correct, guesses: r.guesses.length, timeMs: r.timeMs || 0, points: r.points || 0, reason: r.reason })),
          });
          refreshStatus();
          return true;
        } catch (e) { return false; }
      },
      renderExtra: (el) => {
        const left = status && status.premium ? status.gamesLeft : 0;
        el.innerHTML = `
          ${trackerHTML(left)}
          <div class="btn-row">
            ${left > 0 ? `<button class="btn btn-primary" id="x-next" type="button">Next extra game</button>` : ''}
            <button class="btn btn-secondary" id="x-daily" type="button">Back to daily game</button>
          </div>`;
        const n = $('#x-next'); if (n) n.onclick = () => { view = 'main'; openPremium(); };
        $('#x-daily').onclick = () => H.App.startDaily();
      },
    });
    H.App.play(game);
  }

  // Promo box on the daily results card (re-rendered whenever the status changes).
  function renderPromo() {
    const el = document.getElementById('premium-cta');
    if (!el) return;
    if (status && status.premium) {
      const canPlay = status.gamesLeft > 0 || status.resumeGameNo;
      el.innerHTML = `<div class="promo">${trackerHTML(status.gamesLeft)}
        ${canPlay ? `<button class="btn btn-primary btn-big" id="promo-play" type="button">🎣 Play an extra game</button>` : ''}</div>`;
      const p = $('#promo-play'); if (p) p.onclick = () => { view = 'main'; openPremium(); };
    } else {
      el.innerHTML = `<div class="promo"><p>Hungry for more? Get 5 extra games every day.</p>
        <button class="btn btn-primary" id="promo-go" type="button">⭐ Go Premium · ${esc(PRICE)}</button></div>`;
      $('#promo-go').onclick = () => { view = 'main'; openPremium(); };
    }
  }
  document.addEventListener('hooksy:results-shown', renderPromo);

  btn.addEventListener('click', () => { view = 'main'; openPremium(); if (session) refreshStatus(); });

  init();
})();
