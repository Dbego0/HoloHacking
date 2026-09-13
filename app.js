
(function(){
  "use strict";

  /* De onde vem e para onde vai todo dado de paciente.
     Ver dados.js: hoje e o navegador, e a troca por Supabase e esta linha.

     Ate 13/09 aqui havia um cliente Supabase real, apontando para o projeto
     sywlqaxnceojkhfrprfy com a chave anonima escrita no arquivo. O app nao
     abria sem rede, cada rodada de teste cadastrava paciente num banco de
     verdade, e o projeto continuava de pe sem ninguem ter decidido isso. As
     linhas que ja estao la continuam la — nada foi apagado. */
  const sb = window.DadosLocais;

  const estado = { pacientes: [], ativo: null, carregado: false };

  /* A pontuacao que esta na tela agora, quando ela veio do questionario.
     Null quando a nutricionista esta pontuando a mao — e a diferenca importa
     na hora de salvar: do questionario vem 6,7, da regua vem 7. */
  let pontuacaoNaTela = null;

  const vazioOQ3 = () => ({ data_consulta:"", quer:"", precisa:"", consegue:"", alavancas:"" });
  const vazioPQQ = () => ({ objetivo:"", r1:"", r2:"", r3:"", r4:"", r5:"", verdadeiro:"" });
  const vazioHolo = () => ({ sistema_fungico:0, sistema_acido_inflamatorio:0, sistema_metabolico:0, sistema_detox_linfatico:0, sistema_mental_emocional:0, score_holos:0 });

  function pacienteAtivo(){ return estado.pacientes.find(p => p.id === estado.ativo) || null; }
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

  /* ---------- modo escuro ---------- */
  const btnTema = $("#btn-tema");
  function aplicarTema(escuro){
    document.body.classList.toggle("escuro", escuro);
    btnTema.setAttribute("aria-pressed", escuro ? "true" : "false");
  }
  aplicarTema(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  btnTema.addEventListener("click", () => {
    const escuro = !document.body.classList.contains("escuro");
    aplicarTema(escuro);
    toast(escuro ? "Modo escuro ativado." : "Modo claro ativado.");
  });

  /* ---------- navegacao ---------- */
  const nomesSecao = {
    dashboard:"Dashboard", holoscope:"HOLOSCOPE", pacientes:"Pacientes",
    corpo:"Módulo Corpo", mente:"Módulo Mente", espirito:"Módulo Espírito"
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
      contador.innerHTML = termo ? "<b>" + visiveis + "</b> de 10" : "<b>10</b> ferramentas";
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
  $$("[data-ir]").forEach(c => c.addEventListener("click", () => irPara(c.dataset.ir)));

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

  function renderPacientes(){
    const termo = semAcento($("#busca-pacientes").value.trim());
    const lista = $("#lista-pacientes");
    const filtrados = estado.pacientes.filter(p =>
      !termo || semAcento(p.nome + " " + (p.queixa || "")).includes(termo)
    );
    $("#nav-total-pac").textContent = estado.pacientes.length;

    if(!estado.pacientes.length){
      lista.innerHTML = '<div class="lista-vazia"><strong>Nenhum paciente cadastrado</strong><span>Cadastre a primeira pessoa para comecar.</span></div>';
    } else if(!filtrados.length){
      lista.innerHTML = '<div class="lista-vazia"><strong>Nenhum paciente encontrado</strong><span>Tente outro termo de busca.</span></div>';
    } else {
      lista.innerHTML = filtrados.map(p => {
        const partes = [idade(p.nascimento), p.contato].filter(Boolean);
        return '<div class="card-paciente'+(p.id===estado.ativo?' ativo':'')+'" data-id="'+p.id+'">'
          + '<span class="pac-avatar">'+p.nome.charAt(0).toUpperCase()+'</span>'
          + '<span class="pac-info"><h4>'+p.nome+'</h4>'
          + '<div class="pac-meta">'+(partes.join(" - ") || "Sem dados adicionais")+'</div>'
          + '<div class="pac-selos">'
          + '<span class="selo'+(temConteudo(p.oq3)?" feito":"")+'">OQ3</span>'
          + '<span class="selo'+(temConteudo(p.pqq)?" feito":"")+'">PQQ</span>'
          + '<span class="selo'+(p.holoscope.score_holos > 0?" feito":"")+'">HOLO</span>'
          + '</div></span>'
          + '<button class="btn-excluir" data-excluir="'+p.id+'" aria-label="Remover '+p.nome+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'
          + '</div>';
      }).join("");
    }
    atualizarSeletores();
  }

  function preencher(id, valor, vazioMsg){
    const el = $(id);
    if(valor){ el.textContent = valor; el.classList.remove("vazio"); }
    else { el.textContent = vazioMsg; el.classList.add("vazio"); }
  }

  function abrirFicha(id){
    definirAtivo(id);
    const p = pacienteAtivo();
    if(!p) return;
    $("#ficha-avatar").textContent = p.nome.charAt(0).toUpperCase();
    $("#ficha-nome").textContent = p.nome;
    const meta = [idade(p.nascimento), p.contato, p.inicio ? "Desde " + dataBR(p.inicio) : ""].filter(Boolean);
    $("#ficha-meta").textContent = meta.join(" - ");
    preencher("#ficha-queixa", p.queixa, "Não informada.");
    const resumoOq3 = temConteudo(p.oq3)
      ? [p.oq3.quer && "Quer: " + p.oq3.quer, p.oq3.precisa && "Precisa: " + p.oq3.precisa, p.oq3.consegue && "Consegue: " + p.oq3.consegue].filter(Boolean).join("\n")
      : "";
    preencher("#ficha-oq3", resumoOq3, "Ainda não aplicado.");
    const resumoPqq = temConteudo(p.pqq)
      ? [p.pqq.objetivo && "Objetivo: " + p.pqq.objetivo, p.pqq.verdadeiro && "Pra que: " + p.pqq.verdadeiro].filter(Boolean).join("\n")
      : "";
    preencher("#ficha-pqq", resumoPqq, "Ainda não aplicado.");
    $("#vista-lista-pacientes").classList.add("hidden");
    $("#vista-ficha").classList.remove("hidden");
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  $("#lista-pacientes").addEventListener("click", e => {
    const btnEx = e.target.closest("[data-excluir]");
    if(btnEx){
      e.stopPropagation();
      const id = btnEx.dataset.excluir;
      const p = estado.pacientes.find(x => x.id === id);
      if(p && confirm("Remover " + p.nome + "? Todos os registros dessa ficha serão apagados.")){
        sb.from("pacientes").delete().eq("id", id).then(() => {
          estado.pacientes = estado.pacientes.filter(x => x.id !== id);
          if(estado.ativo === id) definirAtivo(estado.pacientes[0] ? estado.pacientes[0].id : null);
          renderPacientes();
          toast("Paciente removido.");
        });
      }
      return;
    }
    const card = e.target.closest(".card-paciente");
    if(card) abrirFicha(card.dataset.id);
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
  }));

  const camposNovo = ["#np-nome","#np-nascimento","#np-contato","#np-inicio","#np-queixa"];
  $("#btn-abrir-novo").addEventListener("click", () => { $("#painel-novo").classList.remove("hidden"); $("#np-nome").focus(); });
  $("#btn-cancelar-paciente").addEventListener("click", () => { camposNovo.forEach(s => $(s).value = ""); $("#painel-novo").classList.add("hidden"); });

  $("#btn-salvar-paciente").addEventListener("click", async () => {
    const nome = $("#np-nome").value.trim();
    if(!nome){ toast("Informe o nome do paciente."); $("#np-nome").focus(); return; }

    const { data, error } = await sb.from("pacientes").insert({
      nome,
      nascimento: $("#np-nascimento").value || null,
      contato: $("#np-contato").value.trim() || null,
      inicio: $("#np-inicio").value || null,
      queixa: $("#np-queixa").value.trim() || null
    }).select().single();

    if(error){ toast("Erro ao salvar: " + error.message); return; }

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
    const oq3 = p ? p.oq3 : vazioOQ3();
    const pqq = p ? p.pqq : vazioPQQ();
    $("#oq3-data").value = oq3.data_consulta || "";
    $("#oq3-quer").value = oq3.quer || "";
    $("#oq3-precisa").value = oq3.precisa || "";
    $("#oq3-consegue").value = oq3.consegue || "";
    $("#oq3-alavancas").value = oq3.alavancas || "";
    $("#pqq-objetivo").value = pqq.objetivo || "";
    $("#pqq-1").value = pqq.r1 || "";
    $("#pqq-2").value = pqq.r2 || "";
    $("#pqq-3").value = pqq.r3 || "";
    $("#pqq-4").value = pqq.r4 || "";
    $("#pqq-5").value = pqq.r5 || "";
    $("#pqq-verdadeiro").value = pqq.verdadeiro || "";
  }

  $("#btn-salvar-oq3").addEventListener("click", async () => {
    const p = pacienteAtivo();
    if(!p){ toast("Selecione um paciente para salvar o OQ3."); return; }

    const dados = {
      paciente_id: p.id,
      data_consulta: $("#oq3-data").value || null,
      quer: $("#oq3-quer").value.trim(),
      precisa: $("#oq3-precisa").value.trim(),
      consegue: $("#oq3-consegue").value.trim(),
      alavancas: $("#oq3-alavancas").value.trim()
    };

    const { data, error } = await sb.from("oq3").insert(dados).select().single();
    if(error){ toast("Erro ao salvar OQ3."); return; }

    p.oq3 = data;
    renderPacientes();
    toast("OQ3 salvo na ficha de " + p.nome.split(" ")[0] + ".");
  });

  /* ============================================================
     FORMULARIOS: PQQ
  ============================================================ */
  $("#btn-salvar-pqq").addEventListener("click", async () => {
    const p = pacienteAtivo();
    if(!p){ toast("Selecione um paciente para salvar o PQQ."); return; }

    const dados = {
      paciente_id: p.id,
      objetivo: $("#pqq-objetivo").value.trim(),
      r1: $("#pqq-1").value.trim(),
      r2: $("#pqq-2").value.trim(),
      r3: $("#pqq-3").value.trim(),
      r4: $("#pqq-4").value.trim(),
      r5: $("#pqq-5").value.trim(),
      verdadeiro: $("#pqq-verdadeiro").value.trim()
    };

    const { data, error } = await sb.from("pqq").insert(dados).select().single();
    if(error){ toast("Erro ao salvar PQQ."); return; }

    p.pqq = data;
    renderPacientes();
    toast("PQQ salvo na ficha de " + p.nome.split(" ")[0] + ".");
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
    let proposito = pqq.verdadeiro;
    if(!proposito) proposito = [pqq.r5, pqq.r4, pqq.r3, pqq.r2, pqq.r1].find(r => r) || "";
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

    // A escala e 10 = muito bom, decisao registrada no motor. Estava invertida
    // aqui: antes, indice alto era diagnosticado como estado grave. Duas partes
    // do mesmo produto mediam ao contrario.
    let msg = "Pontue os sistemas para gerar a leitura.";
    if(semMapa) msg = "Aplique o questionário ou pontue os cinco sistemas à mão para gerar a leitura.";
    else if(total === 0) msg = "Estado crônico de ameaça. Abordagem integrativa prioritária: corpo, mente e espírito.";
    else if(total < 40) msg = "Estado crônico de ameaça. Abordagem integrativa prioritária: corpo, mente e espírito.";
    else if(total < 60) msg = "Desequilíbrios significativos. Conduta nutricional recomendada.";
    else if(total < 80) msg = "Desequilíbrios moderados. Atenção aos sistemas de nota mais baixa.";
    else msg = "Terreno equilibrado. Manter acompanhamento preventivo.";
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

  const CONDUTA = {
    fungico: [
      ["gatilhos_respostas", "compulsão por doce responde a gatilho, não a força de vontade"],
      ["diario_corporal", "separar fome do corpo de vontade da cabeça"],
      ["mapa_rotina", "onde do dia a compulsão aparece"]
    ],
    acido_inflamatorio: [
      ["reenquadramento", "a reatividade começa num pensamento"],
      ["ritmo_sono", "sono ruim mantém o corpo em alerta"],
      ["autocompaixao", "irritação consigo alimenta a de fora"]
    ],
    metabolico: [
      ["pqq", "o vazio pede propósito, não dieta"],
      ["circulo_sentido", "o que ainda dá sentido"],
      ["ancoras_motivacao", "o que sustenta quando a vontade cai"]
    ],
    detox_linfatico: [
      ["historia_alimentar", "mágoa antiga tem data de início"],
      ["diario_emocoes", "o que é engolido junto com a comida"],
      ["conexao_pertencimento", "quem sustenta e quem drena"]
    ],
    mental_emocional_espiritual: [
      ["autocompaixao", "como ela fala consigo é o terreno"],
      ["roda_vida", "qual área está puxando as outras"],
      ["praticas_contemplativas", "religar antes de mudar"]
    ]
  };

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

  function montarConduta(criticos){
    // duas ferramentas do sistema mais baixo, uma do segundo. Nao adianta
    // devolver dez: ela precisa saber por onde COMECAR.
    const escolhidas = [];
    const vistas = new Set();
    const pega = (chave, quantas) => {
      for(const [id, porque] of (CONDUTA[chave] || [])){
        if(escolhidas.length >= 3 || vistas.has(id)) continue;
        if(quantas-- <= 0) break;
        vistas.add(id);
        escolhidas.push({ id, porque, sistema: chave });
      }
    };
    if(criticos[0]) pega(CHAVE_MOTOR[criticos[0].chave] || criticos[0].chave, 2);
    if(criticos[1]) pega(CHAVE_MOTOR[criticos[1].chave] || criticos[1].chave, 1);
    return escolhidas;
  }

  function lerTerreno(scores, pronta){
    const caixa = $("#holo-leitura");
    if(!caixa) return;
    if(scores.every(s => s === 0)){ caixa.innerHTML = ""; return; }

    // as duas notas mais baixas: e por onde a conduta comeca
    const ordem = sistemas
      .map((s, i) => ({ chave: s, nota: scores[i], dado: terreno()[s] }))
      .sort((a, b) => a.nota - b.nota);
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
            + '<p><em>impacto espiritual</em>' + c.dado.espiritual + '</p>'
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
    const combinadas = pronta ? pronta.combinacoes : combinacoesDoMotor(scores);
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
      html += '<h4 class="leitura-titulo">Por onde começar</h4><div class="leitura-conduta">';
      for(const c of conduta){
        html += '<button type="button" class="conduta-item" data-abrir="' + c.id + '">'
              + '<span class="conduta-modulo">' + moduloDaFerramenta(c.id) + "</span>"
              + "<b>" + nomeDaFerramenta(c.id) + "</b>"
              + "<span class=\"conduta-porque\">" + c.porque + "</span>"
              + '<span class="conduta-abrir">abrir &rarr;</span></button>';
      }
      html += "</div>";
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
    const hoje = new Date().toISOString().slice(0, 10);
    const nova = Object.assign({}, r, { quando: hoje });
    if(!tudo[id]) tudo[id] = [];
    // reaplicar no mesmo dia substitui, em vez de criar duas do mesmo dia
    const mesmoDia = tudo[id].findIndex(x => x.quando === hoje);
    if(mesmoDia >= 0) tudo[id][mesmoDia] = nova; else tudo[id].push(nova);
    tudo[id].sort((a, b) => (a.quando || "").localeCompare(b.quando || ""));
    localStorage.setItem("holohacking.pontuacao", JSON.stringify(tudo));
  }

  /** Todas as aplicacoes de um paciente, da mais antiga para a mais nova. */
  window.historicoPontuacao = function(id){
    const pid = id || (window.pacienteAtivoId && window.pacienteAtivoId()) || "_sem_paciente";
    return lerHistorico()[pid] || [];
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
    desenharTriada(r.triada);
    desenharFrequencias(r.frequencias);
    desenharTerritorios(r.territorios);
    if(window.redesenharEvolucao) window.redesenharEvolucao();

    $("#holo-score-total").textContent = r.indice;

    const faltando = r.sistemas.filter(s => !s.avaliavel).map(s => s.nome);
    $("#holo-origem").innerHTML =
      "Calculado a partir de <b>" + r.cobertura.respondidos + "</b> de "
      + r.cobertura.total + " respostas"
      + (r.cobertura.percentual < 100
          ? ' &middot; <b class="holo-parcial">questionário incompleto ('
            + r.cobertura.percentual + '%)</b>'
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

  function desenharTriada(triada){
    const caixa = $("#holo-triada");
    if(!caixa) return;
    if(!triada){ caixa.classList.add("hidden"); caixa.innerHTML = ""; return; }

    const L = 260, C = L / 2, R = 88;
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

    const area = valores.map((v, i) => pontoTriada(C, C, R, v, i).map(n => n.toFixed(1)).join(",")).join(" ");
    svg += '<polygon points="' + area + '" fill="rgba(201,163,90,.2)" '
         + 'stroke="var(--dourado)" stroke-width="2" stroke-linejoin="round"/>';
    valores.forEach((v, i) => {
      const [x, y] = pontoTriada(C, C, R, v, i);
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="var(--dourado)"/>';
    });
    for(let i = 0; i < 3; i++){
      const [x, y] = pontoTriada(C, C, R + 22, 10, i);
      svg += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" '
           + 'fill="var(--dourado)" font-size="10" font-weight="600" letter-spacing="1.4">'
           + EIXOS_TRIADA[i][1].toUpperCase() + "</text>";
    }

    // o eixo mais baixo e o que a leitura deve olhar primeiro
    let menor = 0;
    valores.forEach((v, i) => { if(v < valores[menor]) menor = i; });

    caixa.innerHTML =
      '<h4 class="leitura-titulo">Triada HOLOS</h4>'
      + '<div class="triada-corpo">'
      +   '<svg viewBox="0 0 ' + L + ' ' + L + '" width="' + L + '" height="' + L + '" '
      +   'class="triada-grafico" aria-hidden="true">' + svg + "</svg>"
      +   '<div class="triada-eixos">'
      +     EIXOS_TRIADA.map((e, i) =>
            '<div class="triada-eixo' + (i === menor ? " menor" : "") + '">'
            + '<span class="triada-nota">' + valores[i].toFixed(1) + "</span>"
            + "<b>" + e[1] + "</b><span class=\"triada-sub\">" + e[2] + "</span></div>").join("")
      +     '<p class="triada-leitura">Dimensão mais baixa: <b>'
      +       EIXOS_TRIADA[menor][1] + "</b>. É por onde a conduta começa.</p>"
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
  carregarTudo();

})();
