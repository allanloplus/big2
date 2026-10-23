/* Allan's 資安大老二 — 規則引擎（純邏輯，瀏覽器與 Node 都能用）
 *
 * 牌的編號 0..51：rank = id >> 2（0=3、1=4 … 10=K、11=A、12=2），suit = id & 3（0=♣ 1=♦ 2=♥ 3=♠）
 * 所以編號越大牌越大：梅花 3 = 0 最小，黑桃 2 = 51 最大。
 *
 * 台灣常見玩法：
 *   牌型：單張、對子、順子、葫蘆、鐵支（四張＋一張）、同花順。不出三條、不出同花。
 *   順子：A2345 最小、23456 最大，其餘看最大那張；不能繞過 2（JQKA2、QKA23、KA234 不算）。
 *   五張牌型：順子 < 葫蘆 < 鐵支 < 同花順。
 *   鐵支、同花順是「怪物牌」，可以越級壓單張和對子。
 */
(function (root) {
  'use strict';

  const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const SUITS = ['♣', '♦', '♥', '♠'];
  const SUIT_ZH = ['梅花', '方塊', '紅心', '黑桃'];
  const THREE_CLUBS = 0;

  const rankOf = (c) => c >> 2;
  const suitOf = (c) => c & 3;
  const label = (c) => SUITS[suitOf(c)] + RANKS[rankOf(c)];
  const spoken = (c) => SUIT_ZH[suitOf(c)] + RANKS[rankOf(c)];
  const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;

  /** 牌型：name 是正式名稱，alias 是本站的資安代號 */
  const TYPES = {
    single: { name: '單張', alias: '單點突破', size: 1 },
    pair: { name: '對子', alias: '雙因子驗證', size: 2 },
    straight: { name: '順子', alias: '攻擊鏈', size: 5, tier: 1 },
    fullhouse: { name: '葫蘆', alias: '3-2-1 備份', size: 5, tier: 2 },
    four: { name: '鐵支', alias: '零時差攻擊', size: 5, tier: 3, bomb: true },
    straightflush: { name: '同花順', alias: 'APT 國家級攻擊', size: 5, tier: 4, bomb: true },
  };
  const TYPE_ORDER = ['single', 'pair', 'straight', 'fullhouse', 'four', 'straightflush'];

  // 合法順子（rank 索引），由小到大；TOP 是比花色時看的那張
  const STRAIGHTS = [[11, 12, 0, 1, 2]];
  for (let r = 0; r <= 7; r++) STRAIGHTS.push([r, r + 1, r + 2, r + 3, r + 4]);
  STRAIGHTS.push([12, 0, 1, 2, 3]);
  const STRAIGHT_TOP = STRAIGHTS.map((s, i) => (i === 0 ? 2 : i === STRAIGHTS.length - 1 ? 12 : s[4]));
  const STRAIGHT_NAME = STRAIGHTS.map((s) => s.map((r) => (r === 11 ? 'A' : RANKS[r])).join(''));

  const byValue = (a, b) => a - b;

  function make(type, cards, key) {
    return { type, cards: cards.slice().sort(byValue), key, size: cards.length };
  }

  function straightIndex(rankSet) {
    for (let i = 0; i < STRAIGHTS.length; i++) {
      if (STRAIGHTS[i].every((r) => rankSet.has(r))) return i;
    }
    return -1;
  }

  /** 判斷牌型；不合法回傳 null */
  function classify(cards) {
    const n = cards.length;
    if (new Set(cards).size !== n) return null;
    if (n === 1) return make('single', cards, cards[0]);
    if (n === 2) return rankOf(cards[0]) === rankOf(cards[1]) ? make('pair', cards, Math.max(cards[0], cards[1])) : null;
    if (n !== 5) return null;
    const count = new Map();
    for (const c of cards) count.set(rankOf(c), (count.get(rankOf(c)) || 0) + 1);
    if (count.size === 2) {
      for (const [r, k] of count) {
        if (k === 4) return make('four', cards, r);
        if (k === 3) return make('fullhouse', cards, r);
      }
      return null;
    }
    if (count.size !== 5) return null;
    const si = straightIndex(new Set(count.keys()));
    if (si < 0) return null;
    const top = cards.find((c) => rankOf(c) === STRAIGHT_TOP[si]);
    const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
    return make(flush ? 'straightflush' : 'straight', cards, si * 4 + suitOf(top));
  }

  /** a 能不能壓過桌上的 b（b 為 null 代表自由出牌） */
  function beats(a, b) {
    if (!b) return true;
    const A = TYPES[a.type], B = TYPES[b.type];
    if (a.size !== b.size) return !!A.bomb && b.size < 5;
    if (a.size === 5 && A.tier !== B.tier) return A.tier > B.tier;
    return a.key > b.key;
  }

  /** 牌型的口語描述，例如「順子 34567」 */
  function describe(combo) {
    const t = TYPES[combo.type];
    if (combo.type === 'single') return label(combo.cards[0]);
    if (combo.type === 'pair') return '一對 ' + RANKS[rankOf(combo.cards[0])];
    if (combo.type === 'straight' || combo.type === 'straightflush') {
      const name = STRAIGHT_NAME[combo.key >> 2];
      return t.name + ' ' + (combo.type === 'straightflush' ? SUITS[suitOf(combo.cards[0])] : '') + name;
    }
    return t.name + ' ' + RANKS[combo.key];
  }

  // ---------- 發牌與牌局 ----------
  function shuffle(rng) {
    const d = Array.from({ length: 52 }, (_, i) => i);
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  const next = (p) => (p + 1) % 4;

  function newRound(rng) {
    const deck = shuffle(rng || Math.random);
    const hands = [0, 1, 2, 3].map((p) => deck.slice(p * 13, p * 13 + 13).sort(byValue));
    const starter = hands.findIndex((h) => h.includes(THREE_CLUBS));
    return {
      hands,
      starter,
      turn: starter,
      current: null,      // { combo, by }
      passes: 0,
      first: true,        // 第一手必須包含梅花 3
      trick: 1,           // 第幾輪（每次大家都過就換下一輪）
      played: [],         // 已經出過的牌
      log: [],
      winner: -1,
    };
  }

  /** 檢查出牌是否合法；回傳 { ok, combo, reason } */
  function check(st, p, cards) {
    if (st.winner >= 0) return { ok: false, reason: '這局已經結束了' };
    if (p !== st.turn) return { ok: false, reason: '還沒輪到你' };
    if (!cards || !cards.length) return { ok: false, reason: '請先選牌' };
    const hand = st.hands[p];
    if (!cards.every((c) => hand.includes(c))) return { ok: false, reason: '這些牌不在手上' };
    const combo = classify(cards);
    if (!combo) {
      const n = cards.length;
      let reason = '這不是合法的牌型';
      if (n === 2) reason = '兩張要同點數才是對子';
      else if (n === 3) reason = '台灣規則不能單出三條，要配一對變成葫蘆';
      else if (n === 4) reason = '四張要再帶一張，才是鐵支';
      else if (n === 5) reason = '這五張湊不成順子、葫蘆、鐵支或同花順';
      else if (n > 5) reason = '一次最多出五張';
      return { ok: false, reason, code: 'shape' };
    }
    if (st.first && !cards.includes(THREE_CLUBS)) return { ok: false, combo, reason: '第一手必須包含梅花 3', code: 'three' };
    if (st.current && !beats(combo, st.current.combo)) {
      const cur = st.current.combo;
      const reason = combo.size !== cur.size
        ? `桌上是${TYPES[cur.type].name}，要出${cur.size} 張的牌型（或是鐵支、同花順）`
        : '這組壓不過桌上的牌';
      return { ok: false, combo, reason, code: combo.size !== cur.size ? 'size' : 'low' };
    }
    return { ok: true, combo };
  }

  function play(st, p, cards) {
    const r = check(st, p, cards);
    if (!r.ok) throw new Error(r.reason);
    st.hands[p] = st.hands[p].filter((c) => !cards.includes(c));
    st.current = { combo: r.combo, by: p };
    st.passes = 0;
    st.first = false;
    st.played.push(...r.combo.cards);
    st.log.push({ p, combo: r.combo, trick: st.trick });
    if (!st.hands[p].length) st.winner = p;
    else st.turn = next(p);
    return r.combo;
  }

  /** 過牌；三家都過時，最後出牌的人拿回主導權（cleared = true） */
  function pass(st, p) {
    if (st.winner >= 0 || p !== st.turn) throw new Error('還沒輪到你');
    if (!st.current) throw new Error('你有主導權，這輪不能過');
    st.passes++;
    st.log.push({ p, pass: true, trick: st.trick });
    if (st.passes >= 3) {
      const lead = st.current.by;
      st.current = null;
      st.passes = 0;
      st.turn = lead;
      st.trick++;
      return { cleared: true, lead };
    }
    st.turn = next(p);
    return { cleared: false };
  }

  // ---------- 列舉手上所有牌型 ----------
  function subsets(arr, k, start = 0, pick = [], out = []) {
    if (pick.length === k) { out.push(pick.slice()); return out; }
    for (let i = start; i < arr.length; i++) {
      pick.push(arr[i]);
      subsets(arr, k, i + 1, pick, out);
      pick.pop();
    }
    return out;
  }

  function groupByRank(hand) {
    const g = Array.from({ length: 13 }, () => []);
    for (const c of hand) g[rankOf(c)].push(c);
    for (const x of g) x.sort(byValue);
    return g;
  }

  function allCombos(hand) {
    const g = groupByRank(hand);
    const out = [];
    for (const c of hand) out.push(make('single', [c], c));
    for (const cs of g) for (const [a, b] of subsets(cs, 2)) out.push(make('pair', [a, b], Math.max(a, b)));
    STRAIGHTS.forEach((seq) => {
      if (!seq.every((r) => g[r].length)) return;
      const walk = (i, pick) => {
        if (i === seq.length) { out.push(classify(pick)); return; }
        for (const c of g[seq[i]]) walk(i + 1, pick.concat(c));
      };
      walk(0, []);
    });
    for (let r = 0; r < 13; r++) {
      if (g[r].length >= 3) {
        for (const tri of subsets(g[r], 3)) {
          for (let q = 0; q < 13; q++) {
            if (q === r || g[q].length < 2) continue;
            for (const pr of subsets(g[q], 2)) out.push(make('fullhouse', tri.concat(pr), r));
          }
        }
      }
      if (g[r].length === 4) {
        for (const k of hand) if (rankOf(k) !== r) out.push(make('four', g[r].concat(k), r));
      }
    }
    return out;
  }

  /** 現在這個玩家能出的所有牌型 */
  function legalMoves(st, p) {
    if (st.winner >= 0 || st.turn !== p) return [];
    const cur = st.current && st.current.combo;
    return allCombos(st.hands[p]).filter((c) => (!st.first || c.cards.includes(THREE_CLUBS)) && beats(c, cur));
  }

  // ---------- 計分 ----------
  /** 剩牌倍率：8–9 張 ×2、10–12 張 ×3、13 張（一張都沒出）×4 */
  function multiplier(n) {
    return n >= 13 ? 4 : n >= 10 ? 3 : n >= 8 ? 2 : 1;
  }

  /** 每位玩家本局得分：輸家扣「剩牌 × 倍率」，贏家拿走全部 */
  function score(hands, winner) {
    const lose = hands.map((h, i) => (i === winner ? 0 : h.length * multiplier(h.length)));
    const total = lose.reduce((a, b) => a + b, 0);
    return hands.map((h, i) => (i === winner ? total : -lose[i]));
  }

  const B2 = {
    RANKS, SUITS, SUIT_ZH, TYPES, TYPE_ORDER, STRAIGHTS, STRAIGHT_NAME, THREE_CLUBS,
    rankOf, suitOf, label, spoken, isRed,
    classify, beats, describe, newRound, check, play, pass, next,
    allCombos, legalMoves, groupByRank, subsets, multiplier, score, shuffle,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = B2;
  else root.B2 = B2;
})(typeof window !== 'undefined' ? window : globalThis);
