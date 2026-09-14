import { notFound, redirect } from 'next/navigation';
import { ApiError, apiFetch, onboardingKindLabel, onboardingRoleLabel, onboardingTaskKindLabel, type Me, type OnboardingTemplate } from '@/lib/api';
import { saveOnboardingTemplate } from '@/lib/actions';
import { Button, Card, PageHeader, Pill, TableWrap } from '@/components/ui';
import { ActionForm } from '@/components/action-form';

const EMPTY: OnboardingTemplate = { id: '', name: '', kind: 'onboarding', description: null, phases: [{ key: 'pre', label: 'Pre-boarding', fromDay: -30, toDay: -1 }, { key: 'w1', label: 'Settimana 1', fromDay: 0, toDay: 7 }, { key: 'm1', label: 'Mese 1', fromDay: 8, toDay: 30 }, { key: 'd90', label: '90 giorni', fromDay: 31, toDay: 90 }], tasks: [{ key: 'first_one_on_one', phase: 'w1', title: 'Primo 1:1 con il manager', role: 'manager', kind: 'meeting', dueDay: 1, link: '/one-on-ones', required: true }], rules: {}, isDefault: false, active: true, updatedAt: '' };

/** Editor del template (ONB-001): metadati e regole in campi; fasi e task come JSON con anteprima tabellare. */
export default async function OnboardingTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('onboarding:manage')) redirect('/onboarding');
  let t: OnboardingTemplate = EMPTY;
  if (id !== 'new') { try { t = await apiFetch<OnboardingTemplate>(`/onboarding/templates/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; } }
  const units = await apiFetch<{ id: string; name: string }[]>('/org-units').catch(() => [] as { id: string; name: string }[]);
  return (
    <>
      <PageHeader title={id === 'new' ? 'Nuovo percorso' : t.name} subtitle={`${onboardingKindLabel[t.kind]} · ${t.phases.length} fasi · ${t.tasks.length} task`} actions={<Button href="/onboarding?tab=templates">Tutti i percorsi</Button>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', alignItems: 'start' }}>
        <Card title="Definizione">
          <ActionForm action={saveOnboardingTemplate} className="stack" style={{ gap: 8 }}>
            {id !== 'new' && <input type="hidden" name="id" value={t.id} />}
            <label className="field"><span className="lab">Nome</span><input name="name" className="input" required defaultValue={t.name} /></label>
            <label className="field"><span className="lab">Tipo</span><select name="kind" className="input" defaultValue={t.kind} disabled={id !== 'new'}><option value="onboarding">Onboarding</option><option value="role_change">Cambio ruolo</option><option value="offboarding">Offboarding</option></select></label>
            <label className="field"><span className="lab">Descrizione</span><textarea name="description" className="input" rows={2} defaultValue={t.description ?? ''} /></label>
            <div className="field"><span className="lab">Regole di assegnazione automatica <span className="sup">(tutte le condizioni indicate devono valere)</span></span>
              <div className="stack" style={{ gap: 6 }}>
                <input name="jobTitleKeywords" className="input" placeholder="Parole nel job title, separate da virgola (es. manager, lead)" defaultValue={t.rules.jobTitleKeywords?.join(', ') ?? ''} />
                <input name="locations" className="input" placeholder="Sedi, separate da virgola (es. remoto, Milano)" defaultValue={t.rules.locations?.join(', ') ?? ''} />
                <select name="orgUnitIds" className="input" multiple size={4} defaultValue={t.rules.orgUnitIds ?? []}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              </div>
            </div>
            <label className="check"><input type="checkbox" name="isDefault" defaultChecked={t.isDefault} /> <span>Percorso predefinito per questo tipo (usato quando nessuna regola corrisponde)</span></label>
            <label className="check"><input type="checkbox" name="active" value="on" defaultChecked={t.active} /> <span>Attivo</span></label>
            <label className="field"><span className="lab">Fasi <span className="sup">(JSON: key, label, fromDay, toDay)</span></span><textarea name="phases" className="input" rows={6} defaultValue={JSON.stringify(t.phases, null, 1)} style={{ fontFamily: 'monospace', fontSize: 12 }} /></label>
            <label className="field"><span className="lab">Task <span className="sup">(JSON: key, phase, title, description, role, kind, dueDay, link, formKey, surveyKey, required)</span></span><textarea name="tasks" className="input" rows={16} defaultValue={JSON.stringify(t.tasks, null, 1)} style={{ fontFamily: 'monospace', fontSize: 12 }} /></label>
            <div className="sup">Ruoli: newcomer, manager, hr, buddy, it · tipi: todo, read, sign, form (con formKey di un form pubblicato), meeting, objective, survey (surveyKey d7, d30, d90, exit) · dueDay: giorni dalla data di riferimento, negativi prima.</div>
            <div><Button variant="primary">Salva</Button></div>
          </ActionForm>
        </Card>
        <Card title="Anteprima" aside="task per fase, come li vedrà la persona">
          {t.phases.map((ph) => (
            <div key={ph.key} style={{ marginBottom: 12 }}>
              <h3 style={{ margin: '0 0 4px' }}>{ph.label} <small>giorni {ph.fromDay}–{ph.toDay}</small></h3>
              <TableWrap>
                <table>
                  <tbody>{t.tasks.filter((x) => x.phase === ph.key).sort((a, b) => a.dueDay - b.dueDay).map((x) => <tr key={x.key}><td className="num" style={{ width: 60 }}>{x.dueDay >= 0 ? `+${x.dueDay}` : x.dueDay}</td><td><b>{x.title}</b>{x.description && <div className="sup">{x.description}</div>}</td><td><Pill tone="n">{onboardingRoleLabel[x.role]}</Pill></td><td className="sup">{onboardingTaskKindLabel[x.kind]}{x.surveyKey ? ` · ${x.surveyKey}` : ''}{x.formKey ? ` · ${x.formKey}` : ''}{!x.required ? ' · facoltativo' : ''}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
