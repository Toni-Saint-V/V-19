import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { Search, X } from "lucide-react";
import { cn } from "./cn";

export type V19ProductButtonVariant = "close" | "cta" | "confirm";

export function V19ProductButton({
  children,
  className,
  icon,
  variant = "cta",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  icon?: ReactNode;
  variant?: V19ProductButtonVariant;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      {...props}
      className={cn("v19pk-button", `v19pk-button--${variant}`, className)}
      type={props.type ?? "button"}
      whileHover={props.disabled || reduce ? undefined : { y: -1 }}
      whileTap={props.disabled || reduce ? undefined : { scale: 0.985, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.16 }}
    >
      {icon ? <span className="v19pk-button-icon">{icon}</span> : null}
      <span>{children}</span>
    </motion.button>
  );
}

export function V19MotionCard({
  children,
  className,
  delay = 0,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  interactive?: boolean;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      className={cn("v19pk-card", interactive && "is-interactive", className)}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      transition={{ delay: reduce ? 0 : delay, duration: reduce ? 0.01 : 0.2 }}
      whileHover={interactive && !reduce ? { y: -2 } : undefined}
      whileTap={interactive && !reduce ? { scale: 0.992 } : undefined}
    >
      {children}
    </motion.article>
  );
}

export type V19InfoStripItem = {
  detail?: ReactNode;
  id?: string;
  label: ReactNode;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: ReactNode;
};

export function V19InfoStrip({
  action,
  className,
  items,
  label,
  title,
}: {
  action?: ReactNode;
  className?: string;
  items: V19InfoStripItem[];
  label?: ReactNode;
  title?: ReactNode;
}) {
  const heading = title ?? label;
  return (
    <section className={cn("v19pk-info-strip", className)} aria-label="Информационная панель">
      {heading ? <strong className="v19pk-info-title">{heading}</strong> : null}
      <div className="v19pk-info-items">
        {items.map((item, index) => (
          <V19MotionCard
            className={cn("v19pk-info-item", `tone-${item.tone ?? "neutral"}`)}
            delay={index * 0.025}
            key={item.id ?? String(item.label)}
          >
            <span>{item.label}</span>
            <b>{item.value}</b>
            {item.detail ? <em>{item.detail}</em> : null}
          </V19MotionCard>
        ))}
      </div>
      {action ? <div className="v19pk-info-action">{action}</div> : null}
    </section>
  );
}

export type V19TabItem<T extends string> = {
  count?: number;
  id: T;
  label: string;
};

export function V19TabSearchBar<T extends string>({
  action,
  filters,
  onQuery,
  onTab,
  query,
  searchLabel = "Поиск",
  searchPlaceholder = "Поиск...",
  tabs,
  value,
}: {
  action?: ReactNode;
  filters?: ReactNode;
  onQuery?: (query: string) => void;
  onTab: (value: T) => void;
  query?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  tabs: V19TabItem<T>[];
  value: T;
}) {
  return (
    <section className="v19pk-tab-search" aria-label="Табы, поиск и фильтры">
      <div className="v19pk-tabs" role="tablist">
        {tabs.map((tab) => (
          <motion.button
            aria-selected={value === tab.id}
            className={value === tab.id ? "is-active" : ""}
            key={tab.id}
            role="tab"
            type="button"
            onClick={() => onTab(tab.id)}
            whileTap={{ scale: 0.985 }}
          >
            <span>{tab.label}</span>
            {typeof tab.count === "number" ? <em>{tab.count}</em> : null}
          </motion.button>
        ))}
      </div>
      <label className="v19pk-search">
        <span className="sr-only">{searchLabel}</span>
        <Search aria-hidden="true" size={15} strokeWidth={1.8} />
        <input
          placeholder={searchPlaceholder}
          type="search"
          value={query ?? ""}
          onChange={(event) => onQuery?.(event.currentTarget.value)}
        />
      </label>
      {filters ? <div className="v19pk-filter-zone">{filters}</div> : null}
      {action ? <div className="v19pk-toolbar-action">{action}</div> : null}
    </section>
  );
}

export function V19SearchOnly({
  className,
  label = "Поиск",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={cn("v19pk-search", className)}>
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" size={15} strokeWidth={1.8} />
      <input {...props} type={props.type ?? "search"} />
    </label>
  );
}

export type V19SideMenuItem<T extends string> = {
  count?: number;
  icon?: ReactNode;
  id: T;
  label: string;
};

export function V19SideMenu<T extends string>({
  className,
  items,
  label,
  onChange,
  value,
}: {
  className?: string;
  items: V19SideMenuItem<T>[];
  label: string;
  onChange: (value: T) => void;
  value: T;
}) {
  return (
    <aside className={cn("v19pk-side-menu", className)} aria-label={label}>
      <span>{label}</span>
      {items.map((item) => (
        <motion.button
          aria-pressed={value === item.id}
          className={value === item.id ? "is-active" : ""}
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.99 }}
        >
          {item.icon ? <i aria-hidden="true">{item.icon}</i> : null}
          <strong>{item.label}</strong>
          {typeof item.count === "number" ? <em>{item.count}</em> : null}
        </motion.button>
      ))}
    </aside>
  );
}

export function V19RightRail({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: ReactNode;
  onClose?: () => void;
}) {
  return (
    <motion.aside
      animate={{ opacity: 1, x: 0 }}
      className="v19pk-right-rail"
      initial={{ opacity: 0, x: 14 }}
      transition={{ duration: 0.2 }}
    >
      <header>
        <strong>{title}</strong>
        {onClose ? (
          <V19ProductButton aria-label="Закрыть панель" variant="close" onClick={onClose}>
            <X aria-hidden="true" size={15} />
          </V19ProductButton>
        ) : null}
      </header>
      <div className="v19pk-right-rail-body">{children}</div>
    </motion.aside>
  );
}

export type V19ListCellVariant = "compact" | "dossier" | "decision";

export function V19ListCell({
  action,
  children,
  className,
  footer,
  meta,
  onClick,
  status,
  title,
  variant = "compact",
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  footer?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  status?: ReactNode;
  title: ReactNode;
  variant?: V19ListCellVariant;
}) {
  const Wrapper = onClick ? motion.button : motion.article;
  return (
    <Wrapper
      className={cn("v19pk-list-cell", `v19pk-list-cell--${variant}`, className)}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      whileHover={onClick ? { y: -1 } : undefined}
      whileTap={onClick ? { scale: 0.992 } : undefined}
    >
      <span className="v19pk-list-main">
        <strong>{title}</strong>
        {meta ? <em>{meta}</em> : null}
        {children ? <span className="v19pk-list-body">{children}</span> : null}
      </span>
      {status ? <span className="v19pk-list-status">{status}</span> : null}
      {action ? <span className="v19pk-list-action">{action}</span> : null}
      {footer ? <span className="v19pk-list-footer">{footer}</span> : null}
    </Wrapper>
  );
}

export function V19BottomActionSheet({
  children,
  labelledBy,
  onClose,
  open,
}: {
  children: ReactNode;
  labelledBy?: string;
  onClose: () => void;
  open: boolean;
}) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Закрыть панель"
            animate={{ opacity: 1 }}
            className="v19pk-bottom-sheet-backdrop"
            exit={{ opacity: 0 }}
            initial={{ opacity: reduce ? 1 : 0 }}
            transition={{ duration: reduce ? 0.01 : 0.16 }}
            type="button"
            onClick={onClose}
          />
          <motion.aside
            animate={{ opacity: 1, y: 0 }}
            aria-labelledby={labelledBy}
            aria-modal="true"
            className="v19pk-bottom-sheet"
            exit={{ opacity: 0, y: reduce ? 0 : 18 }}
            initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 24 }}
            role="dialog"
            transition={{ duration: reduce ? 0.01 : 0.2 }}
          >
            {children}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
