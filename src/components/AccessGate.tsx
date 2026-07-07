import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import type { AccessRequestRegistrationInput, Session } from '../shared/authRegistration';

type AccessGateMode = 'login' | 'register' | 'reset' | 'pending';

type AccessGateProps = {
  error: string;
  pendingSession: Session | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (input: AccessRequestRegistrationInput) => Promise<void>;
  onResetPassword: (email: string) => Promise<string>;
  onSignOut: () => Promise<void>;
};

const workspaceEmailStorageKey = 'visaflow.workspaceEmail.v2';

function storedWorkspaceEmail() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(workspaceEmailStorageKey) ?? '';
}

function rememberWorkspaceEmail(email: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workspaceEmailStorageKey, email.trim().toLowerCase());
}

function PasswordToggle({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="access-field">
      <label htmlFor={id}>{label}</label>
      <span className="access-password-row">
        <input
          id={id}
          autoComplete="current-password"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <button
          className="access-password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          {visible ? 'Скрыть пароль' : 'Показать пароль'}
        </button>
      </span>
    </div>
  );
}

function AccessShell({ children }: { children: ReactNode }) {
  return (
    <main className="access-layout min-h-dvh bg-[#101011] text-white">
      <section className="access-brand-panel">
        <div className="access-brand-mark">V</div>
        <p className="access-kicker">VisaFlow V-19</p>
        <h2>Рабочий кабинет BLS</h2>
        <p>Регистрация агентов, ручное подтверждение администратором и закрытый доступ к анкетам.</p>
      </section>
      <section className="access-card">{children}</section>
    </main>
  );
}

export function AccessGate({
  error,
  pendingSession,
  onLogin,
  onRegister,
  onResetPassword,
  onSignOut,
}: AccessGateProps) {
  const [mode, setMode] = useState<AccessGateMode>(pendingSession ? 'pending' : 'login');
  const [email, setEmail] = useState(storedWorkspaceEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState('');
  const [registration, setRegistration] = useState<AccessRequestRegistrationInput>({
    city: '',
    companyName: '',
    email: storedWorkspaceEmail(),
    fullName: '',
    password: '',
    phone: '',
  });

  useEffect(() => {
    if (pendingSession) {
      setMode('pending');
      setEmail(pendingSession.email);
      setRegistration((current) => ({ ...current, email: pendingSession.email }));
    }
  }, [pendingSession]);

  const validationErrors = useMemo(() => {
    if (mode !== 'register') return [];
    const next: string[] = [];
    if (!registration.fullName.trim()) next.push('Введите имя и фамилию.');
    if (!registration.companyName.trim()) next.push('Введите название агентства.');
    if (!registration.city.trim()) next.push('Введите город.');
    if (!registration.phone.trim()) next.push('Введите телефон.');
    if (!registration.password.trim()) next.push('Введите пароль.');
    return next;
  }, [mode, registration]);

  const shownError = localError || error;

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) {
      setLocalError('Введите пароль.');
      return;
    }
    setBusy(true);
    setLocalError('');
    setSuccess('');
    try {
      rememberWorkspaceEmail(email);
      await onLogin(email, password);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Не удалось войти.');
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError('');
    setSuccess('');
    if (validationErrors.length) {
      return;
    }
    setBusy(true);
    try {
      rememberWorkspaceEmail(registration.email);
      await onRegister(registration);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Не удалось отправить заявку.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLocalError('');
    setSuccess('');
    try {
      rememberWorkspaceEmail(email);
      setSuccess(await onResetPassword(email));
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Не удалось восстановить доступ.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'pending' && pendingSession) {
    return (
      <AccessShell>
        <div className="access-card-header">
          <ShieldCheck size={22} />
          <h1>Ожидает подтверждения</h1>
        </div>
        <p className="access-intro">
          Заявка для {pendingSession.email} отправлена. Доступ появится после подтверждения администратором.
        </p>
        <div className="access-success">Статус: pending · роль agent</div>
        <button className="access-submit" type="button" onClick={() => void onSignOut()}>
          Выйти
        </button>
      </AccessShell>
    );
  }

  if (mode === 'register') {
    return (
      <AccessShell>
        <button className="access-back-button" type="button" onClick={() => setMode('login')}>
          Вернуться ко входу
        </button>
        <div className="access-card-header">
          <ShieldCheck size={22} />
          <h1 id="workspace-register-title">Заявка на доступ</h1>
        </div>
        <p className="access-intro">Новый агент попадает в очередь администратора и не видит кабинет до одобрения.</p>
        <form onSubmit={(event) => void submitRegistration(event)}>
          <label className="access-field" htmlFor="workspace-register-name">
            <span>Имя и фамилия</span>
            <input
              id="workspace-register-name"
              value={registration.fullName}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRegistration((current) => ({ ...current, fullName: value }));
              }}
            />
          </label>
          <label className="access-field" htmlFor="workspace-register-company">
            <span>Агентство / компания</span>
            <input
              id="workspace-register-company"
              value={registration.companyName}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRegistration((current) => ({ ...current, companyName: value }));
              }}
            />
          </label>
          <label className="access-field" htmlFor="workspace-register-city">
            <span>Город</span>
            <input
              id="workspace-register-city"
              value={registration.city}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRegistration((current) => ({ ...current, city: value }));
              }}
            />
          </label>
          <label className="access-field" htmlFor="workspace-register-phone">
            <span>Телефон</span>
            <input
              id="workspace-register-phone"
              value={registration.phone}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRegistration((current) => ({ ...current, phone: value }));
              }}
            />
          </label>
          <label className="access-field" htmlFor="workspace-register-email">
            <span>Email</span>
            <input
              id="workspace-register-email"
              autoComplete="email"
              value={registration.email}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRegistration((current) => ({ ...current, email: value }));
              }}
            />
          </label>
          <PasswordToggle
            id="workspace-register-password"
            label="Пароль"
            value={registration.password}
            onChange={(next) => setRegistration((current) => ({ ...current, password: next }))}
          />
          {shownError ? <div className="access-error">{shownError}</div> : null}
          {validationErrors.map((message) => (
            <div className="access-field-error" key={message}>{message}</div>
          ))}
          <button className="access-submit" disabled={busy} type="submit">
            {busy ? 'Отправляем...' : 'Подать заявку на доступ'}
          </button>
        </form>
      </AccessShell>
    );
  }

  if (mode === 'reset') {
    return (
      <AccessShell>
        <button className="access-back-button" type="button" onClick={() => setMode('login')}>
          Вернуться ко входу
        </button>
        <div className="access-card-header">
          <Mail size={22} />
          <h1>Восстановление доступа</h1>
        </div>
        <form onSubmit={(event) => void submitReset(event)}>
          <label className="access-field" htmlFor="workspace-reset-email">
            <span>Email</span>
            <input
              id="workspace-reset-email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </label>
          {shownError ? <div className="access-error">{shownError}</div> : null}
          {success ? <div className="access-success">{success}</div> : null}
          <button className="access-submit" disabled={busy} type="submit">
            Отправить инструкции
          </button>
        </form>
      </AccessShell>
    );
  }

  return (
    <AccessShell>
      <div className="access-card-header">
        <Lock size={22} />
        <h1>Вход</h1>
      </div>
      <p className="access-intro">Войдите как одобренный агент или администратор.</p>
      <form onSubmit={(event) => void submitLogin(event)}>
        <label className="access-field" htmlFor="workspace-email">
          <span>Email</span>
          <input
            id="workspace-email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </label>
        <PasswordToggle id="workspace-password" label="Пароль" value={password} onChange={setPassword} />
        {shownError ? <div className="access-error">{shownError}</div> : null}
        <button className="access-submit" disabled={busy} type="submit">
          {busy ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
      <div className="access-note">
        <button type="button" onClick={() => {
          setRegistration((current) => ({ ...current, email }));
          setMode('register');
        }}>
          Запросить доступ
        </button>
        <button type="button" onClick={() => setMode('reset')}>
          Восстановить пароль
        </button>
      </div>
    </AccessShell>
  );
}
