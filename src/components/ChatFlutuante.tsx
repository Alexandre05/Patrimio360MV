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

interface UsuarioOnline {
  name: string;
  email: string;
  online_at: string;
}

export function ChatFlutuante() {
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'geral' | 'direto'>('geral');
  const [colegas, setColegas] = useState<Colega[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UsuarioOnline[]>([]);
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

    // Canal único com Postgres Changes (recados) + Presence (quem está online agora)
    const canal = supabase.channel('mural-orkut-patrimonio360', {
      config: {
        presence: {
          key: emailAtual || nomeAtual,
        },
      },
    });

    canal
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
      .on('presence', { event: 'sync' }, () => {
        const state = canal.presenceState<UsuarioOnline>();
        const listaAtivos: UsuarioOnline[] = [];
        Object.values(state).forEach((presencas) => {
          if (presencas && presencas.length > 0) {
            const u = presencas[0];
            if (!listaAtivos.some((item) => item.email === u.email)) {
              listaAtivos.push(u);
            }
          }
        });
        setOnlineUsers(listaAtivos);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await canal.track({
            name: nomeAtual,
            email: emailAtual,
            online_at: new Date().toISOString(),
          });
        }
      });

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

  const recadosVisiveis = mensagens.filter((m) => {
    const dest = m.destinatario || 'Todos';
    if (aba === 'geral') return dest === 'Todos';
    return dest !== 'Todos' && (dest === nomeAtual || dest === emailAtual || m.usuario_email === emailAtual);
  });

  const isEmailOnline = (email?: string) =>
    !!email && onlineUsers.some((u) => u.email === email);

  const totalOnline = onlineUsers.length > 0 ? onlineUsers.length : 1;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end">
      {aberto && (
        <div className="mb-3 w-[345px] sm:w-[410px] rounded-2xl bg-white shadow-2xl border border-indigo-200 overflow-hidden flex flex-col">
          {/* Cabeçalho moderno + nostalgia Orkut */}
          <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold leading-tight flex items-center gap-2">
                <span>Mural de Recados</span>
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {totalOnline} online
                </span>
              </h3>
              <p className="text-[11px] text-indigo-200 mt-0.5">Equipe Patrimônio 360</p>
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

          {/* Barra estilo "Amigos Online" do Orkut */}
          <div className="bg-indigo-50/90 border-b border-indigo-100 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900/70">
                Conectados agora ({totalOnline})
              </span>
              <span className="text-[10px] text-indigo-600">Toque para recado direto</span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {/* Você sempre aparece primeiro */}
              <div className="flex flex-col items-center min-w-[54px]">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-sm">
                    {nomeAtual.charAt(0).toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
                <span className="text-[10px] font-semibold text-slate-700 truncate max-w-[54px] mt-1">
                  Você
                </span>
              </div>

              {/* Colegas online */}
              {onlineUsers
                .filter((u) => u.email !== emailAtual)
                .map((u) => (
                  <button
                    key={u.email || u.name}
                    type="button"
                    onClick={() => {
                      setAba('direto');
                      setDestinatario(u.name);
                    }}
                    title={`Enviar recado direto para ${u.name}`}
                    className="flex flex-col items-center min-w-[54px] group"
                  >
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-slate-800 group-hover:bg-indigo-600 transition-colors text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-sm">
                        {(u.name || 'C').charAt(0).toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-700 group-hover:text-indigo-700 truncate max-w-[54px] mt-1">
                      {u.name.split(' ')[0]}
                    </span>
                  </button>
                ))}

              {/* Colegas cadastrados que estão offline no momento */}
              {colegas
                .filter((c) => !isEmailOnline(c.email))
                .map((c) => (
                  <button
                    key={c.email}
                    type="button"
                    onClick={() => {
                      setAba('direto');
                      setDestinatario(c.name);
                    }}
                    title={`${c.name} (offline — deixar recado)`}
                    className="flex flex-col items-center min-w-[54px] opacity-55 hover:opacity-100 transition-opacity"
                  >
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center ring-2 ring-white">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-[54px] mt-1">
                      {c.name.split(' ')[0]}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* Abas Mural Geral vs Recados Diretos */}
          <div className="flex border-b border-slate-200 bg-white text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setAba('geral'); setDestinatario('Todos'); }}
              className={`flex-1 py-2.5 text-center transition-colors ${
                aba === 'geral'
                  ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/30'
                  : 'text-slate-500 hover:text-indigo-600'
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
                  ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/30'
                  : 'text-slate-500 hover:text-indigo-600'
              }`}
            >
              Recados Diretos ({colegas.length})
            </button>
          </div>

          {/* Seletor de colega na aba Recados Diretos */}
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
                      {c.name} {isEmailOnline(c.email) ? '(online)' : '(offline)'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Lista de recados (Scraps) */}
          <div className="h-72 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {recadosVisiveis.length === 0 ? (
              <div className="text-center my-10 px-4">
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
                const autorOnline = ehMeu || isEmailOnline(m.usuario_email);

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
                        <div className="relative">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${ehMeu ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                            {inicial}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                              autorOnline ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
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

          {erroEnvio && (
            <div className="px-3 py-1.5 bg-rose-50 border-t border-rose-200 text-[11px] text-rose-700">
              {erroEnvio}
            </div>
          )}

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

      {/* Botão flutuante com contador de quem está online */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-3 rounded-full shadow-lg transition-transform active:scale-95"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="hidden sm:inline">Recados</span>
        <span className="text-xs bg-indigo-800/80 px-2 py-0.5 rounded-full text-indigo-100">
          {totalOnline} online
        </span>
        {naoLidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
            {naoLidas}
          </span>
        )}
      </button>
    </div>
  );
}
