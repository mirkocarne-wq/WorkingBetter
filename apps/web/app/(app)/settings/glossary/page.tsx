import { redirect } from 'next/navigation';
import { DefaultNaming, NamingConceptLabels, NamingConcepts } from '@wb/shared';
import { apiFetch, type Me, type NamingResponse } from '@/lib/api';
import { saveNaming } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Button, PageHeader, Segmented } from '@/components/ui';

/** Impostazioni → Glossario (CORE-003): come l'azienda chiama i concetti della piattaforma, per lingua. */
export default async function GlossaryPage({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('tenant:settings')) redirect('/settings');
  const sp = await searchParams;
  const current = await apiFetch<NamingResponse>('/naming');
  const locale = sp.locale === 'en' || sp.locale === 'it' ? sp.locale : current.locale;
  const data = locale === current.locale ? current : await apiFetch<NamingResponse>(`/naming?locale=${locale}`);
  const defaults = DefaultNaming[locale] ?? DefaultNaming.it!;
  const changed = Object.keys(data.overrides).length;
  return (
    <>
      <PageHeader title="Glossario aziendale" subtitle={changed ? `${changed} ${changed === 1 ? 'concetto rinominato' : 'concetti rinominati'} · menu, titoli e App Studio usano i nomi dell’azienda` : 'Chiama le cose come le chiama la tua azienda: menu, titoli e App Studio si adeguano'} actions={<Button href="/settings" variant="ghost">Impostazioni</Button>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
        <div className="card flush">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--grid)' }}>
            <Segmented label="Lingua" current={locale} items={[{ key: 'it', label: 'Italiano', href: '/settings/glossary?locale=it' }, { key: 'en', label: 'English', href: '/settings/glossary?locale=en' }]} />
          </div>
          <ActionForm action={saveNaming}>
            <input type="hidden" name="locale" value={locale} />
            <div className="tbl">
              <table>
                <thead><tr><th>Concetto</th><th>Nome standard</th><th>Singolare</th><th>Plurale</th></tr></thead>
                <tbody>
                  {NamingConcepts.map((c) => (
                    <tr key={c}>
                      <td style={{ fontWeight: 500 }}>{NamingConceptLabels[c]}</td>
                      <td className="sup">{defaults[c].singular} / {defaults[c].plural}</td>
                      <td><input name={`${c}.singular`} className="input" placeholder={defaults[c].singular} defaultValue={data.overrides[c]?.singular ?? ''} maxLength={60} aria-label={`${NamingConceptLabels[c]} al singolare`} /></td>
                      <td><input name={`${c}.plural`} className="input" placeholder={defaults[c].plural} defaultValue={data.overrides[c]?.plural ?? ''} maxLength={60} aria-label={`${NamingConceptLabels[c]} al plurale`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 16 }}><Button variant="primary">Salva glossario</Button></div>
          </ActionForm>
        </div>
        <div className="card">
          <h3>Dove si vede</h3>
          <ul style={{ margin: 0, padding: '0 0 0 16px', color: 'var(--ink2)', fontSize: 13.5, display: 'grid', gap: 6 }}>
            <li>Menu laterale, ricerca rapida e titoli delle pagine dei moduli.</li>
            <li>Home: contatori e scorciatoie.</li>
            <li>App Studio: il vocabolario dei processi.</li>
            <li>Le API, le email già inviate e i PDF già generati mantengono i nomi tecnici.</li>
            <li>Un campo vuoto significa «usa il nome standard».</li>
          </ul>
        </div>
      </div>
    </>
  );
}
