import { cloneDeep } from 'lodash-es';
import { describe, expect } from '@jest/globals';

import Schema from '../src/schema.class'

describe('Defaults', () => {
  test('options', async () => {
    const sch = new Schema({
      name: 'users',
      attributes: {},
    })

    expect(sch.name).toBe('users')
    expect(sch.version).toBe(1)
    expect(sch.options.autoDecrypt).toBe(true)
    expect(sch.options.generateAutoHooks).toBe(true)
    expect(sch.options.hooks.beforeMap).toEqual({})
    expect(sch.options.hooks.afterMap).toEqual({})
    expect(sch.options.hooks.beforeUnmap).toEqual({})
    expect(sch.options.hooks.afterUnmap).toEqual({})
  })
});

describe('Manual hooks', () => {
  const sch = new Schema({
    name: 'users',
    attributes: {
      name: 'string',
      surname: 'string',
    },
    options: {
      generateAutoHooks: false,
      hooks: {
        beforeMap: {
          name: ['trim', 'capitalize'],
        },
      }
    }
  })

  test('by options', async () => {
    expect(sch.options.hooks.beforeMap.name).toEqual(['trim', 'capitalize'])
  })

  test('by method', async () => {
    expect(sch.options.hooks.beforeMap.surname).toBeUndefined()

    sch.addHook('beforeMap', 'surname', 'trim')
    sch.addHook('beforeMap', 'surname', 'capitalize')

    expect(sch.options.hooks.beforeMap.surname).toEqual(['trim', 'capitalize'])
  })
})

describe('Auto generated hooks', () => {
  const sch = new Schema({
    name: 'users',
    attributes: {
      email: 'email',
      phones: 'array|items:string',
      age: 'number',
      active: 'boolean',
      password: 'secret',
    },
  })

  test('array', async () => {
    expect(sch.options.hooks.beforeMap.phones).toEqual(['fromArray'])
    expect(sch.options.hooks.afterUnmap.phones).toEqual(['toArray'])
  })

  test('number', async () => {
    expect(sch.options.hooks.beforeMap.age).toEqual(['toString'])
    expect(sch.options.hooks.afterUnmap.age).toEqual(['toNumber'])
  })

  test('boolean', async () => {
    expect(sch.options.hooks.beforeMap.active).toEqual(['fromBool'])
    expect(sch.options.hooks.afterUnmap.active).toEqual(['toBool'])
  })

  test('secret', async () => {
    // expect(sch.options.hooks.beforeMap.password).toEqual(['encrypt'])
    expect(sch.options.hooks.afterUnmap.password).toEqual(['decrypt'])
  })
})

describe(`map & unmap`, () => {
  const sch = new Schema({
    name: 'users',
    attributes: {
      level: 'number|optional',
      active: 'boolean|optional|default:false',
      user: {
        $$type: 'object',
        name: 'string',
        email: 'email',
        password: 'secret',
      }
    },
    options: {}
  })

  test('simple', async () => {
    const name = ' Filipe Forattini '
    const password = 'my-super-password'
    const email = 'filipe@forattini.com.br'

    const data1 = cloneDeep({
      user: {
        name,
        email,
        password,
      }
    })

    const check1 = await sch.validate(data1, { mutateOriginal: false })
    expect(check1).toBe(true)
    expect(data1.active).toBeUndefined()
    expect(data1.user.name).toBe(name)
    expect(data1.user.email).toBe(email)
    expect(data1.user.password).toBe(password)

    const check2 = await sch.validate(data1, { mutateOriginal: true })
    expect(check2).toBe(true)
    expect(data1.active).toBeDefined()
    expect(data1.active).toBe(false)
    expect(data1.user.name).toBe(name.trim())
    expect(data1.user.email).toBe(email)
    expect(data1.user.password).toBe(password)

    const mapped = await sch.mapper(data1)
    console.log(mapped,1)
    console.log(sch.options.hooks)
    expect(Object.keys(mapped)).toEqual(['1', '2', '3', '4', '_v'])

    const unmapped = await sch.unmapper(mapped)
    expect(unmapped).toEqual(data1)
  })
})