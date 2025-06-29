import { Database, S3db } from '../src/database.class.js';
import Client from '../src/client.class.js';

describe('Database Journey Tests - Multi-Resource Application Management', () => {
  let database;
  let client;

  beforeAll(async () => {
    client = new Client({
      bucket: 'app-database-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });

    database = new Database({
      client,
      verbose: true,
      parallelism: 5,
      passphrase: 'app-master-secret-2024'
    });
  });

  describe('Cenário 1: Inicialização de aplicação e-commerce', () => {
    test('Deve conectar e criar estrutura inicial de metadata', async () => {
      await database.connect();
      
      expect(database.isConnected()).toBe(true);
      expect(database.savedMetadata).toBeDefined();
      expect(database.savedMetadata.version).toBe('1');
      expect(database.savedMetadata.resources).toBeDefined();
      expect(database.config.version).toBe('1');
      expect(database.config.bucket).toBe('app-database-bucket');
    });

    test('Deve criar recursos para sistema e-commerce', async () => {
      // Criar recurso de usuários
      const usersResource = await database.createResource({
        name: 'users',
        attributes: {
          name: 'string|required|maxlength:100',
          email: 'string|required|email|maxlength:255',
          password: 'secret|required',
          role: 'string|required|in:admin,customer,vendor',
          status: 'string|required|in:active,inactive,suspended',
          createdAt: 'string|optional',
          lastLogin: 'string|optional'
        },
        options: {
          timestamps: true,
          partitions: {
            byRole: { fields: { role: 'string|maxlength:10' } },
            byStatus: { fields: { status: 'string|maxlength:10' } }
          }
        },
        behavior: 'user-management'
      });

      // Criar recurso de produtos
      const productsResource = await database.createResource({
        name: 'products',
        attributes: {
          name: 'string|required|maxlength:200',
          description: 'string|optional|maxlength:1000',
          price: 'number|required|min:0',
          category: 'string|required|maxlength:50',
          vendor: 'string|required|maxlength:100',
          stockQuantity: 'number|required|min:0',
          isActive: 'boolean|optional',
          tags: 'array|optional'
        },
        options: {
          timestamps: true,
          partitions: {
            byCategory: { fields: { category: 'string|maxlength:20' } },
            byVendor: { fields: { vendor: 'string|maxlength:30' } }
          }
        }
      });

      // Criar recurso de pedidos
      const ordersResource = await database.createResource({
        name: 'orders',
        attributes: {
          userId: 'string|required|maxlength:50',
          items: 'array|required',
          totalAmount: 'number|required|min:0',
          status: 'string|required|in:pending,processing,shipped,delivered,cancelled',
          shippingAddress: 'object|required',
          paymentMethod: 'string|required|maxlength:50',
          notes: 'string|optional|maxlength:500'
        },
        options: {
          timestamps: true,
          partitions: {
            byStatus: { fields: { status: 'string|maxlength:15' } },
            byUser: { fields: { userId: 'string|maxlength:25' } }
          }
        }
      });

      expect(usersResource.name).toBe('users');
      expect(productsResource.name).toBe('products');
      expect(ordersResource.name).toBe('orders');
      expect(database.resourceExists('users')).toBe(true);
      expect(database.resourceExists('products')).toBe(true);
      expect(database.resourceExists('orders')).toBe(true);
    });

    test('Deve listar todos os recursos criados', async () => {
      const resources = await database.listResources();
      
      expect(resources).toHaveLength(3);
      expect(resources.map(r => r.name)).toContain('users');
      expect(resources.map(r => r.name)).toContain('products');
      expect(resources.map(r => r.name)).toContain('orders');
    });
  });

  describe('Cenário 2: Populando dados iniciais da aplicação', () => {
    test('Deve adicionar usuários administradores e vendedores', async () => {
      const usersResource = await database.getResource('users');
      
      const adminUsers = [
        { name: 'Admin Master', email: 'admin@ecommerce.com', role: 'admin', status: 'active' },
        { name: 'Admin Support', email: 'support@ecommerce.com', role: 'admin', status: 'active' }
      ];

      const vendorUsers = [
        { name: 'Tech Vendor', email: 'tech@vendor.com', role: 'vendor', status: 'active' },
        { name: 'Fashion Vendor', email: 'fashion@vendor.com', role: 'vendor', status: 'active' },
        { name: 'Home Vendor', email: 'home@vendor.com', role: 'vendor', status: 'active' }
      ];

      const customers = [
        { name: 'João Silva', email: 'joao@customer.com', role: 'customer', status: 'active' },
        { name: 'Maria Santos', email: 'maria@customer.com', role: 'customer', status: 'active' },
        { name: 'Carlos Oliveira', email: 'carlos@customer.com', role: 'customer', status: 'inactive' }
      ];

      // Inserir usuários
      for (const user of [...adminUsers, ...vendorUsers, ...customers]) {
        const created = await usersResource.insert(user);
        expect(created.name).toBe(user.name);
        expect(created.password).toBeDefined(); // Auto-gerado para campo secret
        expect(created.createdAt).toBeDefined();
      }

      // Verificar contagens por role
      const adminCount = await usersResource.count({ 
        partition: 'byRole', 
        partitionValues: { role: 'admin' } 
      });
      const vendorCount = await usersResource.count({ 
        partition: 'byRole', 
        partitionValues: { role: 'vendor' } 
      });
      const customerCount = await usersResource.count({ 
        partition: 'byRole', 
        partitionValues: { role: 'customer' } 
      });

      expect(adminCount).toBe(2);
      expect(vendorCount).toBe(3);
      expect(customerCount).toBe(3);
    });

    test('Deve adicionar catálogo de produtos por categoria', async () => {
      const productsResource = await database.getResource('products');
      
      const techProducts = [
        { name: 'Smartphone Galaxy S24', description: 'Latest Samsung smartphone', price: 899.99, category: 'electronics', vendor: 'tech@vendor.com', stockQuantity: 50, isActive: true, tags: ['smartphone', 'samsung', 'android'] },
        { name: 'Laptop MacBook Pro', description: 'Apple MacBook Pro M3', price: 1999.99, category: 'electronics', vendor: 'tech@vendor.com', stockQuantity: 25, isActive: true, tags: ['laptop', 'apple', 'macbook'] },
        { name: 'Wireless Headphones', description: 'Sony WH-1000XM5', price: 299.99, category: 'electronics', vendor: 'tech@vendor.com', stockQuantity: 100, isActive: true, tags: ['headphones', 'sony', 'wireless'] }
      ];

      const fashionProducts = [
        { name: 'Designer Jeans', description: 'Premium denim jeans', price: 129.99, category: 'fashion', vendor: 'fashion@vendor.com', stockQuantity: 200, isActive: true, tags: ['jeans', 'denim', 'casual'] },
        { name: 'Leather Jacket', description: 'Genuine leather jacket', price: 249.99, category: 'fashion', vendor: 'fashion@vendor.com', stockQuantity: 75, isActive: true, tags: ['jacket', 'leather', 'outerwear'] },
        { name: 'Running Shoes', description: 'Athletic running shoes', price: 89.99, category: 'fashion', vendor: 'fashion@vendor.com', stockQuantity: 150, isActive: true, tags: ['shoes', 'running', 'athletic'] }
      ];

      const homeProducts = [
        { name: 'Coffee Maker', description: 'Automatic drip coffee maker', price: 79.99, category: 'home', vendor: 'home@vendor.com', stockQuantity: 80, isActive: true, tags: ['coffee', 'kitchen', 'appliance'] },
        { name: 'Dining Table', description: 'Oak wood dining table', price: 599.99, category: 'home', vendor: 'home@vendor.com', stockQuantity: 20, isActive: true, tags: ['furniture', 'dining', 'wood'] }
      ];

      // Inserir produtos
      for (const product of [...techProducts, ...fashionProducts, ...homeProducts]) {
        const created = await productsResource.insert(product);
        expect(created.name).toBe(product.name);
        expect(created.price).toBe(product.price);
        expect(created.createdAt).toBeDefined();
      }

      // Verificar contagens por categoria
      const electronicsCount = await productsResource.count({ 
        partition: 'byCategory', 
        partitionValues: { category: 'electronics' } 
      });
      const fashionCount = await productsResource.count({ 
        partition: 'byCategory', 
        partitionValues: { category: 'fashion' } 
      });
      const homeCount = await productsResource.count({ 
        partition: 'byCategory', 
        partitionValues: { category: 'home' } 
      });

      expect(electronicsCount).toBe(3);
      expect(fashionCount).toBe(3);
      expect(homeCount).toBe(2);
    });
  });

  describe('Cenário 3: Simulando operações de e-commerce', () => {
    test('Deve criar pedidos de diferentes usuários', async () => {
      const ordersResource = await database.getResource('orders');
      const usersResource = await database.getResource('users');
      const productsResource = await database.getResource('products');

      // Buscar usuários clientes
      const customers = await usersResource.list({ 
        partition: 'byRole', 
        partitionValues: { role: 'customer' } 
      });

      // Buscar alguns produtos
      const electronicsProducts = await productsResource.list({ 
        partition: 'byCategory', 
        partitionValues: { category: 'electronics' }, 
        limit: 2 
      });

      // Criar pedidos
      const order1 = await ordersResource.insert({
        userId: customers[0].id,
        items: [
          { productId: electronicsProducts[0].id, quantity: 1, price: electronicsProducts[0].price },
          { productId: electronicsProducts[1].id, quantity: 1, price: electronicsProducts[1].price }
        ],
        totalAmount: electronicsProducts[0].price + electronicsProducts[1].price,
        status: 'pending',
        shippingAddress: {
          street: 'Rua das Flores 123',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01234-567'
        },
        paymentMethod: 'credit_card'
      });

      const order2 = await ordersResource.insert({
        userId: customers[1].id,
        items: [
          { productId: electronicsProducts[0].id, quantity: 2, price: electronicsProducts[0].price }
        ],
        totalAmount: electronicsProducts[0].price * 2,
        status: 'processing',
        shippingAddress: {
          street: 'Av. Paulista 1000',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310-000'
        },
        paymentMethod: 'pix',
        notes: 'Entrega urgente'
      });

      expect(order1.status).toBe('pending');
      expect(order2.status).toBe('processing');
      expect(order1.items).toHaveLength(2);
      expect(order2.items).toHaveLength(1);
    });

    test('Deve processar workflows de pedidos', async () => {
      const ordersResource = await database.getResource('orders');

      // Buscar pedidos pendentes
      const pendingOrders = await ordersResource.list({ 
        partition: 'byStatus', 
        partitionValues: { status: 'pending' } 
      });

      // Atualizar status dos pedidos
      for (const order of pendingOrders) {
        const updated = await ordersResource.update(order.id, {
          status: 'shipped',
          notes: 'Pedido enviado via transportadora'
        });
        
        expect(updated.status).toBe('shipped');
        expect(updated.updatedAt).not.toBe(updated.createdAt);
      }

      // Verificar contagens de status
      const shippedCount = await ordersResource.count({ 
        partition: 'byStatus', 
        partitionValues: { status: 'shipped' } 
      });
      const processingCount = await ordersResource.count({ 
        partition: 'byStatus', 
        partitionValues: { status: 'processing' } 
      });

      expect(shippedCount).toBeGreaterThan(0);
      expect(processingCount).toBeGreaterThan(0);
    });
  });

  describe('Cenário 4: Gerenciamento de metadata e versionamento', () => {
    test('Deve detectar mudanças na definição de recursos', async () => {
      // Simular mudança na definição do recurso users
      const changeDetected = database.resourceExistsWithSameHash({
        name: 'users',
        attributes: {
          name: 'string|required|maxlength:100',
          email: 'string|required|email|maxlength:255',
          password: 'secret|required',
          role: 'string|required|in:admin,customer,vendor,moderator', // Adicionado 'moderator'
          status: 'string|required|in:active,inactive,suspended',
          phone: 'string|optional|maxlength:20', // Novo campo
          createdAt: 'string|optional',
          lastLogin: 'string|optional'
        },
        behavior: 'user-management'
      });

      expect(changeDetected.exists).toBe(true);
      expect(changeDetected.sameHash).toBe(false);
      expect(changeDetected.hash).toBeDefined();
      expect(changeDetected.existingHash).toBeDefined();
      expect(changeDetected.hash).not.toBe(changeDetected.existingHash);
    });

    test('Deve criar novo recurso condicionalmente', async () => {
      // Tentar criar recurso que já existe com mesmo hash
      const result1 = await database.createResourceIfNotExists({
        name: 'users',
        attributes: database.resources.users.attributes,
        behavior: 'user-management'
      });

      expect(result1.created).toBe(false);
      expect(result1.reason).toContain('same definition hash');

      // Criar novo recurso único
      const result2 = await database.createResourceIfNotExists({
        name: 'reviews',
        attributes: {
          productId: 'string|required|maxlength:50',
          userId: 'string|required|maxlength:50',
          rating: 'number|required|min:1|max:5',
          title: 'string|optional|maxlength:100',
          comment: 'string|optional|maxlength:1000',
          isVerified: 'boolean|optional'
        },
        options: {
          timestamps: true,
          partitions: {
            byProduct: { fields: { productId: 'string|maxlength:25' } },
            byRating: { fields: { rating: 'number' } }
          }
        }
      });

      expect(result2.created).toBe(true);
      expect(result2.reason).toContain('New resource created');
      expect(database.resourceExists('reviews')).toBe(true);
    });

    test('Deve gerar hashes consistentes para definições', async () => {
      const usersResource = database.resources.users;
      const definition = usersResource.export();
      
      const hash1 = database.generateDefinitionHash(definition);
      const hash2 = database.generateDefinitionHash(definition);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toContain('sha256:');
      expect(hash1.length).toBeGreaterThan(70); // SHA256 hash length + prefix
    });
  });

  describe('Cenário 5: Relatórios e análises da aplicação', () => {
    test('Deve gerar relatório completo da aplicação e-commerce', async () => {
      const usersResource = await database.getResource('users');
      const productsResource = await database.getResource('products');
      const ordersResource = await database.getResource('orders');

      const report = {
        database: {
          version: database.config.version,
          bucket: database.config.bucket,
          resourceCount: (await database.listResources()).length,
          isConnected: database.isConnected()
        },
        users: {
          total: (await usersResource.list()).length,
          admins: await usersResource.count({ partition: 'byRole', partitionValues: { role: 'admin' } }),
          vendors: await usersResource.count({ partition: 'byRole', partitionValues: { role: 'vendor' } }),
          customers: await usersResource.count({ partition: 'byRole', partitionValues: { role: 'customer' } }),
          active: await usersResource.count({ partition: 'byStatus', partitionValues: { status: 'active' } }),
          inactive: await usersResource.count({ partition: 'byStatus', partitionValues: { status: 'inactive' } })
        },
        products: {
          total: (await productsResource.list()).length,
          electronics: await productsResource.count({ partition: 'byCategory', partitionValues: { category: 'electronics' } }),
          fashion: await productsResource.count({ partition: 'byCategory', partitionValues: { category: 'fashion' } }),
          home: await productsResource.count({ partition: 'byCategory', partitionValues: { category: 'home' } })
        },
        orders: {
          total: (await ordersResource.list()).length,
          pending: await ordersResource.count({ partition: 'byStatus', partitionValues: { status: 'pending' } }),
          processing: await ordersResource.count({ partition: 'byStatus', partitionValues: { status: 'processing' } }),
          shipped: await ordersResource.count({ partition: 'byStatus', partitionValues: { status: 'shipped' } })
        }
      };

      // Verificar estrutura do relatório
      expect(report.database.resourceCount).toBe(4); // users, products, orders, reviews
      expect(report.users.total).toBeGreaterThan(0);
      expect(report.products.total).toBeGreaterThan(0);
      expect(report.orders.total).toBeGreaterThan(0);
      expect(report.users.admins).toBe(2);
      expect(report.users.vendors).toBe(3);
      expect(report.users.customers).toBe(3);
    });

    test('Deve verificar integridade dos recursos', async () => {
      const resources = await database.listResources();
      
      for (const resourceInfo of resources) {
        const resource = await database.getResource(resourceInfo.name);
        
        // Verificar se o recurso tem as propriedades básicas
        expect(resource.name).toBe(resourceInfo.name);
        expect(resource.attributes).toBeDefined();
        expect(resource.version).toBeDefined();
        expect(resource.client).toBeDefined();
        
        // Verificar se o recurso pode executar operações básicas
        const count = await resource.count();
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Cenário 6: Edge cases e recuperação de erros', () => {
    test('Deve lidar com recursos inexistentes graciosamente', async () => {
      expect(database.resourceExists('nonexistent')).toBe(false);
      
      await expect(database.getResource('nonexistent')).rejects.toThrow('Resource not found');
      
      expect(() => database.resource('nonexistent')).toThrow();
    });

    test('Deve permitir reconexão da database', async () => {
      const wasConnected = database.isConnected();
      expect(wasConnected).toBe(true);
      
      // Simular reconexão
      await database.connect();
      
      expect(database.isConnected()).toBe(true);
      expect(database.savedMetadata).toBeDefined();
    });

    test('Deve manter consistência de metadata após operações', async () => {
      const metadataBefore = JSON.stringify(database.savedMetadata);
      
      // Realizar operação que não altera metadata
      const usersResource = await database.getResource('users');
      await usersResource.list({ limit: 1 });
      
      const metadataAfter = JSON.stringify(database.savedMetadata);
      expect(metadataBefore).toBe(metadataAfter);
    });
  });
});