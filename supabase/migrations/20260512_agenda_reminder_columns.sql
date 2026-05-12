-- ============================================================
-- Migration: Colunas para sistema de lembrete de agendamento
-- ============================================================

-- 1. Coluna na tabela profiles para indicar quais usuários
--    devem receber lembretes de agenda via WhatsApp
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS receber_lembrete_agenda boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.receber_lembrete_agenda
  IS 'Quando true, o usuário receberá lembretes de compromissos da agenda via WhatsApp (30min antes).';

-- 2. Coluna na tabela agenda para controle de deduplicação
--    Evita que o mesmo lembrete seja enviado mais de uma vez
ALTER TABLE public.agenda
ADD COLUMN IF NOT EXISTS lembrete_enviado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agenda.lembrete_enviado
  IS 'Flag de controle: true após o lembrete WhatsApp ter sido enviado com sucesso. Evita reenvios.';

-- 3. Garantir que a coluna celular_agendado existe
--    (usada no AgendaForm mas pode não estar no schema original)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agenda'
      AND column_name = 'celular_agendado'
  ) THEN
    ALTER TABLE public.agenda ADD COLUMN celular_agendado text;
  END IF;
END $$;
