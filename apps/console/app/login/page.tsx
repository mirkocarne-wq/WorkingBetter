import { LoginForm } from './login-form';

/** Accesso degli operatori di piattaforma (PLT-001). */
export default function LoginPage() {
  return (
    <div className="login">
      <div className="card" style={{ width: 400, display: 'grid', gap: 14 }}>
        <div className="logo"><i /> WorkingBetter</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Console di piattaforma</div>
          <div className="sup">Riservata agli operatori. Gli accessi sono registrati.</div>
        </div>
        <LoginForm />
        <div className="sup">Dopo 5 tentativi errati l’account resta bloccato 15 minuti. Il primo operatore si crea con il comando <code>platform-admin</code> o dalle variabili di avvio.</div>
      </div>
    </div>
  );
}
