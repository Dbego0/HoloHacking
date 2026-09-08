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
| **Questionário** | 87 perguntas que geram o mapa do paciente |
| **HOLOSCOPE** | Os 5 sistemas, o Índice HOLOS e a Tríada, calculados pelo motor |
| **Leituras combinadas** | O cruzamento entre sistemas que aponta a ferramenta a aplicar |
| **30 ferramentas** | Corpo, Mente e Espírito — 27 no catálogo, 3 com tela própria |
| **Holoscan** | Exames laboratoriais: 24 marcadores, com upload do PDF ou da foto do laudo |
| **Ficha e evolução** | O paciente inteiro numa tela, e a comparação em 4, 8 e 12 semanas |
| **Relatório** | Dois registros, um para a nutricionista e um para o paciente |

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

## Estado atual

O app está **sem informação nenhuma** — não há paciente nem nutricionista
cadastrado, porque o banco de dados ainda não foi conectado. Todas as telas
funcionam; o que falta é onde guardar.

Para atender paciente de verdade, duas coisas:

1. **Conectar o Supabase**, com login da nutricionista e cada conta enxergando só
   os seus pacientes.
2. **A revisão clínica dos marcadores** pelo Rodrigo. O validador do motor recusa
   qualquer linha que não esteja marcada como confirmada, e avisa quais faltam.
