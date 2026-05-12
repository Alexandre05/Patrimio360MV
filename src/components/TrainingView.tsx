import React from 'react';
import { Card, Button } from './UI';
import { 
  BookOpen, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  ChevronRight, 
  GraduationCap,
  Lightbulb,
  FileVideo,
  Play,
  Download,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { cn } from '../lib/utils';

export function TrainingView() {
  const guides = [
    {
      title: "Padrão de Conservação",
      description: "Como classificar corretamente o estado físico de um bem.",
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      content: [
        { label: "Novo", detail: "Sem uso, na embalagem ou instalado recentemente sem marcas." },
        { label: "Bom", detail: "Em uso, mas sem danos estruturais, apenas desgaste natural leve." },
        { label: "Regular", detail: "Funcional, mas com avarias estéticas ou necessidade de reparo leve." },
        { label: "Ruim", detail: "Avarias graves, componentes faltando ou funcionamento precário." },
        { label: "Inservível", detail: "Sem possibilidade de uso ou recuperação econômica viável." }
      ]
    },
    {
      title: "Guia de Fotografia",
      description: "Dicas para fotos que servem como prova técnica.",
      icon: Camera,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      content: [
        { label: "Luz", detail: "Sempre a favor da luz. Evite fotos contra janelas brilhantes." },
        { label: "Contexto", detail: "Tire uma foto panorâmica do ambiente antes dos itens." },
        { label: "Identificação", detail: "A etiqueta de patrimônio deve estar legível na foto." },
        { label: "Detalhes", detail: "Em caso de danos, tire um close-up da avaria específica." }
      ]
    },
    {
      title: "Erros Comuns",
      description: "O que evitar para não ter sua vistoria rejeitada.",
      icon: AlertTriangle,
      color: "text-rose-600",
      bg: "bg-rose-50",
      content: [
        { label: "Duplicidade", detail: "Cadastrar o mesmo item duas vezes com números diferentes." },
        { label: "Localização", detail: "Esquecer de mudar a sala no app ao trocar de ambiente." },
        { label: "Descrições", detail: "Usar termos genéricos como 'Cadeira'. Use 'Cadeira Giratória Preta'." }
      ]
    }
  ];

  const videos = [
    {
      title: "Introdução ao Patri-MV",
      duration: "05:20",
      thumbnail: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60",
      category: "Básico"
    },
    {
      title: "Como usar o Scanner QR",
      duration: "03:45",
      thumbnail: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&auto=format&fit=crop&q=60",
      category: "Operacional"
    },
    {
      title: "Inventário de TI Complexo",
      duration: "08:12",
      thumbnail: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60",
      category: "Especializado"
    }
  ];

  const resources = [
    { title: "Manual do Vistoriador 2024", type: "PDF", size: "2.4 MB" },
    { title: "Tabela de Depreciação", type: "XLSX", size: "1.1 MB" },
    { title: "Guia Rápido de Atalhos", type: "PDF", size: "450 KB" }
  ];

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Treinamento */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[3rem] p-10 md:p-16 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
          <GraduationCap className="w-full h-full scale-150 rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col gap-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full w-fit border border-white/10">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">Academia Patri-MV</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-black tracking-tight leading-tight">
            Excelência em <br /> Vistoria Patrimonial
          </h1>
          <p className="text-slate-400 font-medium text-sm leading-relaxed">
            Este guia foi desenvolvido para padronizar as informações coletadas em campo, garantindo que todos os vistoriadores falem a mesma língua e gerem relatórios de alta precisão.
          </p>
        </div>
      </div>

      {/* Cards de Conhecimento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {guides.map((guide, i) => (
          <Card key={i} className="group p-8 rounded-[2.5rem] border-slate-100 shadow-sm bg-white hover:border-indigo-100 transition-all flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-2", guide.bg)}>
                <guide.icon className={cn("w-7 h-7", guide.color)} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-black text-slate-900">{guide.title}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{guide.description}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {guide.content.map((item, idx) => (
                <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-slate-50 group-hover:bg-white border border-transparent group-hover:border-slate-100 transition-all">
                  <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">{idx + 1}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{item.label}</span>
                    <span className="text-xs font-medium text-slate-500 leading-relaxed">{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Tutorial em Vídeo */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-display font-black text-slate-900">Vídeos Instrutivos</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aprenda na prática com nossos especialistas</p>
          </div>
          <Button variant="outline" className="rounded-2xl text-[10px] font-black uppercase tracking-widest px-6 h-12">
            Ver Todos <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {videos.map((video, idx) => (
            <div key={idx} className="group cursor-pointer flex flex-col gap-4">
              <div className="relative aspect-video rounded-[2rem] overflow-hidden shadow-lg shadow-black/5 ring-1 ring-slate-100 transition-transform group-hover:scale-[1.02] duration-500">
                <img 
                  src={video.thumbnail} 
                  alt={video.title} 
                  className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500">
                    <Play className="w-8 h-8 fill-current" />
                  </div>
                </div>
                <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-black text-white uppercase tracking-widest">
                  {video.duration}
                </div>
              </div>
              <div className="flex flex-col gap-1 px-2">
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{video.category}</span>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{video.title}</h4>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Checklist e Recursos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-indigo-50 border-indigo-100 p-10 rounded-[3rem] flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight">Checklist de Segurança</h2>
            <p className="text-sm font-medium text-slate-600 leading-relaxed">
              Antes de finalizar cada ambiente, certifique-se de que não esqueceu nenhum bem em locais escondidos.
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              "Bateria Carregada",
              "Internet Ativa",
              "Crachá Visível",
              "Caneta Reserva"
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-slate-50 border-slate-100 p-10 rounded-[3rem] flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black text-slate-900">Documentação Auxiliar</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Arquivos para download offline</p>
          </div>

          <div className="flex flex-col gap-3">
            {resources.map((res, idx) => (
              <div key={idx} className="group flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 rounded-xl flex items-center justify-center transition-colors">
                    <FileVideo className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{res.title}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{res.type} • {res.size}</span>
                  </div>
                </div>
                <button className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-indigo-600 transition-colors">
                  <Download className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          <Button className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[10px]">
            Acessar Repositório Completo <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </Card>
      </div>
    </div>
  );
}
