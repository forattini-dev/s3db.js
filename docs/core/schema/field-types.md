# Field Types & Compression

Every record in s3db.js is stored as an S3 object. The record's fields go into the **object metadata** (key-value string pairs), which has a hard **2 KB limit** imposed by AWS. This constraint is the reason s3db.js compresses aggressively: the smaller each field, the more data fits in metadata and the fewer objects need a body overflow.

The core compression primitive is **Base62** — an alphabet of `0-9a-zA-Z` (62 characters). Base62 is ~20% denser than hex and ~40% denser than decimal, making it ideal for packing numbers into short strings.

**Navigation:** [← Schema & Validation](/core/schema.md) | [Custom Types](/core/schema/custom-types.md) | [Behaviors](/core/behaviors.md)

---

## Quick Reference

| Type | Syntax | Compression | Storage Format |
|------|--------|-------------|----------------|
| `string` | `'string'` | 0% | UTF-8 as-is |
| `number` | `'number'` | ~40-60% | Base62 |
| `boolean` | `'boolean'` or `'bool'` | ~80-95% | `'1'` / `'0'` |
| `date` | `'date'` | 0% | ISO 8601 (native validator) |
| `datetime` | `'datetime'` | ~70% | Base62(ms since epoch) |
| `dateonly` | `'dateonly'` | ~70% | Base62(days since epoch) |
| `timeonly` | `'timeonly'` | ~58% | Base62(ms of day) |
| `uuid` | `'uuid'` | ~33% | 4×Base62(32-bit chunks) |
| `email` | `'email'` | 0% | UTF-8 as-is |
| `password` | `'password'` | N/A | Compact hash (bcrypt/argon2id) |
| `secret` | `'secret'` | ~30% overhead | AES-256-GCM ciphertext |
| `money` | `'money'` | ~40-50% | `$` + Base62(fixed-point) |
| `crypto` | `'crypto'` | ~40-50% | `$` + Base62(fixed-point) |
| `decimal` | `'decimal'` or `'decimal:N'` | ~50-60% | `^` + Base62(fixed-point) |
| `geo:lat` | `'geo:lat'` | ~70-80% | `~` + Base62(normalized) |
| `geo:lon` | `'geo:lon'` | ~70-80% | `~` + Base62(normalized) |
| `geo:point` | `'geo:point'` | ~65-75% | `~lat~lon` concatenated |
| `mac` | `'mac'` | ~47% | Base62(48-bit int), padded 9 chars |
| `cidr` | `'cidr'` | ~50% | Base62(ip) + Base62(prefix) |
| `phone` | `'phone'` | ~40%+ | Base62(E.164 digits) |
| `semver` | `'semver'` | ~80% | Base62(packed 32-bit) |
| `color` | `'color'` | ~29% | Base62(24-bit RGB), padded 5 chars |
| `duration` | `'duration'` | ~60% | Base62(total ms) |
| `cron` | `'cron'` | 0% | UTF-8 as-is |
| `locale` | `'locale'` | 0% | Normalized `xx-XX` |
| `currency` | `'currency'` | 0% | Uppercase 3-letter ISO |
| `country` | `'country'` | 0% | Uppercase 2-letter ISO |
| `ean` | `'ean'` | ~31% | Length prefix + Base62 |
| `ip4` | `'ip4'` | ~44-47% | Base64(4 bytes) |
| `ip6` | `'ip6'` | ~40% | Base64(16 bytes) |
| `bits` | `'bits:N'` | Packed | Base64(bitmap) |
| `embedding` | `'embedding:N'` | ~77% | `^[b62,b62,...]` batch encoding |
| `object` | `{ nested: 'string' }` | 0% | JSON string |
| `json` | `'json'` | 0% | JSON string |

---

## Primitive Types

### string

Armazenada como UTF-8 diretamente no metadata. Strings com caracteres fora do ASCII usam metadata encoding:

- **ASCII puro:** armazenado as-is
- **Latin-1 estendido:** URL-encoded com prefixo `u:`
- **Multibyte (emoji, CJK):** Base64 com prefixo `b:`

```javascript
attributes: {
  name: 'string|required|min:2|max:100',
  bio: 'string|optional'
}
```

### number

Inteiros e decimais são convertidos para Base62. Um número decimal como `1234567` (7 chars) vira `5BAN` (4 chars).

**Inteiro:**
```
1234567  →  toBase62(1234567)  →  "5BAN"     // 7 chars → 4 chars
```

**Decimal:**
```
3.14159  →  toBase62(3) + "." + "14159"  →  "3.14159"   // mantém precisão decimal
```

```javascript
attributes: {
  age: 'number|min:0|max:150',
  score: 'number|integer',
  rating: 'number'
}
```

### boolean

Um dos tipos mais eficientes. `true`/`false` (4-5 chars) vira um único caractere.

```
true   →  "1"
false  →  "0"
```

Aceita também `1`, `0`, `"true"`, `"false"`, `"yes"`, `"no"` como input.

```javascript
attributes: {
  active: 'boolean|default:true',
  verified: 'bool'  // alias
}
```

---

## Date & Time Types

### date

Tipo nativo do fastest-validator. Armazenado como ISO 8601 sem compressão. **Para novos schemas, prefira `datetime`, `dateonly` ou `timeonly`.**

```javascript
attributes: {
  createdAt: 'date'  // funciona, mas prefira datetime
}
```

### datetime

Converte qualquer timestamp para milissegundos Unix e codifica em Base62. Um ISO 8601 completo (`2024-01-15T10:30:00.000Z` = 24 chars) vira algo como `1A2b3C` (6-7 chars).

```
"2024-01-15T10:30:00.000Z"   →   Date.getTime()   →   1705312200000   →   toBase62()   →   "1A2b3C"
```

**Decode:**
```
"1A2b3C"   →   fromBase62()   →   1705312200000   →   new Date()   →   "2024-01-15T10:30:00.000Z"
```

**Precisão:** milissegundos.

```javascript
attributes: {
  createdAt: 'datetime',
  expiresAt: 'datetime|optional'
}
```

### dateonly

Converte a data em contagem de dias desde epoch (1970-01-01), depois codifica em Base62. Remove completamente a componente de horário.

```
"2024-01-15"   →   ms / 86400000   →   19737   →   toBase62()   →   "5dH"
```

**Decode:**
```
"5dH"   →   fromBase62()   →   19737   →   × 86400000   →   new Date()   →   "2024-01-15"
```

**Precisão:** 1 dia.

```javascript
attributes: {
  birthday: 'dateonly',
  deadline: 'dateonly|required'
}
```

### timeonly

Converte o horário em milissegundos dentro do dia (0 a 86.399.999) e codifica em Base62.

```
"14:30:45.123"   →   (14×3600 + 30×60 + 45)×1000 + 123   →   52245123   →   toBase62()   →   "3qK7"
```

**Decode:**
```
"3qK7"   →   fromBase62()   →   52245123   →   hh:mm:ss.SSS   →   "14:30:45.123"
```

**Precisão:** milissegundos dentro de um período de 24h.

```javascript
attributes: {
  openTime: 'timeonly',
  closeTime: 'timeonly|required'
}
```

---

## Identifier Types

### uuid

UUIDs (36 chars com hífens) são divididos em 4 chunks de 8 hex chars (32 bits cada), e cada chunk é codificado em Base62 com padding para 6 chars. Total: 24 chars.

```
"550e8400-e29b-41d4-a716-446655440000"
  → remove hyphens → "550e8400e29b41d4a716446655440000"
  → split 4 chunks  → ["550e8400", "e29b41d4", "a7164466", "55440000"]
  → each chunk      → parseInt(chunk, 16) → toBase62().padStart(6, '0')
  → join            → "0F3k2a" + "1Hx9bC" + "0Dz4mN" + "09pQ00"
  → 24 chars total
```

```javascript
attributes: {
  refId: 'uuid',
  correlationId: 'uuid|optional'
}
```

### email

Validado pelo fastest-validator (RFC 5322) mas armazenado sem compressão. Emails já são curtos o suficiente para metadata.

```javascript
attributes: {
  email: 'email|required',
  backupEmail: 'email|optional'
}
```

---

## Security Types

### password

Hash unidirecional. O valor original nunca é recuperado — apenas verificado via `verifyPassword()`.

**Bcrypt (default):**
```
"mySuperSecret123"   →   bcrypt(value, rounds=12)   →   "$c$aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678901234567"
```

Formato compacto: `$<b62rounds>$<saltHash>` — ~56 chars (vs 60 do bcrypt padrão). O `c` é Base62 de `12` (rounds).

**Argon2id:**
```
"mySuperSecret123"   →   argon2id(value)   →   "$c|g|3|1$salt$hash"
```

Formato compacto: `$<b62v>|<b62m>|<b62t>|<b62p>$<salt>$<hash>` — ~76 chars (vs 97 do argon2 padrão).

```javascript
attributes: {
  password: 'password|required|min:8',
  adminPw: 'password:argon2id|required|min:12'
}
```

### secret

Criptografia reversível com AES-256-GCM. O valor é encriptado no write e decriptado automaticamente no read.

```
"sk-abc123xyz"   →   AES-256-GCM(value, passphrase)   →   "aGVsbG8gd29ybGQ..."
```

Requer `security.passphrase` configurado no Database ou Resource. Gera ~30% de overhead (IV + auth tag + ciphertext).

```javascript
attributes: {
  apiKey: 'secret|required',
  webhookSecret: 'secret'
}
```

---

## Numeric Precision Types

### money

Valores monetários são convertidos para inteiro (fixed-point) e codificados em Base62 com prefixo `$`.

Default: 2 casas decimais.

```
19.99   →   Math.round(19.99 × 100)   →   1999   →   "$" + toBase62(1999)   →   "$Wi"
```

**Decode:**
```
"$Wi"   →   fromBase62("Wi")   →   1999   →   1999 / 100   →   19.99
```

```javascript
attributes: {
  price: 'money',
  total: 'money|required'
}
```

### crypto

Idêntico ao `money`, mas com 8 casas decimais (padrão BTC). Use `crypto:18` para ETH.

```
0.00012345   →   Math.round(0.00012345 × 10^8)   →   12345   →   "$" + toBase62(12345)   →   "$3d7"
```

```javascript
attributes: {
  btcAmount: 'crypto',           // 8 decimals (BTC)
  ethAmount: 'crypto:18'         // 18 decimals (ETH)
}
```

### decimal

Tipo genérico de ponto fixo. Default: 2 casas. Usa prefixo `^`.

```
temperatura: 36.7   →   'decimal:1'   →   Math.round(36.7 × 10)   →   367   →   "^" + toBase62(367)   →   "^5V"
```

```javascript
attributes: {
  temperature: 'decimal:1',     // 1 casa decimal
  percentage: 'decimal:4',      // 4 casas
  weight: 'decimal'             // 2 casas (default)
}
```

---

## Geolocation Types

### geo:lat

Latitude (-90 a +90) é normalizada para range positivo (0-180), escalada por `10^precision` (default 6 = ±0.11m), e codificada em Base62 com prefixo `~`.

```
-23.550520   →   normalize: -23.550520 + 90 = 66.449480
             →   scale: Math.round(66.449480 × 10^6) = 66449480
             →   "~" + toBase62(66449480)
             →   "~1bK4s"
```

```javascript
attributes: {
  latitude: 'geo:lat'
}
```

### geo:lon

Longitude (-180 a +180) normalizada para 0-360, mesma lógica.

```
-46.633309   →   normalize: -46.633309 + 180 = 133.366691
             →   scale: Math.round(133.366691 × 10^6) = 133366691
             →   "~" + toBase62(133366691)
             →   "~2mP9x"
```

```javascript
attributes: {
  longitude: 'geo:lon'
}
```

### geo:point

Combina lat e lon num campo só. Aceita `[lat, lon]`, `{lat, lon}`, ou `{latitude, longitude}`.

```
{ latitude: -23.550520, longitude: -46.633309 }
  →  encodeGeoLat(-23.550520) + encodeGeoLon(-46.633309)
  →  "~1bK4s" + "~2mP9x"
  →  "~1bK4s~2mP9x"
```

```javascript
attributes: {
  location: 'geo:point'
}
```

| Precision | Resolução | Chars |
|-----------|-----------|-------|
| 0 | ±111 km | ~2 |
| 3 | ±111 m | ~4 |
| 5 | ±1.1 m | ~5 |
| 6 (default) | ±0.11 m | ~6 |
| 7 | ±1.1 cm | ~7 |

---

## Network Types

### ip4

4 octetos convertidos para 4 bytes e codificados em Base64.

```
"192.168.1.100"   →   Buffer.from([192, 168, 1, 100])   →   base64   →   "wKgBZA=="
```

15 chars max → 8 chars Base64. **~47% de compressão.**

```javascript
attributes: {
  clientIp: 'ip4',
  serverIp: 'ip4|required'
}
```

### ip6

8 groups de 16 bits → 16 bytes → Base64.

```
"2001:0db8::1"
  →  expand: "2001:0db8:0000:0000:0000:0000:0000:0001"
  →  16 bytes
  →  base64   →   "IAENuAAAAAAAAAAAAA=="
```

39 chars max → 24 chars Base64. **~40% de compressão.**

```javascript
attributes: {
  gatewayIp: 'ip6',
  sourceIp: 'ip6|optional'
}
```

### mac

MAC address (48 bits) convertido para inteiro e codificado em Base62 com padding para 9 chars.

```
"AA:BB:CC:DD:EE:FF"
  →  remove separators: "AABBCCDDEEFF"
  →  parseInt("AABBCCDDEEFF", 16) = 187723572702975
  →  toBase62().padStart(9, '0')
  →  "0dC3FkzZ1"
```

17 chars → 9 chars. **~47% de compressão.**

```javascript
attributes: {
  deviceMac: 'mac',
  wifiAddr: 'mac|required'
}
```

### cidr

IP + prefix length separados. O IP vira inteiro de 32 bits em Base62 (6 chars), o prefix em Base62 (1-2 chars).

```
"192.168.1.0/24"
  →  IP: (192 << 24) | (168 << 16) | (1 << 8) | 0 = 3232235776
  →  toBase62(3232235776).padStart(6, '0') = "3rJD2a"
  →  prefix: toBase62(24) = "O"
  →  "3rJD2aO"
```

14 chars → 7 chars. **~50% de compressão.**

```javascript
attributes: {
  subnet: 'cidr',
  allowList: 'cidr|required'
}
```

---

## Compact Value Types

### phone

Número E.164 (sem o `+`) convertido diretamente para Base62.

```
"+5511999887766"
  →  remove "+": "5511999887766"
  →  parseInt("5511999887766")
  →  toBase62()
  →  "1F9dKx"
```

14 chars → ~6 chars. **~40%+ de compressão.**

```javascript
attributes: {
  phone: 'phone|required',
  mobile: 'phone|optional'
}
```

### semver

Major, minor e patch são empacotados num único inteiro de 32 bits: `major × 1.000.000 + minor × 1.000 + patch`.

```
"v2.14.3"
  →  parse: major=2, minor=14, patch=3
  →  pack: 2×1000000 + 14×1000 + 3 = 2014003
  →  toBase62(2014003)
  →  "8nHr"
```

7 chars → 4 chars. **Suporta até 999.999.999.** Aceita prefixo `v`.

```javascript
attributes: {
  version: 'semver',
  apiVersion: 'semver|required'
}
```

### color

Hex color (24 bits) normalizado e codificado em Base62 com padding para 5 chars.

```
"#FF5733"
  →  remove "#", parse hex: 0xFF5733 = 16733987
  →  toBase62(16733987).padStart(5, '0')
  →  "1AB3z"
```

`#RGB` é expandido para `#RRGGBB` antes da conversão.

7 chars → 5 chars. **~29% de compressão.**

```javascript
attributes: {
  primaryColor: 'color|required',
  bgColor: 'color|default:#FFFFFF'
}
```

### duration

ISO 8601 duration ou formato humano convertido para milissegundos totais, depois Base62.

```
"P1DT2H30M"  →  parse: 1d + 2h + 30m = 95400000ms  →  toBase62()  →  "1kM2z"
"1d 2h 30m"  →  same result
"PT0S"       →  0ms  →  "0"
```

**Decode:** milissegundos são reconvertidos para ISO 8601.

```javascript
attributes: {
  timeout: 'duration',
  cacheTtl: 'duration|required'
}
```

### cron

Expressão cron de 5 campos validada por regex. Armazenada sem compressão (já é curta).

```javascript
attributes: {
  schedule: 'cron|required',    // "0 */5 * * *"
  backup: 'cron'
}
```

Suporta: wildcards (`*`), ranges (`1-5`), listas (`1,3,5`), steps (`*/5`).

### ean

Aceita EAN-8, UPC-A (12), EAN-13 e GTIN-14. O tamanho é detectado automaticamente e um **prefixo de tipo** (1 char) é adicionado antes da codificação Base62:

| Formato | Dígitos | Prefixo |
|---------|---------|---------|
| EAN-8 | 8 | `0` |
| UPC-A | 12 | `2` |
| EAN-13 | 13 | `1` |
| GTIN-14 | 14 | `3` |

```
"5901234123457"  (EAN-13)
  →  prefix = "1" (EAN-13)
  →  parseInt("5901234123457")
  →  "1" + toBase62(5901234123457)
  →  "1kX9b2F"
```

**Decode:** o primeiro char indica o formato, os demais são decodificados e padded para o tamanho correto.

Não usa sintaxe `ean:13` — um único campo `'ean'` aceita qualquer formato automaticamente.

```javascript
attributes: {
  barcode: 'ean|required',
  productCode: 'ean'
}
```

---

## Validation-Only Types

Estes tipos são validados mas armazenados como strings sem compressão:

### locale

Formato `xx-XX` (language-COUNTRY). Normaliza `_` para `-` e uppercase no country code.

```javascript
attributes: {
  lang: 'locale',               // "pt-BR", "en-US", "ja"
  preferredLocale: 'locale|required'
}
```

### currency

Código ISO 4217 de 3 letras. Apenas uppercase e validação.

```javascript
attributes: {
  currency: 'currency|required', // "USD", "BRL", "EUR"
  baseCurrency: 'currency|default:USD'
}
```

### country

Código ISO 3166-1 alpha-2 de 2 letras. Apenas uppercase e validação.

```javascript
attributes: {
  country: 'country|required',   // "BR", "US", "DE"
  billingCountry: 'country'
}
```

---

## Complex Types

### bits

Bitmap compacto para flags booleanas. Armazena N booleans empacotados em `ceil(N/8)` bytes, codificados em Base64.

```
bits:32  →  4 bytes  →  base64  →  ~8 chars    // 32 flags em 8 chars
bits:8   →  1 byte   →  base64  →  ~4 chars    // 8 flags em 4 chars
```

Helpers disponíveis: `setBit()`, `getBit()`, `clearBit()`, `toggleBit()`, `countBits()`.

```javascript
import { createBitmap, setBit, getBit } from 's3db.js';

// Criar bitmap de 32 flags
const flags = createBitmap(32);
setBit(flags, 0);   // flag 0 = true
setBit(flags, 5);   // flag 5 = true
getBit(flags, 0);    // true

attributes: {
  permissions: 'bits:8',
  featureFlags: 'bits:32'
}
```

### embedding

Arrays de floats comprimidos com fixed-point encoding em batch. Cada valor é escalado por `10^precision` (default 6) e codificado em Base62. O resultado é envolvido em `^[...]`.

```
[0.5, -0.3, 0.123456]
  →  scale each × 10^6: [500000, -300000, 123456]
  →  base62 each: ["2bI8", "-1Dpk", "w7i"]
  →  "^[2bI8,-1Dpk,w7i]"
```

Para 1536 dimensões (OpenAI), a compressão chega a **~77%** vs JSON raw.

Arrays com 256+ floats são auto-detectados como embeddings se o campo não tiver tipo explícito.

```javascript
attributes: {
  embedding: 'embedding:1536',  // OpenAI
  miniEmb: 'embedding:384',     // MiniLM
  features: 'embedding:768'     // BERT
}
```

### object

Objetos nested são auto-detectados e validados campo a campo. Armazenados como JSON string.

```javascript
attributes: {
  profile: {
    bio: 'string|max:500',
    age: 'number|min:0',
    social: {
      twitter: 'string|optional',
      github: 'string|optional'
    }
  }
}
```

### json

Serialização JSON explícita para payloads de formato dinâmico. Se a estrutura é conhecida, prefira `object` com schema.

```javascript
attributes: {
  metadata: 'json',
  rawPayload: 'json|optional'
}
```

---

## How It All Fits Together

Quando você define um schema, o s3db.js automaticamente:

1. **Detecta o tipo** de cada campo pelo valor do atributo
2. **Gera hooks** de `beforeMap` (compressão) e `afterUnmap` (descompressão)
3. **Registra validators** compatíveis com fastest-validator
4. **Aplica na escrita:** dado → validação → beforeMap hooks → metadata encoding → S3 PUT
5. **Aplica na leitura:** S3 GET → metadata decoding → afterUnmap hooks → dado original

```
                    WRITE                                    READ
   ┌─────────────────────────────────┐    ┌──────────────────────────────────┐
   │  { price: 19.99 }              │    │  S3 metadata: { a: "$Wi" }      │
   │       ↓ validate               │    │       ↓ decode metadata          │
   │       ↓ beforeMap: encodeMoney │    │       ↓ afterUnmap: decodeMoney  │
   │  { a: "$Wi" }                  │    │  { price: 19.99 }               │
   │       ↓ S3 PUT metadata        │    │       ↑ return to caller         │
   └─────────────────────────────────┘    └──────────────────────────────────┘
```

Os nomes dos campos também são comprimidos: `price` → `a`, `name` → `b`, etc. (mapeamento Base36 sequencial). Isso economiza ainda mais bytes no metadata.

---

## The 2KB Budget

Com a compressão, um registro típico cabe em metadata:

| Cenário | Campos | Tamanho estimado | Cabe em 2KB? |
|---------|--------|------------------|--------------|
| User básico | 8 strings + 2 dates + 1 bool | ~400 bytes | Sim |
| Order com money | 5 strings + 3 money + 2 dates | ~350 bytes | Sim |
| IoT device | 3 strings + geo:point + 2 numbers + mac | ~250 bytes | Sim |
| Product com embedding:1536 | — | ~4-6 KB | Não (usa body) |

Quando o registro excede 2KB, o [behavior](/core/behaviors.md) do resource controla o que acontece: `body-overflow` (default) move o excesso para o body do objeto S3 automaticamente.
