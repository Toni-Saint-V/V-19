import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import visaflowLogo from "../assets/v-logo-premium-black-style.webp";
import type { AccessRequestRegistrationInput, Session } from "../shared/authContract";
import {
  agentInteractionProps,
  type AgentInteractionId,
} from "../modules/submissions/agentInteractionContract";

type AccessGateMode =
  | "invite"
  | "login"
  | "register"
  | "reset"
  | "pending"
  | "recovery";

type AccessGateProps = {
  error: string;
  inviteSetupEmail: string;
  recoverySetupEmail: string;
  pendingSession: Session | null;
  usesSupabase?: boolean;
  onCompleteInvite: (password: string) => Promise<void>;
  onCompleteRecovery: (password: string) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (input: AccessRequestRegistrationInput) => Promise<void>;
  onResetPassword: (email: string) => Promise<string>;
  onSignOut: () => Promise<void>;
};

type RegistrationTextField = {
  autoComplete: string;
  id: string;
  inputMode?: "email" | "tel";
  key: Exclude<keyof AccessRequestRegistrationInput, "password">;
  label: string;
  placeholder: string;
  type: "email" | "tel" | "text";
};

const workspaceEmailStorageKey = "visaflow.workspaceEmail.v2";

const accessTitleIds: Record<AccessGateMode, string> = {
  invite: "workspace-invite-title",
  login: "workspace-access-title",
  pending: "workspace-pending-title",
  recovery: "workspace-recovery-title",
  register: "workspace-register-title",
  reset: "workspace-reset-title",
};

const accessCopyIds: Record<AccessGateMode, string> = {
  invite: "workspace-invite-copy",
  login: "workspace-access-copy",
  pending: "workspace-pending-copy",
  recovery: "workspace-recovery-copy",
  register: "workspace-register-copy",
  reset: "workspace-reset-copy",
};

const registrationFields: RegistrationTextField[] = [
  {
    autoComplete: "name",
    id: "workspace-register-name",
    key: "fullName",
    label: "Имя и фамилия",
    placeholder: "Анна Петрова",
    type: "text",
  },
  {
    autoComplete: "organization",
    id: "workspace-register-company",
    key: "companyName",
    label: "Агентство / компания",
    placeholder: "Visa Center",
    type: "text",
  },
  {
    autoComplete: "address-level2",
    id: "workspace-register-city",
    key: "city",
    label: "Город",
    placeholder: "Москва",
    type: "text",
  },
  {
    autoComplete: "tel",
    id: "workspace-register-phone",
    inputMode: "tel",
    key: "phone",
    label: "Телефон",
    placeholder: "+7 900 000-00-00",
    type: "tel",
  },
  {
    autoComplete: "email",
    id: "workspace-register-email",
    inputMode: "email",
    key: "email",
    label: "Email",
    placeholder: "name@example.com",
    type: "email",
  },
];

function storedWorkspaceEmail() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(workspaceEmailStorageKey) ?? "";
  } catch {
    return "";
  }
}

function rememberWorkspaceEmail(email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(workspaceEmailStorageKey, email.trim().toLowerCase());
  } catch {
    // Remembering an email is a convenience and must never block authentication.
  }
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function PrimaryButton({
  busy,
  children,
  interactionId,
}: {
  busy?: boolean;
  children: ReactNode;
  interactionId: AgentInteractionId;
}) {
  return (
    <button
      {...agentInteractionProps(interactionId)}
      className="primary-button access-submit"
      disabled={busy}
      type="submit"
    >
      {children}
    </button>
  );
}

function AccessShell({
  activeCopyId,
  activeTitleId,
  children,
  mode,
}: {
  activeCopyId: string;
  activeTitleId: string;
  children: ReactNode;
  mode: AccessGateMode;
}) {
  return (
    <main
      className="access-shell"
      data-access-mode={mode}
      aria-label="Вход в рабочий кабинет"
    >
      <div className="access-layout">
        <section className="access-brand-panel" aria-labelledby="access-brand-name">
          <div className="access-brand-lockup">
            <img
              aria-hidden="true"
              className="access-brand-logo"
              src={visaflowLogo}
              alt=""
            />
            <div className="access-brand-identity">
              <p className="access-brand-product" id="access-brand-name">
                VisaFlow <span>V-19</span>
              </p>
              <p className="access-brand-caption">Рабочий кабинет</p>
            </div>
          </div>
          <div className="access-brand-message">
            <p className="access-brand-title">Рабочий кабинет визовых подач</p>
            <p className="access-brand-text">
              Подготовка агентом, проверка администратором и выгрузка — в одном
              операционном контуре.
            </p>
            <p className="access-brand-trust">
              <ShieldCheck aria-hidden="true" />
              Доступ к кабинету подтверждает администратор
            </p>
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
  recoverySetupEmail,
  pendingSession,
  usesSupabase = false,
  onCompleteInvite,
  onCompleteRecovery,
  onLogin,
  onRegister,
  onResetPassword,
  onSignOut,
}: AccessGateProps) {
  const [mode, setMode] = useState<AccessGateMode>(
    pendingSession ? "pending" : "register",
  );
  const [email, setEmail] = useState(storedWorkspaceEmail);
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState(storedWorkspaceEmail);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePasswordConfirmation, setInvitePasswordConfirmation] = useState("");
  const [invitePasswordVisible, setInvitePasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionPendingRef = useRef(false);
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<
    Partial<Record<keyof AccessRequestRegistrationInput, boolean>>
  >({});
  const [registration, setRegistration] = useState<AccessRequestRegistrationInput>({
    city: "",
    companyName: "",
    email: storedWorkspaceEmail(),
    fullName: "",
    password: "",
    phone: "",
  });

  useEffect(() => {
    if (!pendingSession) return;
    setMode("pending");
    setEmail(pendingSession.email);
    setRegistration((current) => ({ ...current, email: pendingSession.email }));
  }, [pendingSession]);

  useEffect(() => {
    if (!inviteSetupEmail) return;
    setMode("invite");
    setEmail(inviteSetupEmail);
  }, [inviteSetupEmail]);

  useEffect(() => {
    if (!recoverySetupEmail) return;
    setMode("recovery");
    setEmail(recoverySetupEmail);
  }, [recoverySetupEmail]);

  const activeTitleId = accessTitleIds[mode];
  const activeCopyId = accessCopyIds[mode];

  const registerErrors = useMemo(
    () => ({
      city:
        (attempted || touched.city) && !registration.city.trim() ? "Введите город" : "",
      companyName:
        (attempted || touched.companyName) && !registration.companyName.trim()
          ? "Введите название агентства"
          : "",
      email:
        (attempted || touched.email) && !validEmail(registration.email)
          ? "Введите корректный email"
          : "",
      fullName:
        (attempted || touched.fullName) && !registration.fullName.trim()
          ? "Введите имя и фамилию"
          : "",
      password:
        (attempted || touched.password) && !registration.password.trim()
          ? "Введите пароль"
          : "",
      phone:
        (attempted || touched.phone) && !registration.phone.trim()
          ? "Введите телефон"
          : "",
    }),
    [attempted, registration, touched],
  );

  function clearMessages() {
    setLocalError("");
    setSuccess("");
  }

  function startAction() {
    if (actionPendingRef.current) return false;
    actionPendingRef.current = true;
    setBusy(true);
    return true;
  }

  function finishAction() {
    actionPendingRef.current = false;
    setBusy(false);
  }

  function returnToLogin() {
    clearMessages();
    setMode("login");
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (!validEmail(email)) {
      setLocalError("Введите корректный email");
      return;
    }
    if (!password.trim()) {
      setLocalError("Введите пароль");
      return;
    }

    if (!startAction()) return;
    try {
      rememberWorkspaceEmail(email);
      await onLogin(email, password);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Не удалось войти.");
    } finally {
      finishAction();
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

    if (!startAction()) return;
    try {
      rememberWorkspaceEmail(registration.email);
      await onRegister(registration);
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : "Не удалось отправить заявку.",
      );
    } finally {
      finishAction();
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (!validEmail(resetEmail)) {
      setLocalError("Введите корректный email");
      return;
    }

    if (!startAction()) return;
    try {
      rememberWorkspaceEmail(resetEmail);
      setSuccess(await onResetPassword(resetEmail));
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : "Не удалось восстановить доступ.",
      );
    } finally {
      finishAction();
    }
  }

  async function submitInvitePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (invitePassword.length < 12) {
      setLocalError("Пароль должен содержать не меньше 12 символов.");
      return;
    }
    if (invitePassword !== invitePasswordConfirmation) {
      setLocalError("Пароли не совпадают.");
      return;
    }

    if (!startAction()) return;
    try {
      const setupEmail = mode === "recovery" ? recoverySetupEmail : inviteSetupEmail;
      const completePassword =
        mode === "recovery" ? onCompleteRecovery : onCompleteInvite;
      await completePassword(invitePassword);
      rememberWorkspaceEmail(setupEmail);
      setEmail(setupEmail);
      setPassword("");
      setInvitePassword("");
      setInvitePasswordConfirmation("");
      setSuccess("Пароль сохранён. Войдите в кабинет с новым паролем.");
      setMode("login");
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : "Не удалось сохранить пароль.",
      );
    } finally {
      finishAction();
    }
  }

  function openRegisterFromLogin() {
    setRegistration((current) => ({ ...current, email }));
    setAttempted(false);
    setTouched({});
    clearMessages();
    setMode("register");
  }

  function renderPasswordToggle(
    visible: boolean,
    setVisible: (value: boolean) => void,
  ) {
    return (
      <button
        {...agentInteractionProps("access.toggle-password")}
        className="access-password-toggle"
        type="button"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    );
  }

  const setupEmail = mode === "recovery" ? recoverySetupEmail : inviteSetupEmail;

  if ((mode === "invite" || mode === "recovery") && setupEmail) {
    const isRecovery = mode === "recovery";
    return (
      <AccessShell
        activeCopyId={activeCopyId}
        activeTitleId={activeTitleId}
        mode={mode}
      >
        <div className="access-card-header">
          <div>
            <p className="access-kicker">
              {isRecovery ? "Восстановление подтверждено" : "Приглашение подтверждено"}
            </p>
            <h1 id={activeTitleId}>
              {isRecovery ? "Установите новый пароль" : "Создайте пароль"}
            </h1>
          </div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <p className="access-intro" id={activeCopyId}>
          Установите пароль для {setupEmail}. После сохранения войдите обычным способом.
        </p>
        <form
          className="access-form"
          onSubmit={(event) => void submitInvitePassword(event)}
          noValidate
        >
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-invite-password">
              Новый пароль
            </label>
            <div className="access-password-control">
              <input
                {...agentInteractionProps("access.edit-field")}
                autoComplete="new-password"
                id="workspace-invite-password"
                minLength={12}
                name="invite-password"
                type={invitePasswordVisible ? "text" : "password"}
                value={invitePassword}
                onChange={(event) => setInvitePassword(event.target.value)}
              />
              {renderPasswordToggle(invitePasswordVisible, setInvitePasswordVisible)}
            </div>
          </div>
          <div className="access-field">
            <label
              className="access-field-label"
              htmlFor="workspace-invite-password-confirmation"
            >
              Повторите пароль
            </label>
            <input
              {...agentInteractionProps("access.edit-field")}
              autoComplete="new-password"
              id="workspace-invite-password-confirmation"
              minLength={12}
              name="invite-password-confirmation"
              type={invitePasswordVisible ? "text" : "password"}
              value={invitePasswordConfirmation}
              onChange={(event) => setInvitePasswordConfirmation(event.target.value)}
            />
          </div>
          {localError || error ? (
            <p className="access-error" role="alert">
              {localError || error}
            </p>
          ) : null}
          <PrimaryButton
            busy={busy}
            interactionId={
              isRecovery
                ? "access.submit-recovery-password"
                : "access.submit-invite-password"
            }
          >
            {busy ? "Сохраняем..." : "Сохранить пароль"}
          </PrimaryButton>
        </form>
      </AccessShell>
    );
  }

  if (mode === "pending" && pendingSession) {
    return (
      <AccessShell
        activeCopyId={activeCopyId}
        activeTitleId={activeTitleId}
        mode={mode}
      >
        <div className="access-card-header">
          <div>
            <p className="access-kicker">Первый вход</p>
            <h1 id="workspace-pending-title">Ожидает подтверждения</h1>
          </div>
        </div>
        <p className="access-intro" id="workspace-pending-copy">
          Заявка для {pendingSession.email} отправлена. Доступ появится после
          подтверждения администратором.
        </p>
        <p className="access-success" role="status">
          Статус заявки: На рассмотрении
        </p>
        {localError || error ? (
          <p className="access-error" role="alert">
            {localError || error}
          </p>
        ) : null}
        <button
          {...agentInteractionProps("access.pending-sign-out")}
          className="primary-button access-submit"
          disabled={busy}
          type="button"
          onClick={() => {
            if (!startAction()) return;
            void onSignOut()
              .catch((caught) => {
                setLocalError(
                  caught instanceof Error ? caught.message : "Не удалось выйти.",
                );
              })
              .finally(finishAction);
          }}
        >
          Выйти
        </button>
      </AccessShell>
    );
  }

  if (mode === "login") {
    return (
      <AccessShell
        activeCopyId={activeCopyId}
        activeTitleId={activeTitleId}
        mode={mode}
      >
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
        <form
          className="access-form"
          onSubmit={(event) => void submitLogin(event)}
          noValidate
        >
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-email">
              Email
            </label>
            <input
              {...agentInteractionProps("access.edit-field")}
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
                {...agentInteractionProps("access.edit-field")}
                autoComplete="current-password"
                id="workspace-password"
                name="password"
                placeholder="Введите пароль"
                type={passwordVisible ? "text" : "password"}
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

          <PrimaryButton busy={busy} interactionId="access.submit-login">
            <span>{busy ? "Входим..." : "Войти в кабинет"}</span>
            <ArrowRight aria-hidden="true" size={17} strokeWidth={2} />
          </PrimaryButton>
        </form>

        <div className="access-secondary-actions">
          <button
            {...agentInteractionProps("access.open-register")}
            className="access-secondary-link"
            type="button"
            onClick={openRegisterFromLogin}
          >
            Запросить доступ
          </button>
          <button
            {...agentInteractionProps("access.open-reset")}
            className="access-secondary-link"
            type="button"
            onClick={() => {
              setResetEmail(email);
              clearMessages();
              setMode("reset");
            }}
          >
            Не помню пароль
          </button>
        </div>
      </AccessShell>
    );
  }

  if (mode === "reset") {
    return (
      <AccessShell
        activeCopyId={activeCopyId}
        activeTitleId={activeTitleId}
        mode={mode}
      >
        <button
          {...agentInteractionProps("access.back-to-login")}
          className="access-back-button"
          type="button"
          onClick={returnToLogin}
        >
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
        <form
          className="access-form"
          onSubmit={(event) => void submitReset(event)}
          noValidate
        >
          <div className="access-field">
            <label className="access-field-label" htmlFor="workspace-reset-email">
              Email
            </label>
            <input
              {...agentInteractionProps("access.edit-field")}
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
          {localError ? (
            <p className="access-error" role="alert">
              {localError}
            </p>
          ) : null}
          {success ? (
            <p className="access-success" role="status">
              {success}
            </p>
          ) : null}
          <PrimaryButton busy={busy} interactionId="access.submit-reset">
            {busy ? "Отправляем..." : "Отправить инструкции"}
          </PrimaryButton>
        </form>
      </AccessShell>
    );
  }

  return (
    <AccessShell activeCopyId={activeCopyId} activeTitleId={activeTitleId} mode={mode}>
      <button
        {...agentInteractionProps("access.open-login")}
        className="access-back-button"
        type="button"
        onClick={returnToLogin}
      >
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
      <form
        className="access-form access-form--registration"
        onSubmit={(event) => void submitRegistration(event)}
        noValidate
      >
        {registrationFields.map((field) => {
          const errorId = `${field.id}-error`;
          const fieldError = registerErrors[field.key];

          return (
            <div className="access-field" key={field.key}>
              <label className="access-field-label" htmlFor={field.id}>
                {field.label}
              </label>
              <input
                {...agentInteractionProps("access.edit-field")}
                aria-describedby={fieldError ? errorId : undefined}
                aria-invalid={Boolean(fieldError)}
                autoComplete={field.autoComplete}
                id={field.id}
                inputMode={field.inputMode}
                name={field.key}
                placeholder={field.placeholder}
                type={field.type}
                value={registration[field.key]}
                onBlur={() =>
                  setTouched((current) => ({ ...current, [field.key]: true }))
                }
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
                {...agentInteractionProps("access.edit-field")}
                aria-describedby={
                  registerErrors.password
                    ? "workspace-register-password-error"
                    : undefined
                }
                aria-invalid={Boolean(registerErrors.password)}
                autoComplete="new-password"
                id="workspace-register-password"
                name="password"
                placeholder="Введите пароль"
                type={registerPasswordVisible ? "text" : "password"}
                value={registration.password}
                onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegistration((current) => ({ ...current, password: value }));
                }}
              />
              {renderPasswordToggle(
                registerPasswordVisible,
                setRegisterPasswordVisible,
              )}
            </div>
            {registerErrors.password ? (
              <small
                className="access-field-error"
                id="workspace-register-password-error"
              >
                {registerErrors.password}
              </small>
            ) : null}
          </div>
        ) : (
          <p className="access-intro">
            После одобрения придёт приглашение Supabase — пароль задаётся только по этой
            ссылке.
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

        <PrimaryButton busy={busy} interactionId="access.submit-registration">
          {busy ? "Отправляем..." : "Подать заявку на доступ"}
        </PrimaryButton>
      </form>
    </AccessShell>
  );
}
