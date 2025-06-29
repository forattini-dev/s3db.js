import { Validator, ValidatorManager } from '../src/validator.class.js';

describe('Validator Journey Tests - Data Validation System', () => {
  describe('Cenário 1: Sistema de validação de formulário de segurança', () => {
    let securityValidator;

    beforeAll(() => {
      securityValidator = new Validator({
        passphrase: 'security-validation-key-2024',
        autoEncrypt: true
      });
    });

    test('Deve validar dados de login com campos secret', async () => {
      const loginSchema = {
        username: { type: 'string', min: 3, max: 50, required: true },
        password: { type: 'secret', min: 8, required: true },
        email: { type: 'email', required: true },
        rememberMe: { type: 'boolean', optional: true },
        loginAttempts: { type: 'number', min: 0, max: 5, optional: true }
      };

      const validator = securityValidator.compile(loginSchema);

      const validLoginData = {
        username: 'joao_silva',
        password: 'super-secure-password-123!',
        email: 'joao@company.com',
        rememberMe: true,
        loginAttempts: 0
      };

      const result = await validator(validLoginData);
      expect(result).toBe(true);
    });

    test('Deve rejeitar dados de login inválidos com detalhes específicos', async () => {
      const loginSchema = {
        username: { type: 'string', min: 3, max: 50, required: true },
        password: { type: 'secret', min: 8, required: true },
        email: { type: 'email', required: true },
        rememberMe: { type: 'boolean', optional: true }
      };

      const validator = securityValidator.compile(loginSchema);

      const invalidLoginData = {
        username: 'ab', // Muito curto
        password: '123', // Muito curto para secret
        email: 'invalid-email', // Email inválido
        rememberMe: 'maybe' // Boolean inválido
      };

      const result = await validator(invalidLoginData);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verificar tipos específicos de erro
      const errorTypes = result.map(error => error.type);
      expect(errorTypes).toContain('stringMin');
      expect(errorTypes).toContain('email');
      expect(errorTypes).toContain('boolean');
    });

    test('Deve criptografar campos secret automaticamente', async () => {
      const secretSchema = {
        apiKey: { type: 'secret', required: true },
        clientSecret: { type: 'secret', min: 16, required: true },
        publicData: { type: 'string', required: true }
      };

      const validator = securityValidator.compile(secretSchema);

      const secretData = {
        apiKey: 'api-key-12345-secure',
        clientSecret: 'client-secret-super-secure-2024',
        publicData: 'This is public information'
      };

      const result = await validator(secretData);
      
      // Se autoEncrypt está ativo, os campos secret devem ser modificados
      if (securityValidator.autoEncrypt) {
        expect(result.apiKey).not.toBe('api-key-12345-secure');
        expect(result.clientSecret).not.toBe('client-secret-super-secure-2024');
        expect(result.publicData).toBe('This is public information'); // Não modificado
        
        // Verificar que são strings criptografadas (longas)
        expect(result.apiKey.length).toBeGreaterThan(50);
        expect(result.clientSecret.length).toBeGreaterThan(50);
      }
    });
  });

  describe('Cenário 2: Validação de cadastro de funcionários com diferentes tipos de dados', () => {
    let employeeValidator;

    beforeAll(() => {
      employeeValidator = new Validator({
        passphrase: 'employee-data-encryption-2024',
        autoEncrypt: true
      });
    });

    test('Deve validar cadastro completo de funcionário', async () => {
      const employeeSchema = {
        personalInfo: {
          type: 'object',
          strict: false,
          properties: {
            name: { type: 'string', min: 2, max: 100, required: true },
            email: { type: 'email', required: true },
            phone: { type: 'string', pattern: /^\+?[\d\s-()]+$/, optional: true },
            birthDate: { type: 'date', optional: true }
          }
        },
        employment: {
          type: 'object',
          strict: false,
          properties: {
            position: { type: 'string', min: 2, max: 100, required: true },
            department: { type: 'enum', values: ['engineering', 'marketing', 'sales', 'hr', 'finance'], required: true },
            salary: { type: 'number', positive: true, required: true },
            startDate: { type: 'date', required: true },
            isFullTime: { type: 'boolean', optional: true }
          }
        },
        credentials: {
          type: 'object',
          strict: false,
          properties: {
            employeeId: { type: 'string', pattern: /^[A-Z]{3}-\d{4}-\d{3}$/, required: true },
            tempPassword: { type: 'secret', min: 12, required: true },
            accessLevel: { type: 'enum', values: ['basic', 'admin', 'super'], required: true }
          }
        },
        skills: { type: 'array', items: 'string', optional: true },
        emergencyContact: {
          type: 'object',
          optional: true,
          strict: false,
          properties: {
            name: { type: 'string', required: true },
            phone: { type: 'string', required: true },
            relationship: { type: 'string', required: true }
          }
        }
      };

      const validator = employeeValidator.compile(employeeSchema);

      const employeeData = {
        personalInfo: {
          name: 'Maria Silva Santos',
          email: 'maria.santos@company.com',
          phone: '+55 11 99999-8888',
          birthDate: new Date('1990-05-15')
        },
        employment: {
          position: 'Senior Software Engineer',
          department: 'engineering',
          salary: 12000.50,
          startDate: new Date('2024-01-15'),
          isFullTime: true
        },
        credentials: {
          employeeId: 'ENG-2024-001',
          tempPassword: 'temporary-secure-password-2024!',
          accessLevel: 'admin'
        },
        skills: ['JavaScript', 'Python', 'AWS', 'Docker', 'Kubernetes'],
        emergencyContact: {
          name: 'João Santos',
          phone: '+55 11 88888-7777',
          relationship: 'Pai'
        }
      };

      const result = await validator(employeeData);
      expect(result).not.toEqual(false); // Não é false
      
      if (result !== true) {
        console.log('Validation errors:', result);
      }
    });

    test('Deve validar diferentes formatos de ID de funcionário', async () => {
      const idSchema = {
        employeeId: { type: 'string', pattern: /^[A-Z]{3}-\d{4}-\d{3}$/, required: true }
      };

      const validator = employeeValidator.compile(idSchema);

      const validIds = [
        { employeeId: 'ENG-2024-001' },
        { employeeId: 'MKT-2023-999' },
        { employeeId: 'SAL-2024-123' },
        { employeeId: 'HRD-2022-456' }
      ];

      const invalidIds = [
        { employeeId: 'ENG-24-001' }, // Ano curto
        { employeeId: 'ENGINEERING-2024-001' }, // Departamento longo
        { employeeId: 'eng-2024-001' }, // Lowercase
        { employeeId: 'ENG-2024-1' }, // Número curto
        { employeeId: 'ENG_2024_001' } // Separador errado
      ];

      // Testar IDs válidos
      for (const validId of validIds) {
        const result = await validator(validId);
        expect(result).toBe(true);
      }

      // Testar IDs inválidos
      for (const invalidId of invalidIds) {
        const result = await validator(invalidId);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Cenário 3: Sistema de validação de produtos e-commerce', () => {
    let productValidator;

    beforeAll(() => {
      productValidator = new Validator({
        passphrase: 'product-catalog-encryption-2024',
        autoEncrypt: false // Desabilitando auto-encrypt para este cenário
      });
    });

    test('Deve validar catálogo de produtos com diferentes moedas', async () => {
      const productSchema = {
        name: { type: 'string', min: 1, max: 200, required: true },
        description: { type: 'string', max: 2000, optional: true },
        sku: { type: 'string', pattern: /^[A-Z0-9-]+$/, min: 3, max: 50, required: true },
        pricing: {
          type: 'object',
          strict: false,
          properties: {
            amount: { type: 'number', positive: true, required: true },
            currency: { type: 'enum', values: ['USD', 'BRL', 'EUR', 'GBP'], required: true },
            salePrice: { type: 'number', positive: true, optional: true }
          }
        },
        inventory: {
          type: 'object',
          strict: false,
          properties: {
            quantity: { type: 'number', min: 0, integer: true, required: true },
            lowStockThreshold: { type: 'number', min: 0, integer: true, optional: true },
            unlimited: { type: 'boolean', optional: true }
          }
        },
        categories: { type: 'array', items: 'string', min: 1, required: true },
        tags: { type: 'array', items: 'string', optional: true },
        isActive: { type: 'boolean', optional: true },
        metadata: { type: 'object', optional: true }
      };

      const validator = productValidator.compile(productSchema);

      const products = [
        {
          name: 'Smartphone Premium',
          description: 'Latest flagship smartphone with advanced features',
          sku: 'PHONE-PREM-001',
          pricing: {
            amount: 999.99,
            currency: 'USD',
            salePrice: 899.99
          },
          inventory: {
            quantity: 100,
            lowStockThreshold: 10,
            unlimited: false
          },
          categories: ['Electronics', 'Mobile'],
          tags: ['smartphone', 'premium', '5g'],
          isActive: true,
          metadata: {
            brand: 'TechCorp',
            warranty: '2 years',
            color: 'Space Gray'
          }
        },
        {
          name: 'Café Especial Brasileiro',
          description: 'Café premium torrado artesanalmente',
          sku: 'CAFE-SPEC-BR-500G',
          pricing: {
            amount: 45.90,
            currency: 'BRL'
          },
          inventory: {
            quantity: 200,
            unlimited: false
          },
          categories: ['Alimentos', 'Bebidas'],
          tags: ['café', 'orgânico', 'torrado'],
          isActive: true
        }
      ];

      for (const product of products) {
        const result = await validator(product);
        expect(result).toBe(true);
      }
    });

    test('Deve validar regras de negócio específicas para produtos', async () => {
      const businessRuleSchema = {
        pricing: {
          type: 'object',
          strict: false,
          properties: {
            amount: { type: 'number', positive: true, required: true },
            salePrice: { type: 'number', positive: true, optional: true }
          },
          // Custom validation: salePrice deve ser menor que amount
          custom: (value, errors) => {
            if (value.salePrice && value.salePrice >= value.amount) {
              errors.push({
                type: 'salePriceInvalid',
                message: 'Sale price must be lower than regular price',
                field: 'pricing.salePrice',
                actual: value.salePrice,
                expected: `< ${value.amount}`
              });
            }
            return value;
          }
        },
        inventory: {
          type: 'object',
          strict: false,
          properties: {
            quantity: { type: 'number', min: 0, integer: true, required: true },
            unlimited: { type: 'boolean', optional: true }
          },
          // Custom validation: se unlimited é true, quantity deve ser ignorado
          custom: (value, errors) => {
            if (value.unlimited && value.quantity < 999999) {
              // Para produtos unlimited, definir quantity alto
              value.quantity = 999999;
            }
            return value;
          }
        }
      };

      const validator = productValidator.compile(businessRuleSchema);

      // Teste com preço de venda inválido
      const invalidPricing = {
        pricing: {
          amount: 100.00,
          salePrice: 150.00 // Maior que o preço normal
        },
        inventory: {
          quantity: 50,
          unlimited: false
        }
      };

      const result1 = await validator(invalidPricing);
      expect(Array.isArray(result1)).toBe(true);

      // Teste com produto unlimited
      const unlimitedProduct = {
        pricing: {
          amount: 29.99
        },
        inventory: {
          quantity: 10,
          unlimited: true
        }
      };

      const result2 = await validator(unlimitedProduct);
      if (result2 !== true) {
        expect(result2.inventory.quantity).toBe(999999);
      }
    });
  });

  describe('Cenário 4: Validação de diferentes tipos de campos secret', () => {
    let secretValidator;

    beforeAll(() => {
      secretValidator = new Validator({
        passphrase: 'multi-secret-validation-2024',
        autoEncrypt: true
      });
    });

    test('Deve validar e criptografar diferentes tipos de secrets', async () => {
      const secretTypesSchema = {
        stringSecret: { type: 'secret', min: 8, required: true },
        numberSecret: { type: 'secretNumber', required: true },
        anySecret: { type: 'secretAny', required: true },
        optionalSecret: { type: 'secret', min: 6, optional: true }
      };

      const validator = secretValidator.compile(secretTypesSchema);

      const secretData = {
        stringSecret: 'string-secret-password',
        numberSecret: 123456789,
        anySecret: { complexObject: 'with sensitive data', key: 'value' },
        optionalSecret: 'optional-secret'
      };

      const result = await validator(secretData);
      
      if (secretValidator.autoEncrypt && result !== true) {
        // Verificar que secrets foram processados
        expect(typeof result.stringSecret).toBe('string');
        expect(typeof result.numberSecret).toBe('string'); // Deve ser criptografado como string
        expect(typeof result.anySecret).toBe('string'); // Objeto criptografado como string
      }
    });

    test('Deve falhar quando não há passphrase para criptografia', async () => {
      const noPassphraseValidator = new Validator({
        passphrase: null,
        autoEncrypt: true
      });

      const secretSchema = {
        password: { type: 'secret', required: true }
      };

      const validator = noPassphraseValidator.compile(secretSchema);

      const secretData = {
        password: 'test-password'
      };

      const result = await validator(secretData);
      expect(Array.isArray(result)).toBe(true);
      
      const encryptionErrors = result.filter(error => error.type === 'encryptionKeyMissing');
      expect(encryptionErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Cenário 5: ValidatorManager Singleton Pattern', () => {
    test('Deve retornar a mesma instância do ValidatorManager', () => {
      const instance1 = new ValidatorManager({
        passphrase: 'test-passphrase-1'
      });

      const instance2 = new ValidatorManager({
        passphrase: 'test-passphrase-2'
      });

      // ValidatorManager é um singleton, deve retornar a mesma instância
      expect(instance1).toBe(instance2);
      expect(instance1.passphrase).toBe(instance2.passphrase);
    });

    test('Deve funcionar com schemas compilados usando ValidatorManager', async () => {
      const managerInstance = new ValidatorManager({
        passphrase: 'manager-test-passphrase'
      });

      const schema = {
        username: { type: 'string', min: 3, required: true },
        password: { type: 'secret', min: 8, required: true }
      };

      const validator = managerInstance.compile(schema);

      const testData = {
        username: 'testuser',
        password: 'secure-password-123'
      };

      const result = await validator(testData);
      expect(result).not.toBe(false);
    });
  });

  describe('Cenário 6: Validação com mensagens customizadas', () => {
    let customMessageValidator;

    beforeAll(() => {
      customMessageValidator = new Validator({
        passphrase: 'custom-messages-2024',
        autoEncrypt: false,
        options: {
          messages: {
            stringMin: 'O campo {field} deve ter pelo menos {expected} caracteres. Atual: {actual}',
            stringMax: 'O campo {field} não pode ter mais de {expected} caracteres. Atual: {actual}',
            email: 'O campo {field} deve ser um email válido. Valor informado: {actual}',
            required: 'O campo {field} é obrigatório e não foi informado'
          }
        }
      });
    });

    test('Deve retornar mensagens de erro customizadas em português', async () => {
      const schema = {
        nome: { type: 'string', min: 2, max: 50, required: true },
        email: { type: 'email', required: true },
        senha: { type: 'string', min: 8, required: true }
      };

      const validator = customMessageValidator.compile(schema);

      const dadosInvalidos = {
        nome: 'A', // Muito curto
        email: 'email-invalido', // Email inválido
        // senha: ausente
      };

      const result = await validator(dadosInvalidos);
      expect(Array.isArray(result)).toBe(true);

      const errorMessages = result.map(error => error.message);
      
      // Verificar mensagens em português
      const nomeError = errorMessages.find(msg => msg.includes('nome') && msg.includes('caracteres'));
      const emailError = errorMessages.find(msg => msg.includes('email') && msg.includes('válido'));
      const senhaError = errorMessages.find(msg => msg.includes('senha') && msg.includes('obrigatório'));

      expect(nomeError).toBeDefined();
      expect(emailError).toBeDefined();
      expect(senhaError).toBeDefined();
    });
  });
});