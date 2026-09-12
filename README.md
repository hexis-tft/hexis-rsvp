# Aniversário Natii — Héxis RSVP

Aplicativo de convite, RSVP e check-in com frontend estático no GitHub Pages e backend vinculado ao Google Sheets por Apps Script.

## Arquitetura

- `frontend/`: interface pública do GitHub Pages. Não contém lista de convidados, telefones, tokens nem senhas.
- `apps-script/`: API, autenticação, regras de permissão, auditoria e ponte invisível para o frontend.
- Google Sheets: cadastro e persistência operacional.

O navegador não acessa o Content Service por JSONP. A página carrega uma ponte invisível do HtmlService e troca mensagens somente com a origem GitHub configurada. Toda autorização é novamente validada no servidor.

## Implantação

1. Na planilha, abra **Extensões → Apps Script**.
2. Copie `apps-script/Code.gs`, `apps-script/Bridge.html` e `apps-script/appsscript.json` para o projeto vinculado.
3. Execute `configurarProjeto()` uma vez no editor e autorize o acesso.
4. Defina a origem exata do GitHub Pages com `definirOrigemFrontend("https://CONTA.github.io")`.
5. Crie as credenciais iniciais executando `definirCredencialInicial("GESTOR_APP", "login", "senha")` e `definirCredencialInicial("ADM_APP", "login", "senha")`.
6. Faça uma implantação versionada como Web App, executando como o proprietário e com acesso para qualquer pessoa.
7. Copie `frontend/config.example.js` para `frontend/config.js` e informe a URL `/exec?bridge=1`.
8. Publique o conteúdo de `frontend/` no GitHub Pages.

## Segurança operacional

- Telefone localiza o convite, mas o ingresso usa token aleatório independente.
- Sessões são assinadas no servidor e expiram.
- Perfis são consultados novamente a cada operação administrativa.
- Check-in é protegido por `LockService`, evitando dupla entrada simultânea.
- QR reutilizado é recusado e registrado em `CHECKIN_LOG`.
- Alterações administrativas são registradas em `LOG_SISTEMA`.
- `GESTOR_APP` não pode ser criado ou promovido por `ADM_APP`.

## Pendências de implantação

- Completar nomes e telefones ainda vazios na aba `CADASTRO`.
- Informar data, horário, local, endereço e prazo de confirmação na aba `CONFIG`.
- Definir a identidade visual final.
- Conectar a conta GitHub institucional da Héxis antes de criar o repositório.

