import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, type Me, type MeetingDetail, type Relation, type SlotProposal, type Suggestion } from '@/lib/api';
import { addActionItem, addTalkingPoint, cancelMeeting, completeMeeting, rescheduleMeeting, saveNote, setActionStatus, setMeetingUrl, toggleTalkingPoint } from '@/lib/actions';


export default async function RelationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ meeting?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  let rel: Relation & { meetings: { id: string; scheduledAt: string; status: string }[]; openActionItems: { id: string; title: string; ownerPersonId: string; dueDate: string | null; status: string }[] };
  try {
    rel = await apiFetch(`/one-on-ones/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const me = await apiFetch<Me>('/me');
  const meetingId = sp.meeting ?? rel.nextMeeting?.id ?? rel.meetings[0]?.id;
  const [meeting, suggestions, slots] = await Promise.all([meetingId ? apiFetch<MeetingDetail>(`/meetings/${meetingId}`) : null, apiFetch<Suggestion[]>(`/one-on-ones/${id}/suggestions`), apiFetch<SlotProposal>(`/one-on-ones/${id}/slots`).catch(() => null)]);
  const fmtSlot = (iso: string) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: slots?.timeZone ?? 'Europe/Rome' }).format(new Date(iso));
  const toLocalInput = (iso: string) => { const d = new Date(iso); const p2 = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const other = rel.other;
  const myId = me.person!.id;
  const nameOf = (pid: string) => (pid === myId ? me.person!.firstName : other.firstName);
  const open = meeting?.status === 'scheduled';
  return (
    <>
      <div className="ph">
        <div><h1>1:1 con {other.firstName} {other.lastName}</h1><p>{meeting ? `${fmtDate(meeting.scheduledAt)} · ${meeting.durationMin} min · ${meeting.status === 'done' ? 'concluso' : 'pianificato'}` : 'Nessun incontro'} · ogni {rel.cadenceDays ?? '—'} giorni · {rel.meetings.filter((m) => m.status === 'done').length} incontri fatti</p></div>
        <div className="actions">
          <Link href="/one-on-ones" className="btn">Tutti i 1:1</Link>
          {rel.meetingUrl && open && <a href={rel.meetingUrl} target="_blank" rel="noreferrer" className="btn">Entra nella videocall</a>}
          {meeting && open && <a href={`/api/export?report=meeting-ics&meetingId=${meeting.id}`} className="btn" title="Scarica l’invito .ics (arriva anche via email)">Aggiungi al calendario</a>}
          {open && meeting && <form action={completeMeeting.bind(null, meeting.id, id)}><button className="btn p">Chiudi incontro</button></form>}
        </div>
      </div>
      {!meeting ? <div className="card empty">Nessun incontro pianificato.</div> : (
        <div className="grid" style={{ gridTemplateColumns: '300px 1fr 280px', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card">
              <h3>Agenda <small>{meeting.talkingPoints.length} punti</small></h3>
              {meeting.talkingPoints.map((tp) => (
                <form key={tp.id} action={toggleTalkingPoint.bind(null, tp.id, id, !tp.discussed)} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--grid)', alignItems: 'flex-start' }}>
                  <button title={tp.discussed ? 'Segna come non discusso' : 'Segna come discusso'} disabled={!open} style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--line)', background: tp.discussed ? 'var(--brand)' : '#fff', cursor: 'pointer', flex: 'none', marginTop: 2 }} />
                  <div><div style={{ textDecoration: tp.discussed ? 'line-through' : 'none', color: tp.discussed ? 'var(--muted)' : 'inherit' }}>{tp.text}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{tp.source === 'carry_over' ? 'Riportato dall\'incontro precedente' : tp.source === 'manual' ? `Aggiunto da ${tp.authorPersonId ? nameOf(tp.authorPersonId) : '—'}` : `Suggerito · ${tp.source}`}</div></div>
                </form>
              ))}
              {open && <form action={addTalkingPoint.bind(null, meeting.id, id)} style={{ marginTop: 10, display: 'flex', gap: 6 }}><input name="text" placeholder="Aggiungi un punto…" className="input" required /><button className="btn sm">＋</button></form>}
            </div>
            {suggestions.length > 0 && open && (
              <div className="suggest">
                <b>Suggerimenti</b>
                {suggestions.map((s) => (
                  <form key={s.refId + s.type} action={addTalkingPoint.bind(null, meeting.id, id)} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                    <input type="hidden" name="text" value={s.text} /><input type="hidden" name="source" value={s.refType === 'objective' ? 'objective' : s.refType === 'action_item' ? 'action_item' : s.refType === 'dev_action' ? 'manual' : 'feedback'} /><input type="hidden" name="refType" value={s.refType} /><input type="hidden" name="refId" value={s.refId} />
                    <span style={{ flex: 1 }}>{s.severity === 'crit' ? '🔴' : s.severity === 'warn' ? '🟡' : '🔵'} {s.text}</span><button className="btn sm">Aggiungi</button>
                  </form>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3>Note condivise <small>visibili a te e {other.firstName}</small></h3>
            <form action={saveNote.bind(null, meeting.id, id, 'shared')}>
              <textarea name="body" defaultValue={meeting.sharedNote} rows={12} className="input" style={{ resize: 'vertical' }} placeholder="Decisioni, contesto, cose da ricordare…" />
              <div style={{ marginTop: 8 }}><button className="btn sm">Salva note condivise</button></div>
            </form>
            <h3 style={{ marginTop: 18 }}>Note private <small>🔒 solo tu · cifrate</small></h3>
            <form action={saveNote.bind(null, meeting.id, id, 'private')}>
              <textarea name="body" defaultValue={meeting.privateNote} rows={5} className="input" style={{ resize: 'vertical', background: '#fffdf3' }} />
              <div style={{ marginTop: 8 }}><button className="btn sm">Salva note private</button></div>
            </form>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card">
              <h3>Action item <small>{rel.openActionItems.length} aperti</small></h3>
              {rel.openActionItems.map((a) => (
                <form key={a.id} action={setActionStatus.bind(null, a.id, id, 'done')} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                  <button title="Segna come fatta" style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--line)', background: '#fff', cursor: 'pointer', flex: 'none', marginTop: 2 }} />
                  <div><div>{a.title}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{nameOf(a.ownerPersonId)}{a.dueDate ? ` · entro ${fmtDate(a.dueDate)}` : ''}{a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10) ? <span className="pill c" style={{ marginLeft: 6 }}>Scaduta</span> : null}</div></div>
                </form>
              ))}
              <form action={addActionItem.bind(null, meeting.id, id)} style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                <input name="title" placeholder="Nuova azione…" className="input" required />
                <div style={{ display: 'flex', gap: 6 }}>
                  <select name="ownerPersonId" className="input" style={{ width: 'auto', flex: 1 }}><option value={myId}>{me.person!.firstName}</option><option value={other.id}>{other.firstName}</option></select>
                  <input name="dueDate" type="date" className="input" style={{ width: 'auto' }} />
                  <button className="btn sm">＋</button>
                </div>
              </form>
            </div>
            {open && meeting && (
              <div className="card">
                <h3>Quando <small>invito .ics a entrambi</small></h3>
                {slots && slots.slots.length > 0 && (
                  <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
                    <div className="sup">Slot liberi proposti (orario di lavoro, senza altri 1:1):</div>
                    {slots.slots.map((iso) => (
                      <form key={iso} action={rescheduleMeeting.bind(null, meeting.id, id)}><input type="hidden" name="scheduledAt" value={iso} /><button className="btn sm" style={{ width: '100%', justifyContent: 'flex-start' }}>📅 {fmtSlot(iso)}</button></form>
                    ))}
                  </div>
                )}
                <form action={rescheduleMeeting.bind(null, meeting.id, id)} className="stack" style={{ gap: 6 }}>
                  <label className="field"><span className="lab">Altra data e ora</span><input name="scheduledAt" type="datetime-local" defaultValue={toLocalInput(meeting.scheduledAt)} className="input" required /></label>
                  <div className="row"><input name="durationMin" type="number" min={10} max={240} defaultValue={meeting.durationMin} className="input" style={{ width: 90 }} aria-label="Durata in minuti" /><span className="sup">min</span><button className="btn sm">Riprogramma</button></div>
                </form>
                <form action={setMeetingUrl.bind(null, id)} className="row" style={{ marginTop: 10 }}>
                  <input name="meetingUrl" type="url" defaultValue={rel.meetingUrl ?? ''} placeholder="Link videocall (Meet, Teams, Zoom…)" className="input" style={{ flex: 1, minWidth: 160 }} />
                  <button className="btn sm">Salva link</button>
                </form>
                <form action={cancelMeeting.bind(null, meeting.id, id)} style={{ marginTop: 10 }}><button className="btn sm danger">Annulla questo incontro</button></form>
              </div>
            )}
            <div className="card">
              <h3>Storico</h3>
              {rel.meetings.map((m) => <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)', fontSize: 13 }}><Link href={`/one-on-ones/${id}?meeting=${m.id}`} style={{ fontWeight: m.id === meeting.id ? 700 : 500 }}>{fmtDate(m.scheduledAt)}</Link> <span className={`pill ${m.status === 'done' ? 'g' : m.status === 'scheduled' ? 'b' : 'n'}`} style={{ marginLeft: 6 }}>{m.status === 'done' ? 'fatto' : m.status === 'scheduled' ? 'pianificato' : m.status}</span></div>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
