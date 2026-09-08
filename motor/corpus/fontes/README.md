# corpus/fontes/

Aqui entram os arquivos de texto do método: o livro, as transcrições das aulas,
as apostilas.

**Nada nesta pasta vai para o git** — está no `.gitignore`. O material bruto vive
no Drive; aqui fica só a cópia local que o indexador lê.

## Como adicionar uma fonte

1. Salve o arquivo aqui em `.md` ou `.txt` (texto puro; PDF e DOCX precisam ser
   convertidos antes).
2. Registre em `../fontes.csv`, com o **nível de autoridade**:

   | autoridade | o que é | peso na busca |
   | --- | --- | --- |
   | `metodo` | Livro e material do Rodrigo. É o método. | 1,0 |
   | `contexto` | Aula, live, transcrição. Explica o método. | 0,7 |
   | `referencia` | Material de terceiro. Só apoio. | 0,4 |

3. Rode `node src/cli.ts indexar`.

O nível de autoridade é o que decide quem ganha quando duas fontes discordam —
e elas vão discordar.
