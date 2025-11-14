# SMTP Server Mode - Accept Incoming Email

## Overview

O plugin SMTP suporta 2 modos de operação:

1. **Relay Mode** (padrão) - Usa um provedor externo (SendGrid, SES, Mailgun, Postmark)
2. **Server Mode** - Funciona como um servidor SMTP que **recebe** emails de outras aplicações

No Server Mode, você pode:
- ✅ Receber emails de aplicações externas
- ✅ Processar emails com validação e autenticação
- ✅ Armazenar emails em S3DB
- ✅ Disparar webhooks quando emails chegam
- ✅ Integrar com sistemas legados via SMTP
- ✅ Implementar filtros de spam customizados

---

## Quick Start

### Habilitar Server Mode

```javascript
import { SMTPPlugin } from 's3db.js'
import { Database } from 's3db.js'

const db = new Database({
  client: new MemoryClient({ bucket: 'demo' })
})
await db.connect()

const smtpPlugin = new SMTPPlugin({
  mode: 'server',              // 👈 Mudar para server
  serverPort: 25,              // Porta SMTP (default 25, precisa de sudo)
  serverAuth: {
    username: 'postmaster',
    password: 'your-password'
  },
  emailResource: 'emails',     // Onde armazenar emails
  verbose: true
})

await db.usePlugin(smtpPlugin)
await smtpPlugin.initialize()

console.log('✅ SMTP Server listening on port 25')
```

---

## Configuration

### Server Mode Options

```javascript
const smtpPlugin = new SMTPPlugin({
  mode: 'server',

  // Rede e autenticação
  serverPort: 25,                    // Porta SMTP (default 25)
  serverHost: '0.0.0.0',            // Listen on all interfaces
  serverSecure: false,               // TLS (default false)

  // Autenticação
  serverAuth: {
    username: 'postmaster',
    password: 'super-secret',
    // Ou múltiplos usuários:
    // credentials: [
    //   { username: 'admin', password: 'pass1' },
    //   { username: 'noreply', password: 'pass2' }
    // ]
  },

  // Limites
  serverMaxConnections: 50,          // Conexões simultâneas
  serverMaxMessageSize: 25 * 1024 * 1024,  // Max 25MB
  serverMaxRecipients: 100,          // Por email

  // Callbacks
  onMailFrom: async (address) => {
    // Validar sender
    return address.includes('@yourdomain.com')
  },

  onRcptTo: async (address) => {
    // Validar recipient
    // Pode rejeitar aqui
    return true
  },

  onData: async (stream) => {
    // Processar email antes de armazenar
    return true
  },

  // Armazenamento
  emailResource: 'emails',

  // Logging
  verbose: true
})
```

---

## Testing: Cliente SMTP

### Usando Node.js (nodemailer)

```javascript
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 25,
  secure: false,
  auth: {
    user: 'postmaster',
    pass: 'your-password'
  }
})

const result = await transporter.sendMail({
  from: 'sender@example.com',
  to: 'postmaster@yourdomain.com',
  subject: 'Test from Node.js',
  text: 'Hello SMTP Server Mode!',
  html: '<p>Hello <strong>SMTP Server Mode</strong>!</p>'
})

console.log('✅ Email sent:', result.messageId)
```

---

## Casos de Uso

1. **Email Gateway Corporativo** - Receber emails de sistemas externos
2. **Coletor de Notificações** - Sistemas enviam alertas por email
3. **Mailbox Virtual** - Caixas de email customizadas em S3DB
4. **Integração Legada** - Aplicações antigas que usam SMTP

---

## Comparação: Relay vs Server Mode

| Feature | Relay Mode | Server Mode |
|---------|-----------|------------|
| Enviar emails | ✅ Sim | ❌ Não |
| Receber emails | ❌ Não | ✅ Sim |
| Provedor externo | ✅ Obrigatório | ❌ Não precisa |
| Complexidade | Baixa | Alta |
| Autenticação | Simples | Customizável |

---

## Suporte

- **Exemplo completo**: `docs/examples/e51-smtp-server.js`
- **Testes**: `tests/plugins/plugin-smtp.test.js`
- **API Reference**: `docs/plugins/smtp.md`

O plugin suporta ambos modos - escolha qual funciona melhor para sua arquitetura!
