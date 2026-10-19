import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The pages App.jsx loads on demand keep their stylesheets in the main CSS
// (src/lazyPageStyles/*), because some of them hold global rules other pages
// rely on. A stylesheet that is only reachable through a lazy page and missing
// from those lists would silently move into a lazy chunk and vanish from every
// other page until that page is opened.

const SRC = path.join(__dirname, '../../src');
const EXTS = ['', '.jsx', '.js', '.ts', '.tsx', '/index.jsx', '/index.js'];

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/')
    ? path.join(SRC, spec.slice(2))
    : path.resolve(path.dirname(from), spec);
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function staticImports(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const re = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  return [...text.matchAll(re)].map((m) => m[1]);
}

function stylesheetsReachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const css = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.endsWith('.css')) {
      css.add(file);
      return;
    }
    for (const spec of staticImports(file)) {
      const resolved = resolveImport(file, spec);
      if (resolved) visit(resolved);
    }
  };
  visit(entry);
  return css;
}

describe('stylesheets of lazily loaded pages', () => {
  const appFile = path.join(SRC, 'App.jsx');
  const lazyPages = [
    ...fs.readFileSync(appFile, 'utf8').matchAll(/lazyWithReload\(\(\) => import\('([^']+)'\)\)/g),
  ].map((m) => resolveImport(appFile, m[1])!);

  it('finds the lazy pages in App.jsx', () => {
    expect(lazyPages.length).toBeGreaterThan(5);
    expect(lazyPages.every(Boolean)).toBe(true);
  });

  it('are all in the main stylesheet (src/lazyPageStyles)', () => {
    // Everything the entry statically imports ends up in the main stylesheet.
    const eager = stylesheetsReachableFrom(path.join(SRC, 'main.jsx'));
    const missing = lazyPages
      .flatMap((page) => [...stylesheetsReachableFrom(page)])
      .filter((css) => !eager.has(css))
      .map((css) => path.relative(SRC, css));
    expect([...new Set(missing)]).toEqual([]);
  });
});
