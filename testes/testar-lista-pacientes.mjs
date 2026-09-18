/**
 * A lista de pacientes: busca, filtros, ordenacao, selecao e o menu de acoes.
 *
 * O cartao era nome + idade + tres selos. Agora ele carrega o que decide o que
 * fazer com a pessoa — ha quanto tempo ela nao aparece, como falar com ela, e
 * qual e o proximo passo —, e a lista ganhou as ferramentas para trabalhar uma
 * carteira inteira em vez de uma ficha por vez.
 *
 * O que este teste cobra:
 *
 *   busca      nome, e-mail E telefone (antes era so nome e queixa)
 *   filtros    as contagens batem com a situacao real de cada pessoa
 *   silencio   "ha 3 meses" sai do ultimo HOLOSCOPE; sem nenhum, do cadastro
 *   status     ativo/inativo e decisao de quem atende, e sobrevive a recarga
 *   lote       marcar varios de uma vez faz a mesma coisa que um a um
 *   Revisao    quem respondeu alguma coisa e ainda nao virou mapa
 *   migracao   quem foi cadastrado com o campo "contato" antigo nao se perde
 *
 * Quem classifica e Panorama.situacao(), a mesma leitura da ficha e do
 * dashboard: se esta tela discordar delas sobre uma pessoa, a regra foi
 * escrita duas vezes.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1300 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
let falhou = false;
const conferir = (c, t) => { if (!c) falhou = true; ok(c, t); };

/* ------------------------------------------------- carteira zerada ------- */

const vazia = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  const v = document.querySelector('.lista-vazia');
  return {
    titulo: v?.querySelector('strong')?.textContent,
    texto: v?.querySelector('span')?.textContent,
    // Rodada de consistencia: o CTA duplicado (cabecalho + dentro do card
    // vazio) foi para so um — o mesmo padrao que Consultas/HOLOSCOPE/
    // HOLOSCAN na ficha ja usavam.
    semBotaoDuplicado: !v?.querySelector('button'),
    total: document.getElementById('pac-total-cabeca').textContent.trim(),
    buscaEscondida: document.querySelector('.acoes-topo').classList.contains('hidden'),
    chipsEscondidos: document.getElementById('pac-chips').classList.contains('hidden'),
  };
});
conferir(vazia.titulo === 'Nenhum paciente cadastrado ainda', 'título do estado vazio: ' + vazia.titulo);
conferir(vazia.texto === 'Cadastre o primeiro paciente para iniciar a jornada clínica.',
  'texto do estado vazio: ' + vazia.texto);
conferir(vazia.semBotaoDuplicado, 'sem CTA duplicado — o botão do cabeçalho já é o convite');
conferir(vazia.total === '0 pacientes', 'contador no cabeçalho: ' + vazia.total);
conferir(vazia.buscaEscondida && vazia.chipsEscondidos,
  'busca e filtros somem sem carteira — sem tabela vazia sem contexto');

const abriuPeloCabecalho = await p.evaluate(async () => {
  document.getElementById('btn-abrir-novo').click();
  await new Promise(r => setTimeout(r, 120));
  const aberto = !document.getElementById('painel-novo').classList.contains('hidden');
  document.getElementById('btn-cancelar-paciente').click();
  return aberto;
});
conferir(abriuPeloCabecalho, 'e o botão do cabeçalho abre o formulário de cadastro normalmente');

/* ---------------------------------------------- montar uma carteira ------ */

const ids = await p.evaluate(async (respostas) => {
  const novo = async (nome, tel, mail, sexo) => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    const v = document.getElementById('voltar-lista'); if (v) v.click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = nome;
    document.getElementById('np-telefone').value = tel || '';
    document.getElementById('np-email').value = mail || '';
    document.getElementById('np-sexo').value = sexo || '';
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(x => setTimeout(x, 300));
    return window.pacienteAtivoId();
  };
  const sentido = {}; HOLOSCOPE.questionario().forEach(q => sentido[q.id] = q.sentido);
  const variar = n => respostas.map(x => ({ marcador_id: x.marcador_id,
    intensidade: sentido[x.marcador_id] === 'invertido'
      ? Math.min(3, Math.max(0, x.intensidade + n))
      : Math.max(0, Math.min(3, x.intensidade - n)) }));
  const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const datar = (pid, i, q) => {
    const h = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
    h[pid][i].quando = q;
    localStorage.setItem('holohacking.pontuacao', JSON.stringify(h));
  };
  // o cadastro tambem precisa envelhecer, senao todo mundo e "novo"
  const recuar = (pid, n) => {
    const t = JSON.parse(localStorage.getItem('holohacking.dados.pacientes'));
    const alvo = t.find(x => x.id === pid);
    const d = new Date(); d.setDate(d.getDate() + n);
    alvo.created_at = d.toISOString();
    localStorage.setItem('holohacking.dados.pacientes', JSON.stringify(t));
  };

  // atendida ha 96 dias: passou dos 90
  const ana = await novo('Ana Paula Azevedo', '+55 11 99999-1234', 'ana.azevedo@email.com', 'F');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  datar(ana, 0, dias(-96));
  recuar(ana, -190);

  // cadastrada ha 142 dias e nunca atendida: silencio conta do cadastro
  const carol = await novo('Carolina C. Soares', '+55 21 98888-4321', 'carolina@email.com', 'F');
  recuar(carol, -142);

  // respondeu metade do questionario e nao gerou mapa: e a aba Revisao
  const caio = await novo('Caio Werneck', '+55 31 97777-0000', 'caio.w@email.com', 'M');
  recuar(caio, -160);
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  [...document.querySelectorAll('.q-item')].slice(0, 22)
    .forEach(i => i.querySelectorAll('.q-btn')[2].click());

  // atendida ha 6 dias e cadastrada ha 20: e a unica "nova"
  const helena = await novo('Helena Rocha', '+55 47 96666-1111', 'helena.rocha@email.com', 'F');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(variar(2)));
  datar(helena, 0, dias(-6));
  recuar(helena, -20);

  return { ana, carol, caio, helena };
}, caso.respostas);

/* O cadastro foi envelhecido direto no localStorage, e a lista em memoria nao
   sabe disso — entao recarrega, que e tambem como a nutricionista veria. */
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await p.evaluate(() => document.querySelector('.nav-item[data-secao="pacientes"]').click());

/* ------------------------------------------------------- o cartao -------- */

const cartao = await p.evaluate(() => {
  const um = nome => [...document.querySelectorAll('#lista-pacientes .card-paciente')]
    .find(c => c.querySelector('h4').textContent === nome);
  const ler = c => ({
    meta: [...c.querySelectorAll('.pac-dado')].map(d => d.textContent.trim()),
    atraso: !!c.querySelector('.pac-dado.atraso'),
    status: c.querySelector('.pac-status').textContent,
    sexo: c.querySelector('.pac-sexo') ? c.querySelector('.pac-sexo').getAttribute('aria-label') : null,
    passo: c.querySelector('.pac-acao-principal').textContent.trim(),
  });
  return { ana: ler(um('Ana Paula Azevedo')), carol: ler(um('Carolina C. Soares')),
           helena: ler(um('Helena Rocha')) };
});

conferir(/Último contato há 3 meses/.test(cartao.ana.meta[0]),
  'o silêncio vem em meses, não em dias: ' + cartao.ana.meta[0]);
conferir(cartao.ana.atraso, 'e acende quando passa de 90 dias');
conferir(/Sem consulta ainda/.test(cartao.carol.meta[0]),
  'quem nunca foi atendida não ganha uma data inventada: ' + cartao.carol.meta[0]);
conferir(cartao.carol.atraso,
  'mas cadastrada há 142 dias e nunca vista também acende');
conferir(/Último contato há 6 dias/.test(cartao.helena.meta[0]),
  'abaixo de um mês o dia ainda importa: ' + cartao.helena.meta[0]);
conferir(!cartao.helena.atraso, 'e quem foi vista semana passada não acende');
conferir(cartao.ana.meta.some(m => /Cadastrado \d\d\/\d\d\/\d{4}/.test(m)),
  'mostra a data de cadastro');
conferir(cartao.ana.meta.some(m => /\+55 11 99999-1234/.test(m)) &&
         cartao.ana.meta.some(m => /ana\.azevedo@email\.com/.test(m)),
  'mostra telefone e e-mail, cada um no seu campo');
conferir(cartao.ana.sexo === 'Feminino', 'o sexo aparece quando informado');
conferir(cartao.ana.status === 'Ativo', 'nasce ativo');
conferir(cartao.carol.passo === 'Aplicar agora',
  'quem não tem mapa: ' + cartao.carol.passo);
conferir(cartao.helena.passo === 'Ver por onde começar',
  'quem tem mapa e nenhuma conduta: ' + cartao.helena.passo);

/* -------------------------------------------------------- a busca -------- */

const busca = await p.evaluate(async () => {
  const campo = document.getElementById('busca-pacientes');
  const procurar = async t => {
    campo.value = t;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    return [...document.querySelectorAll('#lista-pacientes h4')].map(h => h.textContent);
  };
  const porEmail = await procurar('carolina@email.com');
  const porTelefone = await procurar('97777');
  const porNome = await procurar('rocha');
  const semNada = await procurar('zzzz');
  const vazio = document.querySelector('.lista-vazia').textContent;
  await procurar('');
  return { porEmail, porTelefone, porNome, semNada, vazio };
});

conferir(busca.porEmail.length === 1 && busca.porEmail[0] === 'Carolina C. Soares',
  'busca por e-mail: ' + busca.porEmail.join(', '));
conferir(busca.porTelefone.length === 1 && busca.porTelefone[0] === 'Caio Werneck',
  'busca por telefone: ' + busca.porTelefone.join(', '));
conferir(busca.porNome.length === 1 && busca.porNome[0] === 'Helena Rocha',
  'busca por nome continua valendo: ' + busca.porNome.join(', '));
conferir(busca.semNada.length === 0 && /e-mail ou telefone/.test(busca.vazio),
  'sem resultado, a tela diz o que foi procurado');

/* ------------------------------------------------------- os filtros ------ */

const chips = await p.evaluate(() => {
  const mapa = {};
  document.querySelectorAll('.pac-chip').forEach(c => {
    mapa[c.dataset.filtro] = Number(c.querySelector('.pac-chip-n').textContent);
  });
  return mapa;
});

conferir(chips.todos === 4, 'Todos conta a carteira: ' + chips.todos);
conferir(chips.ativos === 4, 'Ativos, enquanto ninguém foi marcado: ' + chips.ativos);
conferir(chips.novos === 1, 'Novos (30d) só a Helena: ' + chips.novos);
conferir(chips.silencio === 3, 'Sem contato (90d+) três: ' + chips.silencio);
conferir(chips.vazias === 1, 'Ficha vazia só a Carolina: ' + chips.vazias);

const filtrado = await p.evaluate(async () => {
  document.querySelector('[data-filtro="silencio"]').click();
  await new Promise(r => setTimeout(r, 120));
  return [...document.querySelectorAll('#lista-pacientes h4')].map(h => h.textContent);
});
conferir(filtrado.length === 3 && !filtrado.includes('Helena Rocha'),
  'clicar no chip filtra de verdade: ' + filtrado.join(', '));

/* ----------------------------------------------------- a ordenacao ------- */

const ordem = await p.evaluate(async () => {
  document.querySelector('[data-filtro="todos"]').click();
  const sel = document.getElementById('ordem-pacientes');
  const usar = async v => {
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    return [...document.querySelectorAll('#lista-pacientes h4')].map(h => h.textContent);
  };
  return { nome: await usar('nome'), contato: await usar('contato'),
           cadastro: await usar('cadastro') };
});

conferir(ordem.nome[0] === 'Ana Paula Azevedo' && ordem.nome[3] === 'Helena Rocha',
  'por nome: ' + ordem.nome.join(' · '));
conferir(ordem.contato[0] === 'Caio Werneck' && ordem.contato[3] === 'Helena Rocha',
  'por último contato, o mais calado primeiro: ' + ordem.contato.join(' · '));
conferir(ordem.cadastro[0] === 'Helena Rocha',
  'por cadastro, a mais recente primeiro: ' + ordem.cadastro[0]);

/* -------------------------------------------------------- a Revisao ------ */

const revisao = await p.evaluate(async () => {
  const tag = document.getElementById('aba-revisao-n');
  document.querySelector('[data-aba-pac="revisao"]').click();
  await new Promise(r => setTimeout(r, 120));
  return {
    tag: tag.textContent,
    tagVisivel: !tag.classList.contains('hidden'),
    nomes: [...document.querySelectorAll('#painel-pac-revisao h4')].map(h => h.textContent),
    oque: document.querySelector('#painel-pac-revisao .pac-dado')?.textContent || '',
    botao: document.querySelector('#painel-pac-revisao .pac-acao-principal')?.textContent || '',
    listaEscondida: document.getElementById('painel-pac-lista').classList.contains('hidden'),
  };
});

conferir(revisao.nomes.length === 1 && revisao.nomes[0] === 'Caio Werneck',
  'Revisão pega quem respondeu e não virou mapa: ' + revisao.nomes.join(', '));
conferir(/22 de 84 respostas/.test(revisao.oque),
  'e diz o que já existe: ' + revisao.oque);
conferir(revisao.tag === '1' && revisao.tagVisivel, 'a aba marca quantos são');
conferir(revisao.listaEscondida, 'e a lista sai da frente');
conferir(/Gerar HOLOSCOPE/.test(revisao.botao), 'o botão é o passo que falta');

/* ------------------------------------------------- status e lote --------- */

const inativo = await p.evaluate(async (id) => {
  document.querySelector('[data-aba-pac="lista"]').click();
  document.querySelector('[data-menu="' + id + '"]').click();
  const item = document.querySelector('#menu-' + id + ' [data-item="status"]');
  const rotulo = item.textContent;
  item.click();
  await new Promise(r => setTimeout(r, 300));
  const card = [...document.querySelectorAll('#lista-pacientes .card-paciente')]
    .find(c => c.dataset.id === id);
  const chip = n => Number([...document.querySelectorAll('.pac-chip')]
    .find(c => c.dataset.filtro === n).querySelector('.pac-chip-n').textContent);
  return { rotulo, status: card.querySelector('.pac-status').textContent,
           classe: card.className, ativos: chip('ativos'), inativos: chip('inativos') };
}, ids.ana);

conferir(/Marcar como inativo/.test(inativo.rotulo), 'o menu oferece marcar inativo');
conferir(inativo.status === 'Inativo' && /inativo/.test(inativo.classe),
  'e o cartão passa a dizer isso: ' + inativo.status);
conferir(inativo.ativos === 3 && inativo.inativos === 1,
  'as contagens acompanham: ' + inativo.ativos + ' ativos, ' + inativo.inativos + ' inativo');

// e sobrevive a recarregar: status e dado guardado, nao estado de tela
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const depois = await p.evaluate((id) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  const card = [...document.querySelectorAll('#lista-pacientes .card-paciente')]
    .find(c => c.dataset.id === id);
  return card.querySelector('.pac-status').textContent;
}, ids.ana);
conferir(depois === 'Inativo', 'o status sobrevive a recarregar a página');

// selecao em lote
const lote = await p.evaluate(async () => {
  document.getElementById('btn-selecionar-todos').click();
  await new Promise(r => setTimeout(r, 200));
  const conta = document.querySelector('.pac-sel-conta').textContent;
  const rotulo = document.getElementById('rotulo-selecionar').textContent;
  const acao = document.querySelector('[data-lote="inativar"]');
  const temAcao = !!acao;
  if (acao) acao.click();
  await new Promise(r => setTimeout(r, 500));
  return {
    conta, rotulo, temAcao,
    inativos: [...document.querySelectorAll('#lista-pacientes .pac-status')]
      .filter(s => s.textContent === 'Inativo').length,
    limpou: document.getElementById('pac-sel-acoes').classList.contains('hidden'),
  };
});

conferir(/4 selecionados/.test(lote.conta), 'selecionar todos pega os 4: ' + lote.conta);
conferir(/Limpar seleção/.test(lote.rotulo), 'e o botão vira o contrário dele mesmo');
conferir(lote.temAcao && lote.inativos === 4,
  'marcar em lote vale para todos: ' + lote.inativos + ' inativos');
conferir(lote.limpou, 'e a seleção se desfaz depois de agir');

/* ------------------------------------------- o cadastro antigo ----------- */

const migrado = await p.evaluate(async () => {
  // como era antes: um campo so, sem telefone nem e-mail separados
  const tabela = JSON.parse(localStorage.getItem('holohacking.dados.pacientes'));
  tabela.push({ id: 'antigo-1', nome: 'Registro Antigo',
                contato: 'antigo@email.com', created_at: new Date().toISOString() });
  tabela.push({ id: 'antigo-2', nome: 'Outro Antigo',
                contato: '+55 11 91234-5678', created_at: new Date().toISOString() });
  localStorage.setItem('holohacking.dados.pacientes', JSON.stringify(tabela));
  return true;
});
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const velhos = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  const campo = document.getElementById('busca-pacientes');
  const procurar = async t => {
    campo.value = t;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    return [...document.querySelectorAll('#lista-pacientes h4')].map(h => h.textContent);
  };
  const achouEmail = await procurar('antigo@email.com');
  const achouTel = await procurar('91234');
  await procurar('');
  const card = [...document.querySelectorAll('#lista-pacientes .card-paciente')]
    .find(c => c.querySelector('h4').textContent === 'Registro Antigo');
  return { achouEmail, achouTel, status: card.querySelector('.pac-status').textContent,
           meta: [...card.querySelectorAll('.pac-dado')].map(d => d.textContent.trim()) };
});

conferir(velhos.achouEmail.length === 1 && velhos.achouEmail[0] === 'Registro Antigo',
  'o "contato" antigo com arroba virou e-mail e é encontrado');
conferir(velhos.achouTel.length === 1 && velhos.achouTel[0] === 'Outro Antigo',
  'e o sem arroba virou telefone');
conferir(velhos.status === 'Ativo', 'quem foi cadastrado sem status nasce ativo na leitura');
conferir(velhos.meta.some(m => /antigo@email\.com/.test(m)),
  'e o dado aparece no cartão: ' + velhos.meta.join(' | '));

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
