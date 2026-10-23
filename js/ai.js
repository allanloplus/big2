/* Allan's 資安大老二 — 電腦玩家
 * 也用在「問阿拉蕾」的出牌建議（含理由）。
 *
 * 作法：先把手牌拆成「出牌計畫」（幾組五張牌型＋對子＋單張，讓回合數最少、小牌最少），
 * 主導權在手就出最弱的一組；要跟牌時優先出計畫裡剛好壓得過的那組，拆牌太傷就先過。
 */
(function (root) {
  'use strict';
  const B2 = root.B2 || require('./engine.js');
  const { rankOf, suitOf, TYPES, STRAIGHTS, classify, groupByRank, legalMoves, next } = B2;

  /** 出牌理由（「問阿拉蕾」會念出來；tools/build_audio.py 會預先合成這些句子） */
  const WHY = {
    first: '第一手要帶梅花 3，就用它組成的牌型開局。',
    finish: '這組出完就回到台北 101 了，直接出！',
    bossFirst: '先出沒人壓得過的大牌拿回主導權，下一輪就能出完。',
    blockSingle: '有人只剩一張，別出小單張讓他過關！',
    blockNext: '下家只剩一張，用最大的單張把他擋下來！',
    leadFive: '五張一起出，一口氣往前走五站！',
    leadPair: '先出小對子，把小牌消化掉，大牌留著控場。',
    leadSingle: '先出最小的單張，大牌留到後面控場。',
    followUnit: '剛好有一組壓得過，又不會拆散其他牌型。',
    followBreak: '雖然要拆牌，但能壓住對手、往前推進，值得。',
    danger: '有人快出完了，不能再保留，壓下去！',
    bomb: '對手快出完了，怪物牌該出場了！',
    passNone: '沒有壓得過的牌，這輪先過。',
    passSave: '大牌先留著，現在硬壓太浪費，先過。',
    passBreak: '硬壓會拆散好牌型，先過，等主導權回來。',
  };

  const byValue = (a, b) => a - b;
  const mk = (type, cards, key) => ({ type, cards: cards.slice().sort(byValue), key, size: cards.length });

  /** 牌組強度 0..1 */
  function strength(c) {
    switch (c.type) {
      case 'single':
      case 'pair': return c.key / 51;
      case 'straight': return 0.2 + (c.key / 39) * 0.45;
      case 'fullhouse': return 0.55 + (c.key / 12) * 0.3;
      case 'four': return 0.9 + (c.key / 12) * 0.08;
      default: return 1;
    }
  }
  const unitCost = (u) => 1 + 0.9 * (1 - strength(u));
  const cost = (units) => units.reduce((s, u) => s + unitCost(u), 0);

  /** 五張牌型的候選；每種只留幾個代表，避免組合爆炸 */
  function fiveCandidates(hand) {
    const g = groupByRank(hand);
    const out = [];
    for (const seq of STRAIGHTS) {
      if (!seq.every((r) => g[r].length)) continue;
      out.push(classify(seq.map((r) => g[r][0])));
      for (let s = 0; s < 4; s++) {
        const pick = seq.map((r) => g[r].find((c) => suitOf(c) === s));
        if (pick.every((c) => c !== undefined)) out.push(classify(pick));
      }
    }
    for (let r = 0; r < 13; r++) {
      if (g[r].length === 3) {
        for (let q = 0; q < 13; q++) {
          if (q !== r && g[q].length >= 2) out.push(mk('fullhouse', g[r].concat(g[q].slice(0, 2)), r));
        }
      }
      if (g[r].length === 4) {
        const others = hand.filter((c) => rankOf(c) !== r);
        const lone = others.filter((c) => g[rankOf(c)].length === 1);
        const kickers = new Set([lone[0], others[0]].filter((c) => c !== undefined));
        for (const k of kickers) out.push(mk('four', g[r].concat(k), r));
      }
    }
    return out;
  }

  /** 剩下的牌拆成對子與單張 */
  function fillRest(rest) {
    const g = groupByRank(rest);
    const units = [];
    for (const cs of g) {
      if (cs.length === 4) units.push(mk('pair', cs.slice(0, 2), cs[1]), mk('pair', cs.slice(2), cs[3]));
      else if (cs.length === 3) units.push(mk('pair', cs.slice(0, 2), cs[1]), mk('single', [cs[2]], cs[2]));
      else if (cs.length === 2) units.push(mk('pair', cs, cs[1]));
      else if (cs.length === 1) units.push(mk('single', cs, cs[0]));
    }
    return units;
  }

  /** 出牌計畫：{ units, cost }，cost 越小越好 */
  function plan(hand) {
    const fives = fiveCandidates(hand);
    let units = fillRest(hand);
    let best = { units, cost: cost(units) };
    const consider = (picked) => {
      const used = new Set();
      for (const f of picked) for (const c of f.cards) used.add(c);
      const u = picked.concat(fillRest(hand.filter((c) => !used.has(c))));
      const k = cost(u);
      if (k < best.cost - 1e-9) best = { units: u, cost: k };
    };
    for (let i = 0; i < fives.length; i++) {
      consider([fives[i]]);
      for (let j = i + 1; j < fives.length; j++) {
        if (!fives[j].cards.some((c) => fives[i].cards.includes(c))) consider([fives[i], fives[j]]);
      }
    }
    return best;
  }

  function unseen(st, p) {
    const known = new Set(st.hands[p].concat(st.played));
    const out = [];
    for (let c = 0; c < 52; c++) if (!known.has(c)) out.push(c);
    return out;
  }

  /** 沒有人壓得過這組（不考慮怪物牌越級） */
  function isBoss(u, rest) {
    if (u.type === 'single') return !rest.some((c) => c > u.key);
    if (u.type === 'pair') {
      const g = groupByRank(rest);
      return !g.some((cs, r) => cs.length >= 2 && (r > rankOf(u.key) || (r === rankOf(u.key) && cs[cs.length - 1] > u.key)));
    }
    return !!TYPES[u.type].bomb;
  }

  const tierOf = (c) => TYPES[c.type].tier || 0;
  const order = (a, b) => tierOf(a) - tierOf(b) || a.key - b.key;
  const pick = (combo, why) => ({ cards: combo.cards.slice(), combo, why });
  const passWith = (why) => ({ pass: true, why });

  /**
   * 幫玩家 p 決定這一步。persona：{ aggr: 0..1 越大越敢壓牌, noise: 隨機程度, rng }
   * 回傳 { cards, combo, why } 或 { pass: true, why }
   */
  function choose(st, p, persona = {}) {
    const aggr = persona.aggr != null ? persona.aggr : 0.5;
    const noise = persona.noise || 0;
    const rng = persona.rng || Math.random;
    const hand = st.hands[p];
    const counts = st.hands.map((h) => h.length);
    const minOpp = Math.min(...[0, 1, 2, 3].filter((i) => i !== p).map((i) => counts[i]));
    const legal = legalMoves(st, p);
    if (!legal.length) return passWith(WHY.passNone);
    const finish = legal.find((c) => c.size === hand.length);
    if (finish) return pick(finish, WHY.finish);

    const P = plan(hand);
    const cur = st.current && st.current.combo;

    // ---- 主導權在手：自由出牌 ----
    if (!cur) {
      if (st.first) return pick(P.units.find((u) => u.cards.includes(B2.THREE_CLUBS)), WHY.first);
      const units = P.units.slice();
      if (units.length === 2) {
        const rest = unseen(st, p);
        const boss = units.find((u) => isBoss(u, rest));
        if (boss) return pick(boss, WHY.bossFirst);
      }
      if (minOpp === 1) {
        const multi = units.filter((u) => u.size > 1).sort((a, b) => strength(a) - strength(b));
        if (multi.length) return pick(multi[0], WHY.blockSingle);
        return pick(units.sort((a, b) => b.key - a.key)[0], WHY.blockSingle);
      }
      const scored = units.map((u) => ({ u, s: strength(u) - 0.12 * (u.size - 1) + (rng() - 0.5) * noise }));
      scored.sort((a, b) => a.s - b.s);
      const u = scored[0].u;
      return pick(u, u.size === 5 ? WHY.leadFive : u.size === 2 ? WHY.leadPair : WHY.leadSingle);
    }

    // ---- 跟牌 ----
    const danger = minOpp <= 2 || counts[st.current.by] <= 3;
    if (cur.type === 'single' && counts[next(p)] === 1) {
      const singles = legal.filter((c) => c.type === 'single');
      if (singles.length) return pick(singles.reduce((a, b) => (a.key > b.key ? a : b)), WHY.blockNext);
    }
    const bombOK = (c) => !TYPES[c.type].bomb || cur.size === 5 || danger || P.units.length <= 3;
    const options = legal.filter(bombOK);
    if (!options.length) return passWith(WHY.passSave);

    const unitKeys = new Set(P.units.map((u) => u.cards.join(',')));
    const fits = options.filter((c) => unitKeys.has(c.cards.join(','))).sort(order);
    if (fits.length) {
      const u = fits[0];
      const spendBig = strength(u) > 0.82 && strength(cur) < 0.55 && minOpp > 5;
      if (!danger && spendBig && rng() > aggr) return passWith(WHY.passSave);
      return pick(u, TYPES[u.type].bomb ? WHY.bomb : danger ? WHY.danger : WHY.followUnit);
    }

    let best = null;
    for (const c of options) {
      const gain = P.cost - plan(hand.filter((x) => !c.cards.includes(x))).cost;
      if (!best || gain > best.gain + 1e-9 || (Math.abs(gain - best.gain) < 1e-9 && order(c, best.c) < 0)) best = { c, gain };
    }
    const need = danger ? -2 : 0.9 - aggr * 0.8 + (rng() - 0.5) * noise;
    if (best.gain >= need) return pick(best.c, TYPES[best.c.type].bomb ? WHY.bomb : danger ? WHY.danger : WHY.followBreak);
    return passWith(WHY.passBreak);
  }

  /** 「問阿拉蕾」：用最穩健的設定幫 Allan 想一步 */
  const hint = (st, p) => choose(st, p, { aggr: 0.5, noise: 0 });

  const AI = { WHY, choose, hint, plan, strength };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  else root.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
