// =============================================================
// Páginas da F6a para o portal-qualidade (D-74): Seus atendimentos,
// Ouvidoria e Regulamento acadêmico (páginas próprias) e as telas de
// backoffice que a F6a registra em professor.html (hospedeira da F8,
// P1f): fila de atendimento, ouvidoria e configurações da coordenação.
// ctx: { protocolo, ouvidoria } semeados pelo caso (opcionais).
// =============================================================
export const PAGINAS = [
  { pagina: 'atendimentos.html', fatia: 'F6a', papel: 'aluno', url: (ctx = {}) => (ctx.protocolo ? `atendimentos.html?protocolo=${encodeURIComponent(ctx.protocolo)}` : 'atendimentos.html') },
  { pagina: 'ouvidoria.html', fatia: 'F6a', papel: 'aluno', url: (ctx = {}) => (ctx.ouvidoria ? `ouvidoria.html?protocolo=${encodeURIComponent(ctx.ouvidoria)}` : 'ouvidoria.html') },
  { pagina: 'regulamento.html', fatia: 'F6a', papel: 'aluno', url: () => 'regulamento.html' },
  { pagina: 'professor.html', fatia: 'F6a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/atendimento' },
  { pagina: 'professor.html', fatia: 'F6a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/ouvidoria' },
  { pagina: 'professor.html', fatia: 'F6a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/configuracoes/regulamento' },
  { pagina: 'professor.html', fatia: 'F6a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/configuracoes/privacidade' },
  { pagina: 'professor.html', fatia: 'F6a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/configuracoes/instituicao' }
];
