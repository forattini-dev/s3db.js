import { encrypt, decrypt, sha256 } from '../src/crypto.js';

describe('Crypto Functions - Encryption and Hashing', () => {
  describe('sha256', () => {
    test('Deve gerar hash SHA256 correto para strings simples', async () => {
      const hash = await sha256('hello world');
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
      expect(hash).toHaveLength(64); // SHA256 sempre produz 64 caracteres hex
    });

    test('Deve gerar hashes diferentes para strings diferentes', async () => {
      const hash1 = await sha256('password123');
      const hash2 = await sha256('password124');
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
    });

    test('Deve gerar o mesmo hash para a mesma string', async () => {
      const text = 'consistent hashing test';
      const hash1 = await sha256(text);
      const hash2 = await sha256(text);
      
      expect(hash1).toBe(hash2);
    });

    test('Deve lidar com strings vazias', async () => {
      const hash = await sha256('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(hash).toHaveLength(64);
    });

    test('Deve lidar com caracteres especiais e emojis', async () => {
      const hash1 = await sha256('café com açúcar');
      const hash2 = await sha256('🐕🐶 dogs are cute!');
      
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('encrypt/decrypt', () => {
    const testPassphrase = 'my-secret-passphrase-2024';

    test('Deve criptografar e descriptografar texto simples', async () => {
      const originalText = 'Hello World!';
      
      const encrypted = await encrypt(originalText, testPassphrase);
      expect(encrypted).not.toBe(originalText);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 format
      
      const decrypted = await decrypt(encrypted, testPassphrase);
      expect(decrypted).toBe(originalText);
    });

    test('Deve gerar criptografias diferentes a cada execução (devido ao IV aleatório)', async () => {
      const text = 'same text for different encryptions';
      
      const encrypted1 = await encrypt(text, testPassphrase);
      const encrypted2 = await encrypt(text, testPassphrase);
      
      expect(encrypted1).not.toBe(encrypted2); // IV diferente = resultado diferente
      
      // Mas ambos devem descriptografar para o mesmo texto
      const decrypted1 = await decrypt(encrypted1, testPassphrase);
      const decrypted2 = await decrypt(encrypted2, testPassphrase);
      
      expect(decrypted1).toBe(text);
      expect(decrypted2).toBe(text);
    });

    test('Deve falhar ao descriptografar com passphrase incorreta', async () => {
      const originalText = 'sensitive information';
      const encrypted = await encrypt(originalText, testPassphrase);
      
      await expect(decrypt(encrypted, 'wrong-passphrase')).rejects.toThrow();
    });

    test('Deve lidar com strings vazias', async () => {
      const encrypted = await encrypt('', testPassphrase);
      const decrypted = await decrypt(encrypted, testPassphrase);
      
      expect(decrypted).toBe('');
    });

    test('Deve lidar com textos longos', async () => {
      const longText = 'A'.repeat(10000); // 10KB de texto
      
      const encrypted = await encrypt(longText, testPassphrase);
      const decrypted = await decrypt(encrypted, testPassphrase);
      
      expect(decrypted).toBe(longText);
      expect(decrypted).toHaveLength(10000);
    });

    test('Deve lidar com caracteres especiais, acentos e emojis', async () => {
      const specialText = 'Olá! Café com açúcar ☕ e pão 🍞 custam R$ 15,50';
      
      const encrypted = await encrypt(specialText, testPassphrase);
      const decrypted = await decrypt(encrypted, testPassphrase);
      
      expect(decrypted).toBe(specialText);
    });
  });

  describe('Cenário Real: Gerenciamento de senhas de usuários', () => {
    const users = [
      { username: 'admin', password: 'super-secret-admin-2024!' },
      { username: 'user1', password: 'my-password-123' },
      { username: 'user2', password: 'another-secure-pwd!' },
      { username: 'guest', password: 'temporary-guest-access' }
    ];

    test('Deve criptografar todas as senhas dos usuários', async () => {
      const encryptedUsers = [];
      
      for (const user of users) {
        const encryptedPassword = await encrypt(user.password, 'user-master-key');
        encryptedUsers.push({
          username: user.username,
          passwordHash: await sha256(user.password), // Hash para verificação
          encryptedPassword: encryptedPassword
        });
      }
      
      expect(encryptedUsers).toHaveLength(4);
      
      // Verificar que todas as senhas foram criptografadas (diferente da original)
      encryptedUsers.forEach((encUser, index) => {
        expect(encUser.encryptedPassword).not.toBe(users[index].password);
        expect(encUser.passwordHash).toHaveLength(64); // SHA256 hash length
      });
    });

    test('Deve descriptografar e verificar senhas corretamente', async () => {
      const masterKey = 'company-password-encryption-key-2024';
      const encryptedPasswords = {};
      
      // Criptografar todas as senhas
      for (const user of users) {
        encryptedPasswords[user.username] = await encrypt(user.password, masterKey);
      }
      
      // Simular processo de login: descriptografar e verificar
      for (const user of users) {
        const decryptedPassword = await decrypt(encryptedPasswords[user.username], masterKey);
        expect(decryptedPassword).toBe(user.password);
        
        // Verificar hash também
        const passwordHash = await sha256(decryptedPassword);
        const originalHash = await sha256(user.password);
        expect(passwordHash).toBe(originalHash);
      }
    });

    test('Deve simular rotação de chave mestre', async () => {
      const oldMasterKey = 'old-master-key-2023';
      const newMasterKey = 'new-master-key-2024';
      
      // Criptografar com chave antiga
      const oldEncryptedPasswords = {};
      for (const user of users) {
        oldEncryptedPasswords[user.username] = await encrypt(user.password, oldMasterKey);
      }
      
      // Simular rotação: descriptografar com chave antiga e re-criptografar com nova
      const newEncryptedPasswords = {};
      for (const user of users) {
        const decrypted = await decrypt(oldEncryptedPasswords[user.username], oldMasterKey);
        newEncryptedPasswords[user.username] = await encrypt(decrypted, newMasterKey);
      }
      
      // Verificar que as novas criptografias são diferentes das antigas
      for (const user of users) {
        expect(newEncryptedPasswords[user.username]).not.toBe(oldEncryptedPasswords[user.username]);
        
        // Mas ainda descriptografam para a mesma senha original
        const finalDecrypted = await decrypt(newEncryptedPasswords[user.username], newMasterKey);
        expect(finalDecrypted).toBe(user.password);
      }
    });
  });

  describe('Cenário Real: API Keys criptografadas', () => {
    const apiKeys = [
      'ak_live_1234567890abcdef1234567890abcdef',
      'ak_test_abcdef1234567890abcdef1234567890',
      'ak_prod_fedcba0987654321fedcba0987654321',
      'ak_dev_123abc456def789ghi012jkl345mno678'
    ];

    test('Deve criptografar e armazenar API keys com segurança', async () => {
      const companyPassphrase = 'company-api-encryption-key-ultra-secure-2024';
      const encryptedKeys = [];
      
      for (const apiKey of apiKeys) {
        const encrypted = await encrypt(apiKey, companyPassphrase);
        const keyHash = await sha256(apiKey); // Para busca sem descriptografar
        
        encryptedKeys.push({
          keyId: keyHash.substring(0, 16), // Primeiros 16 chars do hash como ID
          encryptedValue: encrypted,
          keyType: apiKey.includes('live') ? 'live' : 
                   apiKey.includes('prod') ? 'production' : 
                   apiKey.includes('test') ? 'test' : 'development',
          createdAt: new Date().toISOString()
        });
      }
      
      expect(encryptedKeys).toHaveLength(4);
      
      // Verificar que nenhuma API key está em texto plano
      encryptedKeys.forEach(key => {
        expect(key.encryptedValue).not.toContain('ak_');
        expect(key.keyId).toHaveLength(16);
        expect(['live', 'production', 'test', 'development']).toContain(key.keyType);
      });
    });

    test('Deve recuperar API key específica por ID', async () => {
      const passphrase = 'api-key-vault-2024';
      const targetApiKey = 'ak_live_special1234567890abcdef1234567890';
      
      // Simular armazenamento
      const encrypted = await encrypt(targetApiKey, passphrase);
      const keyId = (await sha256(targetApiKey)).substring(0, 16);
      
      // Simular recuperação
      const decrypted = await decrypt(encrypted, passphrase);
      const verificationId = (await sha256(decrypted)).substring(0, 16);
      
      expect(decrypted).toBe(targetApiKey);
      expect(verificationId).toBe(keyId);
    });
  });

  describe('Edge Cases e Segurança', () => {
    test('Deve rejeitar tentativa de descriptografar dados corrompidos', async () => {
      const corruptedData = 'invalid-base64-data-that-cannot-be-decrypted';
      
      await expect(decrypt(corruptedData, 'any-passphrase')).rejects.toThrow();
    });

    test('Deve rejeitar tentativa de descriptografar com dados parcialmente corrompidos', async () => {
      const originalText = 'test message';
      const encrypted = await encrypt(originalText, 'test-key');
      
      // Corromper um caractere no meio
      const corrupted = encrypted.slice(0, -5) + 'XXXXX';
      
      await expect(decrypt(corrupted, 'test-key')).rejects.toThrow();
    });

    test('Deve garantir que salt e IV sejam únicos em cada criptografia', async () => {
      const text = 'same text, different encryption';
      const passphrase = 'same-passphrase';
      
      const results = [];
      for (let i = 0; i < 5; i++) {
        const encrypted = await encrypt(text, passphrase);
        results.push(encrypted);
      }
      
      // Todos os resultados devem ser diferentes (devido a salt e IV únicos)
      const uniqueResults = [...new Set(results)];
      expect(uniqueResults).toHaveLength(5);
      
      // Mas todos devem descriptografar para o mesmo texto
      for (const encrypted of results) {
        const decrypted = await decrypt(encrypted, passphrase);
        expect(decrypted).toBe(text);
      }
    });

    test('Deve lidar com passphrases muito curtas ou longas', async () => {
      const text = 'test message';
      
      // Passphrase muito curta
      const shortPassphrase = 'a';
      const encryptedShort = await encrypt(text, shortPassphrase);
      const decryptedShort = await decrypt(encryptedShort, shortPassphrase);
      expect(decryptedShort).toBe(text);
      
      // Passphrase muito longa
      const longPassphrase = 'a'.repeat(1000);
      const encryptedLong = await encrypt(text, longPassphrase);
      const decryptedLong = await decrypt(encryptedLong, longPassphrase);
      expect(decryptedLong).toBe(text);
    });
  });
});