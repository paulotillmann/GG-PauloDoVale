import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ─── Evolution API Config ────────────────────────────────────────────────────
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "https://evolution.technocode.site";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "8GJGnDzDfDYQiMFabMWA3e8kFup8LkJY";
const INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "Paulo do Vale";

// ─── Supabase Client (Service Role) ──────────────────────────────────────────
const getSupabase = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
};

// ─── Enviar WhatsApp via Evolution API ───────────────────────────────────────
async function sendWhatsApp(phone: string, message: string) {
  const cleanPhone = phone.replace(/\D/g, "");

  let waNumber = cleanPhone;
  if (!waNumber.startsWith("55") && waNumber.length >= 10) {
    waNumber = "55" + waNumber;
  }

  const payload = {
    number: waNumber,
    options: {
      delay: 1200,
      presence: "composing",
      linkPreview: false,
    },
    text: message,
  };

  const url = `${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(INSTANCE_NAME)}`;

  console.log(`[Agenda Reminder] Sending to Evolution API: ${url} for number ${waNumber}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Agenda Reminder] Error sending WA to ${waNumber}:`, errorText);
    throw new Error(`Evolution API Error: ${response.status} ${errorText}`);
  }

  return await response.json();
}

// ─── Formatar data BR ────────────────────────────────────────────────────────
function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

// ─── Formatar horário (remove segundos) ──────────────────────────────────────
function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

// ─── Montar mensagem de lembrete ─────────────────────────────────────────────
function buildReminderMessage(compromisso: any): string {
  const lines: string[] = [
    `🔔 *Lembrete de Compromisso*`,
    ``,
    `*Título:* ${compromisso.titulo_compromisso}`,
    `*Data:* ${formatDateBR(compromisso.data)}`,
    `*Horário:* ${formatTime(compromisso.horario_inicio)}${compromisso.horario_fim ? ` - ${formatTime(compromisso.horario_fim)}` : ""}`,
  ];

  if (compromisso.local) {
    lines.push(`*Local:* ${compromisso.local}`);
  }

  if (compromisso.tipo) {
    lines.push(`*Tipo:* ${compromisso.tipo}`);
  }

  if (compromisso.pessoa?.full_name) {
    lines.push(`*Pessoa/Entidade:* ${compromisso.pessoa.full_name}`);
  }

  if (compromisso.descricao) {
    lines.push(``, `📋 *Descrição:*`, compromisso.descricao);
  }

  lines.push(``, `_Lembrete automático do Gabinete Paulo do Vale_`);

  return lines.join("\n");
}

// ─── Processar Lembretes ─────────────────────────────────────────────────────
async function processReminders() {
  console.log("[Agenda Reminder] Starting reminder processing...");
  const supabase = getSupabase();

  // 1. Buscar compromissos elegíveis:
  //    - lembrar = true
  //    - lembrete_enviado = false
  //    - data + horario_inicio está entre agora e agora + 35 minutos
  //    (janela de 35min para cobrir o intervalo de 5min do cron)
  const { data: compromissos, error: agendaError } = await supabase.rpc(
    "get_agenda_reminders_pendentes"
  );

  // Fallback: se a RPC não existir, faz query direta
  let toProcess = compromissos;
  if (agendaError) {
    console.log("[Agenda Reminder] RPC not found, using direct query...");

    // Calcular janela de tempo em UTC considerando timezone BRT (-03:00)
    const now = new Date();
    const nowBRT = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const today = nowBRT.toISOString().slice(0, 10);

    // Horário atual BRT em formato HH:MM:SS
    const currentTimeStr = nowBRT.toTimeString().slice(0, 8);

    // Horário limite (agora + 35 minutos)
    const limitDate = new Date(nowBRT.getTime() + 35 * 60 * 1000);
    const limitDay = limitDate.toISOString().slice(0, 10);
    const limitTimeStr = limitDate.toTimeString().slice(0, 8);

    console.log(
      `[Agenda Reminder] Window: ${today} ${currentTimeStr} -> ${limitDay} ${limitTimeStr}`
    );

    // Query: compromissos de hoje com horário na janela
    let query = supabase
      .from("agenda")
      .select("*, pessoa(full_name)")
      .eq("lembrar", true)
      .eq("lembrete_enviado", false)
      .eq("data", today)
      .gte("horario_inicio", currentTimeStr)
      .lte("horario_inicio", limitTimeStr);

    // Se o dia limite for diferente do dia atual (virada de meia-noite),
    // precisamos ajustar, mas para o caso comum (mesmo dia) funciona bem.
    if (limitDay !== today) {
      // Caso de virada: busca compromissos até 23:59:59 do dia atual
      // E de 00:00:00 até o limitTime do dia seguinte
      // Na prática, com janela de 35min isso só ocorre se o cron roda
      // perto de 23:30, que é raro para compromissos de gabinete
      query = supabase
        .from("agenda")
        .select("*, pessoa(full_name)")
        .eq("lembrar", true)
        .eq("lembrete_enviado", false)
        .eq("data", today)
        .gte("horario_inicio", currentTimeStr);
    }

    const { data: directData, error: directError } = await query;

    if (directError) {
      console.error("[Agenda Reminder] Error fetching agenda:", directError);
      throw directError;
    }

    toProcess = directData;
  }

  if (!toProcess || toProcess.length === 0) {
    console.log("[Agenda Reminder] No pending reminders found.");
    return { processed: 0, results: [] };
  }

  console.log(`[Agenda Reminder] Found ${toProcess.length} reminders to send.`);

  // 2. Buscar usuários que devem receber lembretes
  const { data: recipients, error: recipientsError } = await supabase
    .from("profiles")
    .select("id, full_name, telefone")
    .eq("receber_lembrete_agenda", true)
    .not("telefone", "is", null);

  if (recipientsError) {
    console.error("[Agenda Reminder] Error fetching recipients:", recipientsError);
    throw recipientsError;
  }

  if (!recipients || recipients.length === 0) {
    console.log("[Agenda Reminder] No recipients configured to receive reminders.");
    return { processed: toProcess.length, results: [], recipients: 0 };
  }

  console.log(
    `[Agenda Reminder] Will send to ${recipients.length} recipient(s): ${recipients.map((r: any) => r.full_name).join(", ")}`
  );

  // 3. Para cada compromisso, enviar para cada destinatário
  const results: any[] = [];

  for (const compromisso of toProcess) {
    const message = buildReminderMessage(compromisso);
    let allSent = true;

    for (const recipient of recipients) {
      try {
        if (!recipient.telefone) continue;

        const res = await sendWhatsApp(recipient.telefone, message);

        // Log de sucesso
        await supabase.from("activity_logs").insert({
          action: "AGENDA_LEMBRETE_ENVIADO",
          table_name: "agenda",
          record_id: compromisso.id,
          description: `Lembrete de "${compromisso.titulo_compromisso}" enviado para ${recipient.full_name}`,
          metadata: {
            phone: recipient.telefone,
            recipient_id: recipient.id,
            compromisso_titulo: compromisso.titulo_compromisso,
            compromisso_data: compromisso.data,
            compromisso_horario: compromisso.horario_inicio,
            evolution_response: res,
          },
        });

        results.push({
          compromisso_id: compromisso.id,
          recipient: recipient.full_name,
          status: "success",
        });

        // Rate limiting: 2s entre envios
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err: any) {
        console.error(
          `[Agenda Reminder] Failed for ${recipient.full_name} (${compromisso.titulo_compromisso}):`,
          err.message
        );

        allSent = false;

        results.push({
          compromisso_id: compromisso.id,
          recipient: recipient.full_name,
          status: "error",
          error: err.message,
        });

        // Log de falha
        await supabase.from("activity_logs").insert({
          action: "AGENDA_LEMBRETE_FALHA",
          table_name: "agenda",
          record_id: compromisso.id,
          description: `Falha ao enviar lembrete de "${compromisso.titulo_compromisso}" para ${recipient.full_name}`,
          metadata: {
            phone: recipient.telefone,
            recipient_id: recipient.id,
            error: err.message,
          },
        });
      }
    }

    // 4. Marcar como enviado (mesmo com falhas parciais, para evitar spam)
    if (allSent || results.some((r) => r.compromisso_id === compromisso.id && r.status === "success")) {
      await supabase
        .from("agenda")
        .update({ lembrete_enviado: true })
        .eq("id", compromisso.id);

      console.log(
        `[Agenda Reminder] Marked compromisso "${compromisso.titulo_compromisso}" as lembrete_enviado = true`
      );
    }
  }

  return {
    processed: toProcess.length,
    recipients: recipients.length,
    results,
  };
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Tenta decodificar o JWT para verificar se é service_role
    let isServiceRole = false;
    try {
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64));
        if (payload.role === "service_role") {
          isServiceRole = true;
          console.log("[Agenda Reminder] Authenticated via service_role JWT");
        }
      }
    } catch {
      // Não é um JWT válido, seguirá para validação de usuário
    }

    // Fallback: comparação direta com env var (compatibilidade)
    if (!isServiceRole) {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (token === serviceRoleKey) {
        isServiceRole = true;
        console.log("[Agenda Reminder] Authenticated via env var match");
      }
    }

    // Se não for service_role, valida como usuário autenticado
    if (!isServiceRole) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );

      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("Unauthorized");
      console.log(`[Agenda Reminder] Authenticated as user: ${user.email}`);
    }

    const result = await processReminders();

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[Agenda Reminder] HTTP Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
