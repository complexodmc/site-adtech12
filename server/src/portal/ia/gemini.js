// =============================================================
// COMPLEXO DMC · Portal — Assistente de IA: cliente do Google Gemini
// PORTAL-API §6.10.3 (chamada) e §6.10.4 (testar) · dono: F6b.
//
// - Chamada SÓ pelo servidor: POST {base}/v1beta/models/{modelo}:generateContent
//   com o cabeçalho x-goog-api-key (NUNCA ?key= na URL). A base vem do
//   config-portal (PORTAL_GEMINI_URL só com a regra QA_SERVIDOR).
// - Prazo TOTAL por conversa (PORTAL_IA_TIMEOUT_MS) com AbortController.
// - Até 3 rodadas de ferramenta (até 4 chamadas cada), reenviando o
//   `content` do modelo INTACTO (inclusive thoughtSignature) + os
//   functionResponse; esgotadas → a próxima chamada vai com mode NONE.
// - Corpo ≤ 200 KB (corta histórico antigo); histórico = últimas 20.
// - A chave nunca aparece em erro, log ou retorno deste módulo.
// =============================================================

export const LIMITE_CORPO_BYTES = 200 * 1024;
export const MAX_RODADAS = 3;
export const MAX_CHAMADAS_POR_RODADA = 4;
export const MAX_HISTORICO = 20;
export const MODELO_RE = /^[a-z0-9][a-z0-9.-]{1,62}$/;

const CATEGORIAS_SEGURANCA = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'];
const MOTIVOS_BLOQUEIO = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

export const TEXTO_BLOQUEADA = 'Não posso responder a essa mensagem. Reformule a pergunta ou fale com a equipe.';
export const TEXTO_SEM_RESPOSTA = 'Não consegui montar uma resposta agora. Tente reformular a pergunta ou fale com a equipe.';

/** Erro do provedor já traduzido para o catálogo do portal (status + codigo). Sem a chave. */
export class ErroGemini extends Error {
  constructor(status, codigo, detalhe = '') {
    super(`Gemini: ${codigo}${detalhe ? ` (${detalhe})` : ''}`);
    this.name = 'ErroGemini';
    this.status = status;
    this.codigo = codigo;
  }
}

export const ehFlash = modelo => /flash/i.test(String(modelo || ''));

/** Monta o corpo do generateContent (exportado para os testes conferirem a forma). */
export function montarCorpo({ sistema, contents, declaracoes, modo = 'AUTO', modelo }) {
  const flash = ehFlash(modelo);
  return {
    systemInstruction: { parts: [{ text: String(sistema || '') }] },
    contents,
    tools: [{ functionDeclarations: declaracoes }],
    toolConfig: { functionCallingConfig: { mode: modo } },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: flash ? 1024 : 2048,
      ...(flash ? { thinkingConfig: { thinkingBudget: 0 } } : {})
    },
    safetySettings: CATEGORIAS_SEGURANCA.map(category => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' }))
  };
}

const tamanho = obj => Buffer.byteLength(JSON.stringify(obj), 'utf8');

/** Códigos do teste de conexão a partir da resposta do Google (API §6.10.4). */
export function codigoDoTeste(status, corpo) {
  const motivo = JSON.stringify(corpo?.error?.details || '') + ' ' + String(corpo?.error?.status || '') + ' ' + String(corpo?.error?.message || '');
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(motivo)) return 'chave-invalida';
  if (status === 401) return 'chave-invalida';
  if (status === 403) return 'sem-permissao';
  if (status === 404) return 'modelo-nao-encontrado';
  if (status === 429) return 'limite-provedor';
  if (status === 400) return 'chave-invalida';
  return 'falha-rede';
}

/**
 * @param {{ fetchImpl?: Function, baseUrl: string, timeoutMs?: number, agora?: () => number }} deps
 */
export function criarClienteGemini({ fetchImpl = globalThis.fetch, baseUrl, timeoutMs = 20000, agora = Date.now } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('criarClienteGemini: informe fetchImpl.');
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) throw new TypeError('criarClienteGemini: informe baseUrl.');
  const base = baseUrl.replace(/\/+$/, '');
  const urlModelo = modelo => `${base}/v1beta/models/${encodeURIComponent(modelo)}`;

  async function pedir(url, { metodo = 'GET', chave, corpo = null, prazoMs }) {
    const ctrl = new AbortController();
    const espera = Math.max(1, Math.floor(prazoMs));
    const timer = setTimeout(() => ctrl.abort(), espera);
    timer.unref?.();
    try {
      const r = await fetchImpl(url, {
        method: metodo,
        headers: { 'x-goog-api-key': chave, ...(corpo ? { 'content-type': 'application/json' } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: ctrl.signal,
        redirect: 'error'
      });
      let json = null;
      try { json = await r.json(); } catch { json = null; }
      return { status: r.status, json };
    } catch (err) {
      if (ctrl.signal.aborted || err?.name === 'AbortError' || err?.name === 'TimeoutError') return { status: 0, json: null, tempoEsgotado: true };
      return { status: 0, json: null, falhaRede: true };
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET {base}/v1beta/models/{modelo} — teste de conexão (não gasta tokens). */
  async function testar({ chave, modelo, prazoMs = Math.min(timeoutMs, 15000) }) {
    if (!MODELO_RE.test(String(modelo || ''))) return { ok: false, codigo: 'modelo-nao-encontrado' };
    const t0 = agora();
    const r = await pedir(urlModelo(modelo), { chave, prazoMs });
    const latenciaMs = Math.max(0, agora() - t0);
    if (r.tempoEsgotado) return { ok: false, codigo: 'tempo-esgotado', latenciaMs };
    if (r.falhaRede) return { ok: false, codigo: 'falha-rede', latenciaMs };
    if (r.status !== 200) return { ok: false, codigo: codigoDoTeste(r.status, r.json), latenciaMs };
    const metodos = Array.isArray(r.json?.supportedGenerationMethods) ? r.json.supportedGenerationMethods : [];
    if (!metodos.includes('generateContent')) return { ok: false, codigo: 'modelo-sem-generatecontent', latenciaMs };
    return {
      ok: true, modelo,
      nomeExibicao: typeof r.json?.displayName === 'string' ? r.json.displayName : modelo,
      limiteTokensEntrada: Number.isFinite(r.json?.inputTokenLimit) ? r.json.inputTokenLimit : null,
      latenciaMs
    };
  }

  /**
   * Conversa com ferramentas.
   * @param {{ chave, modelo, sistema, historico:[{papel:'aluno'|'assistente', texto}], mensagem,
   *           declaracoes, executar:(nome, args) => Promise<{ ok, resposta }> }} p
   * → { texto, chamadas:[{ nome, ok, resultado }], bloqueada, uso:{ entrada, saida }, rodadas, corpos? }
   * Lança ErroGemini(503 'ia-tempo-esgotado' | 429 'ia-sobrecarregada' | 503 'ia-indisponivel').
   */
  async function conversar({ chave, modelo, sistema, historico = [], mensagem, declaracoes, executar, prazoMs = timeoutMs }) {
    const fim = agora() + prazoMs;
    let antigos = historico.slice(-MAX_HISTORICO).map(m => ({ role: m.papel === 'aluno' ? 'user' : 'model', parts: [{ text: String(m.texto ?? '') }] }));
    const atual = [{ role: 'user', parts: [{ text: String(mensagem) }] }];
    const uso = { entrada: 0, saida: 0 };
    const chamadas = [];
    let rodadas = 0;
    let modo = 'AUTO';

    for (let volta = 0; volta <= MAX_RODADAS; volta++) {
      let corpo = montarCorpo({ sistema, contents: [...antigos, ...atual], declaracoes, modo, modelo });
      while (tamanho(corpo) > LIMITE_CORPO_BYTES && antigos.length) {
        antigos = antigos.slice(1);
        corpo = montarCorpo({ sistema, contents: [...antigos, ...atual], declaracoes, modo, modelo });
      }
      if (tamanho(corpo) > LIMITE_CORPO_BYTES) throw new ErroGemini(503, 'ia-indisponivel', 'corpo grande demais');

      const resta = fim - agora();
      if (resta <= 0) throw new ErroGemini(503, 'ia-tempo-esgotado');
      const r = await pedir(`${urlModelo(modelo)}:generateContent`, { metodo: 'POST', chave, corpo, prazoMs: resta });
      if (r.tempoEsgotado) throw new ErroGemini(503, 'ia-tempo-esgotado');
      if (r.falhaRede) throw new ErroGemini(503, 'ia-indisponivel', 'falha de rede');
      if (r.status === 429) throw new ErroGemini(429, 'ia-sobrecarregada');
      if (r.status !== 200 || !r.json) throw new ErroGemini(503, 'ia-indisponivel', `status ${r.status}`);

      const u = r.json.usageMetadata || {};
      uso.entrada += Number(u.promptTokenCount) || 0;
      uso.saida += Number(u.candidatesTokenCount) || 0;

      if (r.json.promptFeedback?.blockReason) return { texto: TEXTO_BLOQUEADA, chamadas, bloqueada: true, uso, rodadas };
      const cand = Array.isArray(r.json.candidates) ? r.json.candidates[0] : null;
      if (!cand) return { texto: TEXTO_SEM_RESPOSTA, chamadas, bloqueada: false, uso, rodadas };
      if (MOTIVOS_BLOQUEIO.has(cand.finishReason)) return { texto: TEXTO_BLOQUEADA, chamadas, bloqueada: true, uso, rodadas };

      const conteudo = cand.content && Array.isArray(cand.content.parts) ? cand.content : { role: 'model', parts: [] };
      const pedidas = conteudo.parts.filter(p => p && p.functionCall && typeof p.functionCall.name === 'string');
      if (pedidas.length && modo === 'AUTO') {
        rodadas++;
        const respostas = [];
        for (let i = 0; i < pedidas.length; i++) {
          const { name, args } = pedidas[i].functionCall;
          if (i >= MAX_CHAMADAS_POR_RODADA) {
            respostas.push({ functionResponse: { name, response: { erro: 'limite_de_chamadas' } } });
            continue;
          }
          const resultado = await executar(name, args || {});
          chamadas.push({ nome: name, ok: !!resultado.ok, resultado });
          respostas.push({ functionResponse: { name, response: resultado.resposta } });
        }
        // O `content` do modelo volta INTACTO (thoughtSignature incluída).
        atual.push({ role: conteudo.role || 'model', parts: conteudo.parts });
        atual.push({ role: 'user', parts: respostas });
        if (rodadas >= MAX_RODADAS) modo = 'NONE';
        continue;
      }
      const texto = conteudo.parts.filter(p => typeof p?.text === 'string' && p.thought !== true).map(p => p.text).join('').trim();
      return { texto: texto || TEXTO_SEM_RESPOSTA, chamadas, bloqueada: false, uso, rodadas };
    }
    return { texto: TEXTO_SEM_RESPOSTA, chamadas, bloqueada: false, uso, rodadas };
  }

  return Object.freeze({ testar, conversar });
}
