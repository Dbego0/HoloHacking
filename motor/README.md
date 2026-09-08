# Motor HOLOS

O núcleo do HOLOSCOPE: pontuação determinística (L1) e a estrutura dos agentes (L2/L3).

O nucleo (pontuacao, bancos, escopo) roda sem instalar nada: Node 24 executa
TypeScript direto. Os agentes L2 e L3 usam o SDK da Anthropic, entao para eles:

    npm install

O corpus (o livro) nao vem no repositorio — e material do metodo, com direito
autoral. Sem ele, os 8 testes de busca pulam com o motivo, em vez de falhar.
Para te-los rodando, coloque as fontes em corpus/fontes/ (ver o README de la).

```bash
node src/cli.ts validar                    # confere a integridade dos bancos
node src/cli.ts questionario               # lista as perguntas na ordem
node src/cli.ts pontuar casos/exemplo-01.json
node src/cli.ts determinismo               # prova que a saída não varia
node src/cli.ts escopo "<texto>"           # testa o guardrail
node src/cli.ts indexar                    # reindexa o corpus do método
node src/cli.ts buscar "<pergunta>"        # busca no método indexado
node --test src/testes.ts                  # 35 testes, sem rede
```

Os dois comandos abaixo chamam a API e precisam de `ANTHROPIC_API_KEY` no ambiente:

```bash
node src/cli.ts conversar clinico "o Metabólico deu 2, por onde eu começo?"
node src/cli.ts relatorio casos/exemplo-01.json
```

---

## ⚠️ Nada aqui é o método do Rodrigo ainda

66 das 67 linhas dos bancos estão com `status=exemplo`. São **demonstração de
formato**, escritas para o motor poder rodar — não são conteúdo clínico e não
foram revisadas por ninguém.

`node src/cli.ts validar` avisa disso a cada execução, e o aviso só some quando
as linhas de exemplo forem substituídas pelo material real.

**Enquanto houver linha com `status=exemplo`, nenhum resultado deste motor pode
ser mostrado a paciente.**

A única linha confirmada é a `CMB-001` — "estado crônico de ameaça" — porque ela
vem literalmente do material do HOLOSCOPE (bloco 1).

---

## Como funciona

### As três camadas

| | O que é | Tecnologia | Onde está |
| --- | --- | --- | --- |
| **L1** | Motor de pontuação | Código puro. Zero IA, zero rede. | [`src/motor.ts`](src/motor.ts) |
| **L2** | Redator do relatório | LLM com saída em schema fechado | [`src/agente/prompts.ts`](src/agente/prompts.ts) |
| **L3** | Agentes conversacionais | LLM + ferramentas | [`src/agente/`](src/agente/) |

A regra que sustenta tudo: **a pontuação vem das tabelas; a IA escreve *sobre* o
resultado, nunca *decide* o resultado.** O L2 recebe a pontuação já calculada e
nunca as respostas cruas — assim ele não tem como repontuar por conta própria.

### A conta

Cada marcador tem um `peso` de 1 a 3 e o paciente responde numa escala de 0 a 3
(nunca / às vezes / frequente / sempre).

```
obtido(S) = Σ peso × intensidade   dos marcadores do sistema S
maximo(S) = Σ peso × 3
carga(S)  = obtido / maximo × 10           →  quanto o paciente marcou
nota(S)   = 10 − carga(S)                  →  0 a 10, 10 = muito bom

Indice HOLOS = Σ nota(S) × peso_indice(S) × 10   →  0 a 100, 100 = muito bom
```

**Tudo lê na mesma direção: quanto maior, melhor** (D1, 27/08). Os sistemas vão
de 0 a 10; o Índice HOLOS, de 0 a 100. Vale para os 5 sistemas,
para a Triada e para o Mapa de Frequências. `carga` continua existindo internamente,
mas só para auditoria — o número do método é a `nota`.

As condições de `combinacoes.csv` são escritas em **nota**, que é a língua do Rodrigo:
`metabolico <= 3` quer dizer "Metabólico em desequilíbrio".

**Triada** — físico / mental / espiritual — sai da *origem* do marcador:
sintomas são o eixo físico, emoções o mental, espiritual o espiritual.
Não precisa de tabela nova.

**Mapa de Frequências** — nota por chacra, das linhas de `espiritual.csv` com
`dimensao=chacra`. 10 = fluindo.

**Combinações** — as condições em `combinacoes.csv` são avaliadas contra as
notas. Não usa `eval`: o parser aceita só `<sistema> <operador> <número>`
ligados por ` E ` / ` OU `, sem precedência, da esquerda para a direita.

Nenhuma regra clínica está escrita em código. Se você precisar editar um arquivo
`.ts` para mudar uma regra do método, a regra está no lugar errado.

---

## A camada de IA

Modelo: `claude-opus-5`, com thinking adaptativo. O prompt de sistema é cacheado
(prefixo estável), então cada turno seguinte de uma conversa custa menos.

**L3 — o laço** (`src/agente/cliente.ts`). Laço manual em vez do tool runner do
SDK, de propósito: as definições em `ferramentas.ts` são JSON Schema puro, para o
app, o WhatsApp e qualquer outro canal reaproveitarem. O tool runner exigiria
redefinir tudo em Zod e amarrar as ferramentas a este arquivo — o oposto de
"um núcleo, adaptadores finos".

Toda resposta passa por `saidaSegura()` antes de voltar. O guardrail roda em
código, fora do prompt: instrução em prompt é sugestão, verificação em código é
garantia.

**L2 — o redator** (`src/agente/redator.ts`). Recebe a pontuação já calculada e
**não recebe as respostas cruas do paciente** — sem elas, não tem como repontuar.
Saída forçada pelo schema `emitir_relatorio`; o modelo não tem outra forma de
responder.

Duas travas depois da geração:

1. **Fidelidade numérica.** Todo decimal do texto tem que existir na pontuação.
   Inteiros só são cobrados acima de 10, porque abaixo disso quase sempre são
   contagem ("os 5 sistemas", "3 primeiros passos"). É o que impede o relatório
   de dizer "seu índice é 45" quando o motor calculou 28.
2. **Guardrail de escopo** no texto que vai para o paciente.

## O corpus do método

O que sustenta o `buscar_metodo`. Roda **offline**: sem embeddings, sem rede.

```
corpus/
├── fontes.csv     o manifesto — arquivo, título, nível de autoridade
├── fontes/        o material bruto (fora do git)
└── indice.json    derivado, reconstruído por `node src/cli.ts indexar`
```

**O corpus é só o livro** (decisão de 27/08, para não misturar fontes enquanto o
método não está encodado): 258 trechos, 4.863 termos, das 145 páginas com texto
das 164 do livro.

Ficaram de fora, e podem voltar a qualquer momento com uma linha no `fontes.csv`:
a Aula 02 da Formação, as apresentações *O Futuro da Nutrição* e *A Arte e
Ciência do Nutrir* (as duas são PDF de imagem e precisariam de OCR), e os
`material-original.md` dos produtos.

### O livro não fala dos 5 sistemas

Zero ocorrências de "Fúngico", "Ácido-Inflamatório", "HOLOSCOPE" e "Índice HOLOS"
nas 145 páginas. Isso não é defeito do corpus — é um fato sobre o material:

- **o livro** traz a filosofia e o método — Tríade do Ser, ciclo PSAM, os 5 A's,
  as 6 tarefas, holismo, ressignificação de "dieta" e "nutrir";
- **os 5 sistemas** são construção separada, que hoje só existe no material
  comercial de 11/08 e nos bancos em CSV.

Na prática o agente responde pelos dois caminhos sem se confundir: pergunta sobre
filosofia vai para `buscar_metodo` (o livro), pergunta sobre sistema vai para
`consultar_sistema` e `listar_sistemas` (os bancos). Há um teste travando esse
fato — se um dia a busca começar a devolver trecho do livro sobre os 5 sistemas,
alguém mudou o corpus sem avisar.

**Busca lexical (BM25), não semântica.** Numa base de vocabulário controlado —
cinco sistemas, um conjunto fechado de sintomas e emoções — a busca lexical
acerta quase sempre, roda em milissegundos e é **auditável**: o resultado mostra
quais palavras casaram, então dá para explicar por que um trecho apareceu.
Embeddings são melhoria depois, não pré-requisito.

**Nível de autoridade** decide quem ganha quando duas fontes discordam — e elas
vão discordar. Cada fonte declara o seu em `fontes.csv`, e a pontuação final é
o BM25 multiplicado por esse peso:

| autoridade | o que é | peso |
| --- | --- | --- |
| `metodo` | livro e material do Rodrigo | 1,0 |
| `contexto` | aula, live, transcrição | 0,7 |
| `referencia` | material de terceiro | 0,4 |

**Duas travas contra o ruído**, e a segunda saiu de um erro que só o corpus real
revelou. O motivo das duas é o mesmo: um trecho fraco vira, na mão do agente, uma
citação **com fonte** - e ele responde com ar de autoridade sobre algo que o
método não diz. Ruído com procedência é pior que silêncio.

1. **Piso de relevância.** Descarta o que pontua muito baixo.
2. **Cobertura mínima (50%).** O trecho precisa casar metade dos termos
   distintos da pergunta.

A cobertura existe porque o piso sozinho não dava conta. Com 22 trechos,
*"qual a dose de melatonina para insônia"* era barrada pelo piso. Com 331, o idf
mudou de escala e o mesmo trecho passou a pontuar **4,7** - enquanto *"o que é a
Tríade do Ser"*, pergunta perfeitamente legítima, pontua **4,3**. Pontuação não
separa as duas. Cobertura separa: 33% contra 100%.

Todo trecho carrega arquivo, título da fonte, caminho das seções e linha de
início. A citação que o agente repete tem essa cara:

```
HOLOSCOPE — material original · Bloco 2 > Estrutura técnica · linha 115
```

### Como entra um material novo

PDF converte primeiro:

```bash
python ferramentas/extrair_pdf.py "livro.pdf" "Titulo da Fonte" corpus/fontes/livro.md
```

Depois registrar em `fontes.csv` com o nível de autoridade e rodar
`node src/cli.ts indexar`. Nada no código muda.

**O extrator não é conveniência.** O livro veio com duas cicatrizes de kerning
que a extração crua deixa passar e que quebram a busca em silêncio: `T odo` em
vez de `Todo` (88 ocorrências) e `comba - ter` em vez de `combater` (323).
Nenhuma das duas casaria numa busca, e nada acusaria o erro - a resposta só viria
pior. Ele também remove cabeçalho e rodapé correntes, que senão aparecem em todo
trecho e afundam o idf de "nutrição holística", justamente o termo mais
importante do método.

O título passado ao extrator deve ser **igual ao do `fontes.csv`** - é assim que
a citação evita repetir o nome da fonte duas vezes.

## Os bancos

Tudo em CSV, para o Rodrigo editar sozinho — hoje e daqui a três anos.

| Arquivo | O que guarda | Linhas |
| --- | --- | --- |
| `bancos/sistemas.csv` | Os 5 sistemas, nome e padrões associados | 5 |
| `bancos/regras.csv` | Fórmula, cortes de faixa, peso no Índice | 5 |
| `bancos/config.csv` | Escala, teto do Índice, arredondamento | 6 |
| `bancos/sintomas.csv` | Sintoma × sistema × peso | 12 |
| `bancos/emocoes.csv` | Emoção × padrão × sistema primário e secundário | 7 |
| `bancos/espiritual.csv` | Valor, propósito, fé, bloqueio, chacra | 8 |
| `bancos/combinacoes.csv` | **A inteligência clínica.** Meta mínima: 15 | 5 |
| `bancos/mensagens.csv` | 5 sistemas × 3 faixas × 2 registros | 30 |
| `politicas/escopo.csv` | O que o agente nunca responde | 7 |

**Toda linha carrega `fonte`.** O validador rejeita linha sem procedência. Se o
Rodrigo apontar para uma linha e perguntar "de onde saiu isso?", tem que haver
resposta em um segundo — senão a IA inventa método e ninguém percebe.

O mesmo marcador pode aparecer em mais de um sistema com pesos diferentes
(`SNT-002` pesa 2 no Fúngico e 3 no Metabólico). É daí que emergem as "conexões
invisíveis" do material: elas não são inventadas pela IA, elas caem fora da tabela.

---

## Decisões clínicas — respondidas em 27/08

| | Decisão | Resposta | Onde vive |
| --- | --- | --- | --- |
| D1 | Direção da escala | **0 a 10, 10 = muito bom** | `config.csv` · `indice_maximo` |
| D2 | Peso dos 5 sistemas | Iguais por enquanto — 0,20 cada | `regras.csv` · `peso_indice` |
| D3 | Cortes das faixas | 0–3 baixo / 4–6 médio / 7–10 alto | `regras.csv` |
| D4 | Sistema secundário de uma emoção | **Mesmo peso** do primário | `config.csv` · `peso_secundario_fator` |
| D5 | A palavra | **"avaliação integral"**, sai "diagnóstico" | copy |

Todas mudam por CSV, nenhuma por código.

### O Índice ficou de 0 a 100

Os sistemas vão de 0 a 10, o Índice HOLOS de 0 a 100 — como já estava no material
de venda. O que a D1 mudou foi a **direção**, não o teto: nos dois, quanto maior
melhor. É `indice_maximo` em `config.csv`.

## O que falta para isto virar produto

- [x] ~~O corpus.~~ **O livro entrou** — 258 trechos, é o corpus inteiro hoje.
      Faltam as transcrições das aulas em vídeo.
- [ ] **Substituir as 66 linhas de exemplo** pelo método real.
- [ ] **15 combinações** em vez de 5. É onde o produto se diferencia.
- [ ] **O gabarito:** 15 pacientes reais pontuados à mão pelo Rodrigo, para
      comparar com o motor. Sem isso não se sabe se ele acerta — só que ele roda.
- [x] ~~Cliente da API para o L2 e o L3~~ — feito, `src/agente/cliente.ts` e
      `src/agente/redator.ts`. Falta rodar contra a API com credencial.
- [x] ~~Verificação de fidelidade numérica na saída do L2~~ — feita e testada.
- [ ] Persistência, LGPD, PDF, canais.

---

## Estrutura

```
motor/
├── bancos/           os 6 bancos + config — CSV, editável pelo Rodrigo
├── politicas/        escopo.csv — o que o agente nunca responde
├── casos/            casos de teste (hoje 1, fictício)
├── ferramentas/      PDF -> Markdown (ingestão, uma vez por material)
└── src/
    ├── tipos.ts      formato, nenhuma regra
    ├── csv.ts        leitor de CSV sem dependência
    ├── bancos.ts     carrega e normaliza os bancos
    ├── motor.ts      L1 — a pontuação
    ├── escopo.ts     guardrail, roda em código e não no prompt
    ├── validar.ts    impede uma edição de CSV de quebrar o motor em silêncio
    ├── cli.ts        interface de linha de comando
    ├── testes.ts     35 testes que rodam sem rede e sem credencial
    ├── corpus/
    │   ├── texto.ts     normalização PT-BR: acento, plural, palavras vazias
    │   ├── indexar.ts   quebra as fontes em trechos com procedência
    │   └── buscar.ts    BM25 + peso de autoridade + piso de relevância
    └── agente/
        ├── ferramentas.ts   as skills do L3, no formato da API Anthropic
        ├── prompts.ts       os 3 agentes + o schema de saída do L2
        ├── cliente.ts       L3 — o laço de tool-use
        └── redator.ts       L2 — relatório + fidelidade numérica
```

---

Parte de [Holos AI](../README.md) · [Holos Company](../../README.md)
