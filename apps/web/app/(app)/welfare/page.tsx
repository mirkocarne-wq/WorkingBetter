import Link from 'next/link';
import { apiFetch, eur, fmtDate, welfareKindLabel, welfareRequestStatusLabel, type Me, type WelfareOverview } from '@/lib/api';
import { cancelWelfareRequest, setWelfareDeclaration, toggleInitiative } from '@/lib/actions';
import { WelfareRequestForm } from '@/components/welfare-request-form';
import { PremiumChoice } from '@/components/premium-choice';

const movementLabel: Record<string, string> = { credit: 'Accredito', reserve: 'Prenotazione', release: 'Rilascio', spend: 'Spesa', refund: 'Storno', expire: 'Scadenza', adjust: 'Rettifica' };

export default async function WelfarePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const w = await apiFetch<WelfareOverview>('/welfare/me');
  const tab = sp.tab ?? 'home';
  const plan = w.plans[0] ?? null;
  const tabs: [string, string][] = [['home', 'Il mio welfare'], ['catalog', `Catalogo (${w.catalog.length})`], ['requests', `Richieste (${w.requests.length})`], ['movements', 'Movimenti'], ['initiatives', `Iniziative (${w.initiatives.length})`]];
  const open = w.requests.filter((r) => ['submitted', 'in_review', 'needs_docs'].includes(r.status));
  return (
    <>
      <div className="ph">
        <div><h1>Welfare</h1><p>{plan ? `${plan.name} · ${plan.periodStart} → ${plan.periodEnd}` : 'Nessun piano attivo per te al momento'}</p></div>
        {me.permissions.includes('welfare:manage') && <Link href="/welfare/admin" className="btn">Amministrazione</Link>}
      </div>
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="l">Disponibile</div><div className="v">{eur(w.balance.available)}</div><div className="d">saldo {eur(w.balance.balance)} · impegnato {eur(w.balance.reserved)}</div></div>
        <div className="card kpi"><div className="l">Speso nell’anno</div><div className="v">{eur(w.balance.spent)}</div><div className="d">accreditato {eur(w.balance.credited)}</div></div>
        <div className="card kpi"><div className="l">In scadenza (60 gg)</div><div className="v">{eur(w.expiringSoon)}</div><div className="d">{plan ? `regola di riporto: ${plan.rolloverRule === 'none' ? 'nessuno' : plan.rolloverRule === 'total' ? 'totale' : `${plan.rolloverPercent}%`}` : ''}</div></div>
        <div className="card kpi"><div className="l">Richieste in corso</div><div className="v">{open.length}</div><div className="d">{w.requests.filter((r) => r.status === 'needs_docs').length ? 'una richiede integrazioni' : 'nessuna azione richiesta'}</div></div>
      </div>
      <div className="tabs">{tabs.map(([k, l]) => <Link key={k} href={`/welfare?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</Link>)}</div>

      {tab === 'home' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card">
              <h3>Categorie e soglie {w.year} <small>cumulo annuo e limite di esenzione</small></h3>
              {w.categories.length === 0 ? <div className="empty">Nessuna categoria abilitata.</div> : w.categories.map((c) => {
                const pct = c.threshold ? Math.min(100, Math.round((c.used / c.threshold) * 100)) : null;
                return (
                  <div key={c.key} style={{ padding: '10px 0', borderBottom: '1px solid var(--grid)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><b>{c.name}</b><div className="sup">{c.description}</div></div><div className="num" style={{ whiteSpace: 'nowrap' }}>{c.threshold ? <><b>{eur(c.used)}</b> <span className="sup">su {eur(c.threshold)}</span></> : <span className="pill g">esente</span>}</div></div>
                    {pct != null && <div className={`bar ${pct >= 100 ? 'c' : pct >= 80 ? 'w' : ''}`} style={{ marginTop: 6 }}><i style={{ width: `${pct}%` }} /></div>}
                    {c.note && <div className="sup" style={{ marginTop: 4 }}>{c.note}</div>}
                  </div>
                );
              })}
            </div>
            {w.premium.map((p) => <PremiumChoice key={p.planId} premium={p} />)}
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {plan && <div className="card"><h3>Nuova richiesta</h3><WelfareRequestForm planId={plan.id} categories={w.categories} catalog={w.catalog} available={w.balance.available} /></div>}
            <div className="card">
              <h3>Dichiarazioni {w.year} <small>influenzano le soglie</small></h3>
              {(() => { const d = w.declarations.find((x) => x.key === 'children'); return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div><b>Figli fiscalmente a carico</b><div className="sup">Con figli a carico la soglia dei fringe benefit può essere più alta.</div></div>
                  <form action={setWelfareDeclaration.bind(null, w.year, 'children', !(d?.value ?? false))}><button className={`btn sm ${d?.value ? 'p' : ''}`}>{d?.value ? 'Sì, dichiarato' : 'No'}</button></form>
                </div>
              ); })()}
            </div>
            {plan?.regulation && <div className="card"><h3>Regolamento del piano</h3><p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13 }}>{plan.regulation}</p></div>}
          </div>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {w.catalog.length === 0 ? <div className="card empty">Il catalogo è vuoto.</div> : w.catalog.map((it) => (
            <div key={it.id} className="card">
              <div className="lvl">{welfareKindLabel[it.kind] ?? it.kind} · {w.categories.find((c) => c.key === it.categoryKey)?.name ?? it.categoryKey}</div>
              <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0' }}>{it.name}</div>
              <div className="sup">{it.description}</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>{it.price ? eur(it.price) : it.maxAmount ? `fino a ${eur(it.maxAmount)}` : 'importo libero'}</div>
              {plan && <details style={{ marginTop: 8 }}><summary className="btn sm" style={{ display: 'inline-flex' }}>Richiedi</summary><div style={{ marginTop: 8 }}><WelfareRequestForm planId={plan.id} categories={w.categories} catalog={w.catalog} available={w.balance.available} itemId={it.id} /></div></details>}
            </div>
          ))}
        </div>
      )}

      {tab === 'requests' && (
        <div className="card">
          {w.requests.length === 0 ? <div className="empty">Nessuna richiesta.</div> : (
            <table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th className="num">Importo</th><th>Stato</th><th>Esito</th><th></th></tr></thead>
              <tbody>{w.requests.map((r) => { const st = welfareRequestStatusLabel[r.status] ?? { text: r.status, cls: 'n' }; return <tr key={r.id}><td>{fmtDate(r.createdAt)}</td><td>{welfareKindLabel[r.kind] ?? r.kind}</td><td>{w.categories.find((c) => c.key === r.categoryKey)?.name ?? r.categoryKey}{r.beneficiaryName ? <div className="sup">per {r.beneficiaryName}</div> : null}</td><td className="num">{eur(r.amount)}{Number(r.taxablePortion) > 0 && <div className="sup">di cui {eur(r.taxablePortion)} imponibili</div>}</td><td><span className={`pill ${st.cls}`}>{st.text}</span></td><td className="sup">{r.voucherCode ? <>codice <code>{r.voucherCode}</code></> : r.reviewNote ?? ''}</td><td>{['submitted', 'in_review', 'needs_docs'].includes(r.status) && <form action={cancelWelfareRequest.bind(null, r.id)}><button className="btn sm">Annulla</button></form>}</td></tr>; })}</tbody></table>
          )}
        </div>
      )}

      {tab === 'movements' && (
        <div className="card">
          {w.movements.length === 0 ? <div className="empty">Nessun movimento.</div> : (
            <table><thead><tr><th>Data</th><th>Movimento</th><th>Dettaglio</th><th className="num">Importo</th><th>Scadenza</th></tr></thead>
              <tbody>{w.movements.map((m) => <tr key={m.id}><td>{fmtDate(m.createdAt)}</td><td><span className={`pill ${m.kind === 'credit' || m.kind === 'adjust' || m.kind === 'refund' || m.kind === 'release' ? 'g' : m.kind === 'reserve' ? 'w' : 'n'}`}>{movementLabel[m.kind] ?? m.kind}</span></td><td>{m.note}{m.categoryKey ? <span className="sup"> · {w.categories.find((c) => c.key === m.categoryKey)?.name ?? m.categoryKey}</span> : null}</td><td className="num">{['spend', 'expire', 'reserve'].includes(m.kind) ? '−' : '+'}{eur(m.amount)}</td><td className="sup">{m.expiresAt ?? ''}</td></tr>)}</tbody></table>
          )}
        </div>
      )}

      {tab === 'initiatives' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {w.initiatives.length === 0 ? <div className="card empty">Nessuna iniziativa attiva.</div> : w.initiatives.map((i) => (
            <div key={i.id} className="card">
              <div className="lvl">{i.kind === 'convention' ? 'Convenzione' : i.kind === 'program' ? 'Programma' : 'Evento'}{i.capacity != null ? ` · ${i.members}/${i.capacity} posti` : ` · ${i.members} adesioni`}</div>
              <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0' }}>{i.name}</div>
              <div className="sup">{i.description}</div>
              {i.howTo && <div style={{ fontSize: 13, marginTop: 6 }}><b>Come aderire:</b> {i.howTo}</div>}
              <form action={toggleInitiative.bind(null, i.id, !i.joined)} style={{ marginTop: 10 }}><button className={`btn sm ${i.joined ? '' : 'p'}`} disabled={!i.joined && i.capacity != null && i.members >= i.capacity}>{i.joined ? 'Rinuncia' : i.capacity != null && i.members >= i.capacity ? 'Posti esauriti' : 'Aderisci'}</button></form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
