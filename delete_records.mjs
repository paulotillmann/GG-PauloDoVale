import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lnngozcxzqowtvcmojhr.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxubmdvemN4enFvd3R2Y21vamhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA5MTM0NiwiZXhwIjoyMDkyNjY3MzQ2fQ.5XJL_v0fU860Lj3WZvSjMb3vSKaJT2wC8YPFKBGnzAU';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  // Contar antes
  const { count: countArq } = await supabase.from('requerimento_arquivos').select('*', { count: 'exact', head: true });
  const { count: countReq } = await supabase.from('requerimento').select('*', { count: 'exact', head: true });
  console.log(`Antes: ${countReq} requerimentos, ${countArq} arquivos`);

  // Deletar arquivos primeiro (FK)
  console.log('Deletando requerimento_arquivos...');
  const { error: err1, count: del1 } = await supabase.from('requerimento_arquivos').delete({ count: 'exact' }).neq('id', '00000000-0000-0000-0000-000000000000');
  if (err1) { console.error('ERRO arquivos:', err1); } else { console.log(`Deletados: ${del1} arquivos`); }

  // Deletar requerimentos
  console.log('Deletando requerimento...');
  const { error: err2, count: del2 } = await supabase.from('requerimento').delete({ count: 'exact' }).neq('id', '00000000-0000-0000-0000-000000000000');
  if (err2) { console.error('ERRO requerimentos:', err2); } else { console.log(`Deletados: ${del2} requerimentos`); }

  // Contar depois
  const { count: afterArq } = await supabase.from('requerimento_arquivos').select('*', { count: 'exact', head: true });
  const { count: afterReq } = await supabase.from('requerimento').select('*', { count: 'exact', head: true });
  console.log(`Depois: ${afterReq} requerimentos, ${afterArq} arquivos`);
}

main();
