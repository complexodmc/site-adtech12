// =============================================================
// [DEPRECATED] COMPLEXO DMC · PLATAFORMA — Seed antigo dos cursos
// Este arquivo NÃO é mais carregado pela plataforma.
// Os cursos vivem no Supabase (tabelas cursos/modulos/aulas).
// Mantido apenas como referência histórica do conteúdo inicial.
// Para popular o banco, use database/seed.sql.
// =============================================================
// Seed dos cursos
// Estrutura multi-curso.
// Campos por curso: titulo, subtitulo, descricao, cargaHoraria,
//   modalidade ('Online' | 'Presencial' | 'Híbrido'),
//   iconeKey  ('graduation' | 'monitor' | 'shield' | 'building' | 'briefcase' | 'scale'),
//   preco      (Number, em reais — mostrado na Loja),
//   linkCheckout (URL do Mercado Pago Checkout Pro — gerado pelo administrativo),
//   beneficios ([String] — bullets de venda exibidos no card da Loja),
//   modulos:  [{ numero, titulo, resumo, duracao, aulas: [{ titulo, duracao, videoUrl }] }]
// =============================================================
window.PLATAFORMA_DATA = {
  cursoAtivoId: 'curso-01',
  cursos: [
    // ----- CURSO 01 — Programa carro-chefe -----
    {
      id: 'curso-01',
      titulo: 'Arquitetura Patrimonial Estratégica',
      subtitulo: 'Programa de formação institucional Complexo DMC',
      descricao: 'Programa que aprofunda a leitura do patrimônio como sistema. Direito, Tecnologia, Administração e Contabilidade integrados sob uma única governança consultiva.',
      cargaHoraria: '42 horas',
      modalidade: 'Online',
      iconeKey: 'graduation',
      preco: 4990.00,
      linkCheckout: '',
      beneficios: [
        'Acesso a 10 módulos integrados (Direito + Tec + Admin + Contabilidade)',
        'Casos reais e diagnóstico institucional',
        'Materiais de apoio em PDF',
        'Certificado de conclusão Complexo DMC'
      ],
      modulos: [
        {
          id: 'm01', numero: '01', titulo: 'Fundamentos do Patrimônio Estratégico',
          resumo: 'A leitura institucional do patrimônio: por que decisões isoladas custam caro e como pensar o ativo como sistema.',
          duracao: '3h 50min',
          aulas: [
            { id: 'a0101', titulo: 'O patrimônio como sistema, não como evento', duracao: '28min', videoUrl: '' },
            { id: 'a0102', titulo: 'A lacuna do mercado tradicional', duracao: '34min', videoUrl: '' },
            { id: 'a0103', titulo: 'Quatro pilares: Direito, Tecnologia, Administração e Contabilidade', duracao: '41min', videoUrl: '' },
            { id: 'a0104', titulo: 'Tipologia de cliente high-end e suas necessidades', duracao: '36min', videoUrl: '' },
            { id: 'a0105', titulo: 'Diagnóstico institucional: ferramentas e leitura', duracao: '52min', videoUrl: '' }
          ]
        },
        {
          id: 'm02', numero: '02', titulo: 'Holding Familiar — Estrutura e Decisões',
          resumo: 'Da concepção à governança: quando faz sentido, como desenhar e o que evitar.',
          duracao: '4h 20min',
          aulas: [
            { id: 'a0201', titulo: 'Quando uma holding faz sentido', duracao: '32min', videoUrl: '' },
            { id: 'a0202', titulo: 'Modelagem societária e tipos de holding', duracao: '48min', videoUrl: '' },
            { id: 'a0203', titulo: 'Integralização de ativos: aspectos fiscais e registrais', duracao: '55min', videoUrl: '' },
            { id: 'a0204', titulo: 'Governança e acordo de sócios', duracao: '44min', videoUrl: '' },
            { id: 'a0205', titulo: 'Erros frequentes e como evitá-los', duracao: '41min', videoUrl: '' }
          ]
        },
        {
          id: 'm03', numero: '03', titulo: 'Planejamento Sucessório Avançado',
          resumo: 'Arquitetura de transição patrimonial — sigilo, eficiência tributária e continuidade.',
          duracao: '4h 10min',
          aulas: [
            { id: 'a0301', titulo: 'O que está em jogo na sucessão familiar', duracao: '36min', videoUrl: '' },
            { id: 'a0302', titulo: 'Doação com reserva de usufruto', duracao: '46min', videoUrl: '' },
            { id: 'a0303', titulo: 'Testamento, fideicomisso e cláusulas restritivas', duracao: '52min', videoUrl: '' },
            { id: 'a0304', titulo: 'Trust, offshore e estruturas internacionais', duracao: '58min', videoUrl: '' },
            { id: 'a0305', titulo: 'Coordenação tributária da sucessão', duracao: '38min', videoUrl: '' }
          ]
        },
        {
          id: 'm04', numero: '04', titulo: 'Direito Imobiliário Estratégico',
          resumo: 'Do terreno à individualização das matrículas — leitura registral, riscos e estrutura.',
          duracao: '4h 30min',
          aulas: [
            { id: 'a0401', titulo: 'Leitura institucional da matrícula', duracao: '42min', videoUrl: '' },
            { id: 'a0402', titulo: 'Cadeia dominial e riscos invisíveis', duracao: '38min', videoUrl: '' },
            { id: 'a0403', titulo: 'Incorporação imobiliária na ótica patrimonial', duracao: '54min', videoUrl: '' },
            { id: 'a0404', titulo: 'Garantias reais e segregação de risco', duracao: '46min', videoUrl: '' },
            { id: 'a0405', titulo: 'Registro de incorporação e individualização', duracao: '40min', videoUrl: '' }
          ]
        },
        {
          id: 'm05', numero: '05', titulo: 'Blindagem Patrimonial',
          resumo: 'Camadas redundantes de proteção — desenho legítimo, defensável e auditável.',
          duracao: '3h 40min',
          aulas: [
            { id: 'a0501', titulo: 'Conceito de blindagem: o que é e o que não é', duracao: '34min', videoUrl: '' },
            { id: 'a0502', titulo: 'Segregação de risco e estruturas em camadas', duracao: '48min', videoUrl: '' },
            { id: 'a0503', titulo: 'Limites legítimos da proteção patrimonial', duracao: '42min', videoUrl: '' },
            { id: 'a0504', titulo: 'Desconsideração da personalidade jurídica: como se proteger', duracao: '50min', videoUrl: '' }
          ]
        },
        {
          id: 'm06', numero: '06', titulo: 'Regularização e Estruturação de Ativos',
          resumo: 'Saneamento societário, imobiliário e documental para que ativos operem, valorizem e transitem.',
          duracao: '3h 30min',
          aulas: [
            { id: 'a0601', titulo: 'Diagnóstico societário e passivo oculto', duracao: '38min', videoUrl: '' },
            { id: 'a0602', titulo: 'Regularização imobiliária — caminhos administrativos', duracao: '52min', videoUrl: '' },
            { id: 'a0603', titulo: 'Usucapião extrajudicial', duracao: '44min', videoUrl: '' },
            { id: 'a0604', titulo: 'Retificação de área e georreferenciamento', duracao: '36min', videoUrl: '' }
          ]
        },
        {
          id: 'm07', numero: '07', titulo: 'Tributário Aplicado ao Patrimônio',
          resumo: 'O tributo como variável estratégica — leitura técnica e oportunidades legítimas.',
          duracao: '4h 00min',
          aulas: [
            { id: 'a0701', titulo: 'Tributação na pessoa física vs. pessoa jurídica', duracao: '48min', videoUrl: '' },
            { id: 'a0702', titulo: 'ITCMD: planejamento sucessório sob a ótica fiscal', duracao: '42min', videoUrl: '' },
            { id: 'a0703', titulo: 'Ganho de capital em integralização e venda', duracao: '50min', videoUrl: '' },
            { id: 'a0704', titulo: 'Reorganizações societárias: cisão, fusão, incorporação', duracao: '46min', videoUrl: '' },
            { id: 'a0705', titulo: 'Recuperação de créditos e revisões fiscais', duracao: '34min', videoUrl: '' }
          ]
        },
        {
          id: 'm08', numero: '08', titulo: 'Compliance e Governança Familiar',
          resumo: 'Continuidade por desenho — protocolos, conselhos e regras de conduta.',
          duracao: '3h 20min',
          aulas: [
            { id: 'a0801', titulo: 'Conselho familiar e protocolo de família', duracao: '40min', videoUrl: '' },
            { id: 'a0802', titulo: 'Conflitos de interesse e regras de conduta', duracao: '38min', videoUrl: '' },
            { id: 'a0803', titulo: 'Compliance institucional: PEPs, KYC e LGPD', duracao: '46min', videoUrl: '' },
            { id: 'a0804', titulo: 'Sucessão executiva e profissionalização da gestão', duracao: '42min', videoUrl: '' }
          ]
        },
        {
          id: 'm09', numero: '09', titulo: 'Tecnologia Aplicada ao Direito',
          resumo: 'IA jurídica, automação e a plataforma Ad-tech como alavanca institucional.',
          duracao: '3h 10min',
          aulas: [
            { id: 'a0901', titulo: 'IA aplicada ao backoffice jurídico', duracao: '36min', videoUrl: '' },
            { id: 'a0902', titulo: 'Automação de petições e atos notariais', duracao: '44min', videoUrl: '' },
            { id: 'a0903', titulo: 'Integração com cartórios e tribunais', duracao: '40min', videoUrl: '' },
            { id: 'a0904', titulo: 'Dashboards e indicadores institucionais', duracao: '38min', videoUrl: '' }
          ]
        },
        {
          id: 'm10', numero: '10', titulo: 'Gestão Empresarial e Sucessão Executiva',
          resumo: 'Quando o herdeiro não é o gestor — caminhos para preservar valor e legado.',
          duracao: '3h 30min',
          aulas: [
            { id: 'a1001', titulo: 'Profissionalização da gestão familiar', duracao: '42min', videoUrl: '' },
            { id: 'a1002', titulo: 'Conselho de administração: papel e dinâmica', duracao: '38min', videoUrl: '' },
            { id: 'a1003', titulo: 'Plano de sucessão executiva', duracao: '46min', videoUrl: '' },
            { id: 'a1004', titulo: 'Mensuração de valor e KPIs estratégicos', duracao: '40min', videoUrl: '' }
          ]
        }
      ]
    },

    // ----- CURSO 02 — Holding Familiar Aplicada -----
    {
      id: 'curso-02',
      titulo: 'Holding Familiar Aplicada',
      subtitulo: 'Imersão prática em estruturação de holdings',
      descricao: 'Imersão prática em casos reais de estruturação de holdings familiares. Modelagem societária, integralização de ativos e governança aplicada.',
      cargaHoraria: '18 horas',
      modalidade: 'Presencial',
      iconeKey: 'briefcase',
      preco: 2490.00,
      linkCheckout: '',
      beneficios: [
        'Imersão prática com casos reais',
        'Modelagem de holding patrimonial e operacional',
        'Modelo de acordo de sócios comentado',
        'Certificado presencial Complexo DMC'
      ],
      modulos: [
        {
          id: 'cm0201', numero: '01', titulo: 'Diagnóstico patrimonial inicial',
          resumo: 'Mapeamento dos ativos, dos riscos e da composição familiar antes de desenhar a holding.',
          duracao: '4h',
          aulas: [
            { id: 'ca020101', titulo: 'Levantamento de ativos e passivos', duracao: '45min', videoUrl: '' },
            { id: 'ca020102', titulo: 'Composição familiar e cenários sucessórios', duracao: '40min', videoUrl: '' }
          ]
        },
        {
          id: 'cm0202', numero: '02', titulo: 'Modelagem da holding',
          resumo: 'Tipos societários, integralização e cláusulas críticas no contrato social.',
          duracao: '5h',
          aulas: [
            { id: 'ca020201', titulo: 'Holding patrimonial vs. operacional', duracao: '50min', videoUrl: '' },
            { id: 'ca020202', titulo: 'Cláusulas de proteção e acordo de sócios', duracao: '48min', videoUrl: '' }
          ]
        }
      ]
    },

    // ----- CURSO 03 — Compliance & Governança -----
    {
      id: 'curso-03',
      titulo: 'Compliance & Governança Familiar',
      subtitulo: 'Continuidade por desenho institucional',
      descricao: 'Domine as melhores práticas de compliance e governança aplicadas ao ambiente familiar e empresarial. Protocolos, conselhos e regras de conduta.',
      cargaHoraria: '12 horas',
      modalidade: 'Híbrido',
      iconeKey: 'shield',
      preco: 1990.00,
      linkCheckout: '',
      beneficios: [
        'Protocolos de compliance institucional',
        'Estrutura de conselho familiar',
        'PEPs, KYC e LGPD aplicados ao patrimônio',
        'Encontros híbridos (online + presencial)'
      ],
      modulos: [
        {
          id: 'cm0301', numero: '01', titulo: 'Fundamentos de compliance',
          resumo: 'O que é compliance institucional e por que ele protege patrimônio.',
          duracao: '3h',
          aulas: [
            { id: 'ca030101', titulo: 'Compliance: conceito e função', duracao: '38min', videoUrl: '' },
            { id: 'ca030102', titulo: 'PEP, KYC e LGPD na prática', duracao: '42min', videoUrl: '' }
          ]
        },
        {
          id: 'cm0302', numero: '02', titulo: 'Governança familiar',
          resumo: 'Estrutura do conselho familiar, protocolo e mediação de conflitos.',
          duracao: '3h 30min',
          aulas: [
            { id: 'ca030201', titulo: 'Desenhando o protocolo de família', duracao: '40min', videoUrl: '' },
            { id: 'ca030202', titulo: 'Conflitos de interesse e mediação', duracao: '38min', videoUrl: '' }
          ]
        }
      ]
    },

    // ----- CURSO 04 — Tecnologia Jurídica -----
    {
      id: 'curso-04',
      titulo: 'Tecnologia Jurídica & IA',
      subtitulo: 'Plataforma Ad-tech e automação aplicada',
      descricao: 'Como a IA jurídica e a automação aceleram operações sensíveis sem comprometer precisão técnica. Da plataforma Ad-tech à integração com cartórios.',
      cargaHoraria: '14 horas',
      modalidade: 'Online',
      iconeKey: 'monitor',
      preco: 1690.00,
      linkCheckout: '',
      beneficios: [
        'IA jurídica aplicada ao backoffice',
        'Automação de petições e atos notariais',
        'Integração com cartórios e tribunais',
        'Dashboards e indicadores institucionais'
      ],
      modulos: [
        {
          id: 'cm0401', numero: '01', titulo: 'IA jurídica aplicada',
          resumo: 'Onde a IA realmente entrega valor no backoffice jurídico.',
          duracao: '3h 30min',
          aulas: [
            { id: 'ca040101', titulo: 'IA generativa vs. IA discriminativa', duracao: '42min', videoUrl: '' },
            { id: 'ca040102', titulo: 'Automação de petições e contratos', duracao: '46min', videoUrl: '' }
          ]
        },
        {
          id: 'cm0402', numero: '02', titulo: 'Integração com cartórios e tribunais',
          resumo: 'Pipelines técnicos de integração e o ganho operacional resultante.',
          duracao: '3h',
          aulas: [
            { id: 'ca040201', titulo: 'APIs e fluxos de integração', duracao: '40min', videoUrl: '' },
            { id: 'ca040202', titulo: 'Dashboards e indicadores de performance', duracao: '38min', videoUrl: '' }
          ]
        }
      ]
    }
  ]
};
