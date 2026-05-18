-- Tabela de logs do processo de importação do SAPL
CREATE TABLE IF NOT EXISTS public.sapl_sincronismo_historico (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requerimento_id UUID REFERENCES public.requerimento(id) ON DELETE CASCADE,
    entidade_tipo VARCHAR(50) NOT NULL, -- Ex: 'Requerimento', 'Arquivo/Ofício'
    entidade_identificador VARCHAR(100) NOT NULL, -- Ex: '001/2026' ou 'nome_do_arquivo.pdf'
    acao VARCHAR(20) NOT NULL, -- Ex: 'CRIADO', 'ATUALIZADO', 'IGNORADO'
    detalhes_alteracao JSONB, -- Diff dos campos ou infos relevantes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sapl_historico_requerimento ON public.sapl_sincronismo_historico(requerimento_id);
CREATE INDEX IF NOT EXISTS idx_sapl_historico_created_at ON public.sapl_sincronismo_historico(created_at);

-- RLS
ALTER TABLE public.sapl_sincronismo_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver histórico"
    ON public.sapl_sincronismo_historico FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Usuários podem inserir histórico"
    ON public.sapl_sincronismo_historico FOR INSERT
    TO authenticated
    WITH CHECK (true);
