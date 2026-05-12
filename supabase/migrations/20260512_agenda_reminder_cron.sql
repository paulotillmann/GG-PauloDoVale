-- ============================================================
-- Migration: pg_cron para lembrete automático de agenda
-- ============================================================

-- Garantir extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Função: consultar status do cron de lembrete ───────────────────────────
CREATE OR REPLACE FUNCTION public.get_agenda_reminder_cron_status()
RETURNS json
AS $$
DECLARE
  job_record record;
  result json;
BEGIN
  SELECT active, schedule INTO job_record
  FROM cron.job
  WHERE jobname = 'send-agenda-reminder-check'
  LIMIT 1;

  IF FOUND THEN
    result := json_build_object(
      'is_enabled', job_record.active,
      'schedule', job_record.schedule
    );
  ELSE
    result := json_build_object(
      'is_enabled', false,
      'schedule', null
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Função: criar/atualizar/remover o cron de lembrete ─────────────────────
CREATE OR REPLACE FUNCTION public.update_agenda_reminder_cron(
  p_is_enabled boolean,
  p_cron_schedule text DEFAULT '*/5 * * * *'
)
RETURNS void
AS $$
DECLARE
  v_service_key text;
  v_url text := 'https://lnngozcxzqowtvcmojhr.supabase.co/functions/v1/send-agenda-reminder';
  v_job_exists boolean;
BEGIN
  -- Ler a chave do Vault
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE EXCEPTION 'Service Role Key not found in Supabase Vault (SERVICE_ROLE_KEY)';
  END IF;

  -- Verifica se o job já existe antes de tentar remover
  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-agenda-reminder-check') INTO v_job_exists;

  IF v_job_exists THEN
    PERFORM cron.unschedule('send-agenda-reminder-check');
  END IF;

  IF p_is_enabled THEN
    -- Cria o agendamento
    PERFORM cron.schedule(
      'send-agenda-reminder-check',
      p_cron_schedule,
      format(
        $query$
        SELECT net.http_post(
            url:='%s',
            headers:=jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || '%s'),
            body:='{}'::jsonb
        );
        $query$,
        v_url,
        v_service_key
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
