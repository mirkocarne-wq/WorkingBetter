'use client';
import { useState } from 'react';

const TYPES: [string, string][] = [['number', 'Numero'], ['percent', 'Percentuale'], ['currency', 'Valuta'], ['boolean', 'Sì/No'], ['milestone', 'Milestone']];

/** Righe dinamiche per i key result di un nuovo obiettivo (i campi si leggono con formData.getAll). */
export function KrRows() {
  const [rows, setRows] = useState([0, 1]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.7fr 0.7fr auto', gap: 6, alignItems: 'center' }}>
          <input name="krTitle" placeholder={`Key result ${i + 1}`} className="input" />
          <select name="krType" className="input" defaultValue="number">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input name="krUnit" placeholder="unità" className="input" />
          <input name="krStart" type="number" step="any" placeholder="da" defaultValue={0} className="input" />
          <input name="krTarget" type="number" step="any" placeholder="a" defaultValue={100} className="input" />
          <button type="button" className="btn sm" onClick={() => setRows((x) => x.filter((y) => y !== r))} disabled={rows.length <= 1} title="Rimuovi">×</button>
        </div>
      ))}
      <div><button type="button" className="btn sm" onClick={() => setRows((x) => [...x, (x[x.length - 1] ?? 0) + 1])}>+ Aggiungi key result</button></div>
      <div className="sup">Per Sì/No e milestone usa da 0 a 1. Il progresso dell&apos;obiettivo è la media pesata dei KR e risale all&apos;obiettivo padre.</div>
    </div>
  );
}
