/*
  Hooksy background scene: animated water, bobbing float, fishing rod and the reel-in finale.
  Exposes window.HooksyScene.
*/
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Fish artwork (all drawn nose-right, centred near 0,0, in a shared scale) ----------
  // mouth = x position of the mouth (where the hook goes).
  const FISH = {
    goldfish: {
      name: 'Goldfish', mouth: 17,
      art: `
        <path d="M-12,0 C-22,-15 -33,-17 -31,-6 Q-27,0 -31,6 C-33,17 -22,15 -12,0Z" fill="#ffb347"/>
        <path d="M-8,-7 Q0,-20 9,-8Z" fill="#ffb347"/>
        <ellipse cx="2" cy="0" rx="15" ry="10.5" fill="#f57f20"/>
        <path d="M-2,8 Q-4,15 5,9Z" fill="#ffb347"/>
        <path d="M5,-6 Q9,0 5,6" stroke="#d86512" stroke-width="1.2" fill="none"/>
        <circle cx="10" cy="-3" r="2.6" fill="#fff"/><circle cx="10.8" cy="-3" r="1.4" fill="#222"/>`,
    },
    bass: {
      name: 'Bass', mouth: 46,
      art: `
        <path d="M-34,0 L-50,-17 Q-45,0 -50,17Z" fill="#4c6b2a"/>
        <path d="M-20,-16 L-16,-28 L-11,-18 L-6,-29 L-1,-19 L4,-28 L8,-19 L14,-17Z" fill="#4c6b2a"/>
        <path d="M-36,0 C-26,-21 18,-25 40,-8 L48,-5 L42,0 L48,4 C24,20 -22,19 -36,0Z" fill="#76963d"/>
        <path d="M-32,3 C-12,15 22,15 42,3 C22,9 -12,10 -32,3Z" fill="#e4e3a8"/>
        <path d="M-28,-1 Q-20,-5 -12,-1 Q-4,-6 4,-1 Q12,-5 20,-1" stroke="#3c5520" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
        <path d="M26,-12 Q20,0 27,10" stroke="#4c6b2a" stroke-width="1.5" fill="none"/>
        <path d="M8,10 Q2,20 14,13Z" fill="#4c6b2a"/>
        <circle cx="35" cy="-8" r="3.2" fill="#fff"/><circle cx="36" cy="-8" r="1.8" fill="#222"/>`,
    },
    salmon: {
      name: 'Salmon', mouth: 63,
      art: `
        <path d="M-46,0 L-64,-16 L-57,0 L-64,16Z" fill="#7d8fa3"/>
        <path d="M-10,-14 Q-4,-29 8,-15Z" fill="#7d8fa3"/>
        <path d="M-34,-9 Q-31,-16 -26,-10Z" fill="#7d8fa3"/>
        <path d="M-50,0 C-34,-17 30,-20 60,-4 Q66,0 60,4 C30,17 -34,15 -50,0Z" fill="#cdd7e1"/>
        <path d="M-50,0 C-34,-17 30,-20 60,-4 C30,-10 -30,-8 -50,0Z" fill="#6f8399"/>
        <path d="M-44,2 C-20,6 20,6 54,1 C20,9 -20,10 -44,2Z" fill="#f29a8f" opacity=".9"/>
        <g fill="#4f6075"><circle cx="-24" cy="-8" r="1.3"/><circle cx="-14" cy="-10" r="1.3"/><circle cx="-4" cy="-9" r="1.3"/><circle cx="8" cy="-11" r="1.3"/><circle cx="20" cy="-10" r="1.3"/><circle cx="-30" cy="-4" r="1.2"/></g>
        <path d="M38,-10 Q33,0 39,9" stroke="#8a9bb0" stroke-width="1.4" fill="none"/>
        <path d="M10,8 Q4,19 18,11Z" fill="#9fb0c2"/>
        <circle cx="50" cy="-4" r="2.8" fill="#fff"/><circle cx="50.8" cy="-4" r="1.5" fill="#222"/>`,
    },
    tuna: {
      name: 'Tuna', mouth: 84,
      art: `
        <path d="M-62,0 L-88,-30 Q-74,0 -88,30Z" fill="#1f3a68"/>
        <path d="M-6,-24 Q4,-46 20,-24Z" fill="#1f3a68"/>
        <path d="M-6,24 Q4,40 18,24Z" fill="#f4c430"/>
        <path d="M-60,0 C-40,-30 40,-34 80,-5 Q86,0 80,5 C40,32 -40,28 -60,0Z" fill="#cfd8e3"/>
        <path d="M-60,0 C-40,-30 40,-34 80,-5 C50,-6 -30,-2 -60,0Z" fill="#24467d"/>
        <g fill="#f4c430">
          <path d="M-54,-6 L-51,-12 L-48,-7Z"/><path d="M-46,-9 L-43,-15 L-40,-10Z"/><path d="M-38,-12 L-35,-18 L-32,-13Z"/>
          <path d="M-54,6 L-51,12 L-48,7Z"/><path d="M-46,9 L-43,15 L-40,10Z"/><path d="M-38,12 L-35,18 L-32,13Z"/>
        </g>
        <path d="M46,2 Q12,6 -10,15 Q20,1 46,2Z" fill="#24467d" opacity=".9"/>
        <path d="M58,-13 Q51,0 58,12" stroke="#7d8da3" stroke-width="1.6" fill="none"/>
        <circle cx="68" cy="-5" r="3.8" fill="#fff"/><circle cx="69" cy="-5" r="2.1" fill="#222"/>`,
    },
    swordfish: {
      name: 'Swordfish', mouth: 64,
      art: `
        <path d="M-80,0 L-108,-38 Q-92,0 -108,38Z" fill="#3b3f7a"/>
        <path d="M-14,-21 C-12,-60 18,-58 26,-23Z" fill="#3b3f7a"/>
        <path d="M-84,0 C-62,-26 30,-30 62,-6 L118,-1.2 L118,1.2 L62,6 C30,24 -62,22 -84,0Z" fill="#d6dbe8"/>
        <path d="M-84,0 C-62,-26 30,-30 62,-6 L118,-1.2 L62,-1 C20,-4 -50,-2 -84,0Z" fill="#454b8f"/>
        <path d="M40,6 Q18,26 8,28 Q26,10 40,6Z" fill="#454b8f"/>
        <path d="M-40,14 Q-34,26 -26,16Z" fill="#3b3f7a"/>
        <path d="M42,-14 Q36,0 43,12" stroke="#8d93b8" stroke-width="1.6" fill="none"/>
        <circle cx="52" cy="-5" r="3.8" fill="#fff"/><circle cx="53" cy="-5" r="2.1" fill="#222"/>`,
    },
  };

  function fishSVG(type, cls) {
    const f = FISH[type] || FISH.goldfish;
    return `<svg class="${cls || 'fish-svg'}" viewBox="-122 -64 244 128" role="img" aria-label="${f.name}">${f.art}</svg>`;
  }

  // ---------- Scene geometry ----------
  const svg = document.getElementById('scene');
  if (!svg) { window.HooksyScene = { fishSVG, FISH, setActive() {}, nibble() {}, reelIn: () => Promise.resolve(), showCatch() {}, reset() {} }; return; }

  const el = id => document.getElementById(id);
  const rodEl = el('rod'), lineEl = el('line'), floatEl = el('float'), catchEl = el('catch'), partEl = el('particles');

  const BUTT = { x: 248, y: 252 };
  const TIP_REST = { x: 440, y: 128 };
  const TIP_UP = { x: 420, y: 104 };
  const FLOAT_BASE = { x: 640, y: 322 };
  const FISH_SCALE = 1.25;

  // On tall/narrow screens, zoom in on the fisherman + float so the scene isn't tiny.
  function fit() {
    const portrait = window.innerWidth < window.innerHeight * 0.95;
    svg.setAttribute('viewBox', portrait ? '170 0 510 450' : '0 0 800 450');
    svg.setAttribute('preserveAspectRatio', portrait ? 'xMidYMax slice' : 'xMidYMax meet');
  }
  fit();
  window.addEventListener('resize', fit);

  // Waves: long gentle paths that drift by exactly one wavelength (seamless loop via CSS).
  (function buildWaves() {
    const g = el('waves');
    const rows = [
      { y: 262, amp: 2, len: 50, w: 1.2, op: 0.35, cls: 'wave w1' },
      { y: 286, amp: 2.5, len: 60, w: 1.4, op: 0.30, cls: 'wave w2' },
      { y: 318, amp: 3, len: 70, w: 1.6, op: 0.28, cls: 'wave w3' },
      { y: 360, amp: 3.5, len: 80, w: 1.8, op: 0.22, cls: 'wave w4' },
      { y: 408, amp: 4, len: 90, w: 2, op: 0.18, cls: 'wave w5' },
    ];
    rows.forEach(r => {
      let d = `M${-1400},${r.y}`;
      for (let x = -1400; x < 2200; x += r.len) {
        d += ` q${r.len / 4},${-r.amp} ${r.len / 2},0 t${r.len / 2},0`;
      }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke-width', r.w);
      p.setAttribute('opacity', r.op);
      p.setAttribute('class', r.cls);
      p.style.setProperty('--wave-len', r.len + 'px');
      g.appendChild(p);
    });
  })();

  // ---------- State ----------
  let mode = 'fishing'; // 'fishing' | 'reeling' | 'caught'
  let active = false;
  let twitch = 0;
  let tip = { ...TIP_REST };
  let bend = 0.06;
  let fishType = null;
  let fishGroup = null;
  let reel = null;
  let particles = [];
  const t0 = performance.now();

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = t => Math.max(0, Math.min(1, t));
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function drawRod() {
    const dx = tip.x - BUTT.x, dy = tip.y - BUTT.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len; // normal (points down-right for this rod)
    const mx = (BUTT.x + tip.x) / 2, my = (BUTT.y + tip.y) / 2;
    const cx = mx - nx * len * bend * -1, cy = my - ny * len * bend * -1;
    rodEl.setAttribute('d', `M${BUTT.x},${BUTT.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${tip.x.toFixed(1)},${tip.y.toFixed(1)}`);
  }

  function drawLine(x, y, sag) {
    const mx = (tip.x + x) / 2, my = (tip.y + y) / 2 + sag;
    lineEl.setAttribute('d', `M${tip.x.toFixed(1)},${tip.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`);
  }

  function setFloat(x, y, visible) {
    floatEl.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    floatEl.style.opacity = visible ? 1 : 0;
  }

  function placeFish(x, y, angle) {
    if (!fishGroup) return;
    const f = FISH[fishType];
    fishGroup.setAttribute('transform',
      `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${FISH_SCALE}) translate(${-f.mouth},0)`);
  }

  function makeFish(type) {
    fishType = FISH[type] ? type : 'goldfish';
    catchEl.innerHTML = '';
    fishGroup = document.createElementNS(NS, 'g');
    fishGroup.innerHTML = FISH[fishType].art;
    catchEl.appendChild(fishGroup);
  }

  function splash(x, y, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + Math.random() * Math.PI; // upwards half-circle
      const v = (0.6 + Math.random()) * power;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', (1.2 + Math.random() * 2).toFixed(1));
      partEl.appendChild(c);
      particles.push({ el: c, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 1.4, life: 1 });
    }
  }

  function stepParticles() {
    particles = particles.filter(p => {
      p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.life -= 0.022;
      if (p.life <= 0 || p.y > 460) { p.el.remove(); return false; }
      p.el.setAttribute('cx', p.x.toFixed(1)); p.el.setAttribute('cy', p.y.toFixed(1));
      p.el.setAttribute('opacity', p.life.toFixed(2));
      return true;
    });
  }

  function frame(now) {
    const t = (now - t0) / 1000;

    if (mode === 'fishing') {
      const amp = active ? 3.2 : 1.6;
      const speed = active ? 2.4 : 1.3;
      if (active && !reduceMotion && Math.random() < 0.005) twitch = Math.max(twitch, 0.7);
      twitch *= 0.93;
      const fx = FLOAT_BASE.x + Math.sin(t * speed * 0.45) * 1.5;
      const fy = FLOAT_BASE.y + (reduceMotion ? 0 : Math.sin(t * speed) * amp) + twitch * 7;
      tip = { x: TIP_REST.x - twitch * 3, y: TIP_REST.y + twitch * 6 + (active && !reduceMotion ? Math.sin(t * 4.5) * 0.8 : 0) };
      bend = 0.06 + twitch * 0.12;
      drawRod();
      drawLine(fx, fy - 14, 26 - twitch * 14);
      setFloat(fx, fy, true);
    } else if (mode === 'reeling' && reel) {
      const e = clamp01((now - reel.start) / reel.duration);
      const p1 = clamp01(e / 0.22);         // strike: float plunges, rod bends
      const p2 = clamp01((e - 0.22) / 0.5); // haul: fish flies out of the water
      const p3 = clamp01((e - 0.72) / 0.28);// settle: fish swings on the line
      const fy0 = FLOAT_BASE.y + p1 * 16;

      if (p2 === 0) {
        bend = lerp(0.06, 0.42, ease(p1));
        tip = { x: lerp(TIP_REST.x, TIP_REST.x - 14, p1), y: lerp(TIP_REST.y, TIP_REST.y + 36, ease(p1)) };
        drawRod();
        drawLine(FLOAT_BASE.x, fy0 - 14 + p1 * 14, 4);
        setFloat(FLOAT_BASE.x, fy0, p1 < 0.85);
        if (p1 >= 0.85 && !reel.splashed) { reel.splashed = true; splash(FLOAT_BASE.x, FLOAT_BASE.y, 18, 3.2); }
      } else {
        setFloat(FLOAT_BASE.x, fy0, false);
        const k = ease(p2);
        bend = lerp(0.42, 0.16, k);
        tip = { x: lerp(TIP_REST.x - 14, TIP_UP.x, k), y: lerp(TIP_REST.y + 36, TIP_UP.y, k) };
        drawRod();
        const hangY = tip.y + 30;
        // Quadratic arc from the water to just under the rod tip.
        const sx = FLOAT_BASE.x, sy = FLOAT_BASE.y + 6;
        const cx = lerp(FLOAT_BASE.x, tip.x, 0.35), cy = tip.y - 70;
        const mx = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * cx + k * k * tip.x;
        const my = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * cy + k * k * hangY;
        const wiggle = reduceMotion ? 0 : Math.sin(t * 22) * 16 * (1 - p3 * 0.8);
        const settle = reduceMotion ? 0 : Math.sin(t * 6) * 10 * (1 - p3);
        const angle = lerp(-30, -90, k) + wiggle * (p3 > 0 ? 0.3 : 1) + settle;
        catchEl.style.opacity = 1;
        placeFish(mx, my, angle);
        drawLine(mx, my, 2);
        if (!reel.splashed2) { reel.splashed2 = true; splash(FLOAT_BASE.x, FLOAT_BASE.y, 26, 4); }
      }

      if (e >= 1) {
        mode = 'caught';
        const done = reel.resolve; reel = null; done();
      }
    } else if (mode === 'caught') {
      const swing = reduceMotion ? 0 : Math.sin(t * 1.8) * 4;
      tip = { ...TIP_UP }; bend = 0.16;
      drawRod();
      const x = tip.x, y = tip.y + 30;
      placeFish(x, y, -90 + swing);
      drawLine(x, y, 2);
      setFloat(FLOAT_BASE.x, FLOAT_BASE.y, false);
    }

    stepParticles();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.HooksyScene = {
    FISH,
    fishSVG,
    /** Livelier float while a round is running. */
    setActive(on) { active = !!on; document.body.classList.toggle('round-live', active); },
    /** A wrong guess: the float jerks as if something nibbled. */
    nibble() { twitch = 1; },
    /** A correct guess: little splash at the float. */
    cheer() { splash(FLOAT_BASE.x, FLOAT_BASE.y, 10, 2.2); twitch = 0.6; },
    /** Play the reel-in animation for the given fish. Resolves when the fish is hanging on the line. */
    reelIn(type) {
      makeFish(type);
      catchEl.style.opacity = 0;
      active = false;
      document.body.classList.remove('round-live');
      return new Promise(resolve => {
        mode = 'reeling';
        reel = { start: performance.now(), duration: reduceMotion ? 1400 : 3800, resolve };
      });
    },
    /** Show a fish already caught (returning visitor). */
    showCatch(type) { makeFish(type); catchEl.style.opacity = 1; mode = 'caught'; },
    /** Back to waiting for a bite (new game). */
    reset() { mode = 'fishing'; reel = null; catchEl.innerHTML = ''; fishGroup = null; active = false; document.body.classList.remove('round-live'); },
  };
})();
