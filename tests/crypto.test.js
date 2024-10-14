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
    
    const decrypted1 = await decrypt(encrypted1, passphrase1)
    expect(decrypted1).toBeDefined()
    expect(decrypted1).toBe(content)
    
    const decrypted2 = await decrypt(encrypted2, passphrase2)
    expect(decrypted2).toBeDefined()
    expect(decrypted2).toBe(content)
  })
});
