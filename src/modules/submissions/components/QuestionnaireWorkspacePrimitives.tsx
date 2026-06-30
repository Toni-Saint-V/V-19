import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../shared/ui/cn";

export type QuestionnaireSectionTab<T extends string> = {
  count?: number;
  id: T;
  meta?: ReactNode;
  prefix?: ReactNode;
  title: ReactNode;
};

export function QuestionnaireWorkspaceShell({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn(className)}>
      {children}
    </div>
  );
}

export function QuestionnaireSectionTabs<T extends string>({
  activeId,
  ariaLabel,
  className,
  getButtonClassName,
  onChange,
  sections,
}: {
  activeId: T;
  ariaLabel: string;
  className?: string;
  getButtonClassName?: (section: QuestionnaireSectionTab<T>) => string | undefined;
  onChange: (id: T) => void;
  sections: Array<QuestionnaireSectionTab<T>>;
}) {
  return (
    <div className={className} role="tablist" aria-label={ariaLabel}>
      {sections.map((section, index) => {
        const active = section.id === activeId;

        return (
          <button
            aria-selected={active}
            className={cn(active && "is-active", getButtonClassName?.(section))}
            key={section.id}
            role="tab"
            type="button"
            onClick={() => onChange(section.id)}
          >
            <span>{section.prefix ?? index + 1}</span>
            <strong>{section.title}</strong>
            {typeof section.count === "number" ? <em>{section.count}</em> : null}
            {section.meta != null ? <em>{section.meta}</em> : null}
          </button>
        );
      })}
    </div>
  );
}

export function QuestionnaireSectionPreviewCard({
  children,
  className,
  meta,
  title,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  meta?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <div {...props} className={cn(className)}>
      {children ?? (
        <>
          <strong>{title}</strong>
          {meta != null ? <span>{meta}</span> : null}
        </>
      )}
    </div>
  );
}

export function QuestionnaireProgressBadge({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn(className)}>
      {children}
    </div>
  );
}

export function QuestionnaireFieldReviewRow({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn(className)}>
      {children}
    </div>
  );
}
