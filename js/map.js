/* Allan's 資安大老二 — 台灣環島地圖（SVG）
 * 刻意把台灣畫得胖一點（番薯島），中間留給「廟口戲台」出牌區。
 * 座標：viewBox 0 0 640 800；經緯度用 proj() 換算。
 */
(function (root) {
  'use strict';

  const W = 640, H = 800;
  const KX = 250, KY = 200, LON0 = 120.07, LAT0 = 25.30, OX = 79, OY = 50;
  const proj = ([lon, lat]) => [(lon - LON0) * KX + OX, (LAT0 - lat) * KY + OY];

  // 海岸線（順時針，從富貴角出發）
  const COAST = [
    [121.537, 25.299], [121.64, 25.235], [121.69, 25.205], [121.76, 25.155], [121.85, 25.14], [121.925, 25.125],
    [122.0, 25.01], [121.86, 24.87], [121.83, 24.72], [121.87, 24.595], [121.81, 24.45], [121.75, 24.28],
    [121.68, 24.17], [121.625, 23.98], [121.55, 23.75], [121.52, 23.55], [121.45, 23.32], [121.38, 23.1],
    [121.24, 22.88], [121.16, 22.75], [121.01, 22.6], [120.9, 22.34], [120.88, 22.18], [120.86, 22.0],
    [120.853, 21.9], [120.8, 21.94], [120.74, 21.92], [120.7, 22.07], [120.69, 22.2], [120.59, 22.37],
    [120.44, 22.46], [120.33, 22.56], [120.27, 22.62], [120.24, 22.76], [120.17, 22.9], [120.14, 23.0],
    [120.07, 23.15], [120.11, 23.27], [120.15, 23.38], [120.13, 23.47], [120.18, 23.7], [120.2, 23.8],
    [120.32, 23.93], [120.4, 24.06], [120.5, 24.27], [120.58, 24.38], [120.67, 24.49], [120.76, 24.62],
    [120.92, 24.85], [121.0, 24.92], [121.1, 25.04], [121.2, 25.09], [121.33, 25.13], [121.41, 25.18],
  ].map(proj);

  /** 中間的廟口戲台（出牌區） */
  const STAGE = { x: 212, y: 286, w: 236, h: 222 };

  const STATIONS = root.STATIONS;
  const PTS = STATIONS.map((s) => proj(s.ll));
  const N = PTS.length;

  // ---------- 曲線 ----------
  /** Catmull-Rom → 三次貝茲的控制點 */
  function controls(pts, i) {
    const n = pts.length;
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    return [p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2];
  }
  const f = (n) => Math.round(n * 10) / 10;
  function closedPath(pts) {
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < pts.length; i++) {
      const [, c1, c2, p2] = controls(pts, i);
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + 'Z';
  }
  function bezier([p0, c1, c2, p1], t) {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p1[k]);
  }
  /** 從第 i 站走到下一站的路徑取樣點 */
  function segment(i, samples = 14) {
    const c = controls(PTS, i % N);
    return Array.from({ length: samples + 1 }, (_, k) => bezier(c, k / samples));
  }
  /** 第 pos 站的位置（pos = 已出牌數 0..13，13 = 回到台北 101） */
  const stationXY = (pos) => PTS[pos % N];

  // ---------- 地標圖示（約 30×30，置中在 0,0） ----------
  const O = 'stroke="#23324a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
  const ICON = {
    tower: `<g ${O}><path d="M0 -27V-20" fill="none"/>${[-20, -14, -8, -2, 4].map((y) => `<path d="M-6 ${y}H6L4 ${y + 6}H-4Z" fill="#8fd9cf"/>`).join('')}<path d="M-8 10H8L10 20H-10Z" fill="#5fb3a9"/></g>`,
    anchor: `<g ${O} fill="none" stroke-width="2.6"><circle cx="0" cy="-11" r="3.5"/><path d="M0 -7.5V12M-7 -2H7M-11 4C-10 12 -4 14 0 14C4 14 10 12 11 4"/><path d="M-13 6L-11 1L-8 5M13 6L11 1L8 5" stroke-width="2"/></g>`,
    tunnel: `<g ${O}><path d="M-15 12L-6 -9L0 -3L6 -12L15 12Z" fill="#79c472"/><path d="M-7 12V5A7 7 0 0 1 7 5V12Z" fill="#23324a"/><path d="M0 12V8" stroke="#ffd23f"/></g>`,
    quake: `<g ${O}><path d="M-15 12L-11 -6L-3 -13L3 -5L10 -11L15 12Z" fill="#a9b3c4"/><path d="M-1 -11L3 -4L-2 2L2 7L0 12" fill="none" stroke="#ff4d4d" stroke-width="2.6"/></g>`,
    balloon: `<g ${O}><path d="M0 -16C11 -16 14 -6 9 1L3 7H-3L-9 1C-14 -6 -11 -16 0 -16Z" fill="#ff8c42"/><path d="M0 -16C5 -10 5 0 2 7M0 -16C-5 -10 -5 0 -2 7" fill="none" stroke-width="1.5"/><path d="M-3 7V10M3 7V10" fill="none"/><rect x="-4.5" y="10" width="9" height="6" rx="1" fill="#b07a45"/></g>`,
    lighthouse: `<g ${O}><path d="M4 -10L16 -15V-5ZM-4 -10L-16 -15V-5Z" fill="#ffe66d" stroke="none" opacity=".9"/><path d="M-5 15L-3 -6H3L5 15Z" fill="#fff"/><path d="M-4.4 7H4.4M-3.7 0H3.7" stroke="#e63946" stroke-width="3"/><rect x="-4" y="-12" width="8" height="6" fill="#ffd23f"/><path d="M-5.5 -12L0 -17L5.5 -12Z" fill="#e63946"/></g>`,
    crane: `<g ${O} fill="none"><path d="M-10 14V-7M-3 14V-7M-13 -7H15M-10 3L-3 -7M-10 -7L-3 3" stroke="#ff8c1a" stroke-width="3"/><path d="M10 -7V3" stroke-width="1.5"/><rect x="5.5" y="3" width="9" height="6" fill="#3a86ff"/><path d="M-15 14H15" stroke-width="2.6"/></g>`,
    temple: `<g ${O}><rect x="-10" y="0" width="20" height="13" fill="#d62828"/><rect x="-3" y="5" width="6" height="8" fill="#5a1a1a"/><path d="M-17 -1Q-11 -3 -9 -9H9Q11 -3 17 -1L19 -6Q13 -4 11 -12H-11Q-13 -4 -19 -6Z" fill="#f4a261"/></g>`,
    train: `<g ${O}><path d="M-11 -8V-13H-6V-8" fill="#23324a"/><rect x="-14" y="-8" width="23" height="14" rx="2" fill="#d62828"/><rect x="-11" y="-5" width="6" height="5" fill="#bde0fe"/><rect x="-3" y="-5" width="6" height="5" fill="#bde0fe"/><rect x="9" y="-3" width="6" height="9" fill="#b51d1d"/><circle cx="-8" cy="9" r="3" fill="#23324a"/><circle cx="4" cy="9" r="3" fill="#23324a"/><path d="M-16 13H16" fill="none"/></g>`,
    puppet: `<g ${O}><path d="M-11 -15H11" stroke-width="2.6"/><path d="M-8 -15L-5 -5M8 -15L5 -5M0 -15V-8" fill="none" stroke-width="1.2"/><path d="M-8 4Q0 1 8 4L10 15H-10Z" fill="#ffb703"/><circle cx="0" cy="-2" r="6" fill="#ffe0bd"/><path d="M-7.5 -4Q0 -13 7.5 -4Z" fill="#2b2d42"/></g>`,
    boba: `<g ${O}><path d="M2 -11L7 -21" stroke="#e63946" stroke-width="3.2"/><path d="M-8 -8H8L6 14H-6Z" fill="#f1d3a0"/><rect x="-9.5" y="-11" width="19" height="4" rx="1.5" fill="#fff"/><g fill="#3d2b1f" stroke="none"><circle cx="-3" cy="10" r="1.9"/><circle cx="2" cy="10.5" r="1.9"/><circle cx="-0.5" cy="6.5" r="1.9"/><circle cx="4" cy="6" r="1.7"/><circle cx="-4.5" cy="5.5" r="1.7"/></g></g>`,
    chip: `<g ${O}><path d="M-5 -9V-13M0 -9V-13M5 -9V-13M-5 9V13M0 9V13M5 9V13M-9 -5H-13M-9 0H-13M-9 5H-13M9 -5H13M9 0H13M9 5H13" fill="none"/><rect x="-9" y="-9" width="18" height="18" rx="2" fill="#2b2d42"/><rect x="-4" y="-4" width="8" height="8" fill="#7fd1c7" stroke="none"/></g>`,
    plane: `<g ${O}><path d="M1 -2L-5 -14H-1.5L8 -4.5Z" fill="#3a86ff"/><path d="M-13 3L14 -6C17.5 -7 18 -3 14.5 -2L-11 6Z" fill="#fff"/><path d="M0 3L-2 13H1.5L6 1.5Z" fill="#3a86ff"/><path d="M-11 4L-15 -4H-12L-7 2Z" fill="#3a86ff"/></g>`,
  };

  // ---------- 裝飾 ----------
  const islet = (cx, cy, rx, ry, rot = 0) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})"/>`;
  const wave = (x, y, s = 1) => `<path d="M${x} ${y}q${5 * s} ${-5 * s} ${10 * s} 0t${10 * s} 0" />`;
  const mountain = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-22 10L-4 -20L4 -12L10 -18L24 10Z" fill="#4f9d5a" stroke="#2f6b3a" stroke-width="2.4" stroke-linejoin="round"/><path d="M-8.6 -12.3L-4 -20L1.5 -14.5L-1 -11L-4 -13Z" fill="#fff"/></g>`;

  function svgMarkup() {
    const coast = closedPath(COAST);
    const route = closedPath(PTS);
    const sea = [
      wave(30, 250), wave(58, 268, 0.8), wave(18, 470), wave(44, 560, 0.9), wave(560, 260), wave(590, 420, 0.8),
      wave(540, 520), wave(500, 640, 0.9), wave(60, 700), wave(150, 760, 0.8), wave(380, 760), wave(600, 600, 0.8),
    ].join('');
    const stations = STATIONS.map((s, i) => {
      const [x, y] = PTS[i];
      const [lx, ly, anchor] = s.lab;
      const [ix, iy] = s.ic;
      return `<g class="station" data-i="${i}" transform="translate(${f(x)} ${f(y)})">
        <g class="st-icon" transform="translate(${ix} ${iy})"><circle r="18" class="st-badge"/>${ICON[s.icon]}</g>
        <circle r="9.5" class="st-dot"/><text class="st-no" y="3.6">${i === 0 ? '★' : i}</text>
        <text class="st-name" x="${lx}" y="${ly}" text-anchor="${anchor}">${s.short}</text>
      </g>`;
    }).join('');
    return `
<defs>
  <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b4e58a"/><stop offset=".55" stop-color="#8fd16f"/><stop offset="1" stop-color="#6fc062"/>
  </linearGradient>
  <radialGradient id="stageGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d6" stop-opacity=".9"/><stop offset="1" stop-color="#fff6d6" stop-opacity="0"/></radialGradient>
</defs>
<g class="sea-waves" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55">${sea}</g>

<g class="inset" transform="translate(14 18)">
  <rect width="96" height="126" rx="10" class="inset-box"/>
  <g fill="#9bd67a" stroke="#2f6b3a" stroke-width="2">${islet(30, 34, 9, 6, -20)}${islet(54, 28, 6, 4)}${islet(66, 40, 5, 3.5, 20)}${islet(42, 92, 22, 9, -8)}${islet(72, 96, 6, 4)}</g>
  <text x="48" y="60" class="inset-label">馬祖</text><text x="48" y="118" class="inset-label">金門</text>
</g>
<g class="islets" fill="#9bd67a" stroke="#2f6b3a" stroke-width="2">
  ${islet(34, 392, 9, 13, 10)}${islet(24, 414, 5, 4)}${islet(48, 410, 5, 6)}${islet(28, 440, 4, 3)}
  ${islet(441, 581, 8, 6)}${islet(456, 705, 9, 7, -15)}${islet(552, 140, 9, 5, -10)}${islet(156, 646, 5, 3.5)}
</g>
<g class="islet-labels">
  <text x="36" y="372">澎湖</text><text x="466" y="586" text-anchor="start">綠島</text>
  <text x="472" y="716" text-anchor="start">蘭嶼</text><text x="556" y="128">龜山島</text>
</g>

<path d="${coast}" transform="translate(7 9)" fill="#1f6fa8" opacity=".28"/>
<path d="${coast}" fill="none" stroke="#fbe7a6" stroke-width="18" stroke-linejoin="round"/>
<path d="${coast}" fill="url(#landGrad)" stroke="#2f6b3a" stroke-width="3" stroke-linejoin="round"/>

<g class="mountains">
  ${mountain(352, 196, 0.9)}${mountain(392, 178, 1.15)}${mountain(430, 206, 0.95)}${mountain(318, 226, 0.75)}
  ${mountain(262, 556, 0.85)}${mountain(292, 590, 1)}${mountain(258, 622, 0.8)}
</g>
<g class="bear" transform="translate(400 226)">
  <circle cx="-9" cy="-11" r="5.5" fill="#1d1d24"/><circle cx="9" cy="-11" r="5.5" fill="#1d1d24"/>
  <ellipse cx="0" cy="0" rx="13" ry="12" fill="#1d1d24"/>
  <ellipse cx="0" cy="4" rx="6" ry="4.5" fill="#d9b48f"/><circle cx="0" cy="2.2" r="1.8" fill="#1d1d24"/>
  <circle cx="-5" cy="-3" r="1.6" fill="#fff"/><circle cx="5" cy="-3" r="1.6" fill="#fff"/>
  <path d="M-7 12L0 17L7 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
</g>
<ellipse cx="${STAGE.x + STAGE.w / 2}" cy="${STAGE.y + STAGE.h / 2}" rx="${STAGE.w * 0.66}" ry="${STAGE.h * 0.62}" fill="url(#stageGlow)"/>

<path d="${route}" fill="none" stroke="#fffaf0" stroke-width="11" stroke-linejoin="round" opacity=".95"/>
<path d="${route}" fill="none" stroke="#ff8a1f" stroke-width="3.4" stroke-dasharray="9 8" stroke-linecap="round" class="route-dash"/>
<g class="stations">${stations}</g>

<g class="whale" transform="translate(586 352)">
  <path d="M-22 4C-22 -10 10 -12 18 0C22 6 20 10 14 10H-14C-20 10 -22 8 -22 4Z" fill="#4a6fa5" stroke="#23324a" stroke-width="2.4"/>
  <path d="M18 2L30 -6L28 8Z" fill="#4a6fa5" stroke="#23324a" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="-12" cy="0" r="1.8" fill="#23324a"/>
  <path class="spout" d="M-6 -10C-8 -18 -14 -20 -16 -22M-6 -10C-4 -18 2 -20 4 -24M-6 -10V-24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
</g>
<g class="boat" transform="translate(66 626)">
  <path d="M-20 0H20L14 10H-14Z" fill="#e63946" stroke="#23324a" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M-2 0V-24L14 -4Z" fill="#fff" stroke="#23324a" stroke-width="2.4" stroke-linejoin="round"/>
</g>
<g class="magpie" transform="translate(560 64)">
  <path d="M-4 0C-14 6 -30 10 -40 8C-30 14 -16 12 -4 6Z" fill="#2a6fdb" stroke="#1b2a4a" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M-34 8l-3 3M-24 9l-2 3" stroke="#fff" stroke-width="2"/>
  <ellipse cx="2" cy="0" rx="10" ry="6" fill="#2a6fdb" stroke="#1b2a4a" stroke-width="1.8"/>
  <path class="wing" d="M0 -2C-4 -14 -14 -18 -20 -16C-12 -12 -8 -6 -4 2Z" fill="#3d86f0" stroke="#1b2a4a" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="10" cy="-4" r="5.5" fill="#1d1d24"/><path d="M15 -4L21 -2L15 -1Z" fill="#e63946"/>
  <circle cx="11" cy="-5" r="1.2" fill="#ffd23f"/>
</g>
<g class="compass" transform="translate(592 742)">
  <circle r="22" fill="#fffaf0" stroke="#23324a" stroke-width="2.4"/>
  <path d="M0 -17L5 0L0 17L-5 0Z" fill="#ff8a1f" stroke="#23324a" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M0 -17L5 0H-5Z" fill="#e63946"/>
  <text y="-25" class="compass-n">N</text>
</g>
<g class="route-sign" transform="translate(18 728)">
  <rect width="150" height="40" rx="9" fill="#1f7a4d" stroke="#fff" stroke-width="2.5"/>
  <circle cx="22" cy="20" r="13" fill="#fff"/><text x="22" y="25.5" class="rs-no">1</text>
  <text x="42" y="18" class="rs-zh">環島 1 號線</text><text x="42" y="32" class="rs-en">FORMOSA CYBER TOUR</text>
</g>`;
  }

  function build(svg) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = svgMarkup();
  }

  root.TWMAP = { W, H, STAGE, N, build, segment, stationXY, proj };
})(window);
