import { encrypt, decrypt } from '../src/crypto';

describe('Crypto', () => {
  test('complete', async () => {
    const passphrase1 = 'secret1'
    const passphrase2 = 'secret2'
    const content = 'Hello, world!'

    const encrypted1 = await encrypt(content, passphrase1)
    expect(encrypted1).toBeDefined()

    const encrypted2 = await encrypt(content, passphrase2)
    expect(encrypted2).toBeDefined()
    expect(encrypted1).not.toBe(encrypted2)
    
    const decrypted = await decrypt(encrypted1, passphrase1)
    expect(decrypted).toBeDefined()
    expect(decrypted).toBe(content)
  })
});
