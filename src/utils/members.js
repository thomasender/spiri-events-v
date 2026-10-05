// Pure helpers for the admin "Mitglieder" tab: search, filter, sort and
// export. Kept free of Firebase imports so they can be unit-tested.

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function matchesSearch(member, term) {
  const needle = norm(term);
  if (!needle) return true;
  return [member.displayName, member.username, member.email].some((v) => norm(v).includes(needle));
}

// listIds: when set, only members whose uid is in that Set pass.
export function filterMembers(
  members,
  { search = '', region = '', category = '', listUids = null } = {}
) {
  return members.filter((m) => {
    if (!matchesSearch(m, search)) return false;
    if (region && !(m.directoryRegions || []).includes(region)) return false;
    if (category && !(m.directoryCategories || []).includes(category)) return false;
    if (listUids && !listUids.has(m.uid)) return false;
    return true;
  });
}

export const SORT_KEYS = ['displayName', 'username', 'email', 'createdAt'];

export function sortMembers(members, key = 'displayName', direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  return [...members].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    // Empty values always sink to the bottom, regardless of direction.
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return String(av).localeCompare(String(bv), 'de', { sensitivity: 'base' }) * sign;
  });
}

export function memberProfilePath(member) {
  return member.slug ? `/${member.slug}` : '';
}

export const EXPORT_COLUMNS = [
  { key: 'displayName', label: 'Name' },
  { key: 'username', label: 'Benutzername' },
  { key: 'email', label: 'E-Mail' },
  { key: 'profile', label: 'Profil' },
  { key: 'regions', label: 'Bezirke' },
  { key: 'categories', label: 'Kategorien' },
  { key: 'createdAt', label: 'Registriert am' },
];

export function exportCell(member, key, origin = '') {
  switch (key) {
    case 'profile': {
      const path = memberProfilePath(member);
      return path ? `${origin}${path}` : '';
    }
    case 'regions':
      return (member.directoryRegions || []).join(', ');
    case 'categories':
      return (member.directoryCategories || []).join(', ');
    case 'createdAt':
      return member.createdAt ? member.createdAt.slice(0, 10) : '';
    default:
      return member[key] ?? '';
  }
}

// Spreadsheet apps execute cells starting with = + - @ as formulas; members
// control their own display name, so neutralise those with a leading quote.
function csvEscape(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function membersToCsv(members, origin = '') {
  const header = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(';');
  const rows = members.map((m) =>
    EXPORT_COLUMNS.map((c) => csvEscape(exportCell(m, c.key, origin))).join(';')
  );
  // BOM so Excel opens umlauts correctly; semicolon is the German CSV default.
  return `﻿${[header, ...rows].join('\r\n')}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Standalone printable document; the browser's "Als PDF speichern" turns it
// into the PDF export.
export function membersToPrintHtml(members, { title = 'Mitglieder', origin = '' } = {}) {
  const head = EXPORT_COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = members
    .map(
      (m) =>
        `<tr>${EXPORT_COLUMNS.map((c) => `<td>${escapeHtml(exportCell(m, c.key, origin))}</td>`).join('')}</tr>`
    )
    .join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font:12px/1.4 system-ui,sans-serif;margin:24px}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}</style></head>
<body><h1>${escapeHtml(title)} (${members.length})</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function downloadCsv(members, filename = 'mitglieder.csv') {
  const blob = new Blob([membersToCsv(members, window.location.origin)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function printMembers(members, title) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(membersToPrintHtml(members, { title, origin: window.location.origin }));
  w.document.close();
  w.focus();
  w.print();
  return true;
}
