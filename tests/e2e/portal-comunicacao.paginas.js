// =============================================================
// Páginas da F7 para o portal-qualidade (D-74): Publicações e o detalhe
// (páginas próprias; sem `id` o detalhe mostra o vazio honesto, sem
// requisição) e as telas de backoffice que a F7 registra em
// professor.html (hospedeira da F8, P1f): publicações, editor, banners,
// relatórios e auditoria.
// =============================================================
export const PAGINAS = [
  { pagina: 'publicacoes.html', fatia: 'F7', papel: 'aluno', url: () => 'publicacoes.html' },
  { pagina: 'publicacao.html', fatia: 'F7', papel: 'aluno', url: () => 'publicacao.html' },
  { pagina: 'professor.html', fatia: 'F7', hospedeira: true, papel: 'admin', url: () => 'professor.html#/publicacoes' },
  { pagina: 'professor.html', fatia: 'F7', hospedeira: true, papel: 'admin', url: () => 'professor.html#/publicacoes/nova' },
  { pagina: 'professor.html', fatia: 'F7', hospedeira: true, papel: 'admin', url: () => 'professor.html#/banners' },
  { pagina: 'professor.html', fatia: 'F7', hospedeira: true, papel: 'admin', url: () => 'professor.html#/relatorios' },
  { pagina: 'professor.html', fatia: 'F7', hospedeira: true, papel: 'admin', url: () => 'professor.html#/auditoria' }
];
