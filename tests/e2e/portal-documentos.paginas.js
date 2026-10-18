// =============================================================
// Páginas da F4b para o portal-qualidade (D-74): documentos.html e
// contratos.html já estão em PAGINAS_BASE; contrato.html exige um id,
// então entra aqui com `preparar` (semeia um contrato disponível para o
// aluno do caso) e substitui a entrada da base. As telas de backoffice da
// F4b vivem em professor.html (F8, P1f), abertas pela coordenação.
// Sem as rotas da F4b/F4a montadas, `preparar` devolve {} e a página
// mostra o estado honesto "Contrato não encontrado." (nada inventado).
// =============================================================
import * as P from './_portal.js';

async function contratoDoAluno(ctx) {
  const request = ctx.request;
  try {
    const admin = await P.criarUsuario(request, { papel: 'admin' });
    const A = P.api(request, admin.token);
    const cursoId = ctx.cursoId;
    if (!ctx.email || !cursoId) return {};
    const m = await A.post('/api/portal/admin/matriculas', { email: ctx.email, cursoId, liberarAcesso: false, confirmarSemVerificacao: true, motivo: 'Matrícula semeada pelo portal-qualidade (QA).' });
    const matriculaId = m.status === 201 ? m.json.matricula.id : (m.json && m.json.matriculaId) || null;
    if (!matriculaId) return {};
    const c = await A.post('/api/portal/admin/contratos', { matriculaId, titulo: 'Contrato de prestação de serviços educacionais (QA)', confirmarSemVerificacao: true, motivo: 'Contrato semeado pelo portal-qualidade (QA).' });
    const contratoId = c.status === 201 ? c.json.id : (c.json && c.json.contratoId) || null;
    if (!contratoId) return {};
    await request.fetch(`/api/portal/admin/contratos/${contratoId}/arquivo`, {
      method: 'POST', headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/pdf', 'x-qa-cliente': P.ipNovo() }, data: P.PDF_MINIMO, failOnStatusCode: false
    });
    return { contratoId };
  } catch (_e) {
    return {};
  }
}

export const PAGINAS = [
  { pagina: 'contrato.html', fatia: 'F4b', papel: 'aluno', preparar: contratoDoAluno, url: (ctx) => `contrato.html?id=${(ctx && ctx.contratoId) || '000000000000000000000000'}` },
  { pagina: 'professor.html', fatia: 'F4b', hospedeira: true, papel: 'admin', url: () => 'professor.html#/documentos' },
  { pagina: 'professor.html', fatia: 'F4b', hospedeira: true, papel: 'admin', url: () => 'professor.html#/documentos/tipos' },
  { pagina: 'professor.html', fatia: 'F4b', hospedeira: true, papel: 'admin', url: () => 'professor.html#/contratos' }
];
