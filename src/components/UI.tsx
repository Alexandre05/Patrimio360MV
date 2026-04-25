import React, { ReactNode, Component, useState, useEffect } from 'react';
import { LucideIcon, CloudUpload, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export function SyncToast() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  useEffect(() => {
    const handleStart = () => setStatus('syncing');
    const handleEnd = (e: any) => {
      setStatus(e.detail?.success ? 'success' : 'error');
      setTimeout(() => setStatus('idle'), 3000);
    };

    window.addEventListener('app-sync-start', handleStart);
    window.addEventListener('app-sync-end', handleEnd);
    return () => {
      window.removeEventListener('app-sync-start', handleStart);
      window.removeEventListener('app-sync-end', handleEnd);
    };
  }, []);

  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className={cn(
        "flex items-center gap-3 px-6 py-3 rounded-full border shadow-2xl backdrop-blur-md transition-all duration-500",
        status === 'syncing' ? "bg-slate-900/90 border-slate-700 text-white" :
        status === 'success' ? "bg-emerald-500/90 border-emerald-400 text-white" :
        "bg-rose-500/90 border-rose-400 text-white"
      )}>
        {status === 'syncing' && <CloudUpload className="w-5 h-5 animate-pulse" />}
        {status === 'success' && <CheckCircle2 className="w-5 h-5 animate-in zoom-in" />}
        {status === 'error' && <AlertCircle className="w-5 h-5 animate-in zoom-in" />}
        
        <span className="font-bold text-xs uppercase tracking-widest whitespace-nowrap">
          {status === 'syncing' && "Sincronizando com a Nuvem..."}
          {status === 'success' && "Nuvem Atualizada"}
          {status === 'error' && "Falha na Sincronização"}
        </span>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 text-center text-rose-500 bg-white m-4 rounded-xl shadow-lg border border-rose-100">
          <h2 className="text-xl font-bold mb-2">Erro de Renderização</h2>
          <p className="text-sm border p-4 bg-rose-50 rounded-lg">{String(this.state.error?.message || this.state.error)}</p>
          <p className="text-xs mt-2 text-rose-400">{String(this.state.error?.stack)}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  id?: string;
  key?: string | number;
}

export function Card({ children, className, onClick, id, ...props }: CardProps) {
  return (
    <div 
      id={id}
      onClick={onClick}
      className={cn(
        "bg-card backdrop-blur-xl border border-border/60 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300",
        onClick && "cursor-pointer hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 active:scale-[0.98]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface ButtonProps {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'accent';
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
  onClick?: (e: any) => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

export function Button({ 
  children, 
  variant = 'primary', 
  icon: Icon, 
  loading, 
  className, 
  size = 'md',
  ...props 
}: ButtonProps) {
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-light shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)]",
    secondary: "bg-card text-primary border border-border hover:bg-bg shadow-sm",
    accent: "bg-accent text-white shadow-md hover:shadow-lg border border-transparent opacity-100 hover:opacity-90",
    danger: "bg-gradient-to-r from-rose-500 to-rose-600 text-white hover:from-rose-600 hover:to-rose-700 shadow-[0_4px_14px_0_rgba(225,29,72,0.2)] border border-rose-500/50",
    ghost: "bg-transparent text-text-muted hover:bg-bg hover:text-primary",
    outline: "bg-card/50 backdrop-blur-sm border border-border text-primary hover:bg-card hover:border-slate-400 hover:shadow-sm"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs font-semibold rounded-lg",
    md: "px-5 py-2.5 text-sm font-semibold rounded-xl",
    lg: "px-6 py-3 text-base font-semibold rounded-2xl"
  };

  return (
    <button
      className={cn(
        "flex items-center justify-center gap-2 font-medium tracking-tight transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size as keyof typeof sizes],
        className
      )}
      {...props}
    >
      {Icon && <Icon className={cn("shrink-0", size === 'sm' ? "w-3.5 h-3.5" : "w-5 h-5")} />}
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
          Aguarde...
        </span>
      ) : children}
    </button>
  );
}

interface InputProps {
  label?: string;
  error?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  value?: any;
  onChange?: (e: any) => void;
  className?: string;
  id?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && <label className="text-[12px] font-semibold text-text-muted ml-1">{label}</label>}
        <input
          id={id}
          ref={ref}
          className={cn(
            "px-4 py-2.5 rounded-xl border border-border outline-none transition-all duration-300 bg-card shadow-sm font-medium placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10 hover:border-slate-300 text-primary",
            error && "border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-rose-500/20",
            className
          )}
          {...props}
        />
        {error && <span className="text-[11px] font-medium text-rose-600 ml-1">{error}</span>}
        {hint && !error && <span className="text-[11px] font-medium text-text-muted ml-1">{hint}</span>}
      </div>
    );
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && <label className="text-[12px] font-semibold text-text-muted ml-1">{label}</label>}
        <textarea
          id={id}
          ref={ref}
          rows={3}
          className={cn(
            "px-4 py-3 rounded-xl border border-border outline-none transition-all duration-300 bg-card shadow-sm font-medium placeholder:text-slate-400 resize-none focus:border-accent focus:ring-4 focus:ring-accent/10 hover:border-slate-300 text-primary",
            error && "border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-rose-500/20",
            className
          )}
          {...props}
        />
        {error && <span className="text-[11px] font-medium text-rose-600 ml-1">{error}</span>}
      </div>
    );
  }
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && <label className="text-[12px] font-semibold text-text-muted ml-1">{label}</label>}
        <div className="relative">
          <select
            id={id}
            ref={ref}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl border border-border outline-none transition-all duration-300 bg-card shadow-sm font-medium appearance-none focus:border-accent focus:ring-4 focus:ring-accent/10 hover:border-slate-300 text-primary",
              className
            )}
            {...props}
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted bg-card pl-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </div>
    );
  }
);




