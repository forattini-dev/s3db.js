import { PasswordAuthDriver, ClientCredentialsAuthDriver } from '../../src/plugins/identity/drivers/index.js';

describe('Identity Auth Drivers', () => {
  describe('PasswordAuthDriver', () => {
    const createContext = (overrides = {}) => {
      const users = overrides.users ?? [{ id: 'u1', email: 'user@example.com', password: 'hashed', role: 'admin' }];
      const usersResource = {
        query: vi.fn().mockResolvedValue(users)
      };
      const passwordHelper = {
        verify: vi.fn().mockResolvedValue(true)
      };

      return {
        resources: {
          users: overrides.usersResource || usersResource
        },
        helpers: {
          password: overrides.passwordHelper || passwordHelper
        }
      };
    };

    test('throws during initialize when users resource missing', async () => {
      const driver = new PasswordAuthDriver();

      await expect(driver.initialize({ resources: {}, helpers: { password: { verify: vi.fn() } } }))
        .rejects.toThrow('PasswordAuthDriver requires users resource');
    });

    test('throws during initialize when password helper missing', async () => {
      const driver = new PasswordAuthDriver();

      await expect(driver.initialize({ resources: { users: {} }, helpers: {} }))
        .rejects.toThrow('PasswordAuthDriver requires password helper');
    });

    test('normalizes identifier and authenticates successfully', async () => {
      const context = createContext();
      const driver = new PasswordAuthDriver();
      await driver.initialize(context);

      const result = await driver.authenticate({
        email: 'USER@example.com',
        password: 'hunter2'
      });

      expect(context.resources.users.query).toHaveBeenCalledWith({
        email: 'user@example.com'
      });
      expect(context.helpers.password.verify).toHaveBeenCalledWith('hunter2', 'hashed');
      expect(result.success).toBe(true);
      expect(result.user).toEqual(expect.objectContaining({ id: 'u1', email: 'user@example.com' }));
    });

    test('returns invalid_credentials when password does not match', async () => {
      const usersResource = {
        query: vi.fn().mockResolvedValue([{ id: 'u1', email: 'user@example.com', password: 'hashed' }])
      };
      const passwordHelper = {
        verify: vi.fn().mockResolvedValue(false)
      };

      const driver = new PasswordAuthDriver();
      await driver.initialize({
        resources: { users: usersResource },
        helpers: { password: passwordHelper }
      });

      const result = await driver.authenticate({
        email: 'user@example.com',
        password: 'wrong-password'
      });

      expect(result).toEqual({
        success: false,
        error: 'invalid_credentials',
        statusCode: 401
      });
    });

    test('returns missing_credentials when identifier absent', async () => {
      const context = createContext();
      const driver = new PasswordAuthDriver();
      await driver.initialize(context);

      const result = await driver.authenticate({ password: 'secret' });

      expect(result).toEqual({
        success: false,
        error: 'missing_credentials',
        statusCode: 400
      });
    });
  });

  describe('ClientCredentialsAuthDriver', () => {
    const HASHED_SECRET = '$2b$12$abcdefghijklmnopqrstuv1234567890abcdefghijklmn0123456';

    const createContext = (clientRecord = {
      clientId: 'app',
      clientSecret: HASHED_SECRET,
      active: true
    }) => {
      const clientsResource = {
        query: vi.fn().mockResolvedValue([clientRecord])
      };
      const passwordHelper = {
        verify: vi.fn().mockResolvedValue(true)
      };

      return {
        resources: {
          clients: clientsResource
        },
        helpers: {
          password: passwordHelper
        }
      };
    };

    test('throws during initialize when clients resource missing', async () => {
      const driver = new ClientCredentialsAuthDriver();

      await expect(driver.initialize({ resources: {}, helpers: {} }))
        .rejects.toThrow('ClientCredentialsAuthDriver requires clients resource');
    });

    test('authenticates active client with hashed secret', async () => {
      const context = createContext();
      const driver = new ClientCredentialsAuthDriver();
      await driver.initialize(context);

      const result = await driver.authenticate({
        clientId: 'app',
        clientSecret: 's3cr3t'
      });

      expect(context.resources.clients.query).toHaveBeenCalledWith({ clientId: 'app' });
      expect(context.helpers.password.verify).toHaveBeenCalledWith('s3cr3t', HASHED_SECRET);
      expect(result.success).toBe(true);
      expect(result.client).toEqual(expect.objectContaining({ clientId: 'app' }));
      expect(result.client.clientSecret).toBeUndefined();
    });

    test('rejects inactive clients', async () => {
      const context = createContext({ clientId: 'app', clientSecret: HASHED_SECRET, active: false });
      const driver = new ClientCredentialsAuthDriver();
      await driver.initialize(context);

      const result = await driver.authenticate({
        clientId: 'app',
        clientSecret: 's3cr3t'
      });

      expect(result).toEqual({
        success: false,
        error: 'inactive_client',
        statusCode: 403
      });
    });

    test('rejects when secret verification fails', async () => {
      const context = createContext();
      context.helpers.password.verify.mockResolvedValue(false);
      const driver = new ClientCredentialsAuthDriver();
      await driver.initialize(context);

      const result = await driver.authenticate({
        clientId: 'app',
        clientSecret: 'wrong'
      });

      expect(result).toEqual({
        success: false,
        error: 'invalid_client',
        statusCode: 401
      });
    });
  });
});
