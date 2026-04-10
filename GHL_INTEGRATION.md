## GHL Integration Guide

### Fluxo Automático de Calls

Quando uma call é concluída no GHL, o sistema Ask Moses agora importa automaticamente:

1. **Webhook Trigger** - GHL envia um webhook quando a call termina
2. **Busca de Transcript** - Consultamos a API do GHL para obter a transcrição
3. **Extração de Dados** - Nome do vendedor (team member) e do lead vêm direto do GHL
4. **Análise Automática** - A call é processada usando o script ativo
5. **Salvo no Banco** - Call fica registrada com todos os dados do GHL (messageId, contactId, locationId)

### Configuração no GHL

1. Vá para **Integrations** > **Webhooks** no seu account do GHL
2. Crie um novo webhook com as seguintes configurações:
   - **URL**: `https://www.askmoses.ai/api/webhooks/ghl`
   - **Event**: `InboundMessage` (ou `Call Completed`)
   - **Trigger**: Quando uma call termina

3. O webhook enviará automaticamente as informações da call para Ask Moses processar

### API Token

O `GHL_API_TOKEN` está configurado como variável de ambiente. Precisamos apenas do token que você forneceu para:
- Buscar transcriptions
- Obter informações do vendedor (user)
- Obter informações do lead (contact)

### Dados Salvos

Cada call importada do GHL inclui:
- `ghl_message_id` - ID único da mensagem no GHL
- `ghl_contact_id` - ID do lead/contato
- `ghl_location_id` - ID da localização/team

Isso permite rastrear e sincronizar de volta com o GHL quando necessário.
