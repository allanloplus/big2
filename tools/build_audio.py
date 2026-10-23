#!/usr/bin/env python3
"""產生 Allan's 資安大老二的對白配音（Microsoft Edge 神經語音，台灣口音），聲線與課程影片、拱豬夜市相同。

用法：
    pip install edge-tts
    python3 tools/build_audio.py            # 只產生新增／修改過的台詞
    python3 tools/build_audio.py --force    # 全部重新產生

流程：用 Node 讀出 js/lines.js 的對白、js/stations.js 的導航播報、js/ai.js 的出牌理由
→ 展開 {n}/{who}/{type}/{alias} 等變數 → 逐句以 edge-tts 合成 mp3 到 assets/audio/ → 寫出 js/audio-manifest.js。
檔名取自「聲線設定＋台詞」的雜湊值，台詞沒改就不會重新合成。
找不到音檔的句子，遊戲會自動改用瀏覽器內建語音。
"""
import asyncio, hashlib, itertools, json, os, re, ssl, subprocess, sys
from pathlib import Path

import edge_tts
import edge_tts.communicate as _comm

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / 'assets' / 'audio'
MANIFEST = ROOT / 'js' / 'audio-manifest.js'

VOICES = {
    # Allan：台灣男聲（與 Cybersecurity_Promotion / ISO27001 課程、拱豬夜市相同）
    'allan': dict(voice='zh-TW-YunJheNeural', rate='+6%', pitch='-2Hz'),
    # 阿拉蕾：可愛女聲（提高音調、稍快，與課程助教相同）
    'arale': dict(voice='zh-TW-HsiaoYuNeural', rate='+10%', pitch='+28Hz'),
    # 勒索喵：慵懶、壓低的女聲
    'cat': dict(voice='zh-TW-HsiaoChenNeural', rate='-4%', pitch='-8Hz'),
    # 飆股老師：講很快的推銷男聲，比 Allan 低沉
    'guru': dict(voice='zh-TW-YunJheNeural', rate='+16%', pitch='-16Hz'),
}

ROUNDS = range(1, 6)   # {n}：最多 5 局

_ca = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if Path('/root/.ccr/ca-bundle.crt').exists() else None)
if _ca:
    _comm._SSL_CTX = ssl.create_default_context(cafile=_ca)
PROXY = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')

# 與 js/voice.js 的 SPOKEN 相同
SPOKEN = [
    (r'♠', '黑桃'), (r'♥', '紅心'), (r'♣', '梅花'), (r'♦', '方塊'),
    (r'～', ''), (r'101', '一零一'), (r'165', '一六五'), (r'3-2-1', '三二一'),
    (r'\b(PDCA|APT|VPN|SOC|OT|MFA|BCP|VIP|AI)\b', lambda m: ' '.join(m.group(0))),
]


def spoken(text):
    for pat, rep in SPOKEN:
        text = re.sub(pat, rep, text)
    return text


def sentences(text):
    """與 js/voice.js 的 sentences() 相同的斷句方式"""
    return [s.strip() for s in re.findall(r'[^。！？]+[。！？]?', text) if s.strip()]


def load_sources():
    js = r"""
require('./js/engine.js');
const B2 = require('./js/engine.js');
require('./js/lines.js');
require('./js/stations.js');
const AI = require('./js/ai.js');
console.log(JSON.stringify({ lines: LINES, cast: CAST, advice: HINT_ADVICE, stations: STATIONS, why: AI.WHY, types: B2.TYPES }));
"""
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT))


def collect():
    src = load_sources()
    L, cast = src['lines'], src['cast']
    names = {k: v['name'] for k, v in cast.items()}
    domains = {
        'n': [str(n) for n in ROUNDS],
        'who': [names[w] for w in ('cat', 'arale', 'guru')],
        'type': [(t['name'], t['alias']) for t in src['types'].values()],
    }
    jobs = set()

    def expand(who, text):
        keys = []
        if '{n}' in text: keys.append('n')
        if '{who}' in text: keys.append('who')
        if '{type}' in text or '{alias}' in text: keys.append('type')
        for combo in itertools.product(*(domains[k] for k in keys)):
            t = text
            for k, v in zip(keys, combo):
                if k == 'type':
                    t = t.replace('{type}', v[0]).replace('{alias}', v[1])
                else:
                    t = t.replace('{' + k + '}', v)
            if '{' not in t:
                jobs.add((who, t))

    def walk(node):
        if isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            if len(node) >= 2 and isinstance(node[0], str) and node[0] in VOICES and isinstance(node[1], str):
                expand(node[0], node[1])
            else:
                for x in node:
                    walk(x)

    hint = L.pop('hint')
    walk(L)
    for s in src['stations']:
        jobs.add(('arale', s['tip']))

    # 「問阿拉蕾」：阿拉蕾分析中……嗶嗶！{advice}{why} → 逐句拼接播放
    who, tpl = hint[0], hint[1]
    head = tpl.split('{advice}')[0]
    for s in sentences(head):
        jobs.add((who, s))
    for text in list(src['advice'].values()) + list(src['why'].values()):
        for s in sentences(text):
            jobs.add((who, s))
    return sorted(jobs)


def fname(who, text):
    key = hashlib.sha1(json.dumps([VOICES[who], spoken(text)], ensure_ascii=False).encode()).hexdigest()[:14]
    return f'{who}_{key}.mp3'


async def synth(who, text, path, retries=8):
    cfg = VOICES[who]
    for i in range(retries):
        try:
            await edge_tts.Communicate(spoken(text), cfg['voice'], rate=cfg['rate'], pitch=cfg['pitch'], proxy=PROXY).save(str(path) + '.tmp')
            if Path(str(path) + '.tmp').stat().st_size > 0:
                os.replace(str(path) + '.tmp', path)
                return
        except Exception as e:  # 網路不穩時重試
            print('  retry', i + 1, e)
        await asyncio.sleep(min(30, 2 ** (i + 1)))
    raise RuntimeError('TTS failed: ' + text)


async def main():
    force = '--force' in sys.argv
    AUDIO.mkdir(parents=True, exist_ok=True)
    jobs = collect()
    manifest, todo = {}, []
    for who, text in jobs:
        name = fname(who, text)
        manifest[f'{who}|{text}'] = f'assets/audio/{name}'
        path = AUDIO / name
        if force or not path.exists() or path.stat().st_size == 0:
            todo.append((who, text, path))
    print(f'{len(jobs)} 句，需要合成 {len(todo)} 句')
    sem = asyncio.Semaphore(4)

    async def one(job):
        async with sem:
            await synth(*job)
            print('  ✓', job[0], job[1])
    await asyncio.gather(*(one(j) for j in todo))

    keep = {Path(p).name for p in manifest.values()}
    for f in AUDIO.glob('*.mp3'):
        if f.name not in keep:
            f.unlink()
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/build_audio.py 產生，請勿手動修改。key = 說話者|台詞 */\n')
        f.write('window.AUDIO_MANIFEST = ')
        json.dump(manifest, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write(';\n')
    total = sum(f.stat().st_size for f in AUDIO.glob('*.mp3'))
    print(f'完成：{len(manifest)} 個音檔，共 {total / 1e6:.1f} MB')


if __name__ == '__main__':
    if '--list' in sys.argv:
        for who, text in collect():
            print(who, text)
    else:
        asyncio.run(main())
