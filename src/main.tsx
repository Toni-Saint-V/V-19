import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './shared/ui/tokens/index.css';
import './shared/ui/system.css';
import './shared/ui/visual-baseline.css';
import { createVisaflowRuntimeBridge } from './integration/createVisaflowRuntimeBridge';
import { getSupabaseClient } from './lib/supabase/client';
import {
  beginSupabaseInvitePasswordSetup,
  cleanSupabaseAuthCallbackUrl,
  parseSupabaseInviteCallbackUrl,
} from './services/supabaseInviteFlow';

const bridge = createVisaflowRuntimeBridge();
const initialUrl = window.location.href;
const inviteCallback = parseSupabaseInviteCallbackUrl(initialUrl);
const supabaseClient = inviteCallback ? getSupabaseClient() : null;
const inviteSetupPromise = supabaseClient
  ? beginSupabaseInvitePasswordSetup(supabaseClient.auth, initialUrl)
  : Promise.resolve(null);

if (inviteCallback && supabaseClient) {
  window.history.replaceState(
    window.history.state,
    document.title,
    cleanSupabaseAuthCallbackUrl(initialUrl),
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App bridge={bridge} inviteSetupPromise={inviteSetupPromise} />
  </React.StrictMode>,
);
