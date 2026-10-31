// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  REJECTION_TEMPLATES,
  MAX_REJECTION_REASON_LENGTH,
  buildRejectionTemplate,
  latestStaffMessage,
  rejectionReasonFromMessage,
} from '../../src/utils/rejectionTemplates';

const ts = (ms: number) => ({ toMillis: () => ms });

describe('rejection templates', () => {
  it('offers the ten agreed reasons, ending with a free text', () => {
    expect(REJECTION_TEMPLATES).toHaveLength(10);
    expect(new Set(REJECTION_TEMPLATES.map((t) => t.id)).size).toBe(10);
    expect(REJECTION_TEMPLATES[2].paragraphs.join(' ')).toContain('Veranstalterverzeichnis');
    expect(REJECTION_TEMPLATES[3].paragraphs.join(' ')).toContain('Frag uns gerne');
    expect(buildRejectionTemplate('freitext', 'Lars')).toContain(
      'Leider können wir dein Event nicht freigeben, weil …'
    );
  });

  it('greets by name (escaped), closes friendly and names no region', () => {
    for (const { id } of REJECTION_TEMPLATES) {
      const html = buildRejectionTemplate(id, 'Lars');
      expect(html.startsWith('<p>Hallo Lars,</p>')).toBe(true);
      expect(html).toContain('Liebe Grüße');
      expect(html).not.toMatch(/Vorarlberg|Tirol/);
    }
    expect(buildRejectionTemplate('doppelt', '<b>X</b>')).toContain('Hallo &lt;b&gt;X&lt;/b&gt;,');
    expect(buildRejectionTemplate('doppelt', '')).toMatch(/^<p>Hallo,<\/p>/);
    expect(buildRejectionTemplate('gibt-es-nicht', 'Lars')).toBe('');
  });
});

describe('latestStaffMessage', () => {
  it('picks the newest staff message with text, ignoring organizer replies', () => {
    const messages = [
      { id: 'a', authorRole: 'Admin', text: '<p>alt</p>', createdAt: ts(1) },
      { id: 'u', authorRole: 'User', text: '<p>Antwort</p>', createdAt: ts(3) },
      { id: 'b', authorRole: 'Admin', text: '<p>neu</p>', createdAt: ts(2) },
      { id: 'e', authorRole: 'Admin', text: '<p></p>', createdAt: ts(4) },
    ];
    expect(latestStaffMessage(messages)?.id).toBe('b');
  });

  it('returns null without staff messages', () => {
    expect(latestStaffMessage([{ id: 'u', authorRole: 'User', text: 'hi' }])).toBeNull();
    expect(latestStaffMessage(undefined)).toBeNull();
  });
});

describe('rejectionReasonFromMessage', () => {
  it('turns rich text into plain lines', () => {
    expect(
      rejectionReasonFromMessage('<p>Hallo Lars,</p><p>leider <b>nicht</b> &amp; so.</p>')
    ).toBe('Hallo Lars,\nleider nicht & so.');
    expect(rejectionReasonFromMessage(undefined)).toBe('');
  });

  it('stays within the Firestore limit', () => {
    const reason = rejectionReasonFromMessage(`<p>${'x'.repeat(3000)}</p>`);
    expect(reason.length).toBeLessThanOrEqual(MAX_REJECTION_REASON_LENGTH);
  });
});
