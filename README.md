## Atualização de permissões e Discord da equipe

- A carteira padrão é a versão dinâmica refinada em Canvas, com brasão lateral, louros e dados exatos. O PNG artístico premium é apenas uma alternativa de exemplo e não é utilizado pelo bot.
- **Recrutador:** cria IFJs, lista, edita e exclui somente os próprios cadastros. Não altera patentes no jogo, não emite PNG e não usa `/warn`.
- **Moderador:** gerencia somente os próprios IFJs, pode emitir suas carteiras e usar `/warn` com o Discord confirmado. Consulta apenas as advertências que aplicou.
- **Administrador:** mantém acesso geral. Dono e administradores do servidor Discord continuam autorizados a usar `/warn`.
- No primeiro acesso sem vínculo, recrutadores e moderadores devem informar o ID Discord e confirmar o código de seis números enviado pelo bot no privado. O código expira em dez minutos, bloqueia após cinco erros e pode ser reenviado após um minuto. O usuário precisa estar em uma divisão e aceitar mensagens privadas do bot. Só informar o ID não concede permissões.
- O vínculo permanece nos próximos logins. **Meu Discord** permite trocar a conta com nova confirmação. Cada Discord só pode pertencer a um login; o administrador vê o vínculo em **Logins da equipe**.
- Alterar a patente ou desativar o login revoga a permissão de `/warn` no próximo uso. Não é atribuído Administrator nem outro cargo Discord para conceder esse comando.
- A migração do banco ocorre no início do serviço e preserva IFJs e criadores anteriores. Cadastros sem criador ficam acessíveis somente aos administradores.
- Após publicar, reinicie o bot para atualizar `/warn`. O comando fica visível, mas o bot valida a autorização a cada execução. Se o servidor tiver restrições manuais em **Integrações → bot → /warn**, ajuste-as para permitir que os moderadores vinculados invoquem o comando; a validação do bot continua obrigatória.

# Cópia acompanhada de tutorial para Render Free

Para instalação gratuita, leia primeiro TUTORIAL.html no pacote do tutorial. A configuração de deploy desta cópia usa Free. Esta versão adiciona preflight obrigatório antes da porta HTTP e assistente offline para gerar .env.

# IFJ Central — painel + bot Discord

Projeto completo em Node.js, Express, discord.js e PostgreSQL. Hospedagem: Render. Banco recomendado: Supabase PostgreSQL.

## O que está implementado

- Login por usuário e senha; sessões no banco, cookie HttpOnly, SameSite, HTTPS em produção, proteção de origem/CSRF e limite de tentativas.
- Administrador cria, desativa, redefine senha e altera a patente de outros logins. Cada usuário pode mudar a própria senha.
- Administrador: gestão completa. Moderador: cria, edita, exclui e gera PNGs dos próprios IFJs; também aplica advertências após vincular o Discord. Recrutador: cria IFJs de membros ou aliados, consulta, edita e exclui os que criou. Não existe cadastro público.
- IFJ único com exatamente 15 dígitos, inclusive zeros iniciais; nome da pessoa, nick no jogo, usuário Roblox, ID Discord e divisão. Código excluído não é reutilizado.
- Duas divisões em dois servidores; IFJ de membro sem patente de acesso duplo em outra divisão não libera o cargo. Aliados verificados acessam ambas as divisões. ID Discord pré-cadastrado impede uso de IFJ alheio.
- Botão de verificação abre formulário; resposta privada mostra nome, nick no jogo, usuário Roblox, divisão e dados da aliança; confirmação válida por cinco minutos; acesso liberado por cargo.
- Caçados: formulário no painel com nome da pessoa procurada, nick, motivo, descrição e print opcional, publicado nas duas divisões; embed **VIVO OU MORTO**. Publicação manual, uma vez a cada envio. Pode cadastrar novos caçados a cada dia.
- Exclusão de IFJ: remove cadastro, invalida confirmações pendentes e coloca remoção de cargo na fila. Administrador pode publicar cancelamento com motivo no canal de caçados/anúncios.
- Tickets privados para membro e administradores. Botão **Fechar — resolvido** e fechamento pelo painel; canal removido e registro preservado.
- Denúncia: formulário com nome no jogo/usuário Roblox/IFJ e motivo. Não encontrado: **IFJ não encontrado**, privado. Encontrado: marca suspeito, guarda denúncia e responde **Obrigado, vamos analisar**, privado.
- Administrador consulta denúncia, conversa com o membro e registra a conclusão; suspeita sai quando não há denúncias pendentes. Sem punição automática.
- Fila persistente de ações Discord com novas tentativas e acompanhamento no painel. Auditoria de operações administrativas.

O código está implementado, mas não foi publicado em uma conta Render nem conectado a servidores Discord reais nesta entrega. Tokens, banco e canais devem ser configurados pelo dono.

## 1. Criar o banco gratuito

1. Crie um projeto no [Supabase](https://supabase.com/).
2. Em **Connect**, copie a conexão PostgreSQL. Prefira o **Session pooler** quando a conexão direta IPv6 não for compatível com sua rede. Copie host, usuário e porta exatamente como fornecidos.
3. Substitua a senha da conexão pela senha do banco, com caracteres especiais codificados para URL.
4. Use a URL em `DATABASE_URL`, com TLS validado (`sslmode=verify-full`). Se a conexão exigir uma CA específica, configure a CA oficial do provedor; não desative a validação TLS.
5. Use a conta proprietária do banco para criar o esquema e acessar as tabelas. O aplicativo habilita RLS sem políticas públicas: as tabelas não ficam liberadas ao cliente REST anônimo do Supabase.

As tabelas são criadas automaticamente na primeira inicialização. Não coloque `DATABASE_URL`, token do Discord nem senha de administrador no HTML ou em repositório público. O plano gratuito tem limites e pode pausar por inatividade; consulte [preços e limites](https://supabase.com/pricing).

## 2. Preparar o Discord

1. Crie uma aplicação em [Discord Developer Portal](https://discord.com/developers/applications), entre em **Bot** e gere o token.
2. Convide **o mesmo bot** para os dois servidores. No gerador OAuth2, selecione o escopo `bot` e as permissões **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**, **Manage Roles** e **Manage Channels**. Não precisa conceder Administrator ao bot.
3. Este projeto usa Gateway, botões e comandos slash. Não preencha Interactions Endpoint URL. Usa Guilds e GuildMembers: ative Server Members Intent no Developer Portal → Bot. Message Content e Presence não são necessários.
4. Em cada servidor, crie um cargo de membros verificados e um cargo de administradores. O cargo do bot precisa ficar acima do cargo de membros verificados. O cargo de membro não pode ter Administrator.
5. Crie quatro canais: **verificação**, **caçados** (também anúncios/cancelamentos), **tickets** e **denúncias**; crie uma categoria para os tickets individuais. Os nomes são livres; o código usa os IDs.
6. Ative Modo Desenvolvedor no Discord para copiar os IDs dos servidores, cargos, canais e categoria.

### Permissões dos canais: etapa obrigatória

O bot libera acesso atribuindo o cargo; as permissões abaixo precisam estar configuradas no Discord para que isso tenha efeito:

- Nos canais/categorias restritos, **negue View Channel para @everyone** e permita para o cargo de membros daquela divisão, administradores e bot.
- Confira os canais filhos: sincronize com a categoria restrita ou configure as mesmas regras. Remova outros cargos/overwrites que deem acesso aos membros não verificados.
- Deixe o canal de verificação visível para @everyone e para o bot. Pode deixar o canal de abertura de tickets acessível a não verificados para suporte.
- Caçados e denúncias podem ficar acessíveis apenas aos verificados, conforme sua organização.
- O bot cria cada ticket com permissões explícitas privadas para solicitante, cargo administrativo e bot. Pessoas com Administrator no Discord sempre podem ver canais privados, conforme o comportamento do Discord.
- O sistema não impede uma pessoa de entrar no servidor por convite: controla o acesso aos canais via cargo. No servidor da divisão errada a pessoa não ganha o cargo, podendo ver somente os canais públicos de recepção.

Logins do site e cargos do Discord são coisas diferentes. Para fechar ticket no Discord, o atendente precisa do cargo `DIV_N_ADMIN_ROLE_ID` ou ser dono do servidor; para fechar pelo site, precisa da patente `admin`.

## 3. Publicar no Render

1. Extraia este ZIP e envie o conteúdo da pasta `ifj-central` para um repositório GitHub privado. Não envie `.env` nem `node_modules`.
2. No Render, crie um **Web Service** usando esse repositório (ou um Blueprint usando `render.yaml`).
3. Runtime: Node 22 ou superior. Build: `npm ci --omit=dev`. Start: `npm start`. Health check: `/health`.
4. Use **uma única instância**. Nesta cópia o Blueprint usa `free`, sujeito a suspensão e cotas. Siga TUTORIAL.html, na raiz do pacote, para o roteiro gratuito. Não há garantia de bot online 24 horas.
5. Configure as variáveis de ambiente abaixo. Em produção use `NODE_ENV=production` e `APP_ORIGIN=https://SEU-SERVICO.onrender.com`, sem barra final. O Render fornece `PORT` automaticamente.
6. Faça deploy, abra a URL, entre com o primeiro administrador e vá em **Bot e histórico → Publicar / atualizar botões**. A ação cria as mensagens de verificação, ticket e denúncia nos dois servidores; reexecutar atualiza as existentes.
7. Depois do primeiro login, remova `INITIAL_ADMIN_PASSWORD` e `INITIAL_ADMIN_USERNAME` do Render. O login já está no banco, com senha protegida por scrypt. Essas variáveis só são usadas quando o banco não tem nenhum login.
8. Crie os outros logins no painel. As credenciais desses usuários ficam no banco; não precisam virar variáveis Render.

O Web Service hospeda o painel e mantém o bot conectado no mesmo processo. Serviço gratuito do Render pode suspender por inatividade e não serve como garantia de bot online 24h; veja [limitações do plano gratuito](https://render.com/docs/free). Não use o PostgreSQL gratuito temporário do Render para guardar seus cadastros de forma permanente.

### Variáveis

Veja também `.env.example`. Tudo abaixo é configurado no Render, sem editar o HTML.

| Variável | Valor |
| --- | --- |
| `NODE_ENV` | `production` no Render |
| `APP_ORIGIN` | URL HTTPS pública do painel, sem barra final |
| `DATABASE_URL` | Conexão PostgreSQL do Supabase |
| `SESSION_SECRET` | Segredo aleatório de ao menos 32 caracteres; o Blueprint gera automaticamente |
| `INITIAL_ADMIN_USERNAME` | Primeiro login, somente no primeiro boot |
| `INITIAL_ADMIN_PASSWORD` | Senha inicial com pelo menos 12 caracteres, somente no primeiro boot |
| `BOT_ENABLED` | `true`; use `false` apenas para testar painel sem Discord |
| `DISCORD_TOKEN` | Token secreto do bot |
| `DIV_1_NAME`, `DIV_2_NAME` | Nomes das divisões |

Repita o conjunto abaixo para `N=1` e `N=2`:

| Variável | Valor |
| --- | --- |
| `DIV_N_GUILD_ID` | ID do servidor da divisão |
| `DIV_N_MEMBER_ROLE_ID` | ID do cargo liberado após verificação |
| `DIV_N_ADMIN_ROLE_ID` | ID do cargo de administradores que atende tickets |
| `DIV_N_VERIFICATION_CHANNEL_ID` | Canal do botão de verificação |
| `DIV_N_WANTED_CHANNEL_ID` | Canal de caçados e anúncios de cancelamento |
| `DIV_N_TICKETS_CHANNEL_ID` | Canal do botão de abertura de ticket |
| `DIV_N_REPORTS_CHANNEL_ID` | Canal do botão de denúncia |
| `DIV_N_TICKET_CATEGORY_ID` | Categoria dos tickets privados |
| `DIV_N_STAFF_CHANNEL_ID` | Opcional: canal de aviso de nova denúncia; os detalhes ficam no painel |

Se quiser gerar um segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 4. Uso diário

1. Administrador ou recrutador cadastra nome, nick, usuário Roblox, ID Discord e divisão no painel. Moderador também pode cadastrar.
2. Copie o IFJ gerado e entregue em particular ao membro. Não publique listas de IFJs nos canais.
3. Membro entra no servidor correspondente, clica **Verificar meu IFJ**, informa o código e confirma os dois nomes. Só o Discord cadastrado consegue concluir.
4. A fila libera o cargo em poucos segundos. Se falhar, o administrador vê a operação em **Bot e histórico**, corrige as permissões e tenta novamente.
5. Denúncias marcam suspeita sem remover automaticamente o cargo. O administrador vê o ID Discord do membro para conversar e registra o resultado no painel.
6. Excluir um IFJ invalida o código imediatamente no banco. A remoção de cargo depende de o Discord estar disponível e do bot ter permissão; confira a fila se o acesso persistir.
7. Para corrigir um cadastro, use Editar. Recrutadores e moderadores editam ou excluem apenas seus próprios IFJs; administradores podem gerenciar todos. Mudanças de identidade exigem nova verificação.

Os anúncios de caçados são para o jogo/roleplay. Texto não gera menções automáticas de usuários, cargos ou @everyone.

## Desenvolvimento local

```sh
npm ci
cp .env.example .env
# Edite .env com as configurações reais. Para testar só o painel, BOT_ENABLED=false.
npm start
```

Abra `http://localhost:3000`. Nunca reutilize senhas de produção no ambiente de teste.

```sh
npm test
npm run check
```

Os testes usam PostgreSQL embarcado via PGlite (sem banco externo) e simulam chamadas Discord. Cobrem autenticação, CSRF, permissões das três patentes, IFJs duplicados, divisão incorreta, código roubado, confirmação, denúncia, análise, exclusão, fila de cargos e tickets privados. Não equivalem a uma validação em servidores Discord reais.

## Estrutura

- `public/`: login e painel responsivo, CSS e JavaScript.
- `src/app.js`: API, autenticação e permissões.
- `src/bot.js`: botões, modais, filas, cargos, anúncios e tickets.
- `src/schema.sql`: tabelas, índices, restrições e RLS.
- `src/db.js`, `config.js`, `security.js`: banco, configuração e proteção de credenciais.
- `src/server.js`: inicialização conjunta de painel e bot.
- `test/system.test.js`: testes automatizados.
- `render.yaml`: configuração de deploy.

## Limites operacionais desta versão

- Um processo/instância do serviço. Não habilite autoscaling sem revisar limites de tentativas e o processamento de sessões Gateway.
- O painel lista os 1.000 membros e denúncias mais recentes, 500 tickets e 100 ações recentes. Históricos completos continuam no banco.
- Retentativas Discord são limitadas a oito; operações com falha ficam visíveis e podem ser reenviadas. Em falhas raras após envio e antes da confirmação no banco, um anúncio pode se repetir; o nonce do Discord reduz duplicatas recentes, sem prometer entrega exatamente uma vez.
- Fechar ticket remove o canal; não arquiva a transcrição. O registro de abertura, responsável pelo fechamento e situação é preservado.
- O código não comprova propriedade da conta Roblox por OAuth: o administrador cadastra o usuário Roblox e o ID Discord, e o bot confirma esse vínculo cadastrado.
- Não há recuperação de senha por email. Outro administrador pode redefinir a senha. Preserve com cuidado o acesso do primeiro administrador e os backups do banco.

Referências oficiais: [Discord — interações](https://docs.discord.com/developers/interactions/receiving-and-responding), [Render — Blueprint](https://render.com/docs/blueprint-spec), [Supabase — planos](https://supabase.com/pricing).


## Inicialização com bloqueio (nova versão)

`npm start` agora testa variáveis, sistema, arquivos, hash, permissões, PostgreSQL (incluindo escrita com rollback), esquema, administrador ativo e, com BOT_ENABLED=true, autenticação e configuração real do Discord. O HTTP e a fila do bot só são ativados depois da aprovação. Qualquer erro encerra com código 1; nenhuma senha/token é exibida. Há limite global de 120 segundos. O Render pode reiniciar o processo, que continuará bloqueado até a correção.

BOT_ENABLED=false inicia apenas o painel e registra os testes Discord como dispensados. O preflight do Discord é de consulta: não envia mensagens de teste. Ele verifica os canais configurados, mas a visibilidade de todos os canais restritos deve ser conferida manualmente com uma conta comum.

Abra ASSISTENTE.html no pacote de tutorial: ele pede cada valor e grava .env a cada avanço no arquivo que você escolher, quando o navegador suporta essa função. Em outros navegadores, baixe o arquivo ao final. O .env só chega ao Render quando você o importa; não há deploy automático pelo assistente. `configurar.invalid` não é mais aceito: copie a URL real do serviço antes de tentar iniciar.

Novos arquivos: src/preflight.js, src/config-rules.js, src/discord-checks.js, src/env-codec.js e test/preflight.test.js.

## Atualização: alianças e identidades

Leia a seção **Alianças e carteiras PNG** do TUTORIAL.html incluído no ZIP.

- Todos os três cargos criam IFJs de membros e alianças. Gang obrigatória para aliados.
- Apenas admin/moderador configuram cadastros, patentes no jogo e geram PNGs. A patente no jogo não altera permissões do painel.
- PATCH /api/members/:id exige identity_version atual; conflito retorna 409. IFJ não muda na edição.
- GET /api/members/:id/card.png exige sessão de admin/moderador, com limite de emissão e Cache-Control no-store.
- Mudança nos dados de identidade reinicia verificação e enfileira remoção dos acessos. Confirmar dados antigos não concede acesso.
- Migração automática preserva registros antigos; fontes empacotadas e @napi-rs/canvas geram PNGs sem serviços pagos. Para cargos automáticos, importe os oito novos IDs por divisão.
- Preflight gera PNG antes de abrir HTTP; uma falha obrigatória encerra o processo.

Testes: npm ci e npm test. Integrações usam PostgreSQL local em memória (PGlite) e Discord simulado; a conexão com seu Discord/Supabase real é conferida pelo preflight após configurar o ambiente.

### Acesso de aliados às duas divisões

Aliados podem verificar em qualquer um dos dois servidores, sempre com o ID Discord cadastrado. A confirmação sincroniza o cargo de acesso nos dois servidores em que a pessoa já está presente. Se entrar no outro servidor posteriormente, verifica novamente com o mesmo IFJ. Membros sem patente de acesso duplo permanecem restritos à divisão cadastrada. Para aliados, a divisão salva serve de referência administrativa/encaminhamento de denúncias. Após atualizar, peça aos aliados existentes que verifiquem novamente para sincronizar os cargos. Não há variáveis novas nem mudança de esquema nesta atualização.

## /criar e patentes de acesso duplo

Líder, Sub líder e High member acessam ambos os servidores, assim como aliados. Regra central em src/identity.js. Somente admin/moderador configuram a patente; mudança de alcance reinicia verificação e enfileira revogação.

Para preparar servidores sem canais, use temporariamente `npm run configurar`. Exige DISCORD_TOKEN e DIV_1_GUILD_ID / DIV_2_GUILD_ID distintos. O instalador testa Discord e permissões antes de abrir a página de estado, sem iniciar banco ou painel. Execute `/criar servidor:<servidor> divisao:<divisão>` no próprio servidor, como dono ou Administrator do Discord. Repita no segundo servidor.

Importe os dois anexos .env de IDs no Render, complete as variáveis do aplicativo e volte a `npm start`. Publique os botões pelo painel. O comando continua disponível no modo normal.

O comando monta 8 categorias, 24 canais de texto, 6 calls e 10 cargos por servidor; recursos marcados IFJ são reutilizados e suas permissões reaplicadas. Não remove outros canais. Execute uma única instância e preserve os marcadores. Instruções completas em TUTORIAL.html, seção /criar.

## Estrutura decorada

Modelo em src/server-layout.js: primeira divisão verde e segunda azul, com emojis, categorias de operações, treinamento, convivência e comando. /criar preserva recursos antigos identificados e retorna um .env dos IDs utilizados, mais inventário TXT de todos os IDs. Cargos de patente são atribuídos automaticamente após verificar; a fonte de autorização entre divisões continua sendo a patente no cadastro IFJ. A atualização respeita o ID de cargos configurados e não altera suas permissões globais.

## Permissões e /deletar

Apenas PORTAL permanece público; as demais categorias são restritas a verificados/equipe conforme o modelo. /criar reaplica permissões dos recursos gerenciados; canais alheios não são modificados.

/deletar é restrito a dono/Administrator do Discord e pede confirmação privada em 60 segundos. Remove todos os canais/categorias da prévia no servidor atual, incluindo canais fora do IFJ e conteúdos associados. Não remove cargos, pessoas ou cadastros. Valida administrador novamente, consome a confirmação uma vez e compartilha bloqueio com /criar. Falhas parciais são registradas nos logs.

Antes da reconstrução, mude Start para npm run configurar. Após excluir, crie manualmente um canal temporário para usar /criar. Importe os novos IDs, volte a npm start e publique os botões pelo painel. Para apenas corrigir permissões, repetir /criar é suficiente.

## Cargos automáticos e monitoramento

Após verificar, o bot sincroniza Membro verificado + cargo da patente. Líder, Sub líder e Moderador recebem Equipe. High member e aliados continuam com acesso duplo sem Equipe; Moderador acessa somente a divisão cadastrada. Trocas de patente enfileiram sincronização, cancelamentos removem os cargos gerenciados, e a inicialização reconcilia cadastros sem marcar ninguém como verificado. Cargos não gerenciados são preservados.

Atualize os IDs via /criar: DIV_N_LEADER_ROLE_ID, SUBLEADER_ROLE_ID, HIGH_MEMBER_ROLE_ID, MODERATOR_ROLE_ID, RECRUITER_ROLE_ID, ALLY_ROLE_ID, VETERAN_ROLE_ID e ROOKIE_ROLE_ID, sempre com prefixo DIV_1_ ou DIV_2_. São obrigatórios no modo normal com bot ativado. Cargo do bot acima dos dez cargos, sem Administrator/gestão global nos cargos automáticos.

/ready retorna {"status":"ready"} somente com bot conectado e consulta ao banco bem-sucedida; caso contrário HTTP 503. /health continua sendo o health check do banco usado pelo Render. Configure um monitor Keyword UptimeRobot para /ready, palavra-chave '"status":"ready"', com intervalo de 5 minutos. O monitor deve ser criado pelo dono na sua conta; não foi ativado por esta entrega. Guia completo no TUTORIAL.html.


## Boas-vindas, denúncias e imigração
Adicione DIV_1_WELCOME_CHANNEL_ID, DIV_1_GUIDE_CHANNEL_ID, DIV_2_WELCOME_CHANNEL_ID e DIV_2_GUIDE_CHANNEL_ID. Os canais precisam ser públicos para novos membros. Ative Server Members Intent. Não precisa executar /criar novamente se os canais e cargos já existem.

IMMIGRATION_GUILD_ID é opcional: ID do terceiro servidor (antigo), onde o mesmo bot deve estar instalado com bot e applications.commands. Registra /imigração e /imigracao somente nesse servidor. O administrador do servidor antigo usa o comando para publicar o aviso de exclusão em 10 dias e o botão Solicitar imigração. O membro clica no botão; o formulário pede nome no jogo e nome Discord, e o ID real vem da interação.

No painel Imigração, somente admin completa os dados e aprova ou recusa com motivo. Aprovação cria IFJ ainda não verificado e envia PNG + IFJ por DM. Recusa envia motivo. A resolução de denúncias envia o resultado ao denunciante. DMs bloqueadas aparecem como falha em Bot e histórico, com reenvio manual após corrigir a privacidade. O guia é atualizado automaticamente no início; Bot e histórico também publica/atualiza guia e botões. Uma entrada gera boas-vindas com avatar e menção, sem conceder acesso.

Migração SQL incremental e idempotente, testes obrigatórios antes de abrir HTTP. Novos testes locais usam PostgreSQL em PGlite e Discord simulado, sem enviar mensagens reais. O tutorial principal contém o passo a passo completo e as limitações de hospedagem gratuita.

## Tribunal de denúncias

No painel **Denúncias**, um administrador com **Meu Discord** confirmado pode selecionar **Abrir tribunal** e escolher a divisão. O bot cria um canal de texto na categoria de atendimento existente e envia o link no privado ao administrador responsável, ao denunciante e à pessoa denunciada. As três contas precisam estar na divisão escolhida; o denunciante e a pessoa denunciada devem ser pessoas diferentes.

O canal tem permissões próprias: os envolvidos veem a conversa e as identidades uns dos outros. O cargo geral Equipe não recebe acesso. Donos e administradores nativos do Discord continuam podendo acessar por suas permissões do servidor. Recrutadores e moderadores do painel não podem criar tribunais.

Cada denúncia tem no máximo um tribunal. Reinícios, cliques repetidos e tentativas após falhas recuperam o canal e a mensagem existentes. A identidade Discord da pessoa denunciada fica registrada no recebimento da denúncia e não muda ao editar ou excluir o IFJ. A migração preenche denúncias antigas quando o cadastro ainda existe; denúncias sem identidade original não permitem abertura de tribunal.

Use **Concluir análise** para registrar o resultado. Ele é enviado no privado ao denunciante e publicado no tribunal, que fica disponível para consulta com a escrita bloqueada para os participantes comuns. O canal não é excluído. Nenhuma advertência, expulsão ou punição é aplicada automaticamente. Se a denúncia for concluída antes de o canal ser criado, a criação é cancelada.

Falhas na criação ou no encerramento aparecem na denúncia, com **Tentar novamente**. Convites privados bloqueados aparecem em **Bot e histórico** e podem ser reenviados após a pessoa permitir DMs. O bot precisa das permissões já usadas para atendimento: Gerenciar canais e cargos, ver canais, enviar mensagens, inserir links, ler histórico e anexar arquivos.

Não há novas variáveis. Ao iniciar a versão atualizada, o sistema cria a tabela `tribunals`, preserva os registros existentes e atualiza os painéis permanentes do Discord. Também é possível atualizá-los em **Bot e histórico → Publicar botões**. Mensagens de eventos anteriores permanecem como histórico; novas mensagens usam os embeds revisados.

## Meu Discord e apresentação das mensagens

Uma conta confirmada mostra o status **Discord confirmado**, o ID e suas permissões. **Trocar Discord** abre a vinculação somente quando solicitado. Selecionar uma categoria encerra essa tela; respostas antigas de envio de código não substituem a categoria atual. Contas de recrutador e moderador ainda precisam concluir a primeira confirmação para acessar o painel.

Os embeds usam cabeçalho de contexto, títulos, campos organizados e cores de situação. Textos longos são divididos dentro dos limites do Discord; quando um comunicado ou conclusão do tribunal ultrapassa o tamanho permitido, um anexo de texto preserva o registro integral. Os painéis permanentes existentes são detectados e editados, inclusive quando o ID salvo foi perdido.


## /warn — advertências nas duas divisões
Uso: `/warn membro:@pessoa motivo:Desrespeito às regras`.
Dono e administradores do servidor, além de moderadores e administradores ativos do painel com Discord confirmado, podem usar o comando. Recrutadores não são autorizados pelo vínculo. A permissão é consultada novamente em cada uso.
O alvo deve ser outra pessoa presente no mesmo servidor. Motivo obrigatório, até 1.000 caracteres. Registra membro, autor, divisão, data e motivo; envio privado pela fila persistente. Interação repetida não duplica advertência nem job. Sem ban, timeout, mudança de cargos ou cancelamento automático de IFJ.
Histórico geral na aba Advertências para administradores; moderadores veem apenas suas próprias advertências. DM bloqueada pode ser reenviada em Bot e histórico; registro persiste. Sem nova variável. Registro automático de /warn no npm start, somente nas duas divisões; não requer /criar novamente. Migração SQL incremental e checagem de tabela antes de iniciar HTTP.


## Aviso de imigração com botão
/imigração e /imigracao são exclusivos do dono ou Administrador Discord do servidor antigo. Publicam um embed no canal escolhido com aviso de exclusão em 10 dias, data, contagem regressiva e botão Solicitar imigração. Membros usam o botão para abrir o formulário privado. Aprovação/recusa e envio de IFJ/PNG permanecem no painel.
A tabela immigration_notices guarda canal, mensagem e prazo por servidor. Repetir atualiza no canal original sem duplicar nem reiniciar prazo. Mensagem excluída é recriada; canal deve permanecer acessível. Não apaga servidor nem bloqueia pedidos ao vencer; a exclusão anunciada é manual. Sem nova variável e sem executar /criar novamente.


## Migração automática de aliados
Configure OLD_ALLY_ROLE_ID, os DIV_N_ALLY_ROLE_ID e DIV_N_INVITE_URL com os valores do tutorial; IMMIGRATION_GUILD_ID é o servidor antigo. Com Server Members Intent habilitado, admin usa /migrar-aliados no servidor antigo. A fila busca a lista completa, salva IDs/usuários, revalida o cargo e cria IFJ Aliado (sem nome Roblox/jogo). IFJ existente é mantido e convertido em Aliado. Origem comprovada habilita auto_allied; a API de cadastro nunca aceita esse campo do cliente.
Aliados importados recebem DM com agradecimento, IFJ e dois convites. Entrada nas divisões enfileira os cargos de acesso e Aliados sem formulário; o vínculo é pelo ID Discord salvo. Aliados manuais continuam verificando. A aba Aliados migrados acompanha a fila e DMs; falhas são reenviadas em Bot e histórico. Excluir IFJ revoga acesso e não permite que a mesma importação o recrie. Remover o cargo antigo depois da importação não é revogação; use o painel.
Depois de concluir a fila e excluir o servidor antigo, limpe OLD_ALLY_ROLE_ID e IMMIGRATION_GUILD_ID. Os cadastros persistem e funcionam sem esse servidor. Não há importação automática em cada boot: execute /migrar-aliados como admin para iniciar cada busca. A fila pendente retoma automaticamente no boot.
Todos os embeds usam src/embed-theme.js; setup de painéis é executado após as verificações da inicialização e pode ser repetido no painel.


## HYDRA NO KAI
DIV_1_ALLIANCE_CHANNEL_ID=1551393214714482748; DIV_2_ALLIANCE_CHANNEL_ID=1551393565471674441; HYDRA_INVITE_URL=https://discord.gg/a9tUzVxdQ. Ao iniciar, o bot publica/atualiza a apresentação nos canais de alianças, com convite no final. Bot e histórico também atualiza a mensagem. Não precisa repetir /criar. Os canais são opcionais, mas quando configurados suas permissões e o convite são testados. Mensagens registradas são editadas sem duplicar em reinícios normais.


ATUALIZAÇÃO — CAÇADOS, CARTEIRAS E GUERRAS

1. Atualize o código do projeto no seu repositório e faça o deploy no Render.
   Build Command: npm ci --omit=dev
   Start Command: npm start
   Não precisa usar /criar de novo nem cadastrar variáveis novas.
2. Nos dois canais configurados em DIV_1_WANTED_CHANNEL_ID e
   DIV_2_WANTED_CHANNEL_ID, permita ao bot Anexar arquivos, Enviar mensagens,
   Inserir links (embeds), Ver canal e Ler histórico. A inicialização bloqueia
   se Anexar arquivos estiver ausente.
3. Caçados (somente admin): informe nome da pessoa procurada, nick no jogo,
   motivo e descrição. Não existe seleção de divisão do alvo. Não é preciso
   que o alvo tenha IFJ. O anúncio vai para os dois servidores.
4. Print opcional: escolha PNG/JPEG de até 2 MB e 4096 x 4096 pixels.
   Confira a prévia antes de publicar. O servidor valida e converte a imagem
   em JPEG de até 1200 pixels, salva no banco junto à fila e o bot a anexa
   ao embed. Não depende do disco temporário do Render nem de links externos.
   Imagens consomem espaço do banco; evite uploads desnecessários.
5. Guerras (somente admin): informe gang rival e motivo. O bot publica
   motivação, a frase "No campo de batalha do jogo: morte aos inimigos!"
   e a declaração de guerra. Vai aos mesmos canais de Caçados das duas
   divisões. Cada envio fica separado em Bot e histórico; repita somente
   o envio que falhou. Não há menção automática a @everyone.
6. Carteiras: membros em verde e aliados em dourado, com brasão R,
   moldura, fundo texturizado e IFJ destacado. Admin e moderador podem gerar
   novamente o PNG. Nome continua primeiro, IFJ por último, e a carteira
   aliada conserva "LICENCIADO POR ROKUHARA". Veja EXEMPLOS.

Validação local: testes com banco simulado, envio Discord simulado,
renderização das carteiras e teste do painel no navegador. Nenhum anúncio
foi enviado a servidores reais durante a preparação deste ZIP.
