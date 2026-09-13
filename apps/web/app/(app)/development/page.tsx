import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, devPlanStatusLabel, type DevPersonRow, type DevProfile, type Me } from '@/lib/api';
import { Button, Card, PageHeader, Pill, TableWrap, Who } from '@/components/ui';
import { DevProfileView } from '@/components/dev-profile';
import Link from 'next/link';

export default async function DevelopmentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('development:use')) redirect('/dashboard');
  if (!me.person) redirect('/dashboard');
  const isTeam = me.permissions.includes('development:team') || me.permissions.includes('development:manage');
  const tab = isTeam && sp.tab === 'team' ? 'team' : 'me';
  const [d, team] = await Promise.all([apiFetch<DevProfile>('/development/me'), isTeam ? apiFetch<DevPersonRow[]>('/development/people').catch(() => [] as DevPersonRow[]) : Promise.resolve([] as DevPersonRow[])]);
  return (
    <>
      <PageHeader title="Sviluppo e carriera" subtitle={d.profile ? `${d.profile.title}${d.nextProfile ? ` → prossimo ruolo: ${d.nextProfile.title}` : ''}` : 'Competenze, gap e piano di sviluppo'} actions={me.permissions.includes('development:manage') ? <Button href="/development/admin">Amministrazione</Button> : undefined} />
      {isTeam && <nav className="tabs"><Link href="/development" className={tab === 'me' ? 'on' : ''}>Il mio sviluppo</Link><Link href="/development?tab=team" className={tab === 'team' ? 'on' : ''}>Il mio team ({team.filter((t) => t.person.id !== me.person!.id).length})</Link></nav>}
      {tab === 'me' ? <DevProfileView d={d} backPath="/development" /> : (
        <Card title="Il mio team" aside="profilo, piano e azioni">
          <TableWrap>
            <table>
              <thead><tr><th>Persona</th><th>Job profile</th><th>Piano</th><th className="num">Azioni aperte</th><th>Ultima valutazione</th><th></th></tr></thead>
              <tbody>
                {team.filter((t) => t.person.id !== me.person!.id).map((t) => (
                  <tr key={t.person.id}>
                    <td><Who person={{ firstName: t.person.firstName, lastName: t.person.lastName, jobTitle: t.person.jobTitle }} /></td>
                    <td>{t.profile ? `${t.profile.title}${t.profile.level ? ` · ${t.profile.level}` : ''}` : <span className="sup">non assegnato</span>}</td>
                    <td>{t.plan ? <Pill tone={devPlanStatusLabel[t.plan]?.cls as 'g'}>{devPlanStatusLabel[t.plan]?.text}</Pill> : <span className="sup">nessuno</span>}</td>
                    <td className="num">{t.openActions}{t.overdueActions ? <span className="sup" style={{ color: 'var(--crit-text)' }}> · {t.overdueActions} scadute</span> : ''}</td>
                    <td className="sup">auto {fmtDate(t.lastSelf)} · manager {fmtDate(t.lastManager)}</td>
                    <td><Button href={`/development/people/${t.person.id}`} size="sm">Apri</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
