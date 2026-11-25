import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

interface MensagemChat {
  id: string;
  usuario_nome: string;
  usuario_email?: string;
  destinatario?: string;
  mensagem: string;
  visto_por?: string[];
  created_at: string;
}

interface Colega {
  name: string;
  email: string;
}

export function ChatFlutuante() {
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'geral' | 'direto'>('geral');
  const [colegas, setColegas] = useState<Colega[]>([]);
  const [destinatario, setDestinatario] = useState<string>('Todos');
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const abertoRef = useRef(aberto);

  const nomeAtual = (user as any)?.name || (user as any)?.nome || (user as any)?.email?.split('@')[0] || 'Servidor';
  const emailAtual = (user as any)?.email || '';

  // Marca recados de outros usuários como vistos por mim
  const marcarComoVistos = async (lista: MensagemChat[]) => {
    if (!nomeAtual) return;
    const pendentes = lista.filter(
      (m) => m.usuario_email !== emailAtual && !(m.visto_por || []).includes(nomeAtual)
    );
    for (const m of pendentes) {
      const novaLista = [...(m.visto_por || []), nomeAtual];
      await supabase
        .from('mensagens_chat')
        .update({ visto_por: novaLista })
        .eq('id', m.id);
    }
  };

  useEffect(() => {
    abertoRef.current = aberto;
    if (aberto) {
      setNaoLidas(0);
      marcarComoVistos(mensagens);
      setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [aberto]);

  useEffect(() => {
    if (!user) return;

    // Carrega colegas cadastrados na tabela users
    const carregarColegas = async () => {
      const { data } = await supabase.from('users').select('name, email');
      if (data) {
        const filtrados = data
          .filter((u: any) => u.email && u.email !== emailAtual)
          .map((u: any) => ({ name: u.name || u.email.split('@')[0], email: u.email }));
        setColegas(filtrados);
      }
    };

    const carregarHistorico = async () => {
      const { data, error } = await supabase
        .from('mensagens_chat')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);

      if (!error && data) {
        const ordenadas = data.reverse();
        setMensagens(ordenadas);
        if (abertoRef.current) marcarComoVistos(ordenadas);
      }
    };

    carregarColegas();
    carregarHistorico();

    const canal = supabase
      .channel('mural-orkut-patrimonio360')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens_chat' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const nova = payload.new as MensagemChat;
            setMensagens((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]));
            if (abertoRef.current) {
              marcarComoVistos([nova]);
            } else if (nova.usuario_email !== emailAtual) {
              setNaoLidas((n) => n + 1);
            }
            setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
          } else if (payload.eventType === 'UPDATE') {
            const atualizada = payload.new as MensagemChat;
            setMensagens((prev) => prev.map((m) => (m.id === atualizada.id ? atualizada : m)));
          } else if (payload.eventType === 'DELETE') {
            const removida = payload.old as { id: string };
            setMensagens((prev) => prev.filter((m) => m.id !== removida.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [user]);

  if (!user) return null;

  const enviarRecado = async (e: React.FormEvent) => {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    setEnviando(true);
    setErroEnvio(null);

    const destinoFinal = aba === 'geral' ? 'Todos' : destinatario;

    const { data, error } = await supabase
      .from('mensagens_chat')
      .insert({
        usuario_nome: nomeAtual,
        usuario_email: emailAtual,
        destinatario: destinoFinal,
        mensagem: conteudo,
        visto_por: [],
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao enviar recado:', error);
      setErroEnvio('Falha ao enviar (' + (error.message || 'erro de permissão') + '). Tente novamente.');
    } else {
      setTexto('');
      if (data) {
        setMensagens((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
        setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      }
    }
    setEnviando(false);
  };

  const apagarRecado = async (id: string) => {
    await supabase.from('mensagens_chat').delete().eq('id', id);
    setMensagens((prev) => prev.filter((m) => m.id !== id));
  };

  const formatarDataHora = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
        ' às ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Filtra recados conforme a aba selecionada
  const recadosVisiveis = mensagens.filter((m) => {
    const dest = m.destinatario || 'Todos';
    if (aba === 'geral') return dest === 'Todos';
    return dest !== 'Todos' && (dest === nomeAtual || dest === emailAtual || m.usuario_email === emailAtual);
  });

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end">
      {aberto && (
        <div className="mb-3 w-[340px] sm:w-[400px] rounded-2xl bg-white shadow-2xl border border-indigo-200 overflow-hidden flex flex-col">
          {/* Cabeçalho estilo Mural */}
          <div className="bg-gradient-to-r from-indigo-700 to-slate-900 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold leading-tight flex items-center gap-1.5">
                <span>Mural de Recados</span>
                <span className="text-[10px] bg-indigo-500/40 px-2 py-0.5 rounded-full font-normal">
                  {colegas.length + 1} membros
                </span>
              </h3>
              <p className="text-[11px] text-indigo-200">Comunicação da equipe em tempo real</p>
            </div>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="text-indigo-200 hover:text-white text-lg leading-none px-2 py-1 rounded"
              aria-label="Fechar mural"
            >
              ✕
            </button>
          </div>

          {/* Abas estilo Orkut: Mural Geral vs Recados Diretos */}
          <div className="flex border-b border-slate-200 bg-indigo-50/60 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setAba('geral'); setDestinatario('Todos'); }}
              className={`flex-1 py-2.5 text-center transition-colors ${
                aba === 'geral'
                  ? 'bg-white text-indigo-700 border-b-2 border-indigo-600'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              Mural Geral (Todos)
            </button>
            <button
              type="button"
              onClick={() => {
                setAba('direto');
                if (colegas.length > 0 && destinatario === 'Todos') {
                  setDestinatario(colegas[0].name);
                }
              }}
              className={`flex-1 py-2.5 text-center transition-colors ${
                aba === 'direto'
                  ? 'bg-white text-indigo-700 border-b-2 border-indigo-600'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              Recados Diretos ({colegas.length})
            </button>
          </div>

          {/* Seletor de colega quando estiver na aba Recados Diretos */}
          {aba === 'direto' && (
            <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Para:</span>
              {colegas.length === 0 ? (
                <span className="text-slate-400">Nenhum outro colega cadastrado ainda</span>
              ) : (
                <select
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  {colegas.map((c) => (
                    <option key={c.email} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Lista de recados (Scraps) */}
          <div className="h-80 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {recadosVisiveis.length === 0 ? (
              <div className="text-center my-12 px-4">
                <p className="text-xs text-slate-500 font-medium">Nenhum recado nesta aba ainda.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Deixe um recado abaixo — quando um colega abrir o sistema, aparecerá "Visto por..." aqui!
                </p>
              </div>
            ) : (
              recadosVisiveis.map((m) => {
                const ehMeu = emailAtual && m.usuario_email === emailAtual;
                const leitores = (m.visto_por || []).filter((n) => n !== m.usuario_nome);
                const inicial = (m.usuario_nome || 'S').charAt(0).toUpperCase();

                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl border shadow-sm transition-all ${
                      ehMeu
                        ? 'bg-indigo-50/80 border-indigo-200 ml-4'
                        : 'bg-white border-slate-200 mr-4'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${ehMeu ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                          {inicial}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 leading-none">
                            {ehMeu ? 'Você' : m.usuario_nome}
                            {m.destinatario && m.destinatario !== 'Todos' && (
                              <span className="font-normal text-indigo-600"> → {m.destinatario}</span>
                            )}
                          </p>
                          <span className="text-[10px] text-slate-400">{formatarDataHora(m.created_at)}</span>
                        </div>
                      </div>

                      {ehMeu && (
                        <button
                          type="button"
                          onClick={() => apagarRecado(m.id)}
                          title="Apagar recado"
                          className="text-slate-400 hover:text-rose-600 text-xs px-1"
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap break-words pl-9">
                      {m.mensagem}
                    </p>

                    {/* Rodapé de confirmação de entrega e visualização */}
                    <div className="mt-2 pt-1.5 border-t border-slate-200/70 pl-9 flex items-center justify-between text-[10px]">
                      {leitores.length > 0 ? (
                        <span className="text-emerald-700 font-medium">
                          ✓✓ Visto por: {leitores.join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          ✓ Entregue no mural (aguardando leitura)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={fimRef} />
          </div>

          {/* Aviso de erro caso ocorra falha de rede */}
          {erroEnvio && (
            <div className="px-3 py-1.5 bg-rose-50 border-t border-rose-200 text-[11px] text-rose-700">
              {erroEnvio}
            </div>
          )}

          {/* Caixa para escrever recado */}
          <form onSubmit={enviarRecado} className="p-2.5 bg-white border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={aba === 'geral' ? 'Escreva um recado para todos...' : `Recado para ${destinatario}...`}
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-indigo-500 text-slate-800"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
            >
              {enviando ? '...' : 'Postar'}
            </button>
          </form>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-3 rounded-full shadow-lg transition-transform active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="hidden sm:inline">Recados</span>
        {naoLidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
            {naoLidas}
          </span>
        )}
      </button>
    </div>
  );
}
