import { useEffect, useRef, useState } from 'react';
import './WinterTheme.css';

// Winter-/Weihnachtstheme: leichter Schneefall (Canvas, ohne Klicks zu fangen)
// plus Schneehauben, die rein per CSS an `body.theme-winter` hängen.
//
// Aktiv vom 20. November bis 10. Januar. Zum Ansehen außerhalb der Saison:
// `?winter=1` an die URL hängen, zum Abschalten `?winter=0`.
// Wer "weniger Bewegung" eingestellt hat, bekommt die Schneehauben, aber keinen Schneefall.

const SEASON_START = { month: 10, day: 20 }; // 20. Nov (Monat 0-basiert)
const SEASON_END = { month: 0, day: 10 }; // 10. Jan

export function isWinterSeason(date = new Date(), search = '') {
  const flag = new URLSearchParams(search).get('winter');
  if (flag === '1') return true;
  if (flag === '0') return false;
  const m = date.getMonth();
  const d = date.getDate();
  const afterStart = m > SEASON_START.month || (m === SEASON_START.month && d >= SEASON_START.day);
  const beforeEnd = m < SEASON_END.month || (m === SEASON_END.month && d <= SEASON_END.day);
  return afterStart || beforeEnd;
}

function makeFlake(width, height, anywhere) {
  const size = 2 + Math.random() * 3.5;
  return {
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : -size - Math.random() * 40,
    r: size,
    speed: 0.25 + size * 0.16,
    drift: Math.random() * Math.PI * 2,
    driftSpeed: 0.004 + Math.random() * 0.01,
    sway: 0.3 + Math.random() * 0.7,
    alpha: 0.55 + Math.random() * 0.4,
  };
}

const BAUBLES = [
  { x: '6%', size: 26, string: 14, c: '#b5473f', dur: '3.4s', delay: '-0.6s' },
  { x: '19%', size: 22, string: 30, c: '#e5a72e', dur: '4.1s', delay: '-2s' },
  { x: '33%', size: 28, string: 12, c: '#667c62', dur: '3.8s', delay: '-1.1s' },
  { x: '52%', size: 24, string: 26, c: '#c48e6a', dur: '4.4s', delay: '-3s' },
  { x: '68%', size: 24, string: 8, c: '#6b8fb5', dur: '3.6s', delay: '-0.2s' },
  { x: '81%', size: 22, string: 10, c: '#b5473f', dur: '4.2s', delay: '-1.7s' },
  { x: '94%', size: 26, string: 14, c: '#e5a72e', dur: '3.9s', delay: '-2.6s' },
];

function Baubles() {
  return (
    <div className="winter-baubles" aria-hidden="true">
      {BAUBLES.map((b) => (
        <span
          key={b.x}
          className="winter-bauble"
          style={{
            '--x': b.x,
            '--size': `${b.size}px`,
            '--string': `${b.string}px`,
            '--c': b.c,
            '--dur': b.dur,
            '--delay': b.delay,
          }}
        >
          <i className="winter-bauble-cap" />
        </span>
      ))}
    </div>
  );
}

function Snowfall() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let flakes = [];
    let frame = 0;
    let running = false;

    const targetCount = () => Math.round(Math.min(110, Math.max(28, (width * height) / 16000)));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = targetCount();
      if (flakes.length > count) flakes.length = count;
      while (flakes.length < count) flakes.push(makeFlake(width, height, true));
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        f.drift += f.driftSpeed;
        f.y += f.speed;
        f.x += Math.sin(f.drift) * f.sway;
        if (f.y - f.r > height) Object.assign(f, makeFlake(width, height, false));
        if (f.x < -10) f.x = width + 10;
        if (f.x > width + 10) f.x = -10;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${f.alpha})`;
        ctx.fill();
        // dünner, kühler Rand, damit die Flocken auch auf hellem Hintergrund zu sehen sind
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = `rgba(130,160,200,${f.alpha * 0.5})`;
        ctx.stroke();
      }
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="winter-snowfall" aria-hidden="true" />;
}

export default function WinterTheme() {
  // Einmal beim Start entscheiden, damit `?winter=1` beim Navigieren nicht verloren geht.
  const [active] = useState(() =>
    isWinterSeason(new Date(), typeof window === 'undefined' ? '' : window.location.search)
  );
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!active) return undefined;
    document.body.classList.add('theme-winter');
    return () => document.body.classList.remove('theme-winter');
  }, [active]);

  if (!active) return null;
  return (
    <>
      <Baubles />
      {!reducedMotion && <Snowfall />}
    </>
  );
}
