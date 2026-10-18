// =============================================================
// Páginas da F3b para o portal-qualidade (D-74): as quatro páginas
// próprias (certificados, certificado, validar, declaracao) já estão em
// PAGINAS_BASE; aqui entram as telas de backoffice da F3b, hospedadas em
// professor.html (F8, P1f), abertas pela coordenação (papel admin).
// =============================================================
export const PAGINAS = [
  { pagina: 'professor.html', fatia: 'F3b', hospedeira: true, papel: 'admin', url: () => 'professor.html#/configuracoes/cursos' },
  { pagina: 'professor.html', fatia: 'F3b', hospedeira: true, papel: 'admin', url: () => 'professor.html#/documentos/declaracoes' }
];
