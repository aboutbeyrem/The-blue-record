// A short listening test. The listener hears two countries, from NASA's newest
// data, and says which is hotter, higher or greener. The answer is checked
// against the same data the sound was made from. Results stay in this browser.

import { engine, semiToHz } from './audio.js';
import { loadPlaces, countries } from './placedata.js';
import { categoryById, loadCountry, normOf } from './categories.js';

const $ = (id) => document.getElementById(id);
const STEPS = 64, SEMITONES = 32, CLIP = 4.5;     // seconds per country
const KEY = 'blue-record-listening-test';

// Each pair has a big, obvious difference. The truth comes from the data, not from us.
const PAIRS = [
  { cat: 'temperature', a: 'Iceland', b: 'Egypt', ask: 'Which country is hotter?', word: 'hotter' },
  { cat: 'temperature', a: 'Norway', b: 'Brazil', ask: 'Which country is hotter?', word: 'hotter' },
  { cat: 'elevation', a: 'Netherlands', b: 'Nepal', ask: 'Which country has higher ground?', word: 'higher' },
  { cat: 'elevation', a: 'Switzerland', b: 'Egypt', ask: 'Which country has higher ground?', word: 'higher' },
  { cat: 'greenness', a: 'Egypt', b: 'Ireland', ask: 'Which country is greener?', word: 'greener' },
  { cat: 'greenness', a: 'Japan', b: 'Saudi Arabia', ask: 'Which country is greener?', word: 'greener' },
];
const VOICES = { temperature: 'warm', elevation: 'terrain', greenness: 'leaf' };
const RANGES = { temperature: [-20, 50], elevation: [0, 3000], greenness: [0, 0.9] };

let rounds = [], at = 0, answers = [], audioBusy = false;

const rand = () => Math.random() < 0.5;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: keep going */ } };

/** The best row of the country to scan (the one with the most readings), as 64 values. */
function clipFor(data) {
  const { W, H } = data.area, f = data.frames[0].values, mask = data.mask;
  let bestRow = Math.floor(H / 2), best = -1;
  for (let j = Math.floor(H * 0.15); j < Math.floor(H * 0.85); j++) {
    let n = 0;
    for (let i = 0; i < W; i++) if (mask[j * W + i] && !Number.isNaN(f[j * W + i])) n++;
    if (n > best) { best = n; bestRow = j; }
  }
  const steps = [];
  let sum = 0, cnt = 0;
  for (let b = 0; b < STEPS; b++) {
    const x0 = Math.floor(b * W / STEPS), x1 = Math.floor((b + 1) * W / STEPS);
    let a = 0, c = 0;
    for (let j = Math.max(0, bestRow - 2); j <= Math.min(H - 1, bestRow + 2); j++) {
      for (let i = x0; i < x1; i++) { const v = f[j * W + i]; if (mask[j * W + i] && !Number.isNaN(v)) { a += v; c++; } }
    }
    const v = c ? a / c : null;
    steps.push(v);
    if (v !== null) { sum += v; cnt++; }
  }
  return { steps, mean: cnt ? sum / cnt : null };
}

async function prepare(status) {
  await loadPlaces();
  const all = countries();
  const need = new Set(PAIRS.flatMap((p) => [`${p.cat}|${p.a}`, `${p.cat}|${p.b}`]));
  const cache = {};
  let done = 0;
  for (const key of need) {
    const [catId, name] = key.split('|');
    const id = all.findIndex((c) => c && c.n === name);
    const cat = categoryById(catId);
    const data = await loadCountry(all[id], id, cat, null, { latestOnly: true });
    cache[key] = { ...clipFor(data), label: data.frames[0].label };
    status.textContent = `Asking NASA… ${++done} of ${need.size} countries`;
  }
  const out = [];
  for (const p of PAIRS) {
    const A = cache[`${p.cat}|${p.a}`], B = cache[`${p.cat}|${p.b}`];
    if (A.mean === null || B.mean === null) continue;
    const range = RANGES[p.cat];
    if (Math.abs(A.mean - B.mean) < 0.12 * (range[1] - range[0])) continue;   // not obvious enough: skip
    const flip = rand();                                                       // which one is heard first
    out.push({ ...p, first: flip ? p.b : p.a, second: flip ? p.a : p.b,
      A: flip ? B : A, B: flip ? A : B, truth: (flip ? B.mean > A.mean : A.mean > B.mean) ? 'B' : 'A', range });
    out[out.length - 1].truth = out[out.length - 1].B.mean > out[out.length - 1].A.mean ? 'B' : 'A';
  }
  return out.sort(() => Math.random() - 0.5);
}

function playClip(clip, cat, range, startAt) {
  const dur = CLIP / STEPS;
  clip.steps.forEach((v, i) => {
    const t = startAt + i * dur;
    if (v === null) { engine.glideRest(t, dur); return; }
    const n = normOf({ curve: cat === 'temperature' ? 'linear' : cat === 'elevation' ? 'sqrt' : 'linear' }, range, v);
    const pan = (i / (STEPS - 1) * 2 - 1) * 0.8;
    engine.voiceTo(VOICES[cat], t, semiToHz(n * SEMITONES), 0.3 + 0.7 * n, pan, n, dur);
  });
  engine.glideRest(startAt + CLIP, 0.05);
  return startAt + CLIP;
}

async function play(which) {
  if (audioBusy) return;
  audioBusy = true;
  const r = rounds[at];
  await engine.start();
  engine.setVolume(0.85);
  let t = engine.now + 0.15;
  const run = (clip) => { engine.tap(t, 0); t += 0.35; t = playClip(clip, r.cat, r.range, t); };
  if (which !== 'B') run(r.A);
  if (which === 'AB') { t += 0.7; }
  if (which !== 'A') run(r.B);
  const wait = (t - engine.now) * 1000 + 300;
  setTimeout(() => { engine.glideStop(); audioBusy = false; }, wait);
}

function show() {
  const r = rounds[at];
  $('ltCount').textContent = `Question ${at + 1} of ${rounds.length}`;
  $('ltQuestion').textContent = r.ask;
  $('ltAnsA').textContent = `A is ${r.word}`;
  $('ltAnsB').textContent = `B is ${r.word}`;
  $('ltPlayAB').focus();
}

function answer(choice) {
  const r = rounds[at];
  answers.push({ cat: r.cat, first: r.first, second: r.second, truth: r.truth, said: choice, right: choice === r.truth });
  at++;
  if (at < rounds.length) show(); else finish();
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

function finish() {
  $('ltRound').hidden = true; $('ltDone').hidden = false;
  const right = answers.filter((a) => a.right).length;
  const unsure = answers.filter((a) => a.said === 'none').length;
  const all = load();
  all.push({ name: $('ltName').value.trim() || `Listener ${all.length + 1}`, when: new Date().toISOString(), right, total: answers.length, unsure, answers });
  save(all);
  $('ltResult').textContent = `${right} of ${answers.length} right (${pct(right, answers.length)}).${unsure ? ` ${unsure} “can’t tell”.` : ''}`;
  const by = {};
  for (const a of answers) { by[a.cat] ??= [0, 0]; by[a.cat][1]++; if (a.right) by[a.cat][0]++; }
  $('ltBreak').innerHTML = Object.entries(by).map(([k, [x, y]]) => `<li>${k}: ${x} of ${y}</li>`).join('');
  totals();
}

function totals() {
  const all = load();
  const right = all.reduce((s, p) => s + p.right, 0), total = all.reduce((s, p) => s + p.total, 0);
  $('ltTotal').textContent = all.length ? `${all.length} listener${all.length > 1 ? 's' : ''}: ${right} of ${total} answers right (${pct(right, total)}).` : 'No results yet.';
}

function summary() {
  const all = load();
  const right = all.reduce((s, p) => s + p.right, 0), total = all.reduce((s, p) => s + p.total, 0);
  const cats = {};
  for (const p of all) for (const a of p.answers) { cats[a.cat] ??= [0, 0]; cats[a.cat][1]++; if (a.right) cats[a.cat][0]++; }
  const lines = Object.entries(cats).map(([k, [x, y]]) => `${k} ${x} of ${y} (${pct(x, y)})`).join(', ');
  return `We ran a listening test with ${all.length} blindfolded listener${all.length === 1 ? '' : 's'}: ${right} of ${total} answers were right (${pct(right, total)}). By category: ${lines}. These were sighted people with their eyes closed, not blind users.`;
}

$('ltGo').addEventListener('click', async () => {
  const status = $('ltStatus');
  $('ltGo').disabled = true;
  try {
    await engine.start();
    status.textContent = 'Asking NASA…';
    rounds = await prepare(status);
    if (!rounds.length) throw new Error('No usable questions');
    at = 0; answers = [];
    $('ltStart').hidden = true; $('ltRound').hidden = false; show();
  } catch (err) {
    console.error(err);
    status.textContent = navigator.onLine === false ? 'You seem to be offline. This test needs an internet connection.' : 'NASA’s service did not answer. Try again.';
    $('ltGo').disabled = false;
  }
});
$('ltPlayAB').addEventListener('click', () => play('AB'));
$('ltPlayA').addEventListener('click', () => play('A'));
$('ltPlayB').addEventListener('click', () => play('B'));
$('ltAnsA').addEventListener('click', () => answer('A'));
$('ltAnsB').addEventListener('click', () => answer('B'));
$('ltAnsNone').addEventListener('click', () => answer('none'));
$('ltNext').addEventListener('click', () => { $('ltDone').hidden = true; $('ltStart').hidden = false; $('ltGo').disabled = false; $('ltName').value = ''; $('ltStatus').textContent = ''; $('ltCopied').textContent = ''; });
$('ltCopy').addEventListener('click', async () => {
  const text = summary();
  try { await navigator.clipboard.writeText(text); $('ltCopied').textContent = 'Copied: ' + text; }
  catch { $('ltCopied').textContent = text; }
});
$('ltClear').addEventListener('click', () => { save([]); totals(); $('ltCopied').textContent = 'All results erased.'; });
totals();

// For automated checks.
window.listenTest = { get rounds() { return rounds; }, get answers() { return answers; } };
