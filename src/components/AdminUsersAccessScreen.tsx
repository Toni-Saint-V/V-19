import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";

import type { AccessRequest, AccessRequestStatus } from "../shared/authContract";
import {
  V19ListHeader,
  V19MetricCard,
  V19MetricStrip,
  V19QueueToolbar,
} from "../shared/ui/v19-design-system";
import { Badge, Button } from "../shared/ui/primitives";

const filters = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof filters)[number];

type Props = {
  busy?: boolean;
  currentIdentity: string;
  onApprove?: (requestId: string) => void | Promise<void>;
  onReject?: (requestId: string) => void | Promise<void>;
  requests?: AccessRequest[];
  usesSupabase?: boolean;
};

export function AdminUsersAccessScreen({
  busy = false,
  currentIdentity,
  onApprove,
  onReject,
  requests = [],
  usesSupabase = false,
}: Props) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    id: string;
    kind: "approve" | "reject";
  } | null>(null);
  const [feedback, setFeedback] = useState("");

  const totals = useMemo(
    () => ({
      all: requests.length,
      approved: requests.filter((item) => item.status === "approved").length,
      pending: requests.filter((item) => item.status === "pending").length,
      rejected: requests.filter((item) => item.status === "rejected").length,
    }),
    [requests],
  );

  const visibleRequests = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return requests
      .filter((request) => filter === "all" || request.status === filter)
      .filter((request) => {
        if (!needle) return true;
        return [
          request.fullName,
          request.email,
          request.companyName,
          request.city,
          request.phone,
        ]
          .join(" ")
          .toLocaleLowerCase("ru-RU")
          .includes(needle);
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [filter, query, requests]);

  async function runAction(request: AccessRequest, kind: "approve" | "reject") {
    const handler = kind === "approve" ? onApprove : onReject;
    if (!handler || pendingAction || busy) return;

    setFeedback("");
    setPendingAction({ id: request.id, kind });
    try {
      await Promise.resolve(handler(request.id));
      setFeedback(
        kind === "approve"
          ? `Доступ для ${request.fullName} одобрен.`
          : `Заявка ${request.fullName} отклонена.`,
      );
    } catch {
      setFeedback("Действие не выполнено. Данные не были изменены.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section
      className="v19-access-screen"
      aria-labelledby="v19-access-title"
      data-testid="admin-users-access-requests"
    >
      <header className="v19-access-hero">
        <div>
          <span className="v19-access-eyebrow">
            <ShieldCheck aria-hidden="true" />
            Контроль доступа
          </span>
          <h2 id="v19-access-title">Пользователи и заявки</h2>
          <p>
            Одно место для регистрации агентов, статусов одобрения и аудита доступа.
            Решения применяются только после явного действия администратора.
          </p>
        </div>
        <div className="v19-access-runtime" aria-label="Текущий контур доступа">
          <span className={usesSupabase ? "is-live" : "is-local"} />
          <div>
            <small>{usesSupabase ? "Supabase workspace" : "Локальная среда"}</small>
            <strong>{currentIdentity}</strong>
          </div>
        </div>
      </header>

      <div className="v19-access-metrics-region" aria-label="Сводка заявок">
        <V19MetricStrip className="v19-access-metrics">
          <V19MetricCard icon={Clock3} label="Ожидают" value={totals.pending} />
          <V19MetricCard
            icon={UserCheck}
            label="Одобрено"
            tone="green"
            value={totals.approved}
          />
          <V19MetricCard
            icon={UserRoundX}
            label="Отклонено"
            tone="red"
            value={totals.rejected}
          />
          <V19MetricCard icon={UsersRound} label="Всего" value={totals.all} />
        </V19MetricStrip>
      </div>

      <div className="v19-access-board">
        <V19ListHeader
          countLabel={`Показано ${visibleRequests.length} из ${totals.all}`}
          title="Заявки на доступ"
        />
        <V19QueueToolbar
          actionDisabled={!query}
          actionIcon={X}
          cityFilter="Все города"
          cityOptions={[]}
          controls={
            <div className="v19-access-tabs" role="tablist" aria-label="Статус заявки">
              {filters.map((item) => (
                <button
                  aria-selected={filter === item}
                  className={filter === item ? "is-active" : undefined}
                  key={item}
                  role="tab"
                  type="button"
                  onClick={() => setFilter(item)}
                >
                  {filterLabel(item)}
                  <span>{totals[item]}</span>
                </button>
              ))}
            </div>
          }
          filterLabel="Очистить поиск"
          interactionIds={{
            reset: "admin-users-clear-search",
            search: "admin-users-search",
          }}
          searchAriaLabel="Найти пользователя или компанию"
          searchPlaceholder="Имя, email, компания…"
          searchValue={query}
          showCityFilter={false}
          onCityFilterChange={() => undefined}
          onFilterClick={() => setQuery("")}
          onSearchChange={setQuery}
        />

        {feedback ? (
          <div className="v19-access-feedback" role="status" aria-live="polite">
            <Check aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        <div className="v19-access-list" aria-busy={busy || Boolean(pendingAction)}>
          {visibleRequests.length ? (
            visibleRequests.map((request) => {
              const isPending = request.status === "pending";
              const actionBusy = pendingAction?.id === request.id;
              return (
                <article className="v19-access-row" key={request.id}>
                  <div className="v19-access-avatar" aria-hidden="true">
                    {initials(request.fullName)}
                  </div>
                  <div className="v19-access-person">
                    <div>
                      <strong>{request.fullName}</strong>
                      <AccessStatusBadge status={request.status} />
                    </div>
                    <a href={`mailto:${request.email}`}>{request.email}</a>
                    <span>
                      {request.companyName} · {request.city}
                    </span>
                  </div>
                  <dl className="v19-access-meta">
                    <div>
                      <dt>Роль</dt>
                      <dd>Агент</dd>
                    </div>
                    <div>
                      <dt>Телефон</dt>
                      <dd>{request.phone || "—"}</dd>
                    </div>
                    <div>
                      <dt>Создана</dt>
                      <dd>{formatDate(request.createdAt)}</dd>
                    </div>
                  </dl>
                  <div className="v19-access-actions">
                    {isPending ? (
                      <>
                        <Button
                          danger
                          disabled={busy || Boolean(pendingAction) || !onReject}
                          loading={actionBusy && pendingAction.kind === "reject"}
                          variant="secondary"
                          onClick={() => void runAction(request, "reject")}
                        >
                          Отклонить
                        </Button>
                        <Button
                          disabled={busy || Boolean(pendingAction) || !onApprove}
                          loading={actionBusy && pendingAction.kind === "approve"}
                          onClick={() => void runAction(request, "approve")}
                        >
                          Одобрить
                        </Button>
                      </>
                    ) : (
                      <span className="v19-access-reviewed">
                        {request.reviewedAt
                          ? `Решение ${formatDate(request.reviewedAt)}`
                          : "Решение сохранено"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="v19-access-empty" role="status">
              <span aria-hidden="true">
                <UserCheck />
              </span>
              <strong>{query ? "Совпадений нет" : emptyTitle(filter)}</strong>
              <p>
                {query
                  ? "Измените запрос или переключите фильтр статуса."
                  : "Новые заявки появятся здесь автоматически после регистрации агента."}
              </p>
              {query || filter !== "pending" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter("pending");
                    setQuery("");
                  }}
                >
                  Показать ожидающие
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AccessStatusBadge({ status }: { status: AccessRequestStatus }) {
  const meta = {
    approved: { label: "Одобрено", tone: "teal" as const },
    pending: { label: "На рассмотрении", tone: "amber" as const },
    rejected: { label: "Отклонено", tone: "danger" as const },
  }[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function filterLabel(filter: Filter) {
  return {
    all: "Все",
    approved: "Одобрено",
    pending: "Ожидают",
    rejected: "Отклонено",
  }[filter];
}

function emptyTitle(filter: Filter) {
  return {
    all: "Заявок пока нет",
    approved: "Одобренных заявок нет",
    pending: "Новых заявок нет",
    rejected: "Отклонённых заявок нет",
  }[filter];
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "П"
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
