import { cache } from 'react';
import { redirect } from 'next/navigation';
import { DefaultNaming, isModuleEnabled, type ModuleSettings, type Naming, type TenantModule } from '@wb/shared';
import { apiFetch, type NamingResponse, type Tenant } from './api';

/**
 * Contesto di personalizzazione del tenant (sprint 26), letto una volta per richiesta:
 * moduli attivi (CORE-004) e glossario aziendale (CORE-003). Senza API risponde con i default.
 */
export const tenantContext = cache(async (): Promise<{ tenant: Tenant | null; modules: ModuleSettings; naming: Naming }> => {
  const [tenant, naming] = await Promise.all([
    apiFetch<Tenant>('/tenant').catch(() => null),
    apiFetch<NamingResponse>('/naming').catch(() => null),
  ]);
  return { tenant, modules: tenant?.settings?.modules ?? {}, naming: naming?.naming ?? DefaultNaming.it! };
});

export const getNaming = async () => (await tenantContext()).naming;
export const moduleOn = async (m: TenantModule) => isModuleEnabled({ modules: (await tenantContext()).modules }, m);

/** Da usare nel layout di ogni modulo: se il tenant lo ha disattivato, le sue pagine rimandano alla Home. */
export async function requireModule(m: TenantModule) {
  if (!(await moduleOn(m))) redirect('/dashboard?module_off=' + m);
}
