import './styles.css';
import { GameWorld } from './world';
import { GameAudio } from './audio';
import { createRace, startRace, updateRace, moveRattle, ringRattle, useSuper, getProgress, rankBabies, TIME_LIMIT, type Mode, type Baby } from './simulation';
import { ACCESSORIES, ACCESSORY_LABELS, COURSES, DEFAULT_STYLES, EVENTS, ZONE_LABELS, getCourse, getEvent, type EventId } from './content';
import { loadPreferences, savePreferences, loadRecords, saveRecords } from './preferences';
import { CinematicDirector, type CinematicFrame } from './cinematic';

const rattleIcon = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m18 23-8 10" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="25" cy="14" r="11" fill="currentColor"/><path d="m17 10 16 7" stroke="#fff9eb" stroke-width="4"/></svg>`;
const esc = (text: string) => text.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const app = document.querySelector<HTMLDivElement>('#app')!;
const preferences = loadPreferences();
const records = loadRecords();
app.innerHTML = `
  <header class="topbar"><a class="brand" href="#" aria-label="タイトルに戻る"><span class="brand-icon">${rattleIcon}</span><span class="brand-copy"><strong>ガラガラ！</strong><small>ハイハイレース</small></span></a><div class="top-actions"><button id="commentary-button" class="icon-button" aria-label="実況をオンにする" aria-pressed="false">♫</button><button id="sound-button" class="icon-button" aria-label="音をオフにする" aria-pressed="false">♪</button><button id="help-button" class="icon-button help-button" aria-label="あそびかた">?</button><button id="pause-button" class="icon-button" aria-label="一時停止" hidden>Ⅱ</button></div></header>
  <div class="course-badge"><span id="course-name"></span><small id="course-number"></small></div>
  <div class="race-hud"><span class="timer-label">のこり</span><strong id="timer" class="timer-value">60</strong><span class="timer-unit">秒</span><div class="timer-track"><i id="timer-fill"></i></div></div>
  <div id="event-banner" class="event-banner" role="status" aria-live="polite"></div>
  <section id="cinematic" class="cinematic-overlay" hidden aria-label="ハプニング演出" role="status"><div class="cinematic-heading"><span id="cinematic-rarity">RARE HAPPENING!</span><small>Ⅱ レースは一時停止中</small></div><div class="cinematic-copy"><span id="cinematic-player"></span><h2 id="cinematic-title"></h2><p id="cinematic-description"></p></div><button id="cinematic-skip" class="cinematic-skip">演出をスキップ <span>↗</span></button><div class="cinematic-track"><i id="cinematic-fill"></i></div></section>
  <div id="baby-labels" class="labels-overlay" aria-hidden="true">${[0,1,2,3].map(i=>`<span id="label-${i}" class="mood-marker"></span>`).join('')}<div id="rattle-hint" class="rattle-hint">少し前でシャカシャカ！</div></div>
  <div class="bottom-hud"><div class="player-card"><div id="player-avatar" class="player-avatar">1<span>P</span></div><div class="player-details"><div class="player-name"><label for="control-player" class="sr-only">マウス・タッチで操作するプレイヤー</label><select id="control-player" aria-label="操作するプレイヤー"></select><span id="rank">1位</span></div><div class="mood-track"><i id="mood-fill"></i></div><div id="mood-caption" class="progress-caption">いいペースで鳴らそう♪</div></div></div>
  <div class="race-progress"><span>START</span><div class="progress-line">${[0,1,2,3].map(i=>`<i id="progress-${i}" class="progress-dot">${i+1}</i>`).join('')}</div><span>GOAL ⚑</span></div>
  <button id="super-button" class="super-button"><span class="keycap">R</span><span class="super-copy"><strong>スーパーガラガラ</strong><small>ここぞの1回！</small></span><span class="super-star">✦</span></button></div>
  <div id="controls-hint" class="controls-hint"></div><button id="mobile-ring" class="mobile-ring" aria-label="ガラガラを鳴らす">${rattleIcon}<span>鳴らす！</span></button>
  <section id="menu" class="menu-overlay" aria-label="タイトルメニュー"><div class="menu-content"><div class="eyebrow">BABY'S FIRST GRAND PRIX</div><h1><span class="title-top">ガラガラ！<i>✦</i></span><span class="title-bottom">ハイハイレース</span></h1><div class="title-decoration"><span></span><i>●</i><i>●</i><i>●</i></div><p class="intro-copy">お願い！ そっちじゃないって！！<br><span>4体の気まぐれベビーが繰り広げる60秒。</span></p>
  <div class="mode-selector" role="group" aria-label="レースのモード"><button class="mode-option" data-mode="normal"><span class="mode-icon">☀</span><span class="mode-name" id="normal-mode-name">ひとりでレース</span><span class="mode-description">まずはここから</span></button><button class="mode-option" data-mode="chaos"><span class="mode-icon">✦</span><span class="mode-name">ハプニング大盛り</span><span class="mode-description">まさかの連続！</span></button><button class="mode-option" data-mode="skill"><span class="mode-icon">⚑</span><span class="mode-name">ガチハイハイ</span><span class="mode-description">誘導の腕だめし</span></button></div>
  <button id="setup-button" class="setup-summary"><span id="setup-summary"></span><b>準備する ↗</b></button><button id="start-button" class="primary-button">レースをはじめる <span class="arrow">↗</span></button><p class="menu-note" id="menu-note"></p><div class="menu-links"><button id="catalog-button">ハプニングずかん <span id="catalog-count">0 / ${EVENTS.length}</span></button><span id="record-summary"></span></div></div><div class="menu-scene-tag"><span class="tiny-star">✦</span><span>READY, BABY?<small>速いだけじゃ、勝てない。</small></span></div><footer class="menu-footer"><span class="version">BABY RACE <b>ver. 2.4</b></span><span class="engine-tag">ちいさなレース、おおきなハプニング。</span></footer></section>
  <section id="setup" class="dialog-overlay" hidden aria-label="レースの準備"><div class="dialog-card setup-card"><div class="dialog-heading"><div><span class="eyebrow">GET READY</span><h2>みんなのレースをつくろう。</h2></div><button id="setup-close-x" class="icon-button" aria-label="準備を閉じる">×</button></div>
  <div class="setup-section"><label for="human-players">あそぶ人数</label><select id="human-players"><option value="1">ひとり ＋ CPU 3体</option><option value="2">ふたり ＋ CPU 2体</option><option value="3">3人 ＋ CPU 1体</option><option value="4">4人で対戦</option></select><p class="setup-note">同じ端末で対戦。キーボード・最大4台のゲームパッドに対応。</p></div>
  <div class="setup-section"><h3>コースをえらぶ</h3><div class="course-options">${COURSES.map((course,i)=>`<button class="course-option" data-course="${course.id}" style="--course-color:#${course.palette[0].toString(16)}"><span>COURSE 0${i+1}</span><strong>${course.name}</strong><small>${course.description}</small></button>`).join('')}</div></div>
  <div class="setup-section"><h3>ベビーのおめかし</h3><div class="custom-tabs" role="group" aria-label="おめかしするベビー">${[0,1,2,3].map(i=>`<button data-custom-player="${i}">${i+1}P</button>`).join('')}</div><div class="custom-fields"><label>なまえ<input id="baby-name" maxlength="12" autocomplete="off"></label><label>おようふく<input id="baby-color" type="color"></label><label>アクセサリー<select id="baby-accessory">${ACCESSORIES.map(a=>`<option value="${a}">${ACCESSORY_LABELS[a]}</option>`).join('')}</select></label></div><p class="setup-note">CPUのベビーもおめかしできます。設定とずかんはこの端末に保存。</p></div>
  <details class="keyboard-guide"><summary>みんなで遊ぶときの操作を見る</summary><div class="key-grid"><span>1P</span><span>WASD ／ Spaceで鳴らす ／ Rでスーパー</span><span>2P</span><span>矢印 ／ Enterで鳴らす ／ 右Shiftでスーパー</span><span>3P</span><span>IJKL ／ Oで鳴らす ／ Uでスーパー</span><span>4P</span><span>テンキー8456 ／ 0で鳴らす ／ .でスーパー</span></div><p>ゲームパッドは接続順に1P〜4P。左スティック・A・RBで操作。マウス・タッチは画面下で操作するプレイヤーを切り替えられます。</p></details><button id="setup-close" class="primary-button">準備OK！ ↗</button></div></section>
  <section id="catalog" class="dialog-overlay" hidden aria-label="ハプニングずかん"><div class="dialog-card catalog-card"><div class="dialog-heading"><div><span class="eyebrow">LITTLE BIG HAPPENINGS</span><h2>ハプニングずかん</h2><p id="catalog-progress"></p></div><button id="catalog-close" class="icon-button" aria-label="ずかんを閉じる">×</button></div><div id="catalog-list"></div></div></section>
  <div id="countdown" class="countdown-overlay" hidden><span class="countdown-number" id="countdown-number">3</span><small>ガラガラの準備はいい？</small></div>
  <section id="pause" class="dialog-overlay" hidden aria-label="一時停止"><div class="dialog-card"><span class="eyebrow">TAKE A LITTLE BREAK</span><h2>ちょっと、ひとやすみ。</h2><p>ベビーもあなたを待っています。</p><button id="resume-button" class="primary-button">レースにもどる ↗</button><button id="return-button" class="secondary-button">タイトルにもどる</button></div></section>
  <section id="help" class="dialog-overlay" hidden aria-label="あそびかた"><div class="dialog-card"><span class="eyebrow">HOW TO PLAY</span><h2>主役は、ガラガラ。</h2><div class="help-step"><b>01</b><p><strong>ベビーの少し前へ</strong><br>マウス・ドラッグ・WASDでガラガラを移動。<br>ひとりなら矢印でもOK。</p></div><div class="help-step"><b>02</b><p><strong>いいリズムでシャカシャカ！</strong><br>クリック・Space・パッドAで鳴らす。<br>1秒に1回くらい。連打すると飽きちゃう！</p></div><div class="help-step"><b>03</b><p><strong>とっておきは、ひとり1回</strong><br>R・画面のボタン・パッドRBでスーパー。<br>コースの色つきゾーンにも注目！</p></div><p class="help-footnote">♡ 笑い声は近くのベビーにも伝染！<br>♫ ボタンで実況をオン。端末の日本語音声を使います。<br>多人対戦の操作は「準備する」で確認できます。</p><button id="help-close" class="primary-button">わかった！ ↗</button></div></section>
  <section id="result" class="dialog-overlay" hidden aria-label="レース結果"><div class="dialog-card result-card"><div class="result-eyebrow">FINISH! NICE RACE!</div><div class="result-trophy">⚑</div><h2 id="result-title"></h2><p id="result-subtitle"></p><div id="result-stats" class="result-stats"></div><p id="discovery-summary" class="discovery-summary"></p><button id="retry-button" class="primary-button">もう1回、ハイハイ！ ↗</button><button id="result-menu" class="secondary-button">タイトルにもどる</button></div></section>
  <div id="webgl-error" class="dialog-overlay" hidden><div class="dialog-card"><h2>3D画面を開けませんでした</h2><p>WebGLが使えるブラウザーで開いてください。<br>ハードウェアアクセラレーションを有効にして<br>再読み込みすると改善する場合があります。</p><button id="reload-button" class="primary-button">再読み込み</button></div></div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let race = createRace(preferences.mode, Date.now(), preferences);
let world: GameWorld | undefined;
const audio = new GameAudio();
const director = new CinematicDirector();
let paused = false, dialogWasPaused = false, lastEvent = -1, lastPhase = race.phase, bannerUntil = 0, bannerPriority = -1, finishHandled = false;
let lastTime = performance.now(), elapsed = 0, lastCountdown = 4, activePlayer = 0, customPlayer = 0;
let raceDiscoveries: EventId[] = [];
let presentedShot = '';
const keys = new Set<string>();
const lastRingTime = Array(4).fill(-Infinity);
const gamepadRingHeld = Array(4).fill(false), gamepadSuperHeld = Array(4).fill(false);
const playerLabel = (id: number) => race.babies[id].isCpu ? `CPU${id - race.humanPlayers + 1}` : `${id+1}P`;
const save = () => savePreferences(preferences);
try { world = new GameWorld(app); } catch (error) { console.error('WebGL initialization failed',error); el('webgl-error').hidden = false; }
if (!preferences.sound) audio.toggle();
audio.setCommentary(preferences.commentary);

function syncSound() {
  el('sound-button').setAttribute('aria-pressed',String(!preferences.sound));
  el('sound-button').setAttribute('aria-label',preferences.sound ? '音をオフにする' : '音をオンにする');
  el('commentary-button').setAttribute('aria-pressed',String(preferences.commentary));
  el('commentary-button').setAttribute('aria-label',preferences.commentary ? '実況をオフにする' : '実況をオンにする');
  el('commentary-button').title = preferences.commentary ? '実況オン（対応する日本語音声がある端末）' : '実況をオンにする';
}
function refreshSettings() {
  const count = preferences.humanPlayers;
  el('setup-summary').textContent = `${count}人${count<4 ? ` ＋ CPU ${4-count}体` : 'で対戦'} · ${getCourse(preferences.courseId).name}`;
  el('menu-note').textContent = `${count} PLAYER${count>1?'S':''}${count<4?` vs ${4-count} CPU`:''} · 60 SEC`;
  el('normal-mode-name').textContent = count===1 ? 'ひとりでレース' : 'みんなでレース';
  el<HTMLSelectElement>('human-players').value = String(count);
  el('catalog-count').textContent = `${records.seen.length} / ${EVENTS.length}`;
  el('record-summary').textContent = records.races ? `${records.races}レース · ${records.wins}勝` : 'どんなハプニングに出会うかな？';
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>{ const active=button.dataset.mode===preferences.mode; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
  document.querySelectorAll<HTMLButtonElement>('[data-course]').forEach(button=>{ const active=button.dataset.course===preferences.courseId; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
  document.querySelectorAll<HTMLButtonElement>('[data-custom-player]').forEach((button,i)=>{ button.style.setProperty('--racer-color',preferences.styles[i].color); button.textContent=`${i+1}${i<count?'P':' · CPU'}`; button.setAttribute('aria-pressed',String(i===customPlayer)); });
}
function loadCustomFields() {
  const style=preferences.styles[customPlayer];
  el<HTMLInputElement>('baby-name').value=style.name; el<HTMLInputElement>('baby-color').value=style.color; el<HTMLSelectElement>('baby-accessory').value=style.accessory;
  refreshSettings();
}
function rebuildPreview() { if (race.phase==='ready') { race=createRace(preferences.mode,Date.now(),preferences); configureRacers(); } }
function configureRacers() {
  activePlayer=Math.min(activePlayer,race.humanPlayers-1);
  el('control-player').innerHTML=race.babies.filter(b=>!b.isCpu).map(b=>`<option value="${b.id}">${b.id+1}P · ${esc(b.name)}</option>`).join('');
  el<HTMLSelectElement>('control-player').value=String(activePlayer);
  race.babies.forEach((baby,i)=>{
    el(`progress-${i}`).style.background=baby.style.color;
    el(`progress-${i}`).title=`${playerLabel(i)} · ${baby.name}`;
    el(`progress-${i}`).classList.toggle('cpu',baby.isCpu);
  });
  el('course-name').textContent=getCourse(race.courseId).name;
  el('course-number').textContent=`0${COURSES.findIndex(c=>c.id===race.courseId)+1}`;
  el('controls-hint').textContent=race.humanPlayers===1 ? 'マウス / WASD / 矢印で移動 · クリック / SPACEで鳴らす · Rでスーパー' : '1P WASD + Space/R · 2P 矢印 + Enter/右Shift · 3P IJKL + O/U · 4P テンキー8456 + 0/.';
}
function syncPhase() {
  document.body.dataset.phase=race.phase;
  el('menu').hidden=race.phase!=='ready'; el('countdown').hidden=race.phase!=='countdown';
  el('pause-button').hidden=!['racing','countdown'].includes(race.phase);
  el('mobile-ring').style.visibility=race.phase==='racing'?'visible':'hidden';
}
function begin() {
  if (!world) return;
  director.reset(); presentedShot=''; syncCinematic(null);
  audio.stopCommentary(); audio.unlock(); race=createRace(preferences.mode,Date.now(),preferences); startRace(race);
  paused=false; activePlayer=0; keys.clear(); lastRingTime.fill(-Infinity); gamepadRingHeld.fill(false); gamepadSuperHeld.fill(false);
  lastEvent=-1; finishHandled=false; lastCountdown=4; bannerUntil=0; bannerPriority=-1; raceDiscoveries=[];
  el('event-banner').classList.remove('visible'); el('rattle-hint').hidden=false;
  ['pause','result','help','setup','catalog'].forEach(id=>el(id).hidden=true);
  configureRacers(); syncPhase(); (document.activeElement as HTMLElement)?.blur();
}
function showMenu() {
  director.reset(); presentedShot=''; syncCinematic(null);
  audio.stopCommentary(); race=createRace(preferences.mode,Date.now(),preferences); paused=false; keys.clear();
  ['pause','result','help','setup','catalog'].forEach(id=>el(id).hidden=true);
  el('event-banner').classList.remove('visible'); configureRacers(); refreshSettings(); syncPhase(); el('start-button').focus();
}
function ring(id=activePlayer) {
  if (paused || director.active || race.phase!=='racing' || id>=race.humanPlayers || elapsed-lastRingTime[id]<.1) return;
  lastRingTime[id]=elapsed; audio.unlock(); if (ringRattle(race,id)) audio.ring(); el('rattle-hint').hidden=true;
}
function superRing(id=activePlayer) { if (paused || director.active || race.phase!=='racing' || id>=race.humanPlayers) return; audio.unlock(); if(useSuper(race,id)) audio.ring(true); }
function togglePause() {
  if (!['racing','countdown'].includes(race.phase) || !el('help').hidden) return;
  paused=!paused; keys.clear(); if(paused) audio.stopCommentary(); el('pause').hidden=!paused; if(paused) el('resume-button').focus();
}
function openDialog(id: string) { dialogWasPaused=paused; paused=true; keys.clear(); audio.stopCommentary(); el(id).hidden=false; }
function closeDialog(id: string) { el(id).hidden=true; paused=dialogWasPaused; }
function renderCatalog() {
  el('catalog-progress').textContent=`発見 ${records.seen.length} / ${EVENTS.length} · 大盛りモードでいろいろ探してみよう！`;
  el('catalog-list').innerHTML=(['normal','rare','legendary'] as const).map((rarity,i)=>`<h3>${['いつものハプニング','レアハプニング','バカ覚醒ハプニング'][i]}</h3><div class="event-grid">${EVENTS.filter(e=>e.rarity===rarity).map(event=>{const seen=records.seen.includes(event.id);return `<article class="event-entry ${seen?'discovered':'undiscovered'}"><span class="event-icon">${seen?event.icon:'?'}</span><div><small>${event.id}</small><strong>${seen?event.name:'まだ出会っていない'}</strong><p>${seen?event.description:'レースを走って、発見しよう！'}</p></div></article>`;}).join('')}</div>`).join('');
}
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.addEventListener('click',()=>{preferences.mode=button.dataset.mode as Mode;save();refreshSettings();rebuildPreview();}));
document.querySelectorAll<HTMLButtonElement>('[data-course]').forEach(button=>button.addEventListener('click',()=>{preferences.courseId=COURSES.find(c=>c.id===button.dataset.course)!.id;save();refreshSettings();rebuildPreview();}));
document.querySelectorAll<HTMLButtonElement>('[data-custom-player]').forEach(button=>button.addEventListener('click',()=>{customPlayer=Number(button.dataset.customPlayer);loadCustomFields();}));
el('human-players').addEventListener('change',()=>{preferences.humanPlayers=Number(el<HTMLSelectElement>('human-players').value);save();refreshSettings();rebuildPreview();});
function updateCustom() {
  preferences.styles[customPlayer]={name:el<HTMLInputElement>('baby-name').value.trim().slice(0,12)||DEFAULT_STYLES[customPlayer].name,color:el<HTMLInputElement>('baby-color').value,accessory:el<HTMLSelectElement>('baby-accessory').value as typeof ACCESSORIES[number]}; save();refreshSettings();rebuildPreview();
}
['baby-name','baby-color','baby-accessory'].forEach(id=>el(id).addEventListener('change',updateCustom));
el('start-button').addEventListener('click',begin); el('retry-button').addEventListener('click',begin);
el('return-button').addEventListener('click',showMenu); el('result-menu').addEventListener('click',showMenu);
el('resume-button').addEventListener('click',togglePause); el('pause-button').addEventListener('click',togglePause);
el('help-button').addEventListener('click',()=>openDialog('help')); el('help-close').addEventListener('click',()=>closeDialog('help'));
el('setup-button').addEventListener('click',()=>{loadCustomFields();openDialog('setup');});
['setup-close','setup-close-x'].forEach(id=>el(id).addEventListener('click',()=>{updateCustom();closeDialog('setup');}));
el('catalog-button').addEventListener('click',()=>{renderCatalog();openDialog('catalog');});el('catalog-close').addEventListener('click',()=>closeDialog('catalog'));
el('super-button').addEventListener('click',()=>superRing()); el('mobile-ring').addEventListener('pointerdown',e=>{e.preventDefault();ring();});
el('cinematic-skip').addEventListener('click',()=>{director.skip();audio.stopCommentary();});
el('control-player').addEventListener('change',()=>{activePlayer=Number(el<HTMLSelectElement>('control-player').value);el('rattle-hint').hidden=false;});
el('reload-button').addEventListener('click',()=>location.reload());
el('sound-button').addEventListener('click',()=>{preferences.sound=audio.toggle();save();syncSound();});
el('commentary-button').addEventListener('click',()=>{preferences.commentary=!preferences.commentary;audio.setCommentary(preferences.commentary);audio.unlock();save();syncSound();});
document.querySelector('.brand')!.addEventListener('click',e=>{e.preventDefault();if(['ready','finished'].includes(race.phase))showMenu();else togglePause();});

const mappings=[{up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',ring:'Space',super:'KeyR'}, {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',ring:'Enter',super:'ShiftRight'}, {up:'KeyI',down:'KeyK',left:'KeyJ',right:'KeyL',ring:'KeyO',super:'KeyU'}, {up:'Numpad8',down:'Numpad5',left:'Numpad4',right:'Numpad6',ring:'Numpad0',super:'NumpadDecimal'}];
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){const dialog=['help','setup','catalog'].find(id=>!el(id).hidden);if(dialog)closeDialog(dialog);else togglePause();return;}
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement)return;
  if(paused || !['countdown','racing'].includes(race.phase))return;
  if(mappings.some(map=>Object.values(map).includes(e.code)))e.preventDefault();
  if(director.active){if(e.code==='Enter'&&!e.repeat){e.preventDefault();director.skip();audio.stopCommentary();}return;}
  keys.add(e.code);if(e.repeat)return;
  mappings.slice(0,race.humanPlayers).forEach((map,i)=>{if(e.code===map.ring)ring(i);if(e.code===map.super)superRing(i);});
});
window.addEventListener('keyup',e=>keys.delete(e.code));
el('control-player').addEventListener('focus',()=>keys.clear());
const autoPause=()=>{keys.clear();if(!paused&&['racing','countdown'].includes(race.phase))togglePause();};
window.addEventListener('blur',autoPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});
window.addEventListener('resize',()=>world?.resize());
if(world){
  const canvas=world.renderer.domElement;let dragging=false;
  const movePointer=(e:PointerEvent)=>{if(paused||director.active||race.phase!=='racing'||(e.pointerType==='touch'&&!dragging))return;const point=world!.worldPoint(e.clientX,e.clientY);if(point)moveRattle(race,point.x,point.z,activePlayer);};
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||paused||director.active||race.phase!=='racing')return;dragging=true;canvas.setPointerCapture(e.pointerId);movePointer(e);ring();e.preventDefault();});canvas.addEventListener('pointermove',movePointer);
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;audio.stopCommentary();el('webgl-error').hidden=false;});
  canvas.addEventListener('webglcontextrestored',()=>{el('webgl-error').hidden=true;paused=false;});
}
function updateInput(dt:number){
  if(paused||director.active||race.phase!=='racing')return;
  const pads=Array.from(navigator.getGamepads?.()??[]).filter((pad):pad is Gamepad=>!!pad&&pad.connected);
  for(let i=0;i<race.humanPlayers;i++){
    const map=mappings[i];let dx=Number(keys.has(map.right))-Number(keys.has(map.left)),dz=Number(keys.has(map.down))-Number(keys.has(map.up));
    if(i===0&&race.humanPlayers===1){dx+=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));dz+=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));}
    const pad=pads[i];if(pad){dx+=Math.abs(pad.axes[0]??0)>.16?pad.axes[0]:0;dz+=Math.abs(pad.axes[1]??0)>.16?pad.axes[1]:0;const ringPressed=!!pad.buttons[0]?.pressed,superPressed=!!pad.buttons[5]?.pressed;if(ringPressed&&!gamepadRingHeld[i])ring(i);if(superPressed&&!gamepadSuperHeld[i])superRing(i);gamepadRingHeld[i]=ringPressed;gamepadSuperHeld[i]=superPressed;}else{gamepadRingHeld[i]=false;gamepadSuperHeld[i]=false;}
    const length=Math.hypot(dx,dz);if(length){const rattle=race.rattles[i],speed=7*dt/Math.max(1,length);moveRattle(race,rattle.x+dx*speed,rattle.z+dz*speed,i);}
  }
}
function finish(){
  finishHandled=true;audio.stopCommentary();audio.cue('finish');records.races++;if(race.winner!==null&&!race.babies[race.winner].isCpu)records.wins++;saveRecords(records);
  const ranking=rankBabies(race),winner=race.winner??0;
  el('result-title').textContent=race.humanPlayers===1?(winner===0?'やったね！ 1位！':'ナイス、ハイハイ！'):`${playerLabel(winner)} の勝ち！`;
  el('result-subtitle').textContent=`${race.babies[winner].name}、おめでとう！ ${getCourse(race.courseId).name}`;
  el('result-stats').innerHTML=ranking.map((baby,i)=>`<div class="result-row"><span class="result-place" style="color:${baby.style.color}">${i+1}<small>位</small></span><strong>${playerLabel(baby.id)} · ${esc(baby.name)}</strong><span>${baby.finishedAt!==null?`${baby.finishedAt.toFixed(1)} 秒`:`${Math.floor(getProgress(baby)*100)} %`}</span></div>`).join('');
  el('discovery-summary').textContent=raceDiscoveries.length?`NEW！ ${raceDiscoveries.map(id=>getEvent(id).name).join(' / ')}`:`ずかん ${records.seen.length} / ${EVENTS.length} · 次はどんなハプニング？`;
  el('result').hidden=false;el('retry-button').focus();const baby=race.babies[winner];world?.confetti(baby.x,baby.z,80);refreshSettings();
}
function moodIndicator(baby: Baby): { glyph: string; mood: string } {
  if(baby.eventId==='R10')return {glyph:'💧',mood:'crying'};
  if(baby.state==='awakening')return {glyph:'✦',mood:'awake'};
  if(baby.state==='rest')return {glyph:'z',mood:'rest'};
  if(baby.state==='distracted')return {glyph:'!',mood:'distracted'};
  if(baby.boredom>.65||baby.mood<.45)return {glyph:'…',mood:'grumpy'};
  if(baby.state==='look'||baby.attention<.2)return {glyph:'?',mood:'lost'};
  if(baby.state==='groove'||baby.mood>.95)return {glyph:'♫',mood:'groove'};
  return {glyph:'♪',mood:'happy'};
}
function positionMoodMarkers(){
  if(!world)return;
  const placed:{x:number;y:number}[]=[];
  const offsets=[[0,0],[-26,0],[26,0],[0,-26],[-26,-26],[26,-26],[0,-52]];
  race.babies.forEach((_,i)=>{
    const anchor=world!.moodPoint(i),marker=el(`label-${i}`);
    marker.dataset.anchorX=anchor.x.toFixed(2);marker.dataset.anchorY=anchor.y.toFixed(2);
    marker.hidden=race.phase!=='racing'||!anchor.visible||anchor.x<0||anchor.x>innerWidth||anchor.y<0||anchor.y>innerHeight;
    if(marker.hidden)return;
    const candidates=offsets.map(([dx,dy])=>({x:Math.max(14,Math.min(innerWidth-14,anchor.x+dx)),y:Math.max(26,anchor.y+dy)}));
    const point=candidates.find(pos=>placed.every(other=>Math.abs(pos.x-other.x)>=26||Math.abs(pos.y-other.y)>=26))??candidates[0];
    placed.push(point);marker.style.transform=`translate(${point.x}px,${point.y}px) translate(-50%,-100%)`;
  });
}
function updateUI(){
  if(race.phase!==lastPhase){if(race.phase==='racing')audio.cue('start');syncPhase();lastPhase=race.phase;}
  if(race.phase==='countdown'){const num=Math.ceil(race.countdown);el('countdown-number').textContent=String(Math.max(1,num));if(num!==lastCountdown){audio.cue('tick');lastCountdown=num;}}
  el('timer').textContent=String(Math.ceil(Math.max(0,TIME_LIMIT-race.time))).padStart(2,'0');el('timer-fill').style.width=`${Math.max(0,1-race.time/TIME_LIMIT)*100}%`;el('timer').classList.toggle('urgent',race.time>50);
  const ranking=rankBabies(race),baby=race.babies[activePlayer];el('rank').textContent=`${ranking.findIndex(b=>b.id===activePlayer)+1}位`;
  el('player-avatar').innerHTML=`${activePlayer+1}<span>P</span>`;el('player-avatar').style.background=`${baby.style.color}44`;
  el('mood-fill').style.width=`${Math.max(0,Math.min(100,baby.mood*100))}%`;
  el('mood-caption').textContent=baby.boredom>.6?'鳴らしすぎ！ 少し待ってみよう':baby.zone?ZONE_LABELS[baby.zone]:baby.state==='distracted'?'寄り道中！ 近くで呼ぼう':baby.attention<.2?'ベビーの少し前で鳴らしてね':'いいリズム！ その調子♪';
  el<HTMLButtonElement>('super-button').disabled=baby.superUsed||race.phase!=='racing';el('super-button').querySelector('small')!.textContent=baby.superUsed?'つかいきったよ！':`${activePlayer+1}P · ここぞの1回！`;el('super-button').querySelector('.keycap')!.textContent=['R','右⇧','U','.'][activePlayer];
  race.babies.forEach((b,i)=>{el(`progress-${i}`).style.left=`${getProgress(b)*100}%`;el(`progress-${i}`).style.top=`${(i-1.5)*5}px`;const indicator=moodIndicator(b),marker=el(`label-${i}`);marker.textContent=indicator.glyph;marker.dataset.mood=indicator.mood;});if(!director.active)positionMoodMarkers();
  if(world){const r=race.rattles[activePlayer],p=world.screenPoint(r.x,1.8,r.z);el('rattle-hint').style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;}
  const priority=(kind:string)=>kind==='legendary'?3:['super','rare','finish'].includes(kind)?2:kind==='good'?0:1;
  const pending=race.events.filter(event=>event.id>lastEvent);
  for(const event of pending){if(event.eventId&&!records.seen.includes(event.eventId)){records.seen.push(event.eventId);raceDiscoveries.push(event.eventId);saveRecords(records);}}
  pending.sort((a,b)=>priority(b.kind)-priority(a.kind)||b.id-a.id);const event=pending[0];if(event)lastEvent=Math.max(...race.events.map(e=>e.id));
  if(event&&(elapsed>=bannerUntil||priority(event.kind)>=bannerPriority)){
    bannerPriority=priority(event.kind);el('event-banner').textContent=['start','finish'].includes(event.kind)?event.text:`${playerLabel(event.babyId)}！ ${event.text}`;el('event-banner').classList.add('visible');el('event-banner').classList.toggle('special',/legendary|super|rare/.test(event.kind));bannerUntil=elapsed+(event.kind==='legendary'?2.8:2.1);
    if(event.eventId&&getEvent(event.eventId).rarity==='normal')audio.event(event.eventId,playerLabel(event.babyId),priority(event.kind));
    if(event.kind==='legendary'){const b=race.babies[event.babyId];if(b)world?.confetti(b.x,b.z,20);}
  }
  if(elapsed>bannerUntil)el('event-banner').classList.remove('visible');if(race.phase==='finished'&&!finishHandled)finish();
}
function syncCinematic(shot: CinematicFrame|null) {
  el('cinematic').hidden=!shot;
  document.body.dataset.cinematic=String(!!shot);
  if(!shot){presentedShot='';delete el('cinematic').dataset.event;return;}
  const key=`${shot.eventId}:${shot.babyId}:${race.time}`;
  if(key!==presentedShot){
    presentedShot=key;keys.clear();audio.stopCommentary();
    el('cinematic').dataset.event=shot.eventId;
    const definition=getEvent(shot.eventId),baby=race.babies[shot.babyId];
    el('cinematic-player').textContent=`${playerLabel(shot.babyId)} · ${baby.name}`;
    el('cinematic-title').textContent=definition.name;
    el('cinematic-description').textContent=definition.description;
    const badges: Partial<Record<EventId,string>>={R09:'緊急おむつピットイン！',R10:'ギャン泣き、連鎖中！',S09:'GAL MODE ON ☆',S10:'生後0年の大黒柱',S11:'目指せ、ハイハイ金メダル！',S12:'変身！おむつの平和を守れ！',S13:'ただいま、土俵入り。'};
    el('cinematic-rarity').textContent=badges[shot.eventId]??(definition.rarity==='legendary'?'BABY AWAKENING!':'RARE HAPPENING!');
    el('cinematic').classList.toggle('legendary',definition.rarity==='legendary');
    audio.event(shot.eventId,playerLabel(shot.babyId));
  }
  const t=shot.elapsed;
  const crying=race.babies.filter(baby=>baby.eventId==='R10').length;
  const beat=shot.eventId==='R09'?(t<.8?'プ、プリッ……今!?':t<1.7?'レース中ですが、おむつを交換します。':t<3?'ふきふき……新品おむつ、装着！':'交換完了！さっぱりして再出走！')
    :shot.eventId==='R10'?(t<.7?'あっ！おしゃぶり、落としたーー！':t<2.6?`${crying}体で大合唱！うぇぇぇぇ〜ん！！`:'おしゃぶり発見！泣きやむまで、あと少し。')
    :shot.eventId==='S09'?(t<.7?'メイク完了。ウチ、今日からギャルなんで☆':t<3.8?'レース？いったんパラパラっしょ☆':'レース復帰！まだまだパラパラっしょ☆')
    :shot.eventId==='S10'?(t<.9?'そのガラガラ、わしは認めん！':t<2.9?'腕組み。ひげ。腹巻き。人生0年の貫禄。':'……ミルクの時間？なら急ぐぞい！')
    :shot.eventId==='S11'?(t<.9?'ハイハイ部門、ただいま演技開始。':t<3.3?'側転！側転！進路も採点対象です！':'着地までがハイハイ。目指せ満点！')
    :shot.eventId==='S12'?(t<.9?'おむつの平和が、いま危ない！':t<3.4?'変身！ガラガラ戦隊・ベビーレンジャー！':'必殺！ミルクの時間に間に合えダッシュ！')
    :shot.eventId==='S13'?(t<.9?'東〜、もちもち山〜。':t<3.2?'はっけよい……レース中です！':'のこった！のこった！ゴールまで、のこった！'):null;
  if(beat&&el('cinematic-description').textContent!==beat)el('cinematic-description').textContent=beat;
  el('cinematic-fill').style.width=`${shot.elapsed/shot.duration*100}%`;
}
function syncHeldGamepads() {
  const pads=Array.from(navigator.getGamepads?.()??[]).filter((pad):pad is Gamepad=>!!pad&&pad.connected);
  for(let i=0;i<4;i++){gamepadRingHeld[i]=!!pads[i]?.buttons[0]?.pressed;gamepadSuperHeld[i]=!!pads[i]?.buttons[5]?.pressed;}
}
function frame(now:number){
  const dt=Math.max(0,Math.min((now-lastTime)/1000,.1));lastTime=now;
  if(!paused){
    if(director.active){director.advance(dt);syncHeldGamepads();}
    else{elapsed+=dt;updateInput(dt);updateRace(race,dt);director.observe(race.events,race.phase==='racing');}
  }
  const shot=director.frame;syncCinematic(shot);
  world?.update(race,elapsed,paused?0:dt,shot);updateUI();requestAnimationFrame(frame);
}
configureRacers();loadCustomFields();syncSound();syncPhase();requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>audio.dispose(),{once:true});
Object.defineProperty(window,'__babyRace',{get:()=>({phase:race.phase,mode:race.mode,courseId:race.courseId,humanPlayers:race.humanPlayers,time:race.time,paused,cinematic:director.frame,audio:audio.diagnostics,happening:world?.getHappeningDiagnostics()??null,camera:world?{viewHeight:world.viewHeight,x:world.camera.position.x,y:world.camera.position.y,z:world.camera.position.z}:null,babies:race.babies.map(b=>({id:b.id,name:b.name,isCpu:b.isCpu,style:{...b.style},x:b.x,z:b.z,state:b.state,stateTime:b.stateTime,awakeningPhase:b.awakeningPhase,eventId:b.eventId,zone:b.zone,progress:getProgress(b),superUsed:b.superUsed})),rattles:race.rattles.map(r=>({...r})),winner:race.winner,events:race.events.map(e=>({text:e.text,kind:e.kind,eventId:e.eventId})),discovered:[...records.seen]})});
