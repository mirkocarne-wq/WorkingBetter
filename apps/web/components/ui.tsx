import Link from 'next/link';
import type { CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Icon, type IconName } from './icons';

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

/** Fascia di indicatori divisa da linee (docs/07): ogni voce ha etichetta con icona, valore, dettaglio e un elemento grafico opzionale (anello). */
export function KpiBand({ items }: { items: { icon?: IconName; label: ReactNode; value: ReactNode; detail?: ReactNode; tone?: 'crit'; aside?: ReactNode }[] }) {
  return (
    <div className="kpiband">
      {items.map((k, i) => (
        <div className="kpi" key={i}>
          <div style={{ minWidth: 0 }}>
            <div className="l">{k.icon && <Icon name={k.icon} size={16} />}<span>{k.label}</span></div>
            <div className={`v${k.tone === 'crit' ? ' crit' : ''}`}>{k.value}</div>
            {k.detail && <div className="d">{k.detail}</div>}
          </div>
          {k.aside}
        </div>
      ))}
    </div>
  );
}

/** Anello di progresso (0–1). */
export function Ring({ value, size = 40 }: { value: number | null | undefined; size?: number }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="bgc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} />
      <circle className="fgc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} strokeDasharray={`${c * v} ${c}`} />
    </svg>
  );
}

/** Fasi di un processo: fatto · in corso · da fare (review, onboarding, App Studio). */
export type StepState = 'done' | 'current' | 'todo' | 'rejected';
export function Stepper({ steps }: { steps: { label: ReactNode; sub?: ReactNode; state: StepState }[] }) {
  return (
    <ol className="stepper" aria-label="Fasi">
      {steps.map((s, i) => (
        <li key={i} className={`st ${s.state === 'done' ? 'done' : s.state === 'current' ? 'cur' : s.state === 'rejected' ? 'rej' : ''}`} aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className="dot">{s.state === 'done' ? <Icon name="check" size={12} stroke={2.8} /> : i + 1}</span>
          <span className="lbl"><b>{s.label}</b>{s.sub && <small>{s.sub}</small>}</span>
          {i < steps.length - 1 && <span className="ln" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** Viste alternative della stessa pagina (segmented control). */
export function Segmented({ items, current, label }: { items: { key: string; label: ReactNode; href: string }[]; current: string; label?: string }) {
  return <nav className="seg" aria-label={label ?? 'Viste'}>{items.map((t) => <Link key={t.key} href={t.href} className={current === t.key ? 'on' : ''} aria-current={current === t.key ? 'page' : undefined}>{t.label}</Link>)}</nav>;
}

/** Barra sopra una tabella: ricerca (GET), filtri e nota. */
export function Toolbar({ children, hint }: { children?: ReactNode; hint?: ReactNode }) {
  return <div className="toolbar">{children}{hint && <><span className="sp" /><span className="hint">{hint}</span></>}</div>;
}
export function SearchField({ name = 'q', defaultValue, placeholder, action }: { name?: string; defaultValue?: string; placeholder?: string; action?: string }) {
  return (
    <form action={action} method="get" className="search" role="search">
      <Icon name="search" size={15} />
      <input name={name} defaultValue={defaultValue} placeholder={placeholder ?? 'Cerca…'} aria-label={placeholder ?? 'Cerca'} />
    </form>
  );
}

export function Pill({ tone = 'n', dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return <span className={`pill ${tone}`} title={title}>{dot && <i />}{children}</span>;
}

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
const variantClass: Record<ButtonVariant, string> = { default: '', primary: 'p', ghost: 'ghost', danger: 'danger' };
export function Button({ href, variant = 'default', size, children, disabled, type, formAction, className, title, onClick, icon, iconRight }: {
  href?: string; variant?: ButtonVariant; size?: 'sm'; children: ReactNode; disabled?: boolean; type?: 'submit' | 'button';
  formAction?: (formData: FormData) => void | Promise<void>; className?: string; title?: string; onClick?: () => void; icon?: IconName; iconRight?: IconName;
}) {
  const cls = ['btn', variantClass[variant], size ?? '', className ?? ''].filter(Boolean).join(' ');
  const inner = <>{icon && <Icon name={icon} size={15} stroke={2} />}{children}{iconRight && <Icon name={iconRight} size={15} stroke={2} />}</>;
  if (href) return <Link href={href} className={cls} title={title}>{inner}</Link>;
  return <button className={cls} disabled={disabled} type={type} formAction={formAction} title={title} onClick={onClick}>{inner}</button>;
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
const visibility: Record<VisibilityLevel, { icon: IconName; text: string; title: string }> = {
  private: { icon: 'lock', text: 'Solo tu', title: 'Visibile solo a te' },
  manager: { icon: 'one', text: 'Tu e il tuo manager', title: 'Visibile a te e al tuo manager' },
  team: { icon: 'people', text: 'Team', title: 'Visibile al tuo team' },
  unit: { icon: 'building', text: 'Unità', title: 'Visibile alla tua unità organizzativa' },
  company: { icon: 'globe', text: 'Azienda', title: 'Visibile a tutta l’organizzazione' },
  hr: { icon: 'folder', text: 'Fascicolo HR', title: 'Visibile a te, al tuo manager e all’HR' },
};
export function VisibilityBadge({ level }: { level: VisibilityLevel }) {
  const v = visibility[level];
  return <span className="vis" title={v.title}><Icon name={v.icon} size={12} stroke={2} />{v.text}</span>;
}

export const initialsOf = (p: { firstName: string; lastName: string }) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
/** Tinta deterministica per persona (t0…t5): stessa persona, stesso colore in tutta l'app. */
export const avatarTint = (p: { id?: string; firstName: string; lastName: string } | null | undefined) => {
  if (!p) return 't0';
  const key = p.id ?? `${p.firstName} ${p.lastName}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `t${h % 6}`;
};
export function Avatar({ person, small, large }: { person: { id?: string; firstName: string; lastName: string } | null | undefined; small?: boolean; large?: boolean }) {
  return <span className={`av ${avatarTint(person)}${small ? ' s' : ''}${large ? ' l' : ''}`} aria-hidden>{person ? initialsOf(person) : '?'}</span>;
}
export function Who({ person, role }: { person: { id?: string; firstName: string; lastName: string; jobTitle?: string | null }; role?: ReactNode }) {
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
