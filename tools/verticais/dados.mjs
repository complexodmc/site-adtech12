// =============================================================
// COMPLEXO DMC · Verticais de Negócio — FONTE ÚNICA DE CONTEÚDO
// Lido por tools/verticais/gerar.mjs, que escreve as páginas
// estáticas em complexodmc.com.br/verticais-de-negocio/**.
//
// Este arquivo NÃO é servido pelo site (fica fora de
// complexodmc.com.br/). Por isso pode guardar `case.cliente_interno`,
// que é referência do comercial e nunca vai ao HTML: o gerador só
// imprime o nome do cliente se `case.autorizado === true`.
//
// Registro de linguagem: institucional, sem promessa de resultado
// (Provimento 205/2021 do CFOAB). Números de mercado sempre com fonte.
// Conteúdo das verticais 1–7 e início da 8: prompt do CEO (2026-10-18).
// Conteúdo do restante da vertical 8 e da vertical 9: redigido pela
// equipe no mesmo registro, PENDENTE DE REVISÃO do CEO (o prompt
// chegou truncado nesse ponto).
// =============================================================

export const SITE = 'https://www.complexodmc.com.br';
export const BASE = 'verticais-de-negocio';

// Os seis eixos da casa (nome, cor e página), como em assets/js/navbar.js.
export const EIXOS = {
  E1: { n: 1, slug: 'patrimonial', nome: 'Planejamento Patrimonial e Sucessório', curto: 'Patrimonial e Sucessório', href: 'pages/planejamento-sucessorio.html' },
  E2: { n: 2, slug: 'fiscal', nome: 'Tributário, Fiscal e Corporativo', curto: 'Tributário, Fiscal e Corporativo', href: 'pages/planejamento-tributario.html' },
  E3: { n: 3, slug: 'imobiliario', nome: 'Direito Notarial e Imobiliário', curto: 'Notarial e Imobiliário', href: 'pages/consultoria-imobiliaria.html' },
  E4: { n: 4, slug: 'auditoria', nome: 'Auditoria Empresarial e Contábil', curto: 'Auditoria Empresarial e Contábil', href: 'pages/contabilidade.html' },
  E5: { n: 5, slug: 'ativos', nome: 'Recuperação de Ativos', curto: 'Recuperação de Ativos', href: 'pages/recuperacao-ativos.html' },
  E6: { n: 6, slug: 'trabalhista', nome: 'Consultoria Trabalhista', curto: 'Consultoria Trabalhista', href: 'solucoes/consultoria-trabalhista/ciclo-fechado.html' }
};

export const FORM = {
  faturamento: [
    ['ate-5mi', 'Até R$ 5 mi'],
    ['5-20mi', 'R$ 5–20 mi'],
    ['20-50mi', 'R$ 20–50 mi'],
    ['50-300mi', 'R$ 50–300 mi'],
    ['acima-300mi', 'Acima de R$ 300 mi'],
    ['pessoa-fisica', 'Pessoa física / família']
  ],
  patrimonio: [
    ['ate-10mi', 'Até R$ 10 mi'],
    ['10-50mi', 'R$ 10–50 mi'],
    ['50-200mi', 'R$ 50–200 mi'],
    ['acima-200mi', 'Acima de R$ 200 mi'],
    ['nao-informar', 'Prefiro não informar']
  ],
  motivo: [
    ['sucessao-inventario', 'Sucessão ou inventário'],
    ['planejamento-patrimonial', 'Planejamento patrimonial'],
    ['fiscalizacao-passivo', 'Fiscalização ou passivo tributário'],
    ['regularizacao-imovel', 'Regularização de imóvel ou estoque'],
    ['bloqueio-recuperacao', 'Bloqueio judicial ou recuperação de ativos'],
    ['auditoria-contas', 'Auditoria ou prestação de contas'],
    ['trabalhista', 'Questão trabalhista'],
    ['tecnologia-cartorio', 'Tecnologia para cartório'],
    ['outro', 'Outro']
  ]
};

export const INDICE = {
  h1: 'Verticais de Negócio',
  subtitulo: 'Soluções integradas para cada segmento, com direito, contabilidade, tributário, prática notarial-registral e tecnologia trabalhando juntos.',
  cta: 'Fale com um especialista',
  seo_description: 'Nove verticais de negócio do Complexo DMC: famílias empresárias, agronegócio, incorporação, cartórios, infraestrutura, indústria, saúde, educação e crédito. Direito, contabilidade, tributário e tecnologia integrados.',
  introducao_titulo: 'Uma estrutura, nove segmentos',
  introducao: 'Cada segmento econômico carrega um problema patrimonial, tributário e documental próprio. O Complexo DMC organiza sua atuação em nove verticais de cliente para responder a essas particularidades com equipe e método dedicados. Em todas elas, as seis áreas de atuação da casa trabalham de forma integrada: o cliente tem um único interlocutor para um problema que, normalmente, exigiria vários prestadores.',
  areas_texto: 'Cada vertical combina as áreas de atuação de que o segmento precisa.',
  video_titulo: 'As nove verticais em vídeo',
  video_texto: 'Como a mesma estrutura atende segmentos tão diferentes sem trocar de método.'
};

export const VERTICAIS = [
  // ---------------------------------------------------------------- 1
  {
    numero: 1,
    slug: 'familias-empresarias-holdings',
    perfil: 'familia-empresaria', // perfil do /api/contato mais próximo do segmento
    nome: 'Famílias Empresárias, Holdings e Grandes Patrimônios',
    curto: 'Famílias Empresárias e Holdings',
    card_titulo: 'Famílias Empresárias e Holdings',
    card_descricao: 'Sucessão, governança e proteção do patrimônio familiar antes que um evento involuntário decida por você.',
    areas: ['E1', 'E2', 'E3', 'E4'],
    seo_description: 'Planejamento patrimonial e sucessório, holdings familiares, governança e eficiência no ITCMD para famílias empresárias. Complexo DMC, São Paulo.',
    hero_subtitulo: 'Estruturação patrimonial, sucessão e governança para famílias que concentram patrimônio relevante em empresas, imóveis e ativos financeiros.',
    hero_pos: '62% 45%',
    dores: [
      'Sucessão sem planejamento formal e herdeiros com interesses distintos',
      'Patrimônio exposto a cônjuges, uniões estáveis e regimes de bens não planejados',
      'Aumento da carga do ITCMD com a progressividade obrigatória'
    ],
    bloco1: {
      rotulo: 'O patrimônio da família',
      titulo: 'Organização patrimonial com visão jurídica, contábil e tributária',
      paragrafos: [
        'Famílias empresárias costumam acumular patrimônio em estruturas criadas em momentos diferentes, sem uma lógica comum. Empresas operacionais, imóveis em nome de pessoas físicas, participações cruzadas e aplicações financeiras convivem sem regras claras de controle e de transmissão.',
        'O Complexo DMC diagnostica esse conjunto de forma integrada e desenha a estrutura adequada a cada família: holding patrimonial, acordo de sócios, protocolo familiar e planejamento da transmissão, com execução notarial e registral conduzida pela própria casa.'
      ]
    },
    bloco2: {
      rotulo: 'Continuidade entre gerações',
      titulo: 'Governança para que a sucessão não interrompa o negócio',
      paragrafos: [
        'A maior parte das empresas familiares não chega à terceira geração. O motivo raramente é operacional: é a ausência de regras sobre quem decide, quem administra e como o patrimônio passa de uma geração para outra.',
        'A atuação da DMC combina instrumentos societários, regras de governança e planejamento tributário da transmissão, com acompanhamento contínuo para que a estrutura se mantenha adequada à medida que a família e o patrimônio mudam.'
      ]
    },
    publicos_titulo: 'Para quem atuamos',
    publicos: [
      'Fundadores com empresa operacional e sucessão ainda não formalizada',
      'Herdeiros em posição de comando que administram patrimônio em condomínio',
      'Holdings familiares já constituídas, sem acordo de sócios ou com contrato social frágil',
      'Famílias em conflito societário ou com divergência entre ramos familiares',
      'Inventariantes de espólios com bens em mais de um estado ou no exterior',
      'Famílias que precisam proteger quotas e bens diante de casamentos e uniões estáveis'
    ],
    gatilhos: [
      'Diagnóstico de doença grave ou falecimento do fundador',
      'Planejamento antes da vigência das novas tabelas progressivas de ITCMD',
      'Casamento, separação ou nascimento que altera a exposição patrimonial',
      'Entrada de sócio, venda parcial ou proposta de aquisição da empresa'
    ],
    atuacao: [
      { area: 'E1', titulo: 'Planejamento Patrimonial e Sucessório', itens: [
        'Diagnóstico do patrimônio familiar e mapa de riscos',
        'Constituição e revisão de holdings patrimoniais',
        'Doação de quotas com reserva de usufruto e cláusulas restritivas',
        'Testamentos, protocolo familiar e acordo de sócios',
        'Inventários e partilhas extrajudiciais'
      ] },
      { area: 'E2', titulo: 'Tributário e Societário', itens: [
        'Simulação da carga de ITCMD por estado e por herdeiro',
        'Planejamento da transmissão frente à progressividade',
        'Reorganizações societárias, cisões e incorporações',
        'Integralização de bens em sociedade'
      ] },
      { area: 'E3', titulo: 'Notarial e Imobiliário', itens: [
        'Lavratura e acompanhamento de escrituras',
        'Regularização de matrículas dos imóveis da família',
        'Due diligence registral do acervo',
        'Averbações e registros pós-reorganização'
      ] },
      { area: 'E4', titulo: 'Contabilidade e Auditoria', itens: [
        'Contabilidade da holding e das empresas do grupo',
        'Avaliação patrimonial para fins societários e sucessórios',
        'Prestação de contas aos sócios e herdeiros',
        'Relatórios gerenciais consolidados'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Blindagem de quotas em holding familiar',
      texto_publico: 'Estruturação de holding familiar com cláusulas de incomunicabilidade, regras de ingresso de cônjuges e companheiros e protocolo para aquisição de novos bens, preservando o controle familiar das quotas entre gerações.',
      cliente_interno: 'Família Fonseca — Apogeu Participações', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'Com a Emenda Constitucional 132/2023 e a Lei Complementar 227/2026, o ITCMD passou a ser obrigatoriamente progressivo em todo o país, com base de cálculo a valor de mercado. Em regra, leis estaduais que aumentem o imposto só produzem efeitos no exercício seguinte à sua publicação.',
      numeros: [
        { valor: '90%', rotulo: 'das empresas brasileiras são familiares' },
        { valor: '65%', rotulo: 'do PIB vem de empresas familiares' },
        { valor: '19%', rotulo: 'das empresas familiares chegam à terceira geração' }
      ],
      fonte: 'IBGE, Sebrae; PwC — Índice Global de Empresas Familiares; EC 132/2023; LC 227/2026.'
    },
    faq: [
      { p: 'O que é uma holding familiar e quando ela faz sentido?', r: 'É uma sociedade criada para concentrar e administrar o patrimônio da família. Faz sentido quando há patrimônio relevante, mais de um herdeiro e necessidade de regras sobre controle, administração e transmissão. A decisão depende de diagnóstico: em alguns casos, outros instrumentos são mais adequados.' },
      { p: 'O que muda no ITCMD com a reforma tributária?', r: 'A progressividade passou a ser obrigatória, com alíquotas maiores para transmissões de maior valor, e a base de cálculo passou a ser o valor de mercado dos bens. Cada estado precisa adaptar sua lei, o que torna o planejamento antecipado especialmente relevante.' },
      { p: 'Planejamento sucessório substitui o inventário?', r: 'Ele reduz ou organiza o que vai a inventário. Bens transmitidos em vida por doação ou já estruturados em sociedade seguem regras próprias. O que permanecer em nome da pessoa física continuará sujeito a inventário, judicial ou extrajudicial.' },
      { p: 'É possível proteger o patrimônio em caso de divórcio de um herdeiro?', r: 'É possível reduzir significativamente a exposição com cláusulas de incomunicabilidade, regras no contrato social e no acordo de sócios e orientação sobre regime de bens e pactos. O desenho precisa ser feito antes do evento, e não depois.' }
    ],
    video_texto: 'Como a família decide em vida o que, sem plano, o inventário decidiria por ela.'
  },

  // ---------------------------------------------------------------- 2
  {
    numero: 2,
    slug: 'agronegocio-patrimonio-rural',
    perfil: 'produtor-rural', // perfil do /api/contato mais próximo do segmento
    nome: 'Agronegócio e Patrimônio Rural',
    curto: 'Agronegócio e Patrimônio Rural',
    card_titulo: 'Agronegócio e Patrimônio Rural',
    card_descricao: 'Sucessão, regularização fundiária e reestruturação de grupos agropecuários familiares.',
    areas: ['E1', 'E2', 'E3', 'E4', 'E5'],
    seo_description: 'Sucessão rural, holding agrícola, regularização de imóveis rurais e reestruturação de grupos do agronegócio. Complexo DMC.',
    hero_subtitulo: 'Sucessão, regularização de imóveis rurais e reestruturação para grupos agrícolas e pecuários de controle familiar.',
    hero_pos: '60% 50%',
    dores: [
      'Fazendas em condomínio entre herdeiros, sem regra de administração',
      'Matrículas, georreferenciamento, CCIR e ITR com pendências',
      'Operações deficitárias que comprometem o resultado do grupo'
    ],
    bloco1: {
      rotulo: 'Na rotina do campo',
      titulo: 'Patrimônio produtivo exige planejamento específico',
      paragrafos: [
        'No agronegócio, a terra é ao mesmo tempo ativo de produção e herança. Uma sucessão mal conduzida fragmenta a propriedade, interrompe o ciclo produtivo e, não raro, obriga a família a vender áreas para pagar tributos e custos de inventário.',
        'O Complexo DMC atua com equipe que reúne direito, contabilidade rural, tributário e prática registral para estruturar a sucessão sem paralisar a operação e com documentação que sustente crédito, arrendamento e venda.'
      ]
    },
    bloco2: {
      rotulo: 'Reestruturação e governança',
      titulo: 'Do diagnóstico das fazendas à governança do grupo',
      paragrafos: [
        'Além da sucessão, grupos agropecuários enfrentam contratos de arrendamento e fornecimento desatualizados, unidades de negócio deficitárias e ausência de informação gerencial confiável por fazenda e por cultura.',
        'A DMC conduz a reestruturação de ponta a ponta: renegociação de contratos, encerramento ou alienação de operações, leilões extrajudiciais de ativos e implantação de governança familiar que estabelece quem decide e como.'
      ]
    },
    publicos_titulo: 'Em toda a cadeia do patrimônio rural',
    publicos: [
      'Grupos agropecuários familiares em transição de geração',
      'Produtores rurais pessoa física que avaliam constituir holding rural',
      'Usinas, cooperativas e grupos sucroenergéticos',
      'Espólios com imóveis rurais em mais de uma comarca',
      'Investidores e fundos adquirentes de terras',
      'Operações agrícolas em encerramento ou alienação de ativos'
    ],
    gatilhos: [
      'Abertura de sucessão com acervo rural relevante',
      'Renegociação de arrendamentos, parcerias e contratos de fornecimento',
      'Exigência bancária de regularização para liberar crédito rural',
      'Necessidade de alienar ativos do espólio ou do grupo'
    ],
    atuacao: [
      { area: 'E1', titulo: 'Sucessão e Holding Rural', itens: [
        'Planejamento sucessório do grupo agropecuário',
        'Holding rural e doação de quotas',
        'Inventário e partilha de imóveis rurais',
        'Protocolo familiar e governança do grupo'
      ] },
      { area: 'E3', titulo: 'Regularização Fundiária', itens: [
        'Due diligence dominial e ambiental de imóveis rurais',
        'Georreferenciamento, CCIR, ITR e CAR',
        'Retificação de área e unificação de matrículas',
        'Contratos de arrendamento e parceria'
      ] },
      { area: 'E2', titulo: 'Tributário Rural', itens: [
        'Enquadramento do produtor PF e PJ',
        'Planejamento tributário da atividade rural',
        'Recuperação de créditos de insumos',
        'Estrutura tributária da transmissão'
      ] },
      { area: 'E5', titulo: 'Reestruturação e Ativos', itens: [
        'Encerramento de operações deficitárias',
        'Leilão extrajudicial de bens',
        'Renegociação de passivos do grupo',
        'Alienação estruturada de ativos'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Reestruturação de grupo agrícola em sucessão',
      texto_publico: 'Condução integrada da sucessão de um grupo agrícola familiar: renegociação dos contratos do grupo, reestruturação das fazendas, encerramento de unidade deficitária, leilão extrajudicial de bens do espólio e implantação de governança familiar.',
      cliente_interno: 'Aliança Boa Participações Agrícolas', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'O país atravessa uma transferência geracional de patrimônio de grande escala, com forte concentração no setor agropecuário. Sem planejamento, parte dessas propriedades tende a ser fragmentada ou vendida para quitar tributos.',
      numeros: [
        { valor: '3,9 mi', rotulo: 'propriedades da agricultura familiar' },
        { valor: '23%', rotulo: 'da área agrícola do país' }
      ],
      fonte: 'CONTAG — Anuário Estatístico da Agricultura Familiar.'
    },
    faq: [
      { p: 'Vale a pena constituir uma holding rural?', r: 'Depende do porte, do número de herdeiros e da forma de exploração da terra. A holding pode facilitar a sucessão e a administração, mas há efeitos tributários que precisam ser simulados antes. A decisão deve partir de diagnóstico.' },
      { p: 'Imóvel rural com pendência de georreferenciamento pode ser inventariado?', r: 'O inventário pode ser aberto, mas registros posteriores, desmembramentos e transferências dependem da regularização exigida em lei. Tratar o georreferenciamento junto com a sucessão evita que a partilha fique travada no registro.' },
      { p: 'Como manter a fazenda produzindo durante o inventário?', r: 'Com a nomeação adequada do inventariante, autorizações para atos de administração e contratos que deem continuidade à operação. A estrutura certa evita que a produção pare enquanto a partilha não é concluída.' },
      { p: 'A DMC atende grupos fora de São Paulo?', r: 'Sim. A atuação contempla imóveis e operações em diferentes estados e comarcas, com acompanhamento notarial e registral em cada localidade.' }
    ],
    video_texto: 'Sucessão da terra sem parar a safra: o que muda quando o registro e a operação são tratados juntos.'
  },

  // ---------------------------------------------------------------- 3
  {
    numero: 3,
    slug: 'incorporacao-construcao-imobiliario',
    perfil: 'incorporadora-construtora', // perfil do /api/contato mais próximo do segmento
    nome: 'Incorporação, Construção Civil e Mercado Imobiliário',
    curto: 'Incorporação e Mercado Imobiliário',
    card_titulo: 'Incorporação e Mercado Imobiliário',
    card_descricao: 'Regularização de estoque, segurança registral e estrutura tributária para incorporadoras, construtoras e loteadoras.',
    areas: ['E2', 'E3', 'E4', 'E6'],
    seo_description: 'Regularização de estoque imobiliário, incorporação, loteamentos, due diligence registral e tributação imobiliária. Complexo DMC.',
    hero_subtitulo: 'Regularidade documental do estoque, segurança nas operações imobiliárias e estrutura tributária para incorporadoras, construtoras e loteadoras.',
    hero_pos: '65% 45%',
    dores: [
      'Unidades sem matrícula individualizada ou averbação pendente',
      'Crédito e securitização travados por cadeia dominial irregular',
      'Passivo tributário e trabalhista acumulado ao longo das obras'
    ],
    bloco1: {
      rotulo: 'Regularidade como ativo',
      titulo: 'Estoque regular é estoque vendável',
      paragrafos: [
        'No mercado imobiliário, o resultado da operação depende da regularidade do registro. Unidades sem matrícula, obras sem averbação e pendências de CNO e habite-se reduzem a liquidez, dificultam o financiamento ao comprador e impedem operações de crédito.',
        'O Complexo DMC atua na fronteira entre o registro de imóveis, a contabilidade do ativo imobilizado e a tributação da operação, com análise técnica de matrículas apoiada por tecnologia própria.'
      ]
    },
    bloco2: {
      rotulo: 'Operações com segurança',
      titulo: 'Da aquisição do terreno à entrega das unidades',
      paragrafos: [
        'Compra e venda, permuta, dação, cessão de direitos e aporte de imóveis em sociedade exigem instrumentos bem redigidos e cadeia dominial verificada. Falhas nessa etapa costumam aparecer somente na hora do registro ou do financiamento.',
        'A DMC estrutura os instrumentos, conduz a due diligence e acompanha o registro, com contratos padronizados para loteamentos e empreendimentos com grande número de unidades.'
      ]
    },
    publicos_titulo: 'Para quem atuamos',
    publicos: [
      'Incorporadoras com estoque a regularizar',
      'Loteadoras sob o regime da Lei 6.766/79',
      'Construtoras com pendências de CNO, habite-se e instituição de condomínio',
      'Proprietários institucionais de carteiras imobiliárias',
      'Administradoras, condomínios e síndicos profissionais',
      'Compradores e vendedores em operações PF→PJ, permuta e cessão de direitos'
    ],
    gatilhos: [
      'Auditoria de estoque com unidades irregulares',
      'Operação de crédito ou securitização que exige cadeia dominial limpa',
      'Litígio com intermediadora, distrato ou arrematação por terceiro',
      'Transferência de controle, cisão ou aporte de imóveis em sociedade'
    ],
    atuacao: [
      { area: 'E3', titulo: 'Notarial e Registral', itens: [
        'Análise técnica de matrículas e classificação de risco',
        'Individualização de matrículas e instituição de condomínio',
        'Escrituras de compra e venda, permuta e dação',
        'Contratos de cessão de direitos para loteamentos',
        'Acompanhamento de exigências do registro'
      ] },
      { area: 'E2', titulo: 'Tributário Imobiliário', itens: [
        'Regime tributário da incorporação',
        'ITBI, ganho de capital e integralização de imóveis',
        'Revisão de aferição de obra (CNO)',
        'Planejamento tributário de SPEs'
      ] },
      { area: 'E4', titulo: 'Contabilidade e Auditoria', itens: [
        'Contabilidade do ativo imobilizado e do estoque',
        'Auditoria de estoque imobiliário',
        'Demonstrações para investidores e credores'
      ] },
      { area: 'E6', titulo: 'Trabalhista', itens: [
        'Gestão de riscos trabalhistas em obras',
        'Conformidade de terceirizadas',
        'Folha de condomínios e encargos'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Regularização de estoque imobilizado',
      texto_publico: 'Consultoria imobiliária para regularização do estoque imobilizado de incorporadora e de empreendimentos de grande instituição proprietária, com diagnóstico registral das unidades e plano de saneamento das pendências.',
      cliente_interno: 'Mitre Incorporadora; Uninove', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'A regularidade registral deixou de ser uma formalidade e passou a ser condição de liquidez: matrícula irregular impede crédito, securitização e venda com financiamento.',
      numeros: [],
      fonte: ''
    },
    faq: [
      { p: 'Por que meu imóvel não pode ser financiado se a escritura está pronta?', r: 'Porque o financiamento depende do registro na matrícula, e não apenas da escritura. Pendências como falta de averbação da construção, divergência de área ou ônus não cancelados impedem o registro e, portanto, a garantia exigida pelo banco.' },
      { p: 'É possível regularizar um empreendimento já entregue?', r: 'Na maioria dos casos, sim. O caminho depende do tipo de pendência: averbação de construção, instituição de condomínio, individualização de matrículas ou retificação de área.' },
      { p: 'Loteamento precisa de anuência da loteadora para cessão de direitos?', r: 'Em regra, a cessão do compromisso de compra e venda em loteamento independe de anuência da loteadora, observadas as condições legais e contratuais. O instrumento deve ser redigido de forma a permitir o registro.' },
      { p: 'A DMC atua só em São Paulo?', r: 'A sede é em São Paulo, mas a atuação registral alcança imóveis em outras comarcas e estados.' }
    ],
    video_texto: 'Por que a matrícula decide a liquidez do empreendimento antes do preço.'
  },

  // ---------------------------------------------------------------- 4
  {
    numero: 4,
    slug: 'cartorios-servicos-registrais',
    perfil: 'outro', // perfil do /api/contato mais próximo do segmento
    nome: 'Cartórios e Serviços Notariais e Registrais',
    curto: 'Cartórios e Serviços Registrais',
    card_titulo: 'Cartórios e Serviços Registrais',
    card_descricao: 'Tecnologia proprietária, gestão e conformidade para tabelionatos e registros.',
    areas: ['E3', 'E4', 'E6'],
    seo_description: 'Tecnologia para cartórios, geração assistida de minutas, qualificação de documentos, gestão de serventias e conformidade. Complexo DMC.',
    hero_subtitulo: 'Tecnologia proprietária, gestão e conformidade para serventias extrajudiciais que precisam produzir mais atos, com menos retrabalho e mais segurança jurídica.',
    hero_pos: '60% 50%',
    dores: [
      'Volume de minutas acima da capacidade da equipe',
      'Retrabalho na qualificação e exigências recorrentes',
      'Pressão por digitalização e integração a sistemas eletrônicos'
    ],
    bloco1: {
      rotulo: 'Para a serventia',
      titulo: 'Tecnologia construída por quem conhece a prática notarial',
      paragrafos: [
        'Nesta vertical, o cliente do Complexo DMC é o próprio cartório. As serventias precisam responder à desjudicialização e à transformação digital sem abrir mão da segurança que sustenta a fé pública.',
        'A DMC desenvolve plataformas próprias que leem documentos, organizam as partes e os bens e preparam a minuta do ato. A regra de projeto é inegociável: um campo sem fonte documental fica pendente — o sistema não preenche dado que não esteja no documento.'
      ]
    },
    bloco2: {
      rotulo: 'Gestão da serventia',
      titulo: 'Operação, equipe e conformidade em um só lugar',
      paragrafos: [
        'Além da produção de atos, a plataforma reúne orçamento de emolumentos, gestão de equipes e de desempenho, acompanhamento de diligências e canal de atendimento ao usuário.',
        'Para novos titulares e interinos, a DMC também apoia a reorganização da serventia: estrutura de equipe, rotinas, conformidade trabalhista e controles contábeis.'
      ]
    },
    publicos_titulo: 'Para todas as especialidades',
    publicos: [
      'Tabelionatos de notas',
      'Registros de imóveis',
      'Registros de títulos e documentos e civil de pessoas jurídicas',
      'Registros civis de pessoas naturais',
      'Tabelionatos de protesto',
      'Novos titulares e interinos em reorganização da serventia'
    ],
    gatilhos: [
      'Novos provimentos que alteram padrão de ato ou de prestação de contas',
      'Assunção da serventia por novo titular',
      'Fila de minutas e escrituras acima da capacidade da equipe',
      'Necessidade de integração a centrais e sistemas eletrônicos'
    ],
    atuacao: [
      { area: 'E3', titulo: 'Tecnologia para Atos', itens: [
        'Leitura e classificação automática de documentos',
        'Geração assistida de minutas com validação de campos',
        'Análise técnica de matrículas',
        'Due diligence e consultas integradas',
        'Monitoramento de protestos'
      ] },
      { area: 'E4', titulo: 'Gestão e Controles', itens: [
        'Orçamento de emolumentos',
        'Painéis de desempenho por equipe',
        'Controles contábeis da serventia',
        'Relatórios gerenciais'
      ] },
      { area: 'E6', titulo: 'Equipe e Conformidade', itens: [
        'Estruturação de equipe e funções',
        'Conformidade trabalhista e NR-1',
        'Prevenção de passivo trabalhista'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Ecossistema de tecnologia notarial',
      texto_publico: 'Acordo de desenvolvimento conjunto com tabelionato para evolução de plataforma de produção de atos, combinando a experiência prática da serventia com a engenharia de produto do Complexo DMC.',
      cliente_interno: 'Acordo de Ecossistema de Negócios Conjuntos', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'O Brasil tem mais de 13 mil serventias extrajudiciais. A Anoreg/BR mapeia em 2026 o estágio de transformação digital e de uso de inteligência artificial nos cartórios, tema central para a atividade nos próximos anos.',
      numeros: [
        { valor: '13 mil+', rotulo: 'serventias extrajudiciais no país' }
      ],
      fonte: 'Anoreg/BR; CNJ; Raio-X dos Cartórios 2026.'
    },
    faq: [
      { p: 'A tecnologia substitui o escrevente?', r: 'Não. Ela elimina a digitação e a conferência mecânica, para que o escrevente concentre seu tempo na qualificação jurídica. A decisão sobre o ato continua sendo da serventia.' },
      { p: 'Como o sistema evita dados incorretos na minuta?', r: 'Cada campo é vinculado ao documento de origem. Se a informação não estiver no documento, o campo fica pendente e sinalizado para conferência, em vez de ser preenchido por estimativa.' },
      { p: 'Os dados das partes ficam protegidos?', r: 'Sim. A plataforma foi desenhada com controle de acesso por perfil, separação por serventia e tratamento de dados pessoais em conformidade com a LGPD.' },
      { p: 'Quais tipos de ato a plataforma atende?', r: 'A plataforma cobre inventários, partilhas e escrituras de compra e venda e suas variantes, além de módulos de due diligence, protesto e emolumentos. A cobertura é ampliada continuamente.' }
    ],
    video_texto: 'Da leitura do documento à minuta pronta para qualificação: o fluxo da plataforma na serventia.'
  },

  // ---------------------------------------------------------------- 5
  {
    numero: 5,
    slug: 'infraestrutura-saneamento-energia',
    perfil: 'empresario', // perfil do /api/contato mais próximo do segmento
    nome: 'Infraestrutura, Saneamento e Energia',
    curto: 'Infraestrutura, Saneamento e Energia',
    card_titulo: 'Infraestrutura, Saneamento e Energia',
    card_descricao: 'Liberação fundiária de frentes de obra, servidões e regularização para concessionárias e grupos de energia.',
    areas: ['E1', 'E2', 'E3', 'E5'],
    seo_description: 'Liberação fundiária, due diligence de imóveis, servidões e regularização de áreas para obras de saneamento, energia e infraestrutura. Complexo DMC.',
    hero_subtitulo: 'Liberação fundiária, servidões e regularização de áreas para que obras de saneamento, energia e infraestrutura avancem dentro do prazo.',
    hero_pos: '60% 50%',
    dores: [
      'Frentes de obra paradas por pendência de posse ou domínio',
      'Centenas de proprietários e matrículas em vários municípios',
      'Metas contratuais com prazo definido'
    ],
    bloco1: {
      rotulo: 'Antes da obra',
      titulo: 'Liberação fundiária com método e escala',
      paragrafos: [
        'Toda obra linear ou de estação precisa, antes de começar, resolver posse, domínio, servidão e restrições ambientais sobre imóveis de terceiros. Quando esse trabalho atrasa, a obra inteira atrasa.',
        'O Complexo DMC conduz a liberação fundiária com levantamento cartorial, cruzamento de matrículas com decretos de utilidade pública e georreferenciamento, análise ambiental e negociação extrajudicial com proprietários, seguindo critérios uniformes e documentados.'
      ]
    },
    bloco2: {
      rotulo: 'Depois da obra',
      titulo: 'Regularização registral até a etapa final',
      paragrafos: [
        'Concluída a instalação, ainda é preciso retificar áreas, averbar servidões e abrir novas matrículas. Sem essa etapa, o ativo da concessionária permanece sem a devida segurança registral.',
        'A DMC acompanha o ciclo completo, da due diligence inicial ao registro final, com equipe organizada para atuar em vários municípios simultaneamente.'
      ]
    },
    publicos_titulo: 'Para quem atuamos',
    publicos: [
      'Companhias de saneamento e concessionárias privadas',
      'Empreiteiras e consórcios executores de obras',
      'Geradoras e grupos de energia — hidrelétricas, PCHs, solar e transmissão',
      'Municípios e consórcios em estruturação de concessões e PPPs',
      'Fundos e investidores em infraestrutura',
      'Proprietários atingidos por decreto de utilidade pública'
    ],
    gatilhos: [
      'Frente de obra travada por pendência dominial, ambiental ou de servidão',
      'Meta contratual de universalização com prazo próximo',
      'Retificação e averbação de matrícula após a instalação',
      'Sucessão ou reestruturação societária em grupo de energia'
    ],
    atuacao: [
      { area: 'E3', titulo: 'Liberação Fundiária', itens: [
        'Levantamento cartorial e due diligence de matrículas',
        'Georreferenciamento e sobreposição de camadas',
        'Instituição de servidões administrativas',
        'Retificação e averbação pós-obra',
        'Abertura de novas matrículas'
      ] },
      { area: 'E5', titulo: 'Negociação e Ativos', itens: [
        'Negociação extrajudicial com proprietários',
        'Avaliação e proposta indenizatória',
        'Termos de acordo e de aceite'
      ] },
      { area: 'E1', titulo: 'Grupos de Energia', itens: [
        'Sucessão e governança de grupos de energia',
        'Reestruturação societária',
        'Acordos de sócios e de governança'
      ] },
      { area: 'E2', titulo: 'Tributário', itens: [
        'Tributação de indenizações e servidões',
        'Estrutura tributária de SPEs e concessões'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Liberação de frentes de obra de saneamento',
      texto_publico: 'Contrato de liberação fundiária de frentes de obra de saneamento em múltiplos municípios simultâneos: due diligence cartorial, análise ambiental, negociação extrajudicial com proprietários e regularização registral após a instalação.',
      cliente_interno: 'SABESP — Sorocaba e outros municípios', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'O Marco Legal do Saneamento (Lei 14.026/2020) fixou metas de 99% de abastecimento de água e 90% de coleta e tratamento de esgoto até 2033. O ritmo atual de investimentos precisa crescer de forma significativa para que as metas sejam alcançadas.',
      numeros: [
        { valor: '2033', rotulo: 'prazo para universalização' },
        { valor: 'R$ 29,1 bi', rotulo: 'investidos em saneamento em 2024' },
        { valor: '44,8%', rotulo: 'da população sem coleta de esgoto' }
      ],
      fonte: 'Lei 14.026/2020; Abcon; Instituto Trata Brasil (2025).'
    },
    faq: [
      { p: 'O que é liberação fundiária?', r: 'É o conjunto de providências jurídicas, registrais e ambientais necessárias para que a obra possa ocupar legalmente as áreas de que precisa: levantamento de proprietários, verificação de matrículas, instituição de servidões, acordos e regularização.' },
      { p: 'Toda liberação precisa de desapropriação judicial?', r: 'Não. Uma parte relevante dos casos pode ser resolvida por acordo extrajudicial, com proposta fundamentada e documentação adequada. A via judicial fica para as situações em que não há acordo ou há impedimento documental.' },
      { p: 'Como garantir tratamento uniforme a centenas de proprietários?', r: 'Com critérios objetivos e documentados de avaliação e negociação, aplicados da mesma forma em todos os municípios. Isso dá previsibilidade ao contratante e segurança diante de órgãos de controle.' },
      { p: 'A DMC atua em vários municípios ao mesmo tempo?', r: 'Sim. A operação é organizada por frente de obra e por município, com processos padronizados que permitem atuação simultânea.' }
    ],
    video_texto: 'O caminho de uma frente de obra: da matrícula ao termo de acordo com o proprietário.'
  },

  // ---------------------------------------------------------------- 6
  {
    numero: 6,
    slug: 'industria-comercio-distribuicao',
    perfil: 'empresario', // perfil do /api/contato mais próximo do segmento
    nome: 'Indústria, Comércio e Distribuição',
    curto: 'Indústria, Comércio e Distribuição',
    card_titulo: 'Indústria, Comércio e Distribuição',
    card_descricao: 'Recuperação de créditos, reestruturação contábil e preparação para IBS e CBS.',
    areas: ['E1', 'E2', 'E4', 'E5', 'E6'],
    seo_description: 'Recuperação de créditos tributários, reestruturação contábil, auditoria e transição para IBS e CBS para indústrias e distribuidores. Complexo DMC.',
    hero_subtitulo: 'Recuperação de créditos, reestruturação contábil e preparação para o novo sistema de tributação sobre o consumo, para indústrias, atacadistas, distribuidores e redes de varejo.',
    hero_pos: '62% 50%',
    dores: [
      'Créditos de PIS, COFINS e ICMS não aproveitados',
      'Escrituração sem confiabilidade para decisão e para fiscalização',
      'Transição para IBS e CBS sem modelagem de impacto'
    ],
    bloco1: {
      rotulo: 'Operação fiscal',
      titulo: 'Números confiáveis para decidir e para se defender',
      paragrafos: [
        'Empresas com operação fiscal intensiva operam com margens sensíveis à carga tributária. Créditos não aproveitados, classificações equivocadas e escrituração desorganizada representam perda direta de resultado e exposição a autuações.',
        'O Complexo DMC reorganiza a base contábil e fiscal, identifica créditos recuperáveis e entrega informação confiável para gestão, crédito e eventual defesa administrativa.'
      ]
    },
    bloco2: {
      rotulo: 'Reforma tributária',
      titulo: 'Preparação para o IVA dual',
      paragrafos: [
        'A substituição gradual dos tributos sobre o consumo pelo IBS e pela CBS exige revisar precificação, cadeia de fornecedores, contratos e sistemas de apuração.',
        'A DMC simula o impacto da transição para a operação de cada cliente e organiza o aproveitamento de créditos do regime anterior enquanto ele ainda é possível.'
      ]
    },
    publicos_titulo: 'Para quem atuamos',
    publicos: [
      'Indústrias de transformação',
      'Atacadistas e distribuidores com substituição tributária e regimes especiais',
      'Redes varejistas e franqueadoras em expansão',
      'Empresas com autuação em curso ou passivo fiscal não dimensionado',
      'Grupos industriais familiares',
      'Transportadoras e operadores logísticos da cadeia industrial'
    ],
    gatilhos: [
      'Planejamento da transição para IBS e CBS',
      'Fiscalização, auto de infração ou necessidade de laudo de créditos',
      'Perda de confiança nos números contábeis',
      'Crédito, aquisição ou entrada de investidor'
    ],
    atuacao: [
      { area: 'E2', titulo: 'Tributário', itens: [
        'Recuperação de créditos de PIS, COFINS e ICMS',
        'Revisão de regimes especiais e substituição tributária',
        'Simulação de impacto do IBS e da CBS',
        'Defesa em autos de infração'
      ] },
      { area: 'E4', titulo: 'Contabilidade e Auditoria', itens: [
        'Reestruturação contábil',
        'Auditoria de demonstrações',
        'Custos e margens por linha de produto',
        'Relatórios gerenciais'
      ] },
      { area: 'E5', titulo: 'Recuperação de Ativos', itens: [
        'Restituição e compensação de tributos',
        'Recuperação de créditos comerciais',
        'Desbloqueio de ativos em execuções'
      ] },
      { area: 'E6', titulo: 'Trabalhista', itens: [
        'Conformidade NR-1',
        'Prevenção de passivo trabalhista',
        'Revisão de encargos sobre folha'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Reestruturação contábil e recuperação de créditos',
      texto_publico: 'Reestruturação da contabilidade de empresa de comércio e representação, com assunção da frente contábil e condução de recuperação de crédito tributário.',
      cliente_interno: 'Biplastic Comércio e Representação', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'A transição para o IVA dual obriga empresas com operação fiscal relevante a revisar sua modelagem tributária em um intervalo curto, e torna mais urgente o aproveitamento de créditos do regime anterior.',
      numeros: [],
      fonte: 'EC 132/2023; LC 214/2025.'
    },
    faq: [
      { p: 'Minha empresa tem créditos tributários a recuperar?', r: 'Só a revisão das apurações responde com segurança. Créditos sobre insumos, exclusões de base de cálculo e pagamentos indevidos são frequentes em empresas com operação fiscal intensa, especialmente quando a escrituração não foi revisada nos últimos anos.' },
      { p: 'Qual o prazo para recuperar tributos pagos a maior?', r: 'Em regra, cinco anos contados do pagamento, para tributos federais. Por isso, quanto antes a revisão for feita, maior a parcela recuperável.' },
      { p: 'Como a reforma tributária afeta minha precificação?', r: 'A mudança na forma de crédito e de incidência altera o custo efetivo de insumos e a carga sobre a venda. O impacto varia por setor e por cadeia de fornecedores e precisa ser simulado com os dados da própria empresa.' },
      { p: 'A DMC assume a contabilidade da empresa?', r: 'Sim. A frente contábil pode ser assumida integralmente pelo grupo ou atuar em conjunto com a equipe interna do cliente.' }
    ],
    video_texto: 'O que a escrituração precisa ter para sustentar crédito, decisão e defesa fiscal.'
  },

  // ---------------------------------------------------------------- 7
  {
    numero: 7,
    slug: 'saude-profissionais-liberais',
    perfil: 'empresario', // perfil do /api/contato mais próximo do segmento
    nome: 'Saúde e Profissionais Liberais de Alta Renda',
    curto: 'Saúde e Profissionais Liberais',
    card_titulo: 'Saúde e Profissionais Liberais',
    card_descricao: 'Estrutura societária, tributação e proteção patrimonial para médicos, clínicas e profissionais de alta renda.',
    areas: ['E1', 'E2', 'E4', 'E6'],
    seo_description: 'Contabilidade, estrutura societária, planejamento tributário e proteção patrimonial para médicos, clínicas e profissionais liberais. Complexo DMC.',
    hero_subtitulo: 'Estrutura societária, eficiência tributária e proteção patrimonial para médicos, clínicas e profissionais liberais de alta renda.',
    hero_pos: '60% 50%',
    dores: [
      'Enquadramento tributário que deixou de ser eficiente com o crescimento',
      'Clínicas com vários sócios e sem acordo de sócios',
      'Patrimônio pessoal exposto aos riscos da atividade'
    ],
    bloco1: {
      rotulo: 'Para quem atende',
      titulo: 'Estrutura adequada ao tamanho da sua atividade',
      paragrafos: [
        'Profissionais de saúde e liberais costumam crescer mais rápido do que a estrutura que os sustenta. A sociedade criada no início já não reflete o faturamento, os sócios ou o patrimônio acumulado.',
        'O Complexo DMC revisa o enquadramento tributário, organiza a sociedade e cuida da contabilidade por meio da Bear Finance, o braço contábil do grupo.'
      ]
    },
    bloco2: {
      rotulo: 'Patrimônio pessoal',
      titulo: 'Separar a atividade do patrimônio da família',
      paragrafos: [
        'Imóveis e investimentos acumulados ao longo da carreira ficam, muitas vezes, no mesmo nome que responde pelos riscos da atividade profissional.',
        'A DMC estrutura a separação entre atividade e patrimônio e planeja a sucessão, com instrumentos proporcionais ao porte de cada profissional.'
      ]
    },
    publicos_titulo: 'Para quem atuamos',
    publicos: [
      'Médicos pessoa jurídica e sociedades de profissionais de saúde',
      'Clínicas, centros diagnósticos e day clinics',
      'Grupos de especialidades em fusão ou incorporação',
      'Advogados, engenheiros, arquitetos e consultores de alta renda',
      'Profissionais com patrimônio imobiliário relevante',
      'Pacientes em litígio com operadoras de saúde'
    ],
    gatilhos: [
      'Crescimento de faturamento que exige rever o regime tributário',
      'Entrada ou saída de sócio da clínica',
      'Aquisição de imóvel ou formação de patrimônio',
      'Negativa de cobertura por operadora de saúde'
    ],
    atuacao: [
      { area: 'E4', titulo: 'Contabilidade', itens: [
        'Abertura e contabilidade de sociedades médicas',
        'Folha de pagamento e obrigações acessórias',
        'Certificado digital e procuração eletrônica',
        'Relatórios gerenciais da clínica'
      ] },
      { area: 'E2', titulo: 'Tributário e Societário', itens: [
        'Revisão do regime tributário',
        'Contrato social e acordo de sócios',
        'Entrada e saída de sócios'
      ] },
      { area: 'E1', titulo: 'Patrimonial', itens: [
        'Holding patrimonial do profissional',
        'Planejamento sucessório',
        'Separação entre atividade e patrimônio'
      ] },
      { area: 'E6', titulo: 'Trabalhista e Contencioso', itens: [
        'Equipe e contratos da clínica',
        'Ações contra negativas de operadoras de saúde'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Tutela de urgência contra negativa de cobertura',
      texto_publico: 'Ação de obrigação de fazer com pedido de tutela de urgência contra operadora de plano de saúde que negou procedimento cirúrgico indicado pelo médico assistente.',
      cliente_interno: 'Caso Erenita Gatti x Bradesco Saúde', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'Para profissionais de alta renda, a escolha entre atuar como pessoa física, sociedade simples ou sociedade empresária, e o regime tributário correspondente, tem impacto direto e recorrente no resultado.',
      numeros: [],
      fonte: ''
    },
    faq: [
      { p: 'Médico deve atuar como pessoa jurídica?', r: 'Depende do volume e da forma de recebimento, dos contratantes e dos custos da atividade. Em muitos casos a pessoa jurídica reduz a carga tributária, mas a escolha precisa de simulação.' },
      { p: 'Qual o melhor regime tributário para uma clínica?', r: 'Não há regime melhor em abstrato. Faturamento, folha, despesas e atividades exercidas definem qual opção é mais eficiente, e essa resposta muda à medida que a clínica cresce.' },
      { p: 'Vale a pena ter holding sendo profissional liberal?', r: 'Quando há patrimônio relevante, sobretudo imobiliário, a holding pode organizar a administração e a sucessão. Para patrimônios menores, instrumentos mais simples podem ser suficientes.' },
      { p: 'O que fazer quando o plano de saúde nega um procedimento?', r: 'Reunir a indicação médica, a negativa por escrito e o contrato. Havendo urgência, é possível pedir tutela judicial para que o procedimento seja autorizado rapidamente.' }
    ],
    video_texto: 'Quando a sociedade criada no início deixa de servir ao tamanho da atividade.'
  },

  // ---------------------------------------------------------------- 8
  // A partir de `dores[1]` o conteúdo foi redigido pela equipe (o prompt
  // chegou truncado neste ponto). PENDENTE DE REVISÃO DO CEO.
  {
    numero: 8,
    slug: 'educacao-terceiro-setor',
    perfil: 'outro', // perfil do /api/contato mais próximo do segmento
    nome: 'Educação e Terceiro Setor',
    curto: 'Educação e Terceiro Setor',
    card_titulo: 'Educação e Terceiro Setor',
    card_descricao: 'Auditoria independente, prestação de contas, imunidade e regularização para instituições de ensino e OSCs.',
    areas: ['E2', 'E3', 'E4', 'E6'],
    seo_description: 'Auditoria independente, prestação de contas, imunidade tributária e regularização imobiliária para instituições de ensino, fundações e OSCs. Complexo DMC.',
    hero_subtitulo: 'Auditoria independente, prestação de contas, imunidade tributária e regularização imobiliária para instituições de ensino, fundações e organizações da sociedade civil.',
    hero_pos: '60% 50%',
    revisao_pendente: true,
    dores: [
      'Exigência de auditoria por lei, estatuto, financiador ou órgão de supervisão',
      'Imunidade e isenções que dependem de requisitos formais e contábeis mantidos ano a ano',
      'Imóveis da instituição sem matrícula regular ou com destinação não averbada'
    ],
    bloco1: {
      rotulo: 'Prestação de contas',
      titulo: 'Contas que resistem ao exame de quem financia e de quem fiscaliza',
      paragrafos: [
        'Instituições de ensino, fundações e organizações da sociedade civil prestam contas a muitos interlocutores ao mesmo tempo: mantenedores, conselhos, Ministério Público, órgãos de supervisão, financiadores públicos e privados. Cada um exige um formato e um nível de evidência diferentes.',
        'O Complexo DMC conduz a auditoria independente das demonstrações, revisa controles internos e organiza a prestação de contas de termos de fomento, colaboração e convênios, com relatórios que servem à governança da instituição e ao exame externo.'
      ]
    },
    bloco2: {
      rotulo: 'Imunidade e patrimônio',
      titulo: 'Requisitos formais em dia para que o benefício se sustente',
      paragrafos: [
        'A imunidade das instituições de educação e assistência social sem fins lucrativos e as isenções do terceiro setor dependem de requisitos contínuos: escrituração regular, aplicação integral dos recursos no país, não distribuição de resultados e certificações renovadas no prazo.',
        'A DMC acompanha esses requisitos ao longo do ano, responde a questionamentos fiscais e cuida do patrimônio imobiliário da instituição, da regularização das matrículas à averbação da destinação, para que obras, permutas e alienações não fiquem travadas no registro.'
      ]
    },
    publicos_titulo: 'Para quem atuamos',
    publicos: [
      'Instituições privadas de ensino básico, técnico e superior',
      'Fundações e institutos de origem familiar ou empresarial',
      'Organizações da sociedade civil com parcerias públicas (Lei 13.019/2014)',
      'Entidades beneficentes certificadas ou em certificação (CEBAS)',
      'Associações profissionais, entidades de classe e sindicatos patronais',
      'Mantenedoras com patrimônio imobiliário relevante'
    ],
    gatilhos: [
      'Exigência de auditoria independente por financiador, conselho, estatuto ou lei',
      'Renovação de certificação ou questionamento da imunidade pelo fisco',
      'Prestação de contas de termo de fomento, colaboração ou convênio',
      'Regularização de imóveis antes de obra, permuta ou alienação'
    ],
    atuacao: [
      { area: 'E4', titulo: 'Auditoria e Prestação de Contas', itens: [
        'Auditoria independente das demonstrações contábeis',
        'Revisão de controles internos e de processos de compras',
        'Prestação de contas de parcerias públicas e doações',
        'Contabilidade por projeto e por fonte de recurso',
        'Relatórios para conselhos e mantenedores'
      ] },
      { area: 'E2', titulo: 'Imunidade e Tributário', itens: [
        'Acompanhamento dos requisitos da imunidade e das isenções',
        'Certificações e renovações (CEBAS e congêneres)',
        'Respostas a intimações e defesas administrativas',
        'Estrutura societária de mantenedoras'
      ] },
      { area: 'E3', titulo: 'Patrimônio Imobiliário Institucional', itens: [
        'Regularização de matrículas de campi e sedes',
        'Averbação de construções e destinação',
        'Doações, permutas e comodatos de imóveis',
        'Due diligence para aquisição ou alienação'
      ] },
      { area: 'E6', titulo: 'Trabalhista', itens: [
        'Contratos de docentes, técnicos e voluntários',
        'Conformidade NR-1 e jornada',
        'Prevenção de passivo em reestruturações'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Auditoria independente de instituição de ensino',
      texto_publico: 'Auditoria independente das demonstrações contábeis de instituição de ensino superior, com revisão de controles internos, conciliação por fonte de recurso e relatório para a mantenedora e para os órgãos de supervisão.',
      cliente_interno: 'A definir pelo comercial', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'O terceiro setor e a educação privada operam sob regimes de benefício fiscal que exigem prova contínua de conformidade. A auditoria independente e a prestação de contas estruturada deixaram de ser exigência pontual e passaram a ser condição de acesso a recursos.',
      numeros: [
        { valor: '879 mil', rotulo: 'organizações da sociedade civil no país' },
        { valor: '87%', rotulo: 'das instituições de ensino superior são privadas' }
      ],
      fonte: 'IPEA — Mapa das Organizações da Sociedade Civil (2022); INEP — Censo da Educação Superior 2023.'
    },
    faq: [
      { p: 'Toda organização sem fins lucrativos precisa de auditoria independente?', r: 'Não por regra geral. A exigência vem do estatuto, de leis específicas, de certificações, de editais de financiamento ou de decisão do próprio conselho. Mesmo sem obrigação formal, a auditoria costuma ser requisito prático para captar recursos relevantes.' },
      { p: 'Imunidade e isenção são a mesma coisa?', r: 'Não. A imunidade decorre da Constituição e alcança instituições de educação e assistência social sem fins lucrativos que cumpram os requisitos legais; as isenções são concedidas por lei de cada ente e podem ter condições próprias. As duas dependem de requisitos mantidos de forma contínua.' },
      { p: 'O que acontece se a prestação de contas de uma parceria pública for rejeitada?', r: 'A organização pode ser chamada a devolver recursos, ficar impedida de celebrar novas parcerias e ter dirigentes responsabilizados. Por isso a contabilidade por projeto e a guarda da evidência precisam ser organizadas desde o início da execução.' },
      { p: 'A instituição pode vender ou permutar um imóvel recebido em doação?', r: 'Em geral, sim, observados o estatuto, eventuais encargos da doação e, no caso de fundações, a aprovação do Ministério Público. A operação depende de matrícula regular e da análise prévia da destinação averbada.' }
    ],
    video_texto: 'Prestação de contas que atende ao conselho, ao financiador e ao fisco com a mesma base documental.'
  },

  // ---------------------------------------------------------------- 9
  // Conteúdo inteiro redigido pela equipe (ausente do prompt recebido).
  // PENDENTE DE REVISÃO DO CEO.
  {
    numero: 9,
    slug: 'credito-garantias-instituicoes-financeiras',
    perfil: 'investidor', // perfil do /api/contato mais próximo do segmento
    nome: 'Crédito, Garantias e Instituições Financeiras',
    curto: 'Crédito e Instituições Financeiras',
    card_titulo: 'Crédito e Instituições Financeiras',
    card_descricao: 'Recuperação de crédito, execução de garantias e due diligence de ativos para bancos, fundos e credores privados.',
    areas: ['E5', 'E3', 'E2', 'E4'],
    seo_description: 'Recuperação de crédito, execução de garantias reais, due diligence de matrículas e rastreio patrimonial para bancos, fundos, securitizadoras e credores. Complexo DMC.',
    hero_subtitulo: 'Recuperação de crédito, execução de garantias reais e due diligence de ativos para bancos, fundos de investimento, securitizadoras e credores privados.',
    hero_pos: '62% 50%',
    revisao_pendente: true,
    dores: [
      'Carteiras inadimplidas com garantias que nunca foram executadas',
      'Garantias imobiliárias com registro irregular ou cadeia dominial duvidosa',
      'Devedores com patrimônio pulverizado e difícil de localizar'
    ],
    bloco1: {
      rotulo: 'Da garantia ao ativo',
      titulo: 'Garantia só vale quando pode ser executada',
      paragrafos: [
        'Uma parcela relevante das carteiras de crédito está lastreada em garantias que, no momento da inadimplência, revelam problemas: matrícula com ônus anteriores, construção não averbada, área divergente, alienação fiduciária registrada de forma incompleta. O valor que constava no balanço não corresponde ao que se consegue converter.',
        'O Complexo DMC faz a due diligence registral das garantias, classifica cada matrícula por risco, regulariza o que pode ser regularizado e conduz a execução pela via extrajudicial sempre que a lei permite, com acompanhamento notarial e registral em cada comarca.'
      ]
    },
    bloco2: {
      rotulo: 'Rastreio e recuperação',
      titulo: 'Localizar, constringir e converter',
      paragrafos: [
        'Quando a garantia é insuficiente ou inexistente, a recuperação depende de localizar patrimônio: participações societárias, imóveis em nome de terceiros, recebíveis e bens móveis de valor. Esse trabalho exige método investigativo, bases de dados integradas e tempo de resposta curto.',
        'A DMC combina rastreio patrimonial, medidas de constrição e negociação estruturada, e cuida da etapa seguinte, frequentemente negligenciada: a alienação dos ativos recebidos em pagamento, com sua regularização, avaliação e tributação dimensionadas.'
      ]
    },
    publicos_titulo: 'Para quem atuamos',
    publicos: [
      'Bancos, financeiras e cooperativas de crédito',
      'Fundos de investimento em direitos creditórios e fundos de crédito',
      'Securitizadoras e gestoras de carteiras de crédito',
      'Credores privados em operações estruturadas e mútuos com garantia',
      'Adquirentes de carteiras e de ativos em execução',
      'Empresas com carteira de recebíveis e inadimplência relevante'
    ],
    gatilhos: [
      'Inadimplência em operação com garantia real ou fiduciária',
      'Aquisição de carteira que exige due diligence das garantias',
      'Devedor com indícios de esvaziamento ou ocultação patrimonial',
      'Necessidade de alienar ativos recebidos em pagamento ou arrematados'
    ],
    atuacao: [
      { area: 'E5', titulo: 'Recuperação de Crédito', itens: [
        'Rastreio patrimonial e mapa de bens do devedor',
        'Execução de garantias e medidas de constrição',
        'Leilão extrajudicial de bens',
        'Negociação estruturada e acordos de pagamento',
        'Desconsideração e responsabilização de terceiros'
      ] },
      { area: 'E3', titulo: 'Garantias Imobiliárias', itens: [
        'Due diligence de matrículas e classificação de risco',
        'Consolidação da propriedade fiduciária e leilões',
        'Regularização registral antes da execução',
        'Registro de garantias e averbações'
      ] },
      { area: 'E2', titulo: 'Tributário', itens: [
        'Tributação na alienação de ativos recebidos em pagamento',
        'Estrutura de SPEs e veículos para ativos',
        'Ganho de capital e ITBI em arrematações'
      ] },
      { area: 'E4', titulo: 'Avaliação e Auditoria', itens: [
        'Avaliação de carteiras e de garantias',
        'Laudos de ativos para provisão e venda',
        'Auditoria de procedimentos de cobrança'
      ] }
    ],
    case: {
      rotulo: 'Destaque de atuação',
      titulo: 'Due diligence de carteira com garantia imobiliária',
      texto_publico: 'Análise registral das garantias imobiliárias de carteira de crédito adquirida por fundo, com classificação de risco por matrícula, plano de regularização das pendências e preparação da execução extrajudicial.',
      cliente_interno: 'A definir pelo comercial', // NÃO RENDERIZAR
      autorizado: false
    },
    mercado: {
      texto: 'O Marco Legal das Garantias (Lei 14.711/2023) ampliou a execução extrajudicial de garantias, permitiu a alienação fiduciária sucessiva do mesmo imóvel e criou o serviço de gestão especializada de garantias. A conversão de garantia em recuperação passou a depender, mais do que antes, da qualidade do registro.',
      numeros: [
        { valor: '2023', rotulo: 'Marco Legal das Garantias (Lei 14.711)' }
      ],
      fonte: 'Lei 14.711/2023; Lei 9.514/1997.'
    },
    faq: [
      { p: 'Toda garantia imobiliária pode ser executada sem processo judicial?', r: 'Não. A via extrajudicial alcança, em especial, a alienação fiduciária e, após a Lei 14.711/2023, a hipoteca em hipóteses definidas. Garantias com registro irregular ou defeitos no título costumam exigir regularização prévia ou a via judicial.' },
      { p: 'O que é a due diligence de uma carteira de crédito?', r: 'É a verificação, matrícula por matrícula e contrato por contrato, de que a garantia existe, está registrada em nome do devedor certo, não tem ônus anteriores que a esvaziem e pode ser executada. O resultado é uma classificação de risco que orienta preço, provisão e estratégia.' },
      { p: 'Como localizar patrimônio de um devedor que diz não ter bens?', r: 'Com cruzamento de bases registrais, societárias e de recebíveis, análise de operações recentes com parentes e empresas ligadas e, quando há indícios, medidas judiciais de quebra de sigilo e desconsideração. O trabalho segue os limites legais e é documentado para sustentar as medidas.' },
      { p: 'A DMC também cuida da venda do imóvel recebido em pagamento?', r: 'Sim. A regularização da matrícula, a avaliação, a definição do veículo adequado e a tributação da alienação fazem parte do mesmo fluxo, para que o ativo recebido se converta em caixa.' }
    ],
    video_texto: 'Da matrícula da garantia ao ativo convertido: o fluxo de recuperação de crédito.'
  }
];
