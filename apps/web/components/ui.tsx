import Link from 'next/link';
import type { CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/**
 * Primitive del design system (docs/07). Sono componenti server-safe (nessun hook) che
 * incapsulano le classi di globals.css, così pagine e form non ripetono stili inline.
 */

export type Tone = 'b' | 'g' | 'w' | 's' | 'c' | 'n';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ph">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, aside, children, className, style }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`} style={style}>
      {title && <h3>{title}{aside && <small>{aside}</small>}</h3>}
      {children}
    </section>
  );
}

export function Kpi({ label, value, detail }: { label: ReactNode; value: ReactNode; detail?: ReactNode }) {
  return <div className="card kpi"><div className="l">{label}</div><div className="v">{value}</div>{detail && <div className="d">{detail}</div>}</div>;
}

export function Pill({ tone = 'n', dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return <span className={`pill ${tone}`} title={title}>{dot && <i />}{children}</span>;
}

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
const variantClass: Record<ButtonVariant, string> = { default: '', primary: 'p', ghost: 'ghost', danger: 'danger' };
export function Button({ href, variant = 'default', size, children, disabled, type, formAction, className, title, onClick }: {
  href?: string; variant?: ButtonVariant; size?: 'sm'; children: ReactNode; disabled?: boolean; type?: 'submit' | 'button';
  formAction?: (formData: FormData) => void | Promise<void>; className?: string; title?: string; onClick?: () => void;
}) {
  const cls = ['btn', variantClass[variant], size ?? '', className ?? ''].filter(Boolean).join(' ');
  if (href) return <Link href={href} className={cls} title={title}>{children}</Link>;
  return <button className={cls} disabled={disabled} type={type} formAction={formAction} title={title} onClick={onClick}>{children}</button>;
}

/** Stato vuoto che insegna (principio UX 7): cosa manca e cosa fare. */
export function EmptyState({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{hint}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}

export function Field({ label, help, required, children }: { label: ReactNode; help?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span className="lab">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input${props.className ? ` ${props.className}` : ''}`} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`select${props.className ? ` ${props.className}` : ''}`} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`textarea${props.className ? ` ${props.className}` : ''}`} />;
}
export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return <label className="check"><input type="checkbox" {...props} /> <span>{label}</span></label>;
}

export function Tabs({ items, current }: { items: { key: string; label: ReactNode; href: string }[]; current: string }) {
  return <nav className="tabs" aria-label="Sezioni">{items.map((t) => <Link key={t.key} href={t.href} className={current === t.key ? 'on' : ''} aria-current={current === t.key ? 'page' : undefined}>{t.label}</Link>)}</nav>;
}

/** Badge di visibilità (principio UX 4): ogni contenuto dice chi lo vede. */
export type VisibilityLevel = 'private' | 'manager' | 'team' | 'unit' | 'company' | 'hr';
const visibility: Record<VisibilityLevel, { icon: string; text: string; title: string }> = {
  private: { icon: '🔒', text: 'Solo tu', title: 'Visibile solo a te' },
  manager: { icon: '👥', text: 'Tu e il tuo manager', title: 'Visibile a te e al tuo manager' },
  team: { icon: '🧑‍🤝‍🧑', text: 'Team', title: 'Visibile al tuo team' },
  unit: { icon: '🏢', text: 'Unità', title: 'Visibile alla tua unità organizzativa' },
  company: { icon: '🌐', text: 'Azienda', title: 'Visibile a tutta l’organizzazione' },
  hr: { icon: '🗂️', text: 'Fascicolo HR', title: 'Visibile a te, al tuo manager e all’HR' },
};
export function VisibilityBadge({ level }: { level: VisibilityLevel }) {
  const v = visibility[level];
  return <span className="vis" title={v.title}><span aria-hidden>{v.icon}</span>{v.text}</span>;
}

export const initialsOf = (p: { firstName: string; lastName: string }) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
export function Avatar({ person, small }: { person: { firstName: string; lastName: string } | null | undefined; small?: boolean }) {
  return <span className={`av${small ? ' s' : ''}`} aria-hidden>{person ? initialsOf(person) : '?'}</span>;
}
export function Who({ person, role }: { person: { firstName: string; lastName: string; jobTitle?: string | null }; role?: ReactNode }) {
  return <div className="who"><Avatar person={person} small /><div><div className="n">{person.firstName} {person.lastName}</div><div className="r">{role ?? person.jobTitle ?? ''}</div></div></div>;
}

export function Progress({ value, tone }: { value: number | null | undefined; tone?: 'g' | 'w' | 'c' }) {
  const pct = Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
  return <div className={`bar${tone ? ` ${tone}` : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>;
}

/** Tabella scorrevole in orizzontale sugli schermi stretti. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="tbl">{children}</div>;
}
