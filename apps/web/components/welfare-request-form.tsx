'use client';
import { useActionState, useState } from 'react';
import { createWelfareRequest } from '@/lib/actions';
import type { WelfareCatalogItem, WelfareCategory } from '@/lib/api';

const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, font: 'inherit', background: '#fff' } as const;
const eur = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €`;

export function WelfareRequestForm({ planId, categories, catalog, available, itemId }: { planId: string; categories: WelfareCategory[]; catalog: WelfareCatalogItem[]; available: number; itemId?: string }) {
  const [state, action, pending] = useActionState(createWelfareRequest, undefined);
  const item = itemId ? catalog.find((c) => c.id === itemId) : undefined;
  const [categoryKey, setCategoryKey] = useState(item?.categoryKey ?? categories[0]?.key ?? '');
  const [amount, setAmount] = useState<number>(item?.price ? Number(item.price) : 0);
  const cat = categories.find((c) => c.key === categoryKey);
  const kind = item?.kind ?? 'reimbursement';
  const remaining = cat?.threshold != null ? Math.max(0, cat.threshold - cat.used) : null;
  const taxable = remaining != null && cat?.regime === 'threshold' ? Math.max(0, amount - remaining) : 0;
  if (state?.ok) return <div className="suggest">Richiesta inviata: la trovi in “Richieste”. Il budget è stato prenotato in attesa della verifica.</div>;
  return (
    <form action={action} style={{ display: 'grid', gap: 8 }}>
      <input type="hidden" name="planId" value={planId} />
      {item && <input type="hidden" name="itemId" value={item.id} />}
      {!item && <label>Categoria<select name="categoryKey" value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} style={input}>{categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label>}
      {!item && <input type="hidden" name="kind" value="reimbursement" />}
      {cat && <div className="sup">{cat.regime === 'exempt' ? 'Categoria esente senza limite specifico.' : cat.regime === 'threshold' ? `Soglia annua ${cat.threshold != null ? eur(cat.threshold) : 'n.d.'} · usati ${eur(cat.used)} · restano ${remaining != null ? eur(remaining) : 'n.d.'}` : 'Categoria imponibile: l’importo sarà tassato in busta paga.'}{cat.requiredDocs ? ` · Documenti: ${cat.requiredDocs}` : ''}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label>Importo (€)<input name="amount" type="number" step="0.01" min={0.01} max={available} required value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} readOnly={!!item?.price} style={input} /></label>
        <label>Beneficiario<select name="beneficiary" defaultValue={cat?.beneficiaries.includes('self') ? 'self' : 'family'} style={input}>{cat?.beneficiaries.includes('self') && <option value="self">Me stesso/a</option>}{cat?.beneficiaries.includes('family') && <option value="family">Familiare</option>}</select></label>
      </div>
      <div className="sup">Disponibile: {eur(available)}{taxable > 0 ? ` · attenzione: ${eur(taxable)} oltre soglia saranno segnalati a payroll come imponibili` : ''}</div>
      <input name="beneficiaryName" placeholder="Nome del familiare (se applicabile)" style={input} />
      {kind === 'reimbursement' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>Data della spesa<input name="expenseDate" type="date" style={input} /></label>
          <label>Giustificativo (nome file)<input name="attachmentName" placeholder="ricevuta.pdf" required style={input} /></label>
        </div>
      )}
      <textarea name="note" rows={2} placeholder="Note per chi verifica (facoltative)" style={{ ...input, resize: 'vertical' }} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}><input type="checkbox" name="declarationAccepted" required /> Dichiaro che la spesa è veritiera, riferita al beneficiario indicato e non rimborsata da altri.</label>
      {state?.error && <div className="error">{state.error}</div>}
      <div><button className="btn p" disabled={pending || available <= 0}>{pending ? 'Invio…' : item ? `Richiedi ${item.name}` : 'Invia richiesta di rimborso'}</button></div>
    </form>
  );
}
