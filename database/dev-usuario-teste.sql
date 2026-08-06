-- =============================================================
-- ⚠️ DEV-ONLY · COMPLEXO DMC
-- Cria um usuário de teste já confirmado e com TODOS os cursos
-- liberados, pra testar dashboard / aula / progresso sem checkout.
--
-- Rodar no SQL Editor do Supabase (roda como postgres, então
-- consegue escrever em auth.users direto).
-- Idempotente: pode rodar de novo — atualiza a senha e reforça as liberações.
--
-- CREDENCIAIS:
--   e-mail: aluno.teste@complexodmc.com.br
--   senha:  Teste@123456
--
-- Pra remover depois: rodar dev-usuario-teste-rollback.sql
-- =============================================================

set search_path = public, extensions, auth;

create extension if not exists pgcrypto;

do $$
declare
  v_email    text := 'aluno.teste@complexodmc.com.br';
  v_senha    text := 'Teste@123456';
  v_nome     text := 'Aluno Teste';
  v_id       uuid;
  v_hash     text;
  v_has_prov boolean;
begin
  v_hash := crypt(v_senha, gen_salt('bf'));

  select id into v_id from auth.users where email = v_email;

  -- ---------- auth.users ----------
  if v_id is null then
    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_id, 'authenticated', 'authenticated', v_email, v_hash,
      now(), now(), now(), null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', v_nome),
      '', '', '', ''
    );

    raise notice 'Usuário criado: % (%)', v_email, v_id;
  else
    -- já existe: reseta senha e garante e-mail confirmado
    update auth.users
       set encrypted_password = v_hash,
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('nome', v_nome),
           updated_at         = now()
     where id = v_id;

    raise notice 'Usuário já existia — senha resetada: % (%)', v_email, v_id;
  end if;

  -- ---------- auth.identities (provider email) ----------
  -- provider_id só existe nas versões mais novas do GoTrue; detecta antes.
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'identities'
       and column_name = 'provider_id'
  ) into v_has_prov;

  if not exists (
    select 1 from auth.identities
     where user_id = v_id and provider = 'email'
  ) then
    if v_has_prov then
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
        'email', v_id::text, now(), now(), now()
      );
    else
      insert into auth.identities (
        id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
  end if;

  -- ---------- profiles ----------
  -- o trigger on_auth_user_created já cria; isto é rede de segurança.
  insert into public.profiles (id, email, nome, is_admin)
  values (v_id, v_email, v_nome, false)
  on conflict (id) do update set email = excluded.email, nome = excluded.nome;

  -- Quer testar a tela de admin com esse usuário? descomente:
  -- update public.profiles set is_admin = true where id = v_id;

  -- ---------- liberações: todos os cursos ativos ----------
  insert into public.liberacoes (user_id, curso_id, granted_by)
  select v_id, c.id, v_id
    from public.cursos c
   where c.is_ativo
  on conflict (user_id, curso_id) do nothing;

  raise notice 'Liberações ativas: %',
    (select count(*) from public.liberacoes where user_id = v_id);
end $$;

-- ---------- conferência ----------
select p.id, p.email, p.nome, p.is_admin,
       u.email_confirmed_at is not null as email_confirmado,
       (select count(*) from public.liberacoes l where l.user_id = p.id) as cursos_liberados
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.email = 'aluno.teste@complexodmc.com.br';
