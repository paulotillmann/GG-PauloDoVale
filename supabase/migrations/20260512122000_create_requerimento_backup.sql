-- Cria a tabela requerimento_backup idêntica à original
CREATE TABLE IF NOT EXISTS public.requerimento_backup (
    LIKE public.requerimento INCLUDING ALL
);

-- Recria a chave estrangeira principal
ALTER TABLE public.requerimento_backup 
    ADD CONSTRAINT requerimento_backup_pessoa_id_fkey 
    FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE SET NULL;

-- Habilita Row Level Security (RLS)
ALTER TABLE public.requerimento_backup ENABLE ROW LEVEL SECURITY;

-- Aplica política genérica RLS
-- (Permite a todos os usuários autenticados visualizar e modificar o backup)
CREATE POLICY "Acesso total a requerimento_backup para usuários autenticados" 
    ON public.requerimento_backup
    FOR ALL 
    TO authenticated 
    USING (true)
    WITH CHECK (true);

-- Copia todos os dados da tabela original para a de backup
INSERT INTO public.requerimento_backup
SELECT * FROM public.requerimento;
