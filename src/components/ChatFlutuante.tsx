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
  ultimo_acesso?: string;
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
  const abaRef = useRef(aba);

  const nomeAtual = (user as any)?.name || (user as any)?.nome || (user as any)?.email?.split('@')[0] || 'Servidor';
  const emailAtual = (user as any)?.email || '';

  // Marca em lote como lidos apenas os recados da aba que o usuário realmente está vendo
  const marcarComoVistos = async (lista: MensagemChat[], abaAtiva: 'geral' | 'direto') => {
    if (!nomeAtual || !abertoRef.current) return;

    const pendentesIds = lista
      .filter((m) => {
        const dest = m.destinatario || 'Todos';
        const pertenceAba = abaAtiva === 'geral'
          ? dest === 'Todos'
          : dest !== 'Todos' && (dest === nomeAtual || dest === emailAtual);
        const jaLi = (m.visto_por || []).includes(nomeAtual);
        return pertenceAba && m.usuario_email !== emailAtual && !jaLi;
      })
      .map((m) => m.id);

    if (pendentesIds.length === 0) return;

    // Atualiza visualmente na hora (otimista) e grava de forma atômica no banco
    setMensagens((prev) =>
      prev.map((m) =>
        pendentesIds.includes(m.id)
          ? { ...m, visto_por: Array.from(new Set([...(m.visto_por || []), nomeAtual])) }
          : m
      )
    );

    await supabase.rpc('marcar_recados_lidos', {
      p_ids: pendentesIds,
      p_leitor: nomeAtual,
    });
  };

  useEffect(() => {
    abertoRef.current = aberto;
    abaRef.current = aba;
    if (aberto) {
      setNaoLidas(0);
      marcarComoVistos(mensagens, aba);
      setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [aberto, aba]);

  useEffect(() => {
    if (!user) return;

    const registrarBatimento = async () => {
      if (!emailAtual) return;
      await supabase
        .from('users')
        .update({ ultimo_acesso: new Date().toISOString() })
        .ilike('email', emailAtual);
    };

    const carregarColegas = async () => {
      const { data } = await supabase.from('users').select('name, email, ultimo_acesso');
      if (data) {
        const filtrados = data
          .filter((u: any) => u.email && u.email.toLowerCase() !== emailAtual.toLowerCase())
          .map((u: any) => ({
            name: u.name || u.email.split('@')[0],
            email: u.email,
            ultimo_acesso: u.ultimo_acesso,
          }));
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
        if (abertoRef.current) marcarComoVistos(ordenadas, abaRef.current);
      }
    };

    registrarBatimento();
    carregarColegas();
    carregarHistorico();

    const intervalo = setInterval(() => {
      registrarBatimento();
      carregarColegas();
    }, 60000);

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
            setMensagens((prev) => {
              const atualizada = prev.some((m) => m.id === nova.id) ? prev : [...prev, nova];
              if (abertoRef.current) {
                marcarComoVistos([nova], abaRef.current);
              } else if (nova.usuario_email !== emailAtual) {
                setNaoLidas((n) => n + 1);
              }
              return atualizada;
            });
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
      clearInterval(intervalo);
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

  const formatarHora = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const isColegaAtivo = (c: Colega) => {
    if (onlineUsers.some((u) => u.email?.toLowerCase() === c.email?.toLowerCase())) return true;
    if (!c.ultimo_acesso) return false;
    const diffMin = (Date.now() - new Date(c.ultimo_acesso).getTime()) / 60000;
    return diffMin >= 0 && diffMin <= 3;
  };

  const textoStatusColega = (c: Colega) => {
    if (isColegaAtivo(c)) return 'online';
    if (!c.ultimo_acesso) return 'offline';
    const diffMin = Math.floor((Date.now() - new Date(c.ultimo_acesso).getTime()) / 60000);
    if (diffMin < 60) return `há ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    return 'offline';
  };

  const colegasOnline = colegas.filter(isColegaAtivo);
  const colegasOffline = colegas.filter((c) => !isColegaAtivo(c));
  const totalOnline = 1 + colegasOnline.length;

  const recadosVisiveis = mensagens.filter((m) => {
    const dest = m.destinatario || 'Todos';
    if (aba === 'geral') return dest === 'Todos';
    return dest !== 'Todos' && (dest === nomeAtual || dest === emailAtual || m.usuario_email === emailAtual);
  });

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end">
      {aberto && (
        <div className="mb-3 w-[345px] sm:w-[410px] rounded-2xl bg-white shadow-2xl border border-indigo-200 overflow-hidden flex flex-col">
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

          {/* Barra de membros conectados */}
          <div className="bg-indigo-50/90 border-b border-indigo-100 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900/70">
                Conectados agora ({totalOnline})
              </span>
              <span className="text-[10px] text-indigo-600">Toque para recado direto</span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
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

              {colegasOnline.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => {
                    setAba('direto');
                    setDestinatario(c.name);
                  }}
                  title={`${c.name} — online agora`}
                  className="flex flex-col items-center min-w-[54px] group"
                >
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-slate-800 group-hover:bg-indigo-600 transition-colors text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-700 group-hover:text-indigo-700 truncate max-w-[54px] mt-1">
                    {c.name.split(' ')[0]}
                  </span>
                </button>
              ))}

              {colegasOffline.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => {
                    setAba('direto');
                    setDestinatario(c.name);
                  }}
                  title={`${c.name} (${textoStatusColega(c)})`}
                  className="flex flex-col items-center min-w-[54px] opacity-60 hover:opacity-100 transition-opacity"
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
                  <span className="text-[8px] text-slate-400 leading-none">
                    {textoStatusColega(c)}
                  </span>
                </button>
              ))}
            </div>
          </div>

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
                      {c.name} ({textoStatusColega(c)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Lista de mensagens com tiques estilo WhatsApp */}
          <div className="h-72 overflow-y-auto p-3 space-y-2.5 bg-slate-100">
            {recadosVisiveis.length === 0 ? (
              <div className="text-center my-10 px-4">
                <p className="text-xs text-slate-500 font-medium">Nenhum recado nesta aba ainda.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Deixe um recado abaixo — os tiques ficarão azuis assim que for lido!
                </p>
              </div>
            ) : (
              recadosVisiveis.map((m) => {
                const ehMeu = emailAtual && m.usuario_email === emailAtual;
                const leitores = (m.visto_por || []).filter((n) => n !== m.usuario_nome);
                const foiLido = leitores.length > 0;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col max-w-[85%] ${ehMeu ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <div
                      className={`w-full px-3 py-2 rounded-2xl shadow-sm border ${
                        ehMeu
                          ? 'bg-emerald-50 border-emerald-200 text-slate-800 rounded-br-sm'
                          : 'bg-white border-slate-200 text-slate-800 rounded-bl-sm'
                      }`}
                    >
                      {/* Cabeçalho do balão */}
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[11px] font-bold text-indigo-700">
                          {ehMeu ? 'Você' : m.usuario_nome}
                          {m.destinatario && m.destinatario !== 'Todos' && (
                            <span className="font-normal text-slate-500"> → {m.destinatario}</span>
                          )}
                        </span>
                        {ehMeu && (
                          <button
                            type="button"
                            onClick={() => apagarRecado(m.id)}
                            title="Apagar mensagem"
                            className="text-slate-400 hover:text-rose-600 text-[11px] leading-none"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Texto da mensagem */}
                      <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-snug">
                        {m.mensagem}
                      </p>

                      {/* Rodapé estilo WhatsApp: hora + tiques (✓ cinza = entregue | ✓✓ azul = lido) */}
                      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px]">
                        {ehMeu && foiLido && (
                          <span className="text-slate-500 truncate max-w-[170px]" title={`Lido por: ${leitores.join(', ')}`}>
                            Lido por {leitores.map((n) => n.split(' ')[0]).join(', ')}
                          </span>
                        )}
                        <span className="text-slate-400">{formatarHora(m.created_at)}</span>
                        {ehMeu && (
                          <span
                            className={`font-extrabold tracking-tighter text-xs ${
                              foiLido ? 'text-sky-500' : 'text-slate-400'
                            }`}
                            title={foiLido ? `Lido por: ${leitores.join(', ')}` : 'Entregue'}
                          >
                            {foiLido ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
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
              placeholder={aba === 'geral' ? 'Escreva para todos...' : `Mensagem para ${destinatario}...`}
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-indigo-500 text-slate-800"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
            >
              {enviando ? '...' : 'Enviar'}
            </button>
          </form>
        </div>
      )}

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
