"""
Converte PDF em Markdown para o corpus do metodo.

    python ferramentas/extrair-pdf.py "<arquivo.pdf>" "<Titulo da Fonte>" [saida.md]

Passo de ingestao, nao de runtime: roda uma vez por material e o resultado vai
para corpus/fontes/. Em Python porque pypdf ja esta na maquina e nao existe
biblioteca de PDF instalada no Node.

O que ele limpa, e por que:

  - Cabecalho e rodape que se repetem em toda pagina ("Nutricao Holistica 41").
    Sem isso, o BM25 acha que "nutricao holistica" e irrelevante — aparece em
    todo trecho, o idf desaba e o termo mais importante do metodo perde peso.

  - Hifenizacao de fim de linha ("compreen-\\nsao" -> "compreensao"). Sem isso
    metade das palavras longas do livro vira token quebrado e nunca casa.

  - Reagrupa em paragrafos, porque o quebrador do indexador fecha trecho em
    linha em branco. Sem paragrafos, uma pagina inteira vira um trecho so.

Cada pagina vira uma secao "p. N": a citacao que o agente devolve aponta a
pagina real do livro, que e o que o Rodrigo consegue conferir.
"""

import re
import sys
import unicodedata

import pypdf

ALVO_PARAGRAFO = 600


def dobrar(texto: str) -> str:
    return unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode()


# Cabecalhos/rodapes correntes desta colecao. Acrescentar conforme novos materiais.
CORRENTES = [
    re.compile(r"^\s*\d*\s*nutricao\s+holistica\s*\d*\s*$", re.I),
    re.compile(r"^\s*nutrindo\s+corpo,?\s+mente\s+e\s+espirito\s*\d*\s*$", re.I),
    re.compile(r"^\s*\d{1,3}\s*$"),  # numero de pagina solto
]


MINUSCULA = "a-záéíóúâêôãõçü"

# Letras que NUNCA sao palavra sozinha em portugues. "A", "O", "E" e "É" ficam
# de fora de proposito: sao artigos legitimos, e juntar "A dimensao" viraria
# "Adimensao" em 134 lugares do livro.
KERNING = re.compile(r"\b([TVWYQCKJFP]) ([" + MINUSCULA + r"]{2,})")

# Quebra de silaba que sobrou como hifen solto: "fa - milia", "comba - ter".
# Exige minuscula dos dois lados: protege "corpo-mente" e "anti-inflamatorio",
# que nao tem espaco, e os travessoes do livro, que sao en/em dash e nao hifen.
SILABA = re.compile(r"([" + MINUSCULA + r"])\s*-\s+([" + MINUSCULA + r"])")


def limpar(bruto: str) -> str:
    # 1. hifenizacao de fim de linha
    texto = re.sub(r"(\w)-\n(\w)", r"\1\2", bruto)

    # 2. fora cabecalho/rodape corrente
    linhas = []
    for linha in texto.split("\n"):
        if any(p.match(dobrar(linha)) for p in CORRENTES):
            continue
        linhas.append(linha.strip())

    # 3. junta tudo: a quebra de linha do PDF e visual, nao semantica
    texto = re.sub(r"\s+", " ", " ".join(linhas)).strip()

    # 4. cicatrizes de kerning da diagramacao. Sem isso "T odo" nunca casa com
    #    "todo" e "comba - ter" nunca casa com "combater" -- e sao 88 e 323
    #    ocorrencias so no livro.
    texto = KERNING.sub(r"\1\2", texto)
    texto = SILABA.sub(r"\1\2", texto)
    texto = re.sub(r"(\w) ([,.;:!?])", r"\1\2", texto)

    return texto


def paragrafar(texto: str) -> str:
    """Reagrupa em paragrafos de ~600 caracteres, cortando em fim de frase."""
    frases = re.split(r"(?<=[.!?:])\s+", texto)
    paragrafos, atual = [], ""
    for frase in frases:
        atual = (atual + " " + frase).strip()
        if len(atual) >= ALVO_PARAGRAFO:
            paragrafos.append(atual)
            atual = ""
    if atual:
        paragrafos.append(atual)
    return "\n\n".join(paragrafos)


CAPITULO = re.compile(r"CAP[IÍ]TULO\s+(\d+)", re.I)


def extrair(caminho_pdf: str, titulo: str, caminho_saida: str) -> None:
    leitor = pypdf.PdfReader(caminho_pdf)
    partes = ["# " + titulo, ""]

    paginas_com_texto = 0
    for numero, pagina in enumerate(leitor.pages, start=1):
        texto = limpar(pagina.extract_text() or "")
        if len(texto) < 80:  # capa, pagina decorativa, pagina so de imagem
            continue
        paginas_com_texto += 1

        capitulo = CAPITULO.search(texto)
        if capitulo:
            partes.append("## Capitulo " + capitulo.group(1) + " (a partir da p. " + str(numero) + ")")
            partes.append("")

        partes.append("### p. " + str(numero))
        partes.append("")
        partes.append(paragrafar(texto))
        partes.append("")

    saida = "\n".join(partes)
    with open(caminho_saida, "w", encoding="utf-8") as f:
        f.write(saida)

    print("paginas totais.......", len(leitor.pages))
    print("paginas com texto....", paginas_com_texto)
    print("caracteres...........", len(saida))
    print("gravado em...........", caminho_saida)
    if paginas_com_texto < len(leitor.pages) * 0.5:
        print()
        print("AVISO: menos da metade das paginas tinha texto extraivel.")
        print("Provavelmente e PDF de imagem (slide exportado ou escaneado) e precisa de OCR.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    pdf, titulo = sys.argv[1], sys.argv[2]
    destino = sys.argv[3] if len(sys.argv) > 3 else "corpus/fontes/saida.md"
    extrair(pdf, titulo, destino)
