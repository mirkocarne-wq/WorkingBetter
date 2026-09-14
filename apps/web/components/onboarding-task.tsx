import Link from 'next/link';
import { fmtDate, onboardingRoleLabel, type OnboardingTask } from '@/lib/api';
import { updateOnboardingTask } from '@/lib/actions';
import { Button, Pill } from '@/components/ui';
import { ActionForm } from '@/components/action-form';

/** Riga di un task di onboarding con le azioni consentite (ONB-012/014). */
export function OnboardingTaskRow({ t, backPath, canManage, showPerson }: { t: OnboardingTask; backPath: string; canManage: boolean; showPerson?: boolean }) {
  const canAct = t.isMine || canManage;
  const open = t.status === 'open';
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--grid)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ textDecoration: t.status !== 'open' ? 'line-through' : 'none', color: t.status !== 'open' ? 'var(--muted)' : 'inherit', fontWeight: 600 }}>{t.title}{!t.required && <span className="sup"> · facoltativo</span>}</div>
        <div className="sup">
          {t.kindLabel} · {onboardingRoleLabel[t.role]}{t.assignee ? `: ${t.assignee.firstName} ${t.assignee.lastName}` : ''}{showPerson && t.journey?.person && !t.journey.isMe ? ` · per ${t.journey.person.firstName} ${t.journey.person.lastName}` : ''}
          {t.dueDate ? ` · entro ${fmtDate(t.dueDate)}` : ''} {t.overdue && <Pill tone="c">scaduto</Pill>}
          {t.status === 'done' && t.completedAt ? ` · fatto il ${fmtDate(t.completedAt)}${t.completedBy ? ` da ${t.completedBy}` : ''}` : ''}{t.status === 'skipped' ? ' · saltato' : ''}
        </div>
        {t.description && <div style={{ fontSize: 13, marginTop: 2 }}>{t.description}</div>}
        {t.note && <div className="sup" style={{ marginTop: 2 }}>«{t.note}»</div>}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {t.link && open && <Link href={t.link} className="btn sm">{t.kind === 'form' ? 'Compila' : t.kind === 'meeting' ? 'Vai ai 1:1' : t.kind === 'objective' ? 'Vai agli obiettivi' : 'Apri'}</Link>}
        {open && t.kind === 'survey' && t.isMine && <a href={`#survey-${t.surveyKey}`} className="btn sm p">Rispondi</a>}
        {open && t.kind === 'sign' && t.isMine && (
          <ActionForm action={updateOnboardingTask.bind(null, t.id, backPath)} inline>
            <input type="hidden" name="status" value="done" />
            <label className="check"><input type="checkbox" name="acknowledged" required /> <span className="sup">Ho letto e preso visione</span></label>
            <Button size="sm" variant="primary">Conferma</Button>
          </ActionForm>
        )}
        {open && t.kind !== 'sign' && t.kind !== 'survey' && canAct && (
          <ActionForm action={updateOnboardingTask.bind(null, t.id, backPath)} inline>
            <input type="hidden" name="status" value="done" />
            <Button size="sm" variant="primary">Fatto</Button>
          </ActionForm>
        )}
        {open && !t.required && canAct && (
          <ActionForm action={updateOnboardingTask.bind(null, t.id, backPath)} inline><input type="hidden" name="status" value="skipped" /><Button size="sm" variant="ghost">Salta</Button></ActionForm>
        )}
        {!open && canManage && t.kind !== 'survey' && (
          <ActionForm action={updateOnboardingTask.bind(null, t.id, backPath)} inline><input type="hidden" name="status" value="open" /><Button size="sm" variant="ghost">Riapri</Button></ActionForm>
        )}
      </div>
    </div>
  );
}
