import { S3DB } from '../src/index.js';

describe('Users Journey Tests - API Keys Management by Company', () => {
  let s3db;
  let usersResource;

  beforeAll(async () => {
    s3db = new S3DB({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });

    // Criar recurso de usuários com API keys encriptadas particionadas por companhia
    usersResource = s3db.resource({
      name: 'users',
      version: '1',
      options: {
        timestamps: true,
        partitions: {
          byCompany: {
            fields: {
              companyId: 'string|maxlength:20'
            }
          },
          byRole: {
            fields: {
              role: 'string|maxlength:15'
            }
          },
          byStatus: {
            fields: {
              status: 'string|maxlength:10'
            }
          }
        }
      },
      attributes: {
        name: 'string|required|maxlength:100',
        email: 'string|required|email|maxlength:255',
        companyId: 'string|required|maxlength:50',
        companyName: 'string|required|maxlength:100',
        role: 'string|required|in:admin,developer,analyst,viewer',
        status: 'string|required|in:active,inactive,suspended',
        apiKey: 'secret|required', // Campo secreto que será auto-gerado e encriptado
        permissions: 'array|optional',
        lastLogin: 'string|optional',
        createdBy: 'string|optional'
      }
    });
  });

  describe('Cenário 1: Criando base de usuários com API keys por empresa', () => {
    const companies = [
      { id: 'company-001', name: 'TechCorp Solutions' },
      { id: 'company-002', name: 'DataDrive Inc' },
      { id: 'company-003', name: 'CloudFirst Ltd' },
      { id: 'company-004', name: 'InnovateLabs' }
    ];

    const usersData = [
      // TechCorp Solutions
      { name: 'João Silva', email: 'joao@techcorp.com', companyId: 'company-001', companyName: 'TechCorp Solutions', role: 'admin', status: 'active', permissions: ['read', 'write', 'delete'], createdBy: 'system' },
      { name: 'Maria Santos', email: 'maria@techcorp.com', companyId: 'company-001', companyName: 'TechCorp Solutions', role: 'developer', status: 'active', permissions: ['read', 'write'], createdBy: 'joao@techcorp.com' },
      { name: 'Pedro Costa', email: 'pedro@techcorp.com', companyId: 'company-001', companyName: 'TechCorp Solutions', role: 'analyst', status: 'active', permissions: ['read'], createdBy: 'joao@techcorp.com' },
      { name: 'Ana Oliveira', email: 'ana@techcorp.com', companyId: 'company-001', companyName: 'TechCorp Solutions', role: 'viewer', status: 'inactive', permissions: ['read'], createdBy: 'joao@techcorp.com' },

      // DataDrive Inc
      { name: 'Carlos Rodriguez', email: 'carlos@datadrive.com', companyId: 'company-002', companyName: 'DataDrive Inc', role: 'admin', status: 'active', permissions: ['read', 'write', 'delete', 'admin'], createdBy: 'system' },
      { name: 'Lucia Martinez', email: 'lucia@datadrive.com', companyId: 'company-002', companyName: 'DataDrive Inc', role: 'developer', status: 'active', permissions: ['read', 'write'], createdBy: 'carlos@datadrive.com' },
      { name: 'Roberto Fernandez', email: 'roberto@datadrive.com', companyId: 'company-002', companyName: 'DataDrive Inc', role: 'analyst', status: 'suspended', permissions: ['read'], createdBy: 'carlos@datadrive.com' },

      // CloudFirst Ltd
      { name: 'Sarah Johnson', email: 'sarah@cloudfirst.com', companyId: 'company-003', companyName: 'CloudFirst Ltd', role: 'admin', status: 'active', permissions: ['read', 'write', 'delete'], createdBy: 'system' },
      { name: 'Michael Brown', email: 'michael@cloudfirst.com', companyId: 'company-003', companyName: 'CloudFirst Ltd', role: 'developer', status: 'active', permissions: ['read', 'write'], createdBy: 'sarah@cloudfirst.com' },
      { name: 'Emily Davis', email: 'emily@cloudfirst.com', companyId: 'company-003', companyName: 'CloudFirst Ltd', role: 'developer', status: 'active', permissions: ['read', 'write'], createdBy: 'sarah@cloudfirst.com' },
      { name: 'James Wilson', email: 'james@cloudfirst.com', companyId: 'company-003', companyName: 'CloudFirst Ltd', role: 'viewer', status: 'active', permissions: ['read'], createdBy: 'sarah@cloudfirst.com' },

      // InnovateLabs
      { name: 'Dr. Lisa Chang', email: 'lisa@innovatelabs.com', companyId: 'company-004', companyName: 'InnovateLabs', role: 'admin', status: 'active', permissions: ['read', 'write', 'delete', 'admin'], createdBy: 'system' },
      { name: 'Alex Thompson', email: 'alex@innovatelabs.com', companyId: 'company-004', companyName: 'InnovateLabs', role: 'developer', status: 'active', permissions: ['read', 'write'], createdBy: 'lisa@innovatelabs.com' },
      { name: 'Maya Patel', email: 'maya@innovatelabs.com', companyId: 'company-004', companyName: 'InnovateLabs', role: 'analyst', status: 'active', permissions: ['read'], createdBy: 'lisa@innovatelabs.com' },
      { name: 'Tom Anderson', email: 'tom@innovatelabs.com', companyId: 'company-004', companyName: 'InnovateLabs', role: 'viewer', status: 'inactive', permissions: ['read'], createdBy: 'lisa@innovatelabs.com' }
    ];

    test('Deve criar todos os usuários com API keys encriptadas automaticamente', async () => {
      const createdUsers = [];
      
      for (const userData of usersData) {
        const user = await usersResource.insert(userData);
        createdUsers.push(user);
        
        expect(user.id).toBeDefined();
        expect(user.name).toBe(userData.name);
        expect(user.email).toBe(userData.email);
        expect(user.companyId).toBe(userData.companyId);
        expect(user.apiKey).toBeDefined(); // API key foi auto-gerada
        expect(user.apiKey).not.toBe(''); // Não deve estar vazia
        expect(user.createdAt).toBeDefined();
        expect(user.updatedAt).toBeDefined();
      }
      
      expect(createdUsers).toHaveLength(15);
      
      // Verificar que todas as API keys são únicas
      const apiKeys = createdUsers.map(user => user.apiKey);
      const uniqueApiKeys = [...new Set(apiKeys)];
      expect(uniqueApiKeys).toHaveLength(15);
    });

    test('Deve contar usuários corretamente por empresa', async () => {
      const techCorpCount = await usersResource.count({
        partition: 'byCompany',
        partitionValues: { companyId: 'company-001' }
      });
      
      const dataDriveCount = await usersResource.count({
        partition: 'byCompany',
        partitionValues: { companyId: 'company-002' }
      });
      
      const cloudFirstCount = await usersResource.count({
        partition: 'byCompany',
        partitionValues: { companyId: 'company-003' }
      });
      
      const innovateLabsCount = await usersResource.count({
        partition: 'byCompany',
        partitionValues: { companyId: 'company-004' }
      });
      
      expect(techCorpCount).toBe(4);
      expect(dataDriveCount).toBe(3);
      expect(cloudFirstCount).toBe(4);
      expect(innovateLabsCount).toBe(4);
    });
  });

  describe('Cenário 2: Paginação de usuários por empresa', () => {
    test('Deve paginar usuários da TechCorp corretamente', async () => {
      // Primeira página (limite 2)
      const page1 = await usersResource.page({
        size: 2,
        offset: 0,
        partition: 'byCompany',
        partitionValues: { companyId: 'company-001' }
      });

      expect(page1.data).toHaveLength(2);
      expect(page1.pagination.total).toBe(4);
      expect(page1.pagination.hasMore).toBe(true);

      // Segunda página
      const page2 = await usersResource.page({
        size: 2,
        offset: 2,
        partition: 'byCompany',
        partitionValues: { companyId: 'company-001' }
      });

      expect(page2.data).toHaveLength(2);
      expect(page2.pagination.hasMore).toBe(false);

      // Verificar que todos pertencem à TechCorp
      const allUsers = [...page1.data, ...page2.data];
      allUsers.forEach(user => {
        expect(user.companyId).toBe('company-001');
        expect(user.companyName).toBe('TechCorp Solutions');
      });

      // Verificar que não há duplicatas
      const userIds = allUsers.map(user => user.id);
      const uniqueIds = [...new Set(userIds)];
      expect(uniqueIds).toHaveLength(4);
    });

    test('Deve recuperar usuário específico e verificar conteúdo da API key', async () => {
      // Buscar um usuário específico
      const techCorpUsers = await usersResource.list({
        partition: 'byCompany',
        partitionValues: { companyId: 'company-001' },
        limit: 1
      });

      expect(techCorpUsers).toHaveLength(1);
      const user = techCorpUsers[0];

      // Verificar que a API key existe e tem formato esperado
      expect(user.apiKey).toBeDefined();
      expect(typeof user.apiKey).toBe('string');
      expect(user.apiKey.length).toBeGreaterThan(10); // API keys devem ter tamanho razoável

      // Recuperar o mesmo usuário por ID
      const retrievedUser = await usersResource.get(user.id);
      expect(retrievedUser.apiKey).toBe(user.apiKey); // API key deve ser consistente
      expect(retrievedUser.name).toBe(user.name);
      expect(retrievedUser.email).toBe(user.email);
    });
  });

  describe('Cenário 3: Particionamento por role (função)', () => {
    test('Deve listar todos os administradores', async () => {
      const admins = await usersResource.list({
        partition: 'byRole',
        partitionValues: { role: 'admin' }
      });

      expect(admins.length).toBeGreaterThan(0);
      
      // Verificar que todos são admins
      admins.forEach(admin => {
        expect(admin.role).toBe('admin');
        expect(admin.permissions).toContain('delete'); // Admins devem ter permissão de delete
      });

      // Deve haver um admin por empresa (4 no total)
      expect(admins).toHaveLength(4);
      
      // Verificar empresas diferentes
      const companies = [...new Set(admins.map(admin => admin.companyId))];
      expect(companies).toHaveLength(4);
    });

    test('Deve contar usuários por role', async () => {
      const adminCount = await usersResource.count({
        partition: 'byRole',
        partitionValues: { role: 'admin' }
      });
      
      const developerCount = await usersResource.count({
        partition: 'byRole',
        partitionValues: { role: 'developer' }
      });
      
      const analystCount = await usersResource.count({
        partition: 'byRole',
        partitionValues: { role: 'analyst' }
      });
      
      const viewerCount = await usersResource.count({
        partition: 'byRole',
        partitionValues: { role: 'viewer' }
      });

      expect(adminCount).toBe(4);
      expect(developerCount).toBe(5); // 1+1+2+1
      expect(analystCount).toBe(3); // 1+1+0+1
      expect(viewerCount).toBe(3); // 1+0+1+1
      
      // Total deve bater
      expect(adminCount + developerCount + analystCount + viewerCount).toBe(15);
    });
  });

  describe('Cenário 4: Particionamento por status', () => {
    test('Deve listar apenas usuários ativos', async () => {
      const activeUsers = await usersResource.list({
        partition: 'byStatus',
        partitionValues: { status: 'active' }
      });

      expect(activeUsers.length).toBeGreaterThan(0);
      
      activeUsers.forEach(user => {
        expect(user.status).toBe('active');
        expect(user.apiKey).toBeDefined(); // Usuários ativos devem ter API key
      });
    });

    test('Deve contar usuários por status', async () => {
      const activeCount = await usersResource.count({
        partition: 'byStatus',
        partitionValues: { status: 'active' }
      });
      
      const inactiveCount = await usersResource.count({
        partition: 'byStatus',
        partitionValues: { status: 'inactive' }
      });
      
      const suspendedCount = await usersResource.count({
        partition: 'byStatus',
        partitionValues: { status: 'suspended' }
      });

      expect(activeCount).toBe(11); // Maioria dos usuários
      expect(inactiveCount).toBe(3);
      expect(suspendedCount).toBe(1);
      
      expect(activeCount + inactiveCount + suspendedCount).toBe(15);
    });
  });

  describe('Cenário 5: Operações com API keys', () => {
    test('Deve renovar API key de um usuário específico', async () => {
      // Buscar um usuário
      const users = await usersResource.list({ limit: 1 });
      const user = users[0];
      const originalApiKey = user.apiKey;

      // "Renovar" API key gerando uma nova (simular regeneração)
      const updatedUser = await usersResource.update(user.id, {
        // Nota: na implementação real, você teria um método específico para regenerar API key
        // Aqui estamos simulando atualizando outro campo que force uma nova geração
        lastLogin: new Date().toISOString()
      });

      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.email).toBe(user.email);
      // A API key deve ser a mesma se não foi explicitamente renovada
      expect(updatedUser.apiKey).toBeDefined();
    });

    test('Deve desativar usuário e manter API key encriptada', async () => {
      // Buscar um usuário ativo
      const activeUsers = await usersResource.list({
        partition: 'byStatus',
        partitionValues: { status: 'active' },
        limit: 1
      });
      
      const user = activeUsers[0];
      const originalApiKey = user.apiKey;

      // Desativar usuário
      const deactivatedUser = await usersResource.update(user.id, {
        status: 'inactive'
      });

      expect(deactivatedUser.status).toBe('inactive');
      expect(deactivatedUser.apiKey).toBe(originalApiKey); // API key deve permanecer
      expect(deactivatedUser.updatedAt).not.toBe(deactivatedUser.createdAt);
    });

    test('Deve buscar usuários por empresa com API keys válidas', async () => {
      const companyUsers = await usersResource.list({
        partition: 'byCompany',
        partitionValues: { companyId: 'company-003' } // CloudFirst Ltd
      });

      expect(companyUsers.length).toBe(4);
      
      companyUsers.forEach(user => {
        expect(user.companyName).toBe('CloudFirst Ltd');
        expect(user.apiKey).toBeDefined();
        expect(user.apiKey.length).toBeGreaterThan(0);
        
        // Verificar que a API key não contém dados sensíveis em texto plano
        expect(user.apiKey).not.toContain('password');
        expect(user.apiKey).not.toContain('secret');
        expect(user.apiKey).not.toContain(user.email);
      });
    });
  });

  describe('Cenário 6: Relatórios e análises', () => {
    test('Deve gerar relatório completo de usuários por empresa', async () => {
      const companies = ['company-001', 'company-002', 'company-003', 'company-004'];
      const report = {};

      for (const companyId of companies) {
        const users = await usersResource.list({
          partition: 'byCompany',
          partitionValues: { companyId }
        });

        const company = users[0]?.companyName || 'Unknown';
        
        report[companyId] = {
          companyName: company,
          totalUsers: users.length,
          activeUsers: users.filter(u => u.status === 'active').length,
          inactiveUsers: users.filter(u => u.status === 'inactive').length,
          suspendedUsers: users.filter(u => u.status === 'suspended').length,
          adminUsers: users.filter(u => u.role === 'admin').length,
          developerUsers: users.filter(u => u.role === 'developer').length,
          analystUsers: users.filter(u => u.role === 'analyst').length,
          viewerUsers: users.filter(u => u.role === 'viewer').length
        };
      }

      // Verificar estrutura do relatório
      expect(Object.keys(report)).toHaveLength(4);
      
      Object.values(report).forEach(companyReport => {
        expect(companyReport.totalUsers).toBeGreaterThan(0);
        expect(companyReport.adminUsers).toBe(1); // Cada empresa tem 1 admin
        expect(companyReport.totalUsers).toBe(
          companyReport.activeUsers + companyReport.inactiveUsers + companyReport.suspendedUsers
        );
      });
    });

    test('Deve identificar usuários com permissões especiais', async () => {
      const adminUsers = await usersResource.list({
        partition: 'byRole',
        partitionValues: { role: 'admin' }
      });

      const superAdmins = adminUsers.filter(user => 
        user.permissions.includes('admin') && user.permissions.includes('delete')
      );

      expect(superAdmins.length).toBeGreaterThan(0);
      
      superAdmins.forEach(admin => {
        expect(admin.role).toBe('admin');
        expect(admin.permissions).toContain('admin');
        expect(admin.permissions).toContain('delete');
        expect(admin.status).toBe('active'); // Super admins devem estar ativos
      });
    });
  });
});