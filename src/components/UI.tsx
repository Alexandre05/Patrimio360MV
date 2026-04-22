import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

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
        "bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm transition-all duration-300",
        onClick && "cursor-pointer hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 active:scale-[0.98]",
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
    primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/10",
    secondary: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
    accent: "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20",
    danger: "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/10",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900",
    outline: "bg-transparent border-2 border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base"
  };

  return (
    <button
      className={cn(
        "flex items-center justify-center gap-2 rounded-2xl font-bold tracking-tight transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
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
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {label && <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">{label}</label>}
      <input
        id={id}
        className={cn(
          "px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-slate-900 outline-none transition-all bg-slate-50/50 font-medium placeholder:text-slate-300",
          error && "border-red-100 bg-red-50/30 focus:border-red-500",
          className
        )}
        {...props}
      />
      {error && <span className="text-[10px] font-bold text-red-500 ml-1 uppercase tracking-tight">{error}</span>}
    </div>
  );
}

interface SelectProps {
  label?: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (e: any) => void;
  className?: string;
  id?: string;
}

export function Select({ label, options, className, id, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {label && <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">{label}</label>}
      <div className="relative">
        <select
          id={id}
          className={cn(
            "w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-slate-900 outline-none transition-all bg-slate-50/50 font-medium appearance-none",
            className
          )}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>
    </div>
  );
}




