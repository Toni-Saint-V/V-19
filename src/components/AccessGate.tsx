import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import visaflowLogo from '../assets/visaflow-logo.png';
import type { AccessRequestRegistrationInput, Session } from '../shared/authRegistration';

type AccessGateMode = 'invite' | 'login' | 'register' | 'reset' | 'pending';

type AccessGateProps = {
  error: string;
  inviteSetupEmail: string;
  pendingSession: Session | null;
  usesSupabase?: boolean;
  onCompleteInvite: (password: string) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (input: AccessRequestRegistrationInput) => Promise<void>;
  onResetPassword: (email: string) => Promise<string>;
  onSignOut: () => Promise<void>;
};

type RegistrationTextField = {
  autoComplete: string;
  id: string;
  inputMode?: 'email' | 'tel';
  key: Exclude<keyof AccessRequestRegistrationInput, 'password'>;
  label: string;
  placeholder: string;
  type: 'email' | 'tel' | 'text';
};

const workspaceEmailStorageKey = 'visaflow.workspaceEmail.v2';

const accessTitleIds: Record<AccessGateMode, string> = {
  invite: 'workspace-invite-title',
  login: 'workspace-access-title',
  pending: 'workspace-pending-title',
  register: 'workspace-register-title',
  reset: 'workspace-reset-title',
};

const accessCopyIds: Record<AccessGateMode, string> = {
  invite: 'workspace-invite-copy',
  login: 'workspace-access-copy',
  pending: 'workspace-pending-copy',
  register: 'workspace-register-copy',
  reset: 'workspace-reset-copy',
};

const registrationFields: RegistrationTextField[] = [
  {
    autoComplete: 'name',
    id: 'workspace-register-name',
    key: 'fullName',
    label: 'Имя и фамилия',
    placeholder: 'Анна Петрова',
    type: 'text',
  },
  {
    autoComplete: 'organization',
    id: 'workspace-register-company',
    key: 'companyName',
    label: 'Агентство / компания',
    placeholder: 'Visa Center',
    type: 'text',
  },
  {
    autoComplete: 'address-level2',
    id: 'workspace-register-city',
    key: 'city',
    label: 'Город',
    placeholder: 'Москва',
    type: 'text',
  },
  {
    autoComplete: 'tel',
    id: 'workspace-register-phone',
    inputMode: 'tel',
    key: 'phone',
    label: 'Телефон',
    placeholder: '+7 900 000-00-00',
    type: 'tel',
  },
  {
    autoComplete: 'email',
    id: 'workspace-register-email',
    inputMode: 'email',
    key: 'email',
    label: 'Email',
    placeholder: 'name@example.com',
    type: 'email',
  },
];

function storedWorkspaceEmail() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(workspaceEmailStorageKey) ?? '';
}

function rememberWorkspaceEmail(email: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workspaceEmailStorageKey, email.trim().toLowerCase());
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function PrimaryButton({
  busy,
  children,
}: {
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button className="primary-button access-submit" disabled={busy} type="submit">
      {children}
    </button>
  );
}

function AccessShell({
  activeCopyId,
  activeTitleId,
  children,
}: {
  activeCopyId: string;
  activeTitleId: string;
  children: ReactNode;
}) {
  return (
    <main className="access-shell" aria-label="Вход в рабочий кабинет">
      <div className="access-layout">
        <section className="access-brand-panel" aria-label="VisaFlow">
          <div className="access-brand-lockup">
            <img className="access-brand-logo" src={visaflowLogo} alt="VisaFlow" />
          </div>
        </section>

        <section
          className="access-card"
          aria-labelledby={activeTitleId}
          aria-describedby={activeCopyId}
        >
          {children}
        </section>
      </div>
    </main>
  );
}

export function AccessGate({
  error,
  inviteSetupEmail,
  pendingSession,
  usesSupabase = false,
  onCompleteInvite,
  onLogin,
  onRegister,
  onResetPassword,
  onSignOut,
}: AccessGateProps) {
  const [mode, setMode] = useState<AccessGateMode>(pendingSession ? 'pending' : 'register');
  const [email, setEmail] = useState(storedWorkspaceEmail);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState(storedWorkspaceEmail);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [invitePassword, setInvitePassword] = useState('');
  const [invitePasswordConfirmation, setInvitePasswordConfirmation] = useState('');
  const [invitePasswordVisible, setInvitePasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof AccessRequestRegistrationInput, boolean>>>({});
  const [registration, setRegistration] = useState<AccessRequestRegistrationInput>({
    city: '',
    companyName: '',
    email: storedWorkspaceEmail(),
    fullName: '',
    password: '',
    phone: '',
  });

  useEffect(() => {
    if (!pendingSession) return;
    setMode('pending');
    setEmail(pendingSession.email);
    setRegistration((current) => ({ ...current, email: pendingSession.email }));
  }, [pendingSession]);

  useEffect(() => {
    if (!inviteSetupEmail) return;
    setMode('invite');
    setEmail(inviteSetupEmail);
  }, [inviteSetupEmail]);

  const activeTitleId = accessTitleIds[mode];
  const activeCopyId = accessCopyIds[mode];

  const registerErrors = useMemo(
    () => ({
      city:
        (attempted || touched.city) && !registration.city.trim()
          ? 'Введите город'
          : '',
      companyName:
        (attempted || touched.companyName) && !registration.companyName.trim()
          ? 'Введите название агентства'
          : '',
      email:
        (attempted || touched.email) && !validEmail(registration.email)
          ? 'Введите корректный email'
          : '',
      fullName:
        (attempted || touched.fullName) && !registration.fullName.trim()
          ? 'Введите имя и фамилию'
          : '',
      password:
        (attempted || touched.password) && !registration.password.trim()
          ? 'Введите пароль'
          : '',
      phone:
        (attempted || touched.phone) && !registration.phone.trim()
          ? 'Введите телефон'
          : '',
    }),
    [attempted, registration, touched],
  );

  function clearMessages() {
    setLocalError('');
    setSuccess('');
  }

  function returnToLogin() {
    clearMessages();
    setMode('login');
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (!validEmail(email)) {
      setLocalError('Введите корректный email');
      return;
    }
    if (!password.trim()) {
      setLocalError('Введите пароль');
      return;
    }

    setBusy(true);
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
    setAttempted(true);
    clearMessages();

    const complete =
      registration.fullName.trim() &&
      registration.companyName.trim() &&
      registration.city.trim() &&
      registration.phone.trim() &&
      (usesSupabase || registration.password.trim()) &&
      validEmail(registration.email);
    if (!complete) return;

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
    clearMessages();
    if (!validEmail(resetEmail)) {
      setLocalError('Введите корректный email');
      return;
    }

    setBusy(true);
    try {
      rememberWorkspaceEmail(resetEmail);
      setSuccess(await onResetPassword(resetEmail));
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Не удалось восстановить доступ.');
    } finally {
      setBusy(false);
    }
  }

  async function submitInvitePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (invitePassword.length < 12) {
      setLocalError('Пароль должен содержать не меньше 12 символов.');
      return;
    }
    if (invitePassword !== invitePasswordConfirmation) {
      setLocalError('Пароли не совпадают.');
      return;
    }

    setBusy(true);
    try {
      await onCompleteInvite(invitePassword);
      rememberWorkspaceEmail(inviteSetupEmail);
      setEmail(inviteSetupEmail);
      setPassword('');
      setInvitePassword('');
      setInvitePasswordConfirmation('');
      setSuccess('Пароль сохранён. Войдите в кабинет с новым паролем.');
      setMode('login');
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : 'Не удалось сохранить пароль.',
      );
    } finally {
      setBusy(false);
    }
  }

  function openRegisterFromLogin() {
    setRegistration((current) => ({ ...current, email }));
    setAttempted(false);
    setTouched({});
    clearMessages();
    setMode('register');
  }

  function renderPasswordToggle(visible: boolean, setVisible: (value: boolean) => void) {
    return (
      <button
        className="access-password-toggle"
        type="button"
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    );
  }

  if (mode === 'invite' && inviteSetupEmail) {
    return (
      <AccessShell activeCopyId={activeCopyId} activeTitleId={activeTitleId}>
        <div className="access-card-header">
          <div>
            <p className="access-kicker">Приглашение подтверждено</p>
            <h1 id="workspace-invite-title">Создайте пароль</h1>
          </div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <p className="access-intro" id="workspace-invite-copy">
          Установите пароль для {inviteSetupEmail}. После сохранения войдите обычным способом.
        </p>
        <form className="access-form" onSubmit={(event) => void submitInvitePassword(event)} noValidate>
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-invite-password">
              Новый пароль
            </label>
            <div className="access-password-control">
              <input
                autoComplete="new-password"
                id="workspace-invite-password"
                minLength={12}
                name="invite-password"
                type={invitePasswordVisible ? 'text' : 'password'}
                value={invitePassword}
                onChange={(event) => setInvitePassword(event.target.value)}
              />
              {renderPasswordToggle(invitePasswordVisible, setInvitePasswordVisible)}
            </div>
          </div>
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-invite-password-confirmation">
              Повторите пароль
            </label>
            <input
              autoComplete="new-password"
              id="workspace-invite-password-confirmation"
              minLength={12}
              name="invite-password-confirmation"
              type={invitePasswordVisible ? 'text' : 'password'}
              value={invitePasswordConfirmation}
              onChange={(event) => setInvitePasswordConfirmation(event.target.value)}
            />
          </div>
          {localError || error ? (
            <p className="access-error" role="alert">
              {localError || error}
            </p>
          ) : null}
          <PrimaryButton busy={busy}>
            {busy ? 'Сохраняем...' : 'Сохранить пароль'}
          </PrimaryButton>
        </form>
      </AccessShell>
    );
  }

  if (mode === 'pending' && pendingSession) {
    return (
      <AccessShell activeCopyId={activeCopyId} activeTitleId={activeTitleId}>
        <div className="access-card-header">
          <div>
            <p className="access-kicker">Первый вход</p>
            <h1 id="workspace-pending-title">Ожидает подтверждения</h1>
          </div>
        </div>
        <p className="access-intro" id="workspace-pending-copy">
          Заявка для {pendingSession.email} отправлена. Доступ появится после подтверждения администратором.
        </p>
        <p className="access-success" role="status">
          Статус: pending · роль agent
        </p>
        <button className="primary-button access-submit" type="button" onClick={() => void onSignOut()}>
          Выйти
        </button>
      </AccessShell>
    );
  }

  if (mode === 'login') {
    return (
      <AccessShell activeCopyId={activeCopyId} activeTitleId={activeTitleId}>
        <div className="access-card-header">
          <div>
            <p className="access-kicker">VisaFlow</p>
            <h1 id="workspace-access-title">Вход</h1>
          </div>
          <Lock aria-hidden="true" />
        </div>
        <p className="access-intro" id="workspace-access-copy">
          Введите email и пароль для доступа к кабинету.
        </p>
        <form className="access-form" onSubmit={(event) => void submitLogin(event)} noValidate>
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-email">
              Email
            </label>
            <input
              autoComplete="email"
              id="workspace-email"
              inputMode="email"
              name="email"
              placeholder="name@example.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-password">
              Пароль
            </label>
            <div className="access-password-control">
              <input
                autoComplete="current-password"
                id="workspace-password"
                name="password"
                placeholder="Введите пароль"
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {renderPasswordToggle(passwordVisible, setPasswordVisible)}
            </div>
          </div>

          {localError || error ? (
            <p className="access-error" role="alert">
              {localError || error}
            </p>
          ) : success ? (
            <p className="access-success" role="status">
              {success}
            </p>
          ) : null}

          <PrimaryButton busy={busy}>
            <span>{busy ? 'Входим...' : 'Войти в кабинет'}</span>
            <ArrowRight aria-hidden="true" size={17} strokeWidth={2} />
          </PrimaryButton>
        </form>

        <div className="access-secondary-actions">
          <button className="access-secondary-link" type="button" onClick={openRegisterFromLogin}>
            Запросить доступ
          </button>
          <button
            className="access-secondary-link"
            type="button"
            onClick={() => {
              setResetEmail(email);
              clearMessages();
              setMode('reset');
            }}
          >
            Не помню пароль
          </button>
        </div>
      </AccessShell>
    );
  }

  if (mode === 'reset') {
    return (
      <AccessShell activeCopyId={activeCopyId} activeTitleId={activeTitleId}>
        <button className="access-back-button" type="button" onClick={returnToLogin}>
          <ArrowLeft aria-hidden="true" />
          Вернуться ко входу
        </button>
        <div className="access-card-header">
          <div>
            <p className="access-kicker">Безопасное восстановление</p>
            <h1 id="workspace-reset-title">Восстановление доступа</h1>
          </div>
          <Mail aria-hidden="true" />
        </div>
        <p className="access-intro" id="workspace-reset-copy">
          Укажите email, и мы отправим инструкции, если аккаунт существует.
        </p>
        <form className="access-form" onSubmit={(event) => void submitReset(event)} noValidate>
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-reset-email">
              Email
            </label>
            <input
              autoComplete="email"
              id="workspace-reset-email"
              inputMode="email"
              name="email"
              placeholder="name@example.com"
              type="email"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
            />
          </div>
          {localError ? <p className="access-error" role="alert">{localError}</p> : null}
          {success ? <p className="access-success" role="status">{success}</p> : null}
          <PrimaryButton busy={busy}>{busy ? 'Отправляем...' : 'Отправить инструкции'}</PrimaryButton>
        </form>
      </AccessShell>
    );
  }

  return (
    <AccessShell activeCopyId={activeCopyId} activeTitleId={activeTitleId}>
      <button className="access-back-button" type="button" onClick={returnToLogin}>
        <ArrowLeft aria-hidden="true" />
        Уже есть доступ? Войти
      </button>
      <div className="access-card-header">
        <div>
          <h1 id="workspace-register-title">Заявка на доступ</h1>
        </div>
        <ShieldCheck aria-hidden="true" />
      </div>
      <p className="access-intro" id="workspace-register-copy">
        Заполните данные агентства. Доступ появится после подтверждения администратором.
      </p>
      <form className="access-form" onSubmit={(event) => void submitRegistration(event)} noValidate>
        {registrationFields.map((field) => {
          const errorId = `${field.id}-error`;
          const fieldError = registerErrors[field.key];

          return (
            <div className="access-field" key={field.key}>
              <label className="access-field-label" htmlFor={field.id}>
                {field.label}
              </label>
              <input
                aria-describedby={fieldError ? errorId : undefined}
                aria-invalid={Boolean(fieldError)}
                autoComplete={field.autoComplete}
                id={field.id}
                inputMode={field.inputMode}
                name={field.key}
                placeholder={field.placeholder}
                type={field.type}
                value={registration[field.key]}
                onBlur={() => setTouched((current) => ({ ...current, [field.key]: true }))}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegistration((current) => ({ ...current, [field.key]: value }));
                }}
              />
              {fieldError ? (
                <small className="access-field-error" id={errorId}>
                  {fieldError}
                </small>
              ) : null}
            </div>
          );
        })}

        {!usesSupabase ? (
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-register-password">
              Пароль
            </label>
            <div className="access-password-control">
              <input
                aria-describedby={registerErrors.password ? 'workspace-register-password-error' : undefined}
                aria-invalid={Boolean(registerErrors.password)}
                autoComplete="new-password"
                id="workspace-register-password"
                name="password"
                placeholder="Введите пароль"
                type={registerPasswordVisible ? 'text' : 'password'}
                value={registration.password}
                onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegistration((current) => ({ ...current, password: value }));
                }}
              />
              {renderPasswordToggle(registerPasswordVisible, setRegisterPasswordVisible)}
            </div>
            {registerErrors.password ? (
              <small className="access-field-error" id="workspace-register-password-error">
                {registerErrors.password}
              </small>
            ) : null}
          </div>
        ) : (
          <p className="access-intro">
            После одобрения придёт приглашение Supabase — пароль задаётся только по этой ссылке.
          </p>
        )}

        {localError || error ? (
          <p className="access-error" role="alert">
            {localError || error}
          </p>
        ) : success ? (
          <p className="access-success" role="status">
            {success}
          </p>
        ) : null}

        <PrimaryButton busy={busy}>{busy ? 'Отправляем...' : 'Подать заявку на доступ'}</PrimaryButton>
      </form>
    </AccessShell>
  );
}
