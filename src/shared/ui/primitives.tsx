import {
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type ElementType,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from "react";
import { cn } from "./cn";

function mergeAriaIds(
  ...values: Array<string | false | null | undefined>
): string | undefined {
  const merged = cn(...values);
  return merged || undefined;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "icon" | "plain";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  wide?: boolean;
}

export function Button({
  children,
  className,
  danger = false,
  disabled,
  loading = false,
  ref,
  type = "button",
  variant = "primary",
  wide = false,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "secondary"
      ? "secondary-button"
      : variant === "ghost"
        ? "ghost-button"
        : variant === "icon"
          ? "icon-button"
          : variant === "plain"
            ? false
            : "primary-button";

  return (
    <button
      {...props}
      ref={ref}
      className={cn(
        "mp-button",
        variantClass,
        danger && "danger-action",
        wide && "wide",
        loading && "is-loading",
        className,
      )}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <span aria-hidden="true">...</span> : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  icon: ReactNode;
  label: string;
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
  tooltip?: string;
}

export function IconButton({
  className,
  icon,
  label,
  pressed,
  ref,
  tooltip,
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      ref={ref}
      aria-label={label}
      aria-pressed={typeof pressed === "boolean" ? pressed : undefined}
      className={className}
      title={tooltip ?? label}
      variant="icon"
    >
      {icon}
      {tooltip ? (
        <span className="mp-icon-tooltip" aria-hidden="true">
          {tooltip}
        </span>
      ) : null}
    </Button>
  );
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: "danger" | "amber" | "blue" | "teal" | "muted" | "default";
}

export function Badge({ children, className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cn("mp-badge", "status-chip", tone !== "default" && tone, className)}
    >
      {children}
    </span>
  );
}

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: BadgeProps["tone"];
}

export function StatusBadge({
  className,
  label,
  tone = "default",
  ...props
}: StatusBadgeProps) {
  return (
    <Badge {...props} className={className} tone={tone}>
      {label}
    </Badge>
  );
}

type CardElement = "article" | "aside" | "div" | "section";

interface CardComponentProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  ref?: Ref<HTMLElement>;
}

export function CardComponent({
  as = "section",
  children,
  className,
  ref,
  ...props
}: CardComponentProps) {
  const Tag = as as ElementType<CardComponentProps>;

  return (
    <Tag {...props} ref={ref} className={cn("mp-card", className)}>
      {children}
    </Tag>
  );
}

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className"
> {
  containerClassName?: string;
  errorMessage?: string;
  fieldClassName?: string;
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  ref?: Ref<HTMLSelectElement>;
  required?: boolean;
  selectClassName?: string;
}

export function Select({
  containerClassName,
  errorMessage,
  fieldClassName = "questionnaire-field",
  id,
  label,
  options,
  placeholder,
  ref,
  required = false,
  selectClassName,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = errorMessage ? `${selectId}-error` : undefined;

  return (
    <label
      className={cn(
        "mp-select-field",
        fieldClassName,
        props["aria-invalid"] || errorMessage ? "has-error" : false,
        containerClassName,
      )}
      htmlFor={selectId}
    >
      {label ? (
        <span>
          {label}
          {required ? <em aria-hidden="true">*</em> : null}
        </span>
      ) : null}
      <select
        {...props}
        aria-describedby={mergeAriaIds(props["aria-describedby"], errorId)}
        aria-invalid={props["aria-invalid"] ?? Boolean(errorMessage)}
        aria-required={props["aria-required"] ?? required}
        className={cn("mp-select", selectClassName)}
        id={selectId}
        ref={ref}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errorMessage ? <small id={errorId}>{errorMessage}</small> : null}
    </label>
  );
}

interface SearchBarProps {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function SearchBar({
  className,
  label,
  onChange,
  placeholder = "Search",
  value,
}: SearchBarProps) {
  const generatedId = useId();
  const inputId = `search-${generatedId}`;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <label
      className={cn(
        "mp-searchbar",
        "search",
        "panel-search",
        "v19-toolbar-search",
        className,
      )}
    >
      <span className="search-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" focusable="false">
          <circle cx="8.5" cy="8.5" r="5.2" />
          <path d="M12.4 12.4L16 16" />
        </svg>
      </span>
      <input
        aria-label={label}
        id={inputId}
        name={inputId}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
      />
    </label>
  );
}

interface SegmentedTabsProps<T extends string> {
  ariaLabel: string;
  className?: string;
  onValueChange: (value: T) => void;
  tabs: Array<[T, string]>;
  value: T;
}

export function SegmentedTabs<T extends string>({
  ariaLabel,
  className,
  onValueChange,
  tabs,
  value,
}: SegmentedTabsProps<T>) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  function focusTab(index: number) {
    const [id] = tabs[index];
    onValueChange(id);
    requestAnimationFrame(() => {
      tabRefs.current.get(id)?.focus({ preventScroll: true });
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = tabs.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    }

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;

    if (nextIndex === null) return;

    event.preventDefault();
    focusTab(nextIndex);
  }

  return (
    <div
      className={cn("mp-segmented-tabs", "tabs", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map(([id, label], index) => {
        const selected = value === id;

        return (
          <button
            aria-selected={selected}
            className={selected ? "is-active" : ""}
            key={id}
            ref={(node) => {
              if (node) tabRefs.current.set(id, node);
              else tabRefs.current.delete(id);
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => focusTab(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface StateTabsProps<T extends string> {
  ariaLabel: string;
  className?: string;
  onValueChange: (value: T) => void;
  tabs: Array<{ count?: number; id: T; label: string }>;
  value: T;
}

export function StateTabs<T extends string>({
  ariaLabel,
  className,
  onValueChange,
  tabs,
  value,
}: StateTabsProps<T>) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  function focusTab(index: number) {
    const tab = tabs[index];
    onValueChange(tab.id);
    requestAnimationFrame(() => {
      tabRefs.current.get(tab.id)?.focus({ preventScroll: true });
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = tabs.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    }

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;

    if (nextIndex === null) return;

    event.preventDefault();
    focusTab(nextIndex);
  }

  return (
    <div
      className={cn("v19-state-tabs", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab, index) => {
        const selected = value === tab.id;

        return (
          <button
            aria-selected={selected}
            className={selected ? "is-active" : ""}
            key={tab.id}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => focusTab(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
            {typeof tab.count === "number" ? <TabCount>{tab.count}</TabCount> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabCount({ children }: { children: ReactNode }) {
  return <span className="v19-tab-count">{children}</span>;
}

export function NavCount({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span className="ops-nav-count" aria-label={label}>
      {children}
    </span>
  );
}

interface DrawerTabsProps<T extends string> {
  ariaLabel: string;
  autoFocusOnValueChange?: boolean;
  className?: string;
  onValueChange: (value: T) => void;
  tabs: Array<{ id: T; label: string; meta?: string }>;
  value: T;
}

export function DrawerTabs<T extends string>({
  ariaLabel,
  autoFocusOnValueChange = true,
  className,
  onValueChange,
  tabs,
  value,
}: DrawerTabsProps<T>) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  useEffect(() => {
    if (!autoFocusOnValueChange) return;
    requestAnimationFrame(() => {
      tabRefs.current.get(value)?.focus({ preventScroll: true });
    });
  }, [autoFocusOnValueChange, value]);

  function focusTab(index: number) {
    const tab = tabs[index];
    onValueChange(tab.id);
    requestAnimationFrame(() => {
      tabRefs.current.get(tab.id)?.focus({ preventScroll: true });
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = tabs.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    }

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;

    if (nextIndex === null) return;

    event.preventDefault();
    focusTab(nextIndex);
  }

  return (
    <div
      className={cn("mp-drawer-tabs", "drawer-tabs", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab, index) => {
        const selected = value === tab.id;

        return (
          <button
            aria-controls={`drawer-panel-${tab.id}`}
            aria-label={tab.meta ? `${tab.label}, ${tab.meta}` : tab.label}
            aria-selected={selected}
            className={selected ? "is-active" : ""}
            id={`drawer-tab-${tab.id}`}
            key={tab.id}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => focusTab(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span>{tab.label}</span>
            {tab.meta ? <em>{tab.meta}</em> : null}
          </button>
        );
      })}
    </div>
  );
}

interface TextInputFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  containerClassName?: string;
  errorMessage?: string;
  inputClassName?: string;
  label?: string;
  ref?: Ref<HTMLInputElement>;
  required?: boolean;
}

export function TextInputField({
  containerClassName,
  errorMessage,
  id,
  inputClassName,
  label,
  ref,
  required = false,
  ...props
}: TextInputFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = errorMessage ? `${inputId}-error` : undefined;

  return (
    <label
      className={cn(
        "mp-field",
        "questionnaire-field",
        props["aria-invalid"] || errorMessage ? "has-error" : false,
        containerClassName,
      )}
      htmlFor={inputId}
    >
      {label ? (
        <span>
          {label}
          {required ? <em aria-hidden="true">*</em> : null}
        </span>
      ) : null}
      <input
        {...props}
        aria-describedby={mergeAriaIds(props["aria-describedby"], errorId)}
        aria-invalid={props["aria-invalid"] ?? Boolean(errorMessage)}
        aria-required={props["aria-required"] ?? required}
        className={cn("mp-input", inputClassName)}
        id={inputId}
        ref={ref}
      />
      {errorMessage ? <small id={errorId}>{errorMessage}</small> : null}
    </label>
  );
}

interface SheetFrameProps extends HTMLAttributes<HTMLDivElement> {
  labelledBy?: string;
  modal?: boolean;
  ref?: Ref<HTMLDivElement>;
}

export function SheetFrame({
  children,
  className,
  labelledBy,
  modal = false,
  ref,
  role = "dialog",
  ...props
}: SheetFrameProps) {
  return (
    <div
      {...props}
      ref={ref}
      aria-labelledby={labelledBy}
      aria-modal={modal}
      className={cn("mp-sheet", className)}
      role={role}
    >
      {children}
    </div>
  );
}
