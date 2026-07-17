import React from 'react';
import { motion } from 'motion/react';
import { Clipboard } from 'lucide-react';

export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50/30">
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-8"
      >
        {/* Container do ícone */}
        <div className="relative">
          {/* Efeito de luz atrás da prancheta */}
          <motion.div 
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            className="absolute inset-0 bg-indigo-500 blur-3xl rounded-full" 
          />
          
          {/* A Prancheta */}
          <motion.div
            initial={{ y: 20, rotate: -5 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 150, damping: 10 }}
            className="relative w-32 h-32 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-600/10 border border-indigo-100"
          >
            {/* Ícone da prancheta em azul índigo */}
            <Clipboard className="w-16 h-16 text-indigo-600" />
            
            {/* Pequena animação de "check" saindo da prancheta */}
            <motion.div 
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, type: "spring" }}
                className="absolute -top-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </motion.div>
          </motion.div>
        </div>
        
        {/* Texto do sistema */}
        <motion.div 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col items-center"
        >
           <h1 className="text-3xl font-black text-slate-900 tracking-tighter">
             PATRI<span className="text-indigo-600">360</span>
           </h1>
           <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
             Sincronizando dados de vistoria...
           </p>
        </motion.div>
      </motion.div>
    </div>
  );
}