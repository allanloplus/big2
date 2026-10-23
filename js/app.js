/* Allan's 資安大老二 — 遊戲流程、地圖走位、廟口戲台、對話串場 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const { TYPES } = B2;
  const L = LINES;

  // 座位順序就是出牌順序：Allan → 勒索喵 → 阿拉蕾 → 飆股老師
  const SEATS = ['allan', 'cat', 'arale', 'guru'];
  const PERSONA = { cat: { aggr: 0.75, noise: 0.12 }, arale: { aggr: 0.45, noise: 0.05 }, guru: { aggr: 0.6, noise: 0.22 } };
  const DEFAULT_MOOD = { allan: 'smile', arale: 'cheer' };
  const AVATAR = { allan: 'assets/img/allan-smile.webp', arale: 'assets/img/arale-cheer.webp', cat: 'assets/img/npc-cat.svg', guru: 'assets/img/npc-guru.svg' };
  const SPRITE = {
    allan: { r: 'assets/img/allan-walk-r.webp', l: 'assets/img/allan-walk-l.webp' },
    arale: { r: 'assets/img/arale-walk-l.webp', l: 'assets/img/arale-walk-l.webp', flipR: true },
    cat: { r: 'assets/img/npc-cat.svg', l: 'assets/img/npc-cat.svg', flipL: true },
    guru: { r: 'assets/img/npc-guru.svg', l: 'assets/img/npc-guru.svg', flipL: true },
  };
  // 同一站時四個人站開一點（地圖座標）
  const OFF = { allan: [-22, 4], cat: [-7, -7], arale: [8, 4], guru: [23, -6] };
  const QUICK = ['pair', 'straight', 'fullhouse', 'four', 'straightflush'];

  // ---------- 偏好設定 ----------
  const PKEY = 'b2.prefs.v1';
  const prefs = { rounds: 3, speed: 'mid', sfx: true, autoPass: true, sort: 'rank' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) { /* 無痕模式 */ }
  const savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
  const SPEED = { slow: 1.45, mid: 1, fast: 0.6 };
  const speed = () => SPEED[prefs.speed] || 1;

  // ---------- 音效 ----------
  const Sfx = (() => {
    let ac = null;
    const ctx = () => {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
      return ac;
    };
    function tone(freq, dur, type, vol, when, slideTo) {
      const a = prefs.sfx && ctx();
      if (!a) return;
      const t0 = a.currentTime + (when || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function snap(when) {
      const a = prefs.sfx && ctx();
      if (!a) return;
      const len = Math.floor(a.sampleRate * 0.05);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 1400;
      g.gain.value = 0.35;
      src.buffer = buf;
      src.connect(f).connect(g).connect(a.destination);
      src.start(a.currentTime + (when || 0));
    }
    return {
      unlock() { const a = ctx(); if (a && a.state === 'suspended') a.resume(); },
      tick() { tone(1250, 0.035, 'square', 0.02); },
      card(n) { for (let i = 0; i < n; i++) snap(i * 0.045); },
      deal() { for (let i = 0; i < 13; i++) snap(i * 0.06); },
      pass() { tone(360, 0.14, 'sine', 0.06, 0, 250); },
      step() { tone(560 + Math.random() * 90, 0.05, 'triangle', 0.035); },
      stamp() { tone(180, 0.12, 'square', 0.05); tone(880, 0.18, 'sine', 0.06, 0.05); },
      chime() { [660, 880, 1320].forEach((f, i) => tone(f, 0.3, 'sine', 0.08, i * 0.08)); },
      siren() { for (let i = 0; i < 3; i++) { tone(620, 0.22, 'sawtooth', 0.04, i * 0.44, 980); tone(980, 0.22, 'sawtooth', 0.04, i * 0.44 + 0.22, 620); } },
      fanfare() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.2, 'triangle', 0.08, i * 0.14)); },
      nope() { tone(220, 0.16, 'square', 0.04); tone(180, 0.2, 'square', 0.04, 0.12); },
    };
  })();

  // ---------- 流程控制 ----------
  const ABORT = Symbol('abort');
  let run = { alive: false };
  let G = null;
  let human = null;          // 等待 Allan 出牌時的 resolve
  let idleTimer = null;

  const rawSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function wait(ms, r = run) {
    await rawSleep(ms * speed());
    if (!r.alive) throw ABORT;
  }
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const nameOf = (p) => CAST[SEATS[p]].name;
  const glyph = (s) => s.replace(/[♠♥♦♣]/g, (m) => m + '︎');
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const fill = (text, ctx) => text.replace(/\{(\w+)\}/g, (m, k) => (ctx && ctx[k] != null ? ctx[k] : m));

  // ---------- 牌面 ----------
  function cardEl(c, tag = 'div') {
    const el = document.createElement(tag);
    if (tag === 'button') el.type = 'button';
    const s = B2.suitOf(c), r = B2.rankOf(c);
    const rank = B2.RANKS[r];
    el.className = 'card' + (B2.isRed(c) ? ' red' : '') + (r === 12 ? ' two' : '') + (c === B2.THREE_CLUBS ? ' c3' : '');
    el.dataset.c = c;
    el.setAttribute('aria-label', B2.SUIT_ZH[s] + rank);
    el.innerHTML = `<span class="r${rank === '10' ? ' ten' : ''}">${rank}</span><svg class="s" aria-hidden="true"><use href="#suit-${s}"/></svg><svg class="pip" aria-hidden="true"><use href="#suit-${s}"/></svg>`;
    return el;
  }

  /** 戲台上的排列：順子照順序、葫蘆三張在前 */
  function displayOrder(combo) {
    const cs = combo.cards.slice();
    if (combo.type === 'straight' || combo.type === 'straightflush') {
      const seq = B2.STRAIGHTS[combo.key >> 2];
      return cs.sort((a, b) => seq.indexOf(B2.rankOf(a)) - seq.indexOf(B2.rankOf(b)));
    }
    if (combo.type === 'fullhouse' || combo.type === 'four') {
      return cs.sort((a, b) => (B2.rankOf(b) === combo.key) - (B2.rankOf(a) === combo.key) || a - b);
    }
    return cs;
  }

  // ---------- 地圖 ----------
  const board = $('#board');
  const stage = $('#stage');
  const svg = $('#map');
  TWMAP.build(svg);
  let M = { s: 1, ox: 0, oy: 0 };
  const toPx = ([x, y]) => [M.ox + x * M.s, M.oy + y * M.s];

  function layout() {
    const b = board.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const s = Math.min(b.width / TWMAP.W, b.height / TWMAP.H);
    M = { s, ox: (b.width - TWMAP.W * s) / 2, oy: (b.height - TWMAP.H * s) / 2 };
    // 地圖縮得很小時，戲台保持看得清楚的大小（可以蓋到一點海岸線）
    const S = TWMAP.STAGE;
    const sw = Math.max(S.w * s, Math.min(220, b.width * 0.46));
    const sh = Math.max(S.h * s, sw * 0.9);
    const cx = M.ox + (S.x + S.w / 2) * s, cy = M.oy + (S.y + S.h / 2) * s;
    Object.assign(stage.style, { left: `${cx - sw / 2}px`, top: `${cy - sh / 2}px`, width: `${sw}px`, height: `${sh}px` });
    const cw = Math.max(24, Math.min(sw / 3.55, (sh * 0.45) / 1.4));
    stage.style.setProperty('--cw', `${cw}px`);
    board.style.setProperty('--th', `${Math.max(40, 80 * s)}px`);
    for (const t of Object.values(tokens)) placeToken(t);
    layoutHand();
  }

  // ---------- 角色棋子 ----------
  const tokens = {};
  const stationPoint = (who, pos) => {
    const [x, y] = TWMAP.stationXY(pos);
    return [x + OFF[who][0], y + OFF[who][1]];
  };
  function makeTokens() {
    const box = $('#tokens');
    box.innerHTML = '';
    SEATS.forEach((who, p) => {
      const el = document.createElement('div');
      el.className = `token ${who}`;
      el.style.setProperty('--c', CAST[who].color);
      el.innerHTML = `<span class="shadow"></span><span class="fig"><img src="${SPRITE[who].r}" alt="${CAST[who].name}"></span><span class="count">13</span><span class="say"></span>`;
      box.appendChild(el);
      const t = { who, p, el, img: el.querySelector('img'), pos: 0, xy: stationPoint(who, 0), dir: 'r', chain: Promise.resolve(), gen: 0 };
      tokens[who] = t;
      face(t, 'r', true);
      placeToken(t);
    });
  }
  function placeToken(t) {
    const [px, py] = toPx(t.xy);
    t.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    t.el.style.zIndex = String(Math.round(t.xy[1]));
  }
  function face(t, dir, force) {
    if (t.dir === dir && !force) return;
    t.dir = dir;
    const sp = SPRITE[t.who];
    if (!t.img.src.endsWith(sp[dir])) t.img.src = sp[dir];
    t.el.classList.toggle('flip', (dir === 'r' && !!sp.flipR) || (dir === 'l' && !!sp.flipL));
  }
  function resetToken(who) {
    const t = tokens[who];
    t.gen++;
    t.chain = Promise.resolve();
    t.pos = 0;
    t.xy = stationPoint(who, 0);
    t.el.classList.remove('walking', 'turn', 'done');
    face(t, 'r', true);
    placeToken(t);
    t.el.animate([{ opacity: 0, transform: t.el.style.transform + ' scale(.4)' }, { opacity: 1, transform: t.el.style.transform }], { duration: 380, easing: 'ease-out' });
  }
  function animatePath(t, pts, dur, gen) {
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now) => {
        if (gen !== t.gen) return resolve();
        const k = Math.max(0, Math.min(1, (now - start) / dur));
        const fi = k * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(fi));
        const u = fi - i, a = pts[i], b = pts[i + 1];
        t.xy = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        if (Math.abs(b[0] - a[0]) > 0.4) face(t, b[0] > a[0] ? 'r' : 'l');
        placeToken(t);
        if (k < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
  }
  /** 沿著環島路線走到第 target 站 */
  function walkTo(who, target) {
    const t = tokens[who];
    const gen = t.gen;
    t.chain = t.chain.then(async () => {
      if (t.pos >= target || gen !== t.gen) return;
      t.el.classList.add('walking');
      while (t.pos < target && gen === t.gen) {
        const [dx, dy] = OFF[who];
        const pts = TWMAP.segment(t.pos).map(([x, y]) => [x + dx, y + dy]);
        await animatePath(t, pts, 440 * speed(), gen);
        if (gen !== t.gen) return;
        t.pos++;
        arrive(t);
      }
      t.el.classList.remove('walking');
      if (who === 'allan' && t.pos < 13) announceStation(t.pos);
    });
    return t.chain;
  }
  function arrive(t) {
    Sfx.step();
    const i = t.pos % 13;
    const g = svg.querySelector(`.station[data-i="${i}"]`);
    if (!g) return;
    g.classList.remove('ping');
    requestAnimationFrame(() => g.classList.add('ping'));
    if (t.who === 'allan' && i) g.classList.add('visited');
  }
  function announceStation(pos) {
    const s = STATIONS[pos];
    ticker(`Allan 抵達${s.name}：${s.theme}`);
    if (G && !G.tipsSaid.has(pos)) {
      G.tipsSaid.add(pos);
      Sfx.stamp();
      talk([['arale', s.tip, 'explain']], null, true);
    }
  }
  function bubble(who, text, ms) {
    const t = tokens[who];
    if (!t) return;
    const b = t.el.querySelector('.say');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(t.bubbleTimer);
    t.bubbleTimer = setTimeout(() => b.classList.remove('show'), ms || 1600 + text.length * 90);
  }
  function setTokenCount(p) {
    const t = tokens[SEATS[p]];
    const n = G.st.hands[p].length;
    const c = t.el.querySelector('.count');
    c.textContent = n;
    c.classList.toggle('alert', n > 0 && n <= 2);
    t.el.classList.toggle('done', n === 0);
  }

  // ---------- 排行榜 ----------
  function buildStandings() {
    const ol = $('#standings');
    ol.innerHTML = '';
    SEATS.forEach((who, p) => {
      const li = document.createElement('li');
      li.className = `row ${who}`;
      li.dataset.p = p;
      li.style.setProperty('--c', CAST[who].color);
      li.innerHTML = `<span class="rk">${p + 1}</span><img class="av" src="${AVATAR[who]}" alt="">
        <div class="who"><div class="nm">${CAST[who].name}<span class="st"></span></div><small class="ti">${CAST[who].title}</small>
        <div class="bar" title="環島進度"><i></i></div></div>
        <div class="left"><b>13</b><small>張</small></div>`;
      ol.appendChild(li);
    });
  }
  function renderStandings() {
    if (!G) return;
    const ol = $('#standings');
    const counts = G.st.hands.map((h) => h.length);
    const rows = [...ol.children];
    const first = new Map(rows.map((li) => [li, li.getBoundingClientRect().top]));
    const order = [0, 1, 2, 3].sort((a, b) => counts[a] - counts[b] || a - b);
    order.forEach((p, i) => {
      const li = rows.find((x) => +x.dataset.p === p);
      li.querySelector('.rk').textContent = i + 1;
      li.querySelector('.left b').textContent = counts[p];
      li.querySelector('.bar i').style.width = `${((13 - counts[p]) / 13) * 100}%`;
      li.classList.toggle('alert', counts[p] > 0 && counts[p] <= 2);
      ol.appendChild(li);
    });
    for (const li of rows) {
      const dy = first.get(li) - li.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  }
  function setStatus(p, text, kind) {
    const li = $(`#standings .row[data-p="${p}"]`);
    if (!li) return;
    const st = li.querySelector('.st');
    st.textContent = text || '';
    st.className = 'st' + (kind ? ' ' + kind : '');
  }
  function setTurn(p) {
    document.querySelectorAll('#standings .row').forEach((li) => li.classList.toggle('turn', +li.dataset.p === p));
    for (const t of Object.values(tokens)) t.el.classList.toggle('turn', t.p === p);
    if (p >= 0 && p !== 0) setStatus(p, '思考中…', 'think');
    if (p === 0) setStatus(0, '輪到你', 'think');
  }

  // ---------- 廟口戲台 ----------
  function stageHead(p, verb) {
    const who = SEATS[p];
    $('#stageHead').innerHTML = `<img src="${AVATAR[who]}" alt=""><b style="color:${CAST[who].color}">${esc(CAST[who].name)}</b>${verb}`;
  }
  function showCombo(p, combo, fromRects) {
    stage.classList.remove('lead');
    stageHead(p, ' 出牌');
    const box = $('#stageCards');
    box.innerHTML = '';
    const els = displayOrder(combo).map((c) => { const el = cardEl(c); box.appendChild(el); return el; });
    const tokenRect = tokens[SEATS[p]].img.getBoundingClientRect();
    els.forEach((el, i) => {
      const to = el.getBoundingClientRect();
      const from = (fromRects && fromRects.get(+el.dataset.c)) || tokenRect;
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const sc = fromRects ? Math.max(0.5, from.width / to.width) : 0.35;
      el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(${(i - 2) * 12}deg)`, opacity: fromRects ? 1 : 0.2 },
        { transform: 'none', opacity: 1 },
      ], { duration: 460, delay: i * 45, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'backwards' });
    });
    $('#stageFoot').innerHTML = `${esc(glyph(B2.describe(combo)))}・<span class="alias">${esc(TYPES[combo.type].alias)}</span>`;
    if (TYPES[combo.type].bomb) {
      stage.classList.remove('bomb');
      requestAnimationFrame(() => stage.classList.add('bomb'));
    }
  }
  function clearStage(lead) {
    const old = [...$('#stageCards').children];
    old.forEach((el, i) => el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(i - 2) * 14}px, -40px) rotate(${(i - 2) * 10}deg)`, opacity: 0 }], { duration: 320, fill: 'forwards' }));
    setTimeout(() => {
      stage.classList.add('lead');
      stage.classList.remove('bomb');
      stageHead(lead, ' 取得主導權');
      $('#stageCards').innerHTML = '<div class="free">自由出牌</div>';
      $('#stageFoot').textContent = '任何牌型都可以出';
    }, 300);
  }
  function stageIntro(text, sub) {
    stage.classList.add('lead');
    stage.classList.remove('bomb');
    $('#stageHead').textContent = `第 ${G.round} 局`;
    $('#stageCards').innerHTML = `<div class="free">${esc(text)}</div>`;
    $('#stageFoot').textContent = sub;
  }

  // ---------- 快訊跑馬燈 ----------
  function ticker(text) {
    const el = $('#ticker');
    el.classList.remove('scroll', 'in');
    el.textContent = glyph(text);
    void el.offsetWidth;
    if (el.scrollWidth > el.parentElement.clientWidth - 12) {
      el.style.setProperty('--dur', `${Math.max(7, text.length * 0.3)}s`);
      el.classList.add('scroll');
    } else el.classList.add('in');
  }

  // ---------- 對話 ----------
  let talkGen = 0;
  let talkChain = Promise.resolve();
  let pending = 0;
  let lastLine = null;
  const faceTimers = {};

  function setFace(who, mood) {
    if (who !== 'allan' && who !== 'arale') return;
    const img = $(`#face-${who}`);
    const m = mood || DEFAULT_MOOD[who];
    img.src = `assets/img/${who}-${m}.webp`;
    clearTimeout(faceTimers[who]);
    faceTimers[who] = setTimeout(() => { img.src = `assets/img/${who}-${DEFAULT_MOOD[who]}.webp`; }, 6500);
  }
  function faceSrc(who, mood) {
    return (who === 'allan' || who === 'arale') ? `assets/img/${who}-${mood || DEFAULT_MOOD[who]}.webp` : AVATAR[who];
  }
  function showCaption(who, text, mood) {
    const cap = $('#caption');
    cap.style.setProperty('--c', CAST[who].color);
    cap.classList.toggle('npc', who === 'cat' || who === 'guru');
    $('#capWho').textContent = CAST[who].name;
    $('#capFace').src = faceSrc(who, mood);
    $('#capText').textContent = text;
    cap.classList.remove('pop');
    void cap.offsetWidth;
    cap.classList.add('pop');
    lastLine = [who, text];
  }
  function chatMsg(who, text, mood) {
    const log = $('#chat');
    const li = document.createElement('li');
    li.className = `msg ${who}`;
    li.style.setProperty('--c', CAST[who].color);
    li.innerHTML = `<img src="${faceSrc(who, mood)}" alt=""><div><b>${esc(CAST[who].name)}</b><p></p></div>`;
    li.querySelector('p').textContent = text;
    li.addEventListener('click', () => { Sfx.unlock(); Voice.speak(who, text, { interrupt: true, force: true }); });
    li.title = '點一下再聽一次';
    log.appendChild(li);
    trimLog();
  }
  function sysMsg(text, kind) {
    const log = $('#chat');
    const li = document.createElement('li');
    li.className = 'sys' + (kind ? ' ' + kind : '');
    li.textContent = glyph(text);
    log.appendChild(li);
    trimLog();
  }
  function trimLog() {
    const log = $('#chat');
    while (log.children.length > 180) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  async function line(who, text, mood, gen) {
    if (gen !== talkGen) return;
    showCaption(who, text, mood);
    chatMsg(who, text, mood);
    setFace(who, mood);
    if (who === 'cat' || who === 'guru') bubble(who, text);
    const anchor = $(`#anchor-${who}`);
    if (anchor) anchor.classList.add('talking');
    const vs = Voice.settings;
    const voiced = Voice.supported && vs.enabled && (who === 'allan' || who === 'arale' || vs.npc);
    if (voiced) await Promise.race([Voice.speak(who, text), rawSleep(3500 + text.length * 320)]);
    else await rawSleep((900 + text.length * 75) * Math.max(0.6, speed()));
    if (anchor) anchor.classList.remove('talking');
  }
  /** 排進對話佇列；optional 的閒聊在對話落後時直接略過 */
  function talk(script, ctx, optional) {
    if (!script) return Promise.resolve();
    if (optional && pending >= 2) return Promise.resolve();
    const gen = talkGen;
    pending++;
    talkChain = talkChain.then(async () => {
      for (const [who, text, mood] of script) await line(who, fill(text, ctx), mood, gen);
    }).catch(() => {}).then(() => { pending = Math.max(0, pending - 1); });
    return talkChain;
  }
  function resetTalk() {
    talkGen++;
    pending = 0;
    talkChain = Promise.resolve();
    Voice.stop();
    document.querySelectorAll('.anchor.talking').forEach((a) => a.classList.remove('talking'));
  }
  const talkCapped = (script, ctx, ms) => Promise.race([talk(script, ctx), rawSleep(ms)]);

  // ---------- 手牌 ----------
  let selected = new Set();
  let hinted = new Set();
  let quickIdx = {};

  function sortHand(h) {
    return prefs.sort === 'suit'
      ? h.slice().sort((a, b) => B2.suitOf(a) - B2.suitOf(b) || a - b)
      : h.slice().sort((a, b) => a - b);
  }
  function renderHand(deal) {
    const box = $('#hand');
    box.innerHTML = '';
    if (!G) return;
    sortHand(G.st.hands[0]).forEach((c, i) => {
      const el = cardEl(c, 'button');
      el.classList.toggle('sel', selected.has(c));
      el.classList.toggle('hinted', hinted.has(c));
      el.addEventListener('click', () => toggleCard(c));
      if (deal) el.style.animationDelay = `${i * 55}ms`;
      if (deal) el.classList.add('deal');
      box.appendChild(el);
    });
    layoutHand();
    updateSelInfo();
    updateQuick();
  }
  function layoutHand() {
    const box = $('#hand');
    const n = box.children.length;
    if (!n) return;
    const W = box.clientWidth;
    const cw = Math.round(Math.min(92, Math.max(46, W / 8.6), window.innerHeight * 0.105));
    const step = Math.min(cw + 6, (W - cw - 4) / Math.max(1, n - 1));
    box.style.setProperty('--hcw', `${cw}px`);
    box.style.setProperty('--gap', `${Math.min(6, step - cw)}px`);
  }
  function refreshSelection() {
    document.querySelectorAll('#hand .card').forEach((el) => {
      const c = +el.dataset.c;
      el.classList.toggle('sel', selected.has(c));
      el.classList.toggle('hinted', hinted.has(c));
    });
    updateSelInfo();
  }
  function toggleCard(c) {
    if (!G || G.st.winner >= 0) return;
    Sfx.unlock();
    Sfx.tick();
    if (selected.has(c)) selected.delete(c); else selected.add(c);
    hinted.clear();
    refreshSelection();
  }
  function setInfo(text, cls) {
    const el = $('#selInfo');
    el.textContent = glyph(text);
    el.className = 'sel-info' + (cls ? ' ' + cls : '');
  }
  function updateSelInfo() {
    const st = G && G.st;
    const myTurn = !!(st && human && st.turn === 0 && st.winner < 0);
    $('#btnPass').disabled = !myTurn || !st.current;
    $('#btnHint').disabled = !myTurn;
    $('#btnPlay').disabled = true;
    if (!st || !run.alive) return setInfo(G ? '按「新局」重新開始' : '等待開局');
    if (st.winner >= 0) return setInfo(`${nameOf(st.winner)} 完成環島！`);
    const cards = [...selected];
    if (!myTurn) {
      if (st.turn !== 0) return setInfo(`等待 ${nameOf(st.turn)} 出牌…`);
      return setInfo('……');
    }
    if (!cards.length) {
      if (st.first) return setInfo('你先出：第一手要包含梅花 3');
      if (!st.current) return setInfo('你有主導權：任何牌型都可以出');
      return setInfo(`輪到你：壓過 ${B2.describe(st.current.combo)}，或按「過」`);
    }
    const r = B2.check(st, 0, cards);
    if (r.ok) {
      $('#btnPlay').disabled = false;
      return setInfo(`✓ ${B2.describe(r.combo)}・${TYPES[r.combo.type].alias}`, 'ok');
    }
    return setInfo(`✗ ${r.reason}`, 'bad');
  }
  function updateQuick() {
    const box = $('#quick');
    if (!G) { box.innerHTML = ''; return; }
    const st = G.st;
    const myTurn = st.turn === 0 && st.winner < 0;
    const moves = myTurn ? B2.legalMoves(st, 0) : B2.allCombos(st.hands[0]);
    box.innerHTML = '';
    for (const type of QUICK) {
      const n = moves.filter((c) => c.type === type).length;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (TYPES[type].bomb ? ' bomb' : '');
      b.disabled = !n;
      b.innerHTML = `${TYPES[type].name}<i>${n}</i>`;
      b.title = `${TYPES[type].name}（${TYPES[type].alias}）：${n ? '點一下依序選取' : '沒有'}${myTurn ? '能壓的組合' : ''}`;
      b.addEventListener('click', () => quickPick(type));
      box.appendChild(b);
    }
  }
  function quickPick(type) {
    const st = G.st;
    const myTurn = st.turn === 0 && st.winner < 0;
    const order = (a, b) => (TYPES[a.type].tier || 0) - (TYPES[b.type].tier || 0) || a.key - b.key;
    const list = (myTurn ? B2.legalMoves(st, 0) : B2.allCombos(st.hands[0])).filter((c) => c.type === type).sort(order);
    if (!list.length) return;
    quickIdx[type] = ((quickIdx[type] == null ? -1 : quickIdx[type]) + 1) % list.length;
    selected = new Set(list[quickIdx[type]].cards);
    hinted.clear();
    Sfx.tick();
    refreshSelection();
  }

  // ---------- Allan 的回合 ----------
  let lastComplain = 0;
  function complain(code, reason) {
    Sfx.nope();
    const hand = $('#hand');
    hand.classList.remove('nope');
    void hand.offsetWidth;
    hand.classList.add('nope');
    if (reason) setInfo(`✗ ${reason}`, 'bad');
    if (Date.now() - lastComplain > 3500) {
      lastComplain = Date.now();
      talk(L.invalid[code] ? pickOne(L.invalid[code]) : null, null, true);
    }
  }
  async function humanTurn(r) {
    const st = G.st;
    const legal = B2.legalMoves(st, 0);
    human = () => {};
    updateSelInfo();
    updateQuick();
    if (!legal.length && st.current && prefs.autoPass) {
      setInfo('沒有壓得過的牌，自動過…', 'bad');
      await wait(1100, r);
      human = null;
      return { pass: true, auto: true };
    }
    if (!G.toldFirstTurn) {
      G.toldFirstTurn = true;
      talk(pickOne(L.allanFirstTurn), null, true);
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => talk(pickOne(L.idle), null, true), 30000);
    const d = await new Promise((res) => { human = res; updateSelInfo(); });
    human = null;
    clearTimeout(idleTimer);
    if (d.abort || !r.alive) throw ABORT;
    return d;
  }
  $('#btnPlay').addEventListener('click', () => {
    if (!human || !G) return;
    const cards = [...selected];
    const res = B2.check(G.st, 0, cards);
    if (!res.ok) return complain(res.code || (cards.length ? 'shape' : 'empty'), cards.length ? res.reason : '請先選牌');
    human({ cards });
  });
  $('#btnPass').addEventListener('click', () => {
    if (!human || !G) return;
    if (!G.st.current) return complain('lead', '你有主導權，這輪不能過');
    human({ pass: true });
  });
  $('#btnHint').addEventListener('click', () => {
    if (!human || !G) return;
    Sfx.unlock();
    const d = AI.hint(G.st, 0);
    selected = new Set(d.pass ? [] : d.cards);
    hinted = new Set(selected);
    refreshSelection();
    G.stats.hints++;
    const advice = d.pass ? HINT_ADVICE.pass : HINT_ADVICE[d.combo.type];
    const [who, tpl, mood] = L.hint;
    resetTalk();
    talk([[who, fill(tpl, { advice, why: d.why }), mood]]);
  });
  $('#btnSort').addEventListener('click', () => {
    prefs.sort = prefs.sort === 'suit' ? 'rank' : 'suit';
    savePrefs();
    syncSortBtn();
    renderHand();
  });
  const syncSortBtn = () => { $('#btnSort').textContent = prefs.sort === 'suit' ? '理牌：花色' : '理牌：點數'; };

  // ---------- 出牌與過牌 ----------
  async function doPlay(p, cards, r) {
    const st = G.st;
    const who = SEATS[p];
    let fromRects = null;
    if (p === 0) {
      fromRects = new Map();
      document.querySelectorAll('#hand .card').forEach((el) => { if (cards.includes(+el.dataset.c)) fromRects.set(+el.dataset.c, el.getBoundingClientRect()); });
    }
    const combo = B2.play(st, p, cards);
    if (p === 0) { selected.clear(); hinted.clear(); quickIdx = {}; renderHand(); }
    showCombo(p, combo, fromRects);
    Sfx.card(combo.size);
    walkTo(who, 13 - st.hands[p].length);
    setTokenCount(p);
    renderStandings();
    setStatus(p, TYPES[combo.type].name, 'play');
    const desc = `${B2.describe(combo)}（${TYPES[combo.type].alias}）`;
    ticker(`${CAST[who].name} 出 ${desc}`);
    sysMsg(`${CAST[who].name} 出 ${desc}`, 'play');

    const bomb = !!TYPES[combo.type].bomb;
    const isTwo = combo.size <= 2 && combo.cards.every((c) => B2.rankOf(c) === 12);
    if (p === 0) {
      G.stats.cards += combo.size;
      if (bomb) G.stats.bombs++;
      if (isTwo) G.stats.twos++;
    }
    const ctx = { who: CAST[who].name, type: TYPES[combo.type].name, alias: TYPES[combo.type].alias };
    if (bomb) {
      alarm(`偵測到${TYPES[combo.type].alias}！`, `${CAST[who].name} 出了${TYPES[combo.type].name}`);
      talk(pickOne(p === 0 ? L.bombAllan : L.bomb), ctx);
    } else if (p === 0) {
      if (chance(isTwo ? 0.9 : 0.5)) talk(pickOne(L.allanPlay[isTwo ? 'two' : combo.type]), ctx, true);
    } else if (who === 'arale') {
      if (chance(isTwo ? 0.7 : 0.35)) talk(pickOne(L.aralePlay[isTwo ? 'two' : combo.type]), ctx, true);
    } else if (isTwo && chance(0.5)) {
      talk(pickOne(L.two), ctx, true);
    } else if (chance(0.38)) {
      talk(pickOne(L.npcPlay[who]), ctx, true);
      if (chance(0.55)) talk(pickOne(L.reply[who]), ctx, true);
    }
    if (st.hands[p].length === 1) {
      talk(pickOne(p === 0 ? L.lastCard.allan : L.lastCard.other), ctx);
      if (p !== 0) bubble(who, '剩最後一張！', 2600);
    }
    await wait(bomb ? 1500 : 650, r);
  }

  async function doPass(p, auto, r) {
    const res = B2.pass(G.st, p);
    const who = SEATS[p];
    setStatus(p, '過', 'pass');
    bubble(who, auto ? '過（沒牌可壓）' : '過！', 1400);
    Sfx.pass();
    if (p === 0) {
      G.stats.passes++;
      selected.clear(); hinted.clear();
      refreshSelection();
      if (!auto && chance(0.35)) talk(pickOne(L.pass.allan), null, true);
    } else if (chance(0.16)) {
      talk(pickOne(L.pass[who]), null, true);
    }
    if (res.cleared) {
      await wait(420, r);
      clearStage(res.lead);
      Sfx.chime();
      $('#trickNo').textContent = G.st.trick;
      ticker(`${nameOf(res.lead)} 取得主導權，自由出牌`);
      sysMsg(`— 第 ${G.st.trick} 輪：${nameOf(res.lead)} 取得主導權 —`, 'trick');
      [0, 1, 2, 3].forEach((q) => setStatus(q, ''));
      if (chance(0.3)) talk(pickOne(L.lead[SEATS[res.lead]]), null, true);
    }
    await wait(380, r);
  }

  function alarm(title, text) {
    const el = $('#alarm');
    $('#alarmTitle').textContent = title;
    $('#alarmText').textContent = text;
    el.hidden = false;
    board.classList.remove('shake');
    void board.offsetWidth;
    board.classList.add('shake');
    Sfx.siren();
    clearTimeout(alarm.t);
    alarm.t = setTimeout(() => { el.hidden = true; board.classList.remove('shake'); }, 1700);
  }

  function confetti(who) {
    const t = tokens[who];
    const [x, y] = toPx(t.xy);
    const colors = ['#ff8a1f', '#0fa3b9', '#ffd23f', '#e03131', '#7b3fb8', '#2f9e5a'];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('i');
      s.className = 'confetti';
      s.style.background = colors[i % colors.length];
      s.style.left = `${x}px`;
      s.style.top = `${y - 40}px`;
      board.appendChild(s);
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 110;
      s.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 40}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${Math.cos(a) * d * 1.1}px, ${Math.sin(a) * d + 30}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
      ], { duration: 1300 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => s.remove();
    }
  }

  // ---------- 一局 ----------
  async function playRound(r) {
    const st = B2.newRound(Math.random);
    G.st = st;
    G.toldFirstTurn = G.round > 1;
    selected.clear(); hinted.clear(); quickIdx = {};
    $('#roundNo').textContent = G.round;
    $('#trickNo').textContent = 1;
    svg.querySelectorAll('.station.visited').forEach((g) => g.classList.remove('visited'));
    SEATS.forEach((who, p) => { resetToken(who); setTokenCount(p); setStatus(p, ''); });
    renderStandings();
    stageIntro('梅花 3 先出', `${nameOf(st.starter)} 拿到梅花 3`);
    renderHand(true);
    Sfx.deal();
    ticker(`第 ${G.round} 局開始！${nameOf(st.starter)} 拿到梅花 3，率先出牌`);
    sysMsg(`— 第 ${G.round} 局開始 —`, 'round');

    if (G.round === 1) await talkCapped(pickOne(L.intro), null, 40000);
    await talkCapped(pickOne(L.roundStart), { n: G.round }, 12000);
    await talkCapped(pickOne(L.starter[SEATS[st.starter]]), null, 12000);
    if (!r.alive) throw ABORT;

    while (st.winner < 0) {
      const p = st.turn;
      setTurn(p);
      updateSelInfo();
      updateQuick();
      let d;
      if (p === 0) {
        d = await humanTurn(r);
      } else {
        await wait(700 + Math.random() * 600, r);
        d = AI.choose(st, p, PERSONA[SEATS[p]]);
      }
      if (d.pass) await doPass(p, d.auto, r);
      else await doPlay(p, d.cards, r);
    }
    setTurn(-1);
    updateSelInfo();
    updateQuick();
    await finishRound(r);
  }

  async function finishRound(r) {
    const st = G.st;
    const w = st.winner;
    const who = SEATS[w];
    const delta = B2.score(st.hands, w);
    delta.forEach((d, i) => { G.totals[i] += d; });
    G.history.push({ winner: w, delta, left: st.hands.map((h) => h.slice()) });
    if (w === 0) G.stats.wins++;
    setStatus(w, '完成環島！', 'play');
    ticker(`${CAST[who].name} 回到台北 101，完成環島！`);
    sysMsg(`★ ${CAST[who].name} 第一個回到台北 101！`, 'round');
    await Promise.race([tokens[who].chain, rawSleep(5000)]);
    if (!r.alive) throw ABORT;
    confetti(who);
    Sfx.fanfare();
    bubble(who, '環島完成！', 2600);
    await talkCapped(pickOne(L.roundEnd[who]), null, 20000);
    if (w !== 0 && st.hands[0].length >= 8) await talkCapped(pickOne(L.allanStuck), null, 12000);
    if (!r.alive) throw ABORT;
    await showReport(r);
  }

  function miniCards(cards) {
    const box = document.createElement('div');
    box.className = 'mini-cards';
    sortHand(cards).forEach((c) => box.appendChild(cardEl(c)));
    return box;
  }
  function showReport(r) {
    return new Promise((resolve) => {
      const h = G.history[G.history.length - 1];
      $('#reportTitle').textContent = `第 ${G.round} 局稽核報告`;
      $('#reportSub').textContent = `${nameOf(h.winner)} 第一個回到台北 101！其他人手上剩下的牌，就是「未修補的漏洞」。`;
      const tb = $('#reportRows');
      tb.innerHTML = '';
      [0, 1, 2, 3].sort((a, b) => h.delta[b] - h.delta[a]).forEach((p) => {
        const who = SEATS[p];
        const n = h.left[p].length;
        const tr = document.createElement('tr');
        tr.className = p === h.winner ? 'win' : '';
        tr.innerHTML = `<td class="who"><img src="${AVATAR[who]}" alt=""><b style="color:${CAST[who].color}">${esc(CAST[who].name)}</b></td><td class="left"></td>
          <td>${p === h.winner ? '—' : '×' + B2.multiplier(n)}</td>
          <td class="${h.delta[p] >= 0 ? 'plus' : 'minus'}">${h.delta[p] > 0 ? '+' : ''}${h.delta[p]}</td><td><b>${G.totals[p]}</b></td>`;
        const cell = tr.querySelector('.left');
        if (p === h.winner) cell.innerHTML = '<span class="badge">完成環島</span>';
        else { cell.appendChild(miniCards(h.left[p])); cell.insertAdjacentHTML('beforeend', `<small>${n} 張</small>`); }
        tb.appendChild(tr);
      });
      $('#btnNext').textContent = G.round < G.rounds ? '下一局' : '看總成績';
      $('#btnNext').onclick = () => { $('#reportModal').hidden = true; resolve(); };
      $('#reportModal').hidden = false;
      $('#btnNext').focus();
    }).then(() => { if (!r.alive) throw ABORT; });
  }

  // ---------- 總成績 ----------
  function showFinal() {
    const order = [0, 1, 2, 3].sort((a, b) => G.totals[b] - G.totals[a] || a - b);
    const champ = order[0];
    const allanTop = G.totals[0] === G.totals[champ];
    const cert = $('#cert');
    cert.classList.toggle('car', !allanTop);
    const s = G.stats;
    const statLine = `出牌 ${s.cards} 張・過牌 ${s.passes} 次・怪物牌 ${s.bombs} 次・出老二 ${s.twos} 次・問阿拉蕾 ${s.hints} 次`;
    if (allanTop) {
      $('#certRibbon').textContent = 'CERTIFICATE OF FORMOSA CYBER TOUR';
      $('#finalTitle').textContent = '資安環島認證證書';
      $('#certBody').innerHTML = `茲證明 <b>Allan</b> 於「Allan's 資安大老二・環島攻防戰」${G.rounds} 局中，以總分 <b>${G.totals[0]}</b> 分榮獲第一名，
        沿途完成海纜韌性、營運持續、SOC 監控、供應鏈安全等環島檢核，特頒此證。<br><small>${statLine}</small>`;
      $('#certSeal').innerHTML = '台灣<br>尚勇';
    } else {
      const rank = order.indexOf(0) + 1;
      const why = s.hints < 2 ? '太少「問阿拉蕾」，風險評鑑做得不夠。' : s.twos === 0 ? '大牌留太久，最後沒機會出。' : '小牌沒有早點消化，回不到台北 101。';
      $('#certRibbon').textContent = 'CORRECTIVE ACTION REQUEST';
      $('#finalTitle').textContent = '矯正措施要求單';
      $('#certBody').innerHTML = `不符合事項：Allan 總分 <b>${G.totals[0]}</b> 分，名列第 ${rank}，本次環島冠軍是 <b>${esc(nameOf(champ))}</b>。<br>
        根本原因：${why}<br>矯正措施：再環島一次，PDCA 持續改善！<br><small>${statLine}</small>`;
      $('#certSeal').innerHTML = '持續<br>改善';
    }
    $('#certRank').innerHTML = order.map((p, i) => `<li style="--c:${CAST[SEATS[p]].color}"><span>${i + 1}</span><img src="${AVATAR[SEATS[p]]}" alt=""><b>${esc(nameOf(p))}</b><em>${G.totals[p]} 分</em></li>`).join('');
    $('#finalModal').hidden = false;
    $('#btnAgain').focus();
    const ctx = { who: nameOf(champ) };
    if (allanTop) { Sfx.fanfare(); talk(pickOne(L.gameOver.allan)); }
    else talk(pickOne(champ === 2 ? L.gameOver.arale : L.gameOver.villain), ctx);
  }

  // ---------- 新局 ----------
  async function newGame() {
    run.alive = false;
    if (human) human({ abort: true });
    const r = { alive: true };
    run = r;
    resetTalk();
    ['#reportModal', '#finalModal'].forEach((m) => { $(m).hidden = true; });
    $('#chat').innerHTML = '';
    G = {
      st: null, round: 0, rounds: prefs.rounds, totals: [0, 0, 0, 0], history: [], tipsSaid: new Set(),
      stats: { cards: 0, passes: 0, bombs: 0, twos: 0, hints: 0, wins: 0 },
    };
    $('#roundMax').textContent = G.rounds;
    try {
      for (G.round = 1; G.round <= G.rounds; G.round++) await playRound(r);
      if (r.alive) showFinal();
    } catch (e) {
      if (e !== ABORT) { console.error(e); setInfo('出了點狀況，請按「新局」重新開始', 'bad'); }
    }
  }

  // ---------- 開場、設定 ----------
  function syncIntro() {
    document.querySelectorAll('input[name=rounds]').forEach((i) => { i.checked = +i.value === prefs.rounds; });
    document.querySelectorAll('input[name=speed]').forEach((i) => { i.checked = i.value === prefs.speed; });
    $('#introVoice').checked = Voice.settings.enabled && Voice.supported;
    $('#introVoice').disabled = !Voice.supported;
    $('#introAuto').checked = prefs.autoPass;
  }
  $('#btnStart').addEventListener('click', () => {
    prefs.rounds = +(document.querySelector('input[name=rounds]:checked') || { value: 3 }).value;
    prefs.speed = (document.querySelector('input[name=speed]:checked') || { value: 'mid' }).value;
    prefs.autoPass = $('#introAuto').checked;
    savePrefs();
    Voice.set({ enabled: $('#introVoice').checked && Voice.supported });
    syncVoiceBtn();
    Sfx.unlock();
    Voice.unlock();
    $('#intro').hidden = true;
    newGame();
  });
  $('#btnNew').addEventListener('click', () => { syncIntro(); $('#intro').hidden = false; $('#btnStart').focus(); });
  $('#btnAgain').addEventListener('click', () => { $('#finalModal').hidden = true; newGame(); });
  $('#btnFinalClose').addEventListener('click', () => { $('#finalModal').hidden = true; setInfo('按「新局」再環島一次'); });
  $('#btnSkip').addEventListener('click', () => resetTalk());
  $('#capReplay').addEventListener('click', () => { if (lastLine) { Sfx.unlock(); Voice.speak(lastLine[0], lastLine[1], { interrupt: true, force: true }); } });
  $('#logToggle').addEventListener('click', () => {
    const open = $('#studio').classList.toggle('open');
    $('#logToggle').setAttribute('aria-expanded', String(open));
    $('#logToggle').textContent = open ? '收起紀錄 ▴' : '對話紀錄 ▾';
    trimLog();
  });

  function syncVoiceBtn() {
    const on = Voice.settings.enabled && Voice.supported;
    $('#btnVoice').textContent = on ? '語音 開' : '語音 關';
    $('#btnVoice').setAttribute('aria-pressed', String(on));
  }
  $('#btnVoice').addEventListener('click', () => {
    if (!Voice.supported) return;
    Voice.set({ enabled: !Voice.settings.enabled });
    if (Voice.settings.enabled) { Voice.unlock(); const [w, t] = L.voiceOn[0]; Voice.speak(w, t); }
    syncVoiceBtn();
  });

  function fillVoiceSelects() {
    const list = Voice.list();
    for (const who of ['allan', 'arale']) {
      const sel = $(`#voice-${who}`);
      const auto = Voice.pickVoice(who);
      const first = Voice.hasRecorded ? `課程配音：${Voice.COURSE_VOICE[who]}（建議）` : `自動（${auto ? auto.name : '系統預設'}）`;
      sel.innerHTML = `<option value="">${esc(first)}</option>` +
        list.map((v) => `<option value="${esc(v.name)}">瀏覽器：${esc(v.name)}（${esc(v.lang)}）</option>`).join('');
      sel.value = Voice.settings.voices[who] || '';
      const recorded = Voice.mode(who) === 'recorded';
      const t = Voice.tuneFor(who);
      const pitch = $(`#pitch-${who}`);
      pitch.disabled = recorded;
      pitch.value = recorded ? 1 : t.pitch;
      $(`#pitchOut-${who}`).textContent = recorded ? '課程原音' : Number(t.pitch).toFixed(2);
      $(`#rate-${who}`).value = t.rate;
      $(`#rateOut-${who}`).textContent = Number(t.rate).toFixed(2) + (recorded ? ' 倍' : '');
    }
    const tw = list.filter((v) => /TW|Hant|Taiwan|臺灣|台灣/i.test(v.lang + v.name));
    $('#voiceSupport').textContent = Voice.hasRecorded
      ? '預設使用課程配音：Allan 是台灣男聲 YunJhe、阿拉蕾是調高音調的台灣女聲 HsiaoYu，任何瀏覽器聽起來都一樣。也可以改選瀏覽器內建聲線。'
      : !Voice.supported ? '這個瀏覽器不支援語音合成，對話會以文字顯示。'
        : tw.length ? `找到 ${tw.length} 個台灣華語聲線。` : '沒有找到台灣華語聲線，會借用其他中文聲線並調整音高。';
  }
  Voice.onChange(() => { if (!$('#settingsModal').hidden) fillVoiceSelects(); });
  for (const who of ['allan', 'arale']) {
    $(`#voice-${who}`).addEventListener('change', (e) => { Voice.setVoice(who, e.target.value); fillVoiceSelects(); });
    $(`#pitch-${who}`).addEventListener('input', (e) => { Voice.setTune(who, { pitch: +e.target.value }); $(`#pitchOut-${who}`).textContent = (+e.target.value).toFixed(2); });
    $(`#rate-${who}`).addEventListener('input', (e) => {
      const recorded = Voice.mode(who) === 'recorded';
      Voice.setTune(who, recorded ? { speed: +e.target.value } : { rate: +e.target.value });
      $(`#rateOut-${who}`).textContent = (+e.target.value).toFixed(2) + (recorded ? ' 倍' : '');
    });
  }
  document.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => {
    const [w, text] = L.voiceTest[b.dataset.test][0];
    Voice.unlock();
    Voice.speak(w, text, { interrupt: true, force: true });
  }));
  $('#btnSettings').addEventListener('click', () => {
    fillVoiceSelects();
    $('#optNpcVoice').checked = Voice.settings.npc;
    $('#optSfx').checked = prefs.sfx;
    $('#optAuto').checked = prefs.autoPass;
    $('#optSpeed').value = prefs.speed;
    $('#settingsModal').hidden = false;
    $('#btnSettingsClose').focus();
  });
  $('#optNpcVoice').addEventListener('change', (e) => Voice.set({ npc: e.target.checked }));
  $('#optSfx').addEventListener('change', (e) => { prefs.sfx = e.target.checked; savePrefs(); });
  $('#optAuto').addEventListener('change', (e) => { prefs.autoPass = e.target.checked; savePrefs(); });
  $('#optSpeed').addEventListener('change', (e) => { prefs.speed = e.target.value; savePrefs(); });
  $('#btnSettingsClose').addEventListener('click', () => { $('#settingsModal').hidden = true; });

  document.addEventListener('keydown', (e) => {
    if (!$('#settingsModal').hidden) { if (e.key === 'Escape') $('#settingsModal').hidden = true; return; }
    if (document.querySelector('.modal:not([hidden])')) return;
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Enter' && (e.target === document.body || e.target.closest('#hand'))) { e.preventDefault(); $('#btnPlay').click(); }
    else if (k === 'p') $('#btnPass').click();
    else if (k === 'h') $('#btnHint').click();
    else if (k === 's') $('#btnSort').click();
    else if (e.key === 'Escape') { selected.clear(); hinted.clear(); refreshSelection(); }
  });

  // ---------- 初始畫面：開場背後先擺好地圖和一手牌 ----------
  makeTokens();
  buildStandings();
  new ResizeObserver(layout).observe(board);
  window.addEventListener('resize', layoutHand);
  layout();
  G = { st: B2.newRound(Math.random), round: 1, rounds: prefs.rounds, totals: [0, 0, 0, 0], history: [], tipsSaid: new Set(), stats: {} };
  $('#roundMax').textContent = prefs.rounds;
  renderHand();
  renderStandings();
  setInfo('按「出發環島！」開始');
  syncIntro();
  syncVoiceBtn();
  syncSortBtn();
  ticker('歡迎收看 Allan\'s 資安大老二！每出一張牌就往前走一站，先回到台北 101 的人拿到資安認證');

  // 測試用掛勾
  window.__b2 = { get G() { return G; }, prefs, newGame, get human() { return human; } };
})();
