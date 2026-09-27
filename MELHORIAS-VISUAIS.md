# Atualização visual — 25/09/2026

- Login e painel com identidade Rokuhara em grafite e verde, foco visível e layout responsivo.
- Diretório com contadores dos registros carregados, busca e filtros combináveis por situação, divisão administrativa e tipo. Filtros persistem ao atualizar a lista nesta sessão.
- Carteiras PNG de 1600 × 1100 com blocos de informação e cores de membro, liderança (patentes de acesso duplo) e aliança. Dados e regras de acesso preservados.
- Exemplos fictícios regenerados em EXEMPLOS. Para atualizar: `node scripts/render-examples.js`, a partir de projeto.

Validação: 83 de 84 testes passaram. A falha em test/alliance-notice.test.js está fora das alterações: o teste espera HYDRA NO KAI e src/alliance-notice.js produz RYUKETSU. O teste de carteiras com textos no tamanho máximo passou.

Interface verificada no Edge automatizado em 1440 px e 390 px com respostas locais simuladas: busca, filtros combinados, modal de criação e campos de aliança passaram, sem erros JavaScript ou transbordamento horizontal da página. Tabelas e navegação têm rolagem horizontal no celular. Capturas em EXEMPLOS usam dados fictícios. Não houve publicação nem conexão a Discord real.

## Carteiras e atualização de embeds — revisão 2

As carteiras têm brasão, nome em destaque, cores completas por tipo, situação na emissão e quebra de texto por palavras. A frase de autorização da aliança foi corrigida. Os três PNGs de EXEMPLOS foram regenerados.

Ao iniciar o bot ou usar **Bot e histórico → Publicar / atualizar guia e botões**, os painéis de verificação, atendimento, denúncias, guia e aliança são atualizados. O aviso de imigração é atualizado ao executar novamente seu comando, mantendo a data salva.

A publicação primeiro consulta o ID salvo. Se ele faltar, estiver incorreto ou a mensagem tiver sido excluída, percorre o histórico do canal em páginas de 100 mensagens. Só reconhece mensagens do bot atual, pelo tipo, botão ou título conhecido. A mensagem encontrada é editada e seu ID salvo. Se não existir, cria uma nova. Erros de permissão ou rede interrompem a operação, sem criar uma duplicata. Publicações simultâneas de painéis no mesmo canal são serializadas dentro da instância do bot.

O bot precisa da permissão **Ler histórico de mensagens**. Não edita mensagens de outro bot ou webhook e não apaga duplicatas antigas. Avisos de eventos distintos (caçados, guerras, boas-vindas e advertências) continuam sendo registros separados.

O aviso de aliança foi alinhado a HYDRA NO KAI, conforme HYDRA_INVITE_URL e o tutorial. A mensagem antiga com título RYUKETSU é reconhecida na migração.

Validação da revisão 2: os 25 testes direcionados de carteiras, comunidade, aliança e recuperação de painéis passaram; o teste adicional de serialização e limites dos embeds também passou. Os demais 68 testes passaram na execução geral anterior. A divergência HYDRA/RYUKETSU está resolvida. Inspeção visual dos três PNGs concluída. Validação feita localmente, com Discord simulado; sem publicação no servidor real.

## Painel e carteira — revisão de 26/09/2026

O painel agora usa navegação recolhível no celular, cartões de cadastro no lugar da tabela larga, atalhos nos contadores, busca e filtros combinados, ordenação por nome/data e paginação de 20 registros. Os indicadores refletem apenas os cadastros carregados e autorizados para o login (até 1.000).

Carteiras podem ser visualizadas no painel antes de baixar. A prévia usa a rota autenticada de PNG, respeita o criador e libera o endereço temporário ao fechar. O layout da carteira foi refinado com brasão e louros, dados sem duplicação e cores de membro, liderança e aliança. Os exemplos são fictícios.

A interface tem estados de carregamento e erro com nova tentativa. Respostas atrasadas de uma tela anterior não substituem a tela atual. As permissões de recrutador/moderador, confirmação do Discord por mensagem privada e autorização de /warn foram mantidas. O autoteste de inicialização foi atualizado para as novas permissões e para verificar as colunas/tabela de vinculação.

Verificação no Edge automatizado: filtros combinados, ordenação, paginação, visualização/fechamento do PNG, menu mobile, recuperação de erro, vínculo Discord e edição/exclusão de IFJs próprios. Sem erros JavaScript e sem transbordamento horizontal em 390 px. Capturas atualizadas em EXEMPLOS. Nenhuma mensagem foi enviada a Discord real e não houve deploy.

Resultado final da revisão: **102/102 testes automatizados passaram**, incluindo permissões, vínculo Discord, /warn, inicialização, geração PNG e recuperação de embeds. Validação de navegador também concluída com sucesso em desktop e celular.
