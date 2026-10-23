/* Allan's 資安大老二 — 角色與對白腳本
 * 每個事件是一組「劇本」，隨機挑一個；劇本是一串 [說話者, 台詞, 表情]。
 * 說話者：allan / arale / cat / guru。表情只用在 Allan 和阿拉蕾（對應 assets/img/{who}-{表情}.webp）。
 * 變數：{n} 第幾局、{who} 事件主角、{type} 牌型、{alias} 牌型的資安代號。
 * 改完台詞記得跑 tools/build_audio.py 重新合成配音。
 */
(function (root) {
  'use strict';

  const CAST = {
    allan: { name: 'Allan', title: 'TEAM TAIWAN 資安顧問', color: '#ff8a1f' },
    cat: { name: '勒索喵', title: '把一切加密的勒索軟體', color: '#7b3fb8' },
    arale: { name: '阿拉蕾', title: 'AI 小助手・環島導航', color: '#0fa3b9' },
    guru: { name: '飆股老師', title: '保證獲利的假投資群組團長', color: '#e03131' },
  };

  const say = (who, mood) => (text) => [[who, text, mood]];
  const allan = (mood, ...texts) => texts.map(say('allan', mood));
  const arale = (mood, ...texts) => texts.map(say('arale', mood));
  const npc = (who, ...texts) => texts.map(say(who, null));

  const L = {
    intro: [
      [['arale', '嗶嗶！環島導航系統啟動！歡迎來到 Allan 的資安大老二！', 'cheer'],
        ['allan', '大家好，我是 Allan。規則很簡單：每出一張牌就往前走一站，誰先出完手牌、回到台北 101，誰就拿到資安認證！', 'smile'],
        ['cat', '嘿嘿，你們的手牌，我已經全部加密了喵。', null],
        ['guru', '各位學員好！跟著老師出牌，保證獲利三百趴！', null],
        ['allan', '保證獲利？這是標準的投資詐騙話術。阿拉蕾，記下來。', 'lecture'],
        ['arale', '已記錄！Team Taiwan 環島攻防戰，出發～', 'cheer']],
      [['allan', 'Team Taiwan，資安不能等！今天我們用大老二，把台灣環島一圈！', 'laugh'],
        ['arale', '阿拉蕾規劃好路線了：基隆、宜蘭、花蓮、台東，一路繞回台北 101！', 'explain'],
        ['guru', '環島幹嘛？跟老師買飆股，一天就賺一台車！', null],
        ['cat', '先付三顆比特幣，我才讓你們出發喵。', null],
        ['allan', '不付贖金，這是原則。我們有備份，也有實力。', 'wink'],
        ['arale', '老師好帥！大家坐穩囉～', 'cheer']],
    ],

    roundStart: [
      [['arale', '第 {n} 局開始！大家回到台北 101 起點，牌已經洗好、發好囉～', 'cheer']],
      [['allan', '第 {n} 局。先做風險評鑑：看看手上有幾張 2，有沒有順子跟葫蘆。', 'think']],
      [['arale', '第 {n} 局！老師加油，Taiwan can help！', 'cheer'], ['allan', '今天也要 Taiwan can win。', 'wink']],
      [['allan', '新的一局，新的 PDCA。Plan：先把小牌消化掉。', 'lecture'], ['arale', 'Do：然後第一個回到 101！', 'laugh']],
    ],

    starter: {
      allan: [[['arale', '老師拿到梅花 3！由老師開局，第一手要包含梅花 3 喔！', 'explain']]],
      arale: [[['arale', '梅花 3 在阿拉蕾這裡！阿拉蕾先出牌囉～', 'wink']]],
      cat: [[['arale', '梅花 3 在勒索喵手上，由勒索喵先出牌！', 'explain'], ['cat', '第一步，先加密你們的耐心喵。', null]]],
      guru: [[['arale', '梅花 3 在飆股老師手上，由飆股老師開局！', 'explain'], ['guru', '開盤囉！跟上老師的節奏！', null]]],
    },

    allanFirstTurn: [
      [['arale', '輪到老師囉！點選手牌再按「出牌」，不確定的話就按「問阿拉蕾」！', 'explain']],
    ],

    /** Allan 自己出牌時的台詞（two = 出 2） */
    allanPlay: {
      single: allan('smile', '單點突破！', '先送一張，探探虛實。', '這張，我先抽樣。'),
      pair: allan('wink', '雙因子驗證，登入成功！', '一對，兩道防線。'),
      straight: allan('laugh', '五張連號，一路暢通，比高鐵還順！', '攻擊鏈？不，這是我的防禦鏈！'),
      fullhouse: allan('lecture', '葫蘆！三二一備份原則：三份備份、兩種媒體、一份異地！', '三帶二，備份做好，心裡不慌。'),
      four: allan('laugh', '鐵支！零時差漏洞，我先修補了！'),
      straightflush: allan('laugh', '同花順！這就是 Team Taiwan 的國家級防禦！'),
      two: allan('wink', '老二出場，最高權限！', '這張 2，就是我的 Root 權限。'),
    },
    aralePlay: {
      single: arale('wink', '嗶嗶！阿拉蕾出一張！', '這張交給阿拉蕾～'),
      pair: arale('cheer', '雙因子驗證，阿拉蕾也會！'),
      straight: arale('laugh', '連續五站，導航順暢！'),
      fullhouse: arale('explain', '三二一備份，阿拉蕾每天都有做喔！'),
      four: arale('cheer', '鐵支！阿拉蕾的防火牆升級完成！'),
      straightflush: arale('cheer', '同花順！阿拉蕾 AI 全力運算！'),
      two: arale('surprise', '阿拉蕾拿出老二了，最高權限！'),
    },
    npcPlay: {
      cat: npc('cat', '這張牌已經被我加密了喵。', '你的檔案，我先收下了喵。', '想要解密金鑰？付比特幣喵。',
        '備份？你們真的有備份嗎喵？', '我從釣魚信件溜進來的喵～', '偷偷橫向移動，誰都沒發現喵。'),
      guru: npc('guru', '這張是內線消息，明天漲停！', '跟著老師買，保證獲利！', '加入老師的 VIP 群組，免費報明牌！',
        '穩賺不賠，錯過可惜！', '先匯一點保證金，老師幫你操作！', '這檔飆股，老師只告訴你一個人！'),
    },
    /** 回嘴 */
    reply: {
      cat: [
        ...allan('lecture', '不付贖金，我們有離線備份。', '異常加密行為，端點防護已經攔截。', '可疑附件先別開，這是常識。', '網路分段做好，你橫向移動不了。'),
        ...arale('laugh', '勒索喵不要囂張，阿拉蕾的備份每天都有跑！'),
      ],
      guru: [
        ...allan('lecture', '保證獲利就是詐騙，請撥 165。', '投資一定有風險，群組報明牌不能信。', '先查證，再匯款，有疑問就打 165。'),
        ...allan('wink', '老師？我看是詐騙集團的老師。'),
        ...arale('explain', '阿拉蕾查過了，這種群組就是假投資詐騙！'),
      ],
    },
    pass: {
      allan: allan('think', '先觀察，持續監控。', '這輪我先過，風險接受。', '過。好的稽核員懂得等待。'),
      arale: arale('think', '阿拉蕾先過～', '這輪先觀察！'),
      cat: npc('cat', '先潛伏一下喵。', '過喵～'),
      guru: npc('guru', '老師先觀望。', '這檔先不追高。'),
    },
    /** 三家都過，拿回主導權 */
    lead: {
      allan: allan('smile', '大家都過，主導權回到我手上。', '好，換我發球。'),
      arale: arale('wink', '主導權回到阿拉蕾這邊囉！'),
      cat: npc('cat', '控制權到手，開始加密喵。'),
      guru: npc('guru', '盤勢由老師主導！'),
    },
    bomb: [
      [['arale', '警報警報！{who}發動{alias}！', 'surprise'], ['allan', '{who}出了{type}！這是重大資安事件！', 'gasp']],
    ],
    bombAllan: [
      [['allan', '{type}！這叫做先發制人！', 'laugh'], ['arale', '老師的{alias}好強！', 'cheer']],
    ],
    two: [
      [['arale', '{who}拿出老二了！最高權限！', 'surprise']],
      [['allan', '{who}的 2 出來了，大牌要開始算了。', 'think']],
    ],
    lastCard: {
      allan: [[['allan', '報牌！我只剩最後一張了！', 'wink'], ['arale', '老師快到台北 101 了！', 'cheer']]],
      other: [
        [['arale', '警報！{who}只剩最後一張了！不要再出小單張給他！', 'surprise']],
        [['allan', '{who}剩一張了，大家注意，要用大牌擋住！', 'gasp']],
      ],
    },
    roundEnd: {
      allan: [
        [['allan', '回到台北 101！這局稽核結果：完全符合，零缺失！', 'laugh'], ['arale', '老師好棒！台灣尚勇！', 'cheer']],
        [['allan', '環島成功！資安認證，到手！', 'laugh'], ['arale', '阿拉蕾幫老師蓋好紀念章了！', 'cheer']],
      ],
      arale: [[['arale', '耶！阿拉蕾第一個環島完成！', 'cheer'], ['allan', '青出於藍，AI 小助手要升級成 AI 稽核員了。', 'smile']]],
      cat: [[['cat', '哈哈哈，台灣被我加密一圈了喵！', null], ['allan', '沒關係，我們有離線備份，下一局還原回來。', 'confused'], ['arale', '嗚嗚，阿拉蕾下一局要加強端點防護！', 'cry']]],
      guru: [[['guru', '看吧！跟著老師就是穩賺！', null], ['allan', '這局他贏了，但記得：投資一定有風險。', 'confused'], ['arale', '大家不要加入陌生的投資群組喔！', 'explain']]],
    },
    allanStuck: [
      [['allan', '我還剩好多牌……這是一項主要不符合事項。', 'cry'], ['arale', '老師別哭，矯正措施阿拉蕾幫你寫好了！', 'cheer']],
    ],
    gameOver: {
      allan: [[['allan', '總成績第一名！Allan 的資安大老二，正式取得環島認證！', 'laugh'], ['arale', '恭喜老師！Team Taiwan 第一名！', 'cheer']]],
      arale: [[['arale', '總冠軍是阿拉蕾！老師教得好！', 'cheer'], ['allan', '很好，我的 AI 小助手已經可以獨當一面了。', 'smile']]],
      villain: [[['allan', '總冠軍被{who}拿走了……我們要檢討控制措施的有效性。', 'confused'], ['arale', '老師，再環島一次！這次阿拉蕾一定會保護你！', 'cheer']]],
    },
    idle: [
      [['arale', '老師，想好了嗎？不確定的話可以按「問阿拉蕾」喔～', 'explain']],
      [['arale', '老師在做風險評鑑嗎？阿拉蕾等你～', 'think']],
    ],
    invalid: {
      empty: arale('think', '老師還沒選牌喔～'),
      shape: arale('confused', '嗶嗶！這組不是合法牌型喔～'),
      three: arale('explain', '第一手要包含梅花 3 喔！'),
      size: arale('explain', '張數不對喔！要出跟桌上一樣張數的牌型。'),
      low: arale('confused', '這組壓不過桌上的牌啦～'),
      lead: arale('explain', '現在老師有主導權，不能過喔，挑一組出吧！'),
    },
    /** 「問阿拉蕾」：{advice} 換成 HINT_ADVICE 其中一句，{why} 換成 AI.WHY 的理由 */
    hint: ['arale', '阿拉蕾分析中……嗶嗶！{advice}{why}', 'explain'],
    voiceTest: {
      allan: [['allan', '大家好，我是 Allan，Team Taiwan 資安顧問。今天一起打大老二、環島台灣！', 'smile']],
      arale: [['arale', '哇嗚～我是阿拉蕾，今天也要幫老師導航環島喔！', 'cheer']],
    },
    voiceOn: [['arale', '語音開啟囉！', 'cheer']],
  };

  /** 「問阿拉蕾」的建議句 */
  const HINT_ADVICE = { pass: '建議這輪先過。' };
  for (const [k, t] of Object.entries({ single: '單張', pair: '對子', straight: '順子', fullhouse: '葫蘆', four: '鐵支', straightflush: '同花順' })) {
    HINT_ADVICE[k] = `建議出${t}。`;
  }

  root.CAST = CAST;
  root.LINES = L;
  root.HINT_ADVICE = HINT_ADVICE;
})(typeof window !== 'undefined' ? window : globalThis);
