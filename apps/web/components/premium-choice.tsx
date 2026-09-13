'use client';
import { useActionState, useState } from 'react';
import { choosePremium } from '@/lib/actions';
import type { WelfarePremium } from '@/lib/api';

const eur = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Conversione del premio di risultato (WEL-003): simulatore indicativo e scelta irrevocabile. */
export function PremiumChoice({ premium: p }: { premium: WelfarePremium }) {
  const [percent, setPercent] = useState(p.allowedPercents.includes(50) ? 50 : p.allowedPercents[0] ?? 0);
  const [state, action, pending] = useActionState(choosePremium, undefined);
  const toWelfare = r2((p.amount * percent) / 100);
  const cashGross = r2(p.amount - toWelfare);
  const cashNet = r2(cashGross * (1 - p.params.employeeContributionRate) * (1 - p.params.taxRate));
  const gain = r2(toWelfare - toWelfare * (1 - p.params.employeeContributionRate) * (1 - p.params.taxRate));
  return (
    <div className="card">
      <h3>Premio di risultato: cash o welfare? <small>{p.planName}</small></h3>
      <div className="sup">Premio lordo {eur(p.amount)}{p.windowTo ? ` · finestra di scelta fino al ${p.windowTo}` : ''}. Stima indicativa con i parametri configurati dall’azienda: non sostituisce il cedolino.</div>
      {p.chosen ? (
        <div className="suggest" style={{ marginTop: 10 }}>Hai scelto di convertire <b>{eur(p.chosen.amount)}</b> in welfare. La scelta è irrevocabile.</div>
      ) : !p.windowOpen ? <div className="empty">Finestra di scelta chiusa.</div> : (
        <form action={action} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <input type="hidden" name="planId" value={p.planId} />
          <div className="seg" style={{ justifySelf: 'start' }}>{p.allowedPercents.map((v) => <a key={v} onClick={() => setPercent(v)} className={percent === v ? 'on' : ''} style={{ cursor: 'pointer' }}>{v}% welfare</a>)}</div>
          <input type="hidden" name="percent" value={percent} />
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="card kpi" style={{ padding: 12 }}><div className="l">In busta paga (netto stimato)</div><div className="v" style={{ fontSize: 22 }}>{eur(cashNet)}</div><div className="d">lordo {eur(cashGross)}</div></div>
            <div className="card kpi" style={{ padding: 12 }}><div className="l">Credito welfare</div><div className="v" style={{ fontSize: 22 }}>{eur(toWelfare)}</div><div className="d">senza tasse né contributi</div></div>
            <div className="card kpi" style={{ padding: 12 }}><div className="l">Vantaggio stimato</div><div className="v" style={{ fontSize: 22 }}>{eur(gain)}</div><div className="d">rispetto alla stessa quota in busta</div></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}><input type="checkbox" name="acceptRegulation" required /> Ho letto il regolamento del piano e so che la scelta non può essere modificata dopo l’invio.</label>
          {state?.error && <div className="error">{state.error}</div>}
          <div><button className="btn p" disabled={pending}>{pending ? 'Registrazione…' : `Confermo: ${percent}% in welfare`}</button></div>
        </form>
      )}
    </div>
  );
}
