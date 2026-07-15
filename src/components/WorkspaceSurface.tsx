import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps } from "react";
import { AdminWorkspace } from "./AdminWorkspace";
import { CommandCenter } from "./CommandCenter";
import {
  VisaflowBusinessBridgeProvider,
  type VisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import type { WorkspaceDataStatus } from "../lib/supabase/workspaceRuntime";
import "../shared/ui/visual-baseline.css";

type Workspace = "agent" | "admin";

type WorkspaceDataState = {
  error?: string;
  status: WorkspaceDataStatus;
};

type WorkspaceSurfaceProps = {
  adminWorkspaceProps: ComponentProps<typeof AdminWorkspace>;
  agentWorkspaceProps: ComponentProps<typeof CommandCenter>;
  bridge: VisaflowBusinessBridge;
  onRetryWorkspace: () => void | Promise<void>;
  workspace: Workspace;
  workspaceDataState: WorkspaceDataState;
};

/**
 * The authenticated operational UI is deliberately a separate lazy boundary.
 * Access and password-recovery screens must not download the full cockpit.
 */
export function WorkspaceSurface({
  adminWorkspaceProps,
  agentWorkspaceProps,
  bridge,
  onRetryWorkspace,
  workspace,
  workspaceDataState,
}: WorkspaceSurfaceProps) {
  return (
    <VisaflowBusinessBridgeProvider bridge={bridge}>
      <div className="h-dvh w-full bg-[#101011] text-white overflow-hidden">
        <div aria-live="polite" className="sr-only" role="status">
          {workspaceDataState.status === "loading"
            ? "Загрузка данных Supabase"
            : workspaceDataState.status === "empty"
              ? "Supabase вернул пустую рабочую область"
              : workspaceDataState.status === "ready"
                ? "Данные Supabase загружены"
                : ""}
        </div>
        {workspaceDataState.status === "error" ? (
          <div
            className="fixed left-1/2 top-3 z-[80] w-[min(92vw,560px)] -translate-x-1/2 rounded-[12px] border border-[#7f3d45] bg-[#211416] px-4 py-3 text-[13px] text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
            role="alert"
          >
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                {workspaceDataState.error ?? "Не удалось синхронизировать Supabase."}
              </span>
              <button
                className="h-10 shrink-0 rounded-[10px] border border-[#7f3d45] px-3 text-[12px] font-semibold text-white"
                type="button"
                onClick={() => void onRetryWorkspace()}
              >
                Повторить
              </button>
            </div>
          </div>
        ) : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={workspace}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="v19-fullscreen-app h-full w-full"
          >
            {workspace === "agent" ? (
              <CommandCenter {...agentWorkspaceProps} />
            ) : (
              <AdminWorkspace {...adminWorkspaceProps} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </VisaflowBusinessBridgeProvider>
  );
}
