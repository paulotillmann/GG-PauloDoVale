// removed import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "https://evolution.technocode.site";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "8GJGnDzDfDYQiMFabMWA3e8kFup8LkJY";
const INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "Paulo do Vale";

// Initialize Supabase Client (Service Role is needed to execute cron without a specific user session)
const getSupabase = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

// Function to send WhatsApp message via Evolution API
async function sendWhatsApp(phone: string, fullName: string) {
  // Clean phone number: keep only numbers
  const cleanPhone = phone.replace(/\D/g, "");
  
  // Format destination number (Evolution expects country code)
  let waNumber = cleanPhone;
  if (!waNumber.startsWith("55") && waNumber.length >= 10) {
    waNumber = "55" + waNumber;
  }

  const firstName = fullName.split(' ')[0];
  const message = `Olá *${firstName}*, tudo bem?\n\nHoje é um dia muito especial! Em nome do Gabinete do Vereador Paulo do Vale, gostaríamos de lhe desejar um **Feliz Aniversário**! 🎉🥳\n\nQue seu dia seja repleto de alegrias, saúde e paz. Um forte abraço!`;

  const payload = {
    number: waNumber,
    options: {
      delay: 1200,
      presence: "composing",
      linkPreview: false
    },
    text: message
  };

  const url = `${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(INSTANCE_NAME)}`;
  
  console.log(`Sending to Evolution API: ${url} for number ${waNumber}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error sending WA to ${waNumber}:`, errorText);
    throw new Error(`Evolution API Error: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function processBirthdays(targetId?: string) {
  console.log("Starting birthday processing...");
  const supabase = getSupabase();
  
  // Call our RPC function
  const { data: aniversariantes, error } = await supabase.rpc('get_aniversariantes_hoje');
  
  if (error) {
    console.error("Error fetching birthdays:", error);
    throw error;
  }
  
  let toProcess = aniversariantes || [];
  
  // If targetId is provided, filter for manual send
  if (targetId) {
    toProcess = toProcess.filter((p: any) => p.id === targetId);
  }
  
  console.log(`Found ${toProcess.length} birthdays to process.`);
  
  const results = [];
  
  for (const person of toProcess) {
    try {
      if (!person.phone) continue;
      
      const res = await sendWhatsApp(person.phone, person.full_name);
      
      // Log success in activity_logs
      await supabase.from('activity_logs').insert({
        action: 'WHATSAPP_ENVIO',
        table_name: person.tipo === 'Pessoa' ? 'pessoa' : 'dependentes',
        record_id: person.id,
        description: `Mensagem de aniversário enviada para ${person.full_name}`,
        metadata: { phone: person.phone, evolution_response: res }
      });
      
      results.push({ id: person.id, name: person.full_name, status: 'success' });
      
      // Add delay to avoid rate limiting on Evolution API
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error(`Failed for ${person.full_name}:`, err.message);
      results.push({ id: person.id, name: person.full_name, status: 'error', error: err.message });
      
      await supabase.from('activity_logs').insert({
        action: 'WHATSAPP_FALHA',
        table_name: person.tipo === 'Pessoa' ? 'pessoa' : 'dependentes',
        record_id: person.id,
        description: `Falha ao enviar mensagem de aniversário para ${person.full_name}`,
        metadata: { phone: person.phone, error: err.message }
      });
    }
  }
  
  return { processed: toProcess.length, results };
}

// 1. Cron Job Execution (Automated - 12:00 UTC = 09:00 BRT)
// Deno.cron("Send Birthday WhatsApp Messages", "0 12 * * *", async () => {
//   console.log("Running Deno.cron for birthdays");
//   await processBirthdays();
// });

// 2. HTTP Server Execution (Manual Trigger)
Deno.serve(async (req) => {
  // Setup CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { targetId } = await req.json().catch(() => ({}));
    
    // Auth check using the user's token passed in headers
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Se o token fornecido não for o service_role_key, valida como usuário normal
    if (token !== serviceRoleKey) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("Unauthorized");
    }

    const result = await processBirthdays(targetId);
    
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error("HTTP Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
