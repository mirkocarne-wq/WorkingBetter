/**
 * Logica pura del welfare (ADR-0008): saldo dal registro movimenti, controllo soglie, simulatore premio, roll-over.
 */
import type { Regime } from './presets.js';

export type MovementKind = 'credit' | 'reserve' | 'release' | 'spend' | 'refund' | 'expire' | 'adjust';
export interface MovementLike { kind: MovementKind; amount: number; categoryKey?: string | null; year?: number | null; expiresAt?: string | null }

export interface Balance { credited: number; spent: number; reserved: number; expired: number; adjusted: number; balance: number; available: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Convenzione: `amount` è sempre positivo; il segno lo dà il tipo.
 * saldo = accrediti + rettifiche − spese − scadenze + storni; disponibile = saldo − impegnato (prenotazioni non rilasciate).
 */
export function computeBalance(movements: readonly MovementLike[]): Balance {
  let credited = 0, spent = 0, reserved = 0, expired = 0, adjusted = 0, refunded = 0;
  for (const m of movements) {
    switch (m.kind) {
      case 'credit': credited += m.amount; break;
      case 'spend': spent += m.amount; break;
      case 'refund': refunded += m.amount; break;
      case 'reserve': reserved += m.amount; break;
      case 'release': reserved -= m.amount; break;
      case 'expire': expired += m.amount; break;
      case 'adjust': adjusted += m.amount; break;
    }
  }
  reserved = Math.max(0, reserved);
  const balance = credited + adjusted + refunded - spent - expired;
  return { credited: r2(credited), spent: r2(spent - refunded), reserved: r2(reserved), expired: r2(expired), adjusted: r2(adjusted), balance: r2(balance), available: r2(balance - reserved) };
}

/** Cumulo annuo già utilizzato per categoria (spese e prenotazioni in corso). */
export function usedByCategory(movements: readonly MovementLike[], year: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movements) {
    if (m.year !== year || !m.categoryKey) continue;
    const sign = m.kind === 'spend' || m.kind === 'reserve' ? 1 : m.kind === 'release' || m.kind === 'refund' ? -1 : 0;
    if (sign) out[m.categoryKey] = r2((out[m.categoryKey] ?? 0) + sign * m.amount);
  }
  return out;
}

export interface ThresholdCheck {
  /** importo che rientra nel regime agevolato */
  exemptPortion: number;
  /** eccedenza da segnalare a payroll (imponibile) */
  taxablePortion: number;
  /** soglia applicata (null = nessuna) */
  threshold: number | null;
  /** cumulo dopo l'operazione */
  cumulative: number;
  /** avviso quando il cumulo supera l'80% della soglia */
  nearThreshold: boolean;
}

/** Controllo del cumulo annuo (WEL-024): categorie esenti → tutto esente; a soglia → eccedenza imponibile; imponibili → tutto imponibile. */
export function checkThreshold(regime: Regime, threshold: number | null, alreadyUsed: number, amount: number): ThresholdCheck {
  const cumulative = r2(alreadyUsed + amount);
  if (regime === 'taxable') return { exemptPortion: 0, taxablePortion: r2(amount), threshold: null, cumulative, nearThreshold: false };
  if (regime === 'exempt' || threshold == null) return { exemptPortion: r2(amount), taxablePortion: 0, threshold: null, cumulative, nearThreshold: false };
  const room = Math.max(0, threshold - alreadyUsed);
  const exemptPortion = r2(Math.min(room, amount));
  return { exemptPortion, taxablePortion: r2(amount - exemptPortion), threshold, cumulative, nearThreshold: cumulative >= threshold * 0.8 };
}

export interface PremiumParams { taxRate: number; employeeContributionRate: number; employerContributionRate: number }
export interface PremiumSimulation { cashGross: number; cashNet: number; welfareCredit: number; employeeGain: number; employerSaving: number }

/**
 * Simulatore indicativo (WEL-003): il premio convertito in welfare non subisce tassazione né contributi;
 * in busta paga sconta contributi del dipendente e imposta (parametri configurati dall'HR).
 */
export function simulatePremium(amount: number, percentToWelfare: number, p: PremiumParams): PremiumSimulation {
  const toWelfare = r2((amount * percentToWelfare) / 100);
  const cashGross = r2(amount - toWelfare);
  const employeeContrib = cashGross * p.employeeContributionRate;
  const taxable = cashGross - employeeContrib;
  const cashNet = r2(taxable * (1 - p.taxRate));
  // confronto: la stessa quota convertita, se pagata in busta, avrebbe reso questo netto
  const convertedNetIfCash = r2(toWelfare * (1 - p.employeeContributionRate) * (1 - p.taxRate));
  return { cashGross, cashNet, welfareCredit: toWelfare, employeeGain: r2(toWelfare - convertedNetIfCash), employerSaving: r2(toWelfare * p.employerContributionRate) };
}

/** Importo che sopravvive alla fine del piano secondo la regola di roll-over (WEL-002). */
export function rolloverAmount(balance: number, rule: 'none' | 'total' | 'partial', percent = 0): number {
  if (balance <= 0) return 0;
  if (rule === 'total') return r2(balance);
  if (rule === 'partial') return r2((balance * Math.min(100, Math.max(0, percent))) / 100);
  return 0;
}
