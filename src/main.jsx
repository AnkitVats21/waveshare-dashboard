import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { DeviceProvider } from './DeviceContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <DeviceProvider>
        <App />
      </DeviceProvider>
    </ToastProvider>
  </React.StrictMode>,
);
