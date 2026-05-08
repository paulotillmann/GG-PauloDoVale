-- Habilitar extensões necessárias se não existirem
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Função para ler o status do cron
CREATE OR REPLACE FUNCTION public.get_birthday_cron_status()
RETURNS json
AS $$
DECLARE
  job_record record;
  result json;
BEGIN
  SELECT active, schedule INTO job_record 
  FROM cron.job 
  WHERE jobname = 'send-birthday-wpp-daily' 
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


-- Função para atualizar/criar o agendamento
CREATE OR REPLACE FUNCTION public.update_birthday_cron(p_is_enabled boolean, p_cron_schedule text)
RETURNS void
AS $$
DECLARE
  v_service_key text;
  v_url text := 'https://lnngozcxzqowtvcmojhr.supabase.co/functions/v1/send-birthday-wpp';
BEGIN
  -- Ler a chave do Vault para não expor no frontend ou no script do cron
  SELECT decrypted_secret INTO v_service_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'SERVICE_ROLE_KEY' 
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE EXCEPTION 'Service Role Key not found in Supabase Vault (SERVICE_ROLE_KEY)';
  END IF;

  -- Remove o agendamento atual para evitar duplicidade ou para desativar
  PERFORM cron.unschedule('send-birthday-wpp-daily');
  
  IF p_is_enabled THEN
    -- Cria o agendamento usando format e concatenando os headers de forma segura
    PERFORM cron.schedule(
      'send-birthday-wpp-daily',
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
