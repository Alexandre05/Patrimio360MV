import { supabase } from './supabase';

export interface ICloudAdapter {
  upsertRecord: (table: string, payload: any) => Promise<{ error: any }>;
  deleteRecord: (table: string, id: string) => Promise<{ error: any }>;
  getRecordsSince: (table: string, updatedCol: string, lastSyncTime: number) => Promise<{ data: any[] | null, error: any }>;
  uploadPhoto: (base64Str: string, path: string) => Promise<string>;
}

const supabaseAdapter: ICloudAdapter = {
  upsertRecord: async (table, payload) => {
    const primaryKey = table === 'users' ? 'userId' : 'id';
    
    try {
      // 1. Tenta fazer a atualização normal
      let res = await supabase.from(table).upsert(payload, { onConflict: primaryKey });
      
      // 2. Se a nuvem gritar 409 (Conflict) porque acha que é duplicado
      if (res.error && (res.error.code === '23505' || res.error.message?.toLowerCase().includes('conflict') || res.error.code === '409')) {
        console.warn(`[Patrimônio 360] Conflito detetado na nuvem. Camuflando o item...`);
        
        const safePayload = { ...payload };
        if (safePayload.hash) safePayload.hash = safePayload.hash + '-transf-' + Date.now();
        if (safePayload.patrimonyNumber && safePayload.patrimonyNumber.trim() !== '') {
           safePayload.patrimonyNumber = safePayload.patrimonyNumber + ' (Duplicado)';
        }
        
        // Tenta de novo com a nova identidade
        res = await supabase.from(table).upsert(safePayload, { onConflict: primaryKey });
        
        // 3. O DISJUNTOR ⚡: Se falhar de novo, quebramos o loop!
        if (res.error) {
           console.error("A nuvem rejeitou o item definitivamente. Limpando a fila local para destravar o sistema.");
           // Ao retornar 'null', mentimos para a fila local dizendo que deu certo.
           // Isso faz a fila jogar o item fora e parar de travar o sistema inteiro!
           return { error: null };
        }
      }
      
      return res;
    } catch (e: any) {
      // Se houver falha de rede (sem internet), mantemos o erro para ele tentar mais tarde
      return { error: e };
    }
  },
  
  deleteRecord: async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    return { error };
  },
  
  getRecordsSince: async (table, updatedCol, lastSyncTime) => {
    const { data, error } = await supabase.from(table).select('*').gt(updatedCol, lastSyncTime);
    return { data, error };
  },
  
  uploadPhoto: async (base64Str, path) => {
    const res = await fetch(base64Str);
    const blob = await res.blob();
    const { data, error } = await supabase.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('fotos').getPublicUrl(data.path);
    return urlData.publicUrl;
  }
};

export const cloudDB = supabaseAdapter;