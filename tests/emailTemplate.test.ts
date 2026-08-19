import { describe, expect, it } from 'vitest';
import {
  candidateEmailHtml,
  candidateEmailSubject,
  candidateEmailText,
} from '../src/lib/email.js';

const base = { firstName: 'Adaeze', positionTitles: ['Process Technician', 'Electrical Specialist'], selectionUrl: 'https://x/s/T' };

const MSG2_SENTENCE =
  'We noticed that you applied for more than one position using different email addresses.';

describe('invitation message templates', () => {
  it('Message 2 adds the "different email addresses" paragraph; Message 1 does not', () => {
    const html1 = candidateEmailHtml({ ...base, template: 'message_1' });
    const html2 = candidateEmailHtml({ ...base, template: 'message_2' });
    expect(html1).not.toContain(MSG2_SENTENCE);
    expect(html2).toContain(MSG2_SENTENCE);
    expect(candidateEmailText({ ...base, template: 'message_2' })).toContain(MSG2_SENTENCE);
    expect(candidateEmailText({ ...base, template: 'message_1' })).not.toContain(MSG2_SENTENCE);
  });

  it('defaults to Message 1 when no template is given', () => {
    expect(candidateEmailHtml(base)).not.toContain(MSG2_SENTENCE);
  });

  it('both templates keep the shared verbatim copy and subject', () => {
    for (const template of ['message_1', 'message_2'] as const) {
      // Collapse HTML source whitespace so line-wrapped sentences match.
      const html = candidateEmailHtml({ ...base, template }).replace(/\s+/g, ' ');
      expect(html).toContain('Dear Adaeze,');
      expect(html).toContain('for the following positions:');
      expect(html).toContain('Process Technician and Electrical Specialist');
      expect(html).toContain('Once you confirm your choice, it cannot be changed.');
      expect(html).toContain('remotely monitored'); // N.B. paragraph
      expect(html).toContain('4pm WAT on Thursday, 20th August 2026');
      expect(html).toContain('Best regards');
    }
    // Subject pattern is identical for both templates.
    expect(candidateEmailSubject(base.positionTitles)).toBe(
      'ExxonMobil Affiliates in Nigeria Process Technician and Electrical Specialist Job Preferences'
    );
  });
});
