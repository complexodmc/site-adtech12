/* ============================================================
   COMPLEXO DMC — Soluções de cada eixo (nível 3 da rede de #conheca)

   Fonte única de nomes e destinos para assets/js/rede-neural.js
   (rede da home e lista do celular). Nada aqui é inventado:
   - E1, E3 e E6: o catálogo "Todas as soluções por eixo" de
     index.html (#features), com os nomes já aprovados pelo CEO
     (ex.: "Separação Patrimonial", "Arquitetura Contratual").
     Ciclo Fechado (E6) é a página do próprio eixo, por isso não
     entra como solução.
   - E2, E4 e E5 têm uma ou duas páginas próprias. Os demais itens
     são os serviços listados em "O que entregamos" da página do
     eixo, com destino na própria seção (#beneficios).
   Hrefs relativos à raiz do site (a home é a raiz).
   Para incluir uma solução: só com página ou seção existente.
   ============================================================ */

export const SERVICOS = [
  {
    n: 1,
    nome: 'Planejamento Patrimonial e Sucessório',
    servicos: [
      { nome: 'Planejamento Sucessório', href: 'pages/planejamento-sucessorio.html' },
      { nome: 'Holding Patrimonial', href: 'pages/holding-patrimonial.html' },
      { nome: 'Separação Patrimonial', href: 'pages/blindagem-patrimonial.html' },
      { nome: 'Proteção Patrimonial', href: 'pages/pronto-patrimonio.html' },
      { nome: 'Sucessão Testamentária', href: 'pages/sucessao-testamentaria.html' }
    ]
  },
  {
    n: 2,
    nome: 'Tributário, Fiscal e Corporativo',
    servicos: [
      { nome: 'Planejamento Tributário', href: 'pages/planejamento-tributario.html' },
      { nome: 'Revisão de Regime', href: 'pages/planejamento-tributario.html#beneficios' },
      { nome: 'Recuperação de Créditos', href: 'pages/planejamento-tributario.html#beneficios' },
      { nome: 'Reestruturação Societária', href: 'pages/planejamento-tributario.html#beneficios' },
      { nome: 'Compliance e Governança', href: 'pages/compliance-governanca.html' }
    ]
  },
  {
    n: 3,
    nome: 'Direito Notarial e Imobiliário',
    servicos: [
      { nome: 'Consultoria Imobiliária', href: 'pages/consultoria-imobiliaria.html' },
      { nome: 'Jurídico Imobiliário', href: 'pages/juridico-imobiliario.html' },
      { nome: 'Jurídico Vendas', href: 'pages/juridico-vendas.html' },
      { nome: 'Registro Imobiliário', href: 'pages/registro-imobiliario.html' },
      { nome: 'Atos Notariais', href: 'pages/atos-notariais.html' }
    ]
  },
  {
    n: 4,
    nome: 'Auditoria Empresarial e Contábil',
    servicos: [
      { nome: 'Auditoria de Demonstrações', href: 'pages/contabilidade.html#beneficios' },
      { nome: 'Revisão da Escrituração', href: 'pages/contabilidade.html#beneficios' },
      { nome: 'Controles Internos', href: 'pages/contabilidade.html#beneficios' },
      { nome: 'Folha e eSocial', href: 'pages/contabilidade.html#beneficios' }
    ]
  },
  {
    n: 5,
    nome: 'Recuperação de Ativos',
    servicos: [
      { nome: 'Diligência Patrimonial', href: 'pages/recuperacao-ativos.html#beneficios' },
      { nome: 'Estratégia de Constrição', href: 'pages/recuperacao-ativos.html#beneficios' },
      { nome: 'Cumprimento de Sentença', href: 'pages/recuperacao-ativos.html#beneficios' },
      { nome: 'Títulos Extrajudiciais', href: 'pages/recuperacao-ativos.html#beneficios' }
    ]
  },
  {
    n: 6,
    nome: 'Consultoria Trabalhista',
    servicos: [
      { nome: 'Arquitetura Contratual', href: 'solucoes/consultoria-trabalhista/blindagem-contratual.html' },
      { nome: 'Conformidade Psicossocial', href: 'solucoes/consultoria-trabalhista/conformidade-psicossocial.html' },
      { nome: 'Decisão Assistida', href: 'solucoes/consultoria-trabalhista/decisao-assistida.html' },
      { nome: 'Câmara de Acordos', href: 'solucoes/consultoria-trabalhista/camara-de-acordos.html' },
      { nome: 'Quitação Anual', href: 'solucoes/consultoria-trabalhista/quitacao-anual.html' },
      { nome: 'Gestão do Contencioso Trabalhista', href: 'solucoes/consultoria-trabalhista/defesa-empresarial.html' }
    ]
  }
];
