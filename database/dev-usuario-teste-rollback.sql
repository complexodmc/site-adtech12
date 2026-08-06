-- =============================================================
-- COMPLEXO DMC · Remove o usuário de teste
-- Rodar antes de ir pra produção.
-- O delete em auth.users cascateia pra profiles, liberacoes,
-- progresso e auth.identities.
-- =============================================================

delete from auth.users where email = 'aluno.teste@complexodmc.com.br';
