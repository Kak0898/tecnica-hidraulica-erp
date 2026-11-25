import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { EmpresaProvider } from './lib/empresa';
import { PermisosProvider } from './lib/permisos';
import { ConnectionNotice } from './components/ConnectionNotice';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EmpresaProvider>
      <PermisosProvider>
        <App />
        <ConnectionNotice />
      </PermisosProvider>
    </EmpresaProvider>
  </React.StrictMode>
);
