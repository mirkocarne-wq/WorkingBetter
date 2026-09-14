export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; text: string }> = {
    ok: { cls: 'g', text: 'ok' }, warning: { cls: 'w', text: 'in scadenza' }, critical: { cls: 'c', text: 'critico' }, error: { cls: 'c', text: 'errore' }, none: { cls: 'n', text: 'non TLS' },
    running: { cls: 'b', text: 'in corso' }, active: { cls: 'g', text: 'attivo' }, suspended: { cls: 'c', text: 'sospeso' }, pending: { cls: 'w', text: 'in attesa' }, accepted: { cls: 'g', text: 'accettato' }, expired: { cls: 'c', text: 'scaduto' },
  };
  const m = map[status] ?? { cls: 'n', text: status };
  return <span className={`pill ${m.cls}`}>{m.text}</span>;
}
