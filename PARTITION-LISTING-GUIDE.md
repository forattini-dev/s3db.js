# 🗂️ Guia de Listagem com Partições no s3db.js

## 📋 **MÉTODOS IMPLEMENTADOS**

### 1. **`listPartitions()`** - Descoberta de Partições
Descobre todas as partições disponíveis no resource.

```javascript
const partitions = await users.listPartitions();
// Retorna: { region: ['US', 'EU', 'AS'], department: ['engineering', 'sales'], status: ['active', 'inactive'] }
```

### 2. **`getPartitionValues(field)`** - Valores de Campo
Retorna valores únicos de um campo de partição específico.

```javascript
const regions = await users.getPartitionValues('region');
// Retorna: ['US', 'EU', 'AS']
```

### 3. **`listByPartition(partitionData, options)`** - Listagem Filtrada
Lista objetos completos filtrados por critérios de partição.

```javascript
// Listar usuários ativos da região US
const activeUS = await users.listByPartition({ 
  region: 'US', 
  status: 'active' 
}, {
  limit: 10,           // Paginação
  offset: 0,
  includeContent: true // Incluir conteúdo binário
});
```

### 4. **`findBy(criteria, options)`** - Busca Avançada
Busca flexível com critérios de partição + dados com operadores.

```javascript
const results = await users.findBy({
  region: 'US',                    // Critério de partição (eficiente)
  salary: { $gt: 100000 },        // Operador de comparação
  name: /joão/i,                   // Regex
  department: { $in: ['engineering', 'sales'] }
}, {
  sortBy: 'salary',
  sortOrder: 'desc',
  limit: 20,
  offset: 0
});
```

**Operadores suportados:**
- `$gt`, `$gte`, `$lt`, `$lte` - Comparação numérica
- `$ne` - Diferente
- `$in`, `$nin` - Inclusão/exclusão em array
- `RegExp` - Expressões regulares

### 5. **`groupBy(field, partitionFilter, options)`** - Agrupamento
Agrupa objetos por valores de um campo de partição.

```javascript
// Agrupar por departamento
const byDepartment = await users.groupBy('department');
// Retorna: { engineering: { items: [...], count: 5 }, sales: { items: [...], count: 3 } }

// Agrupar por região, apenas usuários ativos  
const activeByRegion = await users.groupBy('region', { status: 'active' });
```

### 6. **`getPartitionStats()`** - Estatísticas
Retorna estatísticas completas das partições e distribuição de dados.

```javascript
const stats = await users.getPartitionStats();
// Retorna:
// {
//   hasPartitions: true,
//   totalObjects: 1000,
//   partitionFields: ['region', 'department', 'status'],
//   partitionCounts: {
//     region: { US: 600, EU: 300, AS: 100 },
//     department: { engineering: 400, sales: 350, marketing: 250 }
//   }
// }
```

## 🚀 **ESTRUTURA DAS PARTIÇÕES**

### **Caminhos S3 Gerados:**
```
// Sem partição:
/resource=users/v=1/id=abc123

// Com partições:  
/resource=users/partitions/region=US/department=engineering/status=active/id=abc123
```

### **Definição de Partições:**
```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { name: 'string', email: 'string', region: 'string' },
  options: {
    partitionRules: {
      region: 'string|maxlength:2',     // Trunca para 2 chars: US-WEST → US
      department: 'string',             // Valor completo
      status: 'string',                 // active, inactive, pending
      createdAt: 'date|maxlength:10'    // YYYY-MM-DD format
    }
  }
});
```

## ⚡ **ESTRATÉGIAS DE PERFORMANCE**

### **1. Critérios de Partição Primeiro**
```javascript
// ✅ Eficiente - usa prefix S3
const results = await users.listByPartition({ region: 'US', status: 'active' });

// ❌ Menos eficiente - lista tudo e filtra
const results = await users.findBy({ region: 'US', name: /silva/i });
```

### **2. Combine Partições com Filtros**
```javascript
// ✅ Máxima eficiência
const engineersUS = await users.findBy({
  region: 'US',              // Partição = busca eficiente no S3
  department: 'engineering', // Partição = busca eficiente no S3  
  salary: { $gt: 120000 }    // Filtro de dados = aplicado após busca
});
```

### **3. Use Agrupamento para Analytics**
```javascript
// Distribuição por região
const regionStats = await users.groupBy('region');

// Performance por departamento (apenas ativos)
const deptPerformance = await users.groupBy('department', { status: 'active' });
```

## 🎯 **CASOS DE USO PRÁTICOS**

### **1. Dashboard de Analytics**
```javascript
// Estatísticas gerais
const stats = await users.getPartitionStats();

// Usuários por região
const usersByRegion = await users.groupBy('region');

// Top performers por departamento  
const topPerformers = await users.findBy({
  status: 'active',
  salary: { $gt: 100000 }
}, { sortBy: 'salary', sortOrder: 'desc', limit: 10 });
```

### **2. Relatórios Regionais**
```javascript
// Relatório completo da região US
const usReport = {
  total: await users.count({ region: 'US' }),
  active: await users.count({ region: 'US', status: 'active' }),
  byDepartment: await users.groupBy('department', { region: 'US' }),
  recent: await users.listByPartition({ region: 'US' }, { 
    sortBy: 'createdAt', 
    sortOrder: 'desc', 
    limit: 10 
  })
};
```

### **3. Busca Temporal**
```javascript
// Usuários cadastrados hoje
const today = new Date().toISOString().split('T')[0];
const todayUsers = await users.listByPartition({ createdAt: today });

// Usuários de dezembro de 2023
const decemberUsers = await users.listByPartition({ createdAt: '2023-12' });
```

### **4. Paginação Eficiente**
```javascript
// Página 1: usuários ativos da região US
const page1 = await users.listByPartition({ region: 'US', status: 'active' }, {
  limit: 20,
  offset: 0
});

// Página 2
const page2 = await users.listByPartition({ region: 'US', status: 'active' }, {
  limit: 20, 
  offset: 20
});
```

## 🏗️ **BOAS PRÁTICAS**

### **✅ Faça:**
- Use campos frequentemente consultados como partições
- Combine múltiplos critérios de partição
- Aplique `maxlength` em strings longas para eficiência
- Use partições de data para dados temporais
- Monitore estatísticas para otimizar partições

### **❌ Evite:**
- Muitas partições com poucos objetos cada
- Partições com cardinalidade muito alta (ex: IDs únicos)
- Critérios de busca apenas em dados (sem partições)
- Partições que mudam frequentemente

## 💡 **QUANDO USAR PARTIÇÕES**

### **Ideal para:**
- **Dados geográficos**: região, país, cidade
- **Dados temporais**: ano, mês, data
- **Categorização**: departamento, tipo, status
- **Hierarquias**: organização, projeto, categoria

### **Exemplos de Partições Eficazes:**
```javascript
// E-commerce
partitionRules: {
  category: 'string',           // electronics, clothing, books
  region: 'string|maxlength:2', // US, EU, AS
  createdAt: 'date|maxlength:7' // YYYY-MM
}

// Sistema de logs
partitionRules: {
  level: 'string',              // info, warn, error
  service: 'string',            // api, db, cache
  createdAt: 'date|maxlength:10' // YYYY-MM-DD
}

// CRM
partitionRules: {
  status: 'string',             // lead, customer, inactive
  segment: 'string',            // enterprise, sme, individual
  region: 'string|maxlength:2'  // US, EU, AS
}
```

Com essas implementações, o s3db.js oferece capacidades avançadas de listagem e busca, mantendo alta performance através do uso inteligente das estruturas de partições do S3! 🚀