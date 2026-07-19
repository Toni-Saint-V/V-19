import {
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  drawerMotion,
  drawerPanelExit as getDrawerPanelExit,
  drawerPanelInitial as getDrawerPanelInitial,
  drawerPanelTransition as getDrawerPanelTransition,
  drawerTabExit as getDrawerTabExit,
  drawerTabInitial as getDrawerTabInitial,
  useDrawerDesktopQuery,
} from "../../../shared/ui/drawer/drawerMotion";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  FileDigit,
  FileText,
  History,
  Image as ImageIcon,
  Info,
  MapPin,
  Plane,
  ShieldAlert,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import { getPrimaryAction, statusLabels } from "../status";
import { familyDisplayTitleFromMainApplicantName } from "../listFormatters";
import { historyDetailForUser, historyTimestampForUser } from "../historyPresentation";
import {
  targetElementId,
  tabForTarget,
  targetForIssue,
  type WorkspaceTarget,
} from "../workspaceModel";
import type {
  DrawerTab,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "../types";
import {
  operationalDrawerCompactStatusLabel,
  operationalDrawerSourceStatus,
  type OperationalDrawerSourceStatus,
} from "../operationalDrawerStatus";
import { ProgressMeter } from "./CollectionPrimitives";
import { QuestionnaireSectionPreviewCard } from "./QuestionnaireWorkspacePrimitives";

type SourceStatus = OperationalDrawerSourceStatus;

type TabId =
  | "overview"
  | "applicants"
  | "questionnaire"
  | "files"
  | "issues"
  | "history";

const drawerHeadingId = "v20-submission-drawer-heading";

function drawerTabId(tab: TabId) {
  return `v20-submission-drawer-tab-${tab}`;
}

function drawerPanelId(tab: TabId) {
  return `v20-submission-drawer-panel-${tab}`;
}

type DrawerTabConfig = {
  getCount?: (detail: FigmaSubmissionDetail) => number;
  icon: IconComponent;
  id: TabId;
  isWarning?: boolean;
  label: string;
};

type IconComponent = typeof FileText;

const drawerFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const figmaSubmissionDrawerStyles = `
  :root {
    --v20-screen-bg: var(--v19b-color-app);
    --v20-panel-bg: var(--v19b-color-panel);
    --v20-card-bg: var(--v19b-color-panel);
    --v20-card-bg-strong: var(--v19b-color-control);
    --v20-border: var(--v19b-color-border);
    --v20-border-strong: var(--v19b-color-border-strong);
    --v20-text: var(--v19b-color-text-strong);
    --v20-muted: var(--v19b-color-text-muted);
    --v20-muted-soft: var(--v19b-color-text-faint);
    --v20-accent: var(--v19b-color-primary);
    --v20-accent-soft: var(--vf-accent-soft);
    --v20-accent-border: var(--vf-accent-border);
    --v20-warning: var(--v19b-dot-warning);
    --v20-success: var(--v19b-dot-success);
    --v20-radius-xl: var(--v19b-radius-panel);
    --v20-radius-lg: var(--v19b-radius-row);
    --v20-radius-md: var(--v19b-radius-control);
  }

  .v20-drawer-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(4, 4, 6, 0.72);
    backdrop-filter: blur(14px);
  }

  .v20-submission-drawer {
    position: fixed;
    inset: 0 0 0 auto;
    z-index: 50;
    display: flex;
    width: min(100vw, 1024px);
    height: 100dvh;
    flex-direction: column;
    overflow: hidden;
    color: var(--v20-text);
    background:
      radial-gradient(circle at 76% 10%, rgba(111, 99, 255, 0.10), transparent 36%),
      linear-gradient(180deg, #151518 0%, var(--v20-screen-bg) 46%, #101012 100%);
    border-left: 1px solid var(--v20-border);
    box-shadow: -34px 0 96px rgba(0, 0, 0, 0.52);
    outline: none;
  }

  .v20-submission-drawer *,
  .v20-submission-drawer *::before,
  .v20-submission-drawer *::after {
    box-sizing: border-box;
  }

  .v20-drawer-topbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 30px;
    min-height: 118px;
    padding: 24px 30px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.075);
    background: rgba(17, 17, 20, 0.76);
    backdrop-filter: blur(18px);
  }

  .v20-icon-button {
    display: inline-flex;
    width: 66px;
    height: 66px;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--v20-border);
    border-radius: 19px;
    color: rgba(255, 255, 255, 0.82);
    background: rgba(255, 255, 255, 0.045);
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }

  .v20-icon-button:hover {
    background: rgba(255, 255, 255, 0.075);
    border-color: rgba(255, 255, 255, 0.22);
    transform: translateY(-1px);
  }

  .v20-icon-button:focus-visible,
  .v20-tab-button:focus-visible,
  .v20-action-button:focus-visible,
  .v20-upload-button:focus-visible,
  .v20-file-action:focus-visible,
  .v20-questionnaire-open:focus-visible,
  .v20-issue-button:focus-visible {
    outline: 2px solid rgba(191, 197, 255, 0.95);
    outline-offset: 3px;
  }

  .v20-icon-button.is-close {
    border-color: rgba(255, 255, 255, 0.88);
    color: rgba(255, 255, 255, 0.74);
    background: rgba(255, 255, 255, 0.025);
  }

  .v20-icon-glyph {
    display: block;
    font-size: 46px;
    font-weight: 300;
    line-height: 1;
  }

  .v20-icon-glyph.is-close {
    margin-top: -3px;
    font-size: 48px;
  }

  .v20-title-wrap {
    min-width: 0;
  }

  .v20-title {
    margin: 0;
    overflow: hidden;
    color: #fbf9ff;
    font-size: clamp(28px, 4vw, 38px);
    font-weight: 760;
    letter-spacing: -0.045em;
    line-height: 1.08;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-subtitle {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 8px;
    color: var(--v20-muted-soft);
    font-size: 13px;
    font-weight: 560;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .v20-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
    padding: 4px 10px;
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.72);
    background: rgba(255, 255, 255, 0.045);
    font-size: 11px;
    font-weight: 690;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .v20-status-pill::before {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--v20-accent);
    content: "";
  }

  .v20-status-pill.is-warning {
    color: var(--v20-warning);
    border-color: rgba(236, 165, 181, 0.36);
    background: rgba(236, 165, 181, 0.08);
  }

  .v20-status-pill.is-warning::before {
    background: var(--v20-warning);
  }

  .v20-tabbar-wrap {
    padding: 20px 30px 0;
  }

  .v20-tabbar {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .v20-tabbar::-webkit-scrollbar {
    display: none;
  }

  .v20-tabbar-more {
    display: none;
  }

  .v20-tab-button {
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    gap: 9px;
    flex: 0 0 auto;
    padding: 0 19px;
    border: 1px solid var(--v20-border);
    border-radius: 999px;
    color: var(--v20-muted);
    background: rgba(255, 255, 255, 0.028);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
  }

  .v20-tab-button:hover {
    color: rgba(255, 255, 255, 0.86);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .v20-tab-button.is-active {
    color: #ffffff;
    border-color: rgba(111, 99, 255, 0.28);
    background: linear-gradient(180deg, rgba(111, 99, 255, 0.21), rgba(111, 99, 255, 0.08));
    box-shadow: 0 0 0 1px rgba(111, 99, 255, 0.10), 0 18px 36px rgba(111, 99, 255, 0.10);
  }

  .v20-tab-count {
    display: inline-flex;
    min-width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    padding: 0 7px;
    border-radius: 999px;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.10);
    font-size: 12px;
    font-weight: 760;
  }

  .v20-tab-button.is-warning:not(.is-active) .v20-tab-count {
    color: #211418;
    background: var(--v20-warning);
  }

  .v20-drawer-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 30px 30px 118px;
    scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
    scrollbar-width: thin;
  }

  .v20-drawer-body::-webkit-scrollbar {
    width: 10px;
  }

  .v20-drawer-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .v20-drawer-body::-webkit-scrollbar-thumb {
    border: 3px solid transparent;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    background-clip: content-box;
  }

  .v20-section-stack {
    display: grid;
    gap: 30px;
  }

  .v20-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .v20-stat-card {
    position: relative;
    min-height: 112px;
    overflow: hidden;
    padding: 21px 20px 18px;
    border: 1px solid var(--v20-border);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.024);
  }

  .v20-stat-card::before {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 50%);
    content: "";
  }

  .v20-stat-icon {
    position: absolute;
    top: 16px;
    right: 18px;
    width: 23px;
    height: 23px;
    color: rgba(255, 255, 255, 0.48);
  }

  .v20-stat-icon.is-accent {
    color: var(--v20-success);
  }

  .v20-stat-icon.is-warning {
    color: var(--v20-warning);
  }

  .v20-stat-value {
    position: relative;
    margin-top: 25px;
    color: #ffffff;
    font-size: 42px;
    font-weight: 520;
    letter-spacing: -0.06em;
    line-height: 0.95;
  }

  .v20-stat-label {
    position: relative;
    margin-top: 10px;
    color: rgba(255, 255, 255, 0.42);
    font-size: 12px;
    font-weight: 720;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .v20-section-label {
    margin: 0 0 18px 8px;
    color: rgba(255, 255, 255, 0.48);
    font-size: 24px;
    font-weight: 650;
    letter-spacing: 0.16em;
    line-height: 1;
    text-transform: uppercase;
  }

  .v20-card {
    border: 1px solid var(--v20-border);
    border-radius: var(--v20-radius-xl);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.040), rgba(255, 255, 255, 0.018)),
      rgba(255, 255, 255, 0.018);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }

  .v20-two-col {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 18px;
  }

  .v20-info-card {
    min-height: 210px;
    padding: 27px 30px;
  }

  .v20-info-title {
    margin: 0 0 25px;
    color: rgba(255, 255, 255, 0.46);
    font-size: 12px;
    font-weight: 760;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .v20-info-title--compact {
    margin-bottom: 0;
  }

  .v20-info-list {
    display: grid;
    gap: 21px;
  }

  .v20-info-line {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 15px;
    align-items: start;
  }

  .v20-info-line svg {
    width: 24px;
    height: 24px;
    color: rgba(255, 255, 255, 0.34);
  }

  .v20-info-main {
    color: rgba(255, 255, 255, 0.88);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.012em;
  }

  .v20-info-meta {
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.40);
    font-size: 13px;
    font-weight: 560;
  }

  .v20-package-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }

  .v20-package-count {
    color: var(--v20-success);
    font-size: 20px;
    font-weight: 760;
    letter-spacing: -0.04em;
  }

  .v20-package-list {
    display: grid;
    gap: 15px;
  }

  .v20-package-row {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 28px;
  }

  .v20-package-row svg {
    width: 22px;
    height: 22px;
    color: var(--v20-success);
  }

  .v20-package-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
  }

  .v20-package-dot.is-progress {
    background: var(--v20-accent);
    box-shadow: 0 0 0 5px rgba(111, 99, 255, 0.11);
  }

  .v20-package-label {
    color: rgba(255, 255, 255, 0.76);
    font-size: 15px;
    font-weight: 620;
  }

  .v20-family-card {
    padding: 38px;
  }

  .v20-family-head {
    display: flex;
    align-items: center;
    gap: 26px;
    margin-bottom: 34px;
  }

  .v20-family-icon {
    display: inline-flex;
    width: 82px;
    height: 82px;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.055);
  }

  .v20-family-icon svg {
    width: 36px;
    height: 36px;
    color: rgba(255, 255, 255, 0.72);
  }

  .v20-family-title {
    margin: 0;
    color: #ffffff;
    font-size: 30px;
    font-weight: 760;
    letter-spacing: -0.045em;
    line-height: 1.08;
  }

  .v20-family-meta {
    margin-top: 10px;
    color: rgba(255, 255, 255, 0.47);
    font-size: 18px;
    font-weight: 560;
  }

  .v20-person-list {
    display: grid;
    gap: 30px;
  }

  .v20-person-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 23px;
    min-height: 60px;
  }

  .v20-avatar {
    display: inline-flex;
    width: 48px;
    height: 48px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.085);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.54);
    background: rgba(255, 255, 255, 0.055);
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.05em;
    text-transform: uppercase;
  }

  .v20-person-name {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.80);
    font-size: 24px;
    font-weight: 650;
    letter-spacing: -0.032em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-person-role {
    justify-self: end;
    color: rgba(255, 255, 255, 0.43);
    font-size: 19px;
    font-weight: 520;
    letter-spacing: -0.025em;
  }

  .v20-mini-status {
    width: 25px;
    height: 25px;
    color: var(--v20-success);
  }

  .v20-mini-status.is-danger {
    color: var(--v20-warning);
  }

  .v20-mini-dot {
    display: inline-block;
    width: 19px;
    height: 19px;
    border-radius: 999px;
    background: var(--v20-accent);
  }

  .v20-mini-dot.is-muted {
    background: rgba(255, 255, 255, 0.26);
  }

  .v20-card-divider {
    height: 1px;
    margin: 35px 0 30px;
    background: rgba(255, 255, 255, 0.09);
  }

  .v20-family-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    color: rgba(255, 255, 255, 0.44);
    font-size: 20px;
    font-weight: 560;
  }

  .v20-package-pill {
    display: inline-flex;
    align-items: center;
    gap: 11px;
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid rgba(255, 255, 255, 0.075);
    background: rgba(255, 255, 255, 0.045);
    color: rgba(255, 255, 255, 0.55);
    font-size: 19px;
    font-weight: 650;
  }

  .v20-package-pill svg {
    width: 24px;
    height: 24px;
  }

  .v20-upload-stage {
    display: grid;
    gap: 28px;
  }

  .v20-upload-error {
    padding: 12px 14px;
    border: 1px solid rgba(236, 165, 181, 0.36);
    border-radius: var(--v20-radius-md);
    color: var(--v20-warning);
    background: rgba(236, 165, 181, 0.08);
    font-size: 13px;
    line-height: 1.45;
  }

  .v20-mode-toggle {
    display: flex;
    width: max-content;
    max-width: 100%;
    align-items: center;
    justify-content: center;
    justify-self: center;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.025);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
  }

  .v20-mode-button {
    display: inline-flex;
    min-height: 58px;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 0 26px;
    border: 0;
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.92);
    background: transparent;
    font-size: 22px;
    font-weight: 760;
    letter-spacing: -0.035em;
  }

  .v20-mode-button svg {
    width: 25px;
    height: 25px;
    color: var(--v20-success);
  }

  .v20-mode-button.is-active {
    background: rgba(255, 255, 255, 0.04);
    box-shadow: inset 0 0 0 1px rgba(111, 99, 255, 0.15);
  }

  .v20-question-card {
    display: grid;
    gap: 17px;
    padding: 26px 24px;
  }

  .v20-question-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    min-height: 62px;
  }

  .v20-question-text {
    color: rgba(255, 255, 255, 0.72);
    font-size: 23px;
    font-weight: 520;
    letter-spacing: -0.026em;
  }

  .v20-dropzone {
    position: relative;
    display: grid;
    min-height: 600px;
    place-items: center;
    overflow: hidden;
    padding: 64px 34px;
    border: 1.5px dashed var(--v20-accent-border);
    border-radius: 42px;
    background:
      radial-gradient(circle at 50% 50%, rgba(111, 99, 255, 0.105), transparent 54%),
      rgba(255, 255, 255, 0.018);
    cursor: default;
  }

  .v20-dropzone.is-disabled {
    opacity: 0.62;
  }

  .v20-dropzone::before {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.030), transparent 42%);
    content: "";
  }

  .v20-dropzone-inner {
    position: relative;
    display: flex;
    max-width: 820px;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .v20-upload-icon-box {
    display: inline-flex;
    width: 118px;
    height: 118px;
    align-items: center;
    justify-content: center;
    margin-bottom: 46px;
    border: 2px solid rgba(111, 99, 255, 0.40);
    border-radius: 28px;
    background: rgba(111, 99, 255, 0.18);
    color: var(--v20-success);
  }

  .v20-upload-icon-box svg {
    width: 58px;
    height: 58px;
  }

  .v20-dropzone-title {
    margin: 0;
    color: #ffffff;
    font-size: 33px;
    font-weight: 760;
    letter-spacing: -0.045em;
    line-height: 1.16;
  }

  .v20-dropzone-helper {
    max-width: 720px;
    margin: 24px 0 0;
    color: rgba(255, 255, 255, 0.43);
    font-size: 24px;
    font-weight: 480;
    letter-spacing: -0.035em;
    line-height: 1.55;
  }

  .v20-upload-button {
    display: inline-flex;
    min-height: 82px;
    align-items: center;
    justify-content: center;
    margin-top: 38px;
    padding: 0 39px;
    border: 0;
    border-radius: 14px;
    color: var(--v20-text);
    background: var(--v20-accent);
    font-size: 25px;
    font-weight: 760;
    letter-spacing: -0.04em;
    cursor: pointer;
    transition: transform 160ms ease, opacity 160ms ease;
  }

  .v20-upload-button:hover {
    transform: translateY(-1px);
  }

  .v20-upload-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    transform: none;
  }

  .v20-hidden-file-input,
  .v20-row-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .v20-file-sections {
    display: grid;
    gap: 16px;
  }

  .v20-file-section {
    overflow: hidden;
    border: 1px solid var(--v20-border);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.024);
  }

  .v20-file-section-head {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 22px 24px;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .v20-file-section-title {
    display: block;
    overflow: hidden;
    color: #ffffff;
    font-size: 22px;
    font-weight: 730;
    letter-spacing: -0.04em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-file-section-meta {
    display: block;
    margin-top: 7px;
    color: rgba(255, 255, 255, 0.43);
    font-size: 15px;
    font-weight: 560;
  }

  .v20-file-section-toggle {
    color: var(--v20-success);
    font-size: 15px;
    font-weight: 760;
  }

  .v20-file-list {
    display: grid;
    gap: 1px;
    border-top: 1px solid rgba(255, 255, 255, 0.075);
    background: rgba(255, 255, 255, 0.055);
  }

  .v20-file-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 18px 22px;
    background: #151517;
  }

  .v20-file-icon {
    display: inline-flex;
    width: 46px;
    height: 46px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.54);
  }

  .v20-file-icon svg {
    width: 22px;
    height: 22px;
  }

  .v20-file-title {
    display: block;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.86);
    font-size: 17px;
    font-weight: 690;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-file-meta {
    display: block;
    overflow: hidden;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.42);
    font-size: 13px;
    font-weight: 520;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-file-action,
  .v20-file-status {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    border: 1px solid rgba(191, 197, 255, 0.35);
    border-radius: 999px;
    color: var(--v20-success);
    background: rgba(111, 99, 255, 0.09);
    font-size: 13px;
    font-weight: 760;
    cursor: pointer;
  }

  .v20-file-action:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .v20-file-status.is-ready {
    color: rgba(255, 255, 255, 0.62);
    border-color: rgba(255, 255, 255, 0.11);
    background: rgba(255, 255, 255, 0.035);
  }

  .v20-questionnaire-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 28px;
  }

  .v20-questionnaire-title {
    margin: 0;
    color: #ffffff;
    font-size: 26px;
    font-weight: 760;
    letter-spacing: -0.045em;
  }

  .v20-questionnaire-helper {
    margin: 9px 0 0;
    color: rgba(255, 255, 255, 0.46);
    font-size: 16px;
    font-weight: 520;
  }

  .v20-questionnaire-open,
  .v20-issue-button {
    display: inline-flex;
    min-height: 52px;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 18px;
    border: 1px solid rgba(191, 197, 255, 0.35);
    border-radius: 16px;
    color: #ffffff;
    background: var(--v20-accent);
    font-size: 15px;
    font-weight: 760;
    cursor: pointer;
  }

  .v20-questionnaire-open svg,
  .v20-issue-button svg {
    width: 18px;
    height: 18px;
  }

  .v20-questionnaire-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .v20-questionnaire-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 17px;
    align-items: center;
    min-height: 112px;
    padding: 20px;
    border: 1px solid var(--v20-border);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.024);
    cursor: pointer;
  }

  .v20-questionnaire-card:hover {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.035);
  }

  .v20-questionnaire-icon {
    display: inline-flex;
    width: 52px;
    height: 52px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 16px;
    color: rgba(255, 255, 255, 0.42);
    background: rgba(255, 255, 255, 0.04);
  }

  .v20-questionnaire-icon.is-done {
    color: var(--v20-success);
    border-color: rgba(191, 197, 255, 0.26);
    background: rgba(111, 99, 255, 0.10);
  }

  .v20-questionnaire-icon.is-progress {
    color: #ffffff;
    border-color: rgba(111, 99, 255, 0.38);
    background: rgba(111, 99, 255, 0.20);
  }

  .v20-questionnaire-icon svg {
    width: 24px;
    height: 24px;
  }

  .v20-questionnaire-card-title {
    display: block;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.86);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.025em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-progress-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    margin-top: 11px;
  }

  .v20-questionnaire-card-remaining,
  .v20-history-detail {
    display: block;
    margin-top: 6px;
    color: rgba(255, 255, 255, 0.46);
    font-size: 13px;
    font-weight: 560;
    line-height: 1.35;
  }

  .v20-progress-track {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.075);
  }

  .v20-progress-fill {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    appearance: none;
    border: 0;
    border-radius: inherit;
    background: transparent;
  }

  .v20-progress-fill::-webkit-progress-bar {
    background: transparent;
  }

  .v20-progress-fill::-webkit-progress-value {
    border-radius: inherit;
    background: var(--v20-accent);
  }

  .v20-progress-fill::-moz-progress-bar {
    border-radius: inherit;
    background: var(--v20-accent);
  }

  .v20-progress-fill.is-done::-webkit-progress-value,
  .v20-progress-fill.is-done::-moz-progress-bar {
    background: var(--v20-success);
  }

  .v20-progress-percent {
    color: rgba(255, 255, 255, 0.44);
    font-size: 12px;
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .v20-issues-screen {
    display: grid;
    gap: 28px;
  }

  .v20-search-row {
    display: flex;
    min-height: 72px;
    align-items: center;
    gap: 17px;
    padding: 0 22px;
    border: 1px solid var(--v20-border);
    border-radius: 18px;
    color: rgba(255, 255, 255, 0.42);
    background: rgba(255, 255, 255, 0.045);
    font-size: 23px;
    font-weight: 520;
    letter-spacing: -0.03em;
  }

  .v20-search-row svg {
    width: 26px;
    height: 26px;
  }

  .v20-empty-state {
    display: grid;
    min-height: 156px;
    place-items: center;
    padding: 30px;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 26px;
    color: rgba(255, 255, 255, 0.46);
    background: rgba(255, 255, 255, 0.014);
    text-align: center;
    font-size: 25px;
    font-weight: 500;
    letter-spacing: -0.035em;
  }

  .v20-files-empty-state {
    gap: 16px;
  }

  .v20-files-empty-state p {
    max-width: 560px;
    margin: 0;
  }

  .v20-issue-list {
    display: grid;
    gap: 16px;
  }

  .v20-issue-card {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 18px;
    align-items: start;
    overflow: hidden;
    padding: 22px;
    border: 1px solid var(--v20-border);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.024);
  }

  .v20-issue-card::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--v20-warning);
    content: "";
  }

  .v20-issue-icon {
    display: inline-flex;
    width: 48px;
    height: 48px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(236, 165, 181, 0.22);
    border-radius: 14px;
    color: var(--v20-warning);
    background: rgba(236, 165, 181, 0.08);
  }

  .v20-issue-icon svg {
    width: 23px;
    height: 23px;
  }

  .v20-issue-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .v20-issue-title {
    margin: 0;
    color: #ffffff;
    font-size: 19px;
    font-weight: 740;
    letter-spacing: -0.03em;
  }

  .v20-issue-badge {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    padding: 0 11px;
    border-radius: 999px;
    color: var(--v20-warning);
    background: rgba(236, 165, 181, 0.09);
    font-size: 12px;
    font-weight: 790;
  }

  .v20-issue-target {
    display: block;
    margin-top: 7px;
    color: rgba(255, 255, 255, 0.44);
    font-size: 13px;
    font-weight: 630;
  }

  .v20-issue-text {
    margin: 12px 0 0;
    color: rgba(255, 255, 255, 0.64);
    font-size: 15px;
    font-weight: 510;
    line-height: 1.5;
  }

  .v20-issue-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-end;
  }

  .v20-issue-button.is-ghost {
    color: rgba(255, 255, 255, 0.72);
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.045);
  }

  .v20-issue-state {
    color: rgba(255, 255, 255, 0.45);
    font-size: 13px;
    font-weight: 720;
  }

  .v20-history-list {
    display: grid;
    gap: 16px;
  }

  .v20-history-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 17px;
    align-items: center;
    padding: 20px;
    border: 1px solid var(--v20-border);
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.024);
  }

  .v20-history-icon {
    display: inline-flex;
    width: 48px;
    height: 48px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    color: rgba(255, 255, 255, 0.50);
    background: rgba(255, 255, 255, 0.04);
  }

  .v20-history-icon.is-warning {
    color: var(--v20-warning);
    border-color: rgba(236, 165, 181, 0.22);
    background: rgba(236, 165, 181, 0.08);
  }

  .v20-history-icon.is-info {
    color: var(--v20-success);
    border-color: rgba(191, 197, 255, 0.22);
    background: rgba(111, 99, 255, 0.10);
  }

  .v20-history-title {
    display: block;
    color: rgba(255, 255, 255, 0.86);
    font-size: 18px;
    font-weight: 720;
    letter-spacing: -0.025em;
  }

  .v20-history-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
    color: rgba(255, 255, 255, 0.44);
    font-size: 13px;
    font-weight: 560;
  }

  .v20-history-dot {
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
  }

  .v20-footer {
    position: absolute;
    inset: auto 0 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;
    padding: 18px 30px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.075);
    background: linear-gradient(180deg, rgba(16, 16, 18, 0.76), rgba(16, 16, 18, 0.98));
    backdrop-filter: blur(16px);
  }

  .v20-footer-note {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.40);
    font-size: 13px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-footer-note.is-error {
    color: var(--v20-warning);
  }

  .v20-footer-actions {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr);
    gap: 16px;
  }

  .v20-action-button {
    display: inline-flex;
    min-height: 80px;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 28px;
    border-radius: 14px;
    font-size: 21px;
    font-weight: 760;
    letter-spacing: -0.035em;
    cursor: pointer;
    transition: transform 160ms ease, opacity 160ms ease, border-color 160ms ease, background 160ms ease;
  }

  .v20-action-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .v20-action-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .v20-action-button.is-ghost {
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.88);
    background: rgba(255, 255, 255, 0.012);
  }

  .v20-action-button.is-primary {
    border: 1px solid rgba(111, 99, 255, 0.72);
    color: #ffffff;
    background: var(--v20-accent);
    box-shadow: 0 20px 46px rgba(111, 99, 255, 0.18);
  }

  .v20-action-button.is-warning {
    border-color: rgba(236, 165, 181, 0.38);
    background: linear-gradient(135deg, #7b5560, #6f63ff);
  }

  .v20-skeleton-screen {
    display: grid;
    gap: 18px;
    padding: 30px;
  }

  .v20-skeleton {
    position: relative;
    overflow: hidden;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.055);
  }

  .v20-skeleton.is-title {
    width: 224px;
    height: 48px;
  }

  .v20-skeleton.is-stat {
    height: 112px;
  }

  .v20-skeleton.is-panel {
    height: 384px;
  }

  .v20-skeleton::after {
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.09), transparent);
    animation: v20SkeletonSweep 1.4s infinite;
    content: "";
  }

  @keyframes v20SkeletonSweep {
    to { transform: translateX(100%); }
  }

  .is-ai-focus {
    border-color: rgba(191, 197, 255, 0.82) !important;
    box-shadow: 0 0 0 4px rgba(111, 99, 255, 0.18) !important;
  }

  @media (max-width: 760px) {
    .v20-submission-drawer {
      width: 100vw;
      border-left: 0;
    }

    .v20-drawer-topbar {
      gap: 16px;
      min-height: 92px;
      padding: 18px 16px;
    }

    .v20-icon-button {
      width: 54px;
      height: 54px;
      border-radius: 16px;
    }

    .v20-icon-glyph {
      font-size: 38px;
    }

    .v20-icon-glyph.is-close {
      font-size: 40px;
    }

    .v20-title {
      font-size: 25px;
    }

    .v20-subtitle {
      display: none;
    }

    .v20-tabbar-wrap {
      padding: 14px 16px 0;
    }

    .v20-tab-button {
      min-height: 42px;
      padding: 0 15px;
      font-size: 14px;
    }

    .v20-drawer-body {
      padding: 22px 16px 124px;
    }

    .v20-stat-grid,
    .v20-two-col,
    .v20-questionnaire-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .v20-stat-card {
      min-height: 96px;
      border-radius: 18px;
    }

    .v20-stat-value {
      font-size: 34px;
    }

    .v20-section-label {
      margin-left: 2px;
      font-size: 16px;
    }

    .v20-family-card {
      padding: 24px;
      border-radius: 24px;
    }

    .v20-family-head {
      gap: 18px;
      margin-bottom: 24px;
    }

    .v20-family-icon {
      width: 62px;
      height: 62px;
    }

    .v20-family-title {
      font-size: 24px;
    }

    .v20-family-meta {
      font-size: 15px;
    }

    .v20-person-list {
      gap: 18px;
    }

    .v20-person-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 14px;
    }

    .v20-person-role {
      display: none;
    }

    .v20-person-name {
      font-size: 18px;
    }

    .v20-family-foot {
      align-items: flex-start;
      flex-direction: column;
      font-size: 15px;
    }

    .v20-info-card {
      min-height: auto;
      padding: 22px;
    }

    .v20-question-text {
      font-size: 17px;
    }

    .v20-question-row {
      grid-template-columns: 1fr;
    }

    .v20-dropzone {
      min-height: 440px;
      padding: 44px 24px;
      border-radius: 30px;
    }

    .v20-upload-icon-box {
      width: 96px;
      height: 96px;
      margin-bottom: 34px;
    }

    .v20-dropzone-title {
      font-size: 26px;
    }

    .v20-dropzone-helper {
      font-size: 18px;
    }

    .v20-upload-button {
      min-height: 64px;
      font-size: 20px;
    }

    .v20-file-item,
    .v20-issue-card {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .v20-file-action,
    .v20-file-status,
    .v20-issue-actions {
      grid-column: 1 / -1;
      justify-self: stretch;
      align-items: stretch;
    }

    .v20-file-action,
    .v20-file-status,
    .v20-issue-button {
      width: 100%;
    }

    .v20-footer {
      grid-template-columns: 1fr;
      padding: 14px 16px 18px;
    }

    .v20-footer-note {
      display: none;
    }

    .v20-footer-note.is-error {
      display: block;
      white-space: normal;
    }

    .v20-footer-actions {
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .v20-action-button {
      min-height: 64px;
      padding: 0 14px;
      font-size: 17px;
    }
  }

  @media (max-width: 460px) {
    .v20-stat-grid,
    .v20-two-col,
    .v20-questionnaire-grid,
    .v20-footer-actions {
      grid-template-columns: 1fr;
    }

    .v20-drawer-topbar {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .v20-icon-button.is-close {
      display: none;
    }
  }

  /* Historical Drawer reference: compact operational shell. The content keeps
     the current canonical submission/file handlers; only its visual frame is
     mapped to the approved AgentDrawer. */
  @media (min-width: 761px) {
    .v20-submission-drawer {
      inset: var(--v19-canvas-inset-desktop-max) var(--v19-canvas-inset-desktop-max) var(--v19-canvas-inset-desktop-max) auto;
      width: var(--v19-drawer-max-width);
      height: auto;
      border: 1px solid var(--v19-line-default);
      border-radius: var(--v19-app-frame-radius);
      background: var(--v19-panel);
      box-shadow: -24px 0 80px rgb(0 0 0 / 0.6);
    }

    .v20-drawer-topbar {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--v19-space-lg);
      min-height: 0;
      padding: var(--v19-space-lg) var(--v19-space-2xl) 0;
      background: rgb(17 17 19 / 0.95);
    }

    .v20-drawer-topbar > .v20-icon-button:first-child {
      display: none;
    }

    .v20-icon-button {
      width: var(--v19-button-height);
      height: var(--v19-button-height);
      border-radius: var(--v19-radius-button);
      background: var(--v19-control);
    }

    .v20-icon-button.is-close {
      border-color: var(--v19-line-default);
      background: var(--v19-control);
    }

    .v20-icon-glyph,
    .v20-icon-glyph.is-close {
      font-size: var(--v19-space-2xl);
    }

    .v20-title {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    .v20-subtitle {
      margin-top: var(--v19-space-sm);
      font-size: 12px;
    }

    .v20-tabbar-wrap {
      padding: var(--v19-space-lg) var(--v19-space-2xl) 0;
    }

    .v20-tabbar {
      gap: var(--v19-space-sm);
    }

    .v20-tab-button {
      min-height: 44px;
      padding: 0 var(--v19-space-md);
      border: 0;
      border-radius: 0;
      background: transparent;
      font-size: 13px;
      font-weight: 500;
    }

    .v20-tab-button.is-active {
      border-color: transparent;
      background: transparent;
      box-shadow: inset 0 -2px var(--v19-fg);
    }

    .v20-drawer-body {
      padding: var(--v19-space-2xl) var(--v19-space-2xl) 92px;
    }

    .v20-footer {
      gap: var(--v19-space-lg);
      padding: var(--v19-space-lg) var(--v19-space-2xl) var(--v19-space-xl);
      background: rgb(17 17 19 / 0.95);
    }

    .v20-footer-actions {
      grid-template-columns: auto auto;
      gap: var(--v19-space-md);
    }

    .v20-action-button {
      min-height: 44px;
      padding: 0 var(--v19-space-xl);
      border-radius: var(--v19-radius-button);
      font-size: 14px;
      font-weight: 500;
    }
  }

  /* V-19 operational convergence: keep the existing drawer flow, but align
     its surfaces, density and action hierarchy with the live queue screens. */
  .v20-submission-drawer {
    width: min(var(--v19b-size-full), var(--v19b-size-840));
    background: var(--v20-screen-bg);
    border: var(--v19b-size-1) solid var(--v20-border-strong);
    border-radius: var(--v20-radius-xl);
    box-shadow: var(--v19b-shadow-panel);
  }

  .v20-drawer-topbar {
    gap: var(--v19b-size-12);
    min-height: var(--v19b-size-64);
    padding: var(--v19b-size-12) var(--v19b-size-20);
    border-bottom-color: var(--v20-border);
    background: var(--v20-panel-bg);
  }

  .v20-icon-button {
    width: var(--v19b-size-40);
    height: var(--v19b-size-40);
    border-color: var(--v20-border-strong);
    border-radius: var(--v20-radius-md);
    color: var(--v20-text);
    background: var(--v20-card-bg-strong);
  }

  .v20-icon-button.is-close {
    border-color: var(--v20-border-strong);
    color: var(--v20-muted);
    background: var(--v20-card-bg-strong);
  }

  .v20-icon-glyph,
  .v20-icon-glyph.is-close {
    font-size: var(--v19b-size-24);
  }

  .v20-title {
    color: var(--v20-text);
    font-size: var(--v19b-size-22);
    font-weight: var(--v19b-weight-title);
    letter-spacing: var(--v19b-letter-spacing-normal);
  }

  .v20-drawer-title-line {
    display: flex;
    min-width: var(--v19b-size-0);
    align-items: center;
    gap: var(--v19b-size-8);
  }

  .v20-drawer-title-line .v20-title {
    min-width: var(--v19b-size-0);
    flex: 1 1 auto;
  }

  .v20-subtitle-separator {
    color: var(--v20-border-strong);
  }

  .v20-icon-button svg {
    width: var(--v19b-size-20);
    height: var(--v19b-size-20);
  }

  .v20-subtitle {
    color: var(--v20-muted-soft);
    font-size: var(--v19b-size-11);
    letter-spacing: var(--v19b-letter-spacing-wide);
  }

  .v20-status-pill {
    min-height: var(--v19b-size-24);
    padding: var(--v19b-size-4) var(--v19b-size-8);
    border-color: var(--v20-border-strong);
    color: var(--v20-muted);
    background: var(--v20-card-bg-strong);
  }

  .v20-tabbar-wrap {
    padding: var(--v19b-size-12) var(--v19b-size-20) var(--v19b-size-0);
  }

  .v20-tabbar {
    gap: var(--v19b-size-2);
  }

  .v20-tab-button {
    min-height: var(--v19b-size-40);
    padding-inline: var(--v19b-size-12);
    border-color: transparent;
    border-radius: var(--v20-radius-md);
    color: var(--v20-muted);
    background: transparent;
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
  }

  .v20-tab-button.is-active {
    border-color: transparent;
    color: var(--v19b-color-primary-text);
    background: var(--v20-accent-soft);
    box-shadow: inset var(--v19b-size-0) calc(var(--v19b-size-2) * -1) var(--v20-accent);
  }

  .v20-tab-count {
    min-width: var(--v19b-size-20);
    height: var(--v19b-size-20);
    color: var(--v20-text);
    background: var(--v20-card-bg-strong);
    font-size: var(--v19b-size-10);
  }

  .v20-tab-icon {
    width: var(--v19b-size-16);
    height: var(--v19b-size-16);
    flex: none;
  }

  .v20-tabbar-more-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--v19b-size-4);
  }

  .v20-tabbar-more-trigger svg {
    width: var(--v19b-size-16);
    height: var(--v19b-size-16);
  }

  .v20-drawer-body {
    padding: var(--v19b-size-20) var(--v19b-size-24) var(--v19b-size-24);
  }

  .v20-section-stack {
    gap: var(--v19b-size-20);
  }

  .v20-stat-grid {
    gap: var(--v19b-size-8);
  }

  .v20-stat-card,
  .v20-card,
  .v20-file-section,
  .v20-questionnaire-card,
  .v20-issue-card,
  .v20-history-item {
    border-color: var(--v20-border-strong);
    border-radius: var(--v20-radius-lg);
    background: var(--v20-card-bg);
    box-shadow: var(--v19b-shadow-row-inner);
  }

  .v20-stat-card {
    min-height: var(--v19b-size-92);
    padding: var(--v19b-size-14);
  }

  .v20-stat-value {
    color: var(--v20-text);
    font-size: var(--v19b-size-28);
  }

  .v20-stat-label,
  .v20-section-label,
  .v20-info-title {
    color: var(--v20-muted);
    font-size: var(--v19b-size-11);
    letter-spacing: var(--v19b-letter-spacing-wide);
  }

  .v20-info-card {
    min-height: var(--v19b-size-176);
    padding: var(--v19b-size-20);
  }

  .v20-upload-stage {
    gap: var(--v19b-size-16);
  }

  .v20-mode-toggle {
    justify-self: start;
    padding: var(--v19b-size-0);
    border-color: var(--v20-border-strong);
    border-radius: var(--v20-radius-md);
    background: var(--v20-card-bg-strong);
    box-shadow: none;
  }

  .v20-mode-button {
    min-height: var(--v19b-size-40);
    gap: var(--v19b-size-8);
    padding-inline: var(--v19b-size-12);
    border-radius: var(--v20-radius-md);
    color: var(--v20-text);
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
  }

  .v20-mode-button svg {
    width: var(--v19b-size-16);
    height: var(--v19b-size-16);
  }

  .v20-dropzone {
    min-height: var(--v19b-size-176);
    padding: var(--v19b-size-20);
    border: var(--v19b-size-1) dashed var(--v20-border-strong);
    border-radius: var(--v20-radius-lg);
    background: var(--v20-card-bg);
  }

  .v20-dropzone::before {
    display: none;
  }

  .v20-upload-icon-box {
    width: var(--v19b-size-40);
    height: var(--v19b-size-40);
    margin-bottom: var(--v19b-size-12);
    border: var(--v19b-size-1) solid var(--v20-accent-border);
    border-radius: var(--v20-radius-md);
    color: var(--v20-accent);
    background: var(--v20-accent-soft);
  }

  .v20-upload-icon-box svg {
    width: var(--v19b-size-20);
    height: var(--v19b-size-20);
  }

  .v20-dropzone-title {
    color: var(--v20-text);
    font-size: var(--v19b-size-16);
    font-weight: var(--v19b-weight-title);
    letter-spacing: var(--v19b-letter-spacing-normal);
  }

  .v20-dropzone-helper {
    margin-top: var(--v19b-size-8);
    color: var(--v20-muted);
    font-size: var(--v19b-size-13);
    letter-spacing: var(--v19b-letter-spacing-normal);
  }

  .v20-upload-button {
    min-height: var(--v19b-size-40);
    margin-top: var(--v19b-size-12);
    padding-inline: var(--v19b-size-16);
    border-radius: var(--v20-radius-md);
    color: var(--v19b-color-primary-text);
    background: var(--v20-accent);
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-normal);
  }

  .v20-subview-intro {
    display: grid;
    gap: var(--v19b-size-8);
    padding: var(--v19b-size-16);
    border: var(--v19b-size-1) solid var(--v20-border-strong);
    border-radius: var(--v20-radius-lg);
    background: var(--v20-card-bg);
  }

  .v20-subview-eyebrow {
    color: var(--v20-muted);
    font-size: var(--v19b-size-11);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-wide);
    text-transform: uppercase;
  }

  .v20-subview-title {
    margin: var(--v19b-size-0);
    color: var(--v20-text);
    font-size: var(--v19b-size-16);
    font-weight: var(--v19b-weight-title);
  }

  .v20-subview-copy {
    margin: var(--v19b-size-0);
    color: var(--v20-muted);
    font-size: var(--v19b-size-13);
  }

  .v20-family-card {
    padding: var(--v19b-size-24);
  }

  .v20-footer {
    position: relative;
    inset: auto;
    gap: var(--v19b-size-12);
    padding: var(--v19b-size-14) var(--v19b-size-24);
    border-top-color: var(--v20-border);
    background: var(--v20-panel-bg);
  }

  .v20-footer-note {
    color: var(--v20-muted);
    font-size: var(--v19b-size-12);
  }

  .v20-footer-actions {
    grid-template-columns: auto minmax(var(--v19b-size-160), 1fr);
    gap: var(--v19b-size-8);
  }

  .v20-action-button {
    min-height: var(--v19b-size-44);
    padding-inline: var(--v19b-size-16);
    border-radius: var(--v20-radius-md);
    font-size: var(--v19b-size-14);
    font-weight: var(--v19b-weight-control);
  }

  .v20-action-button.is-ghost {
    border-color: var(--v20-border-strong);
    color: var(--v20-text);
    background: var(--v20-card-bg-strong);
  }

  .v20-action-button.is-primary {
    border-color: var(--v20-accent-border);
    background: var(--v20-accent);
    box-shadow: none;
  }

  @media (max-width: 760px) {
    .v20-submission-drawer {
      width: var(--v19b-size-full);
      border: var(--v19b-size-0);
      border-radius: var(--v19b-radius-row) var(--v19b-radius-row) var(--v19b-size-0) var(--v19b-size-0);
    }

    .v20-drawer-topbar {
      min-height: var(--v19b-size-56);
      padding: var(--v19b-size-8) var(--v19b-size-16);
    }

    .v20-title {
      font-size: var(--v19b-size-20);
    }

    .v20-drawer-title-line {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .v20-subtitle {
      display: flex;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .v20-tabbar-wrap {
      padding-inline: var(--v19b-size-16);
    }

    .v20-tabbar-wrap {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--v19b-size-8);
    }

    .v20-tabbar {
      min-width: var(--v19b-size-0);
      flex: 1;
      overflow: visible;
    }

    .v20-tab-button.is-mobile-secondary {
      display: none;
    }

    .v20-tabbar-more {
      position: relative;
      display: block;
      flex: none;
    }

    .v20-tabbar-more-trigger,
    .v20-tabbar-more-menu button {
      min-height: var(--v19b-size-40);
      border: var(--v19b-size-0);
      border-radius: var(--v20-radius-md);
      color: var(--v20-muted);
      background: transparent;
      font: inherit;
      font-size: var(--v19b-size-13);
      font-weight: var(--v19b-weight-control);
      cursor: pointer;
    }

    .v20-tabbar-more-trigger {
      padding-inline: var(--v19b-size-12);
    }

    .v20-tabbar-more-trigger.is-active {
      color: var(--v19b-color-primary-text);
      background: var(--v20-accent-soft);
      box-shadow: inset var(--v19b-size-0) calc(var(--v19b-size-2) * -1) var(--v20-accent);
    }

    .v20-tabbar-more-menu {
      position: absolute;
      z-index: 2;
      top: calc(var(--v19b-size-40) + var(--v19b-size-8));
      right: var(--v19b-size-0);
      display: grid;
      width: max-content;
      gap: var(--v19b-size-2);
      padding: var(--v19b-size-4);
      border: 1px solid var(--v20-border-strong);
      border-radius: var(--v20-radius-md);
      background: var(--v20-card-bg-strong);
    }

    .v20-tabbar-more-menu button {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: var(--v19b-size-16);
      padding-inline: var(--v19b-size-12);
      text-align: left;
    }

    .v20-tabbar-more-menu .v20-tab-count {
      margin-left: auto;
    }

    .v20-tabbar-more-menu button[aria-current="page"] {
      color: var(--v19b-color-primary-text);
      background: var(--v20-accent-soft);
    }

    .v20-drawer-body {
      padding: var(--v19b-size-16);
    }

    .v20-dropzone {
      min-height: var(--v19b-size-160);
      padding: var(--v19b-size-16);
    }

    .v20-footer {
      position: relative !important;
      inset: auto !important;
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
      padding: var(--v19b-size-12) var(--v19b-size-16) max(var(--v19b-size-12), env(safe-area-inset-bottom));
    }

    .v20-footer-note {
      display: block;
      overflow: visible;
      white-space: normal;
    }

    .v20-footer-actions {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr)) minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    }
  }

  @media (max-width: 460px) {
    .v20-stat-grid {
      grid-template-columns: repeat(2, minmax(var(--v19b-size-0), var(--v19b-grid-fr)));
    }

    .v20-two-col,
    .v20-questionnaire-grid,
    .v20-footer-actions {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    }

    .v20-questionnaire-head {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
      gap: var(--v19b-size-16);
    }

    .v20-questionnaire-head .v20-questionnaire-open {
      width: var(--v19b-size-full);
    }

    .v20-action-button {
      min-height: var(--v19b-size-48);
    }
  }

  @media (max-width: 360px) {
    .v20-title {
      font-size: var(--v19b-size-18);
    }

    .v20-status-pill {
      gap: var(--v19b-size-4);
      min-height: var(--v19b-size-22);
      padding: var(--v19b-size-4) var(--v19b-size-8);
      font-size: var(--v19b-size-10);
    }

    .v20-status-pill::before {
      width: var(--v19b-size-4);
      height: var(--v19b-size-4);
    }
  }

  /* Selected Product Design direction: a single, exact correction at a time. */
  .v20-submission-drawer {
    width: min(
      var(--v19b-size-full),
      calc(var(--v19b-size-840) + var(--v19b-size-120))
    );
    border-block: var(--v19b-size-0);
    border-right: var(--v19b-size-0);
    border-radius: var(--v19b-size-0);
    background: var(--v19b-color-page);
  }

  .v20-drawer-topbar > .v20-icon-button:first-child {
    display: inline-flex;
  }

  .v20-drawer-topbar {
    position: relative;
    z-index: 3;
    grid-template-columns: auto minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
    min-height: var(--v19b-size-72);
    padding: var(--v19b-size-12) var(--v19b-size-24);
    background: var(--v19b-color-page);
  }

  .v20-header-actions,
  .v20-sections-trigger,
  .v20-sections-popover button {
    display: flex;
    align-items: center;
  }

  .v20-header-actions {
    gap: var(--v19b-size-8);
  }

  .v20-sections-menu {
    position: relative;
  }

  .v20-sections-trigger {
    min-height: var(--v19b-size-40);
    gap: var(--v19b-size-8);
    padding-inline: var(--v19b-size-12);
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-color-text-strong);
    background: var(--v19b-color-control);
    font: inherit;
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
    cursor: pointer;
  }

  .v20-sections-trigger svg,
  .v20-sections-popover svg {
    width: var(--v19b-size-18);
    height: var(--v19b-size-18);
  }

  .v20-sections-trigger:focus-visible,
  .v20-sections-popover button:focus-visible,
  .v20-focus-stepper button:focus-visible,
  .v20-focus-primary:focus-visible {
    outline: var(--v19b-size-2) solid var(--v19b-color-primary-text);
    outline-offset: var(--v19b-size-2);
  }

  .v20-sections-popover {
    position: absolute;
    z-index: 4;
    top: calc(var(--v19b-size-full) + var(--v19b-size-8));
    right: var(--v19b-size-0);
    display: grid;
    width: var(--v19b-size-220);
    gap: var(--v19b-size-2);
    padding: var(--v19b-size-6);
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-color-control);
    box-shadow: var(--v19b-shadow-panel);
  }

  .v20-sections-popover button {
    min-height: var(--v19b-size-40);
    gap: var(--v19b-size-10);
    padding-inline: var(--v19b-size-12);
    border: var(--v19b-size-0);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-color-text-muted);
    background: transparent;
    font: inherit;
    font-size: var(--v19b-size-13);
    text-align: left;
    cursor: pointer;
  }

  .v20-sections-popover button[aria-current="page"] {
    color: var(--v19b-color-primary-text);
    background: var(--v19b-color-primary-soft-10);
  }

  .v20-sections-popover .v20-tab-count {
    margin-left: auto;
  }

  .v20-drawer-body {
    padding: var(--v19b-size-0);
  }

  .v20-drawer-body > [role="region"] {
    display: flex;
    min-height: var(--v19b-size-full);
    flex-direction: column;
    outline: none;
  }

  .v20-focus-flow {
    display: flex;
    min-height: var(--v19b-size-full);
    flex: 1 1 auto;
    flex-direction: column;
  }

  .v20-focus-progress {
    display: flex;
    justify-content: space-between;
    padding: var(--v19b-size-28) var(--v19b-size-32) var(--v19b-size-12);
    color: var(--v19b-color-text-muted);
    font-size: var(--v19b-size-16);
    font-weight: var(--v19b-weight-control);
  }

  .v20-focus-progressbar {
    width: calc(var(--v19b-size-full) - var(--v19b-size-64));
    height: var(--v19b-size-3);
    margin-inline: var(--v19b-size-32);
    overflow: hidden;
    border: var(--v19b-size-0);
    border-radius: var(--v19b-radius-pill);
    background: var(--v19b-color-control);
    accent-color: var(--v19b-dot-warning);
  }

  .v20-focus-progressbar::-webkit-progress-bar {
    background: var(--v19b-color-control);
  }

  .v20-focus-progressbar::-moz-progress-bar {
    background: var(--v19b-dot-warning);
  }

  .v20-focus-progressbar::-webkit-progress-value {
    background: var(--v19b-dot-warning);
  }

  .v20-focus-workspace {
    display: grid;
    max-width: var(--v19b-size-760);
    gap: var(--v19b-size-28);
    padding: var(--v19b-size-40) var(--v19b-size-32) var(--v19b-size-48);
  }

  .v20-focus-heading-row {
    display: flex;
    min-width: var(--v19b-size-0);
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--v19b-size-20);
  }

  .v20-focus-eyebrow {
    color: var(--v19b-color-text-muted);
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-wide);
    text-transform: uppercase;
  }

  .v20-focus-title {
    margin: var(--v19b-size-8) var(--v19b-size-0) var(--v19b-size-0);
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-40);
    font-weight: var(--v19b-weight-title);
    letter-spacing: var(--v19b-letter-spacing-title);
    line-height: var(--v19b-line-height-title);
  }

  .v20-focus-stepper {
    display: flex;
    gap: var(--v19b-size-6);
  }

  .v20-focus-stepper button {
    display: inline-flex;
    width: var(--v19b-size-40);
    height: var(--v19b-size-40);
    align-items: center;
    justify-content: center;
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-color-text-strong);
    background: var(--v19b-color-control);
    cursor: pointer;
  }

  .v20-focus-stepper button:disabled {
    color: var(--v19b-color-text-faint);
    cursor: default;
  }

  .v20-focus-stepper svg {
    width: var(--v19b-size-18);
    height: var(--v19b-size-18);
  }

  .v20-focus-remark {
    display: grid;
    grid-template-columns: auto minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    align-items: start;
    gap: var(--v19b-size-12);
    padding-block: var(--v19b-size-16);
    border-block: var(--v19b-size-1) solid var(--v19b-color-border);
    color: var(--v19b-dot-warning);
  }

  .v20-focus-remark svg {
    width: var(--v19b-size-20);
    height: var(--v19b-size-20);
  }

  .v20-focus-remark p,
  .v20-focus-target p {
    margin: var(--v19b-size-0);
    font-size: var(--v19b-size-16);
    line-height: var(--v19b-line-height-row);
  }

  .v20-focus-remark p {
    color: var(--v19b-dot-warning);
  }

  .v20-focus-target {
    display: grid;
    gap: var(--v19b-size-8);
  }

  .v20-focus-target > span {
    color: var(--v19b-color-text-muted);
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
  }

  .v20-focus-target strong {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-18);
  }

  .v20-focus-target p {
    color: var(--v19b-color-text-muted);
  }

  .v20-focus-target-control {
    display: flex;
    min-height: var(--v19b-size-64);
    align-items: center;
    justify-content: space-between;
    gap: var(--v19b-size-16);
    padding-inline: var(--v19b-size-16);
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-control);
    background: var(--v19b-color-control);
  }

  .v20-focus-target-control span {
    display: flex;
    align-items: center;
    gap: var(--v19b-size-10);
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-16);
    font-weight: var(--v19b-weight-control);
  }

  .v20-focus-target-control svg {
    width: var(--v19b-size-20);
    height: var(--v19b-size-20);
    color: var(--v19b-dot-warning);
  }

  .v20-focus-target-control em {
    color: var(--v19b-dot-warning);
    font-size: var(--v19b-size-13);
    font-style: normal;
  }

  .v20-focus-primary {
    width: fit-content;
    min-height: var(--v19b-size-64);
    padding-inline: var(--v19b-size-24);
    border: var(--v19b-size-1) solid var(--v19b-color-primary-deep-border);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-color-primary-text);
    background: var(--v19b-color-primary);
    font: inherit;
    font-size: var(--v19b-size-16);
    font-weight: var(--v19b-weight-control);
    cursor: pointer;
  }

  .v20-focus-primary:disabled {
    opacity: var(--v19b-opacity-disabled);
    cursor: default;
  }

  .v20-focus-error {
    margin: calc(var(--v19b-size-16) * -1) var(--v19b-size-0) var(--v19b-size-0);
    color: var(--v19b-dot-danger);
    font-size: var(--v19b-size-13);
    line-height: var(--v19b-line-height-row);
  }

  .v20-focus-context {
    display: grid;
    grid-template-columns: repeat(3, minmax(var(--v19b-size-0), var(--v19b-grid-fr)));
    gap: var(--v19b-size-16);
    margin-top: auto;
    min-height: calc(var(--v19b-size-64) + var(--v19b-size-24));
    align-items: center;
    padding: var(--v19b-size-24) var(--v19b-size-32);
    border-top: var(--v19b-size-1) solid var(--v19b-color-border);
    color: var(--v19b-color-text-muted);
    font-size: var(--v19b-size-14);
  }

  .v20-focus-context span {
    display: flex;
    min-width: var(--v19b-size-0);
    align-items: center;
    gap: var(--v19b-size-8);
  }

  .v20-focus-context svg {
    width: var(--v19b-size-18);
    height: var(--v19b-size-18);
    flex: none;
  }

  .v20-footer {
    min-height: calc(var(--v19b-size-76) + var(--v19b-size-24));
    padding: var(--v19b-size-20) var(--v19b-size-24);
    background: var(--v19b-color-page);
  }

  @media (max-width: 760px) {
    .v20-drawer-topbar {
      grid-template-columns: auto minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
      min-height: var(--v19b-size-64);
      gap: var(--v19b-size-8);
      padding-inline: var(--v19b-size-12);
    }

    .v20-header-actions {
      gap: var(--v19b-size-4);
    }

    .v20-sections-trigger {
      width: var(--v19b-size-40);
      justify-content: center;
      padding-inline: var(--v19b-size-0);
    }

    .v20-sections-trigger span,
    .v20-header-actions .v20-status-pill {
      display: none;
    }

    .v20-sections-popover {
      right: var(--v19b-size-0);
    }

    .v20-focus-progress {
      padding: var(--v19b-size-20) var(--v19b-size-20) var(--v19b-size-10);
    }

    .v20-focus-progressbar {
      width: calc(var(--v19b-size-full) - var(--v19b-size-40));
      margin-inline: var(--v19b-size-20);
    }

    .v20-focus-workspace {
      gap: var(--v19b-size-20);
      padding: var(--v19b-size-28) var(--v19b-size-20) var(--v19b-size-32);
    }

    .v20-focus-title {
      font-size: var(--v19b-size-28);
    }

    .v20-focus-context {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
      gap: var(--v19b-size-10);
      padding: var(--v19b-size-16) var(--v19b-size-20);
    }

    .v20-footer {
      min-height: auto;
    }
  }

  @media (max-width: 460px) {
    .v20-focus-heading-row {
      align-items: stretch;
      flex-direction: column;
    }

    .v20-focus-stepper {
      align-self: flex-end;
    }

    .v20-focus-primary {
      width: var(--v19b-size-full);
    }
  }

  /* Premium Dark-First Drawer convergence. The questionnaire component below
     keeps its existing internal layout; these rules own the shared shell and
     the overview/files/issues/history presentation only. */
  .v20-drawer-overlay {
    background: var(--v19b-admin-drawer-backdrop);
    backdrop-filter: blur(var(--v19b-size-4));
  }

  .v20-submission-drawer {
    inset: var(--v19b-size-8) var(--v19b-size-8) var(--v19b-size-8) auto;
    width: min(calc(var(--v19b-size-full) - var(--v19b-size-16)), var(--v19b-size-840));
    height: auto;
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-panel);
    color: var(--v19b-color-text);
    background: var(--v19b-color-app);
    box-shadow: var(--v19b-shadow-panel);
    outline: none !important;
  }

  .v20-drawer-topbar {
    grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
    min-height: var(--v19b-size-120);
    gap: var(--v19b-size-24);
    padding: var(--v19b-size-24) var(--v19b-size-32) var(--v19b-size-18);
    border-bottom: var(--v19b-size-0);
    background: var(--v19b-color-panel);
  }

  .v20-title-wrap {
    gap: var(--v19b-size-10);
  }

  .v20-subtitle {
    gap: var(--v19b-size-8);
    color: var(--v19b-color-text-muted);
    font-size: var(--v19b-size-11);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-meta);
    text-transform: uppercase;
  }

  .v20-title {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-28);
    font-weight: var(--v19b-weight-title);
    line-height: var(--v19b-line-height-title);
    letter-spacing: var(--v19b-letter-spacing-title);
  }

  .v20-drawer-title-line {
    align-items: center;
    gap: var(--v19b-size-12);
  }

  .v20-status-pill {
    min-height: var(--v19b-size-28);
    border-color: var(--v19b-color-border-strong);
    color: var(--v19b-color-text-muted);
    background: var(--v19b-color-control);
    font-size: var(--v19b-size-10);
    letter-spacing: var(--v19b-letter-spacing-meta);
  }

  .v20-status-pill.is-warning {
    border-color: var(--vf-warning-border);
    color: var(--vf-warning);
    background: var(--vf-warning-soft);
  }

  .v20-icon-button.is-close {
    width: var(--v19b-size-44);
    height: var(--v19b-size-44);
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-color-text-muted);
    background: var(--v19b-color-control);
  }

  .v20-icon-button.is-close:hover {
    color: var(--v19b-color-text-strong);
    background: var(--v19b-color-control-hover);
  }

  .v20-tabbar-wrap {
    min-height: var(--v19b-size-48);
    padding: var(--v19b-size-0) var(--v19b-size-32);
    border-bottom: var(--v19b-size-1) solid var(--v19b-color-border);
    background: var(--v19b-color-panel);
  }

  .v20-tabbar {
    gap: var(--v19b-size-4);
    padding: var(--v19b-size-0);
  }

  .v20-tab-button {
    position: relative;
    min-height: var(--v19b-size-48);
    gap: var(--v19b-size-8);
    padding: var(--v19b-size-0) var(--v19b-size-14);
    border: var(--v19b-size-0);
    border-radius: var(--v19b-radius-control) var(--v19b-radius-control)
      var(--v19b-size-0) var(--v19b-size-0);
    color: var(--v19b-color-text-muted);
    background: transparent;
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
  }

  .v20-tab-button::after {
    position: absolute;
    right: var(--v19b-size-12);
    bottom: calc(var(--v19b-size-1) * -1);
    left: var(--v19b-size-12);
    height: var(--v19b-size-2);
    border-radius: var(--v19b-radius-pill);
    background: transparent;
    content: "";
  }

  .v20-tab-button:hover:not(.is-active) {
    color: var(--v19b-color-text-strong);
    background: var(--v19b-color-control);
  }

  .v20-tab-button.is-active {
    color: var(--vf-warning);
    background: var(--vf-warning-soft);
  }

  .v20-tab-button.is-active::after {
    background: var(--vf-warning) !important;
  }

  .v20-tab-button:focus-visible {
    outline: var(--v19b-size-2) solid var(--vf-warning-border) !important;
    outline-offset: calc(var(--v19b-size-2) * -1) !important;
  }

  .v20-tab-icon {
    display: none;
  }

  .v20-tab-count {
    min-width: var(--v19b-size-20);
    min-height: var(--v19b-size-20);
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-pill);
    color: var(--v19b-color-text-muted);
    background: var(--v19b-color-control);
    font-size: var(--v19b-size-10);
  }

  .v20-tab-button.is-warning .v20-tab-count {
    border-color: var(--vf-warning-border);
    color: var(--vf-warning);
    background: var(--vf-warning-soft);
  }

  .v20-tabbar-more {
    display: none;
  }

  .v20-drawer-body {
    padding: var(--v19b-size-28) var(--v19b-size-32) var(--v19b-size-32);
    background: var(--v19b-color-app);
  }

  .v20-drawer-body > [role="tabpanel"]:not([aria-labelledby$="questionnaire"]) {
    min-height: var(--v19b-size-full);
  }

  .v20-drawer-body > [aria-labelledby="v20-submission-drawer-tab-overview"]
    > .v20-section-stack
    > .v20-stat-grid {
    display: none;
  }

  .v20-drawer-body > [aria-labelledby="v20-submission-drawer-tab-issues"]
    .v20-stat-grid {
    display: none;
  }

  .v20-drawer-body > [role="tabpanel"]:not([aria-labelledby$="questionnaire"])
    :is(.v20-card, .v20-stat-card, .v20-file-section, .v20-issue-card, .v20-history-item) {
    border-color: var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-color-panel);
    box-shadow: var(--v19b-shadow-row-inner);
  }

  .v20-drawer-body > [role="tabpanel"]:not([aria-labelledby$="questionnaire"])
    :is(.v20-section-label, .v20-info-title, .v20-family-title, .v20-file-section-title, .v20-issue-title, .v20-history-title) {
    color: var(--v19b-color-text-strong);
  }

  .v20-drawer-body > [role="tabpanel"]:not([aria-labelledby$="questionnaire"])
    :is(.v20-file-action, .v20-issue-button:not(.is-ghost)) {
    border-color: var(--vf-warning-border);
    color: var(--vf-warning);
    background: var(--v19b-color-control);
    box-shadow: none;
  }

  .v20-drawer-body > [role="tabpanel"]:not([aria-labelledby$="questionnaire"])
    :is(.v20-file-action, .v20-issue-button:not(.is-ghost)):hover:not(:disabled) {
    border-color: var(--vf-warning);
    color: var(--v19b-color-text-strong);
    background: var(--v19b-color-control-hover);
  }

  .v20-stat-grid {
    gap: var(--v19b-size-10);
  }

  .v20-stat-card {
    min-height: var(--v19b-size-88);
    padding: var(--v19b-size-16);
  }

  .v20-stat-card::before {
    background: var(--v19b-color-border-strong);
  }

  .v20-stat-card:has(.v20-stat-icon.is-warning)::before {
    background: var(--vf-warning);
  }

  .v20-two-col {
    gap: var(--v19b-size-12);
  }

  .v20-footer {
    min-height: var(--v19b-size-88);
    padding: var(--v19b-size-16) var(--v19b-size-32);
    border-top: var(--v19b-size-1) solid var(--v19b-color-border);
    background: var(--v19b-color-panel);
  }

  .v20-action-button {
    min-height: var(--v19b-size-44);
    border-radius: var(--v19b-radius-control);
  }

  .v20-action-button.is-warning {
    border-color: var(--vf-warning-border);
    color: var(--v19b-color-app);
    background: var(--vf-warning);
  }

  .v20-action-button:disabled {
    border-color: var(--v19b-color-border-strong);
    color: var(--v19b-color-text-faint);
    background: var(--v19b-color-control);
  }

  @media (max-width: 1023px) {
    .v20-submission-drawer {
      inset: var(--v19b-size-0);
      width: var(--v19b-size-full);
      height: 100dvh;
      border: var(--v19b-size-0);
      border-radius: var(--v19b-size-0);
    }

    .v20-drawer-topbar {
      position: relative;
      min-height: var(--v19b-size-88);
      padding: var(--v19b-size-16) var(--v19b-size-64) var(--v19b-size-12)
        var(--v19b-size-20);
    }

    .v20-icon-button.is-close {
      position: absolute;
      top: var(--v19b-size-16);
      right: var(--v19b-size-16);
      display: grid !important;
    }

    .v20-title {
      font-size: var(--v19b-size-20);
    }

    .v20-drawer-title-line {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--v19b-size-6);
    }

    .v20-tabbar-wrap {
      min-height: var(--v19b-size-48);
      padding-inline: var(--v19b-size-16);
      overflow: hidden;
    }

    .v20-tabbar {
      display: flex;
      gap: var(--v19b-size-2);
      overflow-x: auto;
      scrollbar-width: none;
    }

    .v20-tabbar::-webkit-scrollbar {
      display: none;
    }

    .v20-tabbar .v20-tab-button.is-mobile-secondary {
      display: inline-flex;
    }

    .v20-tab-button {
      flex: var(--v19b-size-0) var(--v19b-size-0) auto;
      min-height: var(--v19b-size-48);
      gap: var(--v19b-size-4);
      padding-inline: var(--v19b-size-8);
      font-size: var(--v19b-size-11);
    }

    .v20-drawer-body {
      padding: var(--v19b-size-20) var(--v19b-size-16) var(--v19b-size-24);
    }

    .v20-footer {
      min-height: auto;
      padding: var(--v19b-size-12) var(--v19b-size-16)
        max(var(--v19b-size-12), env(safe-area-inset-bottom));
    }

    .v20-footer-note:not(.is-error) {
      display: none;
    }

    .v20-footer-actions {
      display: grid;
      width: var(--v19b-size-full);
      grid-template-columns: var(--v19b-size-96) minmax(
          var(--v19b-size-0),
          var(--v19b-grid-fr)
        );
      gap: var(--v19b-size-8);
    }
  }

  /* Screenshot-locked central Drawer shell. Overview and Issues follow the
     selected reference; Questionnaire keeps the existing demo component. */
  @media (min-width: 1024px) {
    .v20-submission-drawer {
      inset: var(--v19b-size-24);
      width: min(calc(var(--v19b-size-full) - var(--v19b-size-48)), var(--v19b-size-1140));
      height: calc(100dvh - var(--v19b-size-48));
      margin: auto;
      border-radius: var(--v19b-radius-panel);
      background: var(--v19b-admin-drawer-bg);
      box-shadow: var(--v19b-admin-drawer-shadow);
    }

    .v20-drawer-topbar {
      min-height: var(--v19b-size-160);
      padding: var(--v19b-size-28) var(--v19b-size-44) var(--v19b-size-20);
      background: var(--v19b-admin-drawer-bg);
    }

    .v20-tabbar-wrap {
      min-height: var(--v19b-size-56);
      padding-inline: var(--v19b-size-44);
      background: var(--v19b-admin-drawer-bg);
    }

    .v20-tab-button {
      min-height: var(--v19b-size-56);
      padding-inline: var(--v19b-size-20);
    }

    .v20-drawer-body {
      padding: var(--v19b-size-40) var(--v19b-size-44) var(--v19b-size-32);
    }

    .v20-footer {
      padding-inline: var(--v19b-size-44);
    }
  }

  .v20-title-wrap {
    justify-content: center;
  }

  .v20-subtitle {
    font-family: var(--v19-font-family);
  }

  .v20-status-row,
  .v20-updated-at {
    display: flex;
    align-items: center;
  }

  .v20-status-row {
    flex-wrap: wrap;
    gap: var(--v19b-size-12);
  }

  .v20-status-pill {
    gap: var(--v19b-size-6);
  }

  .v20-status-pill svg,
  .v20-updated-at svg {
    width: var(--v19b-size-14);
    height: var(--v19b-size-14);
  }

  .v20-status-pill.is-warning::before {
    display: none;
  }

  .v20-updated-at {
    gap: var(--v19b-size-6);
    color: var(--v19b-color-text-faint);
    font-size: var(--v19b-size-12);
  }

  .v20-tab-button.is-active {
    color: var(--v19b-color-text-strong);
    background: transparent;
  }

  .v20-tab-button.is-active::after {
    background: var(--v19b-admin-drawer-text-70) !important;
  }

  .v20-drawer-body {
    background: var(--v19b-admin-drawer-bg);
  }

  .v20-section-stack {
    gap: var(--v19b-size-28);
  }

  .v20-two-col {
    grid-template-columns: repeat(2, minmax(var(--v19b-size-0), var(--v19b-grid-fr)));
    gap: var(--v19b-size-20);
  }

  .v20-info-card {
    min-height: var(--v19b-size-200);
    padding: var(--v19b-size-28);
    border-color: var(--v19b-admin-drawer-border-faint) !important;
    background: var(--v19b-admin-drawer-surface) !important;
  }

  .v20-info-title,
  .v20-section-label {
    color: var(--v19b-color-text-40) !important;
    font-size: var(--v19b-size-11);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-meta);
    text-transform: uppercase;
  }

  .v20-info-list,
  .v20-package-list {
    gap: var(--v19b-size-16);
  }

  .v20-info-main {
    font-size: var(--v19b-size-16);
  }

  .v20-applicant-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(var(--v19b-size-0), var(--v19b-grid-fr)));
    gap: var(--v19b-size-12);
  }

  .v20-applicant-card {
    display: grid;
    min-width: var(--v19b-size-0);
    min-height: var(--v19b-size-88);
    grid-template-columns: auto minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
    align-items: center;
    gap: var(--v19b-size-14);
    padding: var(--v19b-size-14) var(--v19b-size-16);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-admin-drawer-surface);
  }

  .v20-applicant-copy {
    display: grid;
    min-width: var(--v19b-size-0);
    gap: var(--v19b-size-4);
  }

  .v20-applicant-copy strong,
  .v20-applicant-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-applicant-copy strong {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-14);
    font-weight: var(--v19b-weight-control);
  }

  .v20-applicant-copy small {
    color: var(--v19b-color-text-faint);
    font-size: var(--v19b-size-11);
  }

  .v20-applicant-progress {
    color: var(--v19b-admin-drawer-green-text);
    font-family: var(--v19-font-family);
    font-size: var(--v19b-size-12);
    font-weight: var(--v19b-weight-control);
  }

  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-summary-head {
    display: grid;
    grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
    align-items: center;
    gap: var(--v19b-size-12);
    padding: var(--v19b-size-20);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-admin-drawer-surface);
  }

  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-summary-copy {
    min-width: var(--v19b-size-0);
  }

  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-summary-title,
  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-summary-helper {
    margin: var(--v19b-size-0);
  }

  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-summary-title {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-16);
    font-weight: var(--v19b-weight-title);
  }

  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-summary-helper {
    margin-top: var(--v19b-size-4);
    color: var(--v19b-color-text-faint);
    font-size: var(--v19b-size-12);
  }

  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-open-button {
    display: inline-flex;
    min-height: var(--v19b-size-44);
    align-items: center;
    justify-content: center;
    gap: var(--v19b-size-8);
    padding-inline: var(--v19b-size-14);
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-color-text-strong);
    background: var(--v19b-color-control);
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
    cursor: pointer;
  }

  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-open-icon {
    width: var(--v19b-size-16);
    height: var(--v19b-size-16);
  }

  .v20-issues-screen {
    gap: var(--v19b-size-32);
  }

  .v20-issues-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--v19b-size-24);
    padding-bottom: var(--v19b-size-24);
    border-bottom: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
  }

  .v20-issues-heading h3,
  .v20-issues-heading p {
    margin: var(--v19b-size-0);
  }

  .v20-issues-heading h3 {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-18);
    font-weight: var(--v19b-weight-title);
  }

  .v20-issues-heading p {
    margin-top: var(--v19b-size-6);
    color: var(--v19b-color-text-faint);
    font-size: var(--v19b-size-12);
  }

  .v20-issues-heading strong {
    flex: none;
    padding: var(--v19b-size-8) var(--v19b-size-14);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-orange-border);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-admin-drawer-orange-text) !important;
    background: var(--v19b-admin-drawer-orange-bg);
    font-size: var(--v19b-size-12);
    font-weight: var(--v19b-weight-control);
  }

  .v20-issue-list {
    gap: var(--v19b-size-20);
  }

  .v20-issue-card {
    min-height: var(--v19b-size-136);
    grid-template-columns: auto minmax(var(--v19b-size-0), var(--v19b-grid-fr)) var(--v19b-size-240);
    gap: var(--v19b-size-20);
    padding: var(--v19b-size-20);
    border-color: var(--v19b-admin-drawer-orange-border) !important;
    border-left: var(--v19b-size-4) solid var(--v19b-admin-drawer-orange-text) !important;
    background: var(--v19b-admin-drawer-surface) !important;
  }

  .v20-issue-title-row {
    justify-content: flex-start;
  }

  .v20-issue-target {
    color: var(--v19b-admin-drawer-orange-text) !important;
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-meta);
    text-transform: uppercase;
  }

  .v20-issue-badge {
    min-height: var(--v19b-size-24);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-admin-drawer-orange-text) !important;
    background: var(--v19b-admin-drawer-orange-bg);
  }

  .v20-issue-actions {
    align-self: center;
  }

  .v20-issue-button {
    width: var(--v19b-size-full);
    min-height: var(--v19b-size-52);
  }

  .v20-footer {
    background: var(--v19b-admin-drawer-bg);
  }

  .v20-footer-note {
    color: var(--v19b-color-text-faint);
  }

  .v20-action-button.is-ghost {
    border-color: transparent;
    background: transparent;
  }

  .v20-action-button.is-warning {
    min-width: var(--v19b-size-320);
    gap: var(--v19b-size-8);
    border-color: var(--v19b-admin-drawer-orange-text);
    color: var(--v19b-color-text-strong);
    background: var(--v19b-admin-drawer-orange-text);
    box-shadow: var(--v19b-admin-drawer-primary-shadow);
  }

  .v20-action-button.is-warning svg {
    width: var(--v19b-size-16);
    height: var(--v19b-size-16);
  }

  .v20-action-button.is-warning:disabled {
    border-color: var(--v19b-admin-drawer-orange-border);
    color: var(--v19b-color-text-strong);
    background: var(--v19b-admin-drawer-orange-text);
    opacity: var(--v19b-opacity-disabled);
  }

  .v20-icon-button.is-close {
    width: var(--v19b-size-52);
    height: var(--v19b-size-52);
  }

  @media (min-width: 1024px) {
    .v20-title {
      font-size: var(--v19b-size-32);
    }
  }

  @media (max-width: 1023px) {
    .v20-drawer-topbar {
      min-height: var(--v19b-size-88);
      padding: var(--v19b-size-8) var(--v19b-size-56) var(--v19b-size-8)
        var(--v19b-size-16);
    }

    .v20-title-wrap {
      display: grid;
      min-width: var(--v19b-size-0);
      gap: var(--v19b-size-4);
    }

    .v20-subtitle {
      margin-top: var(--v19b-size-0);
      font-size: var(--v19b-size-10);
    }

    .v20-title {
      font-size: var(--v19b-size-18);
    }

    .v20-status-row {
      min-width: var(--v19b-size-0);
      gap: var(--v19b-size-6);
    }

    .v20-subtitle {
      display: block;
      min-width: var(--v19b-size-0);
      overflow: visible;
      overflow-wrap: anywhere;
      text-overflow: clip;
      white-space: normal;
    }

    .v20-status-pill {
      min-height: var(--v19b-size-24);
      font-size: var(--v19b-size-10);
    }

    .v20-updated-at {
      display: none;
    }

    .v20-icon-button.is-close {
      top: var(--v19b-size-8);
      right: var(--v19b-size-16);
      width: var(--v19b-size-44);
      height: var(--v19b-size-44);
    }

    .v20-two-col,
    .v20-applicant-grid {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    }

    .v20-info-card {
      min-height: auto;
      padding: var(--v19b-size-20);
    }

    .v20-drawer-body [aria-labelledby$="questionnaire"]
      .v19-drawer-questionnaire-summary-head {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
      align-items: stretch;
      gap: var(--v19b-size-10);
    }

    .v20-drawer-body [aria-labelledby$="questionnaire"]
      .v19-drawer-questionnaire-open-button {
      width: var(--v19b-size-full);
    }

    .v20-issues-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--v19b-size-14);
    }

    .v20-issue-card {
      grid-template-columns: auto minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    }

    .v20-issue-actions {
      grid-column: 1 / -1;
    }

    .v20-action-button.is-warning {
      min-width: var(--v19b-size-0);
    }

    .v20-footer {
      flex: 0 0 auto;
    }

    .v20-footer-actions,
    .v20-action-button {
      min-width: var(--v19b-size-0);
    }

    .v20-tabbar-wrap {
      position: relative;
      z-index: var(--v19b-z-overlay);
      display: flex;
      min-width: var(--v19b-size-0);
      align-items: center;
      gap: var(--v19b-size-8);
      overflow: visible;
    }

    .v20-tabbar {
      min-width: var(--v19b-size-0);
      flex: 1 1 auto;
      overflow: visible;
    }

    .v20-tabbar .v20-tab-button.is-mobile-secondary {
      display: none;
    }

    .v20-tabbar-more {
      position: relative;
      z-index: calc(var(--v19b-z-overlay) + 1);
      display: block;
      flex: none;
    }

    .v20-tabbar-more-trigger,
    .v20-tabbar-more-menu button {
      min-height: var(--v19b-size-40);
      border: var(--v19b-size-0);
      border-radius: var(--v20-radius-md);
      color: var(--v20-muted);
      background: transparent;
      font: inherit;
      font-size: var(--v19b-size-13);
      font-weight: var(--v19b-weight-control);
      cursor: pointer;
    }

    .v20-tabbar-more-trigger {
      padding-inline: var(--v19b-size-12);
    }

    .v20-tabbar-more-menu {
      position: absolute;
      z-index: calc(var(--v19b-z-overlay) + 2);
      top: calc(var(--v19b-size-40) + var(--v19b-size-8));
      right: var(--v19b-size-0);
      display: grid;
      width: max-content;
      gap: var(--v19b-size-2);
      padding: var(--v19b-size-4);
      border: var(--v19b-size-1) solid var(--v20-border-strong);
      border-radius: var(--v20-radius-md);
      background: var(--v20-card-bg-strong);
      box-shadow: var(--v19b-shadow-panel);
    }

    .v20-tabbar-more-menu button {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: var(--v19b-size-16);
      padding-inline: var(--v19b-size-12);
      text-align: left;
    }

    .v20-tabbar-more-menu .v20-tab-count {
      margin-left: auto;
    }

    .v20-drawer-body {
      position: relative;
      z-index: var(--v19b-size-0);
    }
  }

  /* Stable semantic ownership for the demo questionnaire preview. The source
     utility classes remain for parity, while these rules guarantee the same
     composition in every V-19 build and viewport. */
  .v20-questionnaire-tab {
    display: grid;
    gap: var(--v19b-size-24);
  }

  .v20-questionnaire-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(var(--v19b-size-0), var(--v19b-grid-fr)));
    gap: var(--v19b-size-12);
  }

  .v20-questionnaire-section-card {
    display: flex;
    min-width: var(--v19b-size-0);
    min-height: var(--v19b-size-76);
    align-items: center;
    gap: var(--v19b-size-16);
    padding: var(--v19b-size-16);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-admin-drawer-surface);
    cursor: pointer;
    transition:
      border-color var(--v19b-motion-fast),
      background var(--v19b-motion-fast);
  }

  .v20-questionnaire-section-card:hover {
    border-color: var(--v19b-color-border-strong);
    background: var(--v19b-color-control-hover);
  }

  .v20-questionnaire-section-card:focus-visible {
    outline: none;
    box-shadow: var(--v19b-focus-ring);
  }

  .v20-questionnaire-section-copy {
    min-width: var(--v19b-size-0);
  }

  .v20-questionnaire-section-card .v19-drawer-questionnaire-section-head {
    display: grid;
    min-width: var(--v19b-size-0);
    grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
    align-items: baseline;
    gap: var(--v19b-size-8);
  }

  .v20-questionnaire-section-card .v19-drawer-questionnaire-section-title {
    min-width: var(--v19b-size-0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v20-questionnaire-section-card .v19-drawer-questionnaire-section-percent {
    white-space: nowrap;
  }

  @media (min-width: 640px) and (max-width: 1023px) {
    .v20-drawer-topbar {
      padding-inline: var(--v19b-size-24) var(--v19b-size-64);
    }

    .v20-title-wrap {
      justify-content: start;
    }

    .v20-tabbar-wrap,
    .v20-drawer-body,
    .v20-footer {
      padding-inline: var(--v19b-size-24);
    }

    .v20-two-col,
    .v20-applicant-grid {
      grid-template-columns: repeat(2, minmax(var(--v19b-size-0), var(--v19b-grid-fr)));
    }

    .v20-drawer-body [aria-labelledby$="questionnaire"]
      .v19-drawer-questionnaire-summary-head {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
      align-items: center;
    }

    .v20-drawer-body [aria-labelledby$="questionnaire"]
      .v19-drawer-questionnaire-open-button {
      width: auto;
    }

    .v20-footer-actions {
      grid-template-columns: auto var(--v19b-size-320);
      justify-content: end;
    }
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    .v20-issue-card {
      grid-template-columns: auto minmax(var(--v19b-size-0), var(--v19b-grid-fr))
        var(--v19b-size-240);
    }

    .v20-issue-actions {
      grid-column: auto;
    }
  }

  @media (max-width: 639px) {
    .v20-questionnaire-preview-grid {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    }

    .v20-questionnaire-section-card {
      gap: var(--v19b-size-12);
      padding: var(--v19b-size-14);
    }
  }

  @media (max-width: 360px) {
    .v20-footer-actions {
      grid-template-columns: var(--v19b-size-80) minmax(
          var(--v19b-size-0),
          var(--v19b-grid-fr)
        );
    }

    .v20-action-button {
      padding-inline: var(--v19b-size-8);
    }

    .v20-action-button.is-warning {
      gap: var(--v19b-size-6);
      padding-inline: var(--v19b-size-12);
      white-space: nowrap;
    }

    .v20-questionnaire-section-card .v19-drawer-questionnaire-section-title {
      overflow: visible;
      line-height: var(--v19b-line-height-row);
      text-overflow: clip;
      white-space: normal;
    }
  }

  @media (max-width: 460px) {
    .v20-footer-actions {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    }

    .v20-action-button {
      width: var(--v19b-size-full);
    }
  }

  /* Premium Drawer source transfer: final mounted operational owner. */
  .v20-submission-drawer {
    inset: var(--v19b-size-8) var(--v19b-size-8) var(--v19b-size-8) auto;
    width: min(var(--v19b-drawer-agent-width), calc(var(--v19b-viewport-width) - var(--v19b-size-16)));
    height: auto;
    max-height: none;
    overflow: hidden;
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border);
    border-radius: var(--v19b-radius-panel);
    background: var(--v19b-admin-drawer-bg);
    box-shadow: var(--v19b-admin-drawer-shadow);
    font-family: var(--v19-font-family);
  }

  .v20-drawer-topbar {
    display: grid;
    grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
    min-height: var(--v19b-size-0);
    flex: none;
    align-items: flex-start;
    gap: var(--v19b-size-16);
    padding: var(--v19b-size-16) var(--v19b-size-32) var(--v19b-size-20);
    border-bottom: var(--v19b-size-0);
    background: var(--v19b-admin-drawer-bg);
  }

  .v20-title-wrap {
    display: grid;
    min-width: var(--v19b-size-0);
    gap: var(--v19b-size-8);
  }

  .v20-subtitle,
  .v20-title,
  .v20-applicant-card :is(strong, small),
  .v20-questionnaire-section-card .v19-drawer-questionnaire-section-title,
  .v20-file-title,
  .v20-file-meta {
    min-width: var(--v19b-size-0);
    overflow: visible;
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: normal;
  }

  .v20-subtitle {
    margin: var(--v19b-size-0);
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-11);
    letter-spacing: var(--v19b-letter-spacing-wide);
    text-transform: uppercase;
  }

  .v20-title {
    margin: var(--v19b-size-0);
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-24);
    font-weight: var(--v19b-weight-title);
    line-height: var(--v19b-line-height-title);
    letter-spacing: var(--v19b-letter-spacing-tight);
  }

  .v20-status-row {
    display: flex;
    min-width: var(--v19b-size-0);
    flex-wrap: wrap;
    align-items: center;
    gap: var(--v19b-size-10);
  }

  .v20-icon-button.is-close {
    position: static;
    display: inline-flex;
    width: var(--v19b-size-40);
    height: var(--v19b-size-40);
    min-width: var(--v19b-size-40);
    min-height: var(--v19b-size-40);
    flex: none;
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-control);
    background: var(--v19b-admin-drawer-control-bg);
    color: var(--v19b-admin-drawer-text-70);
  }

  .v20-tabbar-wrap {
    position: relative;
    z-index: var(--v19b-z-sticky);
    display: block;
    min-width: var(--v19b-size-0);
    flex: none;
    overflow-x: auto;
    padding-inline: var(--v19b-size-32);
    border-bottom: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    background: var(--v19b-admin-drawer-bg);
  }

  .v20-tabbar {
    display: flex;
    width: max-content;
    min-width: var(--v19b-size-full);
    align-items: center;
    gap: var(--v19b-size-2);
    overflow: visible;
  }

  .v20-tabbar .v20-tab-button,
  .v20-tabbar .v20-tab-button.is-mobile-secondary {
    position: relative;
    display: inline-flex;
    min-height: var(--v19b-size-44);
    flex: none;
    align-items: center;
    gap: var(--v19b-size-8);
    padding-inline: var(--v19b-size-14);
    border: var(--v19b-size-0);
    border-radius: var(--v19b-size-0);
    background: transparent;
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-13);
    font-weight: var(--v19b-weight-control);
    white-space: nowrap;
  }

  .v20-tabbar .v20-tab-button::after {
    display: none;
    content: none;
  }

  .v20-tabbar .v20-tab-button:is(:hover, :focus-visible, .is-active) {
    color: var(--v19b-color-text-strong);
    background: transparent;
  }

  .v20-tabbar .v20-tab-button.is-active::after {
    background: transparent;
  }

  .v20-tab-indicator {
    position: absolute;
    right: var(--v19b-size-0);
    bottom: var(--v19b-size-0);
    left: var(--v19b-size-0);
    height: var(--v19b-size-2);
    border-radius: var(--v19b-radius-pill);
    background: var(--v19b-color-primary);
    pointer-events: none;
  }

  .v20-tab-count {
    min-width: var(--v19b-size-20);
    min-height: var(--v19b-size-20);
    padding-inline: var(--v19b-size-6);
    border: var(--v19b-size-0);
    border-radius: calc(var(--v19b-radius-control) - var(--v19b-size-2));
    background: var(--v19b-admin-drawer-control-bg);
    color: var(--v19b-admin-drawer-text-70);
  }

  .v20-tabbar-more {
    display: none;
  }

  .v20-drawer-body {
    min-height: var(--v19b-size-0);
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--v19b-size-20) var(--v19b-size-32);
    background: var(--v19b-admin-drawer-bg);
  }

  .v20-next-action {
    display: grid;
    min-width: var(--v19b-size-0);
    grid-template-columns: var(--v19b-size-40) minmax(var(--v19b-size-0), var(--v19b-grid-fr)) auto;
    align-items: center;
    gap: var(--v19b-size-16);
    padding: var(--v19b-size-16);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-left: var(--v19b-size-3) solid var(--v19b-color-primary);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-admin-drawer-surface);
  }

  .v20-next-action.is-warning {
    border-left-color: var(--v19b-admin-drawer-orange-text);
  }

  .v20-next-action-mark {
    display: grid;
    width: var(--v19b-size-40);
    height: var(--v19b-size-40);
    place-items: center;
    border-radius: var(--v19b-radius-control);
    background: var(--v19b-admin-drawer-blue-bg);
    color: var(--v19b-admin-drawer-blue-text);
  }

  .v20-next-action.is-warning .v20-next-action-mark {
    background: var(--v19b-admin-drawer-orange-bg);
    color: var(--v19b-admin-drawer-orange-text) !important;
  }

  .v20-next-action-mark svg {
    width: var(--v19b-size-18);
    height: var(--v19b-size-18);
  }

  .v20-next-action-copy {
    display: grid;
    min-width: var(--v19b-size-0);
    gap: var(--v19b-size-3);
  }

  .v20-next-action-copy small {
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-10);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-wide);
    text-transform: uppercase;
  }

  .v20-next-action-copy h3 {
    margin: var(--v19b-size-0);
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-15);
    font-weight: var(--v19b-weight-title);
  }

  .v20-next-action-copy > span {
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-12);
    line-height: var(--v19b-line-height-row);
  }

  .v20-next-action > button {
    min-height: var(--v19b-size-40);
    padding-inline: var(--v19b-size-14);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-control);
    background: var(--v19b-admin-drawer-control-bg);
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-12);
    font-weight: var(--v19b-weight-control);
    white-space: nowrap;
  }

  .v20-next-action > button:is(:hover, :focus-visible) {
    border-color: var(--v19b-color-border-selected);
    background: var(--v19b-color-control-hover);
    outline: none;
  }

  .v20-two-col,
  .v20-applicant-grid {
    gap: var(--v19b-size-12);
  }

  .v20-info-card,
  .v20-applicant-card {
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-admin-drawer-surface);
  }

  .v20-overview-tab {
    gap: var(--v19b-size-24);
  }

  .v20-overview-tab .v20-two-col {
    gap: var(--v19b-size-16);
  }

  .v20-overview-tab .v20-info-card {
    min-height: var(--v19b-size-160);
    padding: var(--v19b-size-20);
  }

  .v20-overview-tab .v20-applicant-card {
    min-height: var(--v19b-size-64);
    gap: var(--v19b-size-12);
    padding: var(--v19b-size-12);
  }

  .v20-applicants-heading {
    display: flex;
    min-width: var(--v19b-size-0);
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--v19b-size-16);
  }

  .v20-applicants-heading > span {
    display: grid;
    min-width: var(--v19b-size-0);
    gap: var(--v19b-size-4);
  }

  .v20-applicants-heading h3,
  .v20-applicants-heading p {
    margin: var(--v19b-size-0);
  }

  .v20-applicants-heading h3 {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-18);
    font-weight: var(--v19b-weight-title);
  }

  .v20-applicants-heading p {
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-12);
    line-height: var(--v19b-line-height-row);
  }

  .v20-applicants-heading > strong {
    display: inline-grid;
    min-width: var(--v19b-size-32);
    min-height: var(--v19b-size-28);
    place-items: center;
    padding-inline: var(--v19b-size-8);
    border-radius: var(--v19b-radius-control);
    background: var(--v19b-admin-drawer-control-bg);
    color: var(--v19b-admin-drawer-text-70);
    font-size: var(--v19b-size-12);
  }

  .v20-applicant-readiness {
    display: grid;
    width: var(--v19b-size-96);
    gap: var(--v19b-size-6);
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-11);
    font-weight: var(--v19b-weight-control);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .v20-applicant-readiness .v20-progress-track {
    height: var(--v19b-size-2);
  }

  .v20-issues-empty {
    display: grid;
    min-height: var(--v19b-size-200);
    place-items: center;
    gap: var(--v19b-size-8);
    padding: var(--v19b-size-28);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-admin-drawer-surface);
    text-align: center;
  }

  .v20-issues-empty-icon {
    display: grid;
    width: var(--v19b-size-44);
    height: var(--v19b-size-44);
    place-items: center;
    border-radius: var(--v19b-radius-control);
    background: var(--v19b-admin-drawer-blue-bg);
    color: var(--v19b-admin-drawer-blue-text);
  }

  .v20-issues-empty.is-complete .v20-issues-empty-icon {
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-green-border);
    background: var(--v19b-admin-drawer-green-bg);
    color: var(--v19b-admin-drawer-green-text);
  }

  .v20-issues-empty-icon svg {
    width: var(--v19b-size-20);
    height: var(--v19b-size-20);
  }

  .v20-issues-empty-stage {
    color: var(--v19b-admin-drawer-blue-text);
    font-size: var(--v19b-size-10);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-wide);
    text-transform: uppercase;
  }

  .v20-issues-empty.is-complete .v20-issues-empty-stage {
    color: var(--v19b-admin-drawer-green-text);
  }

  .v20-issues-empty h4,
  .v20-issues-empty p {
    margin: var(--v19b-size-0);
  }

  .v20-issues-empty h4 {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-18);
    font-weight: var(--v19b-weight-title);
  }

  .v20-issues-empty p {
    max-width: var(--v19b-size-520);
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-13);
    line-height: var(--v19b-line-height-row);
  }

  .v20-history-list {
    position: relative;
    display: grid;
    gap: var(--v19b-size-12);
    margin: var(--v19b-size-0);
    padding: var(--v19b-size-0);
    list-style: none;
  }

  .v20-history-list::before {
    position: absolute;
    top: var(--v19b-size-20);
    bottom: var(--v19b-size-20);
    left: var(--v19b-size-20);
    width: var(--v19b-size-1);
    background: var(--v19b-admin-drawer-border-faint);
    content: "";
  }

  .v20-history-item {
    position: relative;
    display: grid;
    min-width: var(--v19b-size-0);
    grid-template-columns: var(--v19b-size-40) minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    align-items: start;
    gap: var(--v19b-size-12);
    padding: var(--v19b-size-16);
    border: var(--v19b-size-1) solid var(--v19b-admin-drawer-border-faint);
    border-radius: var(--v19b-radius-row);
    background: var(--v19b-admin-drawer-surface);
  }

  .v20-history-icon {
    position: relative;
    z-index: 1;
    width: var(--v19b-size-40);
    height: var(--v19b-size-40);
    border-radius: var(--v19b-radius-control);
    background: var(--v19b-admin-drawer-control-bg);
  }

  .v20-history-copy {
    display: grid;
    min-width: var(--v19b-size-0);
    gap: var(--v19b-size-6);
  }

  .v20-history-label {
    width: max-content;
    padding: var(--v19b-size-3) var(--v19b-size-6);
    border-radius: calc(var(--v19b-radius-control) - var(--v19b-size-2));
    background: var(--v19b-admin-drawer-control-bg);
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-10);
    font-weight: var(--v19b-weight-control);
    letter-spacing: var(--v19b-letter-spacing-wide);
    text-transform: uppercase;
  }

  .v20-history-title {
    color: var(--v19b-color-text-strong);
    font-size: var(--v19b-size-14);
    font-weight: var(--v19b-weight-title);
    overflow-wrap: anywhere;
  }

  .v20-history-detail {
    margin: var(--v19b-size-0);
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-12);
    line-height: var(--v19b-line-height-row);
  }

  .v20-history-meta {
    margin: var(--v19b-size-0);
    color: var(--v19b-admin-drawer-text-50);
    font-size: var(--v19b-size-11);
  }

  .v20-footer {
    position: relative;
    z-index: var(--v19b-z-sticky);
    display: flex;
    min-height: var(--v19b-size-76);
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--v19b-size-16);
    padding: var(--v19b-size-16) var(--v19b-size-32) max(var(--v19b-size-16), env(safe-area-inset-bottom));
    border-top: var(--v19b-size-1) solid var(--v19b-admin-drawer-border);
    background: var(--v19b-admin-drawer-bg);
  }

  .v20-footer-actions {
    display: flex;
    width: auto;
    flex: none;
    gap: var(--v19b-size-8);
  }

  .v20-action-button {
    min-height: var(--v19b-size-44);
    border-radius: var(--v19b-radius-control);
    font-size: var(--v19b-size-13);
  }

  @media (max-width: 1023px) {
    .v20-submission-drawer {
      inset: var(--v19b-drawer-mobile-top) var(--v19b-size-0) var(--v19b-size-0);
      width: var(--v19b-size-full);
      height: auto;
      max-height: calc(100dvh - var(--v19b-drawer-mobile-top));
      border-right: var(--v19b-size-1) solid var(--v19b-admin-drawer-border);
      border-bottom: var(--v19b-size-0);
      border-left: var(--v19b-size-1) solid var(--v19b-admin-drawer-border);
      border-radius: var(--v19b-drawer-mobile-radius) var(--v19b-drawer-mobile-radius) var(--v19b-size-0) var(--v19b-size-0);
      overflow: hidden;
    }

    .v20-drawer-topbar {
      min-height: var(--v19b-size-0);
      padding: var(--v19b-size-12) var(--v19b-size-16);
    }

    .v20-title {
      font-size: var(--v19b-size-20);
    }

    .v20-icon-button.is-close {
      position: static;
      width: var(--v19b-size-44);
      height: var(--v19b-size-44);
      min-width: var(--v19b-size-44);
      min-height: var(--v19b-size-44);
    }

    .v20-tabbar-wrap,
    .v20-drawer-body {
      padding-inline: var(--v19b-size-16);
    }

    .v20-tabbar-wrap {
      display: block;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .v20-tabbar-wrap::-webkit-scrollbar {
      display: none;
    }

    .v20-tabbar {
      width: max-content;
      min-width: var(--v19b-size-full);
      overflow: visible;
    }

    .v20-tabbar .v20-tab-button {
      min-width: max-content;
      min-height: var(--v19b-size-52);
      flex: none;
      justify-content: center;
      padding-inline: var(--v19b-size-14);
      scroll-snap-align: start;
    }

    .v20-two-col,
    .v20-applicant-grid {
      grid-template-columns: minmax(var(--v19b-size-0), var(--v19b-grid-fr));
    }

    .v20-drawer-body {
      min-height: var(--v19b-size-0);
      flex: 1 1 auto;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .v20-footer {
      min-height: var(--v19b-size-68);
      padding: var(--v19b-size-12) var(--v19b-size-16) max(var(--v19b-size-12), env(safe-area-inset-bottom));
    }

    .v20-footer-note:not(.is-error) {
      display: none;
    }

    .v20-footer-actions {
      display: grid;
      width: var(--v19b-size-full);
      grid-template-columns: var(--v19b-size-88) minmax(var(--v19b-size-0), var(--v19b-grid-fr));
      gap: var(--v19b-size-8);
    }

    .v20-next-action {
      grid-template-columns: var(--v19b-size-36) minmax(var(--v19b-size-0), var(--v19b-grid-fr));
      gap: var(--v19b-size-12);
      padding: var(--v19b-size-12);
    }

    .v20-next-action-mark {
      width: var(--v19b-size-36);
      height: var(--v19b-size-36);
    }

    .v20-next-action > button {
      grid-column: 1 / -1;
      width: var(--v19b-size-full);
    }

    .v20-applicants-heading {
      align-items: center;
    }

    .v20-applicant-readiness {
      width: var(--v19b-size-88);
    }

    .v20-action-button,
    .v20-action-button.is-warning {
      width: var(--v19b-size-full);
      min-width: var(--v19b-size-0);
    }
  }

  /* My submissions is the visual source of truth for the agent workspace. */
  .v20-submission-drawer {
    border-color: var(--v19b-color-border-strong);
    color: var(--v19b-color-text);
    background: var(--v19b-color-page);
  }

  .v20-drawer-topbar,
  .v20-tabbar-wrap,
  .v20-footer {
    border-color: var(--v19b-color-border);
    background: var(--v19b-color-page);
  }

  .v20-drawer-body {
    background: var(--v19b-color-app);
  }

  .v20-next-action,
  .v20-info-card,
  .v20-applicant-card,
  .v20-questionnaire-section-card,
  .v20-file-section,
  .v20-file-item,
  .v20-issue-card,
  .v20-history-item,
  .v20-issues-empty,
  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-summary-head {
    border-color: var(--v19b-color-border-strong) !important;
    background: var(--v19b-color-panel) !important;
  }

  .v20-icon-button.is-close,
  .v20-next-action > button,
  .v20-drawer-body [aria-labelledby$="questionnaire"]
    .v19-drawer-questionnaire-open-button,
  .v20-action-button.is-ghost {
    border-color: var(--v19b-color-border-strong) !important;
    background: var(--v19b-color-control) !important;
  }

  .v20-questionnaire-section-icon {
    position: relative;
    display: grid;
    width: var(--v19b-size-40);
    height: var(--v19b-size-40);
    flex: none;
    place-items: center;
    border: var(--v19b-size-1) solid var(--v19b-color-border-strong);
    border-radius: var(--v19b-radius-control);
    color: var(--v19b-color-text-muted) !important;
    background: var(--v19b-color-control);
  }

  .v20-tab-button:focus-visible {
    outline: var(--v19b-size-2) solid var(--v19b-color-primary-bright) !important;
    outline-offset: calc(var(--v19b-size-2) * -1) !important;
  }

  .v20-questionnaire-section-icon svg {
    width: var(--v19b-size-18);
    height: var(--v19b-size-18);
  }

  .v20-questionnaire-section-icon:is(.is-done, .is-in_progress)::after {
    position: absolute;
    right: var(--v19b-size-4);
    bottom: var(--v19b-size-4);
    width: var(--v19b-size-6);
    height: var(--v19b-size-6);
    border-radius: var(--v19b-radius-pill);
    background: var(--v19b-color-primary-text);
    box-shadow: 0 0 0 var(--v19b-size-2) var(--v19b-color-control);
    content: "";
  }

  .v20-questionnaire-section-icon.is-done::after {
    background: var(--v19b-dot-success);
  }

  @media (max-width: 360px) {
    .v20-drawer-topbar {
      padding-block: var(--v19b-size-10);
    }

    .v20-title-wrap {
      gap: var(--v19b-size-4);
    }

    .v20-subtitle {
      display: block;
      overflow: hidden;
      overflow-wrap: normal;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
`;

function getDrawerFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(drawerFocusableSelector)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null,
  );
}

type QuestionnaireFocusTarget = {
  applicantId?: string;
  field?: string;
  section?: string;
};

type FigmaApplicant = {
  completeness: number;
  name: string;
  role: string;
  status: string;
};

type FigmaSubmissionDetail = {
  applicants: FigmaApplicant[];
  applicantsCount: number;
  city: string;
  completeness: number;
  id: string;
  issuesCount: number;
  owner: string;
  status: SourceStatus;
  title: string;
  tripDates: string;
  type: "family" | "single";
  updated: string;
};

type FigmaSubmissionDrawerProps = {
  activeTab: DrawerTab;
  actionError?: string;
  focusTarget?: WorkspaceTarget;
  isOpen?: boolean;
  onClearFocusTarget?: () => void;
  onAction: (action: SubmissionAction) => void | Promise<void>;
  onClose: () => void;
  onMarkIssueFixed?: (issueId: string) => void | Promise<void>;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  onOpenQuestionnaireWorkspace: (target?: QuestionnaireFocusTarget) => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
  [key: string]: unknown;
};

function applicantRoleLabel(role: string) {
  if (role === "main") return "Основной";
  if (role === "spouse") return "Супруг(а)";
  if (role === "child") return "Ребёнок";
  return role;
}

function drawerDateLabel(value: string) {
  if (!value) return "не указано";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function drawerTripDatesLabel(from: string, to: string) {
  if (!from && !to) return "Даты не указаны";
  if (!to) return `С ${drawerDateLabel(from)}`;
  if (!from) return `До ${drawerDateLabel(to)}`;
  return `${drawerDateLabel(from)} — ${drawerDateLabel(to)}`;
}

function drawerUpdatedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "недавно";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function applicantQuestionnairePercent(
  applicant: Submission["applicants"][number],
) {
  if (applicant.questionnaireStatus === "complete") return 100;
  if (applicant.questionnaireStatus === "empty") return 0;

  const sections = applicant.sections;
  if (!sections.length) return applicant.questionnaireStatus === "needs_fix" ? 65 : 40;

  const completeCount = sections.filter((section) => section.status === "complete").length;
  return Math.round((completeCount / sections.length) * 100);
}

function buildDetail(submission: Submission): FigmaSubmissionDetail {
  const mainApplicant =
    submission.applicants.find((applicant) => applicant.role === "main") ??
    submission.applicants[0];

  return {
    applicants: submission.applicants.map((applicant) => ({
      completeness: applicantQuestionnairePercent(applicant),
      name: applicant.fullName,
      role: applicantRoleLabel(applicant.role ?? "main"),
      status: applicant.questionnaireStatus,
    })),
    applicantsCount: submission.applicants.length,
    city: submission.city,
    completeness: submission.completeness.total,
    id: submission.id,
    issuesCount: submission.issues.filter(
      (issue) => issue.status !== "closed_by_admin",
    ).length,
    owner: "Татьяна Н.",
    status: operationalDrawerSourceStatus(submission),
    title:
      submission.type === "family"
        ? familyDisplayTitleFromMainApplicantName(mainApplicant?.fullName) ?? submission.title
        : submission.title,
    tripDates: drawerTripDatesLabel(
      submission.tripDateFrom,
      submission.tripDateTo,
    ),
    type: submission.type,
    updated: drawerUpdatedLabel(submission.updatedAt),
  };
}

function fileTypeLabel(type: SubmissionFile["type"]) {
  if (type === "passport_scan") return "Скан паспорта";
  if (type === "selfie") return "Селфи 1";
  if (type === "selfie_2") return "Селфи 2";
  return "Документ";
}

function fileStatusLabel(file: SubmissionFile) {
  if (file.status === "missing") return "Не загружено";
  if (file.status === "needs_replacement") return "Нужна замена";
  if (file.status === "pending_review") return "На проверке";
  if (file.status === "accepted") return "Принято";
  if (file.status === "uploaded") return "Загружено";
  return "Не загружено";
}

function fileActionLabel(file: SubmissionFile) {
  return file.status === "needs_replacement" ? "Заменить" : "Загрузить";
}

function fileAccept(file: SubmissionFile) {
  if (file.type === "passport_scan") return "image/jpeg,image/png,application/pdf";
  if (file.type === "selfie" || file.type === "selfie_2") return "image/*";
  return "image/jpeg,image/png,application/pdf";
}

function fileSummary(file: SubmissionFile) {
  const uploadedName = file.originalFileName ?? file.generatedFileName;
  if (!uploadedName) return fileStatusLabel(file);
  return `${fileStatusLabel(file)} · ${uploadedName}`;
}

function fileReadyBadgeLabel(file: SubmissionFile) {
  if (file.status === "pending_review") return "На проверке";
  if (file.status === "accepted") return "Принято";
  if (file.status === "uploaded") return "Загружено";
  return "Готово";
}

type FileApplicantSection = {
  files: SubmissionFile[];
  id: string;
  name: string;
};

function fileApplicantSections(submission: Submission): FileApplicantSection[] {
  const applicantNameById = new Map<string, string>(
    submission.applicants.map((applicant) => [applicant.id, applicant.fullName] as [string, string]),
  );
  const applicantOrder = new Map<string, number>(
    submission.applicants.map((applicant, index) => [applicant.id, index] as [string, number]),
  );
  const filesByApplicantId = new Map<string, SubmissionFile[]>();

  for (const file of submission.files) {
    const files = filesByApplicantId.get(file.applicantId) ?? [];
    files.push(file);
    filesByApplicantId.set(file.applicantId, files);
  }

  return Array.from(filesByApplicantId.entries())
    .sort(
      ([leftId], [rightId]) =>
        (applicantOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER) -
          (applicantOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER) ||
        leftId.localeCompare(rightId),
    )
    .map(([applicantId, files], index) => ({
      files,
      id: applicantId,
      name: applicantNameById.get(applicantId) ?? `Заявитель ${index + 1}`,
    }));
}

const Skeleton = ({
  className = "",
  variant = "panel",
}: {
  className?: string;
  variant?: "panel" | "stat" | "title";
}) => <div className={`v20-skeleton is-${variant} ${className}`} />;

function isFileReady(file: SubmissionFile) {
  return file.status !== "missing" && file.status !== "needs_replacement";
}

function documentPackageItems(submission: Submission) {
  const byType = new Map<
    SubmissionFile["type"],
    { ready: number; total: number; type: SubmissionFile["type"] }
  >();

  for (const file of submission.files) {
    const current = byType.get(file.type) ?? { ready: 0, total: 0, type: file.type };
    byType.set(file.type, {
      ...current,
      ready: current.ready + (isFileReady(file) ? 1 : 0),
      total: current.total + 1,
    });
  }

  return Array.from(byType.values()).map((item) => ({
    label:
      item.total > 1
        ? `${fileTypeLabel(item.type)} (${item.ready}/${item.total})`
        : fileTypeLabel(item.type),
    status:
      item.ready === item.total
        ? "done"
        : item.ready > 0
          ? "in_progress"
          : "pending",
  }));
}

function initials(name: string) {
  const value = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return value || "—";
}

const OverviewTab = ({
  data,
  onOpenFiles,
  onOpenIssues,
  onOpenQuestionnaire,
  submission,
}: {
  data: FigmaSubmissionDetail;
  onOpenFiles: () => void;
  onOpenIssues: () => void;
  onOpenQuestionnaire: () => void;
  submission: Submission;
}) => {
  const documentItems = documentPackageItems(submission);
  const readyFilesCount = submission.files.filter(isFileReady).length;
  const hasPendingDocuments = submission.files.some((file) => !isFileReady(file));
  const needsCorrections = data.status === "returned";
  const nextStep = needsCorrections
    ? {
        action: onOpenIssues,
        actionLabel: "Открыть замечания",
        description: "Исправьте отмеченные поля и файлы, затем отправьте пакет повторно.",
        label: "Требует действий",
        title: "Исправьте замечания",
      }
    : data.status === "corrections_received"
      ? {
          action: undefined,
          actionLabel: "",
          description: "Исправления отправлены. Администратор повторно проверяет пакет.",
          label: "Статус пакета",
          title: "Исправления на проверке",
        }
      : hasPendingDocuments
        ? {
            action: onOpenFiles,
            actionLabel: "Открыть файлы",
            description: "Добавьте недостающие документы, чтобы продолжить подачу.",
            label: "Следующий шаг",
            title: "Соберите документы",
          }
        : submission.completeness.questionnaire < 100
          ? {
              action: onOpenQuestionnaire,
              actionLabel: "Открыть анкету",
              description: "Заполните оставшиеся поля каждого заявителя.",
              label: "Следующий шаг",
              title: "Завершите анкету",
            }
          : {
              action: undefined,
              actionLabel: "",
              description: "Пакет собран. Перед отправкой проверьте состав и данные.",
              label: "Статус пакета",
              title: "Готово к отправке",
            };

  return (
    <div className="v20-section-stack v20-overview-tab">
      <section
        aria-labelledby="v20-next-action-title"
        className={`v20-next-action ${needsCorrections ? "is-warning" : ""}`}
      >
        <span className="v20-next-action-mark" aria-hidden="true">
          <ShieldAlert />
        </span>
        <span className="v20-next-action-copy">
          <small>{nextStep.label}</small>
          <h3 id="v20-next-action-title">{nextStep.title}</h3>
          <span>{nextStep.description}</span>
        </span>
        {nextStep.action ? (
          <button type="button" onClick={nextStep.action}>
            {nextStep.actionLabel}
          </button>
        ) : null}
      </section>

      <section>
        <div className="v20-two-col">
          <div className="v20-card v20-info-card">
            <h4 className="v20-info-title">Маршрут и подача</h4>
            <div className="v20-info-list">
              <div className="v20-info-line">
                <Calendar aria-hidden="true" />
                <div>
                  <div className="v20-info-main">{data.tripDates}</div>
                  <div className="v20-info-meta">Даты поездки</div>
                </div>
              </div>
              <div className="v20-info-line">
                <MapPin aria-hidden="true" />
                <div>
                  <div className="v20-info-main">{data.city}</div>
                  <div className="v20-info-meta">Визовый центр подачи</div>
                </div>
              </div>
            </div>
          </div>

          <div className="v20-card v20-info-card">
            <div className="v20-package-head">
              <h4 className="v20-info-title v20-info-title--compact">Пакет документов</h4>
              <span className="v20-package-count">
                {readyFilesCount}/{submission.files.length}
              </span>
            </div>
            <div className="v20-package-list">
              {documentItems.map((doc) => (
                <div key={doc.label} className="v20-package-row">
                  {doc.status === "done" ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <span
                      className={`v20-package-dot ${doc.status === "in_progress" ? "is-progress" : ""}`}
                      aria-hidden="true"
                    />
                  )}
                  <span className="v20-package-label">{doc.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="v20-section-label">Участники ({data.applicantsCount})</h3>
        <div className="v20-applicant-grid">
          {data.applicants.map((applicant, index) => (
            <article key={`${applicant.name}-${index}`} className="v20-applicant-card">
              <span className="v20-avatar">{initials(applicant.name)}</span>
              <span className="v20-applicant-copy">
                <strong>{applicant.name}</strong>
                <small>{applicant.role}</small>
              </span>
              <span className="v20-applicant-progress">{applicant.completeness}%</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

const ApplicantsTab = ({ data }: { data: FigmaSubmissionDetail }) => (
  <section
    aria-labelledby="v20-applicants-title"
    className="v20-section-stack v20-applicants-tab"
  >
    <header className="v20-applicants-heading">
      <span>
        <h3 id="v20-applicants-title">Заявители</h3>
        <p>Готовность анкет каждого участника подачи</p>
      </span>
      <strong aria-label={`Всего заявителей: ${data.applicantsCount}`}>
        {data.applicantsCount}
      </strong>
    </header>
    <div className="v20-applicant-grid">
      {data.applicants.map((applicant, index) => (
        <article key={`${applicant.name}-${index}`} className="v20-applicant-card">
          <span className="v20-avatar">{initials(applicant.name)}</span>
          <span className="v20-applicant-copy">
            <strong>{applicant.name}</strong>
            <small>{applicant.role}</small>
          </span>
          <span className="v20-applicant-readiness">
            <span>{applicant.completeness}%</span>
            <span className="v20-progress-track">
              <progress
                aria-label={`Готовность анкеты ${applicant.name}: ${applicant.completeness}%`}
                className={`v20-progress-fill ${applicant.completeness === 100 ? "is-done" : ""}`}
                max={100}
                value={applicant.completeness}
              />
            </span>
          </span>
        </article>
      ))}
    </div>
  </section>
);

const QuestionnaireTab = ({
  onOpenQuestionnaire,
  submission,
}: {
  onOpenQuestionnaire: (target?: QuestionnaireFocusTarget) => void;
  submission: Submission;
}) => {
  const sectionBlueprint: ReadonlyArray<{
    Icon: IconComponent;
    fieldIds?: readonly string[];
    sectionIds: readonly string[];
    title: string;
  }> = [
    {
      title: "Личные данные",
      Icon: User,
      sectionIds: ["personal", "contacts"],
    },
    {
      title: "Паспортные данные",
      Icon: FileDigit,
      sectionIds: ["passport"],
    },
    {
      title: "Место работы / Учебы",
      Icon: Briefcase,
      sectionIds: ["employment"],
    },
    {
      title: "Спонсоры и финансы",
      Icon: CreditCard,
      sectionIds: ["payment"],
    },
    {
      title: "Детали поездки",
      Icon: Plane,
      sectionIds: ["appointment", "trip", "hotel"],
    },
    {
      title: "Визовая история",
      Icon: History,
      fieldIds: ["previous-biometrics", "previous-biometrics-date", "previous-visa-number"],
      sectionIds: ["trip"],
    },
  ];
  const sections = sectionBlueprint.map((section) => {
    const relevantSections = submission.applicants.flatMap((applicant) =>
      applicant.sections.filter((candidate) => section.sectionIds.includes(candidate.id)),
    );
    const allApplicantsComplete = submission.applicants.every(
      (applicant) => applicant.questionnaireStatus === "complete",
    );
    const progress = allApplicantsComplete
      ? 100
      : relevantSections.length > 0
        ? Math.round(
            relevantSections.reduce((sum, candidate) => {
              if (candidate.status === "complete") return sum + 100;
              if (candidate.status === "empty") return sum;

              const fields = section.fieldIds
                ? candidate.fields.filter((field) => section.fieldIds?.includes(field.id))
                : candidate.fields;
              const requiredFields = fields.filter((field) => field.required);
              if (requiredFields.length === 0) {
                return sum + (candidate.status === "needs_fix" ? 65 : 40);
              }

              const filledFields = requiredFields.filter(
                (field) => field.value.trim().length > 0 && !field.error,
              );
              const calculated = Math.round(
                (filledFields.length / requiredFields.length) * 100,
              );
              return sum + (candidate.status === "needs_fix" ? Math.min(calculated, 90) : calculated);
            }, 0) / relevantSections.length,
          )
        : Math.round(
            submission.applicants.reduce(
              (sum, applicant) => sum + applicantQuestionnairePercent(applicant),
              0,
            ) / Math.max(submission.applicants.length, 1),
          );
    const remainingFieldCount = allApplicantsComplete
      ? 0
      : relevantSections.reduce((sum, candidate) => {
          const fields = section.fieldIds
            ? candidate.fields.filter((field) => section.fieldIds?.includes(field.id))
            : candidate.fields;
          return (
            sum +
            fields.filter(
              (field) => field.required && (!field.value.trim() || Boolean(field.error)),
            ).length
          );
        }, 0);

    return {
      ...section,
      progress,
      remaining: remainingFieldCount > 0 ? `${remainingFieldCount} поля` : undefined,
      status:
        progress >= 100
          ? ("done" as const)
          : progress > 0
            ? ("in_progress" as const)
            : ("pending" as const),
    };
  });
  const remainingBlockCount = sections.filter((section) => section.progress < 100).length;
  const remainingBlockLabel =
    remainingBlockCount === 0
      ? "Все блоки данных заполнены"
      : `Осталось заполнить ${remainingBlockCount} ${
          remainingBlockCount % 10 === 1 && remainingBlockCount % 100 !== 11
            ? "блок данных"
            : remainingBlockCount % 10 >= 2 &&
                remainingBlockCount % 10 <= 4 &&
                (remainingBlockCount % 100 < 12 || remainingBlockCount % 100 > 14)
              ? "блока данных"
              : "блоков данных"
        }`;

  return (
    <div className="v20-questionnaire-tab space-y-6">
      <div className="v19-drawer-questionnaire-summary-head">
        <div className="v19-drawer-questionnaire-summary-copy">
          <h3 className="v19-drawer-questionnaire-summary-title">Прогресс заполнения</h3>
          <p className="v19-questionnaire-progress-helper v19-drawer-questionnaire-summary-helper">
            {remainingBlockLabel}
          </p>
        </div>
        <button
          className="v19-drawer-questionnaire-open-button"
          onClick={() => onOpenQuestionnaire()}
          type="button"
        >
          <Edit3 className="v19-drawer-questionnaire-open-icon" aria-hidden="true" />
          <span className="v19-drawer-questionnaire-open-text">Открыть анкету</span>
        </button>
      </div>

      <div className="v20-questionnaire-preview-grid grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map((section, index) => (
          <QuestionnaireSectionPreviewCard
            key={`questionnaire-preview-${submission.id}-${section.title}-${index}`}
            className="v20-questionnaire-section-card p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-4 hover:bg-white/[0.04] transition-colors cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => onOpenQuestionnaire()}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpenQuestionnaire();
            }}
          >
            <span
              className={`v20-questionnaire-section-icon is-${section.status}`}
            >
              <section.Icon aria-hidden="true" />
            </span>
            <span className="v20-questionnaire-section-copy flex-1 min-w-0">
              <span className="v19-drawer-questionnaire-section-head flex items-center justify-between mb-1">
                <span className="v19-drawer-questionnaire-section-title text-[var(--v19b-size-13)] font-medium text-white truncate">
                  {section.title}
                </span>
                <span className="v19-drawer-questionnaire-section-percent text-[var(--v19b-size-11)] font-mono text-white/50">
                  {section.progress}%
                </span>
              </span>
              <ProgressMeter
                ariaHidden
                className="v19-questionnaire-section-progress"
                tone={
                  section.status === "done" || section.status === "in_progress"
                    ? "accent"
                    : "muted"
                }
                value={section.progress}
              />
              {section.remaining ? (
                <span className="v19-drawer-questionnaire-section-remaining text-[var(--v19b-size-10)] text-white/40 mt-1.5">
                  Осталось: {section.remaining}
                </span>
              ) : null}
            </span>
          </QuestionnaireSectionPreviewCard>
        ))}
      </div>
    </div>
  );
};

const FilesTab = ({
  focusTarget,
  onOpenQuestionnaire,
  onUploadFile,
  submission,
}: {
  focusTarget?: WorkspaceTarget;
  onOpenQuestionnaire: () => void;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  submission: Submission;
}) => {
  const applicantSections = fileApplicantSections(submission);
  const firstUploadableApplicant =
    applicantSections.find((section) =>
      section.files.some(
        (file) =>
          file.status === "needs_replacement" ||
          (submission.status !== "returned" && file.status === "missing"),
      ),
    )?.id ?? applicantSections[0]?.id;
  const [expandedApplicantIds, setExpandedApplicantIds] = useState<string[]>(
    firstUploadableApplicant ? [firstUploadableApplicant] : [],
  );
  const fileInputsRef = useRef(new Map<string, HTMLInputElement>());
  const dropInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadFileIdsRef = useRef(new Set<string>());
  const [uploadError, setUploadError] = useState("");
  const firstActionFile = useMemo(
    () =>
      submission.files.find(
        (file) =>
          file.status === "needs_replacement" ||
          (submission.status !== "returned" && file.status === "missing"),
      ) ?? submission.files[0],
    [submission.files, submission.status],
  );
  const canDropUpload = Boolean(onUploadFile && firstActionFile);

  useEffect(() => {
    setExpandedApplicantIds(firstUploadableApplicant ? [firstUploadableApplicant] : []);
  }, [firstUploadableApplicant, submission.id]);

  useEffect(() => {
    if (focusTarget?.tab !== "files") return;
    setExpandedApplicantIds((current) =>
      current.includes(focusTarget.applicantId)
        ? current
        : [...current, focusTarget.applicantId],
    );
  }, [focusTarget]);

  function toggleApplicant(applicantId: string) {
    setExpandedApplicantIds((current) =>
      current.includes(applicantId)
        ? current.filter((id) => id !== applicantId)
        : [...current, applicantId],
    );
  }

  async function uploadToFileSlot(fileId: string, selectedFile: File) {
    if (pendingUploadFileIdsRef.current.has(fileId)) return;
    pendingUploadFileIdsRef.current.add(fileId);
    setUploadError("");
    try {
      await onUploadFile?.(fileId, selectedFile);
    } catch {
      setUploadError(
        "Не удалось загрузить файл. Состояние подачи не изменено. Повторите попытку.",
      );
    } finally {
      pendingUploadFileIdsRef.current.delete(fileId);
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    fileId: string,
  ) {
    const selectedFile = event.currentTarget.files?.[0];
    if (!selectedFile) return;

    void uploadToFileSlot(fileId, selectedFile);
    event.currentTarget.value = "";
  }

  function handleDropInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.currentTarget.files?.[0];
    if (!selectedFile || !firstActionFile) return;

    void uploadToFileSlot(firstActionFile.id, selectedFile);
    event.currentTarget.value = "";
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!firstActionFile) return;

    const selectedFile = event.dataTransfer.files?.[0];
    if (!selectedFile) return;

    void uploadToFileSlot(firstActionFile.id, selectedFile);
  }

  return (
    <div className="v20-upload-stage">
      {uploadError ? (
        <div className="v20-upload-error" role="alert">
          {uploadError}
        </div>
      ) : null}
      <div className="v20-mode-toggle" role="status">
        <span className="v20-mode-button is-active">
          <User aria-hidden="true" />
          {submission.type === "family" ? "Семейная подача" : "Один заявитель"}
        </span>
      </div>

      {submission.type === "family" ? (
        <div className="v20-card v20-question-card">
          <div className="v20-question-row">
            <span className="v20-question-text">
              Общие адреса семьи заполняются один раз и копируются только после подтверждения.
            </span>
            <button className="v20-questionnaire-open" type="button" onClick={onOpenQuestionnaire}>
              Открыть анкету
            </button>
          </div>
        </div>
      ) : null}

      {submission.files.length ? (
        <div
          className={`v20-dropzone ${canDropUpload ? "" : "is-disabled"}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            accept={firstActionFile ? fileAccept(firstActionFile) : "image/jpeg,image/png,application/pdf"}
            className="v20-hidden-file-input"
            disabled={!canDropUpload}
            ref={dropInputRef}
            type="file"
            onChange={handleDropInputChange}
          />
          <div className="v20-dropzone-inner">
            <span className="v20-upload-icon-box">
              <UploadCloud aria-hidden="true" />
            </span>
            <h3 className="v20-dropzone-title">Перетащи документы сюда</h3>
            <p className="v20-dropzone-helper">
              PDF, JPG, PNG. Статус загрузки и требуемое действие появятся в списке ниже.
            </p>
            <button
              className="v20-upload-button"
              disabled={!canDropUpload}
              type="button"
              onClick={() => dropInputRef.current?.click()}
            >
              Выбрать файлы
            </button>
          </div>
        </div>
      ) : (
        <section className="v20-empty-state v20-files-empty-state" aria-label="Файлы ещё не сформированы">
          <p>Для этой подачи ещё не сформированы слоты документов.</p>
          <button className="v20-questionnaire-open" type="button" onClick={onOpenQuestionnaire}>
            Открыть анкету
          </button>
        </section>
      )}

      <section>
        <h3 className="v20-section-label">Файлы подачи</h3>
        <div className="v20-file-sections">
          {applicantSections.map((section) => {
            const isExpanded = expandedApplicantIds.includes(section.id);
            const uploadedCount = section.files.filter(
              (file) => file.status !== "missing" && file.status !== "needs_replacement",
            ).length;
            const actionCount = section.files.length - uploadedCount;

            return (
              <section className="v20-file-section" key={section.id}>
                <button
                  aria-expanded={isExpanded}
                  className="v20-file-section-head"
                  type="button"
                  onClick={() => toggleApplicant(section.id)}
                >
                  <span>
                    <span className="v20-file-section-title">{section.name}</span>
                    <span className="v20-file-section-meta">
                      {uploadedCount}/{section.files.length} файлов готово
                      {actionCount > 0 ? ` · требуется ${actionCount}` : ""}
                    </span>
                  </span>
                  <span className="v20-file-section-toggle">
                    {isExpanded ? "Свернуть" : "Раскрыть"}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="v20-file-list">
                    {section.files.map((file) => {
                      const canUpload =
                        file.status === "missing" || file.status === "needs_replacement";
                      const actionLabel = `${fileActionLabel(file)} ${fileTypeLabel(file.type)} — ${section.name}`;

                      return (
                        <div
                          id={targetElementId({
                            applicantId: file.applicantId,
                            fileType: file.type,
                            tab: "files",
                          })}
                          className="v20-file-item"
                          key={file.id}
                        >
                          <span className="v20-file-icon">
                            <UploadCloud aria-hidden="true" />
                          </span>
                          <span>
                            <span className="v20-file-title">{fileTypeLabel(file.type)}</span>
                            <span className="v20-file-meta">{fileSummary(file)}</span>
                          </span>
                          {canUpload ? (
                            <>
                              <input
                                accept={fileAccept(file)}
                                aria-label={actionLabel}
                                className="v20-row-file-input"
                                disabled={!onUploadFile}
                                ref={(node) => {
                                  if (node) fileInputsRef.current.set(file.id, node);
                                  else fileInputsRef.current.delete(file.id);
                                }}
                                type="file"
                                onChange={(event) => handleFileChange(event, file.id)}
                              />
                              <button
                                aria-label={actionLabel}
                                className="v20-file-action"
                                disabled={!onUploadFile}
                                type="button"
                                onClick={() => fileInputsRef.current.get(file.id)?.click()}
                              >
                                {fileActionLabel(file)}
                              </button>
                            </>
                          ) : (
                            <span className="v20-file-status is-ready">
                              {fileReadyBadgeLabel(file)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
};

const IssuesTab = ({
  data,
  onMarkIssueFixed,
  onOpenWorkspaceTarget,
  role,
  submission,
}: {
  data: FigmaSubmissionDetail;
  onMarkIssueFixed?: (issueId: string) => void | Promise<void>;
  onOpenWorkspaceTarget: (target: WorkspaceTarget) => void;
  role: Role;
  submission: Submission;
}) => {
  const [issueFixError, setIssueFixError] = useState("");
  const [pendingIssueId, setPendingIssueId] = useState<string | null>(null);
  const issueFixPendingRef = useRef(false);
  const unresolvedIssues = submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin",
  );
  const issueStateKey = submission.issues
    .map((issue) => `${issue.id}:${issue.status}`)
    .join("|");
  const emptyPresentation = issueEmptyPresentation(data.status);

  useEffect(() => {
    setIssueFixError("");
  }, [issueStateKey, submission.id]);

  async function markIssueFixed(issueId: string) {
    if (!onMarkIssueFixed || issueFixPendingRef.current) return;

    issueFixPendingRef.current = true;
    setIssueFixError("");
    setPendingIssueId(issueId);
    try {
      await onMarkIssueFixed(issueId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setIssueFixError(
        message.includes("target must be corrected")
          ? "Сначала внесите и сохраните исправление, затем отметьте замечание исправленным."
          : "Не удалось отметить замечание исправленным. Состояние подачи не изменено. Повторите попытку.",
      );
    } finally {
      issueFixPendingRef.current = false;
      setPendingIssueId(null);
    }
  }

  return (
    <div className="v20-issues-screen">
      <header className="v20-issues-heading">
        <span>
          <h3>Список задач по замечаниям</h3>
          <p>Ошибки, выявленные администратором при проверке</p>
        </span>
        <strong>Требуют исправления: {data.issuesCount}</strong>
      </header>

      {issueFixError ? (
        <div className="v20-upload-error" role="alert">
          {issueFixError}
        </div>
      ) : null}

      {unresolvedIssues.length > 0 ? (
        <div className="v20-issue-list">
          {unresolvedIssues.map((issue) => {
            const Icon = issue.type === "file" ? ImageIcon : FileText;
            const canMarkFixed =
              role === "agent" && issue.status === "open" && Boolean(onMarkIssueFixed);

            return (
              <article
                id={targetElementId({ issueId: issue.id, tab: "issues" })}
                key={issue.id}
                className="v20-issue-card"
              >
                <span className="v20-issue-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>
                  <span className="v20-issue-title-row">
                    <h4 className="v20-issue-title">{issue.reason}</h4>
                    <span className="v20-issue-badge">
                      {issue.status === "fixed_by_agent" ? "Исправлено" : "Blocker"}
                    </span>
                  </span>
                  <span className="v20-issue-target">{issueTargetLine(issue)}</span>
                  <p className="v20-issue-text">{issue.comment}</p>
                </span>
                <span className="v20-issue-actions">
                  {issue.type === "field" && issue.status === "open" ? (
                    <button
                      className="v20-issue-button"
                      type="button"
                      onClick={() =>
                        onOpenWorkspaceTarget(targetForIssue(issue))
                      }
                    >
                      Исправить в анкете
                    </button>
                  ) : null}
                  {issue.target.fileType && issue.status === "open" ? (
                    <button
                      className="v20-issue-button"
                      type="button"
                      onClick={() => onOpenWorkspaceTarget(targetForIssue(issue))}
                    >
                      Перезагрузить файл
                    </button>
                  ) : null}
                  {canMarkFixed && !issue.target.fileType && issue.type !== "field" ? (
                    <button
                      aria-busy={pendingIssueId === issue.id}
                      className="v20-issue-button is-ghost"
                      disabled={pendingIssueId !== null}
                      type="button"
                      onClick={() => void markIssueFixed(issue.id)}
                    >
                      {pendingIssueId === issue.id
                        ? "Отмечаем…"
                        : "Отметить исправленным"}
                    </button>
                  ) : null}
                  {!canMarkFixed &&
                  !(issue.type === "field" && issue.status === "open") &&
                  !(issue.target.fileType && issue.status === "open") ? (
                    <span className="v20-issue-state">
                      {issue.status === "fixed_by_agent" ? "Ждет проверки" : "Документ"}
                    </span>
                  ) : null}
                </span>
              </article>
            );
          })}
        </div>
      ) : (
        <section
          aria-labelledby="v20-issues-empty-title"
          className={`v20-issues-empty is-${emptyPresentation.tone}`}
        >
          <span className="v20-issues-empty-icon" aria-hidden="true">
            {emptyPresentation.tone === "complete" ? <CheckCircle2 /> : <Clock />}
          </span>
          <span className="v20-issues-empty-stage" role="status">
            {emptyPresentation.stage}
          </span>
          <h4 id="v20-issues-empty-title">{emptyPresentation.title}</h4>
          <p>{emptyPresentation.description}</p>
        </section>
      )}
    </div>
  );
};

function issueEmptyPresentation(status: SourceStatus) {
  if (status === "submitted_for_review" || status === "corrections_received") {
    return {
      description: "Пакет находится у администратора. Новые задачи появятся здесь, если потребуются исправления.",
      stage: status === "corrections_received" ? "Повторная проверка" : "Проверка пакета",
      title: "Сейчас от вас ничего не требуется",
      tone: "review" as const,
    };
  }

  if (status === "ready_for_export" || status === "exported") {
    return {
      description: "Все замечания закрыты. Подача прошла проверку и готова к следующему этапу.",
      stage: status === "exported" ? "Пакет выгружен" : "Проверка завершена",
      title: "Замечаний нет",
      tone: "complete" as const,
    };
  }

  return {
    description: "Продолжайте заполнять анкету и собирать документы. Здесь появятся только конкретные задачи по проверке.",
    stage: status === "draft" ? "Черновик" : "Подготовка пакета",
    title: "Открытых замечаний нет",
    tone: "awaiting" as const,
  };
}

function issueTargetLine(issue: Submission["issues"][number]) {
  const parts = [
    issue.target.applicantName,
    issue.target.fileType ? "Файлы" : (issue.target.section ?? "Анкета"),
    issue.target.field,
  ];
  return parts.filter(Boolean).join(" · ");
}

function historyActorLabel(source: Submission["history"][number]["source"]) {
  if (source === "admin") return "Администратор";
  if (source === "agent") return "Агент";
  if (source === "bb") return "BLS";
  return "Система";
}

function historyVisualTone(event: Submission["history"][number]) {
  if (event.toStatus === "returned" || event.source === "admin") return "warning";
  if (event.toStatus === "submitted_for_review" || event.source === "agent") return "info";
  return "neutral";
}

function historyVisualIcon(event: Submission["history"][number]): IconComponent {
  if (event.toStatus === "returned" || event.source === "admin") return AlertCircle;
  if (event.toStatus === "submitted_for_review" || event.source === "agent") return UploadCloud;
  if (/файл|паспорт|скан/i.test(event.text)) return ImageIcon;
  return FileText;
}

function historyVisualLabel(event: Submission["history"][number]) {
  if (/файл|паспорт|скан/i.test(event.text)) return "Документ";
  if (event.fromStatus || event.toStatus) return "Статус";
  return event.source === "system" ? "Система" : "Действие";
}

const HistoryTab = ({ submission }: { submission: Submission }) => {
  const events = submission.history;

  if (!events.length) {
    return <div className="v20-empty-state">История появится после первого действия по подаче.</div>;
  }

  return (
    <ol className="v20-history-list" aria-label="История подачи">
      {events.map((event) => {
        const detail = historyDetailForUser(event);
        return (
          <li className="v20-history-item" key={event.id}>
            <span className={`v20-history-icon is-${historyVisualTone(event)}`}>
              {(() => {
                const Icon = historyVisualIcon(event);
                return <Icon aria-hidden="true" />;
              })()}
            </span>
            <span className="v20-history-copy">
              <span className="v20-history-label">{historyVisualLabel(event)}</span>
              <strong className="v20-history-title">{event.text}</strong>
              {detail ? <p className="v20-history-detail">{detail}</p> : null}
              <span className="v20-history-meta">
                {historyTimestampForUser(event.at)}
                <i className="v20-history-dot" aria-hidden="true" />
                {historyActorLabel(event.source)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
};

function initialTab(tab: DrawerTab): TabId {
  if (tab === "applicants") return "applicants";
  if (tab === "files") return "files";
  if (tab === "issues") return "issues";
  if (tab === "history") return "history";
  if (tab === "questionnaire") return "questionnaire";
  return "overview";
}

function tabIdForWorkspaceTarget(target: WorkspaceTarget): TabId {
  return initialTab(tabForTarget(target));
}

function questionnaireFocusFromTarget(target: WorkspaceTarget): QuestionnaireFocusTarget | undefined {
  if (target.tab !== "questionnaire") return undefined;
  return {
    applicantId: target.applicantId,
    field: target.field,
    section: target.section,
  };
}

function screenMeta(data: FigmaSubmissionDetail) {
  return [
    data.id,
    data.type === "family" ? "семейная" : "индивидуальная",
  ].join(" · ");
}

export function FigmaSubmissionDrawer({
  activeTab,
  actionError = "",
  focusTarget,
  isOpen = true,
  onClearFocusTarget,
  onAction,
  onClose,
  onMarkIssueFixed,
  onOpenQuestionnaireWorkspace,
  onUploadFile,
  role,
  submission,
  surface,
}: FigmaSubmissionDrawerProps) {
  const [tab, setTab] = useState<TabId>(() => initialTab(activeTab));
  const [status, setStatus] = useState<"loading" | "success">("loading");
  const [localActionError, setLocalActionError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const actionRequestIdRef = useRef(0);
  const actionPendingRef = useRef(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTabsRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const isDesktopDrawer = useDrawerDesktopQuery();
  const prefersReducedMotion = useReducedMotion();
  const data = useMemo(() => buildDetail(submission), [submission]);
  const primaryAction = getPrimaryAction(submission, role, surface);
  const pendingTargetRef = useRef<WorkspaceTarget | null>(null);
  const shouldReduceMotion = Boolean(prefersReducedMotion);
  const drawerPanelInitial = getDrawerPanelInitial(isDesktopDrawer, shouldReduceMotion);
  const drawerPanelExit = getDrawerPanelExit(isDesktopDrawer, shouldReduceMotion);
  const drawerPanelTransition = getDrawerPanelTransition(shouldReduceMotion);
  const tabContentInitial = getDrawerTabInitial(shouldReduceMotion);
  const tabContentExit = getDrawerTabExit(shouldReduceMotion);

  const openWorkspaceTarget = useCallback((target: WorkspaceTarget) => {
    pendingTargetRef.current = target;

    if (target.tab === "questionnaire") {
      setTab("questionnaire");
      if (role === "agent") onOpenQuestionnaireWorkspace(questionnaireFocusFromTarget(target));
      return;
    }

    setTab(tabIdForWorkspaceTarget(target));
  }, [onOpenQuestionnaireWorkspace, role]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (previouslyFocusedElementRef.current?.isConnected) {
        previouslyFocusedElementRef.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen, submission.id]);

  useEffect(() => {
    if (!isOpen) return;

    actionRequestIdRef.current += 1;
    setStatus("loading");
    setTab(initialTab(activeTab));
    setLocalActionError("");
    setActionPending(false);
    actionPendingRef.current = false;
    setStatus("success");
  }, [activeTab, isOpen, submission.id]);

  useEffect(() => {
    if (!isOpen || !focusTarget) return;
    if (initialTab(activeTab) === "issues" && focusTarget.tab !== "issues") {
      pendingTargetRef.current = null;
      onClearFocusTarget?.();
      return;
    }
    openWorkspaceTarget(focusTarget);
  }, [activeTab, focusTarget, isOpen, onClearFocusTarget, openWorkspaceTarget, submission.id]);

  useEffect(() => {
    if (!isOpen || status !== "success") return;
    const target = pendingTargetRef.current;
    if (!target) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(targetElementId(target));
      if (element) {
        element.scrollIntoView({
          behavior: shouldReduceMotion ? "auto" : "smooth",
          block: "center",
        });
        element.classList.add("is-ai-focus");
        window.setTimeout(() => element.classList.remove("is-ai-focus"), 1800);
      }
      pendingTargetRef.current = null;
      onClearFocusTarget?.();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [isOpen, onClearFocusTarget, shouldReduceMotion, status, tab, submission.id]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || status !== "success") return;
    const activeButton = drawerTabsRef.current?.querySelector<HTMLButtonElement>(
      `[data-drawer-tab="${tab}"]`,
    );
    activeButton?.scrollIntoView({
      behavior: shouldReduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [isOpen, shouldReduceMotion, status, tab]);

  useEffect(() => {
    if (!isOpen || status !== "success") return;
    window.requestAnimationFrame(() => {
      drawerRef.current?.focus({ preventScroll: true });
    });
  }, [isOpen, status, submission.id]);

  function handleDrawerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = getDrawerFocusableElements(drawerRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      drawerRef.current?.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
      return;
    }

    if (!drawerRef.current?.contains(activeElement)) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  }

  const tabs: DrawerTabConfig[] = [
    { icon: Info, id: "overview", label: "Обзор" },
    {
      getCount: (detail) => detail.applicantsCount,
      icon: User,
      id: "applicants",
      label: "Заявители",
    },
    { icon: FileText, id: "questionnaire", label: "Анкета" },
    {
      getCount: () => submission.files.length,
      icon: FileDigit,
      id: "files",
      label: "Файлы",
    },
    {
      getCount: (detail) => detail.issuesCount,
      icon: AlertCircle,
      id: "issues",
      isWarning: true,
      label: "Замечания",
    },
    { icon: History, id: "history", label: "История" },
  ];

  function selectDrawerTab(nextTab: TabId) {
    setTab(nextTab);
  }

  function focusDrawerTab(nextTab: TabId) {
    window.requestAnimationFrame(() => {
      document.getElementById(drawerTabId(nextTab))?.focus({ preventScroll: true });
    });
  }

  function handleDrawerTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, currentTab: TabId) {
    const currentIndex = tabs.findIndex((item) => item.id === currentTab);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex]?.id;
    if (!nextTab) return;
    selectDrawerTab(nextTab);
    focusDrawerTab(nextTab);
  }

  const visibleActionError = localActionError || actionError;
  const correctionIssueCount = submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin",
  ).length;
  const footerStatusText =
    visibleActionError ||
    (tab === "overview" && correctionIssueCount > 0
      ? `Незакрытых замечаний: ${correctionIssueCount}`
      : "") ||
    primaryAction.reason ||
    (data.status === "returned"
      ? "Исправьте замечания перед повторной отправкой."
      : statusLabels[submission.status]);
  const primaryFooterLabel =
    data.status === "returned" ? "Отправить исправления" : (primaryAction.label || "Далее");
  async function handlePrimaryAction() {
    if (primaryAction.disabled || actionPendingRef.current) return;

    const requestId = ++actionRequestIdRef.current;
    setLocalActionError("");
    setActionPending(true);
    actionPendingRef.current = true;
    try {
      await onAction(primaryAction.action);
    } catch (error) {
      if (requestId !== actionRequestIdRef.current) return;
      setLocalActionError(
        error instanceof Error && error.message
          ? error.message
          : "Не удалось сохранить действие. Состояние подачи не изменено. Повторите попытку.",
      );
    } finally {
      if (requestId === actionRequestIdRef.current) {
        actionPendingRef.current = false;
        setActionPending(false);
      }
    }
  }

  return (
    <>
      <style>{figmaSubmissionDrawerStyles}</style>
      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.div
          animate={{ opacity: 1 }}
          className="v20-drawer-overlay"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          key="figma-drawer-overlay"
          onClick={onClose}
          transition={shouldReduceMotion ? drawerMotion.reduced : drawerMotion.overlay}
        />

            <motion.div
          animate={{ opacity: 1, x: 0, y: 0 }}
          className="v20-submission-drawer"
          exit={drawerPanelExit}
          initial={drawerPanelInitial}
          key="figma-drawer-panel"
          ref={drawerRef}
          role="dialog"
          aria-labelledby={drawerHeadingId}
          aria-modal="true"
          tabIndex={-1}
          transition={drawerPanelTransition}
          onKeyDown={handleDrawerKeyDown}
        >
          <header className="v20-drawer-topbar">
            <div className="v20-title-wrap">
              <div className="v20-subtitle">
                <span>{screenMeta(data)}</span>
              </div>
              <div className="v20-drawer-title-line">
                <h2 className="v20-title" id={drawerHeadingId}>{data.title}</h2>
              </div>
              <div className="v20-status-row">
                <span className={`v20-status-pill ${data.status === "returned" ? "is-warning" : ""}`}>
                  {data.status === "returned" ? <AlertCircle aria-hidden="true" /> : null}
                  {data.status === "returned"
                    ? "Возвращено (ошибки)"
                    : operationalDrawerCompactStatusLabel(data.status)}
                </span>
                <span className="v20-updated-at">
                  <Clock aria-hidden="true" />
                  Обновлено {data.updated}
                </span>
              </div>
            </div>
            <button className="v20-icon-button is-close" aria-label="Закрыть" type="button" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </header>

          <div className="v20-tabbar-wrap">
            <nav className="v20-tabbar" ref={drawerTabsRef} aria-label="Разделы подачи" role="tablist">
              {tabs.map((item) => {
                const count = item.getCount ? item.getCount(data) : undefined;
                const isActive = tab === item.id;
                const Icon = item.icon;

                return (
                  <button
                    aria-controls={drawerPanelId(item.id)}
                    aria-selected={isActive}
                    className={`v20-tab-button ${isActive ? "is-active" : ""} ${item.isWarning ? "is-warning" : ""}`}
                    data-drawer-tab={item.id}
                    id={drawerTabId(item.id)}
                    key={item.id}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    type="button"
                    onClick={() => selectDrawerTab(item.id)}
                    onKeyDown={(event) => handleDrawerTabKeyDown(event, item.id)}
                  >
                    <Icon className="v20-tab-icon" aria-hidden="true" />
                    {item.label}
                    {typeof count === "number" && count > 0 ? (
                      <span className="v20-tab-count">{count}</span>
                    ) : null}
                    {isActive ? (
                      <motion.span
                        aria-hidden="true"
                        className="v20-tab-indicator"
                        initial={false}
                        layoutId="figmaSubmissionDrawerActiveTab"
                        transition={drawerMotion.tabIndicator}
                      />
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          {status === "loading" ? (
            <div className="v20-skeleton-screen" aria-hidden="true">
              <Skeleton variant="title" />
              <div className="v20-stat-grid">
                <Skeleton variant="stat" />
                <Skeleton variant="stat" />
                <Skeleton variant="stat" />
                <Skeleton variant="stat" />
              </div>
              <Skeleton variant="panel" />
            </div>
          ) : (
            <>
              <main className="v20-drawer-body">
                <AnimatePresence mode="wait">
                  <motion.div
                    aria-labelledby={tabs.some((item) => item.id === tab) ? drawerTabId(tab) : drawerHeadingId}
                    animate={{ opacity: 1, y: 0 }}
                    exit={tabContentExit}
                    id={drawerPanelId(tab)}
                    initial={tabContentInitial}
                    key={tab}
                    role="tabpanel"
                    tabIndex={0}
                    transition={shouldReduceMotion ? drawerMotion.reduced : drawerMotion.tab}
                  >
                    {tab === "overview" ? (
                      <OverviewTab
                        data={data}
                        onOpenFiles={() => setTab("files")}
                        onOpenIssues={() => setTab("issues")}
                        onOpenQuestionnaire={() => onOpenQuestionnaireWorkspace()}
                        submission={submission}
                      />
                    ) : null}
                    {tab === "applicants" ? <ApplicantsTab data={data} /> : null}
                    {tab === "questionnaire" ? (
                      <QuestionnaireTab
                        onOpenQuestionnaire={onOpenQuestionnaireWorkspace}
                        submission={submission}
                      />
                    ) : null}
                    {tab === "files" ? (
                      <FilesTab
                        focusTarget={pendingTargetRef.current ?? undefined}
                        onOpenQuestionnaire={() => onOpenQuestionnaireWorkspace()}
                        onUploadFile={onUploadFile}
                        submission={submission}
                      />
                    ) : null}
                    {tab === "issues" ? (
                      <IssuesTab
                        data={data}
                        onMarkIssueFixed={onMarkIssueFixed}
                        onOpenWorkspaceTarget={openWorkspaceTarget}
                        role={role}
                        submission={submission}
                      />
                    ) : null}
                    {tab === "history" ? <HistoryTab submission={submission} /> : null}
                  </motion.div>
                </AnimatePresence>
              </main>

              <footer className="v20-footer">
                <div
                  className={`v20-footer-note ${visibleActionError ? "is-error" : ""}`}
                  role={visibleActionError ? "alert" : undefined}
                >
                  {footerStatusText}
                </div>
                <div className="v20-footer-actions">
                  <button
                    className="v20-action-button is-ghost"
                    type="button"
                    onClick={onClose}
                  >
                    Отмена
                  </button>
                  <button
                    aria-busy={actionPending}
                    className={`v20-action-button ${data.status === "returned" ? "is-warning" : "is-primary"}`}
                    disabled={primaryAction.disabled || actionPending}
                    type="button"
                    onClick={() => void handlePrimaryAction()}
                  >
                    {data.status === "returned" && !actionPending ? (
                      <UploadCloud aria-hidden="true" />
                    ) : null}
                    {actionPending ? "Сохраняем…" : primaryFooterLabel}
                  </button>
                </div>
              </footer>
            </>
          )}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
