/**
 * CLI do motor HOLOS. Roda direto no Node 24, sem instalar nada:
 *
 *   node src/cli.ts validar
 *   node src/cli.ts questionario
 *   node src/cli.ts pontuar casos/exemplo-01.json
 *   node src/cli.ts escopo "pode tomar 500mg de vitamina D?"
 *   node src/cli.ts determinismo casos/exemplo-01.json
 */

import { readFileSync } from 'node:fs';
import { carregarBancos, montarQuestionario } from './bancos-node.ts';
import { pontuar } from './motor.ts';
import { validar } from './validar.ts';
import { verificarEscopo } from './escopo.ts';
import type { Pontuacao, Resposta } from './tipos.ts';

const DIM = '\x1b[2m';
const NEG = '\x1b[1m';
const OFF = '\x1b[0m';

function barra(valor: number, maximo = 10, largura = 24): string {
  const cheio = Math.round((valor / maximo) * largura);
  return '#'.repeat(Math.max(0, cheio)) + DIM + '.'.repeat(Math.max(0, largura - cheio)) + OFF;
}

function titulo(texto: string): void {
  console.log('\n' + NEG + texto + OFF);
  console.log(DIM + '-'.repeat(texto.length) + OFF);
}

function lerCaso(caminho: string): { respostas: Resposta[]; pseudonimo?: string } {
  const dados = JSON.parse(readFileSync(caminho, 'utf8'));
  if (!Array.isArray(dados.respostas)) {
    throw new Error(caminho + ': esperava um campo "respostas" com uma lista.');
  }
  return { respostas: dados.respostas, pseudonimo: dados.paciente_pseudonimo };
}

function imprimirPontuacao(p: Pontuacao, pseudonimo?: string): void {
  titulo('INDICE HOLOS');
  console.log(
    '  ' + NEG + String(p.indice).padStart(4) + OFF + ' / ' + p.indice_maximo +
    '   ' + DIM + '(' + p.indice_maximo + ' = muito bom)' + OFF
  );
  console.log('  ' + barra(p.indice, p.indice_maximo));
  if (pseudonimo) console.log(DIM + '  paciente ' + pseudonimo + OFF);
  console.log(
    DIM + '  cobertura: ' + p.cobertura.respondidos + '/' + p.cobertura.total +
    ' marcadores (' + p.cobertura.percentual + '%)' + OFF
  );

  titulo('NOTA POR SISTEMA  (10 = muito bom)');
  const ordenados = [...p.sistemas].sort((a, b) => a.nota - b.nota);
  for (const s of ordenados) {
    console.log(
      '  ' + s.nota.toFixed(1).padStart(4) + '  ' + barra(s.nota) + '  ' +
      s.nome.padEnd(36) + DIM + s.faixa + OFF
    );
  }

  titulo('TRIADA HOLOS  (10 = muito bom)');
  for (const [eixo, valor] of Object.entries(p.triada)) {
    console.log('  ' + valor.toFixed(1).padStart(4) + '  ' + barra(valor) + '  ' + eixo);
  }

  if (p.frequencias.length > 0) {
    titulo('MAPA DE FREQUENCIAS  (10 = fluindo)');
    for (const f of p.frequencias) {
      console.log(
        '  ' + f.nota.toFixed(1).padStart(4) + '  ' + barra(f.nota) + '  ' +
        f.chacra.padEnd(16) + DIM + f.leitura + OFF
      );
    }
  }

  titulo('COMBINACOES DISPARADAS');
  if (p.combinacoes.length === 0) {
    console.log(DIM + '  nenhuma' + OFF);
  } else {
    for (const c of p.combinacoes) {
      console.log('  [' + c.id + '] ' + NEG + c.leitura + OFF);
      console.log(DIM + '        ' + c.condicao + '   fonte: ' + c.fonte + OFF);
    }
  }

  titulo('O QUE MAIS PESOU (por sistema)');
  for (const s of ordenados) {
    if (s.dominantes.length === 0) continue;
    console.log('  ' + s.nome);
    for (const d of s.dominantes.slice(0, 3)) {
      console.log(
        DIM + '    ' + String(d.pontos).padStart(5) + ' pts  ' + d.marcador_id + '  ' +
        d.rotulo + '  (peso ' + d.peso + ' x intensidade ' + d.intensidade + ')' + OFF
      );
    }
  }
}

// ---------------------------------------------------------------------------

const [, , comando, ...args] = process.argv;

try {
  const bancos = carregarBancos();

  switch (comando) {
    case 'validar': {
      const achados = validar(bancos);
      const erros = achados.filter((a) => a.nivel === 'erro');
      const avisos = achados.filter((a) => a.nivel === 'aviso');

      titulo('VALIDACAO DOS BANCOS');
      if (achados.length === 0) console.log('  tudo certo.');
      for (const a of erros) console.log('  ERRO   ' + a.onde + ': ' + a.mensagem);
      for (const a of avisos) console.log(DIM + '  aviso  ' + a.onde + ': ' + a.mensagem + OFF);
      console.log(
        '\n  ' + erros.length + ' erro(s), ' + avisos.length + ' aviso(s).'
      );
      process.exit(erros.length > 0 ? 1 : 0);
      break;
    }

    case 'questionario': {
      const perguntas = montarQuestionario(bancos);
      titulo('QUESTIONARIO — ' + perguntas.length + ' perguntas');
      console.log(
        DIM + '  escala: 0 nunca / 1 as vezes / 2 frequente / 3 sempre\n' + OFF
      );
      let origemAtual = '';
      for (const q of perguntas) {
        if (q.origem !== origemAtual) {
          origemAtual = q.origem;
          console.log('\n  ' + NEG + origemAtual.toUpperCase() + OFF);
        }
        console.log('    ' + q.id + '  ' + q.pergunta);
      }
      break;
    }

    case 'pontuar': {
      const caminho = args[0];
      if (!caminho) throw new Error('uso: node src/cli.ts pontuar <caso.json>');
      const caso = lerCaso(caminho);
      imprimirPontuacao(pontuar(bancos, caso.respostas), caso.pseudonimo);
      break;
    }

    case 'determinismo': {
      const caminho = args[0] ?? 'casos/exemplo-01.json';
      const caso = lerCaso(caminho);
      const primeira = JSON.stringify(pontuar(bancos, caso.respostas));
      let iguais = 0;
      for (let i = 0; i < 500; i++) {
        // ordem das respostas embaralhada de forma estavel, sem Math.random
        const embaralhada = caso.respostas
          .map((r, j) => ({ r, k: (j * 31 + i * 17) % caso.respostas.length }))
          .sort((a, b) => a.k - b.k)
          .map((x) => x.r);
        if (JSON.stringify(pontuar(bancos, embaralhada)) === primeira) iguais++;
      }
      titulo('TESTE DE DETERMINISMO');
      console.log('  500 execucoes, ordem de entrada variada.');
      console.log('  saidas identicas: ' + iguais + '/500');
      process.exit(iguais === 500 ? 0 : 1);
      break;
    }

    case 'escopo': {
      const texto = args.join(' ');
      if (!texto) throw new Error('uso: node src/cli.ts escopo "<texto>"');
      const r = verificarEscopo(bancos, texto);
      titulo('VERIFICACAO DE ESCOPO');
      console.log('  texto: ' + texto);
      console.log('  permitido: ' + (r.permitido ? 'sim' : 'NAO'));
      for (const b of r.bloqueios) {
        console.log('  BLOQUEIO ' + b.id + ' (' + b.motivo + ') em "' + b.trecho + '"');
        console.log(DIM + '    responde: ' + b.resposta + OFF);
      }
      for (const a of r.avisos) {
        console.log(DIM + '  aviso ' + a.id + ' (' + a.motivo + ') em "' + a.trecho + '"' + OFF);
      }
      break;
    }

    case 'indexar': {
      const { indexar } = await import('./corpus/indexar.ts');
      const r = indexar();
      titulo('INDEXACAO DO CORPUS');
      for (const f of r.fontes) {
        if (f.ausente) {
          console.log('  AUSENTE  ' + f.arquivo + DIM + '  (listado em fontes.csv, nao existe no disco)' + OFF);
        } else {
          console.log('  ' + String(f.trechos).padStart(4) + ' trechos  ' + f.fonte);
        }
      }
      console.log(
        '\n  ' + NEG + r.indice.trechos.length + ' trechos' + OFF +
        ', ' + Object.keys(r.indice.frequencia_documental).length + ' termos distintos' +
        DIM + '  (media de ' + Math.round(r.indice.media_tamanho) + ' tokens por trecho)' + OFF
      );
      break;
    }

    case 'buscar': {
      const pergunta = args.join(' ');
      if (!pergunta) throw new Error('uso: node src/cli.ts buscar "<pergunta>"');
      const { buscarNoMetodo } = await import('./corpus/buscar.ts');
      const r = buscarNoMetodo(pergunta, { limite: 5 });

      titulo('BUSCA NO METODO');
      console.log(DIM + '  ' + pergunta + OFF);
      if (r.aviso) {
        console.log('\n  ' + r.aviso);
        break;
      }
      for (const a of r.trechos) {
        console.log('\n  ' + NEG + a.fonte + OFF + DIM + '  [' + a.autoridade + '] ' + a.pontuacao + OFF);
        console.log(DIM + '  casou: ' + a.casou.join(', ') + OFF);
        const resumo = a.texto.length > 300 ? a.texto.slice(0, 300) + '...' : a.texto;
        console.log('  ' + resumo.split('\n').join('\n  '));
      }
      break;
    }

    case 'avaliar': {
      const { buscarNoMetodo } = await import('./corpus/buscar.ts');
      const { lerCSV } = await import('./csv.ts');
      const perguntas = lerCSV(
        readFileSync('bancos/perguntas.csv', 'utf8'),
        'bancos/perguntas.csv'
      );

      titulo('AVALIACAO DO QUE A IA SABE');
      console.log(DIM + '  ' + perguntas.length + ' perguntas. Roda offline, sem credencial.' + OFF);
      console.log('');

      let acertos = 0;
      const falhas: string[] = [];

      for (const q of perguntas) {
        const r = buscarNoMetodo(q.pergunta);
        const achou = r.trechos.length > 0;
        const esperava = q.espera === 'acha';
        const ok = achou === esperava;
        if (ok) acertos++;
        else falhas.push(q.pergunta + '   (esperava: ' + q.espera + ')');

        const onde = achou
          ? r.trechos[0].fonte.replace(/^[^·]*· /, '').replace(/ · linha \d+$/, '')
          : 'nada encontrado';
        console.log(
          '  ' + (ok ? 'ok   ' : 'FALHA') + '  ' +
          q.pergunta.slice(0, 50).padEnd(51) + DIM + onde.slice(0, 45) + OFF
        );
      }

      console.log('\n  ' + NEG + acertos + '/' + perguntas.length + OFF + ' como esperado.');
      if (falhas.length > 0) {
        console.log('\n  O que falhou:');
        for (const f of falhas) console.log('    ' + f);
      }
      process.exit(falhas.length > 0 ? 1 : 0);
      break;
    }

    case 'conversar': {
      const tipo = args[0] === 'conteudo' ? 'conteudo' : 'suporte_clinico';
      const pergunta = args.slice(1).join(' ');
      if (!pergunta) {
        throw new Error('uso: node src/cli.ts conversar <clinico|conteudo> "<pergunta>"');
      }

      const { conversar, explicarErro, MODELO } = await import('./agente/cliente.ts');
      titulo('AGENTE - ' + tipo + '  (' + MODELO + ')');
      console.log(DIM + '  ' + pergunta + OFF);

      try {
        const r = await conversar(bancos, pergunta, {
          agente: tipo,
          aoChamarFerramenta: (c) =>
            console.log(DIM + '  -> ' + c.nome + '(' + JSON.stringify(c.entrada) + ')' + OFF),
        });

        console.log('\n' + r.texto + '\n');
        if (r.bloqueado) console.log(NEG + '  [guardrail bloqueou a resposta original]' + OFF);
        for (const a of r.achados) console.log(DIM + '  aviso ' + a.id + ': ' + a.motivo + OFF);
        console.log(
          DIM + '  ' + r.iteracoes + ' iteracao(oes) - ' + r.ferramentas.length +
          ' chamada(s) de ferramenta - ' + r.uso.entrada + ' tokens de entrada, ' +
          r.uso.saida + ' de saida' +
          (r.uso.cache_lido > 0 ? ' - ' + r.uso.cache_lido + ' lidos do cache' : '') + OFF
        );
      } catch (e) {
        console.error('\n  ' + explicarErro(e) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'relatorio': {
      const caminho = args[0];
      if (!caminho) throw new Error('uso: node src/cli.ts relatorio <caso.json>');
      const caso = lerCaso(caminho);
      const p = pontuar(bancos, caso.respostas);

      const { redigirRelatorio } = await import('./agente/redator.ts');
      const { explicarErro } = await import('./agente/cliente.ts');

      try {
        const r = await redigirRelatorio(bancos, p);
        const rel = r.relatorio;

        titulo(rel.titulo);

        console.log('\n' + NEG + '  PARA A NUTRICIONISTA' + OFF);
        console.log('  ' + rel.o_que_esta_acontecendo.split('\n').join('\n  '));

        console.log('\n' + NEG + '  PARA O PACIENTE' + OFF);
        console.log('  ' + rel.espelho_do_paciente.split('\n').join('\n  '));

        console.log('\n' + NEG + '  SISTEMAS PRIORITARIOS' + OFF);
        for (const s of rel.sistemas_prioritarios) {
          console.log('  - ' + s.sistema + ': ' + s.porque);
        }

        console.log('\n' + NEG + '  PRIMEIROS PASSOS' + OFF);
        for (const passo of rel.primeiros_passos) console.log('  - ' + passo);

        if (rel.conversar_na_consulta && rel.conversar_na_consulta.length > 0) {
          console.log('\n' + NEG + '  CONVERSAR NA CONSULTA' + OFF);
          for (const q of rel.conversar_na_consulta) console.log('  - ' + q);
        }

        titulo('TRAVAS');
        if (r.divergencias.length === 0) {
          console.log('  fidelidade numerica: OK - todo numero do texto existe na pontuacao');
        } else {
          console.log('  FIDELIDADE NUMERICA FALHOU - a saida seria bloqueada:');
          for (const d of r.divergencias) {
            console.log('    "' + d.numero + '" em ' + d.onde + ': ...' + d.trecho + '...');
          }
        }
        console.log(
          '  guardrail de escopo: ' + (r.bloqueado ? 'BLOQUEOU' : 'passou') +
          (r.achados.length > 0 ? ' (' + r.achados.length + ' aviso)' : '')
        );
        console.log(DIM + '  ' + r.uso.entrada + ' tokens de entrada, ' + r.uso.saida + ' de saida' + OFF);

        process.exit(r.divergencias.length > 0 ? 1 : 0);
      } catch (e) {
        console.error('\n  ' + explicarErro(e) + '\n');
        process.exit(1);
      }
      break;
    }

    default:
      console.log(
        [
          '',
          NEG + 'Motor HOLOS' + OFF,
          '',
          '  node src/cli.ts validar                      confere a integridade dos bancos',
          '  node src/cli.ts questionario                 lista as perguntas na ordem',
          '  node src/cli.ts pontuar <caso.json>          calcula o Indice HOLOS',
          '  node src/cli.ts determinismo [caso.json]     prova que a saida nao varia',
          '  node src/cli.ts escopo "<texto>"             testa o guardrail',
          '  node src/cli.ts indexar                      reindexa o corpus do metodo',
          '  node src/cli.ts buscar "<pergunta>"          busca no metodo indexado',
          '',
          DIM + '  precisam de credencial da API:' + OFF,
          '  node src/cli.ts conversar clinico "<pergunta>"  fala com o agente',
          '  node src/cli.ts relatorio <caso.json>           gera o relatorio (L2)',
          '',
        ].join('\n')
      );
  }
} catch (e) {
  console.error('\nERRO: ' + (e instanceof Error ? e.message : String(e)) + '\n');
  process.exit(1);
}
