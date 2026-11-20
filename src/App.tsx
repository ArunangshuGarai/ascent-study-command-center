import { useAuth } from './hooks/useAuth';
import { AuthView } from './components/AuthView';
import { Workspace } from './components/Workspace';

function AuthBoot() {
  return (
    <div className="auth-boot">
      <div className="auth-ambient" aria-hidden>
        <span className="auth-aurora aurora-a" />
        <span className="auth-aurora aurora-b" />
        <span className="auth-grain" />
        <span className="auth-gridlines" />
      </div>
      <div className="auth-boot-core">
        <span className="brand-mark large" aria-hidden><i /><i /><i /><b /></span>
        <div className="auth-boot-word">ASCENT</div>
        <div className="auth-boot-line"><span /></div>
        <p>ESTABLISHING SECURE LINK</p>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();

  if (auth.status === 'loading') return <AuthBoot />;

  if (!auth.user) {
    return (
      <AuthView
        onLogin={auth.login}
        onRegister={auth.register}
        initialError={auth.error}
      />
    );
  }

  return (
    <Workspace
      key={auth.user.id}
      user={auth.user}
      serverState={auth.planner?.state ?? null}
      accountStats={auth.stats}
      onStats={auth.setStats}
      onUser={auth.setUser}
      onSignOut={auth.logout}
    />
  );
}
