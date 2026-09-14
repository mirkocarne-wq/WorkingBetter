import { apiFetch, fmtDate, initials, type CompanyValue, type Feedback, type FeedbackRequestInbox, type Me, type Person, type Recognition } from '@/lib/api';
import { acknowledgeFeedback, createCompanyValue, giveFeedback, giveRecognition, react, requestFeedback, shareWithManager } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';

const kindLabel: Record<string, string> = { praise: 'Apprezzamento', suggestion: 'Suggerimento', observation: 'Osservazione' };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'feed' } = await searchParams;
  const [me, people, values, received, given, inbox, feed] = await Promise.all([
    apiFetch<Me>('/me'),
    apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items),
    apiFetch<CompanyValue[]>('/company-values'),
    apiFetch<{ items: Feedback[] }>('/feedback?box=received').then((r) => r.items),
    apiFetch<{ items: Feedback[] }>('/feedback?box=given').then((r) => r.items),
    apiFetch<FeedbackRequestInbox[]>('/feedback-requests?box=inbox&status=pending'),
    apiFetch<{ items: Recognition[] }>('/recognitions?scope=company').then((r) => r.items),
  ]);
  const myId = me.person?.id;
  const others = people.filter((p) => p.id !== myId);
  const byId = new Map(people.map((p) => [p.id, p]));
  const tabs = [['feed', 'Riconoscimenti'], ['received', `Ricevuti (${received.length})`], ['given', 'Dati'], ['requests', `Richieste (${inbox.length})`]];
  return (
    <>
      <div className="ph"><div><h1>Feedback e riconoscimenti</h1><p>Dai feedback in pochi secondi, chiedilo quando serve, riconosci chi vive i valori</p></div></div>
      <div className="tabs">{tabs.map(([k, l]) => <a key={k} href={`/feedback?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</a>)}</div>
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          {tab === 'feed' && (feed.length === 0 ? <div className="card empty">Ancora nessun riconoscimento. Sii la prima persona!</div> : feed.map((r) => (
            <div key={r.id} className="card">
              <div className="who"><span className="av s">{r.from ? initials(r.from) : '?'}</span><div><div className="n">{r.from?.firstName} {r.from?.lastName} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>→</span> {r.recipients.map((x) => `${x.firstName ?? ''} ${x.lastName ?? ''}`).join(', ')}</div><div className="r">{fmtDate(r.createdAt)}</div></div></div>
              <p style={{ margin: '10px 0', fontSize: 15 }}>{r.message}</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {r.values.map((v) => <span key={v.id} className="pill b">{v.icon ?? '🏅'} {v.name}</span>)}
                <span style={{ flex: 1 }} />
                <form action={react.bind(null, r.id)}><button className="btn sm">👏 {r.reactions.find((x) => x.emoji === '👏')?.count ?? 0}</button></form>
              </div>
            </div>
          )))}
          {tab === 'received' && (received.length === 0 ? <div className="card empty">Nessun feedback ricevuto.</div> : received.map((f) => (
            <div key={f.id} className="card" style={{ borderLeft: `3px solid ${f.kind === 'praise' ? 'var(--good)' : 'var(--warn)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{f.from?.firstName} {f.from?.lastName}</b><span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(f.createdAt)} · {kindLabel[f.kind]} · {f.visibility === 'manager' ? 'condiviso con il manager' : 'solo tu'}</span></div>
              <p style={{ margin: '8px 0' }}>{f.body}</p>
              {f.value && <span className="pill b">{f.value.icon ?? '🏅'} {f.value.name}</span>}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {!f.acknowledgedAt && <form action={acknowledgeFeedback.bind(null, f.id, true)}><button className="btn sm">👍 Utile</button></form>}
                {f.acknowledgedAt && <span className="pill g">Letto{f.helpful ? ' · utile' : ''}</span>}
                {f.visibility !== 'manager' && <form action={shareWithManager.bind(null, f.id)}><button className="btn sm">Condividi con il manager</button></form>}
              </div>
            </div>
          )))}
          {tab === 'given' && (given.length === 0 ? <div className="card empty">Non hai ancora dato feedback.</div> : given.map((f) => (
            <div key={f.id} className="card"><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>A {f.to?.firstName} {f.to?.lastName}</b><span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(f.createdAt)} · {kindLabel[f.kind]}</span></div><p style={{ margin: '8px 0 0' }}>{f.body}</p></div>
          )))}
          {tab === 'requests' && (inbox.length === 0 ? <div className="card empty">Nessuna richiesta in sospeso.</div> : inbox.map((r) => {
            const about = byId.get(r.request.aboutPersonId);
            const requester = byId.get(r.request.requesterPersonId);
            return (
              <div key={r.recipientId} className="card">
                <div><b>{requester?.firstName} {requester?.lastName}</b> chiede un feedback {about?.id === requester?.id ? 'su di sé' : `su ${about?.firstName} ${about?.lastName}`}</div>
                <p style={{ margin: '6px 0 10px', color: 'var(--ink2)' }}>"{r.request.question}"</p>
                <form action={giveFeedback} style={{ display: 'grid', gap: 6 }}>
                  <input type="hidden" name="toPersonId" value={r.request.aboutPersonId} /><input type="hidden" name="requestRecipientId" value={r.recipientId} /><input type="hidden" name="visibility" value="private" />
                  <select name="kind" className="input"><option value="praise">Apprezzamento</option><option value="suggestion">Suggerimento</option><option value="observation">Osservazione</option></select>
                  <textarea name="body" rows={3} required placeholder="Situazione, comportamento, impatto…" className="input" style={{ resize: 'vertical' }} />
                  <div><button className="btn p sm">Rispondi</button></div>
                </form>
              </div>
            );
          }))}
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Dai un riconoscimento <small>pubblico</small></h3>
            <form action={giveRecognition} style={{ display: 'grid', gap: 8 }}>
              <select name="recipientPersonId" required className="input">{others.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select>
              <textarea name="message" rows={3} required placeholder="Cosa ha fatto di speciale?" className="input" style={{ resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{values.map((v) => <label key={v.id} className="pill n" style={{ cursor: 'pointer' }}><input type="checkbox" name="valueIds" value={v.id} style={{ marginRight: 4 }} />{v.icon ?? '🏅'} {v.name}</label>)}</div>
              <div><button className="btn p sm">Pubblica</button></div>
            </form>
          </div>
          <div className="card">
            <h3>Dai un feedback <small>privato</small></h3>
            <form action={giveFeedback} style={{ display: 'grid', gap: 8 }}>
              <select name="toPersonId" required className="input">{others.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select>
              <div style={{ display: 'flex', gap: 6 }}>
                <select name="kind" className="input"><option value="praise">Apprezzamento</option><option value="suggestion">Suggerimento</option><option value="observation">Osservazione</option></select>
                <select name="visibility" className="input"><option value="private">Solo destinatario</option><option value="manager">Anche al suo manager</option></select>
              </div>
              <select name="valueId" className="input"><option value="">Nessun valore collegato</option>{values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
              <textarea name="body" rows={3} required placeholder="Situazione → comportamento → impatto" className="input" style={{ resize: 'vertical' }} />
              <div><button className="btn sm">Invia</button></div>
            </form>
          </div>
          {me.permissions.includes('values:manage') && (
            <div className="card">
              <h3>Valori aziendali <small>{values.length} attivi · collegati ai riconoscimenti</small></h3>
              {values.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{values.map((v) => <span key={v.id} className="pill b" title={v.description ?? ''}>{v.icon ?? '🏅'} {v.name}</span>)}</div>}
              <ActionForm action={createCompanyValue} style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}><input name="icon" placeholder="🏅" className="input" style={{ width: 64 }} maxLength={8} /><input name="name" required placeholder="Nome del valore" className="input" style={{ flex: 1 }} maxLength={60} /></div>
                <input name="description" placeholder="Una frase che lo spiega" className="input" maxLength={400} />
                <div><button className="btn sm">Aggiungi valore</button></div>
              </ActionForm>
            </div>
          )}
          <div className="card">
            <h3>Chiedi un feedback</h3>
            <form action={requestFeedback} style={{ display: 'grid', gap: 8 }}>
              <select name="recipientPersonIds" multiple size={4} required className="input">{others.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select>
              <input name="question" required placeholder='es. "Come ho gestito il rilascio 3.2?"' className="input" />
              <div><button className="btn sm">Chiedi</button></div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
