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
  reacoes?: Record<string, string[]>;
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
  status_msg?: string;
  online_at: string;
}

const EMOJIS_RAPIDOS = ['👍', '✅', '😂', '🤦‍♂️', '🧉', '☕', '👀', '🔥', '⚠️'];
const STATUS_ORKUT = [
  'Na sala do Patrimônio',
  'Em vistoria externa',
  'Conferindo plaquetas',
  'Disponível',
];

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
  const [previewToast, setPreviewToast] = useState<MensagemChat | null>(null);
  const [meuStatus, setMeuStatus] = useState<string>(STATUS_ORKUT[0]);
  const [digitandoPor, setDigitandoPor] = useState<string | null>(null);
  const [somAtivo, setSomAtivo] = useState<boolean>(() => {
    try {
      return localStorage.getItem('patrimonio360_chat_som') !== 'false';
    } catch {
      return true;
    }
  });

  const fimRef = useRef<HTMLDivElement | null>(null);
  const abertoRef = useRef(aberto);
  const abaRef = useRef(aba);
  const somAtivoRef = useRef(somAtivo);
  const canalRef = useRef<any>(null);
  const ultimoBroadcastDigitando = useRef<number>(0);
  const timerDigitando = useRef<any>(null);
  const timerToast = useRef<any>(null);

  const nomeAtual = (user as any)?.name || (user as any)?.nome || (user as any)?.email?.split('@')[0] || 'Servidor';
  const emailAtual = (user as any)?.email || '';

  useEffect(() => {
    somAtivoRef.current = somAtivo;
    try {
      localStorage.setItem('patrimonio360_chat_som', String(somAtivo));
    } catch {}
  }, [somAtivo]);

  // Atualiza o título da aba do navegador quando houver mensagens não lidas
  useEffect(() => {
    const tituloOriginal = 'Patrimônio 360';
    if (naoLidas <= 0 || aberto) {
      document.title = tituloOriginal;
      return;
    }
    let alterna = false;
    const interval = setInterval(() => {
      alterna = !alterna;
      document.title = alterna
        ? `(${naoLidas}) Nova mensagem! • Patrimônio 360`
        : tituloOriginal;
    }, 1200);

    return () => {
      clearInterval(interval);
      document.title = tituloOriginal;
    };
  }, [naoLidas, aberto]);

  const tocarAlertaSuave = () => {
    if (!somAtivoRef.current) return;
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([150, 80, 150]);
      }
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.09, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch {}
  };

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
      setPreviewToast(null);
      marcarComoVistos(mensagens, aba);
      setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [aberto, aba]);

  useEffect(() => {
    if (canalRef.current && user) {
      canalRef.current.track({
        name: nomeAtual,
        email: emailAtual,
        status_msg: meuStatus,
        online_at: new Date().toISOString(),
      });
    }
  }, [meuStatus]);

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
      await supabase.rpc('limpar_recados_antigos');

      const { data, error } = await supabase
        .from('mensagens_chat')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);

      if (!error && data) {
        const ordenadas = data.reverse();
        setMensagens(ordenadas);

        // Verifica se já existem recados não lidos ao abrir o app
        const naoLidasIniciais = ordenadas.filter(
          (m: MensagemChat) =>
            m.usuario_email !== emailAtual &&
            !(m.visto_por || []).includes(nomeAtual) &&
            ((m.destinatario || 'Todos') === 'Todos' || m.destinatario === nomeAtual || m.destinatario === emailAtual)
        );
        if (!abertoRef.current && naoLidasIniciais.length > 0) {
          setNaoLidas(naoLidasIniciais.length);
          setPreviewToast(naoLidasIniciais[naoLidasIniciais.length - 1]);
        } else if (abertoRef.current) {
          marcarComoVistos(ordenadas, abaRef.current);
        }
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
    canalRef.current = canal;

    canal
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens_chat' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const nova = payload.new as MensagemChat;
            setDigitandoPor(null);
            setMensagens((prev) => {
              const atualizada = prev.some((m) => m.id === nova.id) ? prev : [...prev, nova];
              const ehParaMim =
                (nova.destinatario || 'Todos') === 'Todos' ||
                nova.destinatario === nomeAtual ||
                nova.destinatario === emailAtual;

              if (abertoRef.current) {
                marcarComoVistos([nova], abaRef.current);
              } else if (nova.usuario_email !== emailAtual && ehParaMim) {
                setNaoLidas((n) => n + 1);
                setPreviewToast(nova);
                tocarAlertaSuave();
                if (timerToast.current) clearTimeout(timerToast.current);
                timerToast.current = setTimeout(() => setPreviewToast(null), 8000);
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
      .on('broadcast', { event: 'digitando' }, ({ payload }) => {
        if (payload?.email && payload.email !== emailAtual) {
          setDigitandoPor(payload.nome || 'Alguém');
          if (timerDigitando.current) clearTimeout(timerDigitando.current);
          timerDigitando.current = setTimeout(() => setDigitandoPor(null), 2800);
        }
      })
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
            status_msg: meuStatus,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      clearInterval(intervalo);
      if (timerDigitando.current) clearTimeout(timerDigitando.current);
      if (timerToast.current) clearTimeout(timerToast.current);
      supabase.removeChannel(canal);
    };
  }, [user]);

  if (!user) return null;

  const abrirPeloToast = () => {
    if (previewToast?.destinatario && previewToast.destinatario !== 'Todos') {
      setAba('direto');
      setDestinatario(previewToast.usuario_nome);
    } else {
      setAba('geral');
    }
    setPreviewToast(null);
    setAberto(true);
  };

  const notificarDigitando = (valor: string) => {
    setTexto(valor);
    const agora = Date.now();
    if (canalRef.current && valor.trim() && agora - ultimoBroadcastDigitando.current > 1800) {
      ultimoBroadcastDigitando.current = agora;
      canalRef.current.send({
        type: 'broadcast',
        event: 'digitando',
        payload: { nome: nomeAtual.split(' ')[0], email: emailAtual },
      });
    }
  };

  const alternarReacao = async (id: string, emoji: string) => {
    setMensagens((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const atuais = { ...(m.reacoes || {}) };
        const lista = [...(atuais[emoji] || [])];
        if (lista.includes(nomeAtual)) {
          const filtrada = lista.filter((u) => u !== nomeAtual);
          if (filtrada.length === 0) delete atuais[emoji];
          else atuais[emoji] = filtrada;
        } else {
          atuais[emoji] = [...lista, nomeAtual];
        }
        return { ...m, reacoes: atuais };
      })
    );

    await supabase.rpc('alternar_reacao_recado', {
      p_id: id,
      p_emoji: emoji,
      p_usuario: nomeAtual,
    });
  };

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
        reacoes: {},
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

  const renderizarTextoComPlaquetas = (conteudo: string) => {
    const partes = conteudo.split(/(#\d+)/g);
    return partes.map((parte, idx) => {
      if (/^#\d+$/.test(parte)) {
        return (
          <span
            key={idx}
            className="inline-block bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] px-1.5 py-0.2 rounded mx-0.5"
            title="Número de tombamento / plaqueta"
          >
            🏷️ {parte}
          </span>
        );
      }
      return <React.Fragment key={idx}>{parte}</React.Fragment>;
    });
  };

  const isColegaAtivo = (c: Colega) => {
    if (onlineUsers.some((u) => u.email?.toLowerCase() === c.email?.toLowerCase())) return true;
    if (!c.ultimo_acesso) return false;
    const diffMin = (Date.now() - new Date(c.ultimo_acesso).getTime()) / 60000;
    return diffMin >= 0 && diffMin <= 3;
  };

  const getStatusOnlineColega = (email: string) => {
    const u = onlineUsers.find((item) => item.email?.toLowerCase() === email?.toLowerCase());
    return u?.status_msg || 'Online agora';
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
      {/* Cartão Toast flutuante quando chega nova mensagem com o chat fechado */}
      {!aberto && previewToast && (
        <div
          onClick={abrirPeloToast}
          role="button"
          tabIndex={0}
          className="mb-2.5 max-w-[300px] sm:max-w-[340px] cursor-pointer bg-slate-900 text-white border-l-4 border-amber-400 rounded-xl shadow-2xl px-3.5 py-2.5 transition-all hover:scale-[1.02]"
        >
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Nova mensagem • {previewToast.usuario_nome.split(' ')[0]}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewToast(null);
              }}
              className="text-slate-400 hover:text-white text-xs leading-none px-1"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-100 line-clamp-2 break-words">
            {previewToast.mensagem}
          </p>
          <span className="block text-[10px] text-indigo-300 mt-1 font-medium">
            Toque para abrir e responder →
          </span>
        </div>
      )}

      {aberto && (
        <div className="mb-3 w-[350px] sm:w-[420px] rounded-2xl bg-white shadow-2xl border border-indigo-200 overflow-hidden flex flex-col">
          {/* Cabeçalho */}
          <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold leading-tight flex items-center gap-2">
                <span>Mural de Recados</span>
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {totalOnline} online
                </span>
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const novoEstado = !somAtivo;
                    setSomAtivo(novoEstado);
                    if (novoEstado) {
                      somAtivoRef.current = true;
                      tocarAlertaSuave();
                    }
                  }}
                  title={somAtivo ? 'Som e vibração ativados (clique para silenciar)' : 'Silenciado (clique para ativar alerta)'}
                  className="text-indigo-200 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/10 transition-colors"
                >
                  {somAtivo ? '🔔' : '🔇'}
                </button>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="text-indigo-200 hover:text-white text-lg leading-none px-2 py-1 rounded hover:bg-white/10"
                  aria-label="Fechar mural"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-indigo-200">
              <span>Seu status:</span>
              <select
                value={meuStatus}
                onChange={(e) => setMeuStatus(e.target.value)}
                className="bg-indigo-950/60 text-white border border-indigo-400/30 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none"
              >
                {STATUS_ORKUT.map((st) => (
                  <option key={st} value={st} className="bg-slate-900 text-white">
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Barra de membros conectados */}
          <div className="bg-indigo-50/90 border-b border-indigo-100 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900/70">
                Equipe ({totalOnline} online)
              </span>
              <span className="text-[10px] text-indigo-600">Dica: use #número para plaqueta</span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              <div className="flex flex-col items-center min-w-[58px]" title={`Você: ${meuStatus}`}>
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-sm">
                    {nomeAtual.charAt(0).toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
                <span className="text-[10px] font-semibold text-slate-700 truncate max-w-[58px] mt-1">
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
                  title={`${c.name} — ${getStatusOnlineColega(c.email)}`}
                  className="flex flex-col items-center min-w-[58px] group"
                >
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-slate-800 group-hover:bg-indigo-600 transition-colors text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-700 group-hover:text-indigo-700 truncate max-w-[58px] mt-1">
                    {c.name.split(' ')[0]}
                  </span>
                  <span className="text-[8px] text-emerald-700 truncate max-w-[58px] leading-none">
                    {getStatusOnlineColega(c.email)}
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
                  className="flex flex-col items-center min-w-[58px] opacity-60 hover:opacity-100 transition-opacity"
                >
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center ring-2 ring-white">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-[58px] mt-1">
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
              className={`flex-1 py-2 text-center transition-colors ${
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
              className={`flex-1 py-2 text-center transition-colors ${
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

          {/* Lista de mensagens */}
          <div className="h-72 overflow-y-auto p-3 space-y-3 bg-slate-100">
            {recadosVisiveis.length === 0 ? (
              <div className="text-center my-10 px-4">
                <p className="text-xs text-slate-500 font-medium">Nenhum recado nesta aba ainda.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ex: "Conferir plaqueta #4582 na sala 03"
                </p>
              </div>
            ) : (
              recadosVisiveis.map((m) => {
                const ehMeu = emailAtual && m.usuario_email === emailAtual;
                const leitores = (m.visto_por || []).filter((n) => n !== m.usuario_nome);
                const foiLido = leitores.length > 0;
                const reacoes = m.reacoes || {};

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col max-w-[88%] ${ehMeu ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <div
                      className={`w-full px-3 py-2 rounded-2xl shadow-sm border ${
                        ehMeu
                          ? 'bg-emerald-50 border-emerald-200 text-slate-800 rounded-br-sm'
                          : 'bg-white border-slate-200 text-slate-800 rounded-bl-sm'
                      }`}
                    >
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

                      <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-snug">
                        {renderizarTextoComPlaquetas(m.mensagem)}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          {EMOJIS_RAPIDOS.map((emoji) => {
                            const quemReagiu = reacoes[emoji] || [];
                            const euReagi = quemReagiu.includes(nomeAtual);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => alternarReacao(m.id, emoji)}
                                title={quemReagiu.length > 0 ? `${emoji} por: ${quemReagiu.join(', ')}` : `Reagir com ${emoji}`}
                                className={`text-[11px] px-1.5 py-0.5 rounded-full border transition-all ${
                                  euReagi
                                    ? 'bg-indigo-100 border-indigo-400 text-indigo-900 font-bold'
                                    : quemReagiu.length > 0
                                    ? 'bg-slate-100 border-slate-300 text-slate-700'
                                    : 'border-transparent opacity-45 hover:opacity-100 hover:bg-slate-100'
                                }`}
                              >
                                {emoji}
                                {quemReagiu.length > 0 && <span className="ml-0.5 text-[10px]">{quemReagiu.length}</span>}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-1 text-[10px]">
                          {ehMeu && foiLido && (
                            <span className="text-slate-500 truncate max-w-[115px]" title={`Lido por: ${leitores.join(', ')}`}>
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
                  </div>
                );
              })
            )}
            <div ref={fimRef} />
          </div>

          {digitandoPor && (
            <div className="px-3 py-1 bg-indigo-50 border-t border-indigo-100 text-[11px] text-indigo-700 font-medium animate-pulse">
              ✍️ {digitandoPor} está digitando...
            </div>
          )}

          {erroEnvio && (
            <div className="px-3 py-1.5 bg-rose-50 border-t border-rose-200 text-[11px] text-rose-700">
              {erroEnvio}
            </div>
          )}

          <form onSubmit={enviarRecado} className="p-2.5 bg-white border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={texto}
              onChange={(e) => notificarDigitando(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviarRecado(e as any);
                }
              }}
              placeholder={aba === 'geral' ? 'Ex: Verificar #1045 no almoxarifado...' : `Mensagem para ${destinatario}...`}
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

      {/* Botão flutuante: muda de cor e pulsa "Nova mensagem!" quando há recado não lido */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`relative flex items-center gap-2 font-semibold text-sm px-4 py-3 rounded-full shadow-lg transition-all active:scale-95 ${
          naoLidas > 0 && !aberto
            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 ring-4 ring-amber-300/60 animate-bounce'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}
      >
        {naoLidas > 0 && !aberto ? (
          <>
            <span className="text-base leading-none">💬</span>
            <span>Nova mensagem!</span>
            <span className="text-xs bg-slate-900 text-amber-300 font-bold px-2 py-0.5 rounded-full">
              {naoLidas}
            </span>
          </>
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">Recados</span>
            <span className="text-xs bg-indigo-800/80 px-2 py-0.5 rounded-full text-indigo-100">
              {totalOnline} online
            </span>
          </>
        )}
      </button>
    </div>
  );
}
