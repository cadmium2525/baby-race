import './styles.css';
import { GameWorld } from './world';
import { GameAudio } from './audio';
import { createRace, startRace, updateRace, moveRattle, ringRattle, useSuper, getProgress, rankBabies, STATE_LABELS, TIME_LIMIT, type Mode } from './simulation';

const rattleIcon = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m18 23-8 10" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="25" cy="14" r="11" fill="currentColor"/><path d="m17 10 16 7" stroke="#fff9eb" stroke-width="4"/><circle cx="24" cy="8" r="2" fill="#fff9eb"/></svg>`;
const soundIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="タイトルに戻る"><span class="brand-icon">${rattleIcon}</span><span class="brand-copy"><strong>ガラガラ！</strong><small>ハイハイレース</small></span></a>
    <div class="top-actions"><button id="sound-button" class="icon-button sound-button" aria-label="音をオフにする" aria-pressed="false">${soundIcon}</button><button id="help-button" class="icon-button help-button" aria-label="あそびかた">?</button><button id="pause-button" class="icon-button" aria-label="一時停止" hidden>Ⅱ</button></div>
  </header>
  <div class="course-badge"><span class="course-dot"></span> はじめてのプレイマット <small>01</small></div>
  <div class="race-hud"><span class="timer-label">のこり</span><strong id="timer" class="timer-value">60</strong><span class="timer-unit">秒</span><div class="timer-track"><i id="timer-fill"></i></div></div>
  <div id="event-banner" class="event-banner" role="status" aria-live="polite"></div>
  <div id="baby-labels" class="labels-overlay" aria-hidden="true"><div id="label-0" class="baby-label"><span class="player-tag">1P · あなた</span><span id="status-0" class="baby-status">ごきげん</span></div><div id="label-1" class="baby-label cpu"><span class="player-tag">CPU · ぷくぷく</span><span id="status-1" class="baby-status">ごきげん</span></div><div id="rattle-hint" class="rattle-hint">ここでシャカシャカ！</div></div>
  <div class="bottom-hud">
    <div class="player-card"><div class="player-avatar">1<span>P</span></div><div class="player-details"><div class="player-name">あなたのベビー <span id="rank">1位</span></div><div class="mood-track"><i id="mood-fill"></i></div><div id="mood-caption" class="progress-caption">いいペースで鳴らそう♪</div></div></div>
    <div class="race-progress"><span>START</span><div class="progress-line"><i id="progress-0" class="progress-dot">1</i><i id="progress-1" class="progress-dot cpu">2</i></div><span>GOAL ⚑</span></div>
    <button id="super-button" class="super-button"><span class="keycap">R</span><span class="super-copy"><strong>スーパーガラガラ</strong><small>ここぞの1回！</small></span><span class="super-star">✦</span></button>
  </div>
  <div id="controls-hint" class="controls-hint"><span>マウスで移動</span><b>·</b><span>クリック / <kbd>SPACE</kbd> で鳴らす</span><b>·</b><span><kbd>W A S D</kbd> でも移動</span></div>
  <button id="mobile-ring" class="mobile-ring" aria-label="ガラガラを鳴らす">${rattleIcon}<span>鳴らす！</span></button>
  <section id="menu" class="menu-overlay" aria-label="タイトルメニュー">
    <div class="menu-content"><div class="eyebrow"><span></span> BABY'S FIRST GRAND PRIX</div><h1><span class="title-top">ガラガラ！<i>✦</i></span><span class="title-bottom">ハイハイレース</span></h1><div class="title-decoration"><span></span><i>●</i><i>●</i><i>●</i></div>
    <p class="intro-copy">お願い！ そっちじゃないって！！<br><span>ガラガラひとつで、気まぐれベビーをゴールへ。<br>かわいくて、ちょっとおかしな60秒。</span></p>
    <div class="mode-selector" role="group" aria-label="レースのモード"><button class="mode-option active" data-mode="normal" aria-pressed="true"><span class="mode-icon">☀</span><span class="mode-name">ひとりでレース</span><span class="mode-description">まずはここから</span></button><button class="mode-option" data-mode="chaos" aria-pressed="false"><span class="mode-icon">✦</span><span class="mode-name">ハプニング大盛り</span><span class="mode-description">まさかの連続！</span></button><button class="mode-option" data-mode="skill" aria-pressed="false"><span class="mode-icon">⚑</span><span class="mode-name">ガチハイハイ</span><span class="mode-description">誘導の腕だめし</span></button></div>
    <button id="start-button" class="primary-button">レースをはじめる <span class="arrow">↗</span></button><p class="menu-note">1 PLAYER vs CPU <span>·</span> 1 RACE / 60 SEC</p>
    <div class="menu-controls"><div class="control-item"><span class="keycap">↖</span><span>ガラガラを動かす</span></div><div class="control-item"><span class="keycap">SPACE</span><span>シャカシャカ鳴らす</span></div></div></div>
    <div class="menu-scene-tag"><span class="tiny-star">✦</span><span>READY, BABY?<small>速いだけじゃ、勝てない。</small></span></div>
    <footer class="menu-footer"><span class="version">PLAYABLE PROTOTYPE <b>ver. 1.0</b></span><span class="engine-tag">ちいさなレース、おおきなハプニング。 <i>✳</i></span></footer>
  </section>
  <div id="countdown" class="countdown-overlay" hidden><span class="countdown-number" id="countdown-number">3</span><small>ガラガラの準備はいい？</small></div>
  <section id="pause" class="dialog-overlay" hidden aria-label="一時停止"><div class="dialog-card"><span class="eyebrow">TAKE A LITTLE BREAK</span><h2>ちょっと、ひとやすみ。</h2><p>ベビーもあなたを待っています。</p><button id="resume-button" class="primary-button">レースにもどる ↗</button><button id="return-button" class="secondary-button">タイトルにもどる</button></div></section>
  <section id="help" class="dialog-overlay" hidden aria-label="あそびかた"><div class="dialog-card"><span class="eyebrow">HOW TO PLAY</span><h2>主役は、ガラガラ。</h2><div class="help-step"><b>01</b><p><strong>ベビーの少し前へ</strong><br>マウス・ドラッグ・矢印 / WASDで移動。<br>スティックでも動かせます。</p></div><div class="help-step"><b>02</b><p><strong>いいリズムでシャカシャカ！</strong><br>クリック・Space・ゲームパッドのAで鳴らす。<br>1秒に1回くらい。連打すると飽きちゃう！</p></div><div class="help-step"><b>03</b><p><strong>とっておきは、1回だけ</strong><br>R・画面のボタン・ゲームパッドのRBで<br>スーパーガラガラ。寄り道から呼び戻そう！</p></div><p class="help-footnote">60秒でゴールへ！ 時間切れは進行度で判定。<br>大盛りモードなら「たっち覚醒」に出会いやすい！</p><button id="help-close" class="primary-button">わかった！ ↗</button></div></section>
  <section id="result" class="dialog-overlay" hidden aria-label="レース結果"><div class="dialog-card result-card"><div class="result-eyebrow">FINISH! NICE RACE!</div><div class="result-trophy">⚑</div><h2 id="result-title"></h2><p id="result-subtitle"></p><div id="result-stats" class="result-stats"></div><button id="retry-button" class="primary-button">もう1回、ハイハイ！ ↗</button><button id="result-menu" class="secondary-button">タイトルにもどる</button></div></section>
  <div id="webgl-error" class="dialog-overlay" hidden><div class="dialog-card"><h2>3D画面を開けませんでした</h2><p>WebGLが使えるブラウザーで開いてください。<br>ブラウザーのハードウェアアクセラレーションを<br>有効にして再読み込みすると改善する場合があります。</p><button id="reload-button" class="primary-button">再読み込み</button></div></div>
`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let selectedMode: Mode = 'normal';
let race = createRace(selectedMode);
let world: GameWorld;
const audio = new GameAudio();
let paused = false, helpWasPaused = false, lastEvent = -1, lastPhase = race.phase, bannerUntil = 0, bannerPriority = -1, finishHandled = false;
let lastTime = performance.now(), elapsed = 0, lastCountdown = 4, lastRingTime = -1;
const keys = new Set<string>();
let gamepadRingHeld = false, gamepadSuperHeld = false;

try { world = new GameWorld(app); } catch (error) {
  console.error('WebGL initialization failed', error); el('webgl-error').hidden = false;
}

function syncPhase() {
  document.body.dataset.phase = race.phase;
  el('menu').hidden = race.phase !== 'ready';
  el('countdown').hidden = race.phase !== 'countdown';
  el('pause-button').hidden = !['racing', 'countdown'].includes(race.phase);
  el('mobile-ring').style.visibility = race.phase === 'racing' ? 'visible' : 'hidden';
}
function begin() {
  if (!world) return;
  audio.unlock(); race = createRace(selectedMode, Date.now()); startRace(race);
  paused = false; lastEvent = -1; finishHandled = false; lastCountdown = 4;
  bannerUntil = 0; bannerPriority = -1; el('event-banner').classList.remove('visible'); el('rattle-hint').hidden = false;
  ['pause', 'result', 'help'].forEach(id => el(id).hidden = true);
  syncPhase(); (document.activeElement as HTMLElement)?.blur();
}
function showMenu() {
  race = createRace(selectedMode); paused = false; keys.clear();
  ['pause', 'result', 'help'].forEach(id => el(id).hidden = true);
  el('event-banner').classList.remove('visible'); syncPhase(); el('start-button').focus();
}
function ring() {
  if (paused || race.phase !== 'racing' || elapsed - lastRingTime < .1) return;
  lastRingTime = elapsed; audio.unlock(); ringRattle(race); audio.ring();
  el('rattle-hint').hidden = true;
}
function superRing() {
  if (paused || race.phase !== 'racing' || race.babies[0].superUsed) return;
  audio.unlock(); useSuper(race); audio.ring(true);
}
function togglePause() {
  if (!['racing', 'countdown'].includes(race.phase) || !el('help').hidden) return;
  paused = !paused; keys.clear(); el('pause').hidden = !paused;
  if (paused) el('resume-button').focus();
}
function showHelp() {
  helpWasPaused = paused; paused = true; keys.clear(); el('help').hidden = false; el('help-close').focus();
}
function closeHelp() { el('help').hidden = true; paused = helpWasPaused; }

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
  selectedMode = btn.dataset.mode as Mode;
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
  race = createRace(selectedMode);
}));
el('start-button').addEventListener('click', begin); el('retry-button').addEventListener('click', begin);
el('return-button').addEventListener('click', showMenu); el('result-menu').addEventListener('click', showMenu);
el('resume-button').addEventListener('click', togglePause); el('pause-button').addEventListener('click', togglePause);
el('help-button').addEventListener('click', showHelp); el('help-close').addEventListener('click', closeHelp);
el('super-button').addEventListener('click', superRing); el('mobile-ring').addEventListener('pointerdown', e => { e.preventDefault(); ring(); });
el('reload-button').addEventListener('click', () => location.reload());
el('sound-button').addEventListener('click', () => {
  const enabled = audio.toggle(); el('sound-button').classList.toggle('muted', !enabled);
  el('sound-button').setAttribute('aria-pressed', String(!enabled)); el('sound-button').setAttribute('aria-label', enabled ? '音をオフにする' : '音をオンにする');
});
document.querySelector('.brand')!.addEventListener('click', e => { e.preventDefault(); if (race.phase === 'ready' || race.phase === 'finished') showMenu(); else togglePause(); });

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!el('help').hidden) closeHelp(); else togglePause(); return; }
  if (paused || race.phase === 'ready' || race.phase === 'finished') return;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase()); if (e.repeat) return;
  if (e.code === 'Space') ring(); if (e.code === 'KeyR') superRing();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); if (!paused && ['racing', 'countdown'].includes(race.phase)) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !paused && ['racing', 'countdown'].includes(race.phase)) togglePause(); });
window.addEventListener('resize', () => world?.resize());

if (world!) {
  const canvas = world.renderer.domElement;
  let dragging = false;
  const movePointer = (e: PointerEvent) => {
    if (paused || race.phase !== 'racing' || (e.pointerType === 'touch' && !dragging)) return;
    const p = world.worldPoint(e.clientX, e.clientY); if (p) moveRattle(race, p.x, p.z);
  };
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || paused || race.phase !== 'racing') return;
    dragging = true; canvas.setPointerCapture(e.pointerId); movePointer(e); ring(); e.preventDefault();
  });
  const release = () => dragging = false;
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); paused = true; el('webgl-error').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => { el('webgl-error').hidden = true; paused = false; });
}

function updateInput(dt: number) {
  if (paused || race.phase !== 'racing') return;
  let dx = 0, dz = 0;
  if (keys.has('w') || keys.has('arrowup')) dz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dz += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  const gamepad = navigator.getGamepads?.().find(p => p?.connected);
  if (gamepad) {
    dx += Math.abs(gamepad.axes[0] ?? 0) > .16 ? gamepad.axes[0] : 0;
    dz += Math.abs(gamepad.axes[1] ?? 0) > .16 ? gamepad.axes[1] : 0;
    const ringPressed = !!gamepad.buttons[0]?.pressed;
    const superPressed = !!gamepad.buttons[5]?.pressed;
    if (ringPressed && !gamepadRingHeld) ring(); if (superPressed && !gamepadSuperHeld) superRing();
    gamepadRingHeld = ringPressed; gamepadSuperHeld = superPressed;
  }
  const length = Math.hypot(dx, dz);
  if (length > 0) {
    const r = race.rattles[0]; const speed = 7 * dt / Math.max(1, length);
    moveRattle(race, r.x + dx * speed, r.z + dz * speed);
  }
}

function finish() {
  finishHandled = true; audio.cue('finish');
  const ranking = rankBabies(race); const won = race.winner === 0;
  el('result-title').textContent = won ? 'やったね！ 1位！' : 'ナイス、ハイハイ！';
  el('result-subtitle').textContent = won ? '寄り道も、ぜんぶいい思い出。' : '気まぐれベビー、次こそゴールへ！';
  el('result-stats').innerHTML = ranking.map((baby, i) => `<div class="result-row"><span class="result-place">${i + 1}<small>位</small></span><strong>${baby.id === 0 ? '1P · あなた' : 'CPU · ぷくぷく'}</strong><span>${baby.finishedAt !== null ? `${baby.finishedAt.toFixed(1)} 秒` : `${Math.floor(getProgress(baby) * 100)} %`}</span></div>`).join('');
  el('result').hidden = false; el('retry-button').focus();
  if (world) { const b = race.babies[race.winner ?? 0]; world.confetti(b.x, b.z, 100); }
}
function updateUI() {
  if (race.phase !== lastPhase) { if (race.phase === 'racing') audio.cue('start'); syncPhase(); lastPhase = race.phase; }
  if (race.phase === 'countdown') {
    const num = Math.ceil(race.countdown); el('countdown-number').textContent = String(Math.max(1, num));
    if (num !== lastCountdown) { audio.cue('tick'); lastCountdown = num; }
  }
  el('timer').textContent = String(Math.ceil(Math.max(0, TIME_LIMIT - race.time))).padStart(2, '0');
  el('timer-fill').style.width = `${Math.max(0, 1 - race.time / TIME_LIMIT) * 100}%`;
  el('timer').classList.toggle('urgent', race.time > 50);
  const ranking = rankBabies(race); el('rank').textContent = `${ranking.findIndex(b => b.id === 0) + 1}位`;
  const baby = race.babies[0];
  el('mood-fill').style.width = `${Math.min(100, Math.max(0, baby.mood * 100))}%`;
  el('mood-caption').textContent = baby.boredom > .6 ? '鳴らしすぎ！ 少し待ってみよう' : baby.state === 'distracted' ? 'おもちゃに夢中！ 近くで呼ぼう' : baby.state === 'rest' ? '近くで鳴らして、もうひとがんばり' : baby.attention < .2 ? 'ベビーの少し前で鳴らしてね' : 'いいリズム！ その調子♪';
  el<HTMLButtonElement>('super-button').disabled = baby.superUsed || race.phase !== 'racing';
  el('super-button').querySelector('small')!.textContent = baby.superUsed ? 'つかいきったよ！' : 'ここぞの1回！';
  const labelPositions = world ? world.babies.map(rig => world.screenPoint(rig.root.position.x, 2.6, rig.root.position.z)) : [];
  if (labelPositions.length === 2) {
    const [a, b] = labelPositions;
    if (Math.abs(a.x - b.x) < 112 && Math.abs(a.y - b.y) < 68) {
      const offset = (112 - Math.abs(a.x - b.x)) / 2 + 5;
      const direction = a.x <= b.x ? -1 : 1; a.x += offset * direction; b.x -= offset * direction;
    }
    labelPositions.forEach(p => p.x = Math.min(innerWidth - 60, Math.max(60, p.x)));
  }
  race.babies.forEach((b, i) => {
    el(`progress-${i}`).style.left = `${getProgress(b) * 100}%`;
    el(`status-${i}`).textContent = STATE_LABELS[b.state as keyof typeof STATE_LABELS] ?? b.state;
    el(`label-${i}`).classList.toggle('awakened', b.state === 'awakening');
    if (world) {
      const intro = race.phase === 'ready'; const pos = labelPositions[i];
      el(`label-${i}`).style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
      el(`label-${i}`).hidden = intro || race.phase === 'finished';
    }
  });
  if (world) { const r = race.rattles[0]; const p = world.screenPoint(r.x, 1.8, r.z); el('rattle-hint').style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`; }
  const priority = (kind: string) => kind === 'legendary' ? 3 : ['super', 'rare', 'finish'].includes(kind) ? 2 : kind === 'good' ? 0 : 1;
  const pending = race.events.filter(e => e.id > lastEvent).sort((a, b) => priority(b.kind) - priority(a.kind) || b.id - a.id);
  const event = pending[0];
  if (event) lastEvent = Math.max(...race.events.map(e => e.id));
  if (event && (elapsed >= bannerUntil || priority(event.kind) >= bannerPriority)) {
    bannerPriority = priority(event.kind);
    el('event-banner').textContent = ['start', 'finish'].includes(event.kind) ? event.text : `${event.babyId === 0 ? '1P' : 'CPU'}！ ${event.text}`;
    el('event-banner').classList.add('visible'); el('event-banner').classList.toggle('special', /legendary|super|rare/.test(event.kind));
    bannerUntil = elapsed + 3;
    if (event.kind === 'legendary' || event.text.includes('立っ') || event.text.includes('覚醒')) { audio.cue('awakening'); const b = race.babies[event.babyId]; if (b) world?.confetti(b.x, b.z, 22); }
    else if (event.text.includes('アヒル')) audio.cue('duck'); else if (event.text.includes('ペタン')) audio.cue('sit');
  }
  if (elapsed > bannerUntil) el('event-banner').classList.remove('visible');
  if (race.phase === 'finished' && !finishHandled) finish();
}

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, .1); lastTime = now;
  if (!paused) { elapsed += dt; updateInput(dt); updateRace(race, dt); }
  if (world) world.update(race, elapsed, paused ? 0 : dt);
  updateUI(); requestAnimationFrame(frame);
}
syncPhase(); requestAnimationFrame(frame);
window.addEventListener('pagehide', () => audio.dispose(), { once: true });

// Read-only diagnostics for reproducible browser checks; no gameplay mutations exposed.
Object.defineProperty(window, '__babyRace', { get: () => ({
  phase: race.phase, mode: race.mode, time: race.time, paused,
  babies: race.babies.map(b => ({id: b.id, x: b.x, z: b.z, state: b.state, progress: getProgress(b), superUsed: b.superUsed})),
  rattles: race.rattles.map(r => ({x: r.x, z: r.z, pulse: r.pulse})),
  winner: race.winner, events: race.events.map(e => ({text: e.text, kind: e.kind})),
}) });
