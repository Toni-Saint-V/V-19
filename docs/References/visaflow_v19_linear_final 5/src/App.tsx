import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CommandCenter } from './components/CommandCenter';
import { AdminWorkspace } from './components/AdminWorkspace';

type Workspace = 'agent' | 'admin';

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>('agent');

  const switchWorkspace = () => {
    setWorkspace((current) => (current === 'agent' ? 'admin' : 'agent'));
  };

  return (
    <div className="v19-ds h-dvh w-full bg-[#101011] text-white overflow-hidden">
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
  );
}
