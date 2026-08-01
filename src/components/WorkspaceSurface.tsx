import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { lazy, type ComponentProps } from "react";
import type { AdminWorkspace as AdminWorkspaceComponent } from "./AdminWorkspace";
import type { CommandCenter as CommandCenterComponent } from "./CommandCenter";
import {
  VisaflowBusinessBridgeProvider,
  type VisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import type { WorkspaceDataStatus } from "../lib/supabase/workspaceRuntime";
import { workspaceSurfaceMotion } from "./workspaceSurfaceMotion";
import "../shared/ui/operational-screen-convergence.css";

type Workspace = "agent" | "admin";

type WorkspaceDataState = {
  error?: string;
  status: WorkspaceDataStatus;
};

const AdminWorkspace = lazy(async () => {
  const module = await import("./AdminWorkspace");
  return { default: module.AdminWorkspace };
});

const CommandCenter = lazy(async () => {
  const module = await import("./CommandCenter");
  return { default: module.CommandCenter };
});

type WorkspaceSurfaceProps = {
  adminWorkspaceProps: ComponentProps<typeof AdminWorkspaceComponent>;
  agentWorkspaceProps: ComponentProps<typeof CommandCenterComponent>;
  bridge: VisaflowBusinessBridge;
  onRetryWorkspace: () => void | Promise<void>;
  sessionKey: string;
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
  sessionKey,
  workspace,
  workspaceDataState,
}: WorkspaceSurfaceProps) {
  const prefersReducedMotion = useReducedMotion();
  const workspaceMotion = workspaceSurfaceMotion(Boolean(prefersReducedMotion));

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
                className="linear-product-action linear-product-action--warning h-10 shrink-0 rounded-[10px] border border-[#7f3d45] px-3 text-[12px] font-semibold text-white"
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
            key={`${workspace}:${sessionKey}`}
            {...workspaceMotion}
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
