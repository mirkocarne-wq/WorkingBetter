'use client';
import { useActionState, type ReactNode } from 'react';
import type { ActionState } from '@/lib/actions';

/**
 * Form che invoca una server action con stato (errore o conferma) senza pagina di errore:
 * i problemi dell'API (422 nomine insufficienti, 409 fase sbagliata) restano accanto al pulsante.
 */
export function ActionForm({ action, children, className, style, confirm, inline }: { action: (prev: ActionState | undefined, form: FormData) => Promise<ActionState>; children: ReactNode; className?: string; style?: React.CSSProperties; confirm?: string; inline?: boolean }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className={className} style={style} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: inline ? 'inline-flex' : 'block', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {children}
        {state?.error && <span className="error" role="alert" style={{ marginLeft: inline ? 8 : 0 }}>{state.error}</span>}
        {state?.ok && !state.error && <span className="sup" role="status" style={{ marginLeft: inline ? 8 : 0, color: 'var(--good-text)' }}>{state.message}</span>}
      </fieldset>
    </form>
  );
}
