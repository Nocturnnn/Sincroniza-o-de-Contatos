# Sincronização de Contatos

1. Objetivo

Construir um sistema em que:

o Supabase seja o banco principal
existam múltiplas planilhas, uma por cliente
o mesmo contato possa existir em várias planilhas
quando e-mail ou telefone de um contato mudar, a mudança seja refletida em todos os lugares
cada cliente tenha seu próprio status local para o mesmo contato, sem afetar os demais

Exemplo:

João está na planilha do Cliente A com status Contacted
João está na planilha do Cliente B com status Interested
se o telefone do João mudar, atualiza em ambas
mas os status continuam independentes
2. Princípio da arquitetura
Regra principal

Separar:

dados globais do contato
dados locais do contato em cada cliente
Dados globais

São compartilhados entre todos os clientes:

nome
e-mail
telefone
Dados locais por cliente

São específicos de cada cliente:

status
observações
responsável
data do último contato
qualquer campo operacional daquele cliente
3. Arquitetura proposta
Fonte de verdade

O Supabase será a única fonte de verdade.

As planilhas funcionarão como:

interface operacional simples para o time
espelho parcial dos dados
ponto de visualização e edição controlada
4. Modelagem de dados
4.1 Tabela clientes

Representa cada cliente que possui uma planilha própria.

Campos
id uuid pk
nome text not null
tipo_planilha text nullable
Ex.: google_sheets, excel
planilha_id text not null
ID externo da planilha
aba_padrao text nullable
ativo boolean default true
criado_em timestamptz default now()
atualizado_em timestamptz default now()
4.2 Tabela contatos

Tabela global de contatos.

Campos
id uuid pk
nome text nullable
email text nullable
telefone text nullable
email_normalizado text nullable
telefone_normalizado text nullable
origem text nullable
criado_em timestamptz default now()
atualizado_em timestamptz default now()
Regras
email_normalizado = lowercase + trim
telefone_normalizado = somente números, com padrão consistente
usar índices para facilitar deduplicação
4.3 Tabela cliente_contatos

Tabela de relacionamento entre contato global e cliente.

Essa é a tabela mais importante do sistema.

Campos
id uuid pk
cliente_id uuid not null references clientes(id)
contato_id uuid not null references contatos(id)
status text nullable
observacoes text nullable
responsavel text nullable
linha_planilha text nullable
sincronizado_em timestamptz nullable
criado_em timestamptz default now()
atualizado_em timestamptz default now()
Regra fundamental

O status fica aqui, porque ele pertence à relação:

cliente + contato

e não ao contato global.

4.4 Restrição de unicidade

Na tabela cliente_contatos, criar unique:

unique(cliente_id, contato_id)

Isso impede que o mesmo contato seja associado duas vezes ao mesmo cliente.

5. Lógica de negócio
5.1 Regra central
O que é global

Atualiza em todos os lugares:

nome
e-mail
telefone
O que é local

Atualiza apenas naquele cliente:

status
observações
responsável
6. Fluxos principais
6.1 Fluxo A — Cadastro/importação de contato em uma planilha
Cenário

Um contato entra pela planilha de um cliente.

Passos
ler a linha da planilha
normalizar email e telefone
procurar contato existente no Supabase:
primeiro por email_normalizado
se não achar, por telefone_normalizado
se encontrar:
reutilizar contato_id
se não encontrar:
criar novo registro em contatos
criar ou atualizar vínculo em cliente_contatos
gravar linha_planilha e sincronizado_em
Resultado
um único contato global
vínculo local com aquele cliente
status independente
6.2 Fluxo B — Atualização de contato global
Cenário

Alguém atualiza nome, e-mail ou telefone do contato.

Passos
atualizar registro em contatos
buscar todos os vínculos em cliente_contatos daquele contato_id
para cada cliente relacionado:
localizar a planilha
localizar a linha
atualizar somente campos globais:
nome
e-mail
telefone
não alterar status
registrar log da sincronização
Resultado

o contato fica consistente em todas as planilhas, sem sobrescrever dados locais

6.3 Fluxo C — Atualização de status na planilha do cliente
Cenário

o time muda o status de um contato na planilha de um cliente

Passos
detectar alteração na planilha
identificar cliente_id e contato_id
atualizar apenas o vínculo em cliente_contatos
não alterar contatos
Resultado

status muda só naquele cliente

6.4 Fluxo D — Deduplicação
Objetivo

evitar múltiplos registros do mesmo contato

Regras
comparar por email_normalizado
se não houver email, comparar por telefone_normalizado
se houver conflito ambíguo:
marcar para revisão manual
não mesclar automaticamente
Exemplo de conflito
mesmo telefone com nomes diferentes
mesmo nome com emails diferentes
email vazio e telefone incompleto
7. Estrutura operacional recomendada
Melhor abordagem prática
Supabase

armazenamento principal e regras de consistência

Automação

responsável por:

importar da planilha para o Supabase
sincronizar mudanças do Supabase para as planilhas
processar deduplicação
registrar falhas
Planilhas

usadas pelo time como interface simples

8. Estrutura das planilhas

Cada planilha de cliente deve ter colunas padronizadas.

Colunas visíveis
Nome
E-mail
Telefone
Status
Observações
Responsável
Colunas técnicas protegidas
contato_id
cliente_contato_id
ultima_sincronizacao

Essas colunas devem ficar protegidas ou escondidas para evitar quebra do fluxo.

9. Regras de sincronização
Atualizações permitidas nas planilhas

Pode editar:

status
observações
responsável
Atualizações controladas pelo sistema

Devem vir do Supabase:

nome
e-mail
telefone
10. Regras de normalização
E-mail
trim
lowercase

Exemplo:

João@Email.com
vira
joao@email.com
Telefone
remover espaços
remover parênteses
remover hífen
remover caracteres não numéricos
padronizar DDI/DDD quando necessário

Exemplo:

(62) 99999-9999
vira
62999999999
11. Regras de segurança e integridade
Banco
clientes, contatos e cliente_contatos com índices adequados
timestamps automáticos
constraints de unicidade
preferir updates via backend ou automação, não diretamente do front
Planilhas
layout fixo
colunas técnicas protegidas
nomes de abas estáveis
evitar que usuários renomeiem colunas críticas
12. Logs e observabilidade

Criar uma tabela de log simples, por exemplo logs_sincronizacao.

Campos
id
tipo_evento
cliente_id
contato_id
cliente_contato_id
status_execucao
mensagem
payload
criado_em
Eventos rastreados
criação de contato
vínculo criado
atualização global
atualização local
deduplicação
erro de sincronização
conflito de dados
13. O que pode dar errado
13.1 Duplicados imperfeitos

O mesmo contato pode entrar com variações:

email maiúsculo/minúsculo
telefone em formatos diferentes
nome escrito de formas diferentes
Mitigação
normalização
matching por email e telefone
revisão manual nos casos ambíguos
13.2 Sobrescrita de campos errados

Se a automação não separar corretamente campos globais e locais, pode:

sobrescrever status de cliente
perder observações
sincronizar dado errado
Mitigação
regra fixa de quais campos são globais
sync parcial por campo
testes com cenários reais
13.3 Conflito entre edição manual e sincronização

Se alguém editar a planilha enquanto a automação sincroniza:

pode haver conflito
pode voltar dado antigo
pode criar inconsistência
Mitigação
definir prioridade do Supabase como fonte principal
usar timestamp de última atualização
evitar sync simultâneo sem controle
13.4 Quebra da estrutura da planilha

Usuário pode:

mover colunas
apagar ID
renomear aba
apagar linhas críticas
Mitigação
proteger colunas técnicas
documentar formato padrão
usar validações
ter rotina de auditoria
13.5 Linhas sem identificação estável

Se a automação depender só de nome ou e-mail visível, a atualização fica frágil.

Mitigação
toda linha deve possuir contato_id
de preferência também cliente_contato_id
13.6 Sincronização parcial falhar

Uma atualização pode funcionar em um cliente e falhar em outro.

Mitigação
logs
retries
fila de processamento
marcação de pendência de sync
14. Fluxo técnico recomendado
Versão simples

Ideal para MVP:

importar planilhas para o Supabase
criar tabelas clientes, contatos, cliente_contatos
rodar automação de sync
atualizar planilhas a partir do banco
captar mudanças de status da planilha para o vínculo local
15. Stack sugerida
Banco
Supabase Postgres
Automação
n8n
Planilhas
Google Sheets ou Excel Online
Integração
API do Google Sheets ou Microsoft Graph
Webhooks ou agendamento periódico
Edge Functions se precisar de lógica intermediária
16. MVP recomendado
Escopo inicial
1 tabela global de contatos
1 tabela de clientes
1 tabela de relacionamento
1 fluxo de importação
1 fluxo de atualização global
1 fluxo de atualização de status local
deduplicação básica por email e telefone
logs simples
O que deixar para depois
merge inteligente de contatos
fila avançada
painel administrativo
reconciliação automática de conflito
auditoria completa
17. Resposta prática para a pergunta 1

Eu estruturaria o sistema usando o Supabase como fonte única da verdade e separaria dados globais do contato de dados locais por cliente.

Eu teria uma tabela contatos com nome, email e telefone, e uma tabela cliente_contatos para relacionar o contato com cada cliente, armazenando status, observações e outros campos específicos daquela planilha.

Assim, quando email ou telefone mudarem, eu atualizo uma vez no banco principal e sincronizo para todas as planilhas em que esse contato aparece. Já o status continua independente, porque ele pertence à relação entre cliente e contato, e não ao contato global.

18. Resposta prática para a pergunta 2

O principal risco é duplicidade, conflito de edição e sobrescrita indevida de campos locais.

O mesmo contato pode entrar com email ou telefone em formatos diferentes, então eu normalizaria esses campos antes de comparar.

Outro risco é alguém editar a planilha enquanto a automação sincroniza, gerando inconsistência.

Também existe o risco de a lógica misturar dados globais com dados locais e acabar sobrescrevendo o status do cliente.

Para reduzir isso, eu usaria IDs estáveis, separaria claramente os tipos de campo, protegeria colunas técnicas e manteria a planilha o mais simples possível para o time.

19. Exemplo real para a pergunta 3

Você pode usar algo alinhado ao que você já faz:

Um exemplo real foi quando eu estruturei um sistema de automações em que precisei separar a camada do produto publicado, a camada de configuração e a instância individual do usuário.

O problema era que, sem essa separação, os dados ficavam mais confusos, a manutenção ficava mais arriscada e o fluxo de ativação não era previsível.

O que eu mudei foi organizar a modelagem em camadas, separar campos públicos de segredos, centralizar regras importantes no backend e estruturar melhor o fluxo de execução.

Isso deixou o sistema mais previsível, mais seguro e mais fácil de evoluir.

20. Próximos passos de implementação
Fase 1
criar tabelas no Supabase
definir colunas padrão da planilha
cadastrar clientes e planilhas

Fase 2
criar fluxo de importação
criar fluxo de atualização global
criar fluxo de atualização de status local

Manual Trigger
Supabase - Buscar Cliente
Google Sheets - Ler Linhas
IF - Linha válida
Split In Batches
HTTP Request - RPC importar_contato_cliente
Set - Preparar IDs
Google Sheets - Atualizar Linha
Supabase - Validar resultado (opcional, para debug)

Fase 3
adicionar logs
adicionar deduplicação melhor
tratar conflitos
proteger colunas técnicas