/**
 * Render the candidate email to disk for visual QA — no send.
 *
 *   npm run email:preview
 *
 * Writes emails/preview.html and emails/preview.txt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateEmailHtml, candidateEmailText } from '../src/lib/email.js';

const sample = {
  positionTitles: ['Process Technician', 'Electrical Specialist'],
  selectionUrl: 'https://select.dragnet-solutions.com/s/EXAMPLE-RAW-TOKEN-DO-NOT-USE',
};

const dir = join(process.cwd(), 'emails');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'preview.html'), candidateEmailHtml(sample), 'utf8');
writeFileSync(join(dir, 'preview.txt'), candidateEmailText(sample), 'utf8');
console.log('Wrote emails/preview.html and emails/preview.txt');
