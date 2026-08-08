import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import "./accessible-select-menu.css";

export type AccessibleSelectMenuOption = {
  description?: string;
  disabled?: boolean;
  label: string;
  tone?: "default" | "muted" | "warning";
  value: string;
};

type AccessibleSelectMenuProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: readonly AccessibleSelectMenuOption[];
  placeholder?: string;
  triggerProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "aria-controls"
    | "aria-expanded"
    | "aria-haspopup"
    | "aria-label"
    | "disabled"
    | "onClick"
    | "onKeyDown"
    | "type"
  > & {
    "data-v19-interaction-id"?: string;
  };
  value: string;
  variant?: "city" | "default" | "questionnaire-tourist";
};

type MenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

function enabledOptionIndex(
  options: readonly AccessibleSelectMenuOption[],
  startIndex: number,
  direction: 1 | -1,
) {
  if (!options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

export function AccessibleSelectMenu({
  ariaLabel,
  className,
  disabled = false,
  onValueChange,
  options,
  placeholder = "Выберите значение",
  triggerProps,
  value,
  variant = "default",
}: AccessibleSelectMenuProps) {
  const reactId = useId();
  const listboxId = `v19-select-menu-${reactId.replaceAll(":", "")}`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>();
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportMargin = 12;
    const gap = 6;
    const width = Math.min(
      Math.max(rect.width, variant === "city" ? 230 : 280),
      window.innerWidth - viewportMargin * 2,
    );
    const estimatedHeight = Math.min(options.length * 54 + 12, 320);
    const availableBelow = window.innerHeight - rect.bottom - viewportMargin - gap;
    const availableAbove = rect.top - viewportMargin - gap;
    const opensAbove =
      availableBelow < Math.min(estimatedHeight, 180) &&
      availableAbove > availableBelow;
    const maxHeight = Math.max(
      96,
      Math.min(estimatedHeight, opensAbove ? availableAbove : availableBelow),
    );
    const desiredLeft = rect.left;
    const left = Math.min(
      Math.max(viewportMargin, desiredLeft),
      window.innerWidth - width - viewportMargin,
    );
    const top = opensAbove
      ? Math.max(viewportMargin, rect.top - maxHeight - gap)
      : rect.bottom + gap;
    setMenuPosition({ left, maxHeight, top, width });
  }, [options.length, variant]);

  const openMenu = (preferredIndex = selectedIndex) => {
    if (disabled || !options.length) return;
    const fallbackIndex = options.findIndex((option) => !option.disabled);
    const nextIndex =
      preferredIndex >= 0 && !options[preferredIndex]?.disabled
        ? preferredIndex
        : fallbackIndex;
    setActiveIndex(nextIndex);
    setOpen(true);
  };

  const closeMenu = () => setOpen(false);

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    setActiveIndex(index);
    closeMenu();
    window.requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true }),
    );
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && activeIndex >= 0) selectOption(activeIndex);
      else openMenu();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const startIndex = event.key === "Home" ? -1 : 0;
      const direction = event.key === "Home" ? 1 : -1;
      const nextIndex = enabledOptionIndex(options, startIndex, direction);
      if (!open) openMenu(nextIndex);
      else setActiveIndex(nextIndex);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    if (!open) {
      const startIndex = selectedIndex >= 0 ? selectedIndex : direction === 1 ? -1 : 0;
      openMenu(enabledOptionIndex(options, startIndex, direction));
      return;
    }
    setActiveIndex((current) => enabledOptionIndex(options, current, direction));
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target))
        return;
      closeMenu();
    };
    const handleViewportChange = () => updateMenuPosition();
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open || !disabled) return;
    closeMenu();
  }, [disabled, open]);

  const activeOptionId =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;
  const rootClassName = [
    "v19-select-menu",
    `is-${variant}`,
    open ? "is-open" : "",
    selectedOption?.tone ? `is-selected-tone-${selectedOption.tone}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const popoverStyle = menuPosition
    ? ({
        "--v19-select-menu-max-height": `${menuPosition.maxHeight}px`,
        left: menuPosition.left,
        top: menuPosition.top,
        width: menuPosition.width,
      } as CSSProperties)
    : undefined;

  return (
    <div className={rootClassName}>
      <button
        {...triggerProps}
        aria-activedescendant={activeOptionId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={["v19-select-menu-trigger", triggerProps?.className]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className="v19-select-menu-trigger-copy">
          <span className="v19-select-menu-trigger-label">
            {selectedOption?.label ?? placeholder}
          </span>
          {selectedOption?.description ? (
            <span className="v19-select-menu-trigger-description">
              {selectedOption.description}
            </span>
          ) : null}
        </span>
        <ChevronDown aria-hidden="true" className="v19-select-menu-chevron" />
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              aria-label={ariaLabel}
              className={`v19-select-menu-popover is-${variant}`}
              id={listboxId}
              ref={menuRef}
              role="listbox"
              style={popoverStyle}
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                return (
                  <button
                    aria-selected={selected}
                    className={[
                      "v19-select-menu-option",
                      selected ? "is-selected" : "",
                      activeIndex === index ? "is-active" : "",
                      `is-tone-${option.tone ?? "default"}`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={option.disabled}
                    id={`${listboxId}-option-${index}`}
                    key={option.value}
                    onClick={() => selectOption(index)}
                    onMouseEnter={() => {
                      if (!option.disabled) setActiveIndex(index);
                    }}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="v19-select-menu-option-copy">
                      <span className="v19-select-menu-option-label">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="v19-select-menu-option-description">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    <Check
                      aria-hidden="true"
                      className="v19-select-menu-option-check"
                    />
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
