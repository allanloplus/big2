/* 規則引擎單元測試＋AI 自動對局
 * 用法：node tests/simulate.js [局數]
 */
'use strict';
const assert = require('assert');
const B2 = require('../js/engine.js');
const AI = require('../js/ai.js');

const R = (s) => {
  // '3C' '10H' 'AS' '2D' → 牌編號
  const m = s.match(/^(10|[2-9JQKA])([CDHS])$/);
  assert(m, 'bad card ' + s);
  return B2.RANKS.indexOf(m[1]) * 4 + 'CDHS'.indexOf(m[2]);
};
const C = (str) => B2.classify(str.split(' ').map(R));

let pass = 0;
function t(name, fn) { fn(); pass++; }

// ---------- 牌型判斷 ----------
t('單張與對子', () => {
  assert.strictEqual(C('3C').type, 'single');
  assert.strictEqual(C('KH KS').type, 'pair');
  assert.strictEqual(C('KH QS'), null);
});
t('三張、四張不能單出', () => {
  assert.strictEqual(C('5C 5D 5H'), null);
  assert.strictEqual(C('5C 5D 5H 5S'), null);
});
t('五張牌型', () => {
  assert.strictEqual(C('3C 4D 5H 6S 7C').type, 'straight');
  assert.strictEqual(C('3C 3D 3H 9S 9C').type, 'fullhouse');
  assert.strictEqual(C('9C 9D 9H 9S 3C').type, 'four');
  assert.strictEqual(C('3H 4H 5H 6H 7H').type, 'straightflush');
  assert.strictEqual(C('3H 5H 7H 9H JH'), null, '台灣規則不出同花');
  assert.strictEqual(C('3C 3D 9H 9S KC'), null);
});
t('不能繞過 2 的順子', () => {
  assert.strictEqual(C('JC QD KH AS 2C'), null);
  assert.strictEqual(C('QC KD AH 2S 3C'), null);
  assert.strictEqual(C('KC AD 2H 3S 4C'), null);
  assert.strictEqual(C('AC 2D 3H 4S 5C').type, 'straight');
  assert.strictEqual(C('2C 3D 4H 5S 6C').type, 'straight');
});

// ---------- 比大小 ----------
t('點數與花色', () => {
  assert(B2.beats(C('2C'), C('AS')));
  assert(B2.beats(C('3S'), C('3H')));
  assert(!B2.beats(C('3D'), C('3H')));
  assert(B2.beats(C('2C 2D'), C('AH AS')));
  assert(B2.beats(C('9C 9S'), C('9D 9H')));
});
t('順子大小：A2345 最小、23456 最大', () => {
  assert(B2.beats(C('3C 4D 5H 6S 7C'), C('AS 2S 3S 4S 5H')));
  assert(B2.beats(C('2C 3D 4H 5S 6C'), C('10S JS QS KS AH')));
  assert(B2.beats(C('10C JD QH KS AS'), C('9S 10S JS QS KH')));
  assert(B2.beats(C('3C 4D 5H 6S 7S'), C('3S 4S 5S 6H 7H')), '同順子比最大張花色');
});
t('五張牌型階級', () => {
  assert(B2.beats(C('3C 3D 3H 4S 4C'), C('2C 3D 4H 5S 6C')));
  assert(B2.beats(C('3C 3D 3H 3S 4C'), C('2C 2D 2H AS AC')));
  assert(B2.beats(C('3H 4H 5H 6H 7H'), C('2C 2D 2H 2S AC')));
  assert(!B2.beats(C('3C 3D 3H 4S 4C'), C('2C 2D 2H 2S AC')));
});
t('怪物牌越級，其他不行', () => {
  assert(B2.beats(C('3C 3D 3H 3S 4C'), C('2S')));
  assert(B2.beats(C('3H 4H 5H 6H 7H'), C('2H 2S')));
  assert(!B2.beats(C('3C 4D 5H 6S 7C'), C('3D')));
  assert(!B2.beats(C('2S'), C('3C 3D 3H 3S 4C')));
  assert(!B2.beats(C('AC AD'), C('3S')));
});

// ---------- 計分 ----------
t('剩牌倍率', () => {
  const hand = (n) => Array.from({ length: n }, (_, i) => i);
  assert.deepStrictEqual(B2.score([hand(0), hand(7), hand(8), hand(13)], 0), [7 + 16 + 52, -7, -16, -52]);
  assert.deepStrictEqual(B2.score([hand(10), hand(1), hand(0), hand(9)], 2), [-30, -1, 30 + 1 + 18, -18]);
});

// ---------- 牌局流程 ----------
t('梅花 3 開局、三家都過換主導權', () => {
  const st = B2.newRound(() => 0.42);
  const p = st.starter;
  assert(st.hands[p].includes(0));
  assert(!B2.check(st, p, [st.hands[p][1]]).ok, '第一手沒帶梅花 3 不行');
  B2.play(st, p, [0]);
  for (let i = 0; i < 3; i++) assert.strictEqual(B2.pass(st, st.turn).cleared, i === 2);
  assert.strictEqual(st.turn, p);
  assert.strictEqual(st.current, null);
  assert.throws(() => B2.pass(st, p), '主導權在手不能過');
});

// ---------- AI 自動對局 ----------
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const games = +process.argv[2] || 400;
const personas = [{ aggr: 0.5 }, { aggr: 0.75, noise: 0.1 }, { aggr: 0.45, noise: 0.05 }, { aggr: 0.6, noise: 0.18 }];
const wins = [0, 0, 0, 0];
const types = {};
let moves = 0, maxMoves = 0, t0 = Date.now(), slowest = 0;
for (let g = 0; g < games; g++) {
  const rng = mulberry(g + 1);
  const st = B2.newRound(rng);
  let n = 0;
  while (st.winner < 0) {
    const p = st.turn;
    const a = Date.now();
    const d = AI.choose(st, p, Object.assign({ rng }, personas[p]));
    slowest = Math.max(slowest, Date.now() - a);
    assert(typeof d.why === 'string' && d.why.length, '每一步都要有理由');
    if (d.pass) {
      assert(st.current, `第 ${g} 局：主導權在手卻選擇過`);
      B2.pass(st, p);
    } else {
      const r = B2.check(st, p, d.cards);
      assert(r.ok, `第 ${g} 局：AI 出了不合法的牌 ${d.cards.map(B2.label).join(' ')}：${r.reason}`);
      B2.play(st, p, d.cards);
      types[r.combo.type] = (types[r.combo.type] || 0) + 1;
    }
    assert(++n < 400, `第 ${g} 局沒有結束`);
  }
  const s = B2.score(st.hands, st.winner);
  assert.strictEqual(s.reduce((a, b) => a + b, 0), 0, '分數總和應為 0');
  assert.strictEqual(st.played.length + st.hands.flat().length, 52);
  wins[st.winner]++;
  moves += n;
  maxMoves = Math.max(maxMoves, n);
}

console.log(`✓ ${pass} 個單元測試通過`);
console.log(`✓ ${games} 局 AI 自動對局全部合法（平均 ${(moves / games).toFixed(1)} 步、最多 ${maxMoves} 步，最慢一步 ${slowest} ms，共 ${Date.now() - t0} ms）`);
console.log('  勝場：', wins.join(' / '), '  牌型次數：', JSON.stringify(types));
