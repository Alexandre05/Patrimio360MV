import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from './utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div id="toast-container" className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              layout
              className={cn(
                "pointer-events-auto p-4 rounded-2xl border shadow-2xl flex gap-4 items-start relative overflow-hidden group backdrop-blur-md",
                t.type === 'success' && "bg-emerald-50/90 border-emerald-100 text-emerald-800",
                t.type === 'error' && "bg-rose-50/90 border-rose-100 text-rose-800",
                t.type === 'warning' && "bg-amber-50/90 border-amber-100 text-amber-800",
                t.type === 'info' && "bg-indigo-50/90 border-indigo-100 text-indigo-800"
              )}
            >
              <div className={cn(
                "shrink-0 mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center",
                t.type === 'success' && "bg-emerald-200/50 text-emerald-600",
                t.type === 'error' && "bg-rose-200/50 text-rose-600",
                t.type === 'warning' && "bg-amber-200/50 text-amber-600",
                t.type === 'info' && "bg-indigo-200/50 text-indigo-600"
              )}>
                {t.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
                {t.type === 'error' && <AlertCircle className="w-5 h-5" />}
                {t.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                {t.type === 'info' && <Info className="w-5 h-5" />}
              </div>
              
              <div className="flex-1">
                {t.title && <h4 className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-60">{t.title}</h4>}
                <p className="text-sm font-bold leading-tight">{t.message}</p>
              </div>

              <button 
                onClick={() => removeToast(t.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/5 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Progress Bar Animation */}
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 5, ease: "linear" }}
                className={cn(
                  "absolute bottom-0 left-0 h-1",
                  t.type === 'success' && "bg-emerald-500/30",
                  t.type === 'error' && "bg-rose-500/30",
                  t.type === 'warning' && "bg-amber-500/30",
                  t.type === 'info' && "bg-indigo-500/30"
                )}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};
