/**
 * Welfare (WEL-010/011): categorie fiscali e soglie di riferimento.
 * I valori sono INDICATIVI e vanno verificati dall'HR o dal consulente del lavoro per l'anno in corso:
 * il prodotto non "conosce" la legge, la rende configurabile (ADR-0008).
 */
export type Regime = 'exempt' | 'threshold' | 'taxable';
export type Beneficiary = 'self' | 'family';

export interface CategoryPreset {
  key: string;
  name: string;
  description: string;
  regime: Regime;
  beneficiaries: Beneficiary[];
  requiredDocs: string;
  /** soglia annua di riferimento (null = nessun limite specifico nel regime welfare) */
  defaultThreshold: number | null;
  /** variante di soglia per chi dichiara figli a carico */
  childrenThreshold?: number | null;
  note?: string;
}

export const WelfareCategoryPresets: readonly CategoryPreset[] = [
  { key: 'istruzione', name: 'Istruzione ed educazione dei figli', description: 'Rette scolastiche e universitarie, libri di testo, mense, campus estivi, baby-sitting.', regime: 'exempt', beneficiaries: ['family'], requiredDocs: 'Fattura o ricevuta intestata, con indicazione del familiare', defaultThreshold: null },
  { key: 'assistenza_familiari', name: 'Assistenza a familiari anziani o non autosufficienti', description: 'Badanti, RSA, servizi di assistenza domiciliare.', regime: 'exempt', beneficiaries: ['family'], requiredDocs: 'Fattura o ricevuta del servizio', defaultThreshold: null },
  { key: 'sanita_integrativa', name: 'Sanità integrativa', description: 'Contributi a fondi e casse sanitarie.', regime: 'threshold', beneficiaries: ['self', 'family'], requiredDocs: 'Estremi del fondo', defaultThreshold: 3615.2, note: 'Limite annuo di deducibilità dei contributi ai fondi sanitari (valore storico stabile: verificare).' },
  { key: 'previdenza', name: 'Previdenza complementare', description: 'Versamenti a fondi pensione.', regime: 'threshold', beneficiaries: ['self'], requiredDocs: 'Estremi del fondo pensione', defaultThreshold: 5164.57, note: 'Limite annuo di deducibilità (valore storico stabile: verificare).' },
  { key: 'trasporto', name: 'Trasporto pubblico', description: 'Abbonamenti al trasporto pubblico locale, regionale e interregionale.', regime: 'exempt', beneficiaries: ['self', 'family'], requiredDocs: 'Ricevuta dell’abbonamento nominativo', defaultThreshold: null },
  { key: 'cultura_sport', name: 'Cultura, sport e tempo libero', description: 'Palestre, corsi, cinema, teatri, viaggi, libri.', regime: 'exempt', beneficiaries: ['self', 'family'], requiredDocs: 'Ricevuta', defaultThreshold: null, note: 'Esenzione nel regime welfare se erogato tramite piano; verificare le modalità (voucher/rimborso).' },
  { key: 'fringe', name: 'Fringe benefit e buoni acquisto', description: 'Buoni spesa, carburante, utenze domestiche, beni in natura.', regime: 'threshold', beneficiaries: ['self'], requiredDocs: 'Nessuno per i buoni; bollette per le utenze', defaultThreshold: 258.23, childrenThreshold: null, note: 'Soglia ordinaria 258,23 €; norme temporanee l’hanno innalzata negli ultimi anni (1.000 €, 2.000 € con figli a carico). Configurare il valore dell’anno.' },
  { key: 'mutuo', name: 'Interessi su mutui e canoni di locazione', description: 'Rimborso di interessi passivi sul mutuo prima casa o del canone di locazione.', regime: 'exempt', beneficiaries: ['self'], requiredDocs: 'Certificazione interessi o contratto e ricevute', defaultThreshold: null, note: 'Rientra nel regime welfare se previsto dal piano; verificare.' },
];

/** Preset soglie per anno: la fringe segue il regime temporaneo per gli anni indicati (da verificare ogni anno). */
export function thresholdPresetsFor(year: number): { categoryKey: string; condition: string | null; amount: number }[] {
  const out: { categoryKey: string; condition: string | null; amount: number }[] = [];
  for (const c of WelfareCategoryPresets) if (c.defaultThreshold != null && c.key !== 'fringe') out.push({ categoryKey: c.key, condition: null, amount: c.defaultThreshold });
  if (year >= 2024 && year <= 2027) {
    out.push({ categoryKey: 'fringe', condition: null, amount: 1000 });
    out.push({ categoryKey: 'fringe', condition: 'children', amount: 2000 });
  } else out.push({ categoryKey: 'fringe', condition: null, amount: 258.23 });
  return out;
}
