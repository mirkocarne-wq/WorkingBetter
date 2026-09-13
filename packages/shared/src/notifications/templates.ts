import type { NotificationType } from './types.js';

export interface RenderedNotification {
  title: string;
  body: string;
  emailSubject: string;
  emailText: string;
}

type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown, fallback = '') => (v == null || v === '' ? fallback : String(v));

/**
 * Template in italiano (i18n in Fase 2). `data` porta i nomi già risolti (es. fromName) per non
 * dipendere dal database in fase di rendering.
 */
export function renderNotification(type: NotificationType, data: Data = {}): RenderedNotification {
  const from = s(data.fromName, 'Un collega');
  const other = s(data.otherName, 'una persona');
  const title = s(data.title);
  switch (type) {
    case 'feedback.received':
      return wrap(`${from} ti ha dato un feedback`, s(data.preview), 'Hai ricevuto un feedback');
    case 'feedback.request.received':
      return wrap(`${from} ti chiede un feedback${data.aboutName ? ` su ${s(data.aboutName)}` : ''}`, `"${s(data.question)}"`, 'Richiesta di feedback');
    case 'recognition.received':
      return wrap(`${from} ti ha riconosciuto pubblicamente`, s(data.preview), 'Hai ricevuto un riconoscimento');
    case 'one_on_one.scheduled':
      return wrap(`Nuovo 1:1 con ${other}`, `Primo incontro: ${s(data.when, 'da pianificare')}`, `1:1 con ${other}`);
    case 'one_on_one.reminder':
      return wrap(`1:1 con ${other} tra poco`, `${s(data.when)} · ${s(data.pendingPoints, '0')} punti in agenda. Aggiungi i tuoi.`, `Promemoria 1:1 con ${other}`);
    case 'action_item.assigned':
      return wrap(`Nuova azione: ${title}`, `${data.dueDate ? `Entro ${s(data.dueDate)} · ` : ''}assegnata da ${from}`, 'Nuova azione assegnata');
    case 'action_item.overdue':
      return wrap(`Azione scaduta: ${title}`, `Scadenza ${s(data.dueDate)}`, 'Hai un\'azione scaduta');
    case 'objective.check_in_due':
      return wrap(`Check-in in ritardo: ${title}`, `Ultimo aggiornamento ${s(data.lastCheckIn, 'mai')}. Aggiorna il key result.`, 'Check-in in ritardo');
    case 'objective.off_track':
      return wrap(`Obiettivo off track: ${title}`, `${s(data.ownerName)} ha segnalato difficoltà${data.comment ? `: "${s(data.comment)}"` : ''}`, 'Un obiettivo del tuo team è off track');
    case 'person.invited':
      return wrap(`Benvenuto/a in WorkingBetter`, `${s(data.tenantName)} ti ha invitato. Accedi con ${s(data.email)}.`, `Invito a WorkingBetter · ${s(data.tenantName)}`);
    case 'people.import.completed':
      return wrap(`Import persone completato`, `${s(data.created, '0')} create, ${s(data.updated, '0')} aggiornate, ${s(data.errors, '0')} errori`, 'Import persone completato');
    case 'form.assigned':
      return wrap(`Da compilare: ${title}`, `${data.dueDate ? `Entro ${s(data.dueDate)}` : 'Nessuna scadenza'}`, `Da compilare: ${title}`);
    default:
      return wrap(title || 'Notifica', s(data.body), title || 'Notifica da WorkingBetter');
  }
}

function wrap(title: string, body: string, emailSubject: string): RenderedNotification {
  return { title, body, emailSubject, emailText: `${title}\n\n${body}` };
}
