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
    case 'report.delivered':
      return wrap(`Report «${title}»`, `${s(data.period, 'Invio programmato')} · ${s(data.rows, '0')} righe. Il CSV è allegato all’email.`, `Report «${title}» · ${s(data.period, '')}`);
    case 'one_on_one.invite':
      return wrap(`Invito 1:1 con ${other}`, `${s(data.action, 'Aggiornato')} · ${s(data.when)}. Trovi l’invito nel calendario.`, `${s(data.action, 'Invito')}: 1:1 con ${other} · ${s(data.when)}`);
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
      return wrap(`Benvenuto/a in WorkingBetter`, `${s(data.tenantName)} ti ha invitato. Completa l'accesso con ${s(data.email)}: il link è valido 7 giorni.`, `Invito a WorkingBetter · ${s(data.tenantName)}`);
    case 'people.import.completed':
      return wrap(`Import persone completato`, `${s(data.created, '0')} create, ${s(data.updated, '0')} aggiornate, ${s(data.errors, '0')} errori`, 'Import persone completato');
    case 'review.launched':
      return wrap(`È iniziata la review "${s(data.cycleName)}"`, `${s(data.stageLabel, 'Compila la tua parte')}${data.dueDate ? ` entro ${s(data.dueDate)}` : ''}`, `Review "${s(data.cycleName)}": si parte`);
    case 'review.stage_due':
      return wrap(`Review "${s(data.cycleName)}": ${s(data.stageLabel)} in scadenza`, `${data.subjectName ? `Per ${s(data.subjectName)} · ` : ''}scadenza ${s(data.dueDate)}`, `Review in scadenza: ${s(data.stageLabel)}`);
    case 'review.shared':
      return wrap(`${from} ha condiviso la tua review`, `"${s(data.cycleName)}": leggila e conferma la presa visione`, 'La tua review è pronta');
    case 'review.signed':
      return wrap(`${from} ha firmato la review`, `"${s(data.cycleName)}"${data.disagreed ? ' · ha espresso dissenso' : ''}`, 'Review firmata');
    case 'user.password_reset':
      return wrap('Reimposta la password', 'Hai chiesto di reimpostare la password: usa il link (valido 1 ora).', 'Reimposta la tua password WorkingBetter');
    case 'survey.opened':
      return wrap(`Survey aperta: ${title}`, `${data.anonymous ? 'Anonima · ' : ''}rispondi entro ${s(data.closesAt)}`, `La tua opinione conta: ${title}`);
    case 'survey.reminder':
      return wrap(`Promemoria: ${title}`, `Mancano ${s(data.daysLeft)} giorni alla chiusura${data.anonymous ? ' · le risposte sono anonime' : ''}`, `Promemoria survey: ${title}`);
    case 'survey.closed':
      return wrap(`Survey chiusa: ${title}`, `${s(data.responded)} risposte su ${s(data.invited)} · risultati disponibili`, `Risultati pronti: ${title}`);
    case 'survey.shared':
      return wrap(`Risultati condivisi: ${title}`, 'L’HR ha pubblicato la sintesi dei risultati', `Risultati della survey ${title}`);
    case 'welfare.credited':
      return wrap(`Accreditati ${s(data.amount)} € di welfare`, `${s(data.planName)} · ${s(data.sourceName)}${data.expiresAt ? ` · da usare entro ${s(data.expiresAt)}` : ''}`, `Nuovo credito welfare: ${s(data.amount)} €`);
    case 'welfare.request_submitted':
      return wrap(`Richiesta welfare da verificare`, `${s(data.personName)} · ${s(data.categoryName)} · ${s(data.amount)} €`, 'Richiesta welfare in coda');
    case 'welfare.request_decided':
      return wrap(`Richiesta welfare ${s(data.outcome)}`, `${s(data.categoryName)} · ${s(data.amount)} €${data.note ? ` · ${s(data.note)}` : ''}`, `La tua richiesta welfare è stata ${s(data.outcome)}`);
    case 'welfare.budget_expiring':
      return wrap(`Credito welfare in scadenza`, `${s(data.amount)} € scadono il ${s(data.expiresAt)} (${s(data.daysLeft)} giorni)`, `Hai ${s(data.amount)} € di welfare in scadenza`);
    case 'welfare.threshold_near':
      return wrap(`Vicino alla soglia annua`, `${s(data.categoryName)}: ${s(data.cumulative)} € su ${s(data.threshold)} €`, 'Soglia welfare quasi raggiunta');
    case 'welfare.payroll_ready':
      return wrap(`Lotto payroll welfare pronto`, `${s(data.count)} voci per ${s(data.amount)} € · ${s(data.period)}`, 'Flusso payroll welfare da esportare');
    case 'form.assigned':
      return wrap(`Da compilare: ${title}`, `${data.dueDate ? `Entro ${s(data.dueDate)}` : 'Nessuna scadenza'}`, `Da compilare: ${title}`);
    default:
      return wrap(title || 'Notifica', s(data.body), title || 'Notifica da WorkingBetter');
  }
}

function wrap(title: string, body: string, emailSubject: string): RenderedNotification {
  return { title, body, emailSubject, emailText: `${title}\n\n${body}` };
}
