import React, { ReactNode, useState, useEffect } from 'react';
import { LucideIcon, CloudUpload, CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from '../lib/ToastContext';
import { motion, AnimatePresence } from 'motion/react';

export function SyncToast() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  useEffect(() => {
    let timeout: any;
    const handleStart = () => {
      setStatus('syncing');
      // Safety timeout: if sync takes more than 30s, force idle to clear UI
      clearTimeout(timeout);
      timeout = setTimeout(() => setStatus('idle'), 30000);
    };
    
    const handleEnd = (e: any) => {
      clearTimeout(timeout);
      const isSuccess = e.detail?.success;
      setStatus(isSuccess ? 'success' : 'error');
      
      if (isSuccess) {
        toast('Dados sincronizados com sucesso!', 'success', 'Nuvem Atualizada');
      } else {
        toast('Erro ao sincronizar dados. Tente novamente.', 'error', 'Falha de Rede');
      }

      setTimeout(() => setStatus('idle'), 3000);
    };

    window.addEventListener('app-sync-start', handleStart);
    window.addEventListener('app-sync-end', handleEnd);
    return () => {
      window.removeEventListener('app-sync-start', handleStart);
      window.removeEventListener('app-sync-end', handleEnd);
      clearTimeout(timeout);
    };
  }, []);

  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className={cn(
        "flex items-center gap-3 px-6 py-3 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-500",
        status === 'syncing' ? "bg-slate-900 border-slate-700 text-white" :
        status === 'success' ? "bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/20" :
        "bg-rose-600 border-rose-400 text-white shadow-rose-500/20"
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

interface AlertProps {
  children: ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  className?: string;
  icon?: LucideIcon;
}

export function Alert({ 
  children, 
  variant = 'info', 
  title, 
  className,
  icon: CustomIcon
}: AlertProps) {
  const variants = {
    success: "bg-emerald-50 border-emerald-100 text-emerald-800 shadow-sm",
    error: "bg-rose-50 border-rose-100 text-rose-800 shadow-sm",
    warning: "bg-amber-50 border-amber-100 text-amber-800 shadow-sm",
    info: "bg-indigo-50 border-indigo-100 text-indigo-800 shadow-sm"
  };

  const Icons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
  };

  const Icon = CustomIcon || Icons[variant];

  return (
    <motion.div 
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-2xl border flex gap-3 items-start",
        variants[variant],
        className
      )}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5 opacity-80" />
      <div className="flex flex-col gap-0.5">
        {title && <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-0.5">{title}</span>}
        <div className="text-[11px] font-bold leading-relaxed">{children}</div>
      </div>
    </motion.div>
  );
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
        "bg-card border border-border/50 rounded-[1.5rem] p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.04),0_12px_32px_-4px_rgba(0,0,0,0.02)] transition-all duration-300",
        onClick && "cursor-pointer hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.12)] hover:border-slate-300 hover:-translate-y-1 active:scale-[0.98]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'accent';
  icon?: LucideIcon;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ 
  children, 
  variant = 'primary', 
  icon: Icon, 
  loading, 
  className, 
  size = 'md',
  ...props 
}, ref) => {
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-[0_4px_12px_rgba(15,23,42,0.15)]",
    secondary: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm",
    accent: "bg-indigo-600 text-white shadow-indigo-200 shadow-lg hover:shadow-indigo-300 hover:bg-indigo-700",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200 shadow-lg",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900",
    outline: "bg-transparent border-2 border-slate-200 text-slate-900 hover:border-slate-400 hover:bg-slate-50"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs font-bold rounded-lg",
    md: "px-5 py-2.5 text-sm font-bold rounded-xl",
    lg: "px-6 py-3 text-base font-bold rounded-2xl"
  };

  return (
    <button
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-2.5 font-bold tracking-tight transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
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
});

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2 w-full">
        {label && <label className="text-[12px] font-bold text-slate-500 ml-1 uppercase tracking-wider">{label}</label>}
        <input
          id={id}
          ref={ref}
          className={cn(
            "px-4 py-3 rounded-2xl border border-slate-200 outline-none transition-all duration-300 bg-white shadow-sm font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 hover:border-slate-300 text-slate-900",
            error && "border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-rose-500/20",
            className
          )}
          {...props}
        />
        {error && <span className="text-[11px] font-bold text-rose-600 ml-1 uppercase tracking-tighter">{error}</span>}
        {hint && !error && <span className="text-[11px] font-bold text-slate-400 ml-1 italic">{hint}</span>}
      </div>
    );
  }
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
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




