'use client';
import { useActionState, useMemo, useState } from 'react';
import { saveReport } from '@/lib/actions';
import type { MetricLite, SavedReport } from '@/lib/api';

const moduleLabel: Record<string, string> = { core: 'Persone', okr: 'Obiettivi', one: '1:1', fbk: 'Feedback', rev: 'Review', app: 'Form', eng: 'Survey', wel: 'Welfare' };
const dimLabel: Record<string, string> = { '': 'Totale (nessun dettaglio)', org_unit: 'Unità organizzativa', manager: 'Manager', person: 'Persona', cycle: 'Ciclo di review' };
const ROLES: [string, string][] = [['tenant_admin', 'Amministratori'], ['hr_admin', 'HR admin'], ['hrbp', 'HRBP'], ['analyst', 'Analisti'], ['manager', 'Manager'], ['employee', 'Collaboratori']];

/** Costruzione guidata di un report (ANA-050): metriche → dimensione → filtri → confronto → visualizzazione → condivisione → invio. */
export function ReportBuilder({ catalog, report, canShare, units, managers, cycles }: { catalog: MetricLite[]; report?: SavedReport | null; canShare: boolean; units: { id: string; name: string }[]; managers: { id: string; name: string }[]; cycles: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveReport, undefined);
  const def = report?.definition;
  const [metrics, setMetrics] = useState<string[]>(def?.metrics ?? []);
  const [dimension, setDimension] = useState<string>(def?.dimension ?? '');
  const [visualization, setVisualization] = useState<string>(def?.visualization ?? 'table');
  const [frequency, setFrequency] = useState<string>(report?.schedule?.frequency ?? '');
  const byModule = useMemo(() => { const m = new Map<string, MetricLite[]>(); for (const x of catalog) m.set(x.module, [...(m.get(x.module) ?? []), x]); return m; }, [catalog]);
  const allowed = (m: MetricLite) => !dimension || m.dimensions.includes(dimension);
  const toggle = (k: string) => setMetrics((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const dims = ['', 'org_unit', 'manager', 'person', 'cycle'].filter((d) => !d || catalog.some((m) => m.dimensions.includes(d)));
  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      {report && <input type="hidden" name="id" value={report.id} />}
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
        <label className="field"><span className="lab">Nome</span><input name="name" defaultValue={report?.name ?? ''} required placeholder="Es. Copertura obiettivi per unità" className="input" /></label>
        <label className="field"><span className="lab">Cartella</span><input name="folder" defaultValue={report?.folder ?? ''} placeholder="Es. Mensili" className="input" /></label>
        <label className="field"><span className="lab">Descrizione</span><input name="description" defaultValue={report?.description ?? ''} placeholder="A cosa serve" className="input" /></label>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <h3>1. Metriche <small>{metrics.length} scelte · le soglie di anonimato restano applicate dal server</small></h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {[...byModule.entries()].map(([mod, list]) => (
            <div key={mod}>
              <div className="lvl" style={{ marginBottom: 4 }}>{moduleLabel[mod] ?? mod}</div>
              {list.map((m) => {
                const ok = allowed(m);
                return <label key={m.key} className="check" title={`${m.description}\n${m.formula}`} style={{ opacity: ok ? 1 : 0.45, padding: '2px 0' }}><input type="checkbox" name="metrics" value={m.key} checked={metrics.includes(m.key)} onChange={() => toggle(m.key)} disabled={!ok} /> <span>{m.name}{m.sensitive && <span className="sup"> · sensibile</span>}</span></label>;
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="card" style={{ padding: 14 }}>
          <h3>2. Dettaglio e filtri</h3>
          <div className="stack" style={{ gap: 8 }}>
            <label className="field"><span className="lab">Righe per</span><select name="dimension" value={dimension} onChange={(e) => setDimension(e.target.value)} className="select">{dims.map((d) => <option key={d} value={d}>{dimLabel[d]}</option>)}</select></label>
            <label className="field"><span className="lab">Unità</span><select name="orgUnitId" defaultValue={def?.filters?.orgUnitId ?? ''} className="select"><option value="">Tutte</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label className="field"><span className="lab">Manager</span><select name="managerId" defaultValue={def?.filters?.managerId ?? ''} className="select"><option value="">Tutti</option>{managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label className="field"><span className="lab">Ciclo di review</span><select name="cycleId" defaultValue={def?.filters?.cycleId ?? ''} className="select"><option value="">Nessuno</option>{cycles.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <h3>3. Confronto e visualizzazione</h3>
          <div className="stack" style={{ gap: 8 }}>
            <label className="field"><span className="lab">Variazione rispetto a</span><select name="compareDays" defaultValue={def?.compareDays ? String(def.compareDays) : ''} className="select"><option value="">Nessun confronto</option><option value="7">7 giorni prima</option><option value="30">30 giorni prima</option><option value="90">90 giorni prima</option><option value="365">un anno prima</option></select></label>
            <label className="field"><span className="lab">Visualizzazione</span><select name="visualization" value={visualization} onChange={(e) => setVisualization(e.target.value)} className="select"><option value="table">Tabella</option><option value="bars">Barre (prima metrica)</option><option value="trend">Andamento nel tempo</option></select></label>
            {visualization === 'trend' && (
              <>
                <label className="field"><span className="lab">Metrica del trend</span><select name="trendMetric" defaultValue={def?.trendMetric ?? ''} className="select">{metrics.map((k) => <option key={k} value={k}>{catalog.find((m) => m.key === k)?.name ?? k}</option>)}</select></label>
                <label className="field"><span className="lab">Finestra (giorni)</span><select name="trendDays" defaultValue={String(def?.trendDays ?? 30)} className="select"><option value="14">14</option><option value="30">30</option><option value="90">90</option><option value="180">180</option></select></label>
              </>
            )}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <h3>4. Condivisione e invio</h3>
          <div className="stack" style={{ gap: 8 }}>
            {canShare ? (
              <div className="field"><span className="lab">Visibile ai ruoli</span>{ROLES.map(([v, l]) => <label key={v} className="check"><input type="checkbox" name="roles" value={v} defaultChecked={report?.sharing.roles.includes(v)} /> <span>{l}</span></label>)}<span className="help">Chi apre il report vede solo i dati del proprio perimetro.</span></div>
            ) : <div className="sup">Il report è personale: solo chi ha il perimetro completo può condividere.</div>}
            <label className="field"><span className="lab">Invio automatico via email (CSV)</span><select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} className="select"><option value="">Nessuno</option><option value="daily">Ogni giorno</option><option value="weekly">Ogni settimana</option><option value="monthly">Ogni mese</option></select></label>
            {frequency && (
              <div className="row">
                {frequency === 'weekly' && <select name="weekday" defaultValue={String(report?.schedule?.weekday ?? 1)} className="select" style={{ width: 'auto' }}>{['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>}
                {frequency === 'monthly' && <select name="dayOfMonth" defaultValue={String(report?.schedule?.dayOfMonth ?? 1)} className="select" style={{ width: 'auto' }}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>giorno {i + 1}</option>)}</select>}
                <span className="sup">alle</span><select name="hour" defaultValue={String(report?.schedule?.hour ?? 7)} className="select" style={{ width: 'auto' }}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}</select>
                {canShare && <select name="recipients" defaultValue={report?.schedule?.recipients ?? 'owner'} className="select" style={{ width: 'auto' }}><option value="owner">solo a me</option><option value="shared">a me e ai ruoli condivisi</option></select>}
              </div>
            )}
          </div>
        </div>
      </div>
      {state?.error && <div className="error">{state.error}</div>}
      <div className="row"><button className="btn p" disabled={pending}>{pending ? 'Salvataggio…' : report ? 'Salva modifiche' : 'Salva ed esegui'}</button></div>
    </form>
  );
}
