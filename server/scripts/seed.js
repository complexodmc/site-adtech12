// =============================================================
// COMPLEXO DMC · Seed do catálogo no MongoDB
// Equivalente ao antigo database/seed.sql.
//
// Fonte dos dados: plataforma-ead/js/data.js (window.PLATAFORMA_DATA),
// avaliado num contexto isolado — assim não existe cópia duplicada
// do conteúdo dos cursos no repositório.
//
//   npm run seed            → upsert idempotente (não apaga nada)
//   npm run seed -- --reset → apaga cursos/módulos/aulas antes
// =============================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { connect, close, col } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_JS = path.resolve(__dirname, '..', '..', 'complexodmc.com.br', 'plataforma-ead', 'js', 'data.js');

async function carregarSeed() {
  const code = await fs.readFile(DATA_JS, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: DATA_JS });
  const data = sandbox.window.PLATAFORMA_DATA;
  if (!data || !Array.isArray(data.cursos)) {
    throw new Error(`Não encontrei window.PLATAFORMA_DATA em ${DATA_JS}`);
  }
  return data.cursos;
}

const reset = process.argv.includes('--reset');

await connect();

try {
  const cursos = await carregarSeed();

  if (reset) {
    const [c, m, a] = await Promise.all([
      col.cursos().deleteMany({}),
      col.modulos().deleteMany({}),
      col.aulas().deleteMany({})
    ]);
    console.log(`[seed] --reset: removidos ${c.deletedCount} cursos, ${m.deletedCount} módulos, ${a.deletedCount} aulas.`);
  }

  const now = new Date();
  const opCursos = [];
  const opModulos = [];
  const opAulas = [];

  cursos.forEach((curso, ci) => {
    opCursos.push({
      updateOne: {
        filter: { _id: curso.id },
        update: {
          $set: {
            titulo: curso.titulo || '',
            subtitulo: curso.subtitulo || '',
            descricao: curso.descricao || '',
            cargaHoraria: curso.cargaHoraria || '',
            modalidade: curso.modalidade || 'Online',
            iconeKey: curso.iconeKey || 'graduation',
            preco: Number(curso.preco) || 0,
            linkCheckout: curso.linkCheckout || '',
            beneficios: Array.isArray(curso.beneficios) ? curso.beneficios : [],
            ordem: ci + 1,
            isAtivo: curso.isAtivo !== false,
            updatedAt: now
          },
          $setOnInsert: { createdAt: now }
        },
        upsert: true
      }
    });

    (curso.modulos || []).forEach((modulo, mi) => {
      opModulos.push({
        updateOne: {
          filter: { _id: modulo.id },
          update: {
            $set: {
              cursoId: curso.id,
              numero: modulo.numero || String(mi + 1).padStart(2, '0'),
              titulo: modulo.titulo || '',
              resumo: modulo.resumo || '',
              duracao: modulo.duracao || '',
              ordem: mi + 1,
              updatedAt: now
            },
            $setOnInsert: { createdAt: now }
          },
          upsert: true
        }
      });

      (modulo.aulas || []).forEach((aula, ai) => {
        opAulas.push({
          updateOne: {
            filter: { _id: aula.id },
            update: {
              $set: {
                moduloId: modulo.id,
                titulo: aula.titulo || '',
                duracao: aula.duracao || '',
                videoUrl: aula.videoUrl || '',
                ordem: ai + 1,
                updatedAt: now
              },
              $setOnInsert: { createdAt: now }
            },
            upsert: true
          }
        });
      });
    });
  });

  // Ordem importa: curso antes de módulo, módulo antes de aula.
  if (opCursos.length) await col.cursos().bulkWrite(opCursos);
  if (opModulos.length) await col.modulos().bulkWrite(opModulos);
  if (opAulas.length) await col.aulas().bulkWrite(opAulas);

  console.log(`[seed] ${opCursos.length} cursos, ${opModulos.length} módulos e ${opAulas.length} aulas gravados.`);
  console.log('[seed] concluído.');
} finally {
  await close();
}
