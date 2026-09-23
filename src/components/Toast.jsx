import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(() => {});
const ICONS = { ok: CheckCircle2, error: AlertTriangle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((message, tone = 'ok') => {
    const id = ++idRef.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className={clsx('toast', `toast-${t.tone}`)}>
              <Icon size={16} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// toast(message, tone?) with tone 'ok' | 'error' | 'info'.
export const useToast = () => useContext(ToastContext);
