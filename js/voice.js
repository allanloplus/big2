/* Allan's 資安大老二 — 語音（沿用拱豬夜市的聲線設定）
 * 1. 課程配音（預設）：tools/build_audio.py 用 edge-tts 預先合成的 mp3，聲線與課程影片相同
 *    Allan = zh-TW-YunJheNeural（+6%、-2Hz），阿拉蕾 = zh-TW-HsiaoYuNeural（+10%、+28Hz）
 *    整句沒有音檔時，會試著用逐句音檔拼接（例如「問阿拉蕾」的提示）。
 * 2. 瀏覽器語音（備援）：找不到音檔、或在「設定」改選其他聲線時，改用 Web Speech API。
 * 設定存在 localStorage。
 */
(function (root) {
  'use strict';
  const synth = root.speechSynthesis;
  const MANIFEST = root.AUDIO_MANIFEST || {};
  const HAS_RECORDED = Object.keys(MANIFEST).length > 0;
  const KEY = 'b2.voice.v1';

  const COURSE_VOICE = {
    allan: 'zh-TW-YunJheNeural（課程 Allan 聲線）',
    arale: 'zh-TW-HsiaoYuNeural（課程阿拉蕾聲線）',
  };

  const PREFER = {
    allan: [/YunJhe/i, /Zhiwei/i, /zh[-_]TW.*(male|男)/i, /Yun\w*.*Taiwan/i],
    arale: [/HsiaoYu/i, /HsiaoChen/i, /Yating/i, /Hanhan/i, /國語.*臺灣|國語.*台灣/, /Mei-?Jia/i, /zh[-_]TW/i],
    cat: [/HsiaoChen/i, /Hanhan/i, /Mei-?Jia/i, /Xiaoxiao/i, /Yating/i],
    guru: [/Zhiwei/i, /YunJhe/i, /Yunxi/i, /Yunyang/i],
  };
  // 瀏覽器語音：用音高/語速逼近課程聲線（YunJhe 原速、HsiaoYu 調高）
  const BROWSER_TUNE = {
    allan: { pitch: 0.95, rate: 1.05 },
    arale: { pitch: 1.35, rate: 1.1 },
    cat: { pitch: 0.9, rate: 0.95 },
    guru: { pitch: 0.75, rate: 1.15 },
  };

  let settings = { enabled: true, npc: true, volume: 1, voices: {}, tune: {} };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 無痕模式 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  const listeners = [];
  let voices = [];
  function loadVoices() {
    if (!synth) return [];
    voices = synth.getVoices().filter((v) => /^zh|cmn|yue/i.test(v.lang) || /Chinese|國語|中文/.test(v.name));
    return voices;
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = () => { loadVoices(); listeners.forEach((f) => f()); };
  }

  const isTW = (v) => /TW|Hant|Taiwan|臺灣|台灣/i.test(v.lang + ' ' + v.name);

  function pickVoice(who) {
    const chosen = settings.voices[who];
    if (chosen) {
      const v = voices.find((x) => x.name === chosen);
      if (v) return v;
    }
    for (const re of PREFER[who] || []) {
      const hits = voices.filter((v) => re.test(v.name) || re.test(v.lang));
      const v = hits.find(isTW) || hits[0];
      if (v) return v;
    }
    return voices.find(isTW) || voices[0] || null;
  }

  /** recorded = 用課程配音；browser = 使用者在設定改選了瀏覽器聲線 */
  const mode = (who) => (HAS_RECORDED && !settings.voices[who] ? 'recorded' : 'browser');

  function tuneFor(who) {
    const t = settings.tune[who] || {};
    if (mode(who) === 'recorded') return { pitch: null, rate: t.speed != null ? t.speed : 1 };
    const base = BROWSER_TUNE[who] || { pitch: 1, rate: 1 };
    return { pitch: t.pitch != null ? t.pitch : base.pitch, rate: t.rate != null ? t.rate : base.rate };
  }

  /** 跟 tools/build_audio.py 的 sentences() 相同的斷句 */
  const sentences = (text) => (text.match(/[^。！？]+[。！？]?/g) || []).map((s) => s.trim()).filter(Boolean);

  function clipsFor(who, text) {
    const whole = MANIFEST[who + '|' + text];
    if (whole) return [whole];
    const parts = sentences(text);
    if (parts.length > 1 && parts.every((p) => MANIFEST[who + '|' + p])) return parts.map((p) => MANIFEST[who + '|' + p]);
    return null;
  }

  // ---------- 播放 ----------
  const audio = typeof Audio !== 'undefined' ? new Audio() : null;
  if (audio) audio.preload = 'auto';

  function playClip(src, rate) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const end = (ok) => {
        if (settled) return;
        settled = true;
        audio.onended = audio.onerror = null;
        ok ? resolve() : reject(new Error('audio'));
      };
      audio.onended = () => end(true);
      audio.onerror = () => end(false);
      audio.src = src;
      audio.muted = false;
      audio.volume = settings.volume;
      audio.playbackRate = rate;
      if ('preservesPitch' in audio) audio.preservesPitch = true;
      const p = audio.play();
      if (p && p.catch) p.catch(() => end(false));
    });
  }

  /** 跟 tools/build_audio.py 的 SPOKEN 相同：讓語音念對縮寫和數字 */
  const SPOKEN = [
    [/[♠♥♣♦]/g, (s) => ({ '♠': '黑桃', '♥': '紅心', '♣': '梅花', '♦': '方塊' }[s])],
    [/～/g, ''], [/101/g, '一零一'], [/165/g, '一六五'], [/3-2-1/g, '三二一'],
    [/\b(PDCA|APT|VPN|SOC|OT|MFA|BCP|VIP|AI)\b/g, (s) => s.split('').join(' ')],
  ];
  function clean(text) {
    return SPOKEN.reduce((t, [re, to]) => t.replace(re, to), text);
  }

  function browserSay(job) {
    return new Promise((resolve) => {
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(clean(job.text));
      const v = pickVoice(job.who);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-TW';
      const t = tuneFor(job.who);
      u.pitch = t.pitch; u.rate = t.rate; u.volume = settings.volume;
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      u.onend = fin; u.onerror = fin;
      synth.speak(u);
      // 有些瀏覽器不會觸發 onend，保險起見
      setTimeout(() => { if (!synth.speaking) fin(); }, 400 + job.text.length * 260);
    });
  }

  // 依序播放，避免台詞互相打斷；排太多就丟掉最舊的
  const queue = [];
  let speaking = false;
  let stopGen = 0;

  async function pump() {
    if (speaking || !queue.length) return;
    const job = queue.shift();
    speaking = true;
    const gen = stopGen;
    const clips = mode(job.who) === 'recorded' && audio ? clipsFor(job.who, job.text) : null;
    try {
      if (clips) {
        for (const c of clips) {
          if (gen !== stopGen) break;
          await playClip(c, tuneFor(job.who).rate);
        }
      } else {
        await browserSay(job);
      }
    } catch (e) {
      // 自動播放被擋或音檔讀不到 → 改用瀏覽器語音念這一句
      if (gen === stopGen) await browserSay(job);
    }
    job.resolve();
    if (gen === stopGen) { speaking = false; setTimeout(pump, 120); }
  }

  function speak(who, text, opts = {}) {
    if (!settings.enabled && !opts.force) return Promise.resolve();
    if ((who === 'cat' || who === 'guru') && !settings.npc && !opts.force) return Promise.resolve();
    if (opts.interrupt) stop();
    while (queue.length > 3) queue.shift().resolve();
    return new Promise((resolve) => { queue.push({ who, text, resolve }); pump(); });
  }

  function stop() {
    stopGen++;
    while (queue.length) queue.shift().resolve();
    if (synth) synth.cancel();
    if (audio) { audio.pause(); if (audio.onended) audio.onended(); }
    speaking = false;
  }

  /** 行動裝置要在使用者點擊時先播一次，之後才能自動播放 */
  function unlock() {
    if (audio && HAS_RECORDED && !speaking) {
      const src = MANIFEST[Object.keys(MANIFEST)[0]];
      audio.muted = true;
      audio.src = src;
      const p = audio.play();
      // 只停掉這次的靜音試播；如果台詞已經開始播，就不要動它
      const back = () => { if (audio.muted && audio.src.endsWith(src)) audio.pause(); audio.muted = false; };
      if (p && p.then) p.then(back, back); else back();
    }
    try { if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } } catch (e) { /* ignore */ }
  }

  const Voice = {
    supported: HAS_RECORDED || !!synth,
    hasRecorded: HAS_RECORDED,
    browserSupported: !!synth,
    COURSE_VOICE,
    get settings() { return settings; },
    set(patch) { Object.assign(settings, patch); save(); if (!settings.enabled) stop(); },
    setVoice(who, name) { settings.voices[who] = name || undefined; save(); },
    setTune(who, tune) { settings.tune[who] = Object.assign({}, settings.tune[who], tune); save(); },
    mode, tuneFor, pickVoice,
    list() { return loadVoices(); },
    onChange(f) { listeners.push(f); },
    speak, stop, unlock,
    get busy() { return speaking || queue.length > 0; },
  };
  root.Voice = Voice;
})(window);
