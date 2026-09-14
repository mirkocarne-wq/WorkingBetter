import Link from 'next/link';
import { apiFetch, guideProfileLabel, manualLink, MANUAL_URL, type Guide, type GuideProfile } from '@/lib/api';
import { dismissGuide, setGuideStep } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Tabs } from '@/components/ui';

/** Avviamento guidato (AVV-001…005): passi per profilo con stato dai dati, motivazione HR e istruzioni. */
export default async function GuidePage({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  const sp = await searchParams;
  const g = await apiFetch<Guide>(sp.profile ? `/guides/me?profile=${encodeURIComponent(sp.profile)}` : '/guides/me');
  const pctDone = g.total ? Math.round((g.done / g.total) * 100) : 0;
  const manualHome = MANUAL_URL ? manualLink('README.md') : null;
  return (
    <>
      <div className="ph">
        <div><h1>{g.title}</h1><p>{g.intro}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {manualHome && <a href={manualHome} target="_blank" rel="noreferrer" className="btn">Manuale operativo</a>}
          {g.isOwnProfile && g.dismissedAt && <form action={dismissGuide.bind(null, false)}><button className="btn">Mostra di nuovo in Home</button></form>}
          {g.isOwnProfile && !g.dismissedAt && !g.complete && <form action={dismissGuide.bind(null, true)}><button className="btn">Nascondi da Home</button></form>}
        </div>
      </div>
      {g.availableProfiles.length > 1 && <Tabs current={g.profile} items={g.availableProfiles.map((p: GuideProfile) => ({ key: p, label: guideProfileLabel[p], href: `/inizia?profile=${p}` }))} />}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div><b>{g.done} di {g.total}</b> passi obbligatori fatti{g.complete ? ' · avviamento completo 🎉' : ''}{!g.isOwnProfile ? ` · stai consultando la guida «${guideProfileLabel[g.profile]}»: i passi personali vanno verificati con la persona` : ''}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 200 }}><div className="bar g" style={{ flex: 1 }}><i style={{ width: `${pctDone}%` }} /></div><span style={{ fontSize: 12 }}>{pctDone}%</span></div>
        </div>
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        {g.steps.map((s, i) => {
          const done = s.status === 'done';
          const link = manualLink(s.manual);
          return (
            <li key={s.key} className="card" style={{ borderLeft: `4px solid ${done ? 'var(--good)' : s.optional ? 'var(--grid)' : 'var(--brand)'}` }}>
              <details open={!done}>
                <summary style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', listStyle: 'none' }}>
                  <span className="av s" style={{ background: done ? 'var(--good-soft)' : 'var(--brand-soft)', color: done ? 'var(--good-text)' : 'var(--brand-2)' }}>{done ? '✓' : i + 1}</span>
                  <b style={{ fontSize: 15 }}>{s.title}</b>
                  <span className={`pill ${done ? 'g' : s.optional ? 'n' : 'w'}`}>{done ? 'fatto' : s.optional ? 'facoltativo' : 'da fare'}</span>
                  {s.auto && <span className="sup" title="Lo stato si aggiorna da solo in base ai dati">{s.detail ?? 'controllo automatico'}</span>}
                </summary>
                <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 12 }}>
                  <div>
                    <div className="lvl" style={{ marginBottom: 4 }}>Perché conta</div>
                    <p style={{ margin: 0, color: 'var(--ink2)' }}>{s.why}</p>
                  </div>
                  <div>
                    <div className="lvl" style={{ marginBottom: 4 }}>Come fare</div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{s.how.map((h, j) => <li key={j}>{h}</li>)}</ol>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link href={s.href} className={`btn sm ${done ? '' : 'p'}`}>{s.cta}</Link>
                  {link ? <a href={link} target="_blank" rel="noreferrer" className="btn sm">Manuale · {s.manual.replace(/\.md.*$/, '')}</a> : <span className="sup">Manuale: {s.manual}</span>}
                  {!s.auto && g.isOwnProfile && (
                    <ActionForm action={setGuideStep.bind(null, s.key, !done)} inline>
                      <button className="btn sm">{done ? 'Riapri' : 'Segna come fatto'}</button>
                    </ActionForm>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </>
  );
}
