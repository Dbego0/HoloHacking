
(function(){
  "use strict";

  /* De onde vem e para onde vai todo dado de paciente.
     Ver dados.js: hoje e o navegador, e a troca por Supabase e esta linha.

     Ate 13/09 aqui havia um cliente Supabase real, apontando para o projeto
     sywlqaxnceojkhfrprfy com a chave anonima escrita no arquivo. O app nao
     abria sem rede, cada rodada de teste cadastrava paciente num banco de
     verdade, e o projeto continuava de pe sem ninguem ter decidido isso. As
     linhas que ja estao la continuam la — nada foi apagado.

     Fase 1 do Supabase (projeto sllhyymeeyoozokgbnuv): a licao acima nao foi
     esquecida. Em vez de apontar `sb` inteiro para o Supabase de novo,
     dados-router.js decide TABELA POR TABELA — e so troca `pacientes` para
     `patients`, e so quando existe uma sessao Supabase real. Sem sessao (dev
     local, suite de testes), cai para o DadosLocais de sempre: continua
     funcionando sem rede, sem sujar banco nenhum. */
  const sb = window.DadosRouter;

  const estado = { pacientes: [], ativo: null, carregado: false };

  /* A pontuacao que esta na tela agora, quando ela veio do questionario.
     Null quando a nutricionista esta pontuando a mao — e a diferenca importa
     na hora de salvar: do questionario vem 6,7, da regua vem 7. */
  let pontuacaoNaTela = null;

  const vazioOQ3 = () => ({ data_consulta:"", quer:"", precisa:"", consegue:"", alavancas:"" });
  const vazioPQQ = () => ({ objetivo:"", r1:"", r2:"", r3:"", r4:"", r5:"", verdadeiro:"" });
  const vazioHolo = () => ({ sistema_fungico:0, sistema_acido_inflamatorio:0, sistema_metabolico:0, sistema_detox_linfatico:0, sistema_mental_emocional:0, score_holos:0 });

  function pacienteAtivo(){ return estado.pacientes.find(p => p.id === estado.ativo) || null; }
  /* O dia de HOJE, no fuso de quem está usando.

     toISOString() devolve UTC. No Brasil isso quer dizer que tudo o que fosse
     registrado depois das 21h ganhava a data de amanhã — e daí saem errados o
     "há quantos dias", o retorno de 28 semanas e a ordem da linha do tempo.
     Uma consulta das 21h30 aparecia como sendo do dia seguinte. */
  function hojeISO(){
    const d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  /* O nome do paciente vai para dentro de innerHTML. Ele e digitado por quem
     usa, e um nome com & ou < quebrava a lista calado — ou pior, entrava como
     marcacao. As outras telas ja escapavam; esta era a que faltava. */
  function escapar(s){
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function dataBR(iso){ return iso ? iso.split("-").reverse().join("/") : ""; }
  function idade(nasc){
    if(!nasc) return "";
    const d = new Date(nasc + "T00:00:00"), hoje = new Date();
    let a = hoje.getFullYear() - d.getFullYear();
    const m = hoje.getMonth() - d.getMonth();
    if(m < 0 || (m === 0 && hoje.getDate() < d.getDate())) a--;
    return (a >= 0 && a < 130) ? a + " anos" : "";
  }

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  let toastTimer;
  function toast(msg){
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("visivel");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("visivel"), 2600);
  }

  /* As telas de fora do app.js precisam avisar a pessoa, e "window.toast" NAO
     serve para isso: existe uma <div id="toast"> no HTML, e o navegador
     publica todo id como propriedade de window. window.toast e o elemento —
     sempre truthy, e chamar ele estoura. Por isso o nome aqui e outro. */
  window.avisar = toast;

  /* ---------- aparencia ----------

     Era um interruptor que seguia o sistema em toda carga: escolher o claro,
     recarregar, e o escuro voltava. A escolha nao era guardada em lugar
     nenhum. Agora sao tres estados — claro, escuro, seguir o sistema — e a
     preferencia fica neste navegador, que e onde ela pertence: e de quem
     olha a tela, nao da clinica, e nao acompanha a pessoa para outra maquina. */
  const CHAVE_TEMA = "holohacking.aparencia";
  const btnTema = $("#btn-tema");

  function sistemaEstaEscuro(){
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function aparenciaGuardada(){
    try { return localStorage.getItem(CHAVE_TEMA) || "sistema"; }
    catch(e){ return "sistema"; }
  }
  function aplicarAparencia(qual){
    const escuro = qual === "escuro" || (qual === "sistema" && sistemaEstaEscuro());
    document.body.classList.toggle("escuro", escuro);
    btnTema.setAttribute("aria-pressed", escuro ? "true" : "false");
  }

  window.aparenciaAtual = aparenciaGuardada;
  window.definirAparencia = (qual) => {
    // navegador anonimo recusa gravar: a escolha vale para esta sessao e pronto
    try { localStorage.setItem(CHAVE_TEMA, qual); } catch(e){ /* sem drama */ }
    aplicarAparencia(qual);
  };

  aplicarAparencia(aparenciaGuardada());

  // em "seguir o sistema", mexer no tema do SO muda o app sem recarregar
  if(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").addEventListener){
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if(aparenciaGuardada() === "sistema") aplicarAparencia("sistema");
    });
  }

  btnTema.addEventListener("click", () => {
    const escuro = !document.body.classList.contains("escuro");
    window.definirAparencia(escuro ? "escuro" : "claro");
    if(typeof window.redesenharPerfil === "function") window.redesenharPerfil();
    toast(escuro ? "Modo escuro ativado." : "Modo claro ativado.");
  });

  /* ---------- navegacao ---------- */
  const nomesSecao = {
    dashboard:"Dashboard", pacientes:"Pacientes", consultas:"Consultas",
    agenda:"Agenda", documentos:"Documentos",
    holoscope:"HOLOSCOPE", holoscan:"HOLOSCAN",
    corpo:"Módulo Corpo", mente:"Módulo Mente",
    espirito:"Módulo Espírito", perfil:"Perfil"
  };
  function irPara(secao){
    $$(".nav-item").forEach(b => b.classList.toggle("ativo", b.dataset.secao === secao));
    $$(".secao").forEach(s => s.classList.toggle("ativa", s.id === "secao-" + secao));
    $("#caminho-atual").textContent = nomesSecao[secao] || secao;
    fecharFerramentas();
    const ficha = document.getElementById("vista-ficha");
    if(ficha && secao !== "pacientes"){
      ficha.classList.add("hidden");
      document.getElementById("vista-lista-pacientes").classList.remove("hidden");
    }
    /* As telas derivadas se redesenham ao serem ABERTAS, e nao so quando o
       paciente muda. Sem isto, guardar um exame na ficha e ir para Documentos
       mostrava a lista de antes: a tela estava certa na ultima vez que foi
       desenhada, e essa vez tinha sido antes do arquivo existir. */
    const redesenhar = {
      dashboard: window.redesenharDashboard,
      consultas: window.redesenharConsultas,
      agenda: window.redesenharAgenda,
      documentos: window.redesenharDocumentos,
      /* O HOLOSCAN virou secao propria e precisa disto mais do que as outras:
         os exames sao lancados na ficha, noutra tela. Sem redesenhar ao abrir,
         lancar um exame e vir para ca mostrava o confronto de antes — e um
         confronto desatualizado e pior do que confronto nenhum. */
      holoscan: () => { if(window.desenharHoloscan) window.desenharHoloscan("holo-holoscan"); },
      /* Pacientes entrou aqui depois das outras, e era a que mais precisava:
         o cartao agora mostra "Último contato" e o proximo passo. Aplicar um
         HOLOSCOPE e voltar para a lista deixava o cartao dizendo "Sem consulta
         ainda" sobre alguem que tinha acabado de ser atendida. */
      pacientes: renderPacientes,
      perfil: window.redesenharPerfil
    }[secao];
    if(typeof redesenhar === "function") redesenhar();

    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function fecharFerramentas(){
    $$(".vista-ferramenta").forEach(v => v.classList.add("hidden"));
    $$(".galeria-ferramentas").forEach(g => g.classList.remove("hidden"));
    $$(".cabeca-modulo").forEach(c => c.classList.remove("hidden"));
    $$(".barra-busca").forEach(b => b.classList.remove("hidden"));
  }
  function abrirFerramenta(idVista){
    const vista = document.getElementById(idVista);
    if(!vista) return;
    const secao = vista.closest(".secao");
    const gal = secao.querySelector(".galeria-ferramentas");
    if(gal) gal.classList.add("hidden");
    const cab = secao.querySelector(".cabeca-modulo");
    if(cab) cab.classList.add("hidden");
    const barra = secao.querySelector(".barra-busca");
    if(barra) barra.classList.add("hidden");
    vista.classList.remove("hidden");
    carregarFormularios();
    // O OQ3 era a unica das dez ferramentas fora do historico versionado.
    // Abrir a vista abre a aplicacao de trabalho, como formulario.js faz.
    if(idVista === "vista-oq3") abrirAplicacaoOQ3();
    if(idVista === "vista-pqq") abrirAplicacaoPQQ();
    if(idVista === "vista-mapa") renderizarMapa();
    window.scrollTo({ top:0, behavior:"smooth" });
  }
  $$(".card-ferr[data-vista]").forEach(c => c.addEventListener("click", () => abrirFerramenta(c.dataset.vista)));

  // formulario.js precisa abrir a vista generica; e a unica coisa que ele
  // enxerga daqui de dentro.
  window.abrirFerramenta = abrirFerramenta;

  /* ---------- busca dentro dos modulos ---------- */
  function semAcento(t){
    return t.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  }
  function destacar(el, termo){
    const original = el.dataset.textoOriginal;
    if(!termo){ el.textContent = original; return; }
    const alvo = semAcento(original);
    const busca = semAcento(termo);
    let saida = "", i = 0;
    while(i < original.length){
      const achou = alvo.indexOf(busca, i);
      if(achou === -1){ saida += original.slice(i); break; }
      saida += original.slice(i, achou);
      saida += "<mark>" + original.slice(achou, achou + busca.length) + "</mark>";
      i = achou + busca.length;
    }
    el.innerHTML = saida;
  }
  $$(".campo-busca input[data-galeria]").forEach(input => {
    const galeria = document.getElementById(input.dataset.galeria);
    const campo = input.closest(".campo-busca");
    const contador = campo.parentElement.querySelector(".contador-busca");
    const cards = Array.from(galeria.querySelectorAll(".card-ferr"));
    cards.forEach(c => {
      const titulo = c.querySelector("h4");
      const desc = c.querySelector("p");
      titulo.dataset.textoOriginal = titulo.textContent.trim();
      desc.dataset.textoOriginal = desc.textContent.trim();
      c.dataset.busca = semAcento(titulo.textContent + " " + desc.textContent);
    });
    function filtrar(){
      const termo = input.value.trim();
      const alvo = semAcento(termo);
      let visiveis = 0;
      cards.forEach(c => {
        const bate = !alvo || c.dataset.busca.includes(alvo);
        c.classList.toggle("oculto", !bate);
        if(bate){ visiveis++; destacar(c.querySelector("h4"), termo); destacar(c.querySelector("p"), termo); }
      });
      galeria.classList.toggle("vazia", visiveis === 0);
      campo.classList.toggle("com-texto", termo.length > 0);
      contador.innerHTML = termo ? "<b>" + visiveis + "</b> de " + cards.length : "<b>" + cards.length + "</b> ferramentas";
    }
    input.addEventListener("input", filtrar);
    input.addEventListener("keydown", e => {
      if(e.key === "Escape"){ input.value = ""; filtrar(); }
      if(e.key === "Enter"){ e.preventDefault(); const p = cards.find(c => !c.classList.contains("oculto")); if(p) p.click(); }
    });
    campo.querySelector(".btn-limpar-busca").addEventListener("click", () => { input.value = ""; filtrar(); input.focus(); });
  });
  $$(".btn-voltar").forEach(b => b.addEventListener("click", () => {
    fecharFerramentas();
    window.scrollTo({ top:0, behavior:"smooth" });
  }));
  $$(".nav-item").forEach(b => b.addEventListener("click", () => irPara(b.dataset.secao)));
  // "aba:x" abre uma aba da ficha aberta, nao uma secao do menu — irPara("aba:x")
  // nao batia com secao nenhuma e zerava a tela (nenhuma .secao ficava ativa).
  $$("[data-ir]").forEach(c => c.addEventListener("click", () => {
    const destino = c.dataset.ir;
    if(destino.indexOf("aba:") === 0){
      const aba = document.querySelector('[data-aba="' + destino.slice(4) + '"]');
      if(aba) aba.click();
      return;
    }
    irPara(destino);
  }));

  /* ============================================================
     CARREGAR OS DADOS  (de onde, ver dados.js)
  ============================================================ */
  async function carregarTudo(){
    const [resPac, resOq3, resPqq, resHolo] = await Promise.all([
      sb.from("pacientes").select("*").order("created_at", { ascending: false }),
      sb.from("oq3").select("*").order("created_at", { ascending: false }),
      sb.from("pqq").select("*").order("created_at", { ascending: false }),
      sb.from("holoscope").select("*").order("created_at", { ascending: false })
    ]);
    // Mesmo dando errado a carga terminou: quem espera por ela nao pode
    // ficar preso em "carregando" para sempre.
    estado.carregado = true;
    if(resPac.error){ toast("Erro ao carregar pacientes."); avisarTrocaDePaciente(); return; }

    const oq3Map = {}, pqqMap = {}, holoMap = {};
    (resOq3.data || []).forEach(o => { if(!oq3Map[o.paciente_id]) oq3Map[o.paciente_id] = o; });
    (resPqq.data || []).forEach(o => { if(!pqqMap[o.paciente_id]) pqqMap[o.paciente_id] = o; });
    (resHolo.data || []).forEach(o => { if(!holoMap[o.paciente_id]) holoMap[o.paciente_id] = o; });

    const pacientes = resPac.data || [];
    pacientes.forEach(p => {
      normalizarContato(p);
      p.oq3 = oq3Map[p.id] || vazioOQ3();
      p.pqq = pqqMap[p.id] || vazioPQQ();
      p.holoscope = holoMap[p.id] || vazioHolo();
    });
    estado.pacientes = pacientes;
    if(pacientes.length > 0 && !estado.ativo) estado.ativo = pacientes[0].id;
    renderPacientes();
    atualizarSeletores();
    carregarFormularios();
    carregarHoloscope();
    // Ate esta linha nao se sabia de quem era a tela. As ferramentas que
    // guardam por paciente precisam ser avisadas de que agora se sabe —
    // sem isto, o que foi respondido antes da lista chegar fica gravado
    // debaixo de uma chave e procurado debaixo de outra.
    avisarTrocaDePaciente();
  }

  /* O cadastro antigo tinha um campo "Contato" que aceitava as duas coisas.
     Quem tem arroba e e-mail; o resto e telefone. Nao reescreve o registro:
     so preenche os campos novos quando eles estao vazios. */
  function normalizarContato(p){
    if(!p.telefone && !p.email && p.contato){
      if(String(p.contato).indexOf("@") >= 0) p.email = p.contato;
      else p.telefone = p.contato;
    }
    if(!p.status) p.status = "ativo";
  }

  function avisarTrocaDePaciente(){
    if(typeof window.aoTrocarPaciente === "function") window.aoTrocarPaciente();
  }

  /* ============================================================
     PACIENTES
  ============================================================ */
  function temConteudo(obj){
    return Object.keys(obj).some(k => k !== "id" && k !== "paciente_id" && k !== "created_at" && k !== "score_holos" && obj[k]);
  }

  function atualizarSeletores(){
    const opcoes = estado.pacientes.length
      ? estado.pacientes.map(p => '<option value="'+p.id+'"'+(p.id===estado.ativo?' selected':'')+'>'+p.nome+'</option>').join("")
      : '<option value="">Nenhum paciente cadastrado</option>';
    $$(".seletor-paciente").forEach(s => { s.innerHTML = opcoes; });
  }

  function definirAtivo(id){
    estado.ativo = id || null;
    atualizarSeletores();
    carregarFormularios();
    carregarHoloscope();
    renderizarMapa();
    // as 30 ferramentas guardam por paciente; formulario.js precisa saber
    avisarTrocaDePaciente();
  }

  // o que formulario.js enxerga daqui de dentro
  window.pacienteAtivoId = () => estado.ativo || null;
  // false enquanto a lista de pacientes nao voltou do banco. Quem guarda por
  // paciente tem que esperar por isto antes de gravar a primeira resposta.
  window.pacientesCarregados = () => estado.carregado;
  // O dashboard precisa da carteira inteira, nao so de quem esta ativo.
  window.pacientesTodos = () => estado.pacientes.slice();
  /* E precisa poder levar a nutricionista ate o paciente: escolher quem esta
     ativo e abrir a tela certa sao dois gestos, e o dashboard faz os dois. */
  window.definirPacienteAtivo = (id) => definirAtivo(id);
  window.irParaSecao = (secao) => irPara(secao);
  window.abrirFichaDe = (id) => abrirFicha(id);
  window.pacienteAtivoNome = () => {
    const p = pacienteAtivo();
    return p ? p.nome : null;
  };

  $$(".seletor-paciente").forEach(s => {
    s.addEventListener("change", () => {
      definirAtivo(s.value);
      const p = pacienteAtivo();
      if(p) toast("Paciente ativo: " + p.nome + ".");
    });
  });

  /* ============================================================
     A LISTA DE PACIENTES

     Era um cartao com o nome, a idade e tres selos. Faltava nele tudo o que
     decide o que fazer com aquela pessoa: ha quanto tempo ela nao aparece,
     se a ficha esta vazia, como falar com ela, e qual e o proximo passo.

     Quem classifica e Panorama.situacao(), a mesma leitura que a ficha e o
     dashboard usam. Daqui para baixo e so tela.
  ============================================================ */

  const FILTROS = [
    { id:"todos",    rotulo:"Todos",              cabe: () => true },
    { id:"ativos",   rotulo:"Ativos",             cabe: s => !s.inativo },
    { id:"novos",    rotulo:"Novos (30d)",        cabe: s => s.novo },
    { id:"silencio", rotulo:"Sem contato (90d+)", cabe: s => s.semContato },
    { id:"inativos", rotulo:"Inativos",           cabe: s => s.inativo },
    /* No produto de referencia isto e "portal vazio": o paciente recebe um
       link e nunca abre. Aqui nao ha portal — quem preenche e ela —, entao o
       que existe de verdade e a ficha que ninguem comecou. */
    { id:"vazias",   rotulo:"Ficha vazia",        cabe: s => s.vazia }
  ];

  let filtroPac = "todos";
  let ordemPac = "cadastro";
  let abaPac = "lista";
  const selecionados = new Set();

  const ICONES = {
    relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    agenda:  '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    fone:    '<path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 0 0 6.1 6.1l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
    carta:   '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 6.5 9 6 9-6"/>'
  };

  function ico(d){
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         + 'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + d + '</svg>';
  }

  /* "ha 3 meses" e o que a pessoa pensa; "ha 94 dias" ela teria que converter.
     Abaixo de um mes o dia ainda importa, entao ali o dia fica. */
  function haQuantoTempo(dias){
    if(dias === null || dias === undefined) return "";
    if(dias <= 0) return "hoje";
    if(dias === 1) return "ontem";
    if(dias < 30) return "há " + dias + " dias";
    const meses = Math.round(dias / 30);
    if(meses < 12) return "há " + meses + (meses === 1 ? " mês" : " meses");
    const anos = Math.floor(dias / 365);
    return "há " + anos + (anos === 1 ? " ano" : " anos");
  }

  function sexoDe(p){
    if(p.sexo === "F") return '<span class="pac-sexo" title="Feminino" aria-label="Feminino">&#9792;</span>';
    if(p.sexo === "M") return '<span class="pac-sexo" title="Masculino" aria-label="Masculino">&#9794;</span>';
    return "";
  }

  /* O que aparece embaixo do nome. So entra o que existe: campo vazio vira
     campo ausente, e nao um travessao ocupando espaco sem dizer nada. */
  function metaDoPaciente(p, s){
    const itens = [];
    const atraso = s.semContato ? " atraso" : "";
    itens.push('<span class="pac-dado' + atraso + '">' + ico(ICONES.relogio) + " "
      + (s.nuncaAtendido
          ? "Sem consulta ainda"
          : "Último contato " + haQuantoTempo(s.diasDeSilencio)) + "</span>");
    if(p.created_at){
      itens.push('<span class="pac-dado">' + ico(ICONES.agenda) + " Cadastrado "
        + dataBR(p.created_at.slice(0, 10)) + "</span>");
    }
    // So consulta MARCADA de verdade (Agenda) — nada de data inventada.
    if(window.Agenda && window.Agenda.proxima){
      const prox = window.Agenda.proxima(p.id);
      if(prox){
        itens.push('<span class="pac-dado">' + ico(ICONES.agenda) + " Próximo atendimento "
          + dataBR(prox.data) + (prox.hora ? " às " + prox.hora : "") + "</span>");
      }
    }
    if(p.telefone){
      itens.push('<a class="pac-dado pac-link" href="tel:' + escapar(p.telefone) + '">'
        + ico(ICONES.fone) + " " + escapar(p.telefone) + "</a>");
    }
    if(p.email){
      itens.push('<a class="pac-dado pac-link" href="mailto:' + escapar(p.email) + '">'
        + ico(ICONES.carta) + " " + escapar(p.email) + "</a>");
    }
    return itens.join("");
  }

  /* O botao principal e o proximo passo daquela pessoa, e quem sabe qual e
     Panorama.alertas() — o mesmo que o dashboard usa para decidir quem
     precisa de atencao. Sem pendencia nenhuma, resta abrir a ficha. */
  function proximoPasso(s){
    let av = [];
    try { av = window.Panorama.alertas(s.dados); } catch(e){ av = []; }
    if(av.length){
      av.sort((a, b) => a.peso - b.peso);
      return { rotulo: av[0].botao, destino: av[0].acao };
    }
    return { rotulo: "Abrir ficha", destino: "ficha" };
  }

  function cardPaciente(p, s){
    const passo = proximoPasso(s);
    const marcado = selecionados.has(p.id);
    return '<div class="card-paciente' + (p.id === estado.ativo ? " ativo" : "")
        + (s.inativo ? " inativo" : "") + '" data-id="' + p.id + '">'
      + '<label class="pac-check"><input type="checkbox" data-sel="' + p.id + '"'
        + (marcado ? " checked" : "") + ' aria-label="Selecionar ' + escapar(p.nome) + '"></label>'
      + '<span class="pac-avatar">' + escapar(p.nome.charAt(0).toUpperCase()) + "</span>"
      + '<span class="pac-info">'
        + '<span class="pac-nome"><h4>' + escapar(p.nome) + "</h4>" + sexoDe(p)
          + '<span class="pac-status' + (s.inativo ? "" : " ativo") + '">'
          + (s.inativo ? "Inativo" : "Ativo") + "</span></span>"
        + '<span class="pac-meta">' + metaDoPaciente(p, s) + "</span>"
      + "</span>"
      + '<button type="button" class="pac-abrir" data-ficha="' + p.id + '" '
        + 'aria-label="Abrir ficha de ' + escapar(p.nome) + '">&rarr;</button>'
      + '<span class="pac-acao">'
        + '<button type="button" class="pac-acao-principal" data-passo="' + escapar(passo.destino)
          + '" data-id="' + p.id + '">' + escapar(passo.rotulo) + "</button>"
        + '<button type="button" class="pac-acao-mais" data-menu="' + p.id + '" '
          + 'aria-haspopup="true" aria-expanded="false" aria-label="Mais ações para '
          + escapar(p.nome) + '">&#9662;</button>'
        + menuDoPaciente(p, s)
      + "</span>"
      + "</div>";
  }

  function menuDoPaciente(p, s){
    const itens = [
      { acao:"holoscope",    texto: s.dados.pontuacao ? "Reaplicar HOLOSCOPE" : "Aplicar HOLOSCOPE" },
      { acao:"questionario", texto:"Abrir questionário" },
      { acao:"corpo",        texto:"Aplicar OQ³" },
      { acao:"mente",        texto:"Aplicar PQQ" },
      { acao:"espirito",     texto:"Ver Mapa do Propósito" },
      { acao:"ficha",        texto:"Abrir ficha" },
      { separa:true },
      { acao:"status",       texto: s.inativo ? "Reativar paciente" : "Marcar como inativo" },
      { acao:"remover",      texto:"Remover paciente", perigo:true }
    ];
    return '<span class="pac-menu hidden" id="menu-' + p.id + '" role="menu">'
      + itens.map(i => i.separa
          ? '<span class="pac-menu-risco" role="separator"></span>'
          : '<button type="button" role="menuitem" class="pac-menu-item'
            + (i.perigo ? " perigo" : "") + '" data-item="' + i.acao
            + '" data-id="' + p.id + '">' + i.texto + "</button>").join("")
      + "</span>";
  }

  /* ---------- filtrar, ordenar, contar ---------- */

  function combinaComABusca(p, termo){
    if(!termo) return true;
    return semAcento([p.nome, p.queixa, p.email, p.telefone].filter(Boolean).join(" "))
      .includes(termo);
  }

  function ordenar(lista, sit){
    const copia = lista.slice();
    if(ordemPac === "nome"){
      copia.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    } else if(ordemPac === "contato"){
      // quem esta calado ha mais tempo primeiro: e para isso que serve a ordem
      copia.sort((a, b) => {
        const x = sit[a.id].diasDeSilencio, y = sit[b.id].diasDeSilencio;
        return (y === null ? -1 : y) - (x === null ? -1 : x);
      });
    } else {
      copia.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    }
    return copia;
  }

  function desenharChips(sit, visiveisNaBusca){
    $("#pac-chips").innerHTML = FILTROS.map(f => {
      const n = visiveisNaBusca.filter(p => f.cabe(sit[p.id])).length;
      return '<button type="button" class="pac-chip' + (f.id === filtroPac ? " ativo" : "")
        + '" data-filtro="' + f.id + '" aria-pressed="' + (f.id === filtroPac) + '">'
        + f.rotulo + '<span class="pac-chip-n">' + n + "</span></button>";
    }).join("");
  }

  function desenharSelecao(visiveis){
    const todosMarcados = visiveis.length > 0 &&
      visiveis.every(p => selecionados.has(p.id));
    $("#rotulo-selecionar").textContent = todosMarcados ? "Limpar seleção" : "Selecionar todos";
    $("#btn-selecionar-todos").classList.toggle("ativo", todosMarcados);

    const caixa = $("#pac-sel-acoes");
    if(selecionados.size === 0){ caixa.classList.add("hidden"); caixa.innerHTML = ""; return; }
    caixa.classList.remove("hidden");
    const algumAtivo = [...selecionados].some(id => {
      const p = estado.pacientes.find(x => x.id === id);
      return p && p.status !== "inativo";
    });
    caixa.innerHTML = '<span class="pac-sel-conta">' + selecionados.size
        + (selecionados.size === 1 ? " selecionado" : " selecionados") + "</span>"
      + '<button type="button" class="pac-sel-btn" data-lote="' + (algumAtivo ? "inativar" : "ativar") + '">'
        + (algumAtivo ? "Marcar como inativo" : "Reativar") + "</button>"
      + '<button type="button" class="pac-sel-btn perigo" data-lote="remover">Remover</button>';
  }

  function renderPacientes(){
    const termo = semAcento($("#busca-pacientes").value.trim());
    const lista = $("#lista-pacientes");
    const semCarteira = estado.pacientes.length === 0;
    $("#nav-total-pac").textContent = estado.pacientes.length;
    $("#pac-total-cabeca").innerHTML = "<b>" + estado.pacientes.length + "</b> "
      + (estado.pacientes.length === 1 ? "paciente" : "pacientes");

    // Sem ninguem na carteira, busca/ordenar/filtros/selecao nao tem sobre o
    // que operar — mostrar esses controles vazios so criaria uma tabela sem
    // contexto acima do convite para cadastrar a primeira pessoa.
    $(".acoes-topo").classList.toggle("hidden", semCarteira);
    $("#pac-chips").classList.toggle("hidden", semCarteira);
    $(".pac-selecao").classList.toggle("hidden", semCarteira);

    const sit = {};
    estado.pacientes.forEach(p => {
      try { sit[p.id] = window.Panorama.situacao(p); }
      catch(e){ sit[p.id] = { dados:{ pontuacao:null }, nuncaAtendido:true }; }
    });

    // a busca filtra antes dos chips, entao os numeros deles falam do que esta a vista
    const naBusca = estado.pacientes.filter(p => combinaComABusca(p, termo));
    desenharChips(sit, naBusca);

    const regra = FILTROS.find(f => f.id === filtroPac) || FILTROS[0];
    const visiveis = ordenar(naBusca.filter(p => regra.cabe(sit[p.id])), sit);

    // selecao so vale para quem continua na tela
    [...selecionados].forEach(id => {
      if(!visiveis.some(p => p.id === id)) selecionados.delete(id);
    });

    if(semCarteira){
      // O CTA fica so no cabecalho (#btn-abrir-novo, sempre visivel): duas
      // vezes o mesmo botao na tela — cabecalho e dentro do card vazio —
      // era a unica tela assim; as outras (Consultas, HOLOSCOPE, HOLOSCAN)
      // ja usavam so um.
      lista.innerHTML = '<div class="lista-vazia"><strong>Nenhum paciente cadastrado ainda</strong>'
        + "<span>Cadastre o primeiro paciente para iniciar a jornada clínica.</span>"
        + "</div>";
    } else if(!visiveis.length){
      lista.innerHTML = '<div class="lista-vazia"><strong>Nenhum paciente aqui</strong>'
        + "<span>" + (termo ? "Nenhum nome, e-mail ou telefone bate com a busca."
                            : "Nenhum paciente neste filtro.") + "</span></div>";
    } else {
      lista.innerHTML = visiveis.map(p => cardPaciente(p, sit[p.id])).join("");
    }

    desenharSelecao(visiveis);
    desenharRevisao(sit);
    atualizarSeletores();
  }

  /* ---------- a aba Revisao ----------

     Quem ja respondeu alguma coisa e ainda nao virou mapa. No app isso existia
     so como uma linha de alerta, que some entre as outras quando a carteira
     cresce — e e o unico estado em que o trabalho ja foi feito e esta parado
     esperando por quem atende. */
  function desenharRevisao(sit){
    const esperando = estado.pacientes.filter(p => sit[p.id].aguardandoMapa);
    const tag = $("#aba-revisao-n");
    tag.textContent = esperando.length;
    tag.classList.toggle("hidden", esperando.length === 0);

    const alvo = $("#painel-pac-revisao");
    if(!esperando.length){
      alvo.innerHTML = '<div class="lista-vazia"><strong>Nada esperando por você</strong>'
        + "<span>Quando alguém tiver questionário, exame ou ferramenta preenchidos "
        + "sem o HOLOSCOPE aplicado, aparece aqui.</span></div>";
      return;
    }

    alvo.innerHTML = '<p class="dash-sub">' + esperando.length
      + (esperando.length === 1 ? " pessoa já tem" : " pessoas já têm")
      + " material preenchido e nenhum mapa gerado. É o trabalho que já foi feito "
      + "e está parado.</p>"
      + '<div class="lista-pacientes">' + esperando.map(p => {
        const d = sit[p.id].dados;
        const feito = [];
        if(d.respondidas > 0) feito.push(d.respondidas + " de " + d.totalPerguntas + " respostas");
        if(d.exames > 0) feito.push(d.exames + (d.exames === 1 ? " exame" : " exames"));
        if(d.ferramentas.length > 0) feito.push(d.ferramentas.length
          + (d.ferramentas.length === 1 ? " ferramenta" : " ferramentas"));
        if(temConteudo(p.oq3)) feito.push("OQ³");
        if(temConteudo(p.pqq)) feito.push("PQQ");
        return '<div class="card-paciente card-revisao" data-id="' + p.id + '">'
          + '<span class="pac-avatar">' + escapar(p.nome.charAt(0).toUpperCase()) + "</span>"
          + '<span class="pac-info"><span class="pac-nome"><h4>' + escapar(p.nome) + "</h4></span>"
          + '<span class="pac-meta"><span class="pac-dado">' + escapar(feito.join(" · "))
          + "</span></span></span>"
          + '<button type="button" class="pac-acao-principal" data-passo="holoscope" '
          + 'data-id="' + p.id + '">Gerar HOLOSCOPE</button>'
          + "</div>";
      }).join("") + "</div>";
  }

  function trocarAbaPaciente(qual){
    abaPac = qual;
    $$("[data-aba-pac]").forEach(b => {
      const meu = b.dataset.abaPac === qual;
      b.classList.toggle("ativa", meu);
      b.setAttribute("aria-selected", meu ? "true" : "false");
    });
    $("#painel-pac-lista").classList.toggle("hidden", qual !== "lista");
    $("#painel-pac-revisao").classList.toggle("hidden", qual !== "revisao");
  }

  function preencher(id, valor, vazioMsg){
    const el = $(id);
    if(valor){ el.textContent = valor; el.classList.remove("vazio"); }
    else { el.textContent = vazioMsg; el.classList.add("vazio"); }
  }

  /* O cabeçalho da ficha. O resumo clínico, a linha do tempo e os formulários
     são desenhados por ficha.js; aqui fica só o que vem do cadastro. */
  function abrirFicha(id){
    definirAtivo(id);
    const p = pacienteAtivo();
    if(!p) return;

    $("#ficha-avatar").textContent = p.nome.charAt(0).toUpperCase();
    $("#ficha-nome").textContent = p.nome;

    const inativo = p.status === "inativo";
    const selo = $("#ficha-status");
    selo.textContent = inativo ? "Inativo" : "Ativo";
    selo.classList.toggle("ativo", !inativo);

    /* Telefone e e-mail viram link: a ficha é aberta quando se vai falar com a
       pessoa, e copiar o número na mão é o passo que sobrava. */
    const contato = [];
    if(p.telefone) contato.push('<a href="tel:' + escapar(p.telefone) + '">' + escapar(p.telefone) + "</a>");
    if(p.email) contato.push('<a href="mailto:' + escapar(p.email) + '">' + escapar(p.email) + "</a>");
    if(p.created_at) contato.push('<span class="fic-cadastro">Cadastrado em ' +
      escapar(dataBR(p.created_at.slice(0, 10))) + "</span>");
    $("#ficha-contato").innerHTML = contato.join('<span class="fic-ponto">&middot;</span>')
      || '<span class="fic-sem">sem telefone nem e-mail</span>';

    const sexo = { F:"Feminino", M:"Masculino" }[p.sexo] || "";
    $("#ficha-sobre").textContent =
      [idade(p.nascimento), p.nascimento ? "(" + dataBR(p.nascimento) + ")" : "", sexo]
        .filter(Boolean).join(" &middot; ").replace(/&middot;/g, "·")
      || "sem dados de nascimento";

    /* Os detalhes ficam fechados: são o que foi digitado no cadastro, e quem
       abre a ficha quer primeiro o estado clínico. Mas continuam a um clique. */
    const linhas = [
      ["Queixa principal", p.queixa],
      ["Início do acompanhamento", p.inicio ? dataBR(p.inicio) : ""],
      ["Cadastrado em", p.created_at ? dataBR(p.created_at.slice(0, 10)) : ""],
      ["Telefone", p.telefone],
      ["E-mail", p.email]
    ].filter(l => l[1]);
    $("#ficha-detalhes").innerHTML = linhas.length
      ? linhas.map(l => '<div class="fic-det"><span>' + escapar(l[0]) +
          "</span><b>" + escapar(l[1]) + "</b></div>").join("")
      : '<p class="fic-sem">Nada além do nome foi preenchido no cadastro.</p>';

    $("#vista-lista-pacientes").classList.add("hidden");
    $("#vista-ficha").classList.remove("hidden");
    if(typeof window.redesenharFicha === "function") window.redesenharFicha();
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  $("#ficha-ver-detalhes").addEventListener("click", () => {
    const corpo = $("#ficha-detalhes");
    const aberto = corpo.classList.toggle("hidden");
    $("#ficha-ver-detalhes").setAttribute("aria-expanded", aberto ? "false" : "true");
  });

  /* ---------- o que cada acao da lista faz ----------

     Um lugar so decide para onde cada destino leva, porque o mesmo destino
     chega por tres caminhos: o botao principal do cartao, o menu de tres
     pontos e o dashboard. Se cada um resolvesse por conta, "holoscope"
     abriria coisas diferentes dependendo de onde foi clicado. */
  function levarPara(destino, id){
    if(id) definirAtivo(id);

    if(destino === "ficha" || !destino){ abrirFicha(id); return; }

    if(destino.indexOf("aba:") === 0){
      abrirFicha(id);
      const aba = document.querySelector('[data-aba="' + destino.slice(4) + '"]');
      if(aba) aba.click();
      return;
    }

    if(destino === "questionario"){
      irPara("holoscope");
      const b = document.getElementById("btn-abrir-questionario");
      if(b) b.click();
      return;
    }

    irPara(destino);
    if(destino === "corpo") abrirFerramenta("vista-oq3");
    else if(destino === "mente") abrirFerramenta("vista-pqq");
    else if(destino === "espirito") abrirFerramenta("vista-mapa");
  }

  function fecharMenusDePaciente(){
    $$(".pac-menu").forEach(m => m.classList.add("hidden"));
    $$(".pac-acao-mais").forEach(b => b.setAttribute("aria-expanded", "false"));
  }

  async function mudarStatus(ids, novo){
    for(const id of ids){
      const { error } = await sb.from("pacientes").update({ status: novo }).eq("id", id);
      if(error){ toast("Erro ao salvar: " + error.message); return; }
      const p = estado.pacientes.find(x => x.id === id);
      if(p) p.status = novo;
    }
    selecionados.clear();
    renderPacientes();
    const quantos = ids.length;
    toast(quantos === 1
      ? (novo === "inativo" ? "Paciente marcado como inativo." : "Paciente reativado.")
      : quantos + (novo === "inativo" ? " marcados como inativos." : " reativados."));
  }

  /* Antes, isto apagava UMA coisa: a linha do paciente na tabela. As
     respostas, a serie de pontuacoes, os exames, os documentos, as aplicacoes,
     as consultas e o mapa gravado continuavam no disco, ligados a um id que
     nao existia mais — nove destinos invisiveis em toda tela.

     Agora a exclusao passa pelo motor: um lock, um snapshot, os filhos antes
     da raiz, verificacao no fim, e rollback se algo falhar. Tudo o mais aqui
     — o confirm, o toast, a selecao do proximo ativo — continua igual. */
  async function removerPacientes(ids){
    if(!window.Armazenamento || !window.Armazenamento.excluirPaciente){
      toast("A exclusão segura não está disponível neste navegador.");
      return;
    }
    /* Uma operacao so para todos os selecionados: N operacoes seriam N
       snapshots e N janelas de crash, e um crash no meio deixaria metade
       apagada e metade nao, sem nada dizendo qual era qual. */
    const r = await window.Armazenamento.excluirPaciente(ids, { confirmado: true });
    if(!r.aplicado){
      toast("Não foi possível remover: " + (r.motivo || "erro desconhecido"));
      return;
    }
    ids.forEach(id => {
      estado.pacientes = estado.pacientes.filter(x => x.id !== id);
      if(estado.ativo === id) definirAtivo(estado.pacientes[0] ? estado.pacientes[0].id : null);
    });
    selecionados.clear();
    renderPacientes();
    toast(ids.length === 1 ? "Paciente removido." : ids.length + " pacientes removidos.");
  }

  /* ---------- os cliques ---------- */

  $("#painel-pac-lista").addEventListener("click", e => {
    // marcar nao e navegar: a caixa de selecao nao pode abrir a ficha
    const caixa = e.target.closest("[data-sel]");
    if(caixa){
      e.stopPropagation();
      if(caixa.checked) selecionados.add(caixa.dataset.sel);
      else selecionados.delete(caixa.dataset.sel);
      const cartao = caixa.closest(".card-paciente");
      if(cartao) cartao.classList.toggle("marcado", caixa.checked);
      desenharSelecao(estado.pacientes.filter(p =>
        document.querySelector('[data-sel="' + p.id + '"]')));
      return;
    }

    const chip = e.target.closest("[data-filtro]");
    if(chip){ filtroPac = chip.dataset.filtro; selecionados.clear(); renderPacientes(); return; }

    const mais = e.target.closest("[data-menu]");
    if(mais){
      e.stopPropagation();
      const menu = document.getElementById("menu-" + mais.dataset.menu);
      const estavaAberto = menu && !menu.classList.contains("hidden");
      fecharMenusDePaciente();
      if(menu && !estavaAberto){
        menu.classList.remove("hidden");
        mais.setAttribute("aria-expanded", "true");
      }
      return;
    }

    const item = e.target.closest("[data-item]");
    if(item){
      e.stopPropagation();
      fecharMenusDePaciente();
      const id = item.dataset.id;
      const p = estado.pacientes.find(x => x.id === id);
      if(!p) return;
      if(item.dataset.item === "status"){
        mudarStatus([id], p.status === "inativo" ? "ativo" : "inativo");
      } else if(item.dataset.item === "remover"){
        if(confirm("Remover " + p.nome + "? Todos os registros dessa ficha serão apagados.")){
          removerPacientes([id]);
        }
      } else {
        levarPara(item.dataset.item, id);
      }
      return;
    }

    const passo = e.target.closest("[data-passo]");
    if(passo){ e.stopPropagation(); levarPara(passo.dataset.passo, passo.dataset.id); return; }

    const seta = e.target.closest("[data-ficha]");
    if(seta){ e.stopPropagation(); abrirFicha(seta.dataset.ficha); return; }

    const lote = e.target.closest("[data-lote]");
    if(lote){
      const ids = [...selecionados];
      if(!ids.length) return;
      if(lote.dataset.lote === "remover"){
        if(confirm("Remover " + ids.length + (ids.length === 1 ? " paciente" : " pacientes")
           + "? Todos os registros dessas fichas serão apagados.")){
          removerPacientes(ids);
        }
      } else {
        mudarStatus(ids, lote.dataset.lote === "inativar" ? "inativo" : "ativo");
      }
      return;
    }

    const card = e.target.closest(".card-paciente");
    if(card) abrirFicha(card.dataset.id);
  });

  $("#painel-pac-revisao").addEventListener("click", e => {
    const passo = e.target.closest("[data-passo]");
    if(passo){ levarPara(passo.dataset.passo, passo.dataset.id); return; }
    const card = e.target.closest(".card-paciente");
    if(card) abrirFicha(card.dataset.id);
  });

  // clicar fora fecha o menu aberto; sem isto ele so fechava no proximo desenho
  document.addEventListener("click", e => {
    if(!e.target.closest(".pac-acao")) fecharMenusDePaciente();
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") fecharMenusDePaciente();
  });

  $$("[data-aba-pac]").forEach(b =>
    b.addEventListener("click", () => trocarAbaPaciente(b.dataset.abaPac)));

  $("#btn-selecionar-todos").addEventListener("click", () => {
    const naTela = [...document.querySelectorAll("#lista-pacientes [data-sel]")]
      .map(c => c.dataset.sel);
    const todosMarcados = naTela.length > 0 && naTela.every(id => selecionados.has(id));
    if(todosMarcados) selecionados.clear();
    else naTela.forEach(id => selecionados.add(id));
    renderPacientes();
  });

  $("#ordem-pacientes").addEventListener("change", () => {
    ordemPac = $("#ordem-pacientes").value;
    renderPacientes();
  });

  $("#busca-pacientes").addEventListener("input", () => {
    $("#busca-pacientes").closest(".campo-busca").classList.toggle("com-texto", $("#busca-pacientes").value.length > 0);
    renderPacientes();
  });
  $("#limpar-busca-pac").addEventListener("click", () => {
    const campo = $("#busca-pacientes");
    campo.value = "";
    campo.closest(".campo-busca").classList.remove("com-texto");
    renderPacientes();
    campo.focus();
  });
  $("#voltar-lista").addEventListener("click", () => {
    $("#vista-ficha").classList.add("hidden");
    $("#vista-lista-pacientes").classList.remove("hidden");
    renderPacientes();
    window.scrollTo({ top:0, behavior:"smooth" });
  });

  $$("[data-atalho]").forEach(b => b.addEventListener("click", () => {
    const destino = b.dataset.atalho;
    irPara(destino);
    if(destino === "corpo") abrirFerramenta("vista-oq3");
    else if(destino === "mente") abrirFerramenta("vista-pqq");
    else if(destino === "espirito") abrirFerramenta("vista-mapa");
    else if(destino === "agenda"){
      const novo = document.querySelector('[data-novo="consulta"]');
      if(novo) novo.click();
    }
  }));

  const camposNovo = ["#np-nome","#np-nascimento","#np-telefone","#np-email","#np-sexo","#np-inicio","#np-queixa"];
  $("#btn-abrir-novo").addEventListener("click", () => { $("#painel-novo").classList.remove("hidden"); $("#np-nome").focus(); });
  $("#btn-cancelar-paciente").addEventListener("click", () => { camposNovo.forEach(s => $(s).value = ""); $("#painel-novo").classList.add("hidden"); });

  $("#btn-salvar-paciente").addEventListener("click", async () => {
    const nome = $("#np-nome").value.trim();
    if(!nome){ toast("Informe o nome do paciente."); $("#np-nome").focus(); return; }

    const { data, error } = await sb.from("pacientes").insert({
      nome,
      nascimento: $("#np-nascimento").value || null,
      telefone: $("#np-telefone").value.trim() || null,
      email: $("#np-email").value.trim() || null,
      sexo: $("#np-sexo").value || null,
      inicio: $("#np-inicio").value || null,
      queixa: $("#np-queixa").value.trim() || null,
      // nasce ativo; deixar de ser e uma decisao de quem atende, nao do silencio
      status: "ativo"
    }).select().single();

    if(error){ toast("Erro ao salvar: " + error.message); return; }

    normalizarContato(data);
    data.oq3 = vazioOQ3();
    data.pqq = vazioPQQ();
    data.holoscope = vazioHolo();
    estado.pacientes.unshift(data);
    camposNovo.forEach(s => $(s).value = "");
    $("#painel-novo").classList.add("hidden");
    definirAtivo(data.id);
    renderPacientes();
    toast(nome.split(" ")[0] + " foi cadastrada.");
  });

  /* ============================================================
     FORMULARIOS: OQ3
  ============================================================ */
  function carregarFormularios(){
    const p = pacienteAtivo();
    pintarOQ3(p ? p.oq3 : vazioOQ3());
    pintarPQQ(p ? p.pqq : vazioPQQ());
  }

  /* ------------------------------------------------------------------------
     OQ3 — AGORA COM HISTORICO

     Antes: cada "Salvar OQ3" inseria uma linha na tabela `oq3`, e a tela
     mostrava so a mais recente. O dado nao se perdia, mas o historico era
     invisivel — nao havia como abrir a aplicacao de junho para comparar com a
     de setembro, que e exatamente para o que o OQ3 serve.

     Agora ele usa o mesmo modelo das outras nove (aplicacoes.js): cada
     aplicacao e um registro datado, com paciente_id, consulta_id, status e os
     tres carimbos de tempo. Salvar CONCLUI a aplicacao aberta; comecar outra e
     um gesto explicito, no botao "Nova aplicacao".

     NADA do conteudo clinico mudou: os mesmos cinco campos, com os mesmos
     rotulos e as mesmas dicas, guardados com os mesmos nomes dentro de
     `respostas`. Nenhuma nota, nenhuma sintese, nenhuma interpretacao — o OQ3
     nao declara `resultado`, e por isso `resultado` fica null.
     ---------------------------------------------------------------------- */

  const FERR_OQ3 = { id: "oq3", titulo: "OQ³" };
  let aplicacaoOQ3 = null;

  /** O dia do calendário de um instante, no fuso de quem está olhando. */
  function diaLocalOQ3(iso){
    if(!iso) return "";
    if(iso.length <= 10) return iso;            // já é data, não instante
    const d = new Date(iso);
    if(isNaN(d)) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
         + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** A data que identifica uma aplicação do OQ3 na tela: a da consulta, se
      quem atende a preencheu; senão a do dia em que o registro foi fechado. */
  function dataDaAplicacaoOQ3(a){
    if(!a) return "";
    const consulta = a.respostas && a.respostas.data_consulta;
    if(consulta) return { dia: consulta, deConsulta: true };
    return { dia: diaLocalOQ3(a.concluida_em || a.iniciada_em), deConsulta: false };
  }

  function respostasOQ3(){
    return {
      data_consulta: $("#oq3-data").value || null,
      quer: $("#oq3-quer").value.trim(),
      precisa: $("#oq3-precisa").value.trim(),
      consegue: $("#oq3-consegue").value.trim(),
      alavancas: $("#oq3-alavancas").value.trim()
    };
  }

  function pintarOQ3(r){
    const v = r || vazioOQ3();
    $("#oq3-data").value = v.data_consulta || "";
    $("#oq3-quer").value = v.quer || "";
    $("#oq3-precisa").value = v.precisa || "";
    $("#oq3-consegue").value = v.consegue || "";
    $("#oq3-alavancas").value = v.alavancas || "";
  }

  /** O que a ficha, o painel e o Mapa do Proposito leem como "o OQ3 dele":
      as respostas da ultima aplicacao concluida. */
  function oq3DaUltimaAplicacao(pid){
    if(!window.Aplicacoes) return null;
    const u = window.Aplicacoes.ultima("oq3", pid);
    if(!u) return null;
    return Object.assign({ id: u.id, created_at: u.concluida_em || u.iniciada_em },
                         u.respostas || {});
  }

  /** Mantem p.oq3 alinhado com o historico, sem que ninguem mais precise
      saber que o OQ3 virou aplicacao. */
  function sincronizarOQ3(){
    (estado.pacientes || []).forEach(p => {
      const derivado = oq3DaUltimaAplicacao(p.id);
      if(derivado) p.oq3 = derivado;
      else if(!p.oq3) p.oq3 = vazioOQ3();
    });
  }

  function notaDeQuandoOQ3(){
    const nota = $("#oq3-de-quando");
    if(!nota) return;
    if(!aplicacaoOQ3 || aplicacaoOQ3.status === "rascunho"){
      nota.classList.add("hidden");
      nota.textContent = "";
      return;
    }
    const q = dataDaAplicacaoOQ3(aplicacaoOQ3);
    nota.textContent = "Você está vendo a aplicação de " + dataBR(q.dia) +
      (q.deConsulta ? "" : " (data do registro — a consulta não foi datada)") +
      ". Editar altera essa aplicação; para começar outra, use “Nova aplicação”.";
    nota.classList.remove("hidden");
  }

  function desenharHistoricoOQ3(){
    const caixa = $("#oq3-historico");
    if(!caixa || !window.Aplicacoes) return;
    const lista = window.Aplicacoes.historico("oq3");
    if(lista.length < 2){ caixa.classList.add("hidden"); caixa.innerHTML = ""; return; }

    caixa.innerHTML = '<h4 class="ferr-historico-titulo">Aplicações anteriores</h4>'
      + '<div class="ferr-historico-lista">'
      + lista.map(a => {
          const resumo = (a.respostas && a.respostas.quer) || "";
          return '<button type="button" class="ferr-hist-item" data-oq3-app="' + a.id + '">'
            + "<b>" + dataBR(dataDaAplicacaoOQ3(a).dia) + "</b>"
            + '<span class="ferr-hist-estado">'
            + window.Aplicacoes.rotulo(a.status === "rascunho" ? "em_preenchimento" : a.status)
            + "</span>"
            /* O resumo e texto digitado por quem atende: a resposta do
               paciente em "O que quer" (OQ3) ou o "pra que" verdadeiro (PQQ).
               Ele entra em innerHTML, entao precisa ser escapado na SAIDA —
               como todo o resto do app ja faz. O conteudo guardado nao muda:
               um "<" continua sendo "<" dentro de respostas. */
            + '<span class="ferr-hist-leitura">' + escapar(resumo) + "</span></button>";
        }).join("")
      + "</div>";
    caixa.classList.remove("hidden");

    caixa.querySelectorAll("[data-oq3-app]").forEach(b => {
      b.addEventListener("click", () => {
        const alvo = lista.find(a => String(a.id) === b.dataset.oq3App);
        if(!alvo) return;
        aplicacaoOQ3 = alvo;
        pintarOQ3(alvo.respostas);
        notaDeQuandoOQ3();
      });
    });
  }

  /** Abre a aplicacao de trabalho: o rascunho aberto, ou a ultima concluida
      para reler e corrigir, ou uma nova se nao houver nenhuma. */
  async function abrirAplicacaoOQ3(){
    const p = pacienteAtivo();
    if(!p || !window.Aplicacoes){
      aplicacaoOQ3 = null;
      notaDeQuandoOQ3();
      return;
    }
    aplicacaoOQ3 = await window.Aplicacoes.abrir(FERR_OQ3);
    pintarOQ3(aplicacaoOQ3.respostas);
    notaDeQuandoOQ3();
    desenharHistoricoOQ3();
  }

  $("#btn-salvar-oq3").addEventListener("click", async () => {
    const p = pacienteAtivo();
    if(!p){ toast("Selecione um paciente para salvar o OQ3."); return; }
    if(!window.Aplicacoes){ toast("Erro ao salvar OQ3."); return; }

    if(!aplicacaoOQ3) aplicacaoOQ3 = await window.Aplicacoes.abrir(FERR_OQ3);
    // resultado fica null: o OQ3 nao deriva sintese nenhuma.
    await window.Aplicacoes.concluir(aplicacaoOQ3, respostasOQ3(), null);

    sincronizarOQ3();
    renderPacientes();
    notaDeQuandoOQ3();
    desenharHistoricoOQ3();
    toast("OQ3 salvo na ficha de " + p.nome.split(" ")[0] + ".");
  });

  /* Comecar outra aplicacao e um gesto explicito — e o que garante que a
     anterior continue inteira, com a data dela. */
  $("#btn-nova-oq3").addEventListener("click", async () => {
    const p = pacienteAtivo();
    if(!p){ toast("Selecione um paciente primeiro."); return; }
    if(!window.Aplicacoes) return;
    aplicacaoOQ3 = await window.Aplicacoes.nova(FERR_OQ3);
    pintarOQ3(vazioOQ3());
    notaDeQuandoOQ3();
    desenharHistoricoOQ3();
    toast("Nova aplicação do OQ3. A anterior continua no histórico.");
  });

  /* ============================================================
     FORMULARIOS: PQQ
  ============================================================ */
  /* ------------------------------------------------------------------------
     PQQ — AGORA COM HISTORICO

     Antes: cada "Salvar PQQ" inseria uma linha na tabela `pqq`, e a tela
     mostrava so a mais recente. O dado nao se perdia, mas o historico era
     invisivel — e o PQQ e justamente a ferramenta em que comparar o "pra que"
     de marco com o de outubro e a leitura.

     Agora ele usa o mesmo modelo das outras (aplicacoes.js): cada aplicacao e
     um registro datado, com paciente_id, consulta_id, status e os tres
     carimbos de tempo. Salvar CONCLUI a aplicacao aberta; comecar outra e um
     gesto explicito.

     NADA do conteudo mudou: os mesmos sete campos — objetivo, r1..r5 e
     verdadeiro — com os mesmos nomes. Nenhuma nota, nenhuma sintese, nenhuma
     interpretacao: o PQQ nao declara `resultado`, e `resultado` fica null.
     ---------------------------------------------------------------------- */

  const FERR_PQQ = { id: "pqq", titulo: "PQQ" };
  let aplicacaoPQQ = null;

  /** O dia do calendario de um instante, no fuso de quem esta olhando. */
  function diaLocalDaAplicacao(iso){
    if(!iso) return "";
    if(iso.length <= 10) return iso;
    const d = new Date(iso);
    if(isNaN(d)) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
         + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** A data que identifica uma aplicacao na tela: a da consulta, quando a
      ferramenta tem esse campo e ele foi preenchido; senao a do dia em que o
      registro foi fechado. O PQQ nao tem campo de data de consulta, entao cai
      sempre no carimbo — e a tela diz isso. */
  function dataDaAplicacao(a){
    if(!a) return { dia: "", deConsulta: false };
    const consulta = a.respostas && a.respostas.data_consulta;
    if(consulta) return { dia: consulta, deConsulta: true };
    return { dia: diaLocalDaAplicacao(a.concluida_em || a.iniciada_em), deConsulta: false };
  }

  function respostasPQQ(){
    return {
      objetivo: $("#pqq-objetivo").value.trim(),
      r1: $("#pqq-1").value.trim(),
      r2: $("#pqq-2").value.trim(),
      r3: $("#pqq-3").value.trim(),
      r4: $("#pqq-4").value.trim(),
      r5: $("#pqq-5").value.trim(),
      verdadeiro: $("#pqq-verdadeiro").value.trim()
    };
  }

  function pintarPQQ(r){
    const v = r || vazioPQQ();
    $("#pqq-objetivo").value = v.objetivo || "";
    $("#pqq-1").value = v.r1 || "";
    $("#pqq-2").value = v.r2 || "";
    $("#pqq-3").value = v.r3 || "";
    $("#pqq-4").value = v.r4 || "";
    $("#pqq-5").value = v.r5 || "";
    $("#pqq-verdadeiro").value = v.verdadeiro || "";
  }

  /** O que a ficha, o painel, o perfil e o Mapa leem como "o PQQ dele":
      as respostas da ultima aplicacao concluida. */
  function pqqDaUltimaAplicacao(pid){
    if(!window.Aplicacoes) return null;
    const u = window.Aplicacoes.ultima("pqq", pid);
    if(!u) return null;
    return Object.assign({ id: u.id, created_at: u.concluida_em || u.iniciada_em },
                         u.respostas || {});
  }

  function sincronizarPQQ(){
    (estado.pacientes || []).forEach(p => {
      const derivado = pqqDaUltimaAplicacao(p.id);
      if(derivado) p.pqq = derivado;
      else if(!p.pqq) p.pqq = vazioPQQ();
    });
  }

  function notaDeQuandoPQQ(){
    const nota = $("#pqq-de-quando");
    if(!nota) return;
    if(!aplicacaoPQQ || aplicacaoPQQ.status === "rascunho"){
      nota.classList.add("hidden");
      nota.textContent = "";
      return;
    }
    const q = dataDaAplicacao(aplicacaoPQQ);
    nota.textContent = "Você está vendo a aplicação de " + dataBR(q.dia) +
      ". Editar altera essa aplicação; para começar outra, use “Nova aplicação”.";
    nota.classList.remove("hidden");
  }

  function desenharHistoricoPQQ(){
    const caixa = $("#pqq-historico");
    if(!caixa || !window.Aplicacoes) return;
    const lista = window.Aplicacoes.historico("pqq");
    if(lista.length < 2){ caixa.classList.add("hidden"); caixa.innerHTML = ""; return; }

    caixa.innerHTML = '<h4 class="ferr-historico-titulo">Aplicações anteriores</h4>'
      + '<div class="ferr-historico-lista">'
      + lista.map(a => {
          const resumo = (a.respostas && (a.respostas.verdadeiro || a.respostas.objetivo)) || "";
          return '<button type="button" class="ferr-hist-item" data-pqq-app="' + a.id + '">'
            + "<b>" + dataBR(dataDaAplicacao(a).dia) + "</b>"
            + '<span class="ferr-hist-estado">'
            + window.Aplicacoes.rotulo(a.status === "rascunho" ? "em_preenchimento" : a.status)
            + "</span>"
            /* O resumo e texto digitado por quem atende: a resposta do
               paciente em "O que quer" (OQ3) ou o "pra que" verdadeiro (PQQ).
               Ele entra em innerHTML, entao precisa ser escapado na SAIDA —
               como todo o resto do app ja faz. O conteudo guardado nao muda:
               um "<" continua sendo "<" dentro de respostas. */
            + '<span class="ferr-hist-leitura">' + escapar(resumo) + "</span></button>";
        }).join("")
      + "</div>";
    caixa.classList.remove("hidden");

    caixa.querySelectorAll("[data-pqq-app]").forEach(b => {
      b.addEventListener("click", () => {
        const alvo = lista.find(a => String(a.id) === b.dataset.pqqApp);
        if(!alvo) return;
        aplicacaoPQQ = alvo;
        pintarPQQ(alvo.respostas);
        notaDeQuandoPQQ();
      });
    });
  }

  async function abrirAplicacaoPQQ(){
    const p = pacienteAtivo();
    if(!p || !window.Aplicacoes){
      aplicacaoPQQ = null;
      notaDeQuandoPQQ();
      return;
    }
    aplicacaoPQQ = await window.Aplicacoes.abrir(FERR_PQQ);
    pintarPQQ(aplicacaoPQQ.respostas);
    notaDeQuandoPQQ();
    desenharHistoricoPQQ();
  }

  $("#btn-salvar-pqq").addEventListener("click", async () => {
    const p = pacienteAtivo();
    if(!p){ toast("Selecione um paciente para salvar o PQQ."); return; }
    if(!window.Aplicacoes){ toast("Erro ao salvar PQQ."); return; }

    if(!aplicacaoPQQ) aplicacaoPQQ = await window.Aplicacoes.abrir(FERR_PQQ);
    // resultado fica null: o PQQ nao deriva sintese nenhuma.
    await window.Aplicacoes.concluir(aplicacaoPQQ, respostasPQQ(), null);

    sincronizarPQQ();
    renderPacientes();
    notaDeQuandoPQQ();
    desenharHistoricoPQQ();
    toast("PQQ salvo na ficha de " + p.nome.split(" ")[0] + ".");
  });

  $("#btn-nova-pqq").addEventListener("click", async () => {
    const p = pacienteAtivo();
    if(!p){ toast("Selecione um paciente primeiro."); return; }
    if(!window.Aplicacoes) return;
    aplicacaoPQQ = await window.Aplicacoes.nova(FERR_PQQ);
    pintarPQQ(vazioPQQ());
    notaDeQuandoPQQ();
    desenharHistoricoPQQ();
    toast("Nova aplicação do PQQ. A anterior continua no histórico.");
  });

  /* ---------- limpar ---------- */
  const camposOQ3 = ["#oq3-data","#oq3-quer","#oq3-precisa","#oq3-consegue","#oq3-alavancas"];
  const camposPQQ = ["#pqq-objetivo","#pqq-1","#pqq-2","#pqq-3","#pqq-4","#pqq-5","#pqq-verdadeiro"];
  $$("[data-limpar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const alvo = btn.dataset.limpar;
      (alvo === "oq3" ? camposOQ3 : camposPQQ).forEach(s => $(s).value = "");
      toast("Formulario limpo.");
    });
  });

  /* ============================================================
     MAPA DO PROPOSITO
  ============================================================ */
  function renderizarMapa(){
    const p = pacienteAtivo();
    const oq3 = p ? p.oq3 : vazioOQ3();
    const pqq = p ? p.pqq : vazioPQQ();
    $("#mapa-paciente").textContent = p
      ? p.nome + (oq3.data_consulta ? " - " + dataBR(oq3.data_consulta) : "")
      : "Selecione um paciente acima";
    preencher("#mapa-quer", oq3.quer, "Aplique o OQ3 no módulo Corpo.");
    preencher("#mapa-precisa", oq3.precisa, "Aplique o OQ3 no módulo Corpo.");
    preencher("#mapa-consegue", oq3.consegue, "Aplique o OQ3 no módulo Corpo.");
    preencher("#mapa-alavancas", oq3.alavancas, "Aplique o OQ3 no módulo Corpo.");
    preencher("#mapa-objetivo", pqq.objetivo, "Aplique o PQQ no módulo Mente.");
    /* O propósito é o campo "O verdadeiro", e só ele.

       Havia aqui uma escolha automática: com "O verdadeiro" vazio, o sistema
       pegava a resposta mais profunda que estivesse preenchida (r5, senão r4,
       e assim por diante) e a exibia entre aspas como sendo o propósito. Isso
       assume que profundidade na escada equivale a propósito — uma leitura que
       ninguém decidiu, feita em silêncio, sobre a fala do paciente.

       Foi removida e NÃO foi substituída por outra. Sem "O verdadeiro"
       preenchido, o Mapa fica sem propósito definido, com o mesmo aviso que já
       existia para quando o PQQ não foi aplicado. */
    const proposito = pqq.verdadeiro || "";
    preencher("#mapa-proposito", proposito ? "“" + proposito + "”" : "", "Aplique o PQQ no módulo Mente para revelar o propósito.");
  }

  $("#btn-atualizar-mapa").addEventListener("click", () => { renderizarMapa(); toast("Mapa atualizado."); });
  $("#btn-imprimir").addEventListener("click", () => window.print());

  /* ============================================================
     HOLOSCOPE: RADAR CHART
  ============================================================ */
  const radarSVG = $("#radar-svg");
  const CX = 150, CY = 150, R_MAX = 120;
  const sistemas = ["fungico","inflamatorio","metabolico","detox","mental"];
  const sistemasLabel = ["Fúngico","Inflamatório","Metabólico","Detox","Mental"];

  function pentagonPoint(r, i){
    const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
    return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
  }

  function pentagonPoints(r){
    return Array.from({length:5}, (_, i) => pentagonPoint(r, i).join(",")).join(" ");
  }

  // PHI. O material pede "assinatura da proporção áurea e geometria sagrada":
  // os aneis deixam de ser igualmente espacados e passam a decrescer por PHI, e
  // entra o pentagrama, cujas diagonais se cortam exatamente nessa razao.
  const PHI = (1 + Math.sqrt(5)) / 2;

  function initRadar(){
    let svg = '';
    svg += '<circle cx="'+CX+'" cy="'+CY+'" r="'+(R_MAX*1.06)+'" fill="none" '
         + 'stroke="rgba(201,163,90,.10)" stroke-width="1"/>';
    let r = R_MAX;
    for(let k = 0; k < 5; k++){
      svg += '<polygon points="'+pentagonPoints(r)+'" fill="none" '
           + 'stroke="rgba(201,163,90,'+(0.055 + k*0.028).toFixed(3)+')" stroke-width="1"/>';
      r = r / PHI;
    }
    // pentagrama: liga cada vertice ao segundo seguinte
    let estrela = [];
    for(let i = 0; i < 5; i++) estrela.push(pentagonPoint(R_MAX, (i*2) % 5).join(","));
    svg += '<polygon points="'+estrela.join(" ")+'" fill="none" '
         + 'stroke="rgba(201,163,90,.08)" stroke-width="1"/>';
    for(let i = 0; i < 5; i++){
      const [x, y] = pentagonPoint(R_MAX, i);
      svg += '<line x1="'+CX+'" y1="'+CY+'" x2="'+x+'" y2="'+y+'" stroke="rgba(201,163,90,.2)" stroke-width="1"/>';
    }
    svg += '<polygon id="radar-fill" points="'+pentagonPoints(0)+'" fill="rgba(201,163,90,.2)" stroke="var(--dourado)" stroke-width="2"/>';
    for(let i = 0; i < 5; i++){
      svg += '<circle class="radar-dot" cx="'+CX+'" cy="'+CY+'" r="5" fill="var(--dourado)"/>';
      const [lx, ly] = pentagonPoint(R_MAX + 20, i);
      svg += '<text x="'+lx+'" y="'+(ly + 4)+'" text-anchor="middle" fill="var(--dourado-claro)" font-size="10" font-family="var(--fonte-corpo)" font-weight="500">'+sistemasLabel[i]+'</text>';
    }
    radarSVG.innerHTML = svg;
  }

  function updateRadar(scores, pronta){
    const pontos = scores.map((s, i) => pentagonPoint(s / 10 * R_MAX, i).join(",")).join(" ");
    const fill = radarSVG.querySelector("#radar-fill");
    if(fill) fill.setAttribute("points", pontos);
    const dots = radarSVG.querySelectorAll(".radar-dot");
    scores.forEach((s, i) => {
      const [x, y] = pentagonPoint(s / 10 * R_MAX, i);
      dots[i].setAttribute("cx", x);
      dots[i].setAttribute("cy", y);
    });

    // O indice vem do motor. Era "soma x 2" escrito aqui — mesma conta, mas
    // uma segunda copia da regra. O "x 2" so vale enquanto os pesos forem 0,20
    // e o maximo 100; se o Rodrigo mudar um peso, a tela mentiria calada.
    // com a Pontuacao pronta, o indice e o dela; sem ela, pede ao motor
    const total = pronta ? pronta.indice : indiceDoMotor(scores);

    /* Paciente sem mapa nenhum mostrava "0 de 100" — que numa escala onde 100
       e o melhor se le como o pior resultado possivel. Quem acabou de ser
       cadastrado nao esta mal: esta por avaliar. */
    const semMapa = !pronta && scores.every(s => s === 0) && !temMapaSalvo();
    $("#holo-score-total").textContent = semMapa ? "—" : total;

    // As quatro faixas que existiam aqui (<40/<60/<80/>=80, cada uma com uma
    // frase clinica propria, incluindo "Estado cronico de ameaca" repetida da
    // CMB-001) nao tem fonte, nao tem status, nao estao em nenhum CSV — eram
    // regra clinica escrita direto no JS. Removidas nesta rodada (revisao
    // clinica do HOLOSCOPE): o Indice fica com uma frase fixa, a mesma para
    // qualquer valor, dizendo o que ele E, nao o que ele "significa".
    const msg = semMapa
      ? "Aplique o questionário ou pontue os cinco sistemas à mão para gerar a leitura."
      : "O Índice HOLOS resume as respostas deste mapa e não representa percentual de saúde.";
    $("#holo-interpretacao").textContent = msg;
    lerTerreno(scores, pronta);
  }


  /* ------------------------------------------------------------------------
     TERRITORIOS DO OLHAR — o que foi perguntado, e o que ficou de fora

     O metodo organiza o paciente em corpo, mente, emocoes, comportamento,
     sistema nervoso, ambiente e historia. A promessa nao e outra nota: e
     "ampliar e organizar o olhar" — e o que isso pede da ferramenta e mostrar
     onde NAO se olhou. Territorio declarado sem nenhuma pergunta apontando
     para ele nao e territorio equilibrado: e buraco.
     --------------------------------------------------------------------- */

  function desenharTerritorios(territorios){
    const caixa = $("#holo-territorios");
    if(!caixa) return;
    if(!territorios || territorios.length === 0){
      caixa.classList.add("hidden");
      caixa.innerHTML = "";
      return;
    }

    const vazios = territorios.filter(t => t.respondidos === 0);
    const linhas = territorios.map(t => {
      const semDado = t.respondidos === 0;
      return '<li class="terr-linha' + (semDado ? " sem-dado" : "") + '">'
        + '<span class="terr-nome">' + t.territorio
        + (t.leitura ? '<i>' + t.leitura + "</i>" : "") + "</span>"
        + '<span class="terr-conta">'
        + (semDado ? "nenhuma pergunta"
                   : t.respondidos + " de " + t.total + " respondidas")
        + "</span>"
        + '<span class="terr-nota">' + (t.nota === null ? "—" : t.nota.toFixed(1)) + "</span>"
        + "</li>";
    }).join("");

    caixa.innerHTML =
      '<div class="terr-cabeca"><span class="eyebrow">O que você olhou</span>'
      + "<p>Os territórios do método. A nota é do que pontua; o que importa aqui "
      + "é o que ficou sem pergunta.</p></div>"
      + '<ul class="terr-lista">' + linhas + "</ul>"
      + (vazios.length
          ? '<p class="terr-buraco"><b>' + vazios.length
            + (vazios.length === 1 ? " território" : " territórios")
            + " sem nenhuma pergunta:</b> "
            + vazios.map(t => t.territorio).join(", ")
            + ". Não é equilíbrio — é o que o questionário ainda não alcança.</p>"
          : '<p class="terr-buraco ok">Todos os territórios foram perguntados.</p>');
    caixa.classList.remove("hidden");
  }

  /* ------------------------------------------------------------------------
     MAPA DE FREQUENCIAS — nota por chacra

     A quinta subferramenta do material. Nao tem pergunta propria: e um
     segundo recorte das mesmas respostas, pela coluna "chacra" de cada
     marcador. Quem agrupa e o motor; aqui so se desenha o que ele devolveu.

     Enquanto chacras.csv estiver vazio isto nao aparece — e a tela diz "em
     construcao" em vez de mostrar um quadro vazio com ar de resultado.
     --------------------------------------------------------------------- */

  function desenharFrequencias(frequencias){
    const caixa = $("#holo-frequencias");
    if(!caixa) return;
    if(!frequencias || frequencias.length === 0){
      caixa.classList.add("hidden");
      caixa.innerHTML = "";
      return;
    }

    // o motor ja devolve do mais travado para o mais livre
    const travado = frequencias[0];
    const linhas = frequencias.map(f =>
      '<li class="freq-linha' + (f === travado ? " travado" : "") + '">'
      + '<span class="freq-nome">' + f.chacra
      + (f.leitura ? '<i>' + f.leitura + "</i>" : "") + "</span>"
      + '<span class="freq-trilho"><b style="width:' + (f.nota * 10) + '%"></b></span>'
      + '<span class="freq-nota">' + f.nota.toFixed(1) + "</span></li>").join("");

    caixa.innerHTML =
      '<div class="freq-cabeca"><span class="eyebrow">Mapa de Frequências</span>'
      + "<p>10 = fluindo. Lido das mesmas respostas do questionário.</p></div>"
      + '<ul class="freq-lista">' + linhas + "</ul>"
      + '<p class="freq-leitura">Mais travado: <b>' + travado.chacra + "</b>"
      + (travado.leitura ? " &middot; " + travado.leitura : "") + ".</p>";
    caixa.classList.remove("hidden");
  }

  /* ------------------------------------------------------------------------
     LEITURA DO TERRENO

     O material promete que o HOLOSCOPE nao devolve so sintoma fisico, mas o
     padrao emocional e o impacto espiritual de cada sistema — e uma direcao
     terapeutica. A tela mostrava so o numero. Isto preenche o resto.

     Ate 13/09 tudo isto era um objeto escrito a mao aqui dentro, e ele ja
     tinha divergido do banco: sistemas.csv dizia "irritacao e reatividade" e
     o codigo dizia "irritacao, raiva, reatividade". Duas copias da mesma
     frase, e a que aparecia para a paciente era a que o Rodrigo nao alcanca.

     Agora nada disto vive aqui:
       nome, padrao emocional, impacto espiritual  ->  bancos/sistemas.csv
       os tres eixos terapeuticos e suas praticas  ->  bancos/eixos.csv
     --------------------------------------------------------------------- */

  // As chaves do motor sao as dos bancos; as da tela sao abreviadas.
  const CHAVE_MOTOR = {
    fungico: "fungico",
    inflamatorio: "acido_inflamatorio",
    metabolico: "metabolico",
    detox: "detox_linfatico",
    mental: "mental_emocional_espiritual"
  };

  /* O terreno dos cinco sistemas, montado dos bancos uma vez. Se o motor nao
     carregou, devolve vazio: a tela mostra a nota e omite a leitura, em vez
     de inventar texto. */
  let terrenoCache = null;
  function terreno(){
    if(terrenoCache) return terrenoCache;
    const saida = {};
    let doMotor = [], todosEixos = [];
    try {
      if(window.HOLOSCOPE){
        doMotor = window.HOLOSCOPE.sistemas ? window.HOLOSCOPE.sistemas() : [];
        todosEixos = window.HOLOSCOPE.eixos ? window.HOLOSCOPE.eixos() : [];
      }
    } catch(e){ console.error("motor:", e); }

    sistemas.forEach(chave => {
      const id = CHAVE_MOTOR[chave];
      const s = doMotor.find(x => x.id === id);
      if(!s) return;
      saida[chave] = {
        nome: s.nome,
        definicao: s.definicao,
        rascunho: s.status_definicao !== "confirmado",
        emocional: s.padrao_emocional,
        espiritual: s.impacto_espiritual,
        eixos: todosEixos.filter(e => e.sistema === id).map(e => [e.eixo, e.praticas])
      };
    });
    if(doMotor.length) terrenoCache = saida;   // so guarda se veio do motor
    return saida;
  }

  function notasParaMotor(scores){
    const notas = {};
    sistemas.forEach((s, i) => { notas[CHAVE_MOTOR[s]] = scores[i]; });
    return notas;
  }

  function indiceDoMotor(scores){
    if(window.HOLOSCOPE && window.HOLOSCOPE.indiceDeNotas){
      try { return window.HOLOSCOPE.indiceDeNotas(notasParaMotor(scores)); }
      catch(e){ console.error("motor:", e); }
    }
    // sem o motor carregado, a conta antiga; vale para os pesos de hoje
    return Math.round(scores.reduce((a, b) => a + b, 0) * 2);
  }

  function combinacoesDoMotor(scores){
    if(!window.HOLOSCOPE || !window.HOLOSCOPE.combinacoesDeNotas) return [];
    try {
      return window.HOLOSCOPE.combinacoesDeNotas(notasParaMotor(scores));
    } catch(e){
      console.error("motor:", e);
      return [];
    }
  }


  /* ------------------------------------------------------------------------
     DO MAPA PARA A CONDUTA

     O mapa apontava o problema e parava ali. A direcao terapeutica nomeava os
     eixos, mas nao dizia qual das 30 ferramentas aplicar — a nutricionista
     saia da tela sabendo o que esta errado e sem saber o que fazer amanha.

     Cada sistema aponta as ferramentas cujo trabalho responde ao padrao
     emocional dele. Compulsao por doce, por exemplo, responde a gatilho: por
     isso o Fungico manda para Gatilhos & Respostas, e nao para uma ferramenta
     de alimentacao.

     ATENCAO: este roteamento e leitura minha, do mesmo tipo que a de sistema
     para eixo terapeutico. Precisa da revisao do Rodrigo antes de ir a
     paciente — quem decide qual ferramenta atende qual sistema e ele.
     --------------------------------------------------------------------- */

  /* ------------------------------------------------------------------------
     AUDITORIA DOS DESEMPATES

     Duas escolhas do sistema sempre foram resolvidas em silencio, pela ordem
     em que as coisas aparecem num array:

       1. dois sistemas com a MESMA nota — qual e "o pior";
       2. duas regras com a MESMA prioridade — qual entra na conduta.

     Nesta rodada NENHUMA das duas mudou de comportamento. O que mudou e que
     elas deixam rastro: quando ha empate, fica registrado quem empatou, quem
     venceu e por que regra tecnica. Isso nao e criterio clinico — e a ordem de
     declaracao, e esta marcada como decisao_implementacao, pendente.
     ---------------------------------------------------------------------- */

  const REGRA_DESEMPATE = {
    sistemas: "ordem de declaracao dos sistemas em app.js (Array.sort estavel)",
    regras: "ordem de declaracao das regras em corpo-bancos.js (Array.sort estavel)",
    procedencia: "decisao_implementacao",
    status: "pendente — nenhum criterio clinico de desempate foi definido"
  };

  let auditoriaSelecao = { empate_sistemas: null, empate_regras: [], escolhidas: [] };

  /** O que o sistema decidiu por criterio tecnico nesta pontuacao. */
  window.auditoriaDaConduta = () => auditoriaSelecao;

  /** Registra empate entre sistemas, sem mudar quem venceu. */
  function anotarEmpateDeSistemas(ordem){
    auditoriaSelecao.empate_sistemas = null;
    if(ordem.length < 2) return;
    const nota = ordem[0].nota;
    const empatados = ordem.filter(s => s.nota === nota);
    if(empatados.length < 2) return;
    auditoriaSelecao.empate_sistemas = {
      nota,
      entre: empatados.map(s => s.chave),
      venceu: ordem[0].chave,
      regra: REGRA_DESEMPATE.sistemas,
      procedencia: REGRA_DESEMPATE.procedencia,
      status: REGRA_DESEMPATE.status
    };
  }

  /** Registra empate de prioridade entre as regras candidatas de um filtro. */
  function anotarEmpateDeRegras(candidatas, entraram){
    const porPrioridade = {};
    candidatas.forEach(r => {
      const p = r.priority || 99;
      (porPrioridade[p] = porPrioridade[p] || []).push(r.id);
    });
    Object.keys(porPrioridade).forEach(p => {
      if(porPrioridade[p].length < 2) return;
      auditoriaSelecao.empate_regras.push({
        prioridade: Number(p),
        entre: porPrioridade[p],
        venceu: porPrioridade[p].find(id => entraram.indexOf(id) >= 0) || null,
        regra: REGRA_DESEMPATE.regras,
        procedencia: REGRA_DESEMPATE.procedencia,
        status: REGRA_DESEMPATE.status
      });
    });
  }

  /* As regras de recomendação saíram daqui: viraram dado em corpo-bancos.js,
     com fonte e status em cada uma, como manda a Especificação Mestre §18 e a
     regra do projeto de não escrever método em JavaScript. */
  function regrasDeRecomendacao(){
    /* Revisao clinica do HOLOSCOPE (rodada de reorganizacao): "Por onde
       comecar" passou a usar regrasApresentaveis(), nao regrasAtivas().
       regrasAtivas() so tira o rascunho_nao_validado e deixava passar as
       REC-001..015 legado — que, alem de nao validadas pelo metodo, apontam
       recommended_tool_id para ferramentas que a revisao de Corpo/Mente/
       Espirito ja tirou da galeria (mapa_rotina, diario_corporal,
       gatilhos_respostas, etc.). Sem esse troca, "Por onde comecar" era uma
       porta dos fundos ativa reabrindo o que foi fechado de proposito.
       regrasApresentaveis() so deixa passar regra com status=confirmado —
       hoje, nenhuma. */
    const b = window.CorpoBancos;
    if(!b) return [];
    return b.regrasApresentaveis ? b.regrasApresentaveis() : [];
  }

  /* As cotas da conduta sairam daqui e viraram dado (SEL-001). Se o banco nao
     tiver carregado, nao ha conduta a montar — melhor nada do que numeros
     clinicos escritos em JavaScript. */
  function selecaoDaConduta(){
    return (window.CorpoBancos && window.CorpoBancos.SELECAO) || null;
  }

  /* O estado de Momentum mais recente do paciente, se houver uma aplicação da
     Linha do Momentum concluída. É a segunda porta de recomendação, e é o que
     alcança as sete ferramentas do Corpo que o mapa dos sistemas nunca citava. */
  function momentumAtual(){
    if(!window.Aplicacoes) return null;
    const u = window.Aplicacoes.ultima("linha_momentum");
    const c = u && u.resultado && u.resultado.estado_confirmado;
    return c ? c.id : null;
  }

  const NOME_FERRAMENTA = {
    pqq: "PQQ — Pra Que Que?",
    oq3: "OQ³ — O Que Quer · Precisa · Consegue",
    mapa: "Mapa do Propósito"
  };

  function nomeDaFerramenta(id){
    if(NOME_FERRAMENTA[id]) return NOME_FERRAMENTA[id];
    const lista = window.CATALOGO_FERRAMENTAS || [];
    const f = lista.find(x => x.id === id);
    return f ? f.titulo : id;
  }

  function moduloDaFerramenta(id){
    if(id === "pqq") return "Mente";
    if(id === "oq3") return "Corpo";
    if(id === "mapa") return "Espírito";
    const lista = window.CATALOGO_FERRAMENTAS || [];
    const f = lista.find(x => x.id === id);
    const nomes = { corpo: "Corpo", mente: "Mente", espirito: "Espírito" };
    return f ? nomes[f.modulo] : "";
  }

  /* Quantas ferramentas entram, e de onde, esta em SEL-001 — nao aqui. Os
     numeros (2 + 1 + 1, teto de 4) sao decisao de implementacao e ninguem os
     aprovou; a diferenca e que agora da para encontra-los, com procedencia e
     status, no mesmo lugar que as regras. */
  function montarConduta(criticos){
    const sel = selecaoDaConduta();
    auditoriaSelecao.empate_regras = [];
    auditoriaSelecao.escolhidas = [];
    if(!sel) return [];

    const regras = regrasDeRecomendacao();
    const escolhidas = [];
    const vistas = new Set();

    const pega = (filtro, quantas) => {
      /* sort estavel: prioridades iguais mantem a ordem de declaracao do
         banco. E o comportamento de sempre, agora anotado. */
      const candidatas = regras
        .filter(filtro)
        .sort((a, b) => (a.priority || 99) - (b.priority || 99));
      const entraram = [];
      for(const r of candidatas){
        if(escolhidas.length >= sel.maximo || vistas.has(r.recommended_tool_id)) continue;
        if(quantas-- <= 0) break;
        vistas.add(r.recommended_tool_id);
        entraram.push(r.id);
        escolhidas.push({ id: r.recommended_tool_id, porque: r.rationale, regra: r.id,
                          rascunho: r.status !== "confirmado" });
      }
      anotarEmpateDeRegras(candidatas, entraram);
    };

    const porSistema = (chave) => (r) =>
      r.condition && r.condition.tipo === "sistema" && r.condition.sistema === chave;

    if(criticos[0]) pega(porSistema(CHAVE_MOTOR[criticos[0].chave] || criticos[0].chave),
                         sel.do_pior_sistema);
    if(criticos[1]) pega(porSistema(CHAVE_MOTOR[criticos[1].chave] || criticos[1].chave),
                         sel.do_segundo_sistema);

    /* A vaga do Momentum esta declarada como vazia em SEL-001
       (do_momentum: null, momentum_aguarda_definicao: true). Ela NAO foi
       redistribuida para outra origem: fica sem produzir nada ate que o metodo
       diga qual ferramenta cada estado pede. O ramo continua escrito porque e
       por aqui que as regras voltam a entrar quando forem validadas. */
    if(sel.do_momentum){
      const estado = momentumAtual();
      if(estado) pega((r) => r.condition && r.condition.tipo === "momentum" &&
                             r.condition.estado === estado, sel.do_momentum);
    }

    auditoriaSelecao.escolhidas = escolhidas.map(c => c.regra);
    return escolhidas;
  }

  /* As regras que sustentam a conduta de hoje sao todas herdadas do projeto
     anterior, e nenhuma foi validada pelo metodo. A tela precisa dizer isso:
     sem essa linha, "Por onde comecar" se le como indicacao oficial. */
  function condutaValidada(conduta){
    const b = window.CorpoBancos;
    if(!b || !b.validada) return false;
    const porId = new Map((b.RECOMENDACOES || []).map(r => [r.id, r]));
    return conduta.every(c => b.validada(porId.get(c.regra)));
  }

  /* Revisao clinica do HOLOSCOPE: as 16 regras de combinacao (CMB-001..016)
     ficam fora da interface clinica e do relatorio nesta rodada inteira —
     inclusive a CMB-001, que tem status=confirmado no banco mas cujo texto
     ("Paciente vivendo em estado cronico de ameaca") ainda nao passou por
     revisao de tom/redacao com o Rodrigo. status no banco != homologacao
     clinica. PENDENTE RODRIGO: revisar tom da CMB-001 e decidir criterio de
     reexibicao regra a regra (nao construir toggle nem allow-list agora).
     O motor continua retornando as 16 (HOLOSCOPE.calcular(), CLI, testes) e
     combinacoes.csv continua com as 16 linhas — so a tela nunca mais le
     esta lista. */
  function cmbParaExibir(){
    return [];
  }
  window.cmbParaExibir = cmbParaExibir;

  function lerTerreno(scores, pronta){
    const caixa = $("#holo-leitura");
    if(!caixa) return;

    /* "Mapa calculado?" NAO se decide pelo valor das notas.

       A guarda antiga era `scores.every(s => s === 0)`, e confundia dois
       estados que nao tem nada a ver um com o outro:

         1. ninguem respondeu nada — nao ha mapa;
         2. o mapa foi calculado e os cinco sistemas deram 0.

       O segundo e um resultado legitimo, e e o pior quadro que o questionario
       consegue descrever: carga maxima em todos os marcadores. Era exatamente
       ele que ficava sem leitura do terreno — o caso mais grave possivel era o
       unico que a nutricionista abria e nao via nada.

       Quem sabe a diferenca e o motor, e ele ja dizia: `avaliavel` e true
       quando existe pelo menos um sistema com resposta, independente da nota.
       Zero nunca foi ausencia; ausencia e `respondidos === 0`.

       Sem Pontuacao — pontuando a mao, com as reguas — nao ha o que perguntar
       ao motor, e a leitura antiga continua valendo tal e qual: regua em zero e
       regua que ninguem tocou. Esse ramo NAO mudou. */
    const calculado = pronta ? pronta.avaliavel : !scores.every(s => s === 0);
    if(!calculado){ caixa.innerHTML = ""; return; }

    // as duas notas mais baixas: e por onde a conduta comeca
    const ordem = sistemas
      .map((s, i) => ({ chave: s, nota: scores[i], dado: terreno()[s] }))
      .sort((a, b) => a.nota - b.nota);
    /* Empate entre sistemas continua sendo resolvido pela ordem do array —
       exatamente como antes. A diferenca e que agora fica registrado. */
    anotarEmpateDeSistemas(ordem);
    const criticos = ordem.slice(0, 2);

    let html = '<h4 class="leitura-titulo">O terreno por tras do numero</h4>';
    html += '<div class="leitura-sistemas">';
    for(const c of criticos){
      /* A definicao vem primeiro: antes de dizer o padrao emocional, a tela
         diz o que o sistema e. Enquanto ela for rascunho, aparece marcada —
         quem le precisa saber que aquilo ainda nao passou pelo autor. */
      html += '<div class="leitura-sistema">'
            + '<div class="leitura-cabeca"><b>' + c.dado.nome + '</b>'
            + '<span class="leitura-nota">' + c.nota.toFixed(1) + '</span></div>'
            + (c.dado.definicao
                ? '<p class="leitura-definicao">' + c.dado.definicao
                  + (c.dado.rascunho ? '<i>definição em revisão</i>' : "") + '</p>'
                : "")
            + '<p><em>padrão emocional</em>' + c.dado.emocional + '</p>'
            /* O "impacto espiritual" de cada sistema NAO e mais exibido aqui.

               Os textos sao legado do material de 11/08 — "bloqueio no plexo
               solar", "queda de frequencia geral", "dessintonizacao do corpo
               como templo", "bloqueio do fluxo", "perda de vitalidade e
               clareza". Nenhum foi validado metodologicamente, e nesta tela
               eles apareciam ao lado da nota do sistema e do padrao emocional,
               isto e, no lugar onde se leem ACHADOS do paciente. Frequencia e
               grandeza fisica; plexo solar e estrutura nervosa. Linguagem
               simbolica naquele lugar e lida como mecanismo do corpo.

               NADA foi apagado: sistemas.csv continua inteiro, com a coluna, a
               fonte e o status de cada linha, e o dado continua chegando ate
               aqui em c.dado.espiritual. O que mudou e que a tela clinica ativa
               nao o apresenta enquanto o metodo nao disser o que ele e e onde
               deve aparecer. Religar e uma linha. */
            + '</div>';
    }
    html += '</div>';

    // junta os eixos dos dois sistemas, sem repetir
    const eixos = new Map();
    for(const c of criticos){
      for(const [nome, itens] of c.dado.eixos){
        const atual = eixos.get(nome) || new Set();
        itens.split(", ").forEach(i => atual.add(i));
        eixos.set(nome, atual);
      }
    }
    /* O QUE A COMBINACAO DIZ — vem do motor, nao daqui.

       Duas coisas mudaram de nome e de peso aqui, e as duas sao do metodo:

       1. "Leitura combinada" virou HIPOTESE. O metodo e explicito: o HOLOSCOPE
          nao interpreta sintoma como diagnostico definitivo. O que o
          cruzamento devolve e algo a investigar, e a tela passa a dizer o que
          conferir antes de concluir.

       2. Combinacao com tipo=encaminhar nao e leitura clinica: e o sistema
          reconhecendo que aquilo sai do escopo da nutricao. Vai em bloco
          proprio, na frente de tudo. */
    const combinadas = cmbParaExibir(pronta ? pronta.combinacoes : combinacoesDoMotor(scores));
    const encaminhar = combinadas.filter(c => c.tipo === "encaminhar");
    const hipoteses  = combinadas.filter(c => c.tipo !== "encaminhar");

    if(encaminhar.length > 0){
      html += '<h4 class="leitura-titulo alerta">Fora do escopo da nutrição</h4>'
            + '<div class="leitura-encaminhar">';
      for(const c of encaminhar){
        html += '<div class="leitura-item"><b>' + c.leitura + '</b>'
              + (c.investigar ? '<em>' + c.investigar + '</em>' : "")
              + '<span>' + c.id + ' &middot; ' + c.condicao + '</span></div>';
      }
      html += '</div>';
    }

    if(hipoteses.length > 0){
      html += '<h4 class="leitura-titulo">Hipótese a investigar</h4>'
            + '<div class="leitura-combinadas">';
      for(const c of hipoteses){
        html += '<div class="leitura-combinada"><b>' + c.leitura + '</b>'
              + (c.investigar
                  ? '<em class="leitura-investigar">Conferir antes de concluir: '
                    + c.investigar + '</em>'
                  : "")
              + '<span>' + c.id + ' &middot; ' + c.condicao + '</span></div>';
      }
      html += '</div>';
    }

    /* APROFUNDAR — o passo 4 do metodo.
       "O HOLOSCOPE nao e uma lista de perguntas": o que separa formulario de
       anamnese e a pergunta que vem DEPOIS da resposta alta. O motor devolve
       as que foram ganhas; se nenhum marcador tem a coluna preenchida, isto
       simplesmente nao aparece. */
    const aprofundar = pronta && pronta.aprofundamentos ? pronta.aprofundamentos : [];
    if(aprofundar.length > 0){
      html += '<h4 class="leitura-titulo">Para aprofundar na consulta</h4>'
            + '<p class="leitura-nota">Pelo que pesou mais. A resposta alta abre a '
            + 'pergunta seguinte — é onde o mapa vira conversa.</p>'
            + '<ol class="leitura-aprofundar">';
      for(const a of aprofundar){
        html += '<li><span class="apro-de">' + a.rotulo + '</span>'
              + '<b>' + a.pergunta + '</b></li>';
      }
      html += '</ol>';
    }

    html += '<h4 class="leitura-titulo">Direcao terapeutica</h4><div class="leitura-eixos">';
    for(const [nome, itens] of eixos){
      html += '<div class="leitura-eixo"><b>' + nome + '</b><span>'
            + Array.from(itens).join(" &middot; ") + '</span></div>';
    }
    html += '</div>';

    // POR ONDE COMECAR: as ferramentas, com botao que abre cada uma
    const conduta = montarConduta(criticos);
    if(conduta.length > 0){
      html += '<h4 class="leitura-titulo">Por onde começar</h4>';
      if(!condutaValidada(conduta)){
        html += '<p class="leitura-aviso">Sugestões herdadas da versão anterior do '
              + 'app. Nenhuma foi validada pelo método — a escolha é sua.</p>';
      }
      html += '<div class="leitura-conduta">';
      for(const c of conduta){
        html += '<button type="button" class="conduta-item" data-abrir="' + c.id + '">'
              + '<span class="conduta-modulo">' + moduloDaFerramenta(c.id) + "</span>"
              + "<b>" + nomeDaFerramenta(c.id) + "</b>"
              + "<span class=\"conduta-porque\">" + c.porque + "</span>"
              + '<span class="conduta-abrir">abrir &rarr;</span></button>';
      }
      html += "</div>";
    } else {
      /* Revisao clinica do HOLOSCOPE: regrasApresentaveis() so deixa passar
         regra com status=confirmado (hoje, nenhuma), entao "Por onde
         comecar" fica sem itens. Sem esta linha a secao simplesmente
         sumiria, sem dizer por que — e a nutricionista precisa saber que a
         ausencia e decisao, nao bug. */
      html += '<h4 class="leitura-titulo">Por onde começar</h4>'
            + '<p class="leitura-aviso">As sugestões de ferramenta herdadas do app '
            + 'anterior estão desativadas até serem validadas pelo método. A escolha '
            + 'da conduta é da nutricionista.</p>';
    }

    caixa.innerHTML = html;

    caixa.querySelectorAll("[data-abrir]").forEach(b => {
      b.addEventListener("click", () => {
        if(window.abrirFerramentaPorId) window.abrirFerramentaPorId(b.dataset.abrir);
      });
    });
  }


  /* ------------------------------------------------------------------------
     A PONTE ENTRE O MOTOR E A TELA

     Recebe a Pontuacao inteira que HOLOSCOPE.calcular() devolveu e desenha.
     Nada aqui recalcula nada: as notas, o indice, as combinacoes e a Triada
     ja vem prontos. Se esta funcao fizer conta, a conta existe em dois
     lugares e vai divergir — foi o que aconteceu com a escala invertida.

     As reguas deixam de ser entrada e passam a mostrar o que foi calculado.
     Elas so andam de 1 em 1, e as notas tem decimal, entao o numero exato
     aparece ao lado; a regua e so o desenho.
     --------------------------------------------------------------------- */

  const ORDEM_MOTOR = ["fungico","acido_inflamatorio","metabolico",
                       "detox_linfatico","mental_emocional_espiritual"];

  /* A Pontuacao fica guardada por paciente: o relatorio e a aba de exames sao
     montados a partir dela, e ela precisa sobreviver a fechar o navegador.
     Mesma caixa das demais coisas — troca para o Supabase junto com o resto. */
  /* Guarda o HISTORICO, nao a ultima. Sobrescrever apagava a aplicacao
     anterior — e sem duas nao ha o que comparar, que e a promessa de rastrear
     evolucao em 4, 8 e 12 semanas. */
  function lerHistorico(){
    let tudo;
    try { tudo = JSON.parse(localStorage.getItem("holohacking.pontuacao")) || {}; }
    catch(e){ return {}; }
    // formato antigo guardava um objeto so; vira lista de um item
    Object.keys(tudo).forEach(id => {
      if(tudo[id] && !Array.isArray(tudo[id])) tudo[id] = [tudo[id]];
    });
    return tudo;
  }

  function guardarPontuacao(r){
    const id = (window.pacienteAtivoId && window.pacienteAtivoId()) || "_sem_paciente";
    const tudo = lerHistorico();
    const hoje = hojeISO();
    // versao_estrutura marca snapshots desta rodada (revisao clinica do
    // HOLOSCOPE) sem tocar nos antigos — nada le esse campo ainda, existe
    // so para uma migracao futura saber distinguir os dois formatos.
    const nova = Object.assign({}, r, { quando: hoje, versao_estrutura: 2 });
    if(!tudo[id]) tudo[id] = [];
    // reaplicar no mesmo dia substitui, em vez de criar duas do mesmo dia
    const mesmoDia = tudo[id].findIndex(x => x.quando === hoje);
    if(mesmoDia >= 0){
      // Interpretacao profissional e escrita por fora, num campo separado
      // do resultado calculado. Reaplicar o HOLOSCOPE no mesmo dia
      // sobrescrevia a entrada inteira (Object.assign de cima) e apagava
      // essa interpretacao sem ninguem pedir. Ela sobrevive a troca.
      if(nova.interpretacao === undefined && tudo[id][mesmoDia].interpretacao !== undefined){
        nova.interpretacao = tudo[id][mesmoDia].interpretacao;
      }
      tudo[id][mesmoDia] = nova;
    } else {
      tudo[id].push(nova);
    }
    tudo[id].sort((a, b) => (a.quando || "").localeCompare(b.quando || ""));
    localStorage.setItem("holohacking.pontuacao", JSON.stringify(tudo));
    if (window.Concorrencia) window.Concorrencia.avancarRevisao("pontuacao");
  }

  /** Todas as aplicacoes de um paciente, da mais antiga para a mais nova. */
  window.historicoPontuacao = function(id){
    const pid = id || (window.pacienteAtivoId && window.pacienteAtivoId()) || "_sem_paciente";
    return lerHistorico()[pid] || [];
  };

  /* ------------------------------------------------------------------------
     INTERPRETACAO PROFISSIONAL — campo opcional no proprio snapshot

     Reaproveita a estrutura que ja existe (o snapshot de Pontuacao dentro de
     holohacking.pontuacao) em vez de criar um armazenamento novo fora do
     manifesto: essa tabela ja e exportar:true/excluirComPaciente:true no
     Storage Manifest, entao Backup V2 e exclusao de paciente cobrem o campo
     novo automaticamente, sem precisar tocar em armazenamento.js.

     NAO cria um snapshot so para guardar o texto: se nao existir aplicacao
     do dia, nao ha onde prender a interpretacao, e a funcao recusa. */
  window.guardarInterpretacao = function(texto, quando){
    const id = (window.pacienteAtivoId && window.pacienteAtivoId()) || "_sem_paciente";
    const tudo = lerHistorico();
    const dia = quando || hojeISO();
    const lista = tudo[id] || [];
    const alvo = quando ? lista.find(x => x.quando === dia) : lista[lista.length - 1];
    if(!alvo) return false;
    alvo.interpretacao = { texto: String(texto || ""), quando_escrita: hojeISO(), versao: 1 };
    localStorage.setItem("holohacking.pontuacao", JSON.stringify(tudo));
    if (window.Concorrencia) window.Concorrencia.avancarRevisao("pontuacao");
    return true;
  };

  /** A interpretacao da aplicacao pedida, ou da mais recente se `quando`
      nao for informado. null quando nao ha nenhuma escrita ainda. */
  window.interpretacaoDe = function(quando, id){
    const pid = id || (window.pacienteAtivoId && window.pacienteAtivoId()) || "_sem_paciente";
    const lista = window.historicoPontuacao(pid);
    if(!lista.length) return null;
    const alvo = quando ? lista.find(x => x.quando === quando) : lista[lista.length - 1];
    return (alvo && alvo.interpretacao) || null;
  };
  window.ultimaPontuacao = function(id){
    const h = window.historicoPontuacao(id);
    return h.length ? h[h.length - 1] : null;
  };

  /* Duas funcoes, de proposito:
       aplicarPontuacao  guarda no historico E desenha  (uso normal)
       desenharPontuacao so desenha                      (rever uma anterior)
     Sem essa separacao, olhar a primeira aplicacao a regravaria com a data de
     hoje e destruiria o proprio historico que se queria comparar. */
  window.aplicarPontuacao = function(r){
    guardarPontuacao(r);
    window.desenharPontuacao(r);
  };

  window.desenharPontuacao = function(r, restaurando){
    pontuacaoNaTela = r;        // e daqui que "Salvar HOLOSCOPE" tira os decimais
    // as notas na ordem que a tela usa
    const porSistema = {};
    r.sistemas.forEach(s => { porSistema[s.sistema] = s.nota; });
    const notas = ORDEM_MOTOR.map(id => porSistema[id] ?? 0);

    // Sistema que nao recebeu nenhuma resposta nao tem nota — e a tela diz
    // isso com um traco. Mostrar o 10 que a conta devolve seria anunciar
    // equilibrio onde so ha ausencia de dado.
    const semDado = {};
    r.sistemas.forEach(s => { if(!s.avaliavel) semDado[s.sistema] = true; });

    sistemas.forEach((s, i) => {
      const el = $("#holo-" + s);
      const vazio = semDado[ORDEM_MOTOR[i]];
      el.value = Math.round(notas[i]);
      el.disabled = true;                       // virou resultado, nao entrada
      el.closest(".holo-card").classList.add("calculado");
      el.closest(".holo-card").classList.toggle("sem-dado", !!vazio);
      $("#val-" + s).textContent = vazio ? "—" : notas[i].toFixed(1);
    });

    updateRadar(notas, r);                      // desenha com o decimal, nao com o arredondado
    desenharPrioridades(r);
    desenharDominantes(r);
    desenharTriada(r.triada, r.triada_com_dado);
    desenharFrequencias(r.frequencias);
    desenharTerritorios(r.territorios);
    if(window.desenharHoloscan) window.desenharHoloscan("holo-holoscan");
    if(window.redesenharEvolucao) window.redesenharEvolucao();

    $("#holo-score-total").textContent = r.indice;

    const faltando = r.sistemas.filter(s => !s.avaliavel).map(s => s.nome);
    /* `cobertura` pode faltar num snapshot guardado antes de o motor ter esse
       campo — o mesmo motivo pelo qual s.respondidos ja era tratado com
       cuidado logo abaixo, em desenharPrioridades(). Sem a defesa, abrir um
       mapa antigo quebrava esta funcao inteira num TypeError, e com ela a
       Triada, o Holoscan e a evolucao, que sao desenhados nas linhas acima.
       Ausencia e dita, nao preenchida: nao ha como recalcular cobertura sem
       as respostas daquele dia, e elas nao ficaram guardadas. */
    const cob = r.cobertura;
    const temContagem = cob && typeof cob.respondidos === "number"
                            && typeof cob.total === "number";
    const temPercentual = cob && typeof cob.percentual === "number";
    $("#holo-origem").innerHTML =
      (temContagem
        ? "Calculado a partir de <b>" + cob.respondidos + "</b> de "
          + cob.total + " respostas"
        : '<span class="holo-sem-dado">Este mapa não registrou a cobertura do '
          + "questionário.</span>")
      + (temPercentual && cob.percentual < 100
          ? ' &middot; <b class="holo-parcial">questionário incompleto ('
            + cob.percentual + '%)</b>'
          : "")
      + ' &middot; <button type="button" class="btn-relink" id="btn-repontuar">pontuar à mão</button>'
      + (faltando.length
          ? '<span class="holo-sem-dado">Sem resposta nenhuma em: ' + faltando.join(", ")
            + '. Estes sistemas ficaram fora do Índice.</span>'
          : "");

    const rel = $("#btn-repontuar");
    if(rel) rel.addEventListener("click", () => {
      pontuacaoNaTela = null;   // a partir daqui quem manda e a regua
      sistemas.forEach(s => {
        const el = $("#holo-" + s);
        el.disabled = false;
        el.closest(".holo-card").classList.remove("calculado");
        $("#val-" + s).textContent = el.value;
      });
      $("#holo-origem").textContent = "";
      desenharPrioridades(null);
      desenharDominantes(null);
      desenharTriada(null);   // pontuando a mao nao ha Triada: ela vem das respostas
      desenharFrequencias(null);
      desenharTerritorios(null);
      updateRadar(sistemas.map(s => parseInt($("#holo-" + s).value) || 0));
    });

    // Acabou de calcular: o questionario fecha, o mapa e o que importa agora.
    // Restaurando o mapa de outro paciente, nao — quem estava no meio do
    // questionario continua nele, agora com as perguntas do novo paciente.
    if(restaurando) return;
    const q = document.getElementById("holoscope-questionario");
    const m = document.getElementById("holoscope-manual");
    if(q && m){ q.classList.add("hidden"); m.classList.remove("hidden"); }
  };


  /* ------------------------------------------------------------------------
     TRIADA HOLOS — fisico, mental, espiritual

     "Integração físico-mental-espiritual em um único grafico", uma das cinco
     subferramentas do material. O motor ja calculava e a tela nunca mostrou.

     Vem da ORIGEM do marcador, nao das notas dos cinco sistemas: sintoma conta
     para fisico, emocao para mental, espiritual para espiritual. Por isso so
     existe com o questionario respondido — pontuando a mao nao ha como saber.

     Tres eixos, entao o grafico e um triangulo. E a forma da marca.
     --------------------------------------------------------------------- */

  const EIXOS_TRIADA = [
    ["fisico", "Físico", "o que o corpo mostra"],
    ["mental", "Mental", "o que a emoção mostra"],
    ["espiritual", "Espiritual", "o que o propósito mostra"]
  ];

  function pontoTriada(cx, cy, raio, valor, i){
    const ang = -Math.PI / 2 + i * 2 * Math.PI / 3;
    const r = raio * (valor / 10);
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  }

  /* A formula da Triada devolve 10 para um eixo sem NENHUMA resposta — nota
     maxima por ausencia de dado. A conta nao muda aqui (nem deve: e a mesma
     que alimenta triada.* nas combinacoes). O que muda e a tela: eixo sem
     dado mostra tracinho, nao 10, nao entra no desenho da area e nao pode
     ser eleito como a dimensao mais baixa.

     Ausencia tambem NAO virou zero: nao ha nota nenhuma atribuida. */
  /* ------------------------------------------------------------------------
     MAPA DE PRIORIDADES e SINAIS DOMINANTES — revisao clinica do HOLOSCOPE

     Duas telas novas, dado nenhum novo: "prioridades" e so os cinco sistemas
     reordenados do mais carregado para o mais leve (a mesma ordem que
     lerTerreno() e o relatorio ja usam para escolher os "criticos"), e
     "dominantes" e o campo NotaSistema.dominantes que o motor ja calcula
     (top-5 marcadores por pontos, por sistema) e que nenhuma tela desenhava.
     So aparecem com Pontuacao calculada via questionario — pontuando a mao
     nao ha cobertura nem marcador nenhum para mostrar, exatamente como a
     Triade ja se comporta. */
  function desenharPrioridades(r){
    const caixa = $("#holo-prioridades");
    if(!caixa) return;
    if(!r){ caixa.innerHTML = ""; return; }
    const ordenado = r.sistemas.slice().sort((a, b) => a.nota - b.nota);
    const linhas = ordenado.map(s => {
      const semDado = s.avaliavel === false;
      // s.respondidos/total_marcadores podem faltar num snapshot bem antigo,
      // salvo antes desses campos existirem no motor — nao inventa numero.
      const temContagem = typeof s.respondidos === "number" && typeof s.total_marcadores === "number";
      const cobertura = semDado
        ? "nenhuma pergunta respondida"
        : temContagem ? s.respondidos + " de " + s.total_marcadores + " respondidas" : "";
      const conta = [cobertura, s.faixa ? "faixa " + s.faixa : ""].filter(Boolean).join(" &middot; ");
      // Classes proprias (prio-*), NAO terr-*: territorios (#holo-territorios)
      // ja usa .terr-linha para outra lista, e testar-raciocinio.mjs conta
      // .terr-linha esperando achar so as dele. Reaproveitar o nome de
      // classe misturava as duas listas na mesma consulta.
      return '<li class="prio-linha' + (semDado ? " sem-dado" : "") + '">'
           + '<span class="prio-nome">' + s.nome
             + '<i>Área do mapa. Investigar com mais profundidade na consulta.</i></span>'
           + '<span class="prio-conta">' + conta + '</span>'
           + '<span class="prio-nota">' + (semDado ? "—" : s.nota.toFixed(1)) + '</span>'
           + '</li>';
    }).join("");
    caixa.innerHTML = '<ul class="prio-lista">' + linhas + '</ul>';
  }

  function desenharDominantes(r){
    const caixa = $("#holo-dominantes");
    if(!caixa) return;
    if(!r){ caixa.classList.add("hidden"); caixa.innerHTML = ""; return; }
    const comSinais = r.sistemas.filter(s => s.dominantes && s.dominantes.length > 0);
    if(comSinais.length === 0){ caixa.classList.add("hidden"); caixa.innerHTML = ""; return; }
    const blocos = comSinais.map(s => {
      const itens = s.dominantes.map(d => "<li>" + (d.rotulo || d.marcador_id) + "</li>").join("");
      return '<div class="holo-dominante-sistema"><h5>' + s.nome + '</h5>'
           + '<ul class="holo-dominante-lista">' + itens + '</ul></div>';
    }).join("");
    caixa.innerHTML =
      '<div class="terr-cabeca"><span class="eyebrow">Os sinais que mais pesaram</span>'
      + "<p>Os sinais que mais pesaram nas respostas de cada sistema — é a "
      + "aritmética das respostas, não um achado novo.</p></div>" + blocos;
    caixa.classList.remove("hidden");
  }

  function desenharTriada(triada, comDado){
    const caixa = $("#holo-triada");
    if(!caixa) return;
    if(!triada){ caixa.classList.add("hidden"); caixa.innerHTML = ""; return; }

    const L = 260, C = L / 2, R = 88;
    const temDado = (i) => !comDado || comDado[EIXOS_TRIADA[i][0]] !== false;
    const todosComDado = [0,1,2].every(temDado);
    const valores = EIXOS_TRIADA.map(e => triada[e[0]] ?? 0);

    // moldura: triangulos concentricos em 1/4, 1/2, 3/4 e cheio
    let svg = "";
    for(const f of [0.25, 0.5, 0.75, 1]){
      const p = [0,1,2].map(i => pontoTriada(C, C, R * f, 10, i).map(n => n.toFixed(1)).join(",")).join(" ");
      svg += '<polygon points="' + p + '" fill="none" stroke="rgba(201,163,90,'
           + (f === 1 ? ".26" : ".12") + ')" stroke-width="1"/>';
    }
    for(let i = 0; i < 3; i++){
      const [x, y] = pontoTriada(C, C, R, 10, i);
      svg += '<line x1="' + C + '" y1="' + C + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1)
           + '" stroke="rgba(201,163,90,.14)" stroke-width="1"/>';
    }

    /* Um triangulo precisa de tres vertices. Faltando um eixo, qualquer
       poligono desenhado seria uma afirmacao sobre dado que nao existe —
       entao a area nao e desenhada, e so a moldura fica. Os pontos dos eixos
       que TEM dado continuam marcados. */
    if(todosComDado){
      const area = valores.map((v, i) => pontoTriada(C, C, R, v, i).map(n => n.toFixed(1)).join(",")).join(" ");
      svg += '<polygon points="' + area + '" fill="rgba(201,163,90,.2)" '
           + 'stroke="var(--dourado)" stroke-width="2" stroke-linejoin="round"/>';
    }
    valores.forEach((v, i) => {
      if(!temDado(i)) return;
      const [x, y] = pontoTriada(C, C, R, v, i);
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="var(--dourado)"/>';
    });
    for(let i = 0; i < 3; i++){
      const [x, y] = pontoTriada(C, C, R + 22, 10, i);
      svg += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" '
           + 'fill="var(--dourado)" font-size="10" font-weight="600" letter-spacing="1.4">'
           + EIXOS_TRIADA[i][1].toUpperCase() + "</text>";
    }

    /* O eixo mais baixo so pode sair de quem tem dado. Sem isso, um eixo em
       branco (que a formula devolve como 10) nunca seria o menor — mas um
       eixo em branco tambem nao pode competir. */
    let menor = -1;
    [0,1,2].forEach(i => {
      if(!temDado(i)) return;
      if(menor < 0 || valores[i] < valores[menor]) menor = i;
    });

    caixa.innerHTML =
      '<h4 class="leitura-titulo">Triada HOLOS</h4>'
      + '<div class="triada-corpo">'
      +   '<svg viewBox="0 0 ' + L + ' ' + L + '" width="' + L + '" height="' + L + '" '
      +   'class="triada-grafico" aria-hidden="true">' + svg + "</svg>"
      +   '<div class="triada-eixos">'
      +     EIXOS_TRIADA.map((e, i) =>
            '<div class="triada-eixo' + (i === menor ? " menor" : "")
              + (temDado(i) ? "" : " sem-dado") + '">'
            + '<span class="triada-nota">'
            + (temDado(i) ? valores[i].toFixed(1) : "—") + "</span>"
            + "<b>" + e[1] + "</b><span class=\"triada-sub\">"
            + (temDado(i) ? e[2] : "sem resposta") + "</span></div>").join("")
      /* A frase dizia: "Dimensao mais baixa: X. E por onde a conduta comeca."
         A segunda metade transformava uma nota em prescricao, e nao tem
         procedencia: nada no metodo diz que a dimensao mais baixa da Triade e
         por onde comecar. Saiu so ela. A Triade continua identificando e
         destacando a menor — isso e descricao, e e o que o grafico ja faz. */
      +     (menor >= 0
              ? '<p class="triada-leitura">Dimensão mais baixa: <b>'
                + EIXOS_TRIADA[menor][1] + "</b>.</p>"
              : "")
      +     (todosComDado
              ? ""
              : '<p class="triada-leitura sem-dado">Eixo sem resposta não recebe '
                + "nota: o desenho só é fechado com os três.</p>")
      +   "</div>"
      + "</div>";
    caixa.classList.remove("hidden");
  }

  /* Este paciente ja tem um HOLOSCOPE gravado?
     A ficha vazia vem de vazioHolo(), que nao tem id; a linha que veio do
     banco tem. E o que separa "nota zero" de "mapa nenhum". */
  function temMapaSalvo(){
    const p = pacienteAtivo();
    return !!(p && p.holoscope && p.holoscope.id);
  }

  function carregarHoloscope(){
    const p = pacienteAtivo();
    const h = p ? p.holoscope : vazioHolo();
    pontuacaoNaTela = null;                 // trocou de paciente, trocou o mapa

    /* Tudo o que a tela mostrava pertencia ao paciente anterior. A Triada e a
       linha de origem nao eram apagadas aqui: abrir a Carla logo depois da
       Marina mostrava a Triada da Marina, com o nome da Carla no seletor.
       Numa ferramenta clinica isso nao e um detalhe de interface. */
    desenharTriada(null);
    desenharFrequencias(null);
    desenharTerritorios(null);
    const origem = $("#holo-origem");
    if(origem) origem.innerHTML = "";

    // a evolucao e por paciente: quem nao tem duas aplicacoes nao mostra nada
    if(window.redesenharEvolucao) window.redesenharEvolucao();

    /* O mapa que este paciente realmente tem.

       Havia dois lugares guardando a mesma coisa: o historico de pontuacao,
       gravado sozinho quando o questionario e aplicado, e a linha `holoscope`,
       gravada so quando alguem aperta "Salvar HOLOSCOPE". Esta tela lia a
       segunda e a ficha lia a primeira — entao aplicar o questionario, trocar
       de paciente e voltar deixava a ficha dizendo "Indice 43" e o HOLOSCOPE
       dizendo que nao havia mapa. O historico e mais rico (tem os decimais, a
       Triada e as combinacoes), entao e ele que manda. */
    const ultima = p && window.ultimaPontuacao ? window.ultimaPontuacao(p.id) : null;
    if(ultima){ window.desenharPontuacao(ultima, true); return; }

    const ids = ["holo-fungico","holo-inflamatorio","holo-metabolico","holo-detox","holo-mental"];
    const vals = [h.sistema_fungico||0, h.sistema_acido_inflamatorio||0, h.sistema_metabolico||0, h.sistema_detox_linfatico||0, h.sistema_mental_emocional||0];
    ids.forEach((id, i) => {
      const el = $("#" + id);
      // a regua anda de um em um; o numero ao lado guarda o decimal que veio
      // do motor, senao 6,7 vira 7 so por ter passado por aqui
      el.value = Math.round(vals[i]);
      // depois de um calculo as reguas ficam travadas. Sem destravar aqui, o
      // paciente seguinte nao podia ser pontuado a mao.
      el.disabled = false;
      el.closest(".holo-card").classList.remove("calculado", "sem-dado");
      $("#val-" + sistemas[i]).textContent = Number.isInteger(vals[i])
        ? String(vals[i]) : vals[i].toFixed(1);
    });
    updateRadar(vals);
  }

  sistemas.forEach((s, i) => {
    const input = $("#holo-" + s);
    const valEl = $("#val-" + s);
    input.addEventListener("input", () => {
      pontuacaoNaTela = null;   // mexeu na regua, o mapa nao e mais o do motor
      valEl.textContent = input.value;
      const scores = sistemas.map(s2 => parseInt($("#holo-" + s2).value) || 0);
      updateRadar(scores);
    });
  });

  $("#btn-salvar-holoscope").addEventListener("click", async () => {
    const p = pacienteAtivo();
    if(!p){ toast("Selecione um paciente para salvar o HOLOSCOPE."); return; }

    /* Duas coisas que estavam erradas aqui, e as duas apareciam juntas:

       1. o total era "soma das reguas x 2", escrito a mao. Com as notas
          6,7 / 6,7 / 0,8 / 6,7 / 0,7 a tela mostrava Indice 43 e o toast
          dizia "Score: 46" — porque a regua arredonda antes de somar. Duas
          contas para o mesmo numero sempre terminam assim. O motor expoe
          indiceDeNotas() justamente para nao existir uma segunda.

       2. o que ia para a ficha eram as reguas arredondadas, entao reabrir
          um mapa salvo devolvia 7 onde o motor tinha calculado 6,7. */
    const scores = pontuacaoNaTela
      ? ORDEM_MOTOR.map(id => {
          const s = pontuacaoNaTela.sistemas.find(x => x.sistema === id);
          return s ? s.nota : 0;
        })
      : sistemas.map(s => parseInt($("#holo-" + s).value) || 0);

    const total = pontuacaoNaTela ? pontuacaoNaTela.indice : indiceDoMotor(scores);

    const dados = {
      paciente_id: p.id,
      sistema_fungico: scores[0],
      sistema_acido_inflamatorio: scores[1],
      sistema_metabolico: scores[2],
      sistema_detox_linfatico: scores[3],
      sistema_mental_emocional: scores[4],
      score_holos: total
    };

    const { data, error } = await sb.from("holoscope").insert(dados).select().single();
    if(error){ toast("Erro ao salvar HOLOSCOPE."); return; }

    p.holoscope = data;
    renderPacientes();
    toast("HOLOSCOPE salvo na ficha de " + p.nome.split(" ")[0] + ". Score: " + total);
  });

  $("#btn-limpar-holoscope").addEventListener("click", () => {
    sistemas.forEach(s => {
      $("#holo-" + s).value = 0;
      $("#val-" + s).textContent = "0";
    });
    updateRadar([0,0,0,0,0]);
    toast("HOLOSCOPE limpo.");
  });

  /* ---------- inicializacao ---------- */
  initRadar();
  updateRadar([0,0,0,0,0]);
  renderPacientes();
  carregarFormularios();
  /* p.oq3 deixou de sair da tabela `oq3` e passa a sair do historico. Este
     gancho roda depois que aplicacoes.js carrega e migra — e e por isso que a
     ficha, o painel e o Mapa do Proposito continuam funcionando sem saber de
     nada disso. */
  {
    const anteriorOQ3 = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function(){
      if(typeof anteriorOQ3 === "function") anteriorOQ3();
      sincronizarOQ3();
      sincronizarPQQ();
      const vista = document.getElementById("vista-oq3");
      if(vista && !vista.classList.contains("hidden")) abrirAplicacaoOQ3();
      const vistaPQQ = document.getElementById("vista-pqq");
      if(vistaPQQ && !vistaPQQ.classList.contains("hidden")) abrirAplicacaoPQQ();
    };
  }

  /* carregarTudo() nao pode rodar antes de se saber se ha sessao Supabase:
     era exatamente essa corrida que fazia o paciente cadastrado sumir apos
     o refresh — carregava do DadosLocais vazio (window.HoloAuth ainda nem
     existia: login.js so carrega DEPOIS de app.js no index.html) e nada
     mandava recarregar quando a sessao real chegava um instante depois.

     DOMContentLoaded garante que login.js — o ultimo <script> — ja rodou e
     definiu window.HoloAuth. aoMudarEstado() cobre os dois casos com o
     mesmo gancho: se o estado ja saiu de "pendente" nesse momento, avisa na
     hora; se nao, avisa assim que sair. E dispara de novo a cada mudanca
     real depois (login pela tela, logout) — e por isso que a carteira, o
     dashboard e a ficha (via avisarTrocaDePaciente, ja chamado no fim de
     carregarTudo) se atualizam sozinhos quando a sessao muda, sem precisar
     de refresh manual. */
  document.addEventListener("DOMContentLoaded", function () {
    if (window.HoloAuth && window.HoloAuth.aoMudarEstado) {
      window.HoloAuth.aoMudarEstado(function (estado) {
        if (estado !== "pendente") carregarTudo();
      });
    } else {
      carregarTudo();
    }
  });

})();
