// =============================================================
// Páginas da F5 para o portal-qualidade (D-74): o Financeiro do aluno
// (página própria) e as telas de backoffice que a F5 registra em
// professor.html (hospedeira da F8, P1f): a lista da coordenação.
// =============================================================
export const PAGINAS = [
  { pagina: 'financeiro.html', fatia: 'F5', papel: 'aluno', url: () => 'financeiro.html' },
  { pagina: 'professor.html', fatia: 'F5', hospedeira: true, papel: 'admin', url: () => 'professor.html#/financeiro' }
];
