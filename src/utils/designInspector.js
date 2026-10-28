import { LAYOUT_TOKENS_BY_NAME } from './layoutTokens';

// Works out, for a DOM element, which layout token controls which spacing
// side / font size, by reading the page's own stylesheets (the same trick the
// browser DevTools use). Only the Design-Modus calls this, and only on demand,
// so it costs regular visitors nothing.
//
// Why parse `cssText` instead of `rule.style`: browsers resolve shorthands that
// contain `var()` into empty longhands, so `padding: var(--a) var(--b)` would
// be unreadable through the CSSStyleDeclaration. The rule text keeps it intact.

// ── small parsing helpers (pure) ─────────────────────────────────────

/** Splits on `sep` outside of parentheses. */
export function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** [ids, classes/attributes/pseudo-classes, types/pseudo-elements] */
export function specificity(selector) {
  const s = selector
    .replace(/\[[^\]]*\]/g, ' [a] ')
    .replace(/:(?:not|is|where|has)\(([^)]*)\)/g, (_m, inner) => ` ${inner} `);
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const pseudoElements = (s.match(/::[\w-]+/g) || []).length;
  const classes =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[a\]/g) || []).length +
    (s.replace(/::[\w-]+/g, '').match(/:[\w-]+/g) || []).length;
  const types = (
    s
      .replace(/#[\w-]+|\.[\w-]+|\[a\]|::?[\w-]+(\([^)]*\))?/g, ' ')
      .match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []
  ).length;
  return [ids, classes, types + pseudoElements];
}

function compareSpecificity(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Declarations at the top level of a rule's `{ ... }` body. */
export function parseDeclarations(cssText) {
  const open = cssText.indexOf('{');
  const close = cssText.lastIndexOf('}');
  if (open === -1 || close === -1) return [];
  const body = cssText.slice(open + 1, close);
  const decls = [];
  let depth = 0;
  let paren = 0;
  let current = '';
  const flush = () => {
    const idx = current.indexOf(':');
    if (idx > 0) {
      let value = current.slice(idx + 1).trim();
      const important = /!\s*important$/i.test(value);
      if (important) value = value.replace(/!\s*important$/i, '').trim();
      decls.push({ prop: current.slice(0, idx).trim().toLowerCase(), value, important });
    }
    current = '';
  };
  for (const ch of body) {
    if (ch === '{') {
      // A nested rule starts: what we collected so far was its selector.
      if (depth === 0) current = '';
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
    } else if (depth === 0) {
      if (ch === '(') paren += 1;
      else if (ch === ')') paren -= 1;
      if (paren === 0 && ch === ';') flush();
      else current += ch;
    }
  }
  flush();
  return decls;
}

const SINGLE = new Set([
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'row-gap',
  'column-gap',
  'font-size',
  'line-height',
  'min-height',
  'max-height',
  'height',
  'border-radius',
]);

function box(prefix, parts) {
  const [a, b = a, c = a, d = b] = parts;
  return [
    [`${prefix}-top`, a],
    [`${prefix}-right`, b],
    [`${prefix}-bottom`, c],
    [`${prefix}-left`, d],
  ];
}

/** Expands one declaration into [longhand, valueFragment] pairs we understand. */
export function expandDeclaration(prop, value) {
  const parts = splitTopLevel(value, ' ');
  if (!parts.length) return [];
  if (prop === 'padding' || prop === 'margin') return parts.length <= 4 ? box(prop, parts) : [];
  if (prop === 'padding-inline' || prop === 'margin-inline') {
    const base = prop.split('-')[0];
    return [
      [`${base}-left`, parts[0]],
      [`${base}-right`, parts[1] ?? parts[0]],
    ];
  }
  if (prop === 'padding-block' || prop === 'margin-block') {
    const base = prop.split('-')[0];
    return [
      [`${base}-top`, parts[0]],
      [`${base}-bottom`, parts[1] ?? parts[0]],
    ];
  }
  if (prop === 'gap') {
    return [
      ['row-gap', parts[0]],
      ['column-gap', parts[1] ?? parts[0]],
    ];
  }
  if (SINGLE.has(prop)) return parts.length === 1 ? [[prop, parts[0]]] : [];
  return [];
}

/** Returns the known layout-token name inside `var(--name)`, else null. */
export function tokenOf(fragment) {
  const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(fragment);
  return m && LAYOUT_TOKENS_BY_NAME[m[1]] ? m[1] : null;
}

// ── stylesheet compilation ───────────────────────────────────────────

function safeMatches(el, selector) {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

/**
 * Reads every readable stylesheet once. `usage` counts how many declarations
 * reference each token — the "wirkt an N Stellen" figure.
 */
export function compileStyleSheets(doc = document) {
  const rules = [];
  const usage = new Map();
  let order = 0;

  const visit = (list) => {
    for (const rule of Array.from(list)) {
      if (rule.selectorText !== undefined && rule.cssText) {
        const decls = [];
        for (const d of parseDeclarations(rule.cssText)) {
          const refs = d.value.match(/var\(\s*--[\w-]+/g) || [];
          for (const ref of refs) {
            const name = ref.replace(/var\(\s*/, '');
            if (LAYOUT_TOKENS_BY_NAME[name]) usage.set(name, (usage.get(name) || 0) + 1);
          }
          for (const [prop, fragment] of expandDeclaration(d.prop, d.value)) {
            decls.push({ prop, token: tokenOf(fragment), important: d.important });
          }
        }
        if (decls.length) {
          order += 1;
          const selectors = splitTopLevel(rule.selectorText, ',').filter(
            (s) => !s.includes('::') && !/:(before|after)\b/.test(s)
          );
          rules.push({
            selectors: selectors.map((s) => ({ text: s, spec: specificity(s) })),
            decls,
            order,
          });
        }
      } else if (rule.cssRules) {
        // @media / @supports / @layer: descend only when the condition applies.
        let applies = true;
        if (rule.conditionText !== undefined && rule.media !== undefined) {
          applies =
            typeof window.matchMedia === 'function' &&
            window.matchMedia(rule.conditionText).matches;
        } else if (rule.media && rule.media.mediaText !== undefined) {
          applies =
            typeof window.matchMedia === 'function' &&
            window.matchMedia(rule.media.mediaText).matches;
        }
        if (applies) visit(rule.cssRules);
      }
    }
  };

  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin stylesheet (fonts, extensions): not ours, skip.
    }
  }
  return { rules, usage };
}

/**
 * For one element: { 'padding-top': 'card-padding token name' | null, ... }
 * following the cascade (importance, then specificity, then source order).
 */
export function resolveTokens(el, compiled) {
  const hits = [];
  for (const rule of compiled.rules) {
    let best = null;
    for (const sel of rule.selectors) {
      if ((!best || compareSpecificity(sel.spec, best) > 0) && safeMatches(el, sel.text)) {
        best = sel.spec;
      }
    }
    if (best) for (const decl of rule.decls) hits.push({ decl, spec: best, order: rule.order });
  }
  hits.sort((a, b) => {
    if (a.decl.important !== b.decl.important) return a.decl.important ? 1 : -1;
    const s = compareSpecificity(a.spec, b.spec);
    return s !== 0 ? s : a.order - b.order;
  });
  const result = {};
  for (const { decl } of hits) result[decl.prop] = decl.token;
  return result;
}

export function usageCount(compiled, tokenName) {
  return compiled.usage.get(tokenName) || 0;
}
