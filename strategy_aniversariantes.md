# Estratégia: Envio Automático e Manual de WhatsApp para Aniversariantes

Este documento apresenta a estratégia técnica para resolver o problema de buscar aniversariantes do dia (tanto Pessoas quanto Dependentes) e enviar uma mensagem de felicitação via WhatsApp utilizando a stack atual (Supabase Edge Functions, pg_cron/JobCron, Evolution API e React).

## User Review Required

> [!IMPORTANT]  
> Preciso que você valide se a lógica de automação deve ser 100% automática (enviar para todos do dia às 09:00, por exemplo) ou se requer aprovação manual na tela (o sistema lista, e o usuário clica em "Enviar para Todos").  
> A estratégia abaixo cobre os dois cenários para te dar o controle total.

## 1. Arquitetura da Solução

A solução será dividida em 3 camadas principais:

1.  **Frontend (UI na Tela de Pessoas)**: Uma nova funcionalidade para listar os aniversariantes do dia e permitir envio manual/individual.
2.  **Supabase Edge Function (`birthday-wpp`)**: Uma API serverless responsável por receber a lista de destinatários, formatar a mensagem de parabéns e comunicar-se com a **Evolution API** para disparar o WhatsApp.
3.  **Job Cron (`pg_cron` + `pg_net` ou `Deno.cron`)**: O agendador no banco de dados que roda todos os dias em um horário específico (ex: 09:00 AM) para buscar os aniversariantes e acionar a Edge Function automaticamente.

---

## 2. Detalhamento Técnico

### A. Banco de Dados (Consulta SQL)

Precisamos de uma `View` ou função SQL (RPC) para buscar quem faz aniversário "hoje", unindo a tabela `pessoa` e `dependentes`:

```sql
CREATE OR REPLACE FUNCTION get_aniversariantes_hoje()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    phone TEXT,
    tipo TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Aniversariantes da tabela pessoa
    SELECT p.id, p.full_name, p.phone, 'Pessoa' AS tipo
    FROM public.pessoa p
    WHERE p.phone IS NOT NULL 
      AND EXTRACT(MONTH FROM p.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM p.birth_date) = EXTRACT(DAY FROM CURRENT_DATE)
      
    UNION ALL
    
    -- Aniversariantes da tabela dependentes
    SELECT d.id, d.full_name, d.phone, 'Dependente' AS tipo
    FROM public.dependentes d
    WHERE d.phone IS NOT NULL 
      AND EXTRACT(MONTH FROM d.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM d.birth_date) = EXTRACT(DAY FROM CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### B. Supabase Edge Function (`send-birthday-wpp`)

Criaremos uma Edge Function em TypeScript/Deno. Ela receberá um payload (ou buscará diretamente no banco) e fará o POST para a Evolution API.

```typescript
// supabase/functions/send-birthday-wpp/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
const INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME");

serve(async (req) => {
  // Lógica para instanciar o Supabase Client
  // Executar a RPC get_aniversariantes_hoje()
  // Loop nos resultados:
  //    Formatar número de telefone
  //    Montar mensagem: "Olá *${nome}*! Desejamos um feliz aniversário..."
  //    Fazer um fetch() POST para ${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}
  // Retornar log de sucessos/falhas
})
```

> [!TIP]  
> Como os serviços de WhatsApp podem ter limite de taxa (rate limit), na Edge Function podemos usar um "delay" entre cada envio (ex: `await new Promise(r => setTimeout(r, 2000))`) ou enviar os jobs para uma fila do n8n se o volume for muito alto (+ de 100 aniversários no mesmo dia).

### C. Agendamento Automático (Job Cron)

Utilizando a extensão nativa do PostgreSQL no Supabase (`pg_cron` e `pg_net`):

```sql
-- Ativar extensões necessárias no Supabase
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Criar o Job para rodar todos os dias às 09:00 (GMT-3 seria 12:00 UTC)
SELECT cron.schedule(
  'enviar-mensagens-aniversario',
  '0 12 * * *', -- Todos os dias às 12:00 UTC (09:00 BRT)
  $$
    SELECT net.http_post(
      url:='https://SEU_PROJECT_REF.supabase.co/functions/v1/send-birthday-wpp',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY"}'::jsonb
    );
  $$
);
```
*(Alternativa Moderna: Utilizar o novo recurso `Deno.cron()` diretamente dentro do código da Edge Function).*

### D. Frontend (UI em `PeopleScreen.tsx`)

Na interface de Pessoas e Entidades:
1. Criar um botão 🎂 **Aniversariantes Hoje**.
2. Ao clicar, abre um Modal listando os aniversariantes retornados pela RPC `get_aniversariantes_hoje`.
3. Para cada um, um botão de "Disparar WhatsApp Manual", que chama a Edge Function passando o ID específico.
4. Mostrar um selo/badge indicativo "Já enviado hoje" (consultando a tabela `activity_logs` ou `anotacoes`).

---

## 3. Plano de Ação (Próximos Passos)

Se você aprovar esta estratégia, seguirei com as seguintes implementações, nesta ordem:

1. **[Banco de Dados]**: Criar a função SQL `get_aniversariantes_hoje()`.
2. **[Edge Function]**: Criar o código da função `send-birthday-wpp` configurando a integração com a Evolution API.
3. **[Frontend]**: Atualizar a `PeopleScreen.tsx` com um Modal bonito e botões de ação para aniversariantes.
4. **[Agendamento]**: Configurar o `JobCron` no Supabase para rodar a rotina matinalmente.

Por favor, confirme se o fluxo de envio via **Evolution API** atende (você precisará fornecer/configurar as variáveis de ambiente `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` no Supabase Vault/Edge Secrets) e se a estratégia atende sua expectativa!
