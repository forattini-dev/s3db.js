import { expect } from '@jest/globals';
import Validator from '../src/validator.class';

const DEFAULT_PASSPHRASE = '$ecret';

describe('Pre-conditions', () => {
  it('needs to have a passphrase param', async () => {
    const check = new Validator().compile({ password: 'secret' })
    const data = { password: 'my-password' }

    const results = await check(data)

    expect(results).toBeInstanceOf(Array)
    expect(results.length).toBe(1)
    expect(results[0].type).toBe('encryptionKeyMissing')
  })
  
  it('needs to be async', async () => {
    const check1 = new Validator({ passphrase: DEFAULT_PASSPHRASE })
      .compile({ password: 'secret' })

    const original = { password: 'my-password' }
    const data1 = JSON.parse(JSON.stringify(original))

    await check1(data1)
    expect(data1.password).toBeInstanceOf(Promise)

    const check2 = new Validator({ passphrase: DEFAULT_PASSPHRASE })
      .compile({ 
        $$async: true,
        password: 'secret'
      })
    
    const data2 = JSON.parse(JSON.stringify(original))
    await check2(data2)
    expect(data2.password).not.toBeInstanceOf(Promise)
  })
})

describe('Examples', () => {
  const validator = new Validator({ passphrase: DEFAULT_PASSPHRASE })
  
  it('simple', async () => {
    const check = validator.compile({
      $$async: true,
      email: 'string',
      password: 'secret',
    })

    const data = {
      email: 'filipe@forattini.com.br',
      password: 'secret',
    }

    const res = await check(data)
    expect(res).toBe(true)
  })

  it('with validations', async () => {
    const check = validator.compile({
      $$async: true,
      email: 'string',
      password: 'secret|min:12',
    })

    const data = {
      email: 'filipe@forattini.com.br',
      password: 'secret',
    }

    const res = await check(data)
    expect(res).toBeInstanceOf(Array)
    expect(res.length).toBe(1)
    expect(res[0].type).toBe('stringMin')
  })
});
