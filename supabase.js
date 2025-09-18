// Lightweight Supabase client loader. Put your keys in supabase.config.js
export const loadSupabase = async () => {
  try{
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./supabase.config.js');
    if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }catch(err){
    return null;
  }
};


