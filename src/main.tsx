import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { EmpresaProvider } from './lib/empresa';
import { PermisosProvider } from './lib/permisos';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EmpresaProvider>
      <PermisosProvider>
        <App />
      </PermisosProvider>
    </EmpresaProvider>
  </React.StrictMode>
);
