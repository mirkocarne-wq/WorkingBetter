import { Avatar, Button, Card, Checkbox, EmptyState, Field, Input, Kpi, PageHeader, Pill, Progress, Select, TableWrap, Tabs, Textarea, VisibilityBadge, Who } from '@/components/ui';

const colors: [string, string][] = [['--brand', 'Primario (tenant)'], ['--brand-2', 'Primario scuro'], ['--brand-soft', 'Primario tenue'], ['--ink', 'Testo'], ['--ink2', 'Testo secondario'], ['--muted', 'Attenuato'], ['--surface', 'Superficie'], ['--surface-2', 'Superficie 2'], ['--grid', 'Griglia'], ['--line', 'Bordo campi']];
const status: [string, string][] = [['--good', 'Positivo'], ['--warn', 'Attenzione'], ['--serious', 'Serio'], ['--crit', 'Critico']];
const series = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];
const spacing = ['--s-1', '--s-2', '--s-3', '--s-4', '--s-5', '--s-6'];

/** Guida di stile vivente: mostra token e primitive reali di globals.css e components/ui.tsx (docs/07). */
export default function DesignPage() {
  return (
    <>
      <PageHeader title="Guida di stile" subtitle="Token e componenti del design system, così come li usano le pagine dell’app" actions={<Button href="/settings">Torna alle impostazioni</Button>} />
      <div className="stack" style={{ gap: 16 }}>
        <Card title="Colori" aside="token CSS in globals.css">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {colors.map(([v, l]) => <div key={v}><div className="swatch" style={{ background: `var(${v})` }} /><div style={{ fontSize: 13, marginTop: 4 }}><b>{l}</b></div><code>{v}</code></div>)}
          </div>
          <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Stato <span className="sup">riservati a segnali e badge, con icona o testo: mai colore da solo</span></h4>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {status.map(([v, l]) => <div key={v}><div className="swatch" style={{ background: `var(${v})` }} /><div style={{ fontSize: 13, marginTop: 4 }}><b>{l}</b></div><code>{v}</code></div>)}
          </div>
          <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Serie dei grafici <span className="sup">ordine fisso, mai ciclato; oltre 6 serie si raggruppa in “Altro”</span></h4>
          <div className="row">{series.map((v) => <div key={v} style={{ textAlign: 'center' }}><div style={{ width: 56, height: 28, borderRadius: 6, background: `var(${v})` }} /><code>{v}</code></div>)}</div>
        </Card>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Card title="Tipografia e spaziatura">
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, letterSpacing: '-.3px' }}>Titolo di pagina · 22px</div>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>Titolo di sezione · 16px</div>
            <div>Testo base · 14px, interlinea 1.45</div>
            <div className="sup">Testo di supporto · 12px, attenuato</div>
            <div className="lvl" style={{ marginTop: 6 }}>Etichetta maiuscola · 11px</div>
            <div className="row" style={{ marginTop: 14, alignItems: 'flex-end' }}>{spacing.map((v) => <div key={v} style={{ textAlign: 'center' }}><div style={{ width: `var(${v})`, height: `var(${v})`, background: 'var(--brand)', borderRadius: 3, margin: '0 auto' }} /><code>{v}</code></div>)}</div>
          </Card>
          <Card title="Pulsanti e badge">
            <div className="row"><Button variant="primary">Primario</Button><Button>Secondario</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Distruttivo</Button><Button size="sm">Piccolo</Button><Button disabled>Disabilitato</Button></div>
            <div className="row" style={{ marginTop: 12 }}><Pill tone="g" dot>On track</Pill><Pill tone="w" dot>A rischio</Pill><Pill tone="c" dot>Off track</Pill><Pill tone="s">Integrazione richiesta</Pill><Pill tone="b">Condivisa</Pill><Pill>Neutro</Pill></div>
            <div className="row" style={{ marginTop: 12 }}><VisibilityBadge level="private" /><VisibilityBadge level="manager" /><VisibilityBadge level="team" /><VisibilityBadge level="unit" /><VisibilityBadge level="company" /><VisibilityBadge level="hr" /></div>
            <div className="row" style={{ marginTop: 12 }}><Avatar person={{ firstName: 'Luca', lastName: 'Bianchi' }} /><Who person={{ firstName: 'Luca', lastName: 'Bianchi', jobTitle: 'Senior Developer' }} /></div>
          </Card>
        </div>

        <div className="grid kpis">
          <Kpi label="Indicatore" value="42%" detail="con testo di dettaglio" />
          <Kpi label="Importo" value="1.250,00 €" detail="numeri tabulari" />
          <Kpi label="Conteggio" value={7} detail="tre parole al massimo" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Card title="Modulo" aside="Field, Input, Select, Textarea, Checkbox">
            <div className="stack">
              <Field label="Titolo" required help="Testo di aiuto sotto il campo"><Input placeholder="Es. Migliorare il tempo di risposta" /></Field>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Field label="Periodo"><Select defaultValue="q4"><option value="q4">Q4 2026</option><option value="q1">Q1 2027</option></Select></Field>
                <Field label="Importo (€)"><Input type="number" step="0.01" defaultValue={120} /></Field>
              </div>
              <Field label="Note"><Textarea rows={3} placeholder="Facoltative" /></Field>
              <Field label="Campo con errore"><Input aria-invalid="true" defaultValue="valore non valido" /></Field>
              <Checkbox label="Dichiaro di aver letto il regolamento" />
              <div className="row"><Button variant="primary">Salva</Button><Button variant="ghost">Annulla</Button></div>
            </div>
          </Card>
          <div className="stack">
            <Card title="Tabella e progresso">
              <TableWrap>
                <table>
                  <thead><tr><th>Persona</th><th>Obiettivi</th><th>Progresso</th><th>Stato</th></tr></thead>
                  <tbody>
                    <tr><td><Who person={{ firstName: 'Sara', lastName: 'Ricci', jobTitle: 'Designer' }} /></td><td>3</td><td><Progress value={0.72} tone="g" /></td><td><Pill tone="g" dot>Tutto ok</Pill></td></tr>
                    <tr><td><Who person={{ firstName: 'Marco', lastName: 'Conti', jobTitle: 'Developer' }} /></td><td>2</td><td><Progress value={0.35} tone="w" /></td><td><Pill tone="w" dot>A rischio</Pill></td></tr>
                  </tbody>
                </table>
              </TableWrap>
            </Card>
            <Card title="Tab e stato vuoto">
              <Tabs current="b" items={[{ key: 'a', label: 'Le mie', href: '#' }, { key: 'b', label: 'Il mio team', href: '#' }, { key: 'c', label: 'Tutte (12)', href: '#' }]} />
              <EmptyState title="Nessun obiettivo nel periodo" hint="Gli obiettivi si creano da “Obiettivi → Nuovo obiettivo” e possono allinearsi a quelli dell’azienda." action={<Button variant="primary" href="/objectives/new">Crea il primo obiettivo</Button>} />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
