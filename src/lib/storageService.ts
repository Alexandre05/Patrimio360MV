import { supabase } from './supabase';

/**
 * Faz o upload de uma foto em base64 para o Supabase Storage
 */
export async function uploadAssetPhoto(base64Image: string, path: string): Promise<string> {
  try {
    // 1. O navegador converte a foto de texto (base64) para arquivo real (Blob)
    const response = await fetch(base64Image);
    const blob = await response.blob();

    // 2. Faz o envio direto para o cofre 'assets' do Supabase
    const { data, error } = await supabase.storage
      .from('assets')
      .upload(path, blob, {
        contentType: blob.type,
        upsert: true // Se já existir uma foto com o mesmo nome, ele substitui
      });

    if (error) {
      console.error('[Storage] Erro ao enviar foto para o Supabase:', error.message);
      throw error;
    }

    // 3. Pega o link público permanente da foto para salvar no banco
    const { data: { publicUrl } } = supabase.storage
      .from('assets')
      .getPublicUrl(path);

    return publicUrl;
  } catch (error) {
    console.error('[Storage] Falha crítica no processamento da imagem:', error);
    throw error;
  }
}