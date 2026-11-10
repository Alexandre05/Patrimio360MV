import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iqigbdzncjswpluhvtff.supabase.co';
const supabaseAnonKey = 'sb_publishable_LECo9twrRiOzLZ-Vn4Eshg_SwB4Ptb6';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);