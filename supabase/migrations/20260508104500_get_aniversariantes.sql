-- Função para buscar aniversariantes do dia na tabela pessoa e dependentes

CREATE OR REPLACE FUNCTION public.get_aniversariantes_hoje()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    phone TEXT,
    tipo TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Aniversariantes da tabela pessoa
    SELECT p.id, p.full_name, p.phone, 'Pessoa'::TEXT AS tipo
    FROM public.pessoa p
    WHERE p.phone IS NOT NULL 
      AND p.phone != ''
      AND EXTRACT(MONTH FROM p.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM p.birth_date) = EXTRACT(DAY FROM CURRENT_DATE)
      
    UNION ALL
    
    -- Aniversariantes da tabela dependentes
    SELECT d.id, d.full_name, d.phone, 'Dependente'::TEXT AS tipo
    FROM public.dependentes d
    WHERE d.phone IS NOT NULL 
      AND d.phone != ''
      AND EXTRACT(MONTH FROM d.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM d.birth_date) = EXTRACT(DAY FROM CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
