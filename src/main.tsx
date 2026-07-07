import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './shared/ui/tokens/index.css';
import './shared/ui/system.css';
import './shared/ui/visual-baseline.css';
import { createVisaflowRuntimeBridge } from './integration/createVisaflowRuntimeBridge';

const bridge = createVisaflowRuntimeBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App bridge={bridge} />
  </React.StrictMode>,
);
