import { actionKindLabel, type F360CompetencyDef, type F360Report, type F360Scale } from '@/lib/api';
import { addF360DevAction } from '@/lib/actions';
import { Button, Card, Kpi, Pill } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { F360Radar } from '@/components/f360-radar';

const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: 2 }));

/** Report 360° di un soggetto (F360-020/021/026): radar, tabella per categoria, forze e aree, commenti, domande aperte, azioni nel piano. */
export function F360ReportView({ report, competencies, scale, subjectId, canAddAction, viewer }: { report: F360Report; competencies: F360CompetencyDef[]; scale: F360Scale; subjectId: string; canAddAction: boolean; viewer: 'self' | 'manager' | 'hr' }) {
  const names = Object.fromEntries(competencies.map((c) => [c.key, c.name]));
  const shownCats = report.categories.filter((c) => c.shown && c.key !== 'self');
  const hidden = report.categories.filter((c) => !c.shown && c.key !== 'self');
  const series = [
    { key: 'self', label: 'Autovalutazione', color: 'var(--brand)', dashed: true, values: Object.fromEntries(report.competencies.map((c) => [c.competencyKey, c.self])) },
    { key: 'others', label: 'Altri', color: 'var(--s3)', values: Object.fromEntries(report.competencies.map((c) => [c.competencyKey, c.others])) },
    ...(report.categories.some((c) => c.key === 'manager' && c.shown) ? [{ key: 'manager', label: 'Manager', color: 'var(--s2)', values: Object.fromEntries(report.competencies.map((c) => [c.competencyKey, c.byCategory.manager?.avg ?? null])) }] : []),
  ];
  const label = (v: number | null) => (v == null ? '' : (scale.labels[String(Math.round(v))] ?? ''));
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid kpis">
        <Kpi label="Come ti vedono gli altri" value={fmt(report.overall.others)} detail={`media su ${scale.min}–${scale.max} · ${report.responses} risposte`} />
        <Kpi label="Autovalutazione" value={fmt(report.overall.self)} detail={report.overall.self != null && report.overall.others != null ? `${report.overall.self - report.overall.others > 0 ? 'ti vedi meglio' : report.overall.self - report.overall.others < 0 ? 'ti vedi peggio' : 'allineato'} di ${fmt(Math.abs(report.overall.self - report.overall.others))}` : undefined} />
        <Kpi label="Manager" value={fmt(report.overall.manager)} detail={label(report.overall.manager)} />
        <Kpi label="Risposte per categoria" value={shownCats.reduce((a, c) => a + c.responded, 0)} detail={shownCats.map((c) => `${c.label} ${c.responded}/${c.invited}`).join(' · ')} />
      </div>
      {hidden.length > 0 && <div className="suggest">Per proteggere l’anonimato, {hidden.map((c) => `${c.label} (${c.responded} risposte)`).join(' e ')} non ${hidden.length === 1 ? 'viene mostrata' : 'vengono mostrate'}: servono almeno {report.threshold} risposte per categoria. {hidden.some((c) => c.key === 'others_merged') ? 'Le categorie sotto soglia sono state accorpate in «Altri».' : ''}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card title={<>Profilo per competenza <small>scala {scale.min}–{scale.max}</small></>}>
          <F360Radar competencies={competencies} series={series} min={scale.min} max={scale.max} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Competenza</th><th className="num">Auto</th>{shownCats.map((c) => <th key={c.key} className="num" title={c.merged.length ? `accorpa: ${c.merged.join(', ')}` : undefined}>{c.label}</th>)}<th className="num">Altri</th><th className="num">Gap</th></tr></thead>
              <tbody>
                {report.competencies.map((c) => (
                  <tr key={c.competencyKey}>
                    <td><b>{names[c.competencyKey] ?? c.competencyKey}</b></td>
                    <td className="num">{fmt(c.self)}</td>
                    {shownCats.map((cat) => <td key={cat.key} className="num">{c.byCategory[cat.key] ? fmt(c.byCategory[cat.key]!.avg) : <span className="sup">—</span>}</td>)}
                    <td className="num"><b>{fmt(c.others)}</b></td>
                    <td className="num">{c.gap == null ? <span className="sup">—</span> : c.gap > 0.5 ? <Pill tone="w" title="Ti valuti più alto di come ti vedono gli altri">+{fmt(c.gap)}</Pill> : c.gap < -0.5 ? <Pill tone="b" title="Gli altri ti valutano più alto di quanto fai tu">{fmt(c.gap)}</Pill> : <Pill tone="g">allineato</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sup" style={{ marginTop: 6 }}>Gap = autovalutazione − altri. «Altri» è la media di tutte le risposte visibili tranne la tua.</div>
        </Card>
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Punti di forza" aside="le competenze più alte secondo gli altri">
            {report.strengths.length === 0 ? <div className="sup">Non ci sono abbastanza risposte.</div> : report.strengths.map((k) => { const c = report.competencies.find((x) => x.competencyKey === k)!; return <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--grid)' }}><span><b>{names[k] ?? k}</b></span><Pill tone="g">{fmt(c.others)}</Pill></div>; })}
          </Card>
          <Card title="Aree di sviluppo" aside={canAddAction ? 'trasformale in azioni del piano' : 'le competenze più basse secondo gli altri'}>
            {report.developmentAreas.length === 0 ? <div className="sup">Non ci sono abbastanza risposte.</div> : report.developmentAreas.map((k) => {
              const c = report.competencies.find((x) => x.competencyKey === k)!;
              return (
                <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><span><b>{names[k] ?? k}</b> <span className="sup">{label(c.others)}</span></span><Pill tone="w">{fmt(c.others)}</Pill></div>
                  {canAddAction && (
                    <ActionForm action={addF360DevAction.bind(null, subjectId)} className="row" style={{ marginTop: 6 }} inline>
                      <input type="hidden" name="competencyKey" value={k} />
                      <input name="title" className="input" placeholder={`Azione per ${names[k] ?? k}…`} required style={{ minWidth: 200, flex: 1 }} />
                      <select name="kind" className="input" style={{ width: 'auto' }} defaultValue="experience">{Object.entries(actionKindLabel).map(([kk, l]) => <option key={kk} value={kk}>{l}</option>)}</select>
                      <input name="dueDate" type="date" className="input" style={{ width: 'auto' }} />
                      <Button size="sm">Aggiungi al piano</Button>
                    </ActionForm>
                  )}
                </div>
              );
            })}
            {viewer === 'self' && <div className="sup" style={{ marginTop: 8 }}>Le azioni finiscono nel tuo <a href="/development">piano di sviluppo</a> con origine «360°».</div>}
          </Card>
        </div>
      </div>
      <Card title="Commenti per competenza" aside="anonimi e in ordine casuale, tranne il manager">
        {report.competencies.every((c) => c.comments.length === 0) ? <div className="sup">Nessun commento.</div> : report.competencies.filter((c) => c.comments.length).map((c) => (
          <div key={c.competencyKey} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
            <b>{names[c.competencyKey] ?? c.competencyKey}</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{c.comments.map((cm, i) => <li key={i}>«{cm.text}» <span className="sup">· {cm.category}</span></li>)}</ul>
          </div>
        ))}
      </Card>
      {Object.keys(report.openAnswers).length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {Object.entries(report.openAnswers).map(([k, items]) => (
            <Card key={k} title={k === 'continue' ? 'Continua a…' : k === 'stop' ? 'Smetti di…' : k === 'start' ? 'Inizia a…' : k}>
              {items.length === 0 ? <div className="sup">Nessuna risposta.</div> : <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((it, i) => <li key={i}>{it.text} <span className="sup">· {it.category}</span></li>)}</ul>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
