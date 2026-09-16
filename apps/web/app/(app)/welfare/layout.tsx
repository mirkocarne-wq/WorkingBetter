import { requireModule } from '@/lib/tenant';

/** Modulo disattivabile per tenant (CORE-004): spento, le sue pagine rimandano alla Home. */
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('welfare');
  return children;
}
