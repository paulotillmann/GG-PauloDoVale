-- ============================================================
-- Migration: Adicionar campo atendimento_humano na tabela pessoa
-- Data: 2026-04-26
-- ============================================================

ALTER TABLE public.pessoa
  ADD COLUMN IF NOT EXISTS atendimento_humano boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pessoa.atendimento_humano IS
  'Indica se a pessoa está em atendimento humano (true) ou apenas na IA (false). Nasce sempre false.';
