import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

interface MensagemChat {
  id: string;
  usuario_nome: string;
  usuario_email?: string;
  mensagem: string;
  created_at: string;
}

export function ChatFlutuante() {
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const abertoRef = useRef(aberto);

  useEffect(() => {
    abertoRef.current = aberto;
    if (aberto) {
      setNaoLidas(0);
      setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [aberto]);

  useEffect(() => {
    if (!user) return;

    const carregarHistorico = async () => {
      const { data, error } = await supabase
        .from('mensagens_chat')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setMensagens(data.reverse());
      }
    };

    carregarHistorico();

    const canal = supabase
      .channel('chat-patrimonio-360')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens_chat' },
        (payload) => {
          const nova = payload.new as MensagemChat;
          setMensagens((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]));
          if (!abertoRef.current && nova.usuario_email !== (user as any)?.email) {
            setNaoLidas((n) => n + 1);
          }
          setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [user]);

  if (!user) return null;

  const nomeAtual = (user as any)?.name || (user as any)?.nome || (user as any)?.email?.split('@')[0] || 'Servidor';
  const emailAtual = (user as any)?.email || '';

  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    setEnviando(true);
    setTexto('');

    const { error } = await supabase.from('mensagens_chat').insert({
      usuario_nome: nomeAtual,
      usuario_email: emailAtual,
      mensagem: conteudo,
    });

    if (error) {
      console.error('Erro ao enviar mensagem:', error);
      setTexto(conteudo);
    }
    setEnviando(false);
  };

  const formatarHora = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {aberto && (
        <div className="mb-3 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
          {/* Cabeçalho */}
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold leading-tight">Chat da Equipe</h3>
              <p className="text-[11px] text-slate-300">Comunicação em tempo real</p>
            </div>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="text-slate-300 hover:text-white text-lg leading-none px-2 py-1 rounded"
              aria-label="Fechar chat"
            >
              ✕
            </button>
          </div>

          {/* Lista de mensagens */}
          <div className="h-72 overflow-y-auto p-3 space-y-2.5 bg-slate-50">
            {mensagens.length === 0 ? (
              <p className="text-xs text-slate-400 text-center my-10">
                Nenhuma mensagem ainda. Envie um aviso para a equipe!
              </p>
            ) : (
              mensagens.map((m) => {
                const ehMinha = emailAtual && m.usuario_email === emailAtual;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col max-w-[82%] ${ehMinha ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <span className="text-[10px] text-slate-500 mb-0.5 px-1">
                      {ehMinha ? 'Você' : m.usuario_nome} • {formatarHora(m.created_at)}
                    </span>
                    <div
                      className={`px-3 py-2 rounded-2xl text-xs sm:text-sm break-words shadow-sm ${
                        ehMinha
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
                      }`}
                    >
                      {m.mensagem}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={fimRef} />
          </div>

          {/* Campo de envio */}
          <form onSubmit={enviarMensagem} className="p-2.5 bg-white border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-indigo-500 text-slate-800"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm px-4 py-3 rounded-full shadow-lg transition-transform active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="hidden sm:inline">Chat</span>
        {naoLidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
            {naoLidas}
          </span>
        )}
      </button>
    </div>
  );
}
