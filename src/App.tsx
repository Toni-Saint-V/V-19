import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CommandCenter } from './components/CommandCenter';
import { AdminWorkspace } from './components/AdminWorkspace';
import {
  emitVisaflowUiEvent,
  VisaflowBusinessBridgeProvider,
  noopVisaflowBusinessBridge,
  type VisaflowBusinessBridge,
} from './integration/visaflowBusinessBridge';

type Workspace = 'agent' | 'admin';

export interface AppProps {
  bridge?: VisaflowBusinessBridge;
  initialWorkspace?: Workspace;
}

export default function App({ bridge = noopVisaflowBusinessBridge, initialWorkspace = 'agent' }: AppProps = {}) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);

  const switchWorkspace = () => {
    setWorkspace((current) => {
      const nextWorkspace = current === 'agent' ? 'admin' : 'agent';
      bridge.onWorkspaceSwitch?.(nextWorkspace);
      emitVisaflowUiEvent(bridge, { type: 'workspace.switch', workspace: nextWorkspace });
      return nextWorkspace;
    });
  };

  return (
    <VisaflowBusinessBridgeProvider bridge={bridge}>
      <div className="h-dvh w-full bg-[#101011] text-white overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={workspace}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full"
          >
            {workspace === 'agent' ? (
              <CommandCenter onSwitchWorkspace={switchWorkspace} />
            ) : (
              <AdminWorkspace onSwitchWorkspace={switchWorkspace} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </VisaflowBusinessBridgeProvider>
  );
}
