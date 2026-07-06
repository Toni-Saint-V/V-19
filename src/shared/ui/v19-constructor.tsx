import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { Check, ChevronRight, Search, X } from "lucide-react";
import { cn } from "./cn";

export type V19ButtonIntent = "close" | "cta" | "confirm";

export function V19Button({
  children,
  className,
  intent = "cta",
  leading,
  trailing,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  intent?: V19ButtonIntent;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <motion.button
      {...props}
      className={cn("v19c-button", `is-${intent}`, className)}
      type={props.type ?? "button"}
      whileHover={props.disabled ? undefined : { y: -1 }}
      whileTap={props.disabled ? undefined : { scale: 0.985 }}
    >
      {leading ?? (intent === "close" ? <X aria-hidden="true" size={14} /> : null)}
      <span>{children}</span>
      {trailing ?? (intent === "confirm" ? <Check aria-hidden="true" size={14} /> : null)}
    </motion.button>
  );
}

export type V19InfoPanelItem = {
  id?: string;
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: ReactNode;
};

export function V19InfoPanel({
  action,
  className,
  compact = true,
  items,
  subtitle,
  title,
}: {
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  items: V19InfoPanelItem[];
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <motion.section
      className={cn("v19c-info-panel", compact && "is-compact", className)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="v19c-info-copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div className="v19c-info-items" role="list">
        {items.map((item) => (
          <span className={cn("v19c-info-item", `tone-${item.tone ?? "neutral"}`)} key={item.id ?? item.label} role="listitem">
            <em>{item.label}</em>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      {action ? <div className="v19c-info-action">{action}</div> : null}
    </motion.section>
  );
}

export type V19SideMenuItem<T extends string> = {
  count?: number;
  id: T;
  label: string;
  note?: string;
};

export function V19SideMenu<T extends string>({
  activeId,
  className,
  footer,
  items,
  onChange,
  title,
  total,
}: {
  activeId: T;
  className?: string;
  footer?: ReactNode;
  items: Array<V19SideMenuItem<T>>;
  onChange: (id: T) => void;
  title: string;
  total?: ReactNode;
}) {
  return (
    <aside className={cn("v19c-side-menu", className)} aria-label={title}>
      <div className="v19c-side-menu-head">
        <span>{title}</span>
        {total != null ? <strong>{total}</strong> : null}
      </div>
      <div className="v19c-side-menu-list" role="tablist" aria-label={title}>
        {items.map((item) => {
          const active = item.id === activeId;

          return (
            <motion.button
              aria-current={active ? "page" : undefined}
              aria-selected={active}
              className={active ? "is-active" : ""}
              key={item.id}
              role="tab"
              type="button"
              onClick={() => onChange(item.id)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.99 }}
            >
              <span>{item.label}</span>
              {typeof item.count === "number" ? <em>{item.count}</em> : null}
              {item.note ? <small>{item.note}</small> : null}
            </motion.button>
          );
        })}
      </div>
      {footer ? <div className="v19c-side-menu-footer">{footer}</div> : null}
    </aside>
  );
}

export type V19ToolbarTab<T extends string> = {
  count?: number;
  id: T;
  label: string;
};

export function V19ToolbarBand<T extends string>({
  action,
  activeTab,
  className,
  onSearch,
  onTab,
  placeholder = "Поиск...",
  query,
  tabs,
}: {
  action?: ReactNode;
  activeTab: T;
  className?: string;
  onSearch?: (query: string) => void;
  onTab: (tab: T) => void;
  placeholder?: string;
  query?: string;
  tabs: Array<V19ToolbarTab<T>>;
}) {
  return (
    <section className={cn("v19c-toolbar-band", className)} aria-label="Фильтры и поиск">
      <div className="v19c-toolbar-search">
        <Search aria-hidden="true" size={14} />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          type="search"
          value={query ?? ""}
          onChange={(event) => onSearch?.(event.currentTarget.value)}
        />
      </div>
      <div className="v19c-toolbar-tabs" role="tablist">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              aria-selected={active}
              className={active ? "is-active" : ""}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => onTab(tab.id)}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" ? <em>{tab.count}</em> : null}
            </button>
          );
        })}
      </div>
      {action ? <div className="v19c-toolbar-action">{action}</div> : null}
    </section>
  );
}

export function V19Input({
  className,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("v19c-input", className)}>
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" size={14} />
      <input {...props} />
    </label>
  );
}

export function V19ListCell({
  actionLabel = "Открыть",
  badge,
  meta,
  onOpen,
  subtitle,
  title,
  tone = "neutral",
}: {
  actionLabel?: string;
  badge?: ReactNode;
  meta?: ReactNode;
  onOpen: () => void;
  subtitle?: ReactNode;
  title: ReactNode;
  tone?: "danger" | "neutral" | "success" | "warning";
}) {
  return (
    <motion.button
      className={cn("v19c-list-cell", `tone-${tone}`)}
      type="button"
      onClick={onOpen}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
    >
      <span className="v19c-list-tone" aria-hidden="true" />
      <span className="v19c-list-copy">
        <strong>{title}</strong>
        {subtitle ? <em>{subtitle}</em> : null}
        {meta ? <small>{meta}</small> : null}
      </span>
      {badge ? <span className="v19c-list-badge">{badge}</span> : null}
      <span className="v19c-list-action">
        {actionLabel}
        <ChevronRight aria-hidden="true" size={14} />
      </span>
    </motion.button>
  );
}

export function V19RightPanel({
  action,
  children,
  className,
  eyebrow,
  onClose,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
  onClose?: () => void;
  title: ReactNode;
}) {
  return (
    <motion.aside
      className={cn("v19c-right-panel", className)}
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 18 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <header className="v19c-right-panel-head">
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          <strong>{title}</strong>
        </div>
        {onClose ? (
          <V19Button aria-label="Закрыть панель" intent="close" onClick={onClose}>
            Закрыть
          </V19Button>
        ) : null}
      </header>
      <div className="v19c-right-panel-body">{children}</div>
      {action ? <footer className="v19c-right-panel-footer">{action}</footer> : null}
    </motion.aside>
  );
}

export function V19BottomSheet({
  children,
  className,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="v19c-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            className={cn("v19c-bottom-sheet", className)}
            initial={prefersReducedMotion ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={prefersReducedMotion ? undefined : { y: "100%" }}
            transition={{ bounce: 0, duration: 0.26, type: "spring" }}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong>{title}</strong>
              <V19Button aria-label="Закрыть" intent="close" onClick={onClose}>
                Закрыть
              </V19Button>
            </header>
            {children}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function V19FlowTimeline({
  items,
}: {
  items: Array<{ label: string; state?: "active" | "done" | "next" }>;
}) {
  return (
    <ol className="v19c-flow-timeline">
      {items.map((item, index) => (
        <li className={cn(`is-${item.state ?? "next"}`)} key={`${item.label}-${index}`}>
          <span>{index + 1}</span>
          <strong>{item.label}</strong>
        </li>
      ))}
    </ol>
  );
}
