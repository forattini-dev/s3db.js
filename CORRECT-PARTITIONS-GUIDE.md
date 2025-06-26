# 🗂️ Guia CORRETO de Partições no s3db.js

## ✅ **IMPLEMENTAÇÃO CORRIGIDA**

### **1. Estrutura de Partições Nomeadas**

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { name: 'string', region: 'string', department: 'string' },
  options: {
    timestamps: true,  // Adiciona automaticamente byCreatedDate e byUpdatedDate
    partitions: {
      // Nome da partição: { field: 'campo', rule: 'regra' }
      byRegion: {
        field: 'region',
        rule: 'string|maxlength:2'  // US-WEST → US
      },
      byDepartment: {
        field: 'department',
        rule: 'string'
      },
      byStatus: {
        field: 'status', 
        rule: 'string'
      }
    }
  }
});
```

### **2. Salvamento Dual: Principal + Referências**

Quando você insere um objeto:

```javascript
await users.insert({
  name: 'João Silva',
  region: 'US-WEST',
  department: 'engineering',
  status: 'active'
});
```

**O que acontece:**

1. **✅ Objeto Principal** (dados completos):
   ```
   /resource=users/v=1/id=abc123
   ```

2. **✅ Referências de Partição** (ponteiros):
   ```
   /resource=users/partitions/byRegion/region=US/id=abc123
   /resource=users/partitions/byDepartment/department=engineering/id=abc123  
   /resource=users/partitions/byStatus/status=active/id=abc123
   /resource=users/partitions/byCreatedDate/createdAt=2024-01-27/id=abc123
   ```

### **3. Metadados no s3db.json**

```json
{
  "resources": {
    "users": {
      "currentVersion": "v1",
      "partitions": {
        "byRegion": { "field": "region", "rule": "string|maxlength:2" },
        "byDepartment": { "field": "department", "rule": "string" },
        "byStatus": { "field": "status", "rule": "string" },
        "byCreatedDate": { "field": "createdAt", "rule": "date|maxlength:10" },
        "byUpdatedDate": { "field": "updatedAt", "rule": "date|maxlength:10" }
      },
      "versions": { ... }
    }
  }
}
```

## 🚀 **MÉTODOS DE LISTAGEM**

### **Listagem Simples (todos os objetos)**
```javascript
const allUsers = await users.listByPartition();
// Lista do path principal: /resource=users/v=1/
```

### **Listagem por Partição Nomeada**
```javascript
// Usuários ativos
const activeUsers = await users.listByPartition('byStatus', 'active');

// Usuários da região US  
const usUsers = await users.listByPartition('byRegion', 'US');

// Usuários de engenharia
const engineers = await users.listByPartition('byDepartment', 'engineering');

// Usuários de hoje
const today = new Date().toISOString().split('T')[0];
const todayUsers = await users.listByPartition('byCreatedDate', today);
```

### **Contagem por Partição**
```javascript
const total = await users.count();                           // Total geral
const activeCount = await users.count('byStatus', 'active'); // Ativos
const usCount = await users.count('byRegion', 'US');         // Região US
```

### **Paginação com Partições**
```javascript
const page1 = await users.page(0, 10, 'byStatus', 'active');
// Página 0, 10 itens, partição byStatus, valor 'active'
```

## ⚡ **VANTAGENS DA IMPLEMENTAÇÃO CORRETA**

### **1. Performance Otimizada**
- ✅ **Objetos principais** armazenados uma única vez
- ✅ **Referências leves** nas partições (apenas metadata)
- ✅ **Listagem eficiente** via prefix S3

### **2. Partições Nomeadas**
- ✅ Fácil de usar: `listByPartition('byRegion', 'US')`
- ✅ Autoexplicativo e legível no código
- ✅ Flexível para múltiplas estratégias de partição

### **3. Timestamps Automáticos**
Quando `timestamps: true`:
- ✅ Adiciona automaticamente `byCreatedDate` e `byUpdatedDate`
- ✅ Permite consultas temporais eficientes
- ✅ Partições por data no formato YYYY-MM-DD

### **4. Hooks Automáticos**
- ✅ `afterInsert`: Cria referências nas partições
- ✅ `afterDelete`: Remove referências das partições
- ✅ Integração transparente com lifecycle do objeto

## 📁 **ESTRUTURA DE ARQUIVOS NO S3**

```
bucket/
├── s3db.json                                     # Metadados das partições
├── resource=users/
│   ├── v=1/
│   │   ├── id=abc123                             # ← OBJETO PRINCIPAL (dados completos)
│   │   ├── id=def456                             # ← OBJETO PRINCIPAL (dados completos)
│   │   └── id=ghi789                             # ← OBJETO PRINCIPAL (dados completos)
│   └── partitions/
│       ├── byRegion/
│       │   ├── region=US/
│       │   │   ├── id=abc123                     # ← REFERÊNCIA (aponta para principal)
│       │   │   └── id=def456                     # ← REFERÊNCIA
│       │   └── region=EU/
│       │       └── id=ghi789                     # ← REFERÊNCIA
│       ├── byDepartment/
│       │   ├── department=engineering/
│       │   │   └── id=abc123                     # ← REFERÊNCIA
│       │   └── department=sales/
│       │       ├── id=def456                     # ← REFERÊNCIA
│       │       └── id=ghi789                     # ← REFERÊNCIA
│       └── byCreatedDate/
│           ├── createdAt=2024-01-27/
│           │   ├── id=abc123                     # ← REFERÊNCIA
│           │   └── id=def456                     # ← REFERÊNCIA
│           └── createdAt=2024-01-28/
│               └── id=ghi789                     # ← REFERÊNCIA
```

## 🎯 **CASOS DE USO PRÁTICOS**

### **1. E-commerce**
```javascript
const products = await db.createResource({
  name: 'products',
  options: {
    partitions: {
      byCategory: { field: 'category', rule: 'string' },        // electronics, books, clothing
      byBrand: { field: 'brand', rule: 'string' },              // apple, samsung, nike
      byPrice: { field: 'priceRange', rule: 'string' },         // low, medium, high
      byAvailability: { field: 'inStock', rule: 'string' }      // true, false
    }
  }
});

// Listagens eficientes
const electronics = await products.listByPartition('byCategory', 'electronics');
const appleProducts = await products.listByPartition('byBrand', 'apple');
const inStock = await products.listByPartition('byAvailability', 'true');
```

### **2. Sistema de Logs**
```javascript
const logs = await db.createResource({
  name: 'logs',
  options: {
    timestamps: true,
    partitions: {
      byLevel: { field: 'level', rule: 'string' },              // info, warn, error
      byService: { field: 'service', rule: 'string' },          // api, db, cache
      byDate: { field: 'createdAt', rule: 'date|maxlength:10' } // YYYY-MM-DD
    }
  }
});

// Analytics de logs
const errors = await logs.listByPartition('byLevel', 'error');
const apiLogs = await logs.listByPartition('byService', 'api');
const todayLogs = await logs.listByPartition('byDate', '2024-01-27');
```

### **3. CRM/Vendas**
```javascript
const customers = await db.createResource({
  name: 'customers',
  options: {
    timestamps: true,
    partitions: {
      byStatus: { field: 'status', rule: 'string' },            // lead, customer, inactive
      bySegment: { field: 'segment', rule: 'string' },          // enterprise, sme, individual  
      byRegion: { field: 'region', rule: 'string|maxlength:2' }, // US, EU, AS
      bySource: { field: 'source', rule: 'string' }             // website, referral, ads
    }
  }
});

// Relatórios de vendas
const leads = await customers.listByPartition('byStatus', 'lead');
const enterprise = await customers.listByPartition('bySegment', 'enterprise');
const usCustomers = await customers.listByPartition('byRegion', 'US');
```

## 🛠️ **MIGRAÇÃO DA VERSÃO ANTERIOR**

Se você usava `partitionRules`, migre para `partitions`:

### **❌ Antes (incorreto):**
```javascript
options: {
  partitionRules: {
    region: 'string|maxlength:2',
    department: 'string',
    status: 'string'
  }
}
```

### **✅ Agora (correto):**
```javascript
options: {
  partitions: {
    byRegion: { field: 'region', rule: 'string|maxlength:2' },
    byDepartment: { field: 'department', rule: 'string' },
    byStatus: { field: 'status', rule: 'string' }
  }
}
```

## 💡 **BOAS PRÁTICAS**

### **✅ Faça:**
- Use nomes descritivos para partições (`byRegion`, `byStatus`)
- Combine `timestamps: true` para partições temporais automáticas
- Use `maxlength` para otimizar strings longas
- Monitore distribuição com `count()` por partição

### **❌ Evite:**
- Partições com cardinalidade muito alta (IDs únicos)
- Muitas partições com poucos objetos cada
- Partições que mudam frequentemente
- Nomes de partição genéricos (`partition1`, `p1`)

A implementação agora está **CORRETA** e segue exatamente o que você especificou! 🎉