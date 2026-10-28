import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { compileStyleSheets, resolveTokens, usageCount } from '../../utils/designInspector';
import { buildOverlayModel, describeSides } from '../../utils/designOverlayModel';
import { LAYOUT_TOKENS_BY_NAME, describeValue } from '../../utils/layoutTokens';
import { getEffectiveValue, useLayoutState } from '../../lib/layoutStore';
import TokenPopover from './TokenPopover';

const GAP_DISPLAYS = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);
const SWITCH_DELAY_MS = 140;

const num = (v) => parseFloat(v) || 0;
const four = (cs, prefix, suffix = '') => ({
  top: num(cs[`${prefix}Top${suffix}`]),
  right: num(cs[`${prefix}Right${suffix}`]),
  bottom: num(cs[`${prefix}Bottom${suffix}`]),
  left: num(cs[`${prefix}Left${suffix}`]),
});

const KIND_LABEL = {
  padding: 'Innenabstand',
  margin: 'Außenabstand',
  gap: 'Lücke',
  font: 'Schriftgröße',
  lineheight: 'Zeilenhöhe',
  size: 'Größe',
  radius: 'Rundung',
};

function isIgnored(el) {
  return (
    !el ||
    el === document.documentElement ||
    el === document.body ||
    el.id === 'root' ||
    el.nodeType !== 1
  );
}

// Hover inspector: outlines the element under the pointer, paints its padding
// (green) and margin (orange) and puts a chip with the token name and value on
// every side that a layout token controls. A click on a chip opens the editor.
export default function DesignOverlay() {
  const layout = useLayoutState();
  const location = useLocation();
  const [target, setTarget] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tick, setTick] = useState(0);
  const [model, setModel] = useState(null);

  const compiledRef = useRef(null);
  const dirtyRef = useRef(true);
  const cacheRef = useRef(new WeakMap());
  const timerRef = useRef(null);
  const selectedRef = useRef(null);

  const getCompiled = useCallback(() => {
    const sheetCount = document.styleSheets.length;
    if (dirtyRef.current || !compiledRef.current || compiledRef.current.sheetCount !== sheetCount) {
      compiledRef.current = { ...compileStyleSheets(document), sheetCount };
      cacheRef.current = new WeakMap();
      dirtyRef.current = false;
    }
    return compiledRef.current;
  }, []);

  // New page = possibly new lazily-loaded stylesheets.
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    dirtyRef.current = true;
    setTarget(null);
    setSelected(null);
  }, [location.pathname]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    const onResize = () => {
      // Breakpoints may have flipped: media-query rules apply differently now.
      dirtyRef.current = true;
      refresh();
    };
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    const onMove = (event) => {
      if (selectedRef.current) return; // frozen while an editor is open
      const el = event.target;
      if (el.closest?.('[data-design-ui]')) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        return;
      }
      const next = isIgnored(el) ? null : el;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => setTarget((cur) => (cur === next ? cur : next)),
        SWITCH_DELAY_MS
      );
    };
    const onLeave = () => {
      clearTimeout(timerRef.current);
    };
    document.addEventListener('pointermove', onMove, true);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener('pointermove', onMove, true);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setSelected(null);
    };
    const onDown = (event) => {
      if (!event.target.closest?.('[data-design-ui]')) setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [selected]);

  // Recomputed on hover, scroll/resize (tick) and every draft edit (layout).
  // Reads the DOM, so it lives in an effect rather than in render.
  useLayoutEffect(() => {
    if (!target || !target.isConnected) {
      setModel(null);
      return;
    }
    const compiled = getCompiled();
    let tokens = cacheRef.current.get(target);
    if (!tokens) {
      tokens = resolveTokens(target, compiled);
      cacheRef.current.set(target, tokens);
    }
    const cs = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const built = buildOverlayModel({
      rect,
      border: four(cs, 'border', 'Width'),
      padding: four(cs, 'padding'),
      margin: four(cs, 'margin'),
      rowGap: num(cs.rowGap),
      columnGap: num(cs.columnGap),
      isGapContainer: GAP_DISPLAYS.has(cs.display),
      hasText: Array.from(target.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()),
      tokens,
    });
    setModel({ ...built, rect, compiled });
  }, [target, tick, layout.draft, layout.published, layout.designMode, getCompiled]);

  const clampX = (x) => Math.min(Math.max(x, 70), window.innerWidth - 70);
  const clampY = (y) => Math.min(Math.max(y, 14), window.innerHeight - 14);

  return (
    <>
      {model && (
        <div className="dm-overlay" data-design-ui aria-hidden={false}>
          <div
            className="dm-outline"
            style={{
              left: model.rect.left,
              top: model.rect.top,
              width: model.rect.width,
              height: model.rect.height,
            }}
          />
          {model.bands.map((band) => (
            <div
              key={`${band.kind}-${band.side}`}
              className={`dm-band dm-band--${band.kind}`}
              style={{ left: band.x, top: band.y, width: band.w, height: band.h }}
            />
          ))}
          {model.chips.map((chip) => {
            const token = LAYOUT_TOKENS_BY_NAME[chip.token];
            const value = getEffectiveValue(chip.token);
            const sides =
              chip.sides.length && chip.kind !== 'gap' ? ` · ${describeSides(chip.sides)}` : '';
            return (
              <button
                key={chip.id}
                type="button"
                className={`dm-chip dm-chip--${chip.kind}${selected?.id === chip.id ? ' is-selected' : ''}`}
                style={{
                  left: clampX(chip.x),
                  top: clampY(chip.y),
                  transform: chip.alignRight ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)',
                }}
                title={`${KIND_LABEL[chip.kind]}${sides}: ${token.label}`}
                onClick={() => setSelected({ ...chip, x: clampX(chip.x), y: clampY(chip.y) })}
              >
                <span className="dm-chip-name">{chip.token.slice(2)}</span>
                <span className="dm-chip-value">{describeValue(token, value)}</span>
              </button>
            );
          })}
        </div>
      )}
      {selected && model && (
        <TokenPopover
          chip={selected}
          usage={usageCount(model.compiled, selected.token)}
          kindLabel={KIND_LABEL[selected.kind]}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
