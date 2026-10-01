import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://monbtcpsdbefjddzylhm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbmJ0Y3BzZGJlZmpkZHp5bGhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODMxNTgsImV4cCI6MjEwNTA1OTE1OH0.UDo2xnyWOx20I1IrEi3c1eWOQibWpOJ25pgO2TC1VjI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);