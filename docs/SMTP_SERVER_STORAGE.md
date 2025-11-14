# SMTP Server Mode - Email Storage Architecture

## Overview

No **Server Mode**, o plugin funciona como um servidor SMTP que **recebe emails** de clientes. Todos os dados são armazenados em S3DB de forma organizada e eficiente.

Este documento explica como organizei o armazenamento:

---

## Arquitetura de Armazenamento

```
Fluxo de Armazenamento:
─────────────────────────────────────────────────

1. Cliente SMTP envia email
   │
   ├─→ Valida sender (onMailFrom)
   ├─→ Valida recipients (onRcptTo)
   ├─→ Parse email (mailparser)
   ├─→ Processa callbacks (onData)
   │
   └─→ 2. Armazena em S3DB

   ┌─────────────────────────────────────────┐
   │ S3DB Storage Layer                      │
   ├─────────────────────────────────────────┤
   │                                         │
   │ 📧 emails (resource principal)          │
   │   ├─ Metadata (S3 headers)              │
   │   └─ Body (S3 object body)              │
   │                                         │
   │ 📎 email_attachments (resource vinculado)
   │   ├─ attachment.pdf (blob)              │
   │   ├─ invoice.docx (blob)                │
   │   └─ image.png (blob)                   │
   │                                         │
   │ 🔗 email_recipients (para BCC/CC)       │
   │   ├─ recipient 1                        │
   │   ├─ recipient 2                        │
   │   └─ recipient N                        │
   │                                         │
   │ 📝 email_headers (headers SMTP brutos)  │
   │   ├─ Subject, From, To, Cc, Bcc        │
   │   ├─ Received, Return-Path              │
   │   ├─ DKIM-Signature                     │
   │   └─ Custom headers                     │
   │                                         │
   └─────────────────────────────────────────┘
```

---

## Resources em S3DB

### 1. Resource Principal: `emails`

Armazena os emails completos com metadados:

```javascript
// Criado automaticamente pelo plugin
await db.createResource({
  name: 'emails',
  attributes: {
    // Identificação
    messageId: 'string|required|unique',      // Message-ID header
    inReplyTo: 'string|optional',              // In-Reply-To header
    references: 'string|optional',             // References header

    // Remetente
    from: 'string|required',                   // De: sender@example.com
    fromName: 'string|optional',               // "John Doe" <...>
    sender: 'string|optional',                 // Sender: header
    replyTo: 'string|optional',                // Reply-To: header

    // Destinatários
    to: 'string|required',                     // Para: primary recipient
    cc: 'string|optional',                     // CC (stored as JSON array)
    bcc: 'string|optional',                    // BCC (stored as JSON array)

    // Conteúdo
    subject: 'string|optional',                // Assunto
    bodyText: 'string|optional',               // Corpo em texto puro
    bodyHtml: 'string|optional',               // Corpo em HTML

    // Metadados de Email
    contentType: 'string|optional',            // text/plain, multipart/mixed, etc.
    charset: 'string|optional',                // UTF-8, ISO-8859-1, etc.
    transferEncoding: 'string|optional',       // 7bit, 8bit, quoted-printable, base64

    // Estrutura de Anexos
    attachmentCount: 'number|default:0',       // Número de anexos
    attachmentTotalSize: 'number|default:0',   // Tamanho total em bytes
    attachmentIds: 'json|optional',            // Array de IDs em email_attachments

    // Estrutura de Recipients
    recipientCount: 'number|default:1',        // Total de to+cc+bcc
    recipientIds: 'json|optional',             // Array de IDs em email_recipients

    // Headers SMTP Brutos
    headers: 'json|optional',                  // Todos os headers como JSON
    headersRaw: 'string|optional',             // Headers em formato texto bruto

    // Informações de Recebimento
    receivedAt: 'string|required',             // Quando foi recebido
    receivedFrom: 'string|optional',           // IP/hostname do cliente SMTP
    receivedVia: 'string|optional',            // smtp.domain.com:25

    // Status de Processamento
    status: 'string|default:received',         // received, processing, stored, failed
    processedAt: 'string|optional',            // Quando foi processado
    processingDuration: 'number|optional',     // Tempo em ms

    // Verificações
    spamScore: 'number|optional',              // 0-10 (calculado por callbacks)
    virusScanned: 'boolean|optional',          // Se foi scaneado por antivírus
    virusStatus: 'string|optional',            // clean, infected, suspicious

    // Metadados Customizáveis
    userId: 'string|optional',                 // User associado (se inbox virtual)
    folder: 'string|default:inbox',            // inbox, sent, drafts, spam, trash
    labels: 'json|optional',                   // Array de labels/tags
    starred: 'boolean|default:false',          // Marcado com estrela
    read: 'boolean|default:false',             // Lido ou não
    priority: 'string|optional',               // high, normal, low
    sensitivity: 'string|optional',            // personal, private, company-confidential

    // Custom metadata
    metadata: 'json|optional',                 // Dados customizados
  },

  partitions: {
    byMessageId: {
      fields: { messageId: 'string' }          // Lookup rápido por Message-ID
    },
    byFrom: {
      fields: { from: 'string' }               // Emails por remetente
    },
    byTo: {
      fields: { to: 'string' }                 // Emails para destinatário
    },
    byReceivedAtCohort: {
      fields: { receivedAtCohort: 'string' }   // Para limpeza/TTL
    },
    byFolder: {
      fields: { folder: 'string' }             // Inbox, Trash, etc
    },
    byUser: {
      fields: { userId: 'string' }             // Para multi-user mailbox
    }
  },

  behavior: 'body-overflow',                   // HTML + attachments no body
  timestamps: true                              // createdAt, updatedAt
})
```

**Exemplo de Email Armazenado**:

```json
{
  "id": "msg-123456",
  "messageId": "<abc123@gmail.com>",
  "from": "john@example.com",
  "fromName": "John Doe",
  "to": "postmaster@yourdomain.com",
  "cc": ["cc@example.com"],
  "bcc": ["secret@example.com"],
  "subject": "Proposal for Q4",
  "bodyText": "Hi, here's the proposal...",
  "bodyHtml": "<p>Hi, here's the proposal...</p>",
  "contentType": "multipart/mixed",
  "charset": "UTF-8",
  "attachmentCount": 2,
  "attachmentTotalSize": 1024000,
  "attachmentIds": ["att-456", "att-789"],
  "recipientCount": 3,
  "recipientIds": ["rcpt-1", "rcpt-2", "rcpt-3"],
  "headers": {
    "Subject": "Proposal for Q4",
    "From": "john@example.com",
    "To": "postmaster@yourdomain.com",
    "Date": "2024-11-14T10:30:00Z",
    "Message-ID": "<abc123@gmail.com>"
  },
  "receivedAt": "2024-11-14T10:30:15Z",
  "receivedFrom": "192.168.1.1",
  "receivedVia": "smtp.domain.com:25",
  "status": "stored",
  "processedAt": "2024-11-14T10:30:16Z",
  "processingDuration": 1200,
  "spamScore": 1,
  "virusScanned": true,
  "virusStatus": "clean",
  "userId": "user@yourdomain.com",
  "folder": "inbox",
  "labels": ["work", "important"],
  "starred": false,
  "read": false,
  "priority": "high",
  "createdAt": "2024-11-14T10:30:15Z",
  "updatedAt": "2024-11-14T10:30:16Z"
}
```

---

### 2. Resource: `email_attachments`

Armazena anexos com referência ao email:

```javascript
// Criado automaticamente
await db.createResource({
  name: 'email_attachments',
  attributes: {
    // Referência
    emailId: 'string|required',                // ID do email em 'emails'

    // Identificação
    filename: 'string|required',               // invoice.pdf
    originalFilename: 'string|optional',       // Nome original se renomeado

    // Conteúdo
    mimeType: 'string|required',               // application/pdf, image/png, etc.
    encoding: 'string|optional',               // binary, base64, quoted-printable
    size: 'number|required',                   // Tamanho em bytes

    // Blob Storage (em S3DB body)
    content: 'binary|required',                // Arquivo em base64 no body
    contentHash: 'string|optional',            // SHA256 para dedup

    // Informações
    inline: 'boolean|default:false',           // Inline vs attachment
    contentId: 'string|optional',              // Para inline (cid:xxx)
    description: 'string|optional',            // Descrição do anexo

    // Segurança
    scanned: 'boolean|default:false',          // Se foi scaneado
    scanStatus: 'string|optional',             // clean, infected, suspicious
    scanEngine: 'string|optional',             // clamav, yara, etc.

    // Metadados
    uploadedAt: 'string|required',             // Quando foi recebido
    isCompressed: 'boolean|default:false',     // Se está comprimido
    compressionRatio: 'number|optional',       // Para comprimidos
  },

  partitions: {
    byEmailId: {
      fields: { emailId: 'string' }            // Buscar anexos de um email
    },
    byMimeType: {
      fields: { mimeType: 'string' }           // Filtrar por tipo
    }
  },

  behavior: 'body-only',                       // Arquivo no body, metadata mínimo
  timestamps: true
})
```

**Exemplo de Anexo**:

```json
{
  "id": "att-456",
  "emailId": "msg-123456",
  "filename": "proposal.pdf",
  "mimeType": "application/pdf",
  "size": 512000,
  "content": "JVBERi0xLjQKJ...",  // Base64 encoded PDF
  "contentHash": "sha256:abc123def456...",
  "inline": false,
  "scanned": true,
  "scanStatus": "clean",
  "scanEngine": "clamav",
  "uploadedAt": "2024-11-14T10:30:15Z",
  "createdAt": "2024-11-14T10:30:15Z"
}
```

---

### 3. Resource: `email_recipients`

Armazena informações de recipients (CC/BCC):

```javascript
await db.createResource({
  name: 'email_recipients',
  attributes: {
    // Referência
    emailId: 'string|required',                // ID do email

    // Recipient
    email: 'string|required',                  // recipient@example.com
    name: 'string|optional',                   // "Jane Doe"
    type: 'string|required',                   // to, cc, bcc

    // Status de Entrega
    status: 'string|optional',                 // accepted, pending, bounced, complaint
    statusCode: 'number|optional',             // SMTP code se bounce
    statusMessage: 'string|optional',          // Mensagem de erro se houver

    // Metadados
    verified: 'boolean|optional',              // Email verificado
    dispositionNotificationTo: 'boolean|optional', // MDN requested
  },

  partitions: {
    byEmailId: {
      fields: { emailId: 'string' }
    },
    byEmail: {
      fields: { email: 'string' }
    }
  }
})
```

---

### 4. Resource: `email_headers`

Armazena headers SMTP brutos para análise/audit:

```javascript
await db.createResource({
  name: 'email_headers',
  attributes: {
    // Referência
    emailId: 'string|required',

    // Headers SMTP
    received: 'json|optional',                 // Array de Received headers
    returnPath: 'string|optional',             // Return-Path
    dkimSignature: 'string|optional',          // DKIM-Signature header
    spfRecord: 'string|optional',              // SPF validation result
    dmarc: 'string|optional',                  // DMARC validation result

    // Outros
    customHeaders: 'json|optional',            // Headers customizados
    rawHeaders: 'string|optional',             // Todos os headers em texto
  },

  behavior: 'body-only',                       // Headers em texto no body
  timestamps: true
})
```

---

## Como Funciona na Prática

### Fluxo Completo de Recebimento

```javascript
// 1. Cliente SMTP conecta e envia email
client.send('FROM: john@example.com')
client.send('TO: postmaster@yourdomain.com')
client.send('SUBJECT: Test')
client.send('...')  // Body e anexos

// 2. Plugin recebe e valida
smtpPlugin.onMailFrom = async (address) => {
  // Validar sender
  return true // aceita
}

smtpPlugin.onRcptTo = async (address) => {
  // Validar recipient
  return true // aceita
}

smtpPlugin.onData = async (stream) => {
  // 3. Parse com mailparser
  const parsed = await simpleParser(stream)

  console.log('From:', parsed.from.text)
  console.log('To:', parsed.to.text)
  console.log('Subject:', parsed.subject)
  console.log('Text:', parsed.text.substring(0, 100))
  console.log('Attachments:', parsed.attachments.length)

  // 4. Calcula spam score
  let spamScore = 0
  if (parsed.text.toUpperCase() === parsed.text) spamScore += 2
  if (parsed.attachments.length > 10) spamScore += 1

  // 5. Armazena em S3DB
  const emailRecord = {
    messageId: parsed.messageId,
    from: parsed.from.text,
    fromName: parsed.from.name,
    to: parsed.to.text,
    cc: parsed.cc?.map(c => c.text),
    bcc: parsed.bcc?.map(c => c.text),
    subject: parsed.subject,
    bodyText: parsed.text,
    bodyHtml: parsed.html,
    contentType: parsed.contentType,
    charset: parsed.charset,
    attachmentCount: parsed.attachments.length,
    headers: { ...parsed.headers },
    receivedAt: new Date().toISOString(),
    receivedFrom: '192.168.1.1',  // IP do cliente SMTP
    spamScore,
    virusScanned: false,
    status: 'received'
  }

  const [ok, emailErr, email] = await tryFn(() =>
    db.resources.emails.insert(emailRecord)
  )

  if (!ok) {
    console.error('Failed to store email:', emailErr)
    return false
  }

  // 6. Armazena anexos
  for (const attachment of parsed.attachments) {
    const attachmentRecord = {
      emailId: email.id,
      filename: attachment.filename,
      mimeType: attachment.contentType,
      size: attachment.content.length,
      content: attachment.content.toString('base64'),
      inline: attachment.contentDisposition === 'inline',
      contentId: attachment.contentId,
      scanned: false,
      uploadedAt: new Date().toISOString()
    }

    const [attOk, attErr] = await tryFn(() =>
      db.resources.email_attachments.insert(attachmentRecord)
    )

    if (!attOk) {
      console.warn('Failed to store attachment:', attachment.filename, attErr)
    }
  }

  // 7. Armazena recipients
  const allRecipients = [
    { email: email.to, type: 'to' },
    ...(parsed.cc?.map(c => ({ email: c.text, type: 'cc' })) || []),
    ...(parsed.bcc?.map(c => ({ email: c.text, type: 'bcc' })) || [])
  ]

  for (const recipient of allRecipients) {
    await tryFn(() =>
      db.resources.email_recipients.insert({
        emailId: email.id,
        email: recipient.email,
        type: recipient.type,
        status: 'accepted'
      })
    )
  }

  console.log('✅ Email stored:', email.id)
  return true  // Aceita email
}
```

---

## Otimizações de Armazenamento

### 1. Dedupação de Anexos

```javascript
// Se 2 emails têm o mesmo anexo, evita duplicação
const attachment = {
  content: fs.readFileSync('large-file.pdf'),
  contentHash: crypto.createHash('sha256')
    .update(fs.readFileSync('large-file.pdf'))
    .digest('hex')
}

// Query para encontrar duplicatas
const [ok, existing] = await tryFn(() =>
  db.resources.email_attachments.query({
    contentHash: attachment.contentHash,
    limit: 1
  })
)

if (existing.length > 0) {
  // Reutiliza ID do anexo existente
  emailRecord.attachmentIds.push(existing[0].id)
} else {
  // Armazena novo
  const [ok, att] = await tryFn(() =>
    db.resources.email_attachments.insert(attachment)
  )
  emailRecord.attachmentIds.push(att.id)
}
```

### 2. Compressão de Anexos Grandes

```javascript
import zlib from 'zlib'

const attachment = {
  size: largeFile.length,
  isCompressed: false
}

// Se > 1MB, comprime
if (attachment.size > 1024 * 1024) {
  const compressed = zlib.gzipSync(largeFile)
  attachment.content = compressed.toString('base64')
  attachment.isCompressed = true
  attachment.compressionRatio =
    (1 - compressed.length / largeFile.length) * 100
}
```

### 3. Cleanup Automático com TTL

```javascript
// Plugin TTL remove emails antigos
await db.usePlugin(new TTLPlugin({
  resources: {
    emails: {
      field: 'receivedAt',
      ttl: 90 * 24 * 60 * 60 * 1000  // 90 dias
    },
    email_attachments: {
      field: 'uploadedAt',
      ttl: 90 * 24 * 60 * 60 * 1000
    }
  }
}))
```

---

## Queries Comuns

### Buscar Email por Message-ID

```javascript
const [ok, email] = await tryFn(() =>
  db.resources.emails.getFromPartition('byMessageId', '<abc123@gmail.com>')
)
```

### Listar Emails de um Remetente

```javascript
const [ok, emails] = await tryFn(() =>
  db.resources.emails.query({
    from: 'john@example.com',
    limit: 50
  })
)
```

### Buscar Anexos de um Email

```javascript
const [ok, attachments] = await tryFn(() =>
  db.resources.email_attachments.query({
    emailId: 'msg-123456',
    limit: 1000
  })
)
```

### Encontrar Emails com Spam Alto

```javascript
const [ok, spamEmails] = await tryFn(() =>
  db.resources.emails.query({
    spamScore: { $gte: 5 },
    status: 'stored',
    limit: 100
  })
)
```

### Listar Inbox de um User

```javascript
const [ok, inbox] = await tryFn(() =>
  db.resources.emails.getFromPartition('byUser', 'user@domain.com')
)
```

---

## Segurança e Compliance

### 1. Encryption de Dados Sensíveis

```javascript
const emailRecord = {
  // ... outros campos ...
  bodyText: 'secret|' + encryptedContent,  // Campo 'secret' = AES-256-GCM
  bodyHtml: 'secret|' + encryptedHTML,
}
```

### 2. Audit Trail

```javascript
// Headers brutos armazenados para auditoria
const headers = {
  received: [
    'from mail.example.com ([192.168.1.1]) by smtp.domain.com',
    'from client ([10.0.0.5]) by mail.example.com'
  ],
  spfRecord: 'pass',
  dkimSignature: 'v=1; a=rsa-sha256; ...',
  dmarc: 'pass'
}
```

### 3. GDPR - Direito ao Esquecimento

```javascript
// Para deletar email de um user
const [ok, email] = await tryFn(() =>
  db.resources.emails.get(emailId)
)

// 1. Delete anexos
const [attOk, attachments] = await tryFn(() =>
  db.resources.email_attachments.query({
    emailId: email.id
  })
)

for (const att of attachments) {
  await db.resources.email_attachments.delete(att.id)
}

// 2. Delete recipients
const [recOk, recipients] = await tryFn(() =>
  db.resources.email_recipients.query({
    emailId: email.id
  })
)

for (const rec of recipients) {
  await db.resources.email_recipients.delete(rec.id)
}

// 3. Delete headers
const [headOk, headers] = await tryFn(() =>
  db.resources.email_headers.query({
    emailId: email.id
  })
)

for (const header of headers) {
  await db.resources.email_headers.delete(header.id)
}

// 4. Delete email
await db.resources.emails.delete(email.id)

console.log('✅ Email and all related data deleted (GDPR compliant)')
```

---

## Estimativa de Espaço

Para cada email típico (~100KB + anexos):

```
Email record (metadata):      ~2 KB (em S3 headers)
Email body (S3 body):         ~50 KB (texto + HTML)
Anexos:                       ~100 KB (média)
Recipients:                   ~1 KB
Headers:                      ~5 KB

TOTAL por email:              ~160 KB

Para 10,000 emails:           1.6 GB
Para 100,000 emails:          16 GB
Para 1,000,000 emails:        160 GB
```

---

## Conclusion

Em Server Mode, tudo é armazenado em S3DB:

✅ **Emails**: Metadados + corpo em recurso `emails`
✅ **Anexos**: Blobs em recurso `email_attachments`
✅ **Recipients**: Detalhes em recurso `email_recipients`
✅ **Headers**: Audit trail em recurso `email_headers`

**Benefícios**:
- Zero data loss (tudo persistido)
- Queryable (poder buscar por qualquer campo)
- Particionado (performance)
- Seguro (encryption field-level)
- Compliant (GDPR support)
- Escalável (S3 + S3DB)

