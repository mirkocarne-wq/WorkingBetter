import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, eur, fmtDate, welfareKindLabel, welfareRequestStatusLabel, type Me, type Person, type WelfareBatch, type WelfareCatalogItem, type WelfarePlan, type WelfareRequest } from '@/lib/api';
import { activateWelfarePlan, addWelfareSource, adjustWelfare, closeWelfarePlan, confirmPayrollBatch, createCatalogItem, createInitiative, createPayrollBatch, createWelfarePlan, decideWelfareRequest, loadWelfarePresets } from '@/lib/actions';

const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, font: 'inherit', background: '#fff' } as const;
interface Category { id: string; key: string; name: string; regime: string }
interface Threshold { id: string; categoryKey: string; condition: string | null; amount: string }

export default async function WelfareAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; plan?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('welfare:manage')) redirect('/welfare');
  const year = new Date().getFullYear();
  const tab = sp.tab ?? 'requests';
  const [plans, categories, thresholds, queue, catalog, batches, units, people, preview] = await Promise.all([
    apiFetch<WelfarePlan[]>('/welfare/plans'),
    apiFetch<Category[]>('/welfare/categories'),
    apiFetch<Threshold[]>(`/welfare/thresholds?year=${year}`),
    apiFetch<WelfareRequest[]>('/welfare/requests?status=open'),
    apiFetch<WelfareCatalogItem[]>('/welfare/catalog'),
    apiFetch<WelfareBatch[]>('/welfare/payroll/batches').catch(() => [] as WelfareBatch[]),
    apiFetch<{ id: string; name: string }[]>('/org-units'),
    apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items),
    apiFetch<{ count: number; total: number; taxable: number }>('/welfare/payroll/preview').catch(() => null),
  ]);
  const selectedPlan = sp.plan ? await apiFetch<WelfarePlan>(`/welfare/plans/${sp.plan}`).catch(() => null) : null;
  const catName = (k: string) => categories.find((c) => c.key === k)?.name ?? k;
  const tabs: [string, string][] = [['requests', `Da verificare (${queue.length})`], ['plans', `Piani (${plans.length})`], ['catalog', `Catalogo (${catalog.length})`], ['categories', 'Categorie e soglie'], ['payroll', `Payroll${preview?.count ? ` (${preview.count})` : ''}`]];
  return (
    <>
      <div className="ph"><div><h1>Welfare · amministrazione</h1><p>{plans.filter((p) => p.status === 'active').length} piani attivi · {categories.length} categorie · anno fiscale {year}</p></div><Link href="/welfare" className="btn">Il mio welfare</Link></div>
      <div className="tabs">{tabs.map(([k, l]) => <Link key={k} href={`/welfare/admin?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</Link>)}</div>

      {tab === 'requests' && (
        <div className="card">
          <h3>Coda di verifica <small>i dettagli sono visibili solo a chi approva</small></h3>
          {queue.length === 0 ? <div className="empty">Nessuna richiesta in attesa.</div> : (
            <table><thead><tr><th>Data</th><th>Persona</th><th>Tipo</th><th>Categoria</th><th className="num">Importo</th><th>Documenti</th><th>Stato</th><th>Decisione</th></tr></thead>
              <tbody>{queue.map((r) => { const st = welfareRequestStatusLabel[r.status]!; return (
                <tr key={r.id}>
                  <td>{fmtDate(r.createdAt)}</td><td>{r.person ? `${r.person.firstName} ${r.person.lastName}` : '—'}</td><td>{welfareKindLabel[r.kind] ?? r.kind}</td>
                  <td>{r.categoryName}{r.beneficiary === 'family' && <div className="sup">familiare: {r.beneficiaryName ?? 'n.d.'}</div>}</td>
                  <td className="num">{eur(r.amount)}{Number(r.taxablePortion) > 0 && <div className="sup">{eur(r.taxablePortion)} oltre soglia</div>}</td>
                  <td className="sup">{r.attachmentName ?? '—'}{r.expenseDate ? ` · ${r.expenseDate}` : ''}{r.note ? <div>“{r.note}”</div> : null}</td>
                  <td><span className={`pill ${st.cls}`}>{st.text}</span></td>
                  <td>
                    <form style={{ display: 'grid', gap: 4, minWidth: 220 }}>
                      <input name="note" placeholder="Nota per il dipendente" style={{ ...input, padding: '4px 8px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn sm p" formAction={decideWelfareRequest.bind(null, r.id, 'approve')}>Approva</button>
                        <button className="btn sm" formAction={decideWelfareRequest.bind(null, r.id, 'needs_docs')}>Chiedi documenti</button>
                        <button className="btn sm" formAction={decideWelfareRequest.bind(null, r.id, 'reject')}>Rifiuta</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ); })}</tbody></table>
          )}
        </div>
      )}

      {tab === 'plans' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card">
              <h3>Piani welfare</h3>
              {plans.length === 0 ? <div className="empty">Nessun piano: creane uno a destra (prima carica le categorie).</div> : (
                <table><thead><tr><th>Piano</th><th>Stato</th><th className="num">Persone</th><th className="num">Accreditato</th><th className="num">Speso</th><th className="num">Take-up</th><th></th></tr></thead>
                  <tbody>{plans.map((p) => <tr key={p.id}><td><b>{p.name}</b><div className="sup">{p.periodStart} → {p.periodEnd} · riporto {p.rolloverRule === 'none' ? 'nessuno' : p.rolloverRule === 'total' ? 'totale' : `${p.rolloverPercent}%`}</div></td><td><span className={`pill ${p.status === 'active' ? 'g' : p.status === 'draft' ? 'w' : 'n'}`}>{p.status === 'active' ? 'attivo' : p.status === 'draft' ? 'bozza' : 'chiuso'}</span></td><td className="num">{p.stats.people}</td><td className="num">{eur(p.stats.credited)}</td><td className="num">{eur(p.stats.spent)}</td><td className="num">{p.stats.people ? `${Math.round((p.stats.requesters / p.stats.people) * 100)}%` : '—'}</td><td><Link href={`/welfare/admin?tab=plans&plan=${p.id}`} className="btn sm">Apri</Link></td></tr>)}</tbody></table>
              )}
            </div>
            {selectedPlan && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{selectedPlan.name} <small>{selectedPlan.populationCount} persone in popolazione</small></h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {selectedPlan.status === 'draft' && <form action={activateWelfarePlan.bind(null, selectedPlan.id)}><button className="btn sm p">Attiva e accredita</button></form>}
                    {selectedPlan.status === 'active' && <form action={closeWelfarePlan.bind(null, selectedPlan.id)}><button className="btn sm">Chiudi piano</button></form>}
                  </div>
                </div>
                <div className="sup" style={{ margin: '6px 0 10px' }}>Categorie abilitate: {selectedPlan.enabledCategories.length ? selectedPlan.enabledCategories.map(catName).join(', ') : 'tutte'}{selectedPlan.premium?.enabled ? ` · premio di risultato ${eur(selectedPlan.premium.amount ?? 0)} (finestra ${selectedPlan.premium.windowFrom ?? '—'} → ${selectedPlan.premium.windowTo ?? '—'})` : ''}</div>
                <table><thead><tr><th>Fonte</th><th>Tipo</th><th className="num">Per persona</th><th>Accredito</th><th>Scadenza</th><th>Stato</th></tr></thead>
                  <tbody>{(selectedPlan.sources ?? []).map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.kind}</td><td className="num">{eur(s.amountPerPerson)}</td><td>{s.creditAt}</td><td>{s.expiresAt ?? '—'}</td><td>{s.creditedAt ? <span className="pill g">accreditata</span> : <span className="pill w">programmata</span>}</td></tr>)}</tbody></table>
                {selectedPlan.status !== 'closed' && (
                  <form action={addWelfareSource.bind(null, selectedPlan.id)} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.8fr 1fr 1fr auto', gap: 6, alignItems: 'end', marginTop: 10 }}>
                    <label>Nome<input name="name" required placeholder="Budget on top" style={input} /></label>
                    <label>Tipo<select name="kind" style={input}><option value="on_top">On top</option><option value="ccnl">Da CCNL</option><option value="manual">Ricarica</option></select></label>
                    <label>€/persona<input name="amountPerPerson" type="number" step="0.01" min={0} required style={input} /></label>
                    <label>Accredito<input name="creditAt" type="date" required defaultValue={selectedPlan.periodStart} style={input} /></label>
                    <label>Scadenza<input name="expiresAt" type="date" defaultValue={selectedPlan.periodEnd} style={input} /></label>
                    <button className="btn">Aggiungi</button>
                  </form>
                )}
                <details style={{ marginTop: 12 }}>
                  <summary className="sup" style={{ cursor: 'pointer' }}>Ricarica o storno manuale (con motivazione)</summary>
                  <form action={adjustWelfare} style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.8fr 2fr auto', gap: 6, alignItems: 'end', marginTop: 8 }}>
                    <input type="hidden" name="planId" value={selectedPlan.id} />
                    <label>Persona<select name="personId" style={input}>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></label>
                    <label>Importo (± €)<input name="amount" type="number" step="0.01" required style={input} /></label>
                    <label>Motivazione<input name="note" required minLength={3} style={input} /></label>
                    <button className="btn">Registra</button>
                  </form>
                </details>
              </div>
            )}
          </div>
          <form action={createWelfarePlan} className="card" style={{ display: 'grid', gap: 8 }}>
            <h3>Nuovo piano</h3>
            <label>Nome<input name="name" required placeholder={`Welfare ${year + 1}`} style={input} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr 1fr', gap: 8 }}>
              <label>Anno<input name="year" type="number" defaultValue={year} style={input} /></label>
              <label>Dal<input name="periodStart" type="date" required defaultValue={`${year}-01-01`} style={input} /></label>
              <label>Al<input name="periodEnd" type="date" required defaultValue={`${year}-12-31`} style={input} /></label>
            </div>
            <label>Popolazione<select name="orgUnitId" style={input}><option value="">Tutta l’azienda</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name} (e sotto-unità)</option>)}</select></label>
            <div><div className="sup" style={{ marginBottom: 4 }}>Categorie abilitate (nessuna = tutte)</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{categories.map((c) => <label key={c.key} style={{ fontSize: 13, display: 'flex', gap: 4 }}><input type="checkbox" name="enabledCategories" value={c.key} defaultChecked />{c.name}</label>)}</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>Riporto a fine piano<select name="rolloverRule" style={input}><option value="none">Nessuno (il residuo scade)</option><option value="total">Totale</option><option value="partial">Parziale (%)</option></select></label>
              <label>% riportata<input name="rolloverPercent" type="number" min={0} max={100} defaultValue={0} style={input} /></label>
            </div>
            <label>Regolamento (testo)<textarea name="regulation" rows={3} style={{ ...input, resize: 'vertical' }} placeholder="Regole del piano, presa visione richiesta per la conversione del premio" /></label>
            <details><summary className="sup" style={{ cursor: 'pointer' }}>Conversione del premio di risultato</summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="premiumEnabled" /> Abilita la scelta cash/welfare</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}><label>Premio lordo (€)<input name="premiumAmount" type="number" step="0.01" style={input} /></label><label>Finestra dal<input name="premiumFrom" type="date" style={input} /></label><label>al<input name="premiumTo" type="date" style={input} /></label></div>
                <div className="sup">Percentuali ammesse 0/25/50/75/100; parametri fiscali di default (aliquota 23%, contributi 9,19% e 30%) modificabili via API.</div>
              </div>
            </details>
            <div><button className="btn p">Crea piano (bozza)</button></div>
          </form>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="card">
            <h3>Catalogo interno</h3>
            {catalog.length === 0 ? <div className="empty">Nessuna voce.</div> : <table><thead><tr><th>Voce</th><th>Tipo</th><th>Categoria</th><th className="num">Importo</th><th>Stato</th></tr></thead><tbody>{catalog.map((it) => <tr key={it.id}><td><b>{it.name}</b><div className="sup">{it.description}</div></td><td>{welfareKindLabel[it.kind] ?? it.kind}</td><td>{catName(it.categoryKey)}</td><td className="num">{it.price ? eur(it.price) : it.maxAmount ? `≤ ${eur(it.maxAmount)}` : 'libero'}</td><td><span className={`pill ${it.available ? 'g' : 'n'}`}>{it.available ? 'disponibile' : 'sospesa'}</span></td></tr>)}</tbody></table>}
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <form action={createCatalogItem} className="card" style={{ display: 'grid', gap: 8 }}>
              <h3>Nuova voce</h3>
              <label>Nome<input name="name" required style={input} /></label>
              <label>Descrizione<input name="description" style={input} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>Categoria<select name="categoryKey" style={input}>{categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label>
                <label>Tipo<select name="kind" style={input}><option value="reimbursement">Rimborso</option><option value="voucher">Voucher</option><option value="service">Servizio</option></select></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><label>Prezzo fisso (€)<input name="price" type="number" step="0.01" style={input} /></label><label>Importo massimo (€)<input name="maxAmount" type="number" step="0.01" style={input} /></label></div>
              <label>Istruzioni<input name="instructions" style={input} /></label>
              <div><button className="btn p">Aggiungi al catalogo</button></div>
            </form>
            <form action={createInitiative} className="card" style={{ display: 'grid', gap: 8 }}>
              <h3>Nuova iniziativa o convenzione</h3>
              <label>Nome<input name="name" required style={input} /></label>
              <label>Descrizione<input name="description" style={input} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><label>Tipo<select name="kind" style={input}><option value="convention">Convenzione</option><option value="program">Programma</option><option value="event">Evento</option></select></label><label>Posti (vuoto = illimitati)<input name="capacity" type="number" min={1} style={input} /></label></div>
              <label>Come aderire<input name="howTo" style={input} /></label>
              <div><button className="btn">Pubblica</button></div>
            </form>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="card">
            <h3>Categorie fiscali <small>{categories.length}</small></h3>
            {categories.length === 0 ? <div className="empty">Nessuna categoria: carica i preset.</div> : <table><thead><tr><th>Categoria</th><th>Regime</th></tr></thead><tbody>{categories.map((c) => <tr key={c.id}><td>{c.name} <span className="sup">· {c.key}</span></td><td><span className={`pill ${c.regime === 'exempt' ? 'g' : c.regime === 'threshold' ? 'w' : 'n'}`}>{c.regime === 'exempt' ? 'esente' : c.regime === 'threshold' ? 'a soglia' : 'imponibile'}</span></td></tr>)}</tbody></table>}
            <form action={loadWelfarePresets.bind(null, year)} style={{ marginTop: 10 }}><button className="btn">Carica i preset {year}</button></form>
            <div className="sup" style={{ marginTop: 6 }}>I preset sono indicativi: il sistema non conosce la legge, la rende configurabile. Verifica i valori con il consulente del lavoro.</div>
          </div>
          <div className="card">
            <h3>Soglie {year} <small>per categoria e condizione</small></h3>
            {thresholds.length === 0 ? <div className="empty">Nessuna soglia configurata per l’anno.</div> : <table><thead><tr><th>Categoria</th><th>Condizione</th><th className="num">Soglia annua</th></tr></thead><tbody>{thresholds.map((t) => <tr key={t.id}><td>{catName(t.categoryKey)}</td><td>{t.condition === 'children' ? 'Figli a carico' : 'Base'}</td><td className="num">{eur(t.amount)}</td></tr>)}</tbody></table>}
            <div className="sup" style={{ marginTop: 6 }}>Modifica puntuale via <code>PUT /api/v1/welfare/thresholds</code>; l’editor arriva con la prossima iterazione.</div>
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="card">
            <h3>Da inviare a payroll</h3>
            {preview ? <div className="grid kpis"><div className="card kpi" style={{ padding: 12 }}><div className="l">Voci</div><div className="v">{preview.count}</div></div><div className="card kpi" style={{ padding: 12 }}><div className="l">Rimborsi</div><div className="v" style={{ fontSize: 22 }}>{eur(preview.total)}</div></div><div className="card kpi" style={{ padding: 12 }}><div className="l">Eccedenze imponibili</div><div className="v" style={{ fontSize: 22 }}>{eur(preview.taxable)}</div></div></div> : <div className="empty">Permesso payroll assente.</div>}
            <form action={createPayrollBatch} style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 12 }}>
              <label style={{ flex: 1 }}>Periodo cedolino<input name="period" defaultValue={new Date().toISOString().slice(0, 7)} pattern="\d{4}-\d{2}" style={input} /></label>
              <button className="btn p" disabled={!preview?.count}>Crea lotto ed esporta</button>
            </form>
          </div>
          <div className="card">
            <h3>Lotti</h3>
            {batches.length === 0 ? <div className="empty">Nessun lotto.</div> : <table><thead><tr><th>Periodo</th><th className="num">Voci</th><th className="num">Totale</th><th>Stato</th><th></th></tr></thead><tbody>{batches.map((b) => <tr key={b.id}><td>{b.period}<div className="sup">esportato {fmtDate(b.exportedAt)}</div></td><td className="num">{b.itemsCount}</td><td className="num">{eur(b.totalAmount)}</td><td><span className={`pill ${b.status === 'confirmed' ? 'g' : 'w'}`}>{b.status === 'confirmed' ? 'liquidato' : 'esportato'}</span></td><td><div style={{ display: 'flex', gap: 4 }}><a href={`/api/export?report=welfare-payroll&batchId=${b.id}`} className="btn sm">CSV</a>{b.status !== 'confirmed' && <form action={confirmPayrollBatch.bind(null, b.id)}><button className="btn sm p">Conferma liquidazione</button></form>}</div></td></tr>)}</tbody></table>}
          </div>
        </div>
      )}
    </>
  );
}
