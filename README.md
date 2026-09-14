# HoloHacking

**A plataforma clínica da Nutrição Holística** — o sistema que a nutricionista abre
todo dia. Método de Rodrigo Mendanha, livro publicado em 2025 (ISBN 978-65-987413-0-3).

O app é HTML, CSS e JavaScript puro. **Não tem build**: abrir o `index.html` por um
servidor já é o produto rodando.

## Rodar na sua máquina

```bash
npm run servir     # sobe em http://localhost:5500
```

O modo demonstração — um caso fictício completo, de ponta a ponta — abre com
`?demo=1` na URL. Fora dele, nada da demo carrega.

## O que tem dentro

| Parte | O que faz |
| --- | --- |
| **Questionário** | 84 perguntas que geram o mapa do paciente |
| **HOLOSCOPE** | Os 5 sistemas, o Índice HOLOS e a Tríada, calculados pelo motor |
| **Leituras combinadas** | O cruzamento entre sistemas que aponta a ferramenta a aplicar |
| **30 ferramentas** | Corpo, Mente e Espírito — 27 no catálogo, 3 com tela própria |
| **Holoscan** | Exames laboratoriais: 24 marcadores, com upload do PDF ou da foto do laudo |
| **Ficha e evolução** | O paciente inteiro numa tela, e a comparação em 4, 8 e 12 semanas |
| **Relatório** | Dois registros, um para a nutricionista e um para o paciente |

## O que o HOLOSCOPE é — e o que ele não é

Os cinco sistemas não são doenças: são **agrupamentos de sinais que o paciente
relata e que costumam andar juntos**, cada um com o padrão emocional e o
impacto espiritual que o método associa a ele. A nota de 0 a 10 é a soma
ponderada e auditável do que a própria pessoa marcou — dá para apontar a linha
e dizer de onde veio o número. É um instrumento de **triagem e priorização**:
ele responde "por onde eu começo com esta paciente?".

Ele não mede nada. Não é exame, não é diagnóstico médico e não substitui
avaliação clínica — e a tela diz isso, no mapa e no registro que vai para o
paciente. Diagnóstico **nutricional** é atribuição da nutricionista;
diagnóstico de **doença** é ato médico, e a fronteira entre os dois é a
decisão D5 de 27/08: a palavra do produto é *avaliação integral*.

Por isso os cinco cards descrevem o **sinal relatado**, nunca a causa:
"sono depois de comer, fome que volta rápido" e não "resistência à insulina".
Onze perguntas de autorrelato não sustentam uma afirmação etiológica.
[testes/testar-fronteira.mjs](./testes/testar-fronteira.mjs) trava isso — é o
tipo de coisa que volta por edição de texto, não por bug.

## O motor

Vive em [motor/](./motor/), em TypeScript, e é **determinístico**: mesma resposta,
mesmo número, sempre. O cálculo não usa IA nenhuma — é o que sustenta a
credibilidade clínica do produto.

```bash
cd motor
node src/cli.ts validar      # confere os bancos e avisa o que falta revisar
node --test src/testes.ts    # 38 testes
npm run bundle               # regera o holoscope.js que o app carrega
```

As ferramentas clínicas e os marcadores são **dado, não código**: estão em
`motor/bancos/*.csv` e em `ferramentas.js`. Criar uma ferramenta nova é acrescentar
um objeto — não se toca em HTML nem em JS.

## Testes

```bash
npm install     # puppeteer-core
npm run teste   # 12 suítes de interface
```

## Onde os dados ficam

**No navegador, e só nele.** [dados.js](./dados.js) é a camada de persistência:
implementa as três chamadas que o app usa e guarda no `localStorage`; os PDFs e
fotos de laudo vão para o IndexedDB, em [arquivo-store.js](./arquivo-store.js).

O app não fala com servidor nenhum — abre e funciona sem rede. Até 13/09 ele
abria um cliente Supabase real, com a chave escrita no `app.js` que é servido
aberto: não dava para trabalhar offline e cada rodada de teste cadastrava
paciente num banco de verdade. As linhas que já estão naquele projeto continuam
lá; nada foi apagado.

Trocar por um banco de verdade é trocar **uma linha** — a que define `sb` no
app.js — e implementar as mesmas três chamadas. `DadosLocais.exportar()` devolve
tudo num objeto, que é por onde a migração vai passar.

## O que falta para atender paciente de verdade

1. **A revisão clínica dos marcadores** pelo Rodrigo — ver
   `docs/REVISAO-CLINICA.md` (interno, fora deste repo). O validador recusa
   qualquer linha que não esteja marcada como confirmada, e avisa quais faltam.
2. **Login da nutricionista**, cada conta enxergando só os seus pacientes.
3. **Banco de verdade, com LGPD** — hoje trocar de máquina perde tudo, e um
   `localStorage` limpo apaga a clínica inteira.
