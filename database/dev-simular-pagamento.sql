-- =============================================================
-- ⚠️ DEV-ONLY · COMPLEXO DMC
-- Função pra simular pagamento aprovado em ambiente de teste.
-- Permite QUALQUER usuário autenticado liberar cursos pra si mesmo.
-- ANTES DE IR PRA PRODUÇÃO: rodar dev-simular-pagamento-rollback.sql.
-- =============================================================

create or replace function public.dev_simular_pagamento(curso_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Precisa estar logado';
  end if;
  insert into public.liberacoes (user_id, curso_id, granted_by)
  select auth.uid(), unnest(curso_ids), auth.uid()
  on conflict (user_id, curso_id) do nothing;
end;
$$;

grant execute on function public.dev_simular_pagamento(text[]) to authenticated;
