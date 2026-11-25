// Hand-drawn style route sketch: Bahnhof Dornbirn -> Die Gelbe Fabrik (Widagasse 11).
// The line follows the real walking route (OpenStreetMap data: Franz-Michael-Felder-Straße,
// Kreuzgasse, then left into the Widagasse, about 700 m), drawn schematically and not to
// scale. Static on purpose; the wobbly look comes from an SVG displacement filter.
const ROUTE =
  'M70 158.8 L78.3 171.8 L90.9 179.3 L126.5 200.3 L165.1 223.1 L220.5 254.2 L251.1 265 L266.7 269.3 L281 268.7 L322.6 260.2 L343.9 251.9 L360 245.3 L376.8 236.1 L404.5 218.3 L437.2 198.4 L460.2 187.9 L483.3 181.5 L511.8 178.7 L529.8 182.5 L530 124.9 L509.8 124.8 L509.7 86.2';

const TREES = [
  [165, 138],
  [222, 120],
  [305, 214],
  [395, 288],
  [455, 120],
  [335, 306],
  [120, 250],
];

export default function RouteSketch() {
  return (
    <figure className="xmas-sketch">
      <svg
        viewBox="0 0 600 330"
        role="img"
        aria-label="Skizze: Weg vom Bahnhof Dornbirn über die Franz-Michael-Felder-Straße und die Kreuzgasse, dann links in die Widagasse zur Gelben Fabrik"
      >
        <defs>
          <filter id="xmas-rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="3.2" />
          </filter>
        </defs>

        <g filter="url(#xmas-rough)">
          {TREES.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <line x1={x} y1={y + 8} x2={x} y2={y + 18} stroke="#8a6d4b" strokeWidth="3" />
              <circle cx={x} cy={y} r="11" fill="#9db398" opacity="0.85" />
            </g>
          ))}

          <path
            d={ROUTE}
            fill="none"
            stroke="#c48e6a"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="0.5 11"
          />

          {/* Bahnhof */}
          <g stroke="#605e5e" strokeWidth="2.4" fill="#fff" strokeLinejoin="round">
            <rect x="46" y="140" width="30" height="20" rx="2" />
            <path d="M42 140 L61 126 L80 140 Z" fill="#e9ddd0" />
            <rect x="56" y="148" width="10" height="12" fill="#c48e6a" stroke="none" />
          </g>

          {/* Gelbe Fabrik */}
          <path
            d="M509.7 90 C499 76 494 70 494 62 a15.7 15.7 0 1 1 31.4 0 C525.4 70 520 76 509.7 90 Z"
            fill="#e5a72e"
            stroke="#9a5f38"
            strokeWidth="2.4"
          />
          <circle cx="509.7" cy="62" r="5.5" fill="#fff" />

          {/* Parkplatz */}
          <circle cx="572" cy="74" r="15" fill="#fff" stroke="#667c62" strokeWidth="2.4" />
        </g>

        <g className="xmas-sketch-text">
          <text x="40" y="112" fontSize="19" fontWeight="700">
            Bahnhof Dornbirn
          </text>
          <text
            x="150"
            y="178"
            fontSize="16"
            transform="rotate(28 150 178)"
            className="xmas-sketch-street"
          >
            Franz-Michael-Felder-Str.
          </text>
          <text
            x="360"
            y="222"
            fontSize="16"
            transform="rotate(-28 360 222)"
            className="xmas-sketch-street"
          >
            Kreuzgasse
          </text>
          <text
            x="556"
            y="152"
            fontSize="16"
            transform="rotate(-90 556 152)"
            textAnchor="middle"
            className="xmas-sketch-street"
          >
            Widagasse
          </text>
          <text x="500" y="34" fontSize="19" fontWeight="700" textAnchor="end">
            Gelbe Fabrik
          </text>
          <text x="572" y="80" fontSize="17" fontWeight="700" textAnchor="middle" fill="#667c62">
            P
          </text>
          <text x="300" y="316" fontSize="17" textAnchor="middle" className="xmas-sketch-street">
            ca. 10 Min. zu Fuß · rund 700 m
          </text>
          <text x="30" y="40" fontSize="15" className="xmas-sketch-street">
            N ↑
          </text>
        </g>
      </svg>
      <figcaption>Skizze, nicht maßstabsgetreu</figcaption>
    </figure>
  );
}
