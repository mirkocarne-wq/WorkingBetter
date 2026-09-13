import { describe, expect, it } from 'vitest';
import { toMailOptions } from '../src/jobs/email-dispatch.js';

describe('email con allegati iCalendar', () => {
  it('mappa l’invito .ics su icalEvent con il METHOD e gli altri allegati su attachments', () => {
    const opts = toMailOptions('WorkingBetter <no-reply@wb.test>', {
      to: 'l@acme.test',
      toName: 'Luca Bianchi',
      subject: 'Invito',
      text: 'ciao',
      attachments: [
        { filename: 'invite.ics', contentType: 'text/calendar; charset=utf-8', content: 'BEGIN:VCALENDAR', method: 'REQUEST' },
        { filename: 'note.txt', contentType: 'text/plain', content: 'x' },
      ],
    });
    expect(opts.to).toBe('"Luca Bianchi" <l@acme.test>');
    expect(opts.icalEvent).toEqual({ method: 'REQUEST', filename: 'invite.ics', content: 'BEGIN:VCALENDAR' });
    expect(opts.attachments).toEqual([{ filename: 'note.txt', contentType: 'text/plain', content: 'x', encoding: 'utf8' }]);
  });
  it('senza allegati non aggiunge campi', () => {
    const opts = toMailOptions('a@b', { to: 'x@y', subject: 's', text: 't' });
    expect('icalEvent' in opts).toBe(false);
    expect('attachments' in opts).toBe(false);
  });
});
