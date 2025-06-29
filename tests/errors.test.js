import { 
  InvalidResourceItem,
  ResourceNotFound,
  S3DBError,
  DatabaseError,
  ValidationError,
  AuthenticationError,
  PermissionError
} from '../src/errors.js';

describe('Error Classes - Custom Error Handling', () => {
  describe('S3DBError - Base Error Class', () => {
    test('Deve criar erro base com mensagem', () => {
      const error = new S3DBError('Base error message');
      
      expect(error.message).toBe('Base error message');
      expect(error.name).toBe('S3DBError');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof S3DBError).toBe(true);
    });

    test('Deve manter stack trace', () => {
      const error = new S3DBError('Test error');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('S3DBError');
    });
  });

  describe('InvalidResourceItem - Validation Error', () => {
    test('Deve criar erro de validação com detalhes completos', () => {
      const validationErrors = [
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Invalid email format' }
      ];

      const error = new InvalidResourceItem({
        bucket: 'test-bucket',
        resourceName: 'users',
        attributes: { name: '', email: 'invalid-email' },
        validation: validationErrors
      });

      expect(error.name).toBe('InvalidResourceItem');
      expect(error.bucket).toBe('test-bucket');
      expect(error.resourceName).toBe('users');
      expect(error.attributes).toEqual({ name: '', email: 'invalid-email' });
      expect(error.validation).toEqual(validationErrors);
      expect(error instanceof S3DBError).toBe(true);
    });

    test('Deve formatar mensagem de erro adequadamente', () => {
      const error = new InvalidResourceItem({
        bucket: 'app-bucket',
        resourceName: 'products',
        attributes: { price: -10 },
        validation: [{ field: 'price', message: 'Price must be positive' }]
      });

      expect(error.message).toContain('Invalid resource item');
      expect(error.message).toContain('products');
      expect(error.message).toContain('app-bucket');
    });

    test('Deve lidar com validações múltiplas', () => {
      const multipleErrors = [
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Email is required' },
        { field: 'age', message: 'Age must be between 0 and 120' },
        { field: 'password', message: 'Password must be at least 8 characters' }
      ];

      const error = new InvalidResourceItem({
        bucket: 'user-data',
        resourceName: 'accounts',
        attributes: { name: '', email: '', age: -5, password: '123' },
        validation: multipleErrors
      });

      expect(error.validation).toHaveLength(4);
      expect(error.validation).toEqual(multipleErrors);
    });
  });

  describe('ResourceNotFound - Not Found Error', () => {
    test('Deve criar erro de recurso não encontrado', () => {
      const error = new ResourceNotFound({
        bucket: 'data-bucket',
        resourceName: 'users',
        id: 'user-123'
      });

      expect(error.name).toBe('ResourceNotFound');
      expect(error.bucket).toBe('data-bucket');
      expect(error.resourceName).toBe('users');
      expect(error.id).toBe('user-123');
      expect(error instanceof S3DBError).toBe(true);
    });

    test('Deve formatar mensagem informativa', () => {
      const error = new ResourceNotFound({
        bucket: 'storage-bucket',
        resourceName: 'orders',
        id: 'order-456'
      });

      expect(error.message).toContain('Resource not found');
      expect(error.message).toContain('orders');
      expect(error.message).toContain('order-456');
      expect(error.message).toContain('storage-bucket');
    });

    test('Deve lidar com IDs complexos', () => {
      const complexId = 'company-001/user-123/session-789';
      
      const error = new ResourceNotFound({
        bucket: 'session-store',
        resourceName: 'sessions',
        id: complexId
      });

      expect(error.id).toBe(complexId);
      expect(error.message).toContain(complexId);
    });
  });

  describe('DatabaseError - Database Operation Error', () => {
    test('Deve criar erro de banco de dados', () => {
      const error = new DatabaseError('Connection timeout');
      
      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('Connection timeout');
      expect(error instanceof S3DBError).toBe(true);
    });

    test('Deve aceitar detalhes adicionais', () => {
      const error = new DatabaseError('Query failed', {
        query: 'SELECT * FROM users',
        code: 'CONNECTION_LOST',
        errno: 2006
      });

      expect(error.message).toBe('Query failed');
      expect(error.query).toBe('SELECT * FROM users');
      expect(error.code).toBe('CONNECTION_LOST');
      expect(error.errno).toBe(2006);
    });
  });

  describe('ValidationError - Schema Validation Error', () => {
    test('Deve criar erro de validação de schema', () => {
      const error = new ValidationError('Schema validation failed');
      
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Schema validation failed');
      expect(error instanceof S3DBError).toBe(true);
    });

    test('Deve incluir detalhes de validação', () => {
      const validationDetails = {
        field: 'email',
        value: 'invalid-email',
        rule: 'email',
        message: 'Must be a valid email address'
      };

      const error = new ValidationError('Email validation failed', validationDetails);

      expect(error.field).toBe('email');
      expect(error.value).toBe('invalid-email');
      expect(error.rule).toBe('email');
    });
  });

  describe('AuthenticationError - Authentication Error', () => {
    test('Deve criar erro de autenticação', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Invalid credentials');
      expect(error instanceof S3DBError).toBe(true);
    });

    test('Deve incluir detalhes de autenticação', () => {
      const error = new AuthenticationError('Token expired', {
        token: 'jwt-token-123',
        expiresAt: '2024-01-01T00:00:00Z',
        userId: 'user-456'
      });

      expect(error.token).toBe('jwt-token-123');
      expect(error.expiresAt).toBe('2024-01-01T00:00:00Z');
      expect(error.userId).toBe('user-456');
    });
  });

  describe('PermissionError - Authorization Error', () => {
    test('Deve criar erro de permissão', () => {
      const error = new PermissionError('Access denied');
      
      expect(error.name).toBe('PermissionError');
      expect(error.message).toBe('Access denied');
      expect(error instanceof S3DBError).toBe(true);
    });

    test('Deve incluir detalhes de permissão', () => {
      const error = new PermissionError('Insufficient permissions', {
        userId: 'user-789',
        resource: 'users',
        action: 'delete',
        requiredRole: 'admin',
        currentRole: 'viewer'
      });

      expect(error.userId).toBe('user-789');
      expect(error.resource).toBe('users');
      expect(error.action).toBe('delete');
      expect(error.requiredRole).toBe('admin');
      expect(error.currentRole).toBe('viewer');
    });
  });

  describe('Cenário Real: Tratamento de erros em cadeia', () => {
    test('Deve capturar e re-lançar erros com contexto', () => {
      const originalError = new Error('Network timeout');
      
      const wrappedError = new DatabaseError('Failed to connect to S3', {
        originalError: originalError.message,
        operation: 'listObjects',
        bucket: 'data-storage'
      });

      expect(wrappedError.originalError).toBe('Network timeout');
      expect(wrappedError.operation).toBe('listObjects');
      expect(wrappedError.bucket).toBe('data-storage');
    });

    test('Deve criar erro de validação a partir de múltiplos campos', () => {
      const userInput = {
        name: '',
        email: 'not-an-email',
        age: 'invalid-age',
        password: '123'
      };

      const validationErrors = [
        { field: 'name', message: 'Name is required', value: userInput.name },
        { field: 'email', message: 'Invalid email format', value: userInput.email },
        { field: 'age', message: 'Age must be a number', value: userInput.age },
        { field: 'password', message: 'Password too short', value: userInput.password }
      ];

      const error = new InvalidResourceItem({
        bucket: 'user-accounts',
        resourceName: 'users',
        attributes: userInput,
        validation: validationErrors
      });

      expect(error.validation).toHaveLength(4);
      expect(error.validation.every(err => err.field && err.message && 'value' in err)).toBe(true);
    });

    test('Deve fornecer informações detalhadas para debugging', () => {
      const error = new ResourceNotFound({
        bucket: 'company-data',
        resourceName: 'employees',
        id: 'emp-404',
        partition: 'byDepartment',
        partitionValues: { department: 'engineering' },
        context: {
          operation: 'get',
          timestamp: new Date().toISOString(),
          requestId: 'req-123456'
        }
      });

      expect(error.partition).toBe('byDepartment');
      expect(error.partitionValues).toEqual({ department: 'engineering' });
      expect(error.context.operation).toBe('get');
      expect(error.context.requestId).toBe('req-123456');
    });
  });

  describe('Cenário Real: Hierarquia de erros', () => {
    test('Deve identificar tipos de erro corretamente', () => {
      const errors = [
        new S3DBError('Base error'),
        new InvalidResourceItem({ bucket: 'test', resourceName: 'test', attributes: {}, validation: [] }),
        new ResourceNotFound({ bucket: 'test', resourceName: 'test', id: 'test' }),
        new DatabaseError('DB error'),
        new ValidationError('Validation error'),
        new AuthenticationError('Auth error'),
        new PermissionError('Permission error')
      ];

      // Todos devem ser instâncias de S3DBError
      errors.forEach(error => {
        expect(error instanceof S3DBError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });

      // Verificar tipos específicos
      expect(errors[1] instanceof InvalidResourceItem).toBe(true);
      expect(errors[2] instanceof ResourceNotFound).toBe(true);
      expect(errors[3] instanceof DatabaseError).toBe(true);
      expect(errors[4] instanceof ValidationError).toBe(true);
      expect(errors[5] instanceof AuthenticationError).toBe(true);
      expect(errors[6] instanceof PermissionError).toBe(true);
    });

    test('Deve permitir catch específico por tipo de erro', () => {
      const testError = (error) => {
        if (error instanceof InvalidResourceItem) {
          return 'validation';
        } else if (error instanceof ResourceNotFound) {
          return 'not_found';
        } else if (error instanceof AuthenticationError) {
          return 'auth';
        } else if (error instanceof PermissionError) {
          return 'permission';
        } else if (error instanceof S3DBError) {
          return 'generic_s3db';
        } else {
          return 'unknown';
        }
      };

      expect(testError(new InvalidResourceItem({ bucket: 'test', resourceName: 'test', attributes: {}, validation: [] }))).toBe('validation');
      expect(testError(new ResourceNotFound({ bucket: 'test', resourceName: 'test', id: 'test' }))).toBe('not_found');
      expect(testError(new AuthenticationError('test'))).toBe('auth');
      expect(testError(new PermissionError('test'))).toBe('permission');
      expect(testError(new S3DBError('test'))).toBe('generic_s3db');
      expect(testError(new Error('test'))).toBe('unknown');
    });
  });
});