import {
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type ElementType,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { cn } from "./cn";

function mergeAriaIds(
  ...values: Array<string | false | null | undefined>
): string | undefined {
  const merged = cn(...values);
  return merged || undefined;
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon" | "plain";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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

export interface IconButtonProps extends Omit<
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

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
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

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: BadgeProps["tone"];
}

export function StatusBadge({
  className,
  label,
  tone = "default",
  ...props
}: StatusBadgeProps) {
  return <StatusPill {...props} className={className} label={label} tone={tone} />;
}

export type CardElement = "article" | "aside" | "div" | "section";

export interface CardComponentProps extends HTMLAttributes<HTMLElement> {
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

export interface SelectProps extends Omit<
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

export interface SearchBarProps {
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

  function handleClear() {
    onChange("");
  }

  return (
    <label
      className={cn(
        "mp-searchbar",
        "search",
        "panel-search",
        "v19-toolbar-search",
        value && "has-value",
        className,
      )}
    >
      <span className="icon search-icon" aria-hidden="true">
        <Search focusable="false" />
      </span>
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        autoComplete="off"
        id={inputId}
        name={inputId}
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={handleChange}
      />
      <button
        aria-label="Очистить поиск"
        className="clear"
        type="button"
        onClick={handleClear}
      >
        <X className="icon sm" aria-hidden="true" />
      </button>
    </label>
  );
}

export interface SegmentedTabsProps<T extends string> {
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
            className={cn("tab", selected && "active is-active")}
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

export interface StateTabsProps<T extends string> {
  ariaLabel: string;
  className?: string;
  onValueChange: (value: T) => void;
  tabs: Array<{ count?: number; id: T; label: string }>;
  value: T;
}

export interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  className?: string;
  onValueChange: (value: T) => void;
  tabs: Array<{ count?: number; id: T; label: string }>;
  value: T;
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  className,
  onValueChange,
  tabs,
  value,
}: SegmentedControlProps<T>) {
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
      className={cn("v19-segmented-control", "tabs", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab, index) => {
        const selected = value === tab.id;

        return (
          <button
            aria-selected={selected}
            className={cn("tab", selected && "active is-active")}
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

export function StateTabs<T extends string>(props: StateTabsProps<T>) {
  return (
    <SegmentedControl
      {...props}
      className={cn("v19-state-tabs", props.className)}
    />
  );
}

export function StatusTabs<T extends string>(props: StateTabsProps<T>) {
  return (
    <SegmentedControl
      {...props}
      className={cn("v19-status-tabs", "v19-state-tabs", props.className)}
    />
  );
}

export function TabCount({ children }: { children: ReactNode }) {
  return <span className="tab-count v19-tab-count">{children}</span>;
}

export function NavCount({
  children,
  className,
  label,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children: ReactNode; label?: string }) {
  return (
    <span className={cn("ops-nav-count", className)} aria-label={label} {...props}>
      {children}
    </span>
  );
}

export interface DrawerTabsProps<T extends string> {
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

export interface TextInputFieldProps extends Omit<
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

export type SearchInputProps = SearchBarProps;

export function SearchInput({ className, ...props }: SearchInputProps) {
  return <SearchBar {...props} className={cn("mp-search-input", className)} />;
}

export type StatusPillProps = Omit<BadgeProps, "children"> & {
  children?: ReactNode;
  label?: ReactNode;
};

export function StatusPill({
  children,
  className,
  label,
  ...props
}: StatusPillProps) {
  return (
    <Badge {...props} className={cn("mp-status-pill", className)}>
      {label ?? children}
    </Badge>
  );
}

export type SurfaceCardProps = CardComponentProps;

export function SurfaceCard({ className, ...props }: SurfaceCardProps) {
  return <CardComponent {...props} className={cn("mp-surface-card", className)} />;
}

export type FieldProps = TextInputFieldProps;

export function Field({ containerClassName, ...props }: FieldProps) {
  return (
    <TextInputField
      {...props}
      containerClassName={cn("mp-field-owner", containerClassName)}
    />
  );
}

export interface AlertBoxProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  tone?: "danger" | "info" | "muted" | "success" | "warning";
}

export function AlertBox({
  children,
  className,
  role,
  title,
  tone = "info",
  ...props
}: AlertBoxProps) {
  return (
    <div
      {...props}
      className={cn("mp-alert", `tone-${tone}`, className)}
      role={role ?? (tone === "danger" ? "alert" : "status")}
    >
      {title ? <strong className="mp-alert-title">{title}</strong> : null}
      {children}
    </div>
  );
}

export interface SheetFrameProps extends HTMLAttributes<HTMLDivElement> {
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

export interface BottomSheetProps {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  footer?: ReactNode;
  id?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  open: boolean;
  title: string;
  onClose: () => void;
}

export function BottomSheet({
  ariaLabel,
  children,
  className,
  closeLabel = "Закрыть",
  footer,
  id,
  initialFocusRef,
  open,
  title,
  onClose,
}: BottomSheetProps) {
  const generatedTitleId = useId();
  const titleId = `${generatedTitleId}-title`;
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;

    window.requestAnimationFrame(() => {
      const focusTarget = initialFocusRef?.current ?? closeButtonRef.current;
      focusTarget?.focus({ preventScroll: true });
    });

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const focusable = focusableElements ? Array.from(focusableElements) : [];

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        aria-label={`${closeLabel} по фону`}
        className="mp-bottom-sheet-backdrop"
        type="button"
        onClick={onClose}
      >
        <span aria-hidden="true" className="sr-only">
          {closeLabel}
        </span>
      </button>
      <div
        className={cn("mp-bottom-sheet", className)}
        id={id}
        ref={sheetRef}
        role="dialog"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-modal="true"
      >
        <div className="mp-bottom-sheet-grabber" aria-hidden="true" />
        <div className="mp-bottom-sheet-head">
          <strong id={ariaLabel ? undefined : titleId}>{title}</strong>
          <Button
            ref={closeButtonRef}
            aria-label={closeLabel}
            className="mp-bottom-sheet-close"
            variant="ghost"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="mp-bottom-sheet-body">{children}</div>
        {footer ? <div className="mp-bottom-sheet-footer">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}
