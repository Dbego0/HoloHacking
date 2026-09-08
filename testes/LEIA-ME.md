# Testes do app

Rodam o app num Chrome de verdade, com o Supabase dublado — nenhum paciente
real e criado.

Precisa do servidor local no ar:

    npx serve -l 5500 .        (ou qualquer servidor estatico na porta 5500)

E do puppeteer-core, que usa o Chrome ja instalado:

    npm i -D puppeteer-core

Depois:

    node testes/testar-app.mjs           navegacao, as 30 ferramentas, salvar
    node testes/testar-paciente.mjs      dois pacientes nao se sobrescrevem
    node testes/testar-motor.mjs         o motor numa pagina em branco
    node testes/testar-integrado.mjs     o motor dentro da tela do HOLOSCOPE
    node testes/testar-questionario.mjs  as 87 perguntas ate o mapa
    node testes/testar-triada.mjs        a Triada aparece e some na hora certa

O caso de exemplo (caso.json) e ficticio e vem do repositorio do motor.
