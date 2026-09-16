import { redirect } from 'next/navigation';
import { TenantModuleLabels, TenantModules, isModuleEnabled } from '@wb/shared';
import { apiFetch, type Me, type Tenant } from '@/lib/api';
import { saveModules } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Button, PageHeader } from '@/components/ui';
import { Icon, type IconName } from '@/components/icons';

const ICONS: Record<string, IconName> = { okr: 'target', one_on_ones: 'one', feedback: 'chat', reviews: 'review', surveys: 'survey', welfare: 'welfare', development: 'growth', f360: 'f360', onboarding: 'onb', apps: 'flow', analytics: 'report' };

/** Impostazioni → Moduli (CORE-004): quali moduli il tenant usa; gli altri spariscono da menu, Home e Guida. */
export default async function ModulesPage() {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('tenant:settings')) redirect('/settings');
  const tenant = await apiFetch<Tenant>('/tenant');
  const settings = { modules: tenant.settings?.modules };
  const active = TenantModules.filter((m) => isModuleEnabled(settings, m)).length;
  return (
    <>
      <PageHeader title="Moduli attivi" subtitle={`${active} di ${TenantModules.length} moduli in uso · i moduli spenti spariscono da menu, Home e Guida per tutti`} actions={<Button href="/settings" variant="ghost">Impostazioni</Button>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
        <div className="card">
          <ActionForm action={saveModules} style={{ display: 'grid', gap: 4 }}>
            {TenantModules.map((m) => (
              <label key={m} className="check" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 8px', borderBottom: '1px solid var(--grid)' }}>
                <input type="checkbox" name="modules" value={m} defaultChecked={isModuleEnabled(settings, m)} style={{ marginTop: 3 }} />
                <span className="ic" style={{ color: 'var(--brand-2)' }}><Icon name={ICONS[m] ?? 'flow'} size={18} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{TenantModuleLabels[m].name}</span>
                  <span className="sup">{TenantModuleLabels[m].description}</span>
                </span>
              </label>
            ))}
            <div style={{ paddingTop: 12 }}><Button variant="primary">Salva</Button></div>
          </ActionForm>
        </div>
        <div className="card">
          <h3>Come funziona</h3>
          <ul style={{ margin: 0, padding: '0 0 0 16px', color: 'var(--ink2)', fontSize: 13.5, display: 'grid', gap: 6 }}>
            <li>Un modulo spento sparisce dal menu, dalla Home e dalla Guida; le sue pagine rimandano alla Home.</li>
            <li>I dati restano al loro posto: riattivandolo torna tutto come prima.</li>
            <li>Persone, Form, Notifiche e Impostazioni sono sempre attivi.</li>
            <li>I permessi dei ruoli restano la barriera di sicurezza: spegnere un modulo non è un modo per nascondere dati a chi ne ha diritto.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
