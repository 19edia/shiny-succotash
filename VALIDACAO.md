# Validação — atualização de inicialização e assistente

## 27/09/2026 — tribunal, Meu Discord e embeds

- Suíte completa: `node --test --test-concurrency=2`, **135 testes aprovados, zero falhas**.
- Sintaxe dos módulos de tribunal, API, bot e painel aprovada.
- Tribunal: 16 testes do módulo e 7 de integração API/bot com PGlite e Discord simulado. Validados autenticação, patente, CSRF, vínculo confirmado, identidade original, migração repetida, criação única, permissões privadas, convites, erros e nova tentativa, recuperação após falha, encerramento e preservação do canal.
- Fechamento bloqueia mensagens, threads, gerenciamento de mensagens e webhooks dos participantes comuns. Administradores nativos do Discord mantêm suas permissões.
- Meu Discord: seis testes de regressão para estado confirmado, troca opcional, navegação, primeiro vínculo obrigatório e respostas atrasadas.
- Embeds: serialização, campos de até 1.024 caracteres, orçamento total de 6.000 caracteres, preservação do texto integral em anexo, identidade e atualização dos painéis existentes.
- Navegador Edge real em modo headless, com API simulada: fluxo de abrir/concluir tribunal; Discord confirmado; troca opcional; navegação por categorias; confirmação inicial do moderador. Desktop 1440 px e celular 390 px, sem erros JavaScript e sem transbordamento horizontal.
- Capturas locais em `../EXEMPLOS/tribunal-painel.png`, `../EXEMPLOS/tribunal-mobile.png` e `../EXEMPLOS/discord-confirmado.png`, com dados fictícios.

Não houve implantação nem envio para servidores Discord reais. A migração e a atualização dos painéis permanentes serão executadas ao iniciar esta versão no ambiente configurado.

---

Verificado em 20/09/2026.

- `npm test`: 25 testes aprovados, sem falhas.
- `npm run check`: sintaxe dos módulos de entrada, bot e painel aprovada.
- Processo real com configuração inválida: encerrou com código 1, sem anunciar servidor pronto e sem imprimir o segredo usado no teste.
- Testes de falha em sistema, conexão PostgreSQL, esquema, escrita/leitura, login Discord e permissões: nenhum abriu o listener HTTP; recursos criados foram encerrados.
- Sucesso: listener aberto somente após os testes, fila ativada por último.
- BOT_ENABLED=false: Discord explicitamente dispensado, apenas painel iniciado.
- PostgreSQL embarcado (PGlite): leitura/escrita com rollback deixou zero registros de teste.
- Checks Discord usam simulação: hierarquia e tipo incorreto de canal foram rejeitados sem publicar mensagens.
- Chromium: assistente percorreu 29 etapas, validou URL inválida, realizou 30 gravações por um handle de arquivo simulado, gerou download com conteúdo compatível com o parser .env do Node e importou os valores novamente.
- Assistente: falha de escrita e navegador sem seletor de arquivos tratados sem alegar salvamento. Layout móvel conferido sem transbordamento horizontal.
- O nome do download pode ser ajustado pelo navegador (ex.: env.txt); o aplicativo orienta renomear para .env. A gravação direta depende do seletor e da permissão do navegador real.

Os 10 testes anteriores de autenticação, permissões, IFJ, denúncias, filas e tickets continuam aprovados.

Não executado: conexão aos servidores Discord reais do usuário, implantação Render/Supabase ou diálogo nativo de gravação do sistema operacional. São necessários seus tokens, banco e IDs para essas verificações. O preflight real roda automaticamente quando você iniciar o projeto configurado.


Atualização Caçados/Guerras/carteiras: 84 testes automatizados aprovados. Navegador: upload real de arquivo local, prévia, criação de quatro jobs (dois caçados e duas guerras), viewport de 390 pixels sem overflow e sem erros JavaScript. PNGs dos dois tipos renderizados e inspecionados. Discord e banco de produção não acessados.
