-- =============================================================
-- COMPLEXO DMC · Seed dos 4 cursos atuais
-- Rodar UMA VEZ depois do schema.sql.
-- Idempotente via ON CONFLICT — pode rodar de novo (sobrescreve).
-- =============================================================

-- ============ CURSOS ============
insert into public.cursos
  (id, titulo, subtitulo, descricao, carga_horaria, modalidade, icone_key, preco, link_checkout, beneficios, ordem, is_ativo)
values
  ('curso-01',
   'Arquitetura Patrimonial Estratégica',
   'Programa de formação institucional Complexo DMC',
   'Programa que aprofunda a leitura do patrimônio como sistema. Direito, Tecnologia, Administração e Contabilidade integrados sob uma única governança consultiva.',
   '42 horas', 'Online', 'graduation', 4990.00, '',
   '["Acesso a 10 módulos integrados (Direito + Tec + Admin + Contabilidade)","Casos reais e diagnóstico institucional","Materiais de apoio em PDF","Certificado de conclusão Complexo DMC"]'::jsonb,
   1, true),
  ('curso-02',
   'Holding Familiar Aplicada',
   'Imersão prática em estruturação de holdings',
   'Imersão prática em casos reais de estruturação de holdings familiares. Modelagem societária, integralização de ativos e governança aplicada.',
   '18 horas', 'Presencial', 'briefcase', 2490.00, '',
   '["Imersão prática com casos reais","Modelagem de holding patrimonial e operacional","Modelo de acordo de sócios comentado","Certificado presencial Complexo DMC"]'::jsonb,
   2, true),
  ('curso-03',
   'Compliance & Governança Familiar',
   'Continuidade por desenho institucional',
   'Domine as melhores práticas de compliance e governança aplicadas ao ambiente familiar e empresarial. Protocolos, conselhos e regras de conduta.',
   '12 horas', 'Híbrido', 'shield', 1990.00, '',
   '["Protocolos de compliance institucional","Estrutura de conselho familiar","PEPs, KYC e LGPD aplicados ao patrimônio","Encontros híbridos (online + presencial)"]'::jsonb,
   3, true),
  ('curso-04',
   'Tecnologia Jurídica & IA',
   'Plataforma Ad-tech e automação aplicada',
   'Como a IA jurídica e a automação aceleram operações sensíveis sem comprometer precisão técnica. Da plataforma Ad-tech à integração com cartórios.',
   '14 horas', 'Online', 'monitor', 1690.00, '',
   '["IA jurídica aplicada ao backoffice","Automação de petições e atos notariais","Integração com cartórios e tribunais","Dashboards e indicadores institucionais"]'::jsonb,
   4, true)
on conflict (id) do update set
  titulo = excluded.titulo,
  subtitulo = excluded.subtitulo,
  descricao = excluded.descricao,
  carga_horaria = excluded.carga_horaria,
  modalidade = excluded.modalidade,
  icone_key = excluded.icone_key,
  preco = excluded.preco,
  beneficios = excluded.beneficios,
  ordem = excluded.ordem,
  is_ativo = excluded.is_ativo;

-- ============ MÓDULOS ============
insert into public.modulos (id, curso_id, numero, titulo, resumo, duracao, ordem) values
  -- curso-01
  ('m01', 'curso-01', '01', 'Fundamentos do Patrimônio Estratégico',
    'A leitura institucional do patrimônio: por que decisões isoladas custam caro e como pensar o ativo como sistema.',
    '3h 50min', 1),
  ('m02', 'curso-01', '02', 'Holding Familiar — Estrutura e Decisões',
    'Da concepção à governança: quando faz sentido, como desenhar e o que evitar.',
    '4h 20min', 2),
  ('m03', 'curso-01', '03', 'Planejamento Sucessório Avançado',
    'Arquitetura de transição patrimonial — sigilo, eficiência tributária e continuidade.',
    '4h 10min', 3),
  ('m04', 'curso-01', '04', 'Direito Imobiliário Estratégico',
    'Do terreno à individualização das matrículas — leitura registral, riscos e estrutura.',
    '4h 30min', 4),
  ('m05', 'curso-01', '05', 'Blindagem Patrimonial',
    'Camadas redundantes de proteção — desenho legítimo, defensável e auditável.',
    '3h 40min', 5),
  ('m06', 'curso-01', '06', 'Regularização e Estruturação de Ativos',
    'Saneamento societário, imobiliário e documental para que ativos operem, valorizem e transitem.',
    '3h 30min', 6),
  ('m07', 'curso-01', '07', 'Tributário Aplicado ao Patrimônio',
    'O tributo como variável estratégica — leitura técnica e oportunidades legítimas.',
    '4h 00min', 7),
  ('m08', 'curso-01', '08', 'Compliance e Governança Familiar',
    'Continuidade por desenho — protocolos, conselhos e regras de conduta.',
    '3h 20min', 8),
  ('m09', 'curso-01', '09', 'Tecnologia Aplicada ao Direito',
    'IA jurídica, automação e a plataforma Ad-tech como alavanca institucional.',
    '3h 10min', 9),
  ('m10', 'curso-01', '10', 'Gestão Empresarial e Sucessão Executiva',
    'Quando o herdeiro não é o gestor — caminhos para preservar valor e legado.',
    '3h 30min', 10),
  -- curso-02
  ('cm0201', 'curso-02', '01', 'Diagnóstico patrimonial inicial',
    'Mapeamento dos ativos, dos riscos e da composição familiar antes de desenhar a holding.',
    '4h', 1),
  ('cm0202', 'curso-02', '02', 'Modelagem da holding',
    'Tipos societários, integralização e cláusulas críticas no contrato social.',
    '5h', 2),
  -- curso-03
  ('cm0301', 'curso-03', '01', 'Fundamentos de compliance',
    'O que é compliance institucional e por que ele protege patrimônio.',
    '3h', 1),
  ('cm0302', 'curso-03', '02', 'Governança familiar',
    'Estrutura do conselho familiar, protocolo e mediação de conflitos.',
    '3h 30min', 2),
  -- curso-04
  ('cm0401', 'curso-04', '01', 'IA jurídica aplicada',
    'Onde a IA realmente entrega valor no backoffice jurídico.',
    '3h 30min', 1),
  ('cm0402', 'curso-04', '02', 'Integração com cartórios e tribunais',
    'Pipelines técnicos de integração e o ganho operacional resultante.',
    '3h', 2)
on conflict (id) do update set
  titulo = excluded.titulo, resumo = excluded.resumo,
  duracao = excluded.duracao, numero = excluded.numero, ordem = excluded.ordem;

-- ============ AULAS ============
insert into public.aulas (id, modulo_id, titulo, duracao, video_url, ordem) values
  -- m01
  ('a0101','m01','O patrimônio como sistema, não como evento','28min','',1),
  ('a0102','m01','A lacuna do mercado tradicional','34min','',2),
  ('a0103','m01','Quatro pilares: Direito, Tecnologia, Administração e Contabilidade','41min','',3),
  ('a0104','m01','Tipologia de cliente high-end e suas necessidades','36min','',4),
  ('a0105','m01','Diagnóstico institucional: ferramentas e leitura','52min','',5),
  -- m02
  ('a0201','m02','Quando uma holding faz sentido','32min','',1),
  ('a0202','m02','Modelagem societária e tipos de holding','48min','',2),
  ('a0203','m02','Integralização de ativos: aspectos fiscais e registrais','55min','',3),
  ('a0204','m02','Governança e acordo de sócios','44min','',4),
  ('a0205','m02','Erros frequentes e como evitá-los','41min','',5),
  -- m03
  ('a0301','m03','O que está em jogo na sucessão familiar','36min','',1),
  ('a0302','m03','Doação com reserva de usufruto','46min','',2),
  ('a0303','m03','Testamento, fideicomisso e cláusulas restritivas','52min','',3),
  ('a0304','m03','Trust, offshore e estruturas internacionais','58min','',4),
  ('a0305','m03','Coordenação tributária da sucessão','38min','',5),
  -- m04
  ('a0401','m04','Leitura institucional da matrícula','42min','',1),
  ('a0402','m04','Cadeia dominial e riscos invisíveis','38min','',2),
  ('a0403','m04','Incorporação imobiliária na ótica patrimonial','54min','',3),
  ('a0404','m04','Garantias reais e segregação de risco','46min','',4),
  ('a0405','m04','Registro de incorporação e individualização','40min','',5),
  -- m05
  ('a0501','m05','Conceito de blindagem: o que é e o que não é','34min','',1),
  ('a0502','m05','Segregação de risco e estruturas em camadas','48min','',2),
  ('a0503','m05','Limites legítimos da proteção patrimonial','42min','',3),
  ('a0504','m05','Desconsideração da personalidade jurídica: como se proteger','50min','',4),
  -- m06
  ('a0601','m06','Diagnóstico societário e passivo oculto','38min','',1),
  ('a0602','m06','Regularização imobiliária — caminhos administrativos','52min','',2),
  ('a0603','m06','Usucapião extrajudicial','44min','',3),
  ('a0604','m06','Retificação de área e georreferenciamento','36min','',4),
  -- m07
  ('a0701','m07','Tributação na pessoa física vs. pessoa jurídica','48min','',1),
  ('a0702','m07','ITCMD: planejamento sucessório sob a ótica fiscal','42min','',2),
  ('a0703','m07','Ganho de capital em integralização e venda','50min','',3),
  ('a0704','m07','Reorganizações societárias: cisão, fusão, incorporação','46min','',4),
  ('a0705','m07','Recuperação de créditos e revisões fiscais','34min','',5),
  -- m08
  ('a0801','m08','Conselho familiar e protocolo de família','40min','',1),
  ('a0802','m08','Conflitos de interesse e regras de conduta','38min','',2),
  ('a0803','m08','Compliance institucional: PEPs, KYC e LGPD','46min','',3),
  ('a0804','m08','Sucessão executiva e profissionalização da gestão','42min','',4),
  -- m09
  ('a0901','m09','IA aplicada ao backoffice jurídico','36min','',1),
  ('a0902','m09','Automação de petições e atos notariais','44min','',2),
  ('a0903','m09','Integração com cartórios e tribunais','40min','',3),
  ('a0904','m09','Dashboards e indicadores institucionais','38min','',4),
  -- m10
  ('a1001','m10','Profissionalização da gestão familiar','42min','',1),
  ('a1002','m10','Conselho de administração: papel e dinâmica','38min','',2),
  ('a1003','m10','Plano de sucessão executiva','46min','',3),
  ('a1004','m10','Mensuração de valor e KPIs estratégicos','40min','',4),
  -- curso-02
  ('ca020101','cm0201','Levantamento de ativos e passivos','45min','',1),
  ('ca020102','cm0201','Composição familiar e cenários sucessórios','40min','',2),
  ('ca020201','cm0202','Holding patrimonial vs. operacional','50min','',1),
  ('ca020202','cm0202','Cláusulas de proteção e acordo de sócios','48min','',2),
  -- curso-03
  ('ca030101','cm0301','Compliance: conceito e função','38min','',1),
  ('ca030102','cm0301','PEP, KYC e LGPD na prática','42min','',2),
  ('ca030201','cm0302','Desenhando o protocolo de família','40min','',1),
  ('ca030202','cm0302','Conflitos de interesse e mediação','38min','',2),
  -- curso-04
  ('ca040101','cm0401','IA generativa vs. IA discriminativa','42min','',1),
  ('ca040102','cm0401','Automação de petições e contratos','46min','',2),
  ('ca040201','cm0402','APIs e fluxos de integração','40min','',1),
  ('ca040202','cm0402','Dashboards e indicadores de performance','38min','',2)
on conflict (id) do update set
  titulo = excluded.titulo, duracao = excluded.duracao,
  video_url = excluded.video_url, ordem = excluded.ordem;
