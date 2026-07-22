import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppCrashBoundary } from './components/AppCrashBoundary';
import './shared/ui/tokens/index.css';
import './shared/ui/system.css';
import './shared/ui/visual-baseline.css';
import './shared/ui/operational-side-menu.css';
import { createVisaflowRuntimeBridge } from './integration/createVisaflowRuntimeBridge';
import { getSupabaseClient } from './lib/supabase/client';
import {
  beginSupabaseInvitePasswordSetup,
  cleanSupabaseAuthCallbackUrl,
  parseSupabaseInviteCallbackUrl,
} from './services/supabaseInviteFlow';
import {
  beginSupabasePasswordRecovery,
  cleanSupabaseRecoveryCallbackUrl,
  parseSupabaseRecoveryCallbackUrl,
} from './services/supabasePasswordRecovery';

const bridge = createVisaflowRuntimeBridge();
const initialUrl = window.location.href;
const inviteCallback = parseSupabaseInviteCallbackUrl(initialUrl);
const recoveryCallback = parseSupabaseRecoveryCallbackUrl(initialUrl);
const supabaseClient = inviteCallback || recoveryCallback ? getSupabaseClient() : null;
const inviteSetupPromise = supabaseClient
  ? beginSupabaseInvitePasswordSetup(supabaseClient.auth, initialUrl)
  : Promise.resolve(null);
const recoverySetupPromise = supabaseClient
  ? beginSupabasePasswordRecovery(supabaseClient.auth, initialUrl)
  : Promise.resolve(null);

if ((inviteCallback || recoveryCallback) && supabaseClient) {
  const cleanUrl = recoveryCallback
    ? cleanSupabaseRecoveryCallbackUrl(initialUrl)
    : cleanSupabaseAuthCallbackUrl(initialUrl);
  window.history.replaceState(
    window.history.state,
    document.title,
    cleanUrl,
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppCrashBoundary>
      <App
        bridge={bridge}
        inviteSetupPromise={inviteSetupPromise}
        recoverySetupPromise={recoverySetupPromise}
      />
    </AppCrashBoundary>
  </React.StrictMode>,
);
