import Schema, { SchemaActions } from '../src/schema.class.js';

describe('Schema Journey Tests - Data Mapping and Validation', () => {
  describe('Cenário 1: Sistema de formulário de cadastro de funcionários', () => {
    let employeeSchema;

    beforeAll(() => {
      employeeSchema = new Schema({
        name: 'employees',
        version: 2,
        passphrase: 'company-hr-secret-2024',
        attributes: {
          personalInfo: {
            name: 'string|required|maxlength:100',
            email: 'string|required|email|maxlength:255',
            phone: 'string|optional|maxlength:20',
            birthDate: 'string|optional'
          },
          employment: {
            position: 'string|required|maxlength:100',
            department: 'string|required|in:engineering,marketing,sales,hr,finance',
            salary: 'number|required|min:0',
            startDate: 'string|required',
            isActive: 'boolean|optional'
          },
          credentials: {
            employeeId: 'string|required|maxlength:20',
            password: 'secret|required',
            accessLevel: 'string|required|in:basic,admin,super'
          },
          skills: 'array|optional',
          notes: 'string|optional|maxlength:1000'
        },
        options: {
          autoEncrypt: true,
          autoDecrypt: true,
          arraySeparator: '|',
          allNestedObjectsOptional: false
        }
      });
    });

    test('Deve validar dados completos de funcionário', async () => {
      const employeeData = {
        personalInfo: {
          name: 'Ana Silva Santos',
          email: 'ana.santos@company.com',
          phone: '+55 11 99999-8888',
          birthDate: '1990-05-15'
        },
        employment: {
          position: 'Senior Software Engineer',
          department: 'engineering',
          salary: 12000.50,
          startDate: '2024-01-15',
          isActive: true
        },
        credentials: {
          employeeId: 'ENG-2024-001',
          password: 'temp-password-123',
          accessLevel: 'admin'
        },
        skills: ['JavaScript', 'Python', 'AWS', 'Docker'],
        notes: 'Experiência em arquitetura de microserviços'
      };

      const validation = await employeeSchema.validate(employeeData);
      expect(validation).toBe(true);
    });

    test('Deve rejeitar dados inválidos com detalhes específicos', async () => {
      const invalidEmployee = {
        personalInfo: {
          name: '', // Vazio - requerido
          email: 'invalid-email', // Email inválido
          phone: '+55 11 99999-8888'
        },
        employment: {
          position: 'Senior Engineer',
          department: 'invalid-dept', // Departamento inválido
          salary: -1000, // Salário negativo
          startDate: '2024-01-15'
        },
        credentials: {
          employeeId: 'ENG-2024-002',
          // password: missing - requerido
          accessLevel: 'invalid-level' // Nível inválido
        }
      };

      const validation = await employeeSchema.validate(invalidEmployee);
      expect(Array.isArray(validation)).toBe(true);
      expect(validation.length).toBeGreaterThan(0);
      
      // Verificar que contém erros específicos
      const errorMessages = validation.map(error => error.message).join(' ');
      expect(errorMessages).toContain('email');
      expect(errorMessages).toContain('department');
    });

    test('Deve mapear dados aninhados para formato achatado', async () => {
      const employeeData = {
        personalInfo: {
          name: 'Carlos Rodrigues',
          email: 'carlos@company.com'
        },
        employment: {
          position: 'Marketing Manager',
          department: 'marketing',
          salary: 8500,
          startDate: '2024-02-01',
          isActive: true
        },
        credentials: {
          employeeId: 'MKT-2024-003',
          password: 'secure-password-456',
          accessLevel: 'basic'
        },
        skills: ['Digital Marketing', 'Analytics', 'SEO'],
        notes: 'Especialista em marketing digital'
      };

      const mapped = await employeeSchema.mapper(employeeData);
      
      // Verificar estrutura mapeada
      expect(mapped._v).toBe('2'); // Versão do schema
      expect(mapped).toHaveProperty('1'); // personalInfo.name mapped
      expect(mapped).toHaveProperty('2'); // personalInfo.email mapped
      
      // Verificar transformações
      expect(mapped['7']).toBe('1'); // isActive boolean → '1'
      expect(mapped['11']).toBe('Digital Marketing|Analytics|SEO'); // skills array → string
      
      // Verificar que password foi encriptado
      expect(mapped['9']).toBeDefined();
      expect(mapped['9']).not.toBe('secure-password-456');
      expect(mapped['9'].length).toBeGreaterThan(20); // Encrypted data
    });

    test('Deve fazer unmapping restaurando dados originais', async () => {
      const originalData = {
        personalInfo: {
          name: 'Maria Fernanda',
          email: 'maria@company.com',
          phone: '+55 21 88888-7777'
        },
        employment: {
          position: 'Sales Director',
          department: 'sales',
          salary: 15000,
          startDate: '2023-12-01',
          isActive: false
        },
        credentials: {
          employeeId: 'SAL-2023-001',
          password: 'director-password-789',
          accessLevel: 'super'
        },
        skills: ['Leadership', 'Negotiation', 'CRM'],
        notes: 'Liderança de equipe de vendas nacional'
      };

      // Mapear e depois fazer unmapping
      const mapped = await employeeSchema.mapper(originalData);
      const unmapped = await employeeSchema.unmapper(mapped);

      // Verificar restauração da estrutura
      expect(unmapped.personalInfo.name).toBe(originalData.personalInfo.name);
      expect(unmapped.personalInfo.email).toBe(originalData.personalInfo.email);
      expect(unmapped.employment.position).toBe(originalData.employment.position);
      expect(unmapped.employment.salary).toBe(originalData.employment.salary);
      expect(unmapped.employment.isActive).toBe(originalData.employment.isActive);
      
      // Verificar array restoration
      expect(unmapped.skills).toEqual(originalData.skills);
      
      // Verificar password decryption
      expect(unmapped.credentials.password).toBe(originalData.credentials.password);
    });
  });

  describe('Cenário 2: Sistema de catálogo de produtos e-commerce', () => {
    let productSchema;

    beforeAll(() => {
      productSchema = new Schema({
        name: 'products',
        version: 1,
        passphrase: 'ecommerce-products-2024',
        attributes: {
          basicInfo: {
            name: 'string|required|maxlength:200',
            description: 'string|optional|maxlength:2000',
            sku: 'string|required|maxlength:50',
            brand: 'string|optional|maxlength:100'
          },
          pricing: {
            basePrice: 'number|required|min:0',
            salePrice: 'number|optional|min:0',
            currency: 'string|optional|in:USD,BRL,EUR',
            isOnSale: 'boolean|optional'
          },
          inventory: {
            stockQuantity: 'number|required|min:0',
            lowStockThreshold: 'number|optional|min:0',
            isInStock: 'boolean|optional'
          },
          categorization: {
            primaryCategory: 'string|required|maxlength:100',
            secondaryCategories: 'array|optional',
            tags: 'array|optional'
          },
          apiKey: 'secret|optional',
          metadata: 'object|optional'
        }
      });
    });

    test('Deve processar catálogo de produtos multilíngues', async () => {
      const products = [
        {
          basicInfo: {
            name: 'Smartphone Galaxy S24 Ultra',
            description: 'Flagship smartphone with advanced camera system',
            sku: 'SAMS24U-128GB-BLK',
            brand: 'Samsung'
          },
          pricing: {
            basePrice: 1299.99,
            salePrice: 1199.99,
            currency: 'USD',
            isOnSale: true
          },
          inventory: {
            stockQuantity: 150,
            lowStockThreshold: 10,
            isInStock: true
          },
          categorization: {
            primaryCategory: 'Electronics',
            secondaryCategories: ['Smartphones', 'Mobile Devices'],
            tags: ['5G', 'Android', 'Premium', 'Camera']
          },
          apiKey: 'prod-api-key-samsung-001'
        },
        {
          basicInfo: {
            name: 'Café Premium Torrado Brasileiro',
            description: 'Café especial torrado artesanalmente com notas de chocolate',
            sku: 'CAFE-PREM-500G',
            brand: 'Fazenda São João'
          },
          pricing: {
            basePrice: 45.90,
            currency: 'BRL',
            isOnSale: false
          },
          inventory: {
            stockQuantity: 200,
            lowStockThreshold: 20,
            isInStock: true
          },
          categorization: {
            primaryCategory: 'Alimentos',
            secondaryCategories: ['Bebidas', 'Café'],
            tags: ['Orgânico', 'Torrado', 'Premium', 'Brasileiro']
          },
          metadata: {
            origin: 'Minas Gerais',
            roastLevel: 'Medium',
            harvestYear: 2024
          }
        }
      ];

      for (const product of products) {
        const validation = await productSchema.validate(product);
        expect(validation).toBe(true);

        const mapped = await productSchema.mapper(product);
        expect(mapped._v).toBe('1');
        
        const unmapped = await productSchema.unmapper(mapped);
        expect(unmapped.basicInfo.name).toBe(product.basicInfo.name);
        expect(unmapped.pricing.basePrice).toBe(product.pricing.basePrice);
        expect(unmapped.categorization.tags).toEqual(product.categorization.tags);
      }
    });

    test('Deve lidar com campos opcionais e valores nulos', async () => {
      const minimalProduct = {
        basicInfo: {
          name: 'Produto Básico',
          sku: 'BASIC-001'
          // description e brand omitidos (opcionais)
        },
        pricing: {
          basePrice: 29.99
          // salePrice, currency e isOnSale omitidos (opcionais)
        },
        inventory: {
          stockQuantity: 50
          // lowStockThreshold e isInStock omitidos (opcionais)
        },
        categorization: {
          primaryCategory: 'Diversos'
          // secondaryCategories e tags omitidos (opcionais)
        }
        // apiKey e metadata omitidos (opcionais)
      };

      const validation = await productSchema.validate(minimalProduct);
      expect(validation).toBe(true);

      const mapped = await productSchema.mapper(minimalProduct);
      const unmapped = await productSchema.unmapper(mapped);

      expect(unmapped.basicInfo.name).toBe(minimalProduct.basicInfo.name);
      expect(unmapped.pricing.basePrice).toBe(minimalProduct.pricing.basePrice);
      expect(unmapped.inventory.stockQuantity).toBe(minimalProduct.inventory.stockQuantity);
    });
  });

  describe('Cenário 3: Testando transformações do SchemaActions', () => {
    test('Deve transformar arrays corretamente com separadores especiais', () => {
      const testCases = [
        {
          input: ['JavaScript', 'Python', 'Go'],
          separator: '|',
          expected: 'JavaScript|Python|Go'
        },
        {
          input: ['Item with | pipe', 'Normal item'],
          separator: '|',
          expected: 'Item with \\| pipe|Normal item'
        },
        {
          input: [],
          separator: '|',
          expected: '[]'
        },
        {
          input: ['Single item'],
          separator: '|',
          expected: 'Single item'
        }
      ];

      testCases.forEach(({ input, separator, expected }) => {
        const result = SchemaActions.fromArray(input, { separator });
        expect(result).toBe(expected);

        // Test round-trip
        const restored = SchemaActions.toArray(result, { separator });
        expect(restored).toEqual(input);
      });
    });

    test('Deve transformar números e booleanos corretamente', () => {
      // Number transformations
      expect(SchemaActions.toString(42)).toBe('42');
      expect(SchemaActions.toString(3.14159)).toBe('3.14159');
      expect(SchemaActions.toNumber('42')).toBe(42);
      expect(SchemaActions.toNumber('3.14159')).toBe(3.14159);

      // Boolean transformations
      expect(SchemaActions.fromBool(true)).toBe('1');
      expect(SchemaActions.fromBool(false)).toBe('0');
      expect(SchemaActions.toBool('1')).toBe(true);
      expect(SchemaActions.toBool('0')).toBe(false);
      expect(SchemaActions.toBool('true')).toBe(true);
      expect(SchemaActions.toBool('false')).toBe(false);
    });

    test('Deve fazer round-trip de objetos JSON complexos', () => {
      const complexObject = {
        user: {
          name: 'João Silva',
          preferences: {
            theme: 'dark',
            language: 'pt-BR',
            notifications: {
              email: true,
              sms: false,
              push: ['orders', 'promotions']
            }
          }
        },
        metadata: {
          version: 2.1,
          tags: ['premium', 'verified'],
          stats: null
        }
      };

      const jsonString = SchemaActions.toJSON(complexObject);
      expect(typeof jsonString).toBe('string');

      const restored = SchemaActions.fromJSON(jsonString);
      expect(restored).toEqual(complexObject);
    });
  });

  describe('Cenário 4: Sistema de perfis de usuário com dados sensíveis', () => {
    let userProfileSchema;

    beforeAll(() => {
      userProfileSchema = new Schema({
        name: 'userProfiles',
        version: 1,
        passphrase: 'user-profiles-ultra-secure-2024',
        attributes: {
          profile: {
            username: 'string|required|maxlength:50',
            displayName: 'string|optional|maxlength:100',
            avatar: 'string|optional|maxlength:500'
          },
          security: {
            password: 'secret|required',
            recoveryEmail: 'string|required|email',
            twoFactorSecret: 'secret|optional',
            securityQuestions: 'array|optional'
          },
          preferences: {
            theme: 'string|optional|in:light,dark,auto',
            language: 'string|optional|maxlength:10',
            timezone: 'string|optional|maxlength:50',
            emailNotifications: 'boolean|optional',
            smsNotifications: 'boolean|optional'
          },
          socialLinks: 'array|optional',
          privateNotes: 'secret|optional'
        }
      });
    });

    test('Deve criptografar múltiplos campos sensíveis', async () => {
      const userProfile = {
        profile: {
          username: 'joao_dev',
          displayName: 'João Desenvolvedor',
          avatar: 'https://cdn.example.com/avatars/joao.jpg'
        },
        security: {
          password: 'super-secure-password-123!',
          recoveryEmail: 'joao.recovery@gmail.com',
          twoFactorSecret: 'ABCD1234EFGH5678',
          securityQuestions: ['Qual o nome do seu primeiro pet?', 'Cidade onde nasceu?']
        },
        preferences: {
          theme: 'dark',
          language: 'pt-BR',
          timezone: 'America/Sao_Paulo',
          emailNotifications: true,
          smsNotifications: false
        },
        socialLinks: ['https://github.com/joao', 'https://linkedin.com/in/joao'],
        privateNotes: 'Informações confidenciais sobre o usuário'
      };

      const mapped = await userProfileSchema.mapper(userProfile);
      
      // Verificar que campos secret foram criptografados
      const passwordField = Object.values(mapped).find(value => 
        typeof value === 'string' && value.length > 50 && value !== userProfile.security.password
      );
      expect(passwordField).toBeDefined();
      
      // Verificar que arrays foram transformados
      const socialLinksField = Object.values(mapped).find(value => 
        typeof value === 'string' && value.includes('github.com')
      );
      expect(socialLinksField).toContain('|');

      // Fazer unmapping e verificar descriptografia
      const unmapped = await userProfileSchema.unmapper(mapped);
      expect(unmapped.security.password).toBe(userProfile.security.password);
      expect(unmapped.security.twoFactorSecret).toBe(userProfile.security.twoFactorSecret);
      expect(unmapped.privateNotes).toBe(userProfile.privateNotes);
      expect(unmapped.socialLinks).toEqual(userProfile.socialLinks);
    });

    test('Deve preservar tipos de dados após round-trip completo', async () => {
      const userData = {
        profile: {
          username: 'maria_designer',
          displayName: 'Maria Designer UX'
        },
        security: {
          password: 'creative-password-456',
          recoveryEmail: 'maria@designstudio.com'
        },
        preferences: {
          theme: 'light',
          emailNotifications: true,
          smsNotifications: false
        },
        socialLinks: ['https://behance.net/maria', 'https://dribbble.com/maria']
      };

      // Mapear -> Unmapear -> Verificar tipos
      const mapped = await userProfileSchema.mapper(userData);
      const unmapped = await userProfileSchema.unmapper(mapped);

      expect(typeof unmapped.profile.username).toBe('string');
      expect(typeof unmapped.preferences.emailNotifications).toBe('boolean');
      expect(typeof unmapped.preferences.smsNotifications).toBe('boolean');
      expect(Array.isArray(unmapped.socialLinks)).toBe(true);
      expect(unmapped.socialLinks).toHaveLength(2);
    });
  });

  describe('Cenário 5: Import/Export de schemas para migração', () => {
    test('Deve exportar e importar schema complexo mantendo configurações', () => {
      const originalSchema = new Schema({
        name: 'complexResource',
        version: 3,
        passphrase: 'migration-test-key',
        attributes: {
          metadata: {
            id: 'string|required',
            version: 'number|required'
          },
          content: {
            title: 'string|required|maxlength:200',
            body: 'string|optional',
            tags: 'array|optional',
            isPublished: 'boolean|optional'
          },
          security: {
            apiKey: 'secret|required',
            permissions: 'array|optional'
          }
        },
        options: {
          autoEncrypt: true,
          autoDecrypt: true,
          arraySeparator: ',',
          allNestedObjectsOptional: true
        }
      });

      // Exportar schema
      const exported = originalSchema.export();
      
      expect(exported.name).toBe('complexResource');
      expect(exported.version).toBe(3);
      expect(exported.options.arraySeparator).toBe(',');
      expect(exported.attributes.content.title).toBe('string|required|maxlength:200');

      // Importar schema
      const importedSchema = Schema.import(exported);
      
      expect(importedSchema.name).toBe(originalSchema.name);
      expect(importedSchema.version).toBe(originalSchema.version);
      expect(importedSchema.passphrase).toBe(originalSchema.passphrase);
      expect(importedSchema.options.arraySeparator).toBe(originalSchema.options.arraySeparator);
    });

    test('Deve importar schema de string JSON', () => {
      const schemaDefinition = {
        name: 'jsonImportTest',
        version: 1,
        passphrase: 'test-key',
        attributes: {
          name: 'string|required',
          tags: 'array|optional',
          isActive: 'boolean|optional'
        },
        options: {
          autoEncrypt: false,
          arraySeparator: ';'
        }
      };

      const jsonString = JSON.stringify(schemaDefinition);
      const importedSchema = Schema.import(jsonString);

      expect(importedSchema.name).toBe('jsonImportTest');
      expect(importedSchema.options.arraySeparator).toBe(';');
      expect(importedSchema.attributes.name).toBe('string|required');
    });
  });

  describe('Cenário 6: Edge cases e performance', () => {
    let performanceSchema;

    beforeAll(() => {
      performanceSchema = new Schema({
        name: 'performanceTest',
        version: 1,
        passphrase: 'perf-test',
        attributes: {
          data: {
            id: 'string|required',
            payload: 'string|optional',
            numbers: 'array|optional',
            metadata: 'object|optional'
          },
          encrypted: {
            sensitiveData: 'secret|optional'
          }
        }
      });
    });

    test('Deve processar arrays com elementos especiais', async () => {
      const testData = {
        data: {
          id: 'test-001',
          payload: 'test payload',
          numbers: [1, 2.5, -10, 0, 999.99],
          metadata: {
            type: 'test',
            nested: {
              value: 'deep'
            }
          }
        },
        encrypted: {
          sensitiveData: 'confidential information'
        }
      };

      const mapped = await performanceSchema.mapper(testData);
      const unmapped = await performanceSchema.unmapper(mapped);

      expect(unmapped.data.numbers).toEqual(testData.data.numbers);
      expect(unmapped.data.metadata).toEqual(testData.data.metadata);
      expect(unmapped.encrypted.sensitiveData).toBe(testData.encrypted.sensitiveData);
    });

    test('Deve lidar com valores nulos e undefined graciosamente', async () => {
      const testDataWithNulls = {
        data: {
          id: 'null-test',
          payload: null,
          numbers: undefined,
          metadata: null
        }
      };

      const validation = await performanceSchema.validate(testDataWithNulls);
      expect(validation).toBe(true);

      const mapped = await performanceSchema.mapper(testDataWithNulls);
      const unmapped = await performanceSchema.unmapper(mapped);

      expect(unmapped.data.id).toBe('null-test');
      expect(unmapped.data.payload).toBeNull();
    });

    test('Deve manter performance com objetos grandes', async () => {
      const largeObject = {
        data: {
          id: 'performance-test',
          payload: 'x'.repeat(1000), // String grande
          numbers: Array.from({ length: 100 }, (_, i) => i), // Array grande
          metadata: {
            items: Array.from({ length: 50 }, (_, i) => ({
              id: `item-${i}`,
              value: `value-${i}`,
              active: i % 2 === 0
            }))
          }
        }
      };

      const startTime = Date.now();
      
      const mapped = await performanceSchema.mapper(largeObject);
      const unmapped = await performanceSchema.unmapper(mapped);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Menos de 1 segundo
      expect(unmapped.data.payload.length).toBe(1000);
      expect(unmapped.data.numbers).toHaveLength(100);
      expect(unmapped.data.metadata.items).toHaveLength(50);
    });
  });
});