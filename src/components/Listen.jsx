import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { announce, onOtherAudio } from '../audioBus.js';
import year from '../data/yearSeries.json';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const STEP = 0.24;            // seconds per frame: a year in under nine seconds
const BASE_HZ = 130.81;       // C3 is 0 °C; one semitone per degree, as in the app

const SIDES = [
  { key: 'north', label: '37.5° N', where: 'at Tunis’s latitude, 37.5° N' },
  { key: 'south', label: '27.5° S', where: 'at 27.5° S, in the southern hemisphere, where the seasons run the other way' },
];

export default function Listen() {
  const [side, setSide] = useState(0);
  const [index, setIndex] = useState(-1);
  const playing = index >= 0;
  const audio = useRef({ ctx: null, nodes: [], raf: 0, start: 0 });

  const values = year.series[side].values;
  const dates = year.dates;
  const known = values.filter((v) => v !== null);
  const lo = Math.min(...known), hi = Math.max(...known);
  const loAt = values.indexOf(lo), hiAt = values.indexOf(hi);

  const stop = () => {
    const a = audio.current;
    a.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    a.nodes = [];
    cancelAnimationFrame(a.raf);
    setIndex(-1);
  };

  useEffect(() => () => stop(), []);   // stop sound when the page unmounts
  useEffect(() => onOtherAudio('listen', stop), []);   // and when the video or the app starts

  const play = async () => {
    announce('listen');   // the video and the app above stop
    const a = audio.current;
    if (!a.ctx) a.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (a.ctx.state !== 'running') await a.ctx.resume();
    const ctx = a.ctx;
    const t0 = ctx.currentTime + 0.06;
    const out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(ctx.destination);
    // One tone for the whole year: its pitch and loudness slide from value to value.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    values.forEach((v, i) => {
      if (v === null) return;
      const t = t0 + i * STEP;
      const hz = BASE_HZ * 2 ** (v / 12);
      const level = 0.12 + 0.26 * ((v - lo) / (hi - lo || 1));
      if (i === 0) {
        osc.frequency.setValueAtTime(hz, t);
        g.gain.linearRampToValueAtTime(level, t + 0.06);
      } else {
        osc.frequency.linearRampToValueAtTime(hz, t);
        g.gain.linearRampToValueAtTime(level, t);
      }
    });
    const end = t0 + values.length * STEP;
    g.gain.linearRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(end + 0.05);
    a.nodes.push(osc);
    a.start = t0;
    const tick = () => {
      const i = Math.floor((ctx.currentTime - a.start) / STEP);
      if (i >= values.length) { stop(); return; }
      setIndex(Math.max(0, i));
      a.raf = requestAnimationFrame(tick);
    };
    setIndex(0);
    a.raf = requestAnimationFrame(tick);
  };

  const switchSide = (i) => { stop(); setSide(i); };

  // Sparkline geometry.
  const W = 360, H = 88, pad = 8;
  const x = (i) => pad + (i / (values.length - 1)) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const cur = playing ? values[index] : null;

  return (
    <div className="listen" role="group" aria-labelledby="listen-title">
      <div className="listen-head">
        <div>
          <h2 id="listen-title" className="listen-title">No time? Hear a year of ocean in nine seconds.</h2>
          <p className="listen-sub">
            Average sea temperature {SIDES[side].where}, from March 2007 to February 2008.
            One tone that rises and falls with the water, read from NASA’s visualization by our app.
          </p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Latitude">
          {SIDES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={side === i}
              className={side === i ? 'is-on' : ''}
              onClick={() => switchSide(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="listen-body">
        <button
          type="button"
          className="play"
          onClick={playing ? stop : play}
          aria-label={playing ? 'Stop' : `Play the year at ${SIDES[side].label}`}
        >
          {playing ? <Square size={20} fill="currentColor" aria-hidden="true" /> : <Play size={22} fill="currentColor" aria-hidden="true" />}
        </button>

        <figure className="spark">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Sea temperature at ${SIDES[side].label}: lowest ${lo.toFixed(1)} °C in ${monthOf(dates[loAt])}, highest ${hi.toFixed(1)} °C in ${monthOf(dates[hiAt])}.`}
          >
            <path d={path} className="spark-line" />
            {playing && <circle cx={x(index)} cy={y(cur)} r="5" className="spark-dot" />}
          </svg>
          <figcaption className="spark-caption" aria-live="polite">
            {playing
              ? <><strong>{monthOf(dates[index])}</strong> · {cur.toFixed(1)} °C</>
              : <>Low {lo.toFixed(1)} °C in {monthOf(dates[loAt])} · High {hi.toFixed(1)} °C in {monthOf(dates[hiAt])}</>}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
