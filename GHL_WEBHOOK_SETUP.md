# Configuração do Webhook GHL no Ask Moses

## Validação Rápida

Para testar se o webhook está ativo, acesse:
```
https://www.askmoses.ai/api/webhooks/ghl
```

Você deve ver uma resposta JSON com status "ok".

---

## Passo a Passo: Configurar Webhook no GHL

### 1. Criar um Workflow
- Acesse sua conta GoHighLevel
- Vá em **Automations** ou **Workflows**
- Clique em **+ New Workflow**
- Nome: "Ask Moses Call Coaching"

### 2. Adicionar Trigger
- Clique em **Add Trigger**
- Selecione **Call Completed** (ou "Inbound Call Completed" / "Outbound Call Completed")
- Salve o trigger

### 3. Adicionar Ação de Webhook
- Clique em **+ Add Action**
- Procure por **Custom Webhook** ou **Webhook**
- Selecione a ação

### 4. Configurar o Webhook
No formulário, preencha:

| Campo | Valor |
|-------|-------|
| **Method** | `POST` |
| **URL** | `https://www.askmoses.ai/api/webhooks/ghl` |
| **Headers** | (deixar em branco) |
| **Body Type** | JSON |
| **Body** | Use os campos de variáveis do workflow |

### 5. Body JSON (Campos Disponíveis)
Use as variáveis que o GHL oferece no workflow. Exemplo:

```json
{
  "type": "inboundMessage",
  "contactId": "{{contactId}}",
  "locationId": "{{locationId}}",
  "messageId": "{{messageId}}",
  "userId": "{{userId}}",
  "direction": "inbound",
  "message": {
    "type": "CALL"
  }
}
```

### 6. Publicar o Workflow
- Clique em **Publish** ou **Save & Activate**

---

## O Que Acontece Automaticamente

Quando uma call terminar:
1. ✅ GHL envia os dados para nosso webhook
2. ✅ Ask Moses busca a transcrição automaticamente
3. ✅ Análise é feita com o script ativo
4. ✅ Email de coaching é enviado para o trainer

---

## Troubleshooting

### "Request timeout" ou erro 504
- Verifique se o webhook URL está correto: `https://www.askmoses.ai/api/webhooks/ghl`
- Aguarde alguns segundos entre testes

### "No transcription available yet"
- GHL pode levar 1-5 minutos para transcrever a call
- O webhook tentará novamente depois

### Email não chegou
- Verifique se o email do trainer é válido
- Confirme que há um script ativo em Ask Moses

---

## API Token GHL

O token está configurado em: `Environment Variable: GHL_API_TOKEN`

(Não precisa fazer nada, está tudo configurado)
