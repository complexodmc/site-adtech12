-- =============================================================
-- COMPLEXO DMC · Rollback do atalho de DEV
-- Rodar antes de ir pra produção pra remover a função
-- dev_simular_pagamento, que permite auto-liberação.
-- =============================================================

drop function if exists public.dev_simular_pagamento(text[]);
