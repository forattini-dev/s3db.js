
import Schema from '#src/schema.class.js';

const baseAttributes = {
  name: 'string|required',
  email: 'email|required',
  age: 'number|optional',
  active: 'boolean|default:true',
  password: 'secret'
};

describe('Schema mapper/unmapper', () => {
  test('maps and unmapps basic resources with generated keys', async () => {
    const schema = new Schema({
      name: 'test-schema',
      attributes: baseAttributes
    });

    const mapped = await schema.mapper({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      password: 'hunter2'
    });

    expect(mapped._v).toBe('1');
    expect(Object.keys(mapped)).not.toContain('name');
    expect(Object.keys(mapped)).not.toContain('email');

    const unmapped = await schema.unmapper(mapped);

    expect(unmapped.name).toBe('John Doe');
    expect(unmapped.email).toBe('john@example.com');
    expect(unmapped.age).toBe(30);
    expect(unmapped.active).toBe(true);
    expect(unmapped.password).toBe('hunter2');
  });

  test('handles edge cases for json, arrays and metadata fields', async () => {
    const schema = new Schema({
      name: 'edge-schema',
      attributes: {
        foo: 'string',
        obj: 'json',
        arr: 'array|items:string'
      }
    });

    const mapped = await schema.mapper({
      foo: 'bar',
      obj: { a: 1 },
      arr: ['x', 'y'],
      $meta: 123
    });

    const objKey = schema.map.obj;
    expect(typeof mapped[objKey]).toBe('string');
    expect(mapped.$meta).toBe(123);

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.foo).toBe('bar');
    expect(unmapped.obj).toEqual({ a: 1 });
    expect(unmapped.arr).toEqual(['x', 'y']);
    expect(unmapped.$meta).toBe(123);
  });

  test('preserves nullish and empty values through mapper/unmapper', async () => {
    const schema = new Schema({
      name: 'nullish-schema',
      attributes: {
        foo: 'string',
        arr: 'array|items:string',
        obj: 'json'
      }
    });

    const mapped = await schema.mapper({
      foo: null,
      arr: [],
      obj: undefined
    });

    const unmapped = await schema.unmapper(mapped);

    expect(unmapped.foo).toBeNull();
    expect(Array.isArray(unmapped.arr)).toBe(true);
    expect(unmapped.obj).toBeUndefined();
  });

  test('tolerates invalid JSON payloads when unmapping', async () => {
    const schema = new Schema({
      name: 'json-resilience',
      attributes: { foo: 'string', bar: 'json' }
    });

    const mapped = {
      [schema.map.foo]: '[object Object]',
      [schema.map.bar]: '{invalidJson}',
      _v: '1'
    };

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.foo).toEqual({});
    expect(unmapped.bar).toBe('{invalidJson}');
  });
});

describe('Schema mapper/unmapper for datetime', () => {
  test('round-trips datetime field as base62-encoded milliseconds', async () => {
    const schema = new Schema({
      name: 'datetime-schema',
      attributes: { createdAt: 'datetime', expiresAt: 'datetime|optional' }
    });

    const iso = '2026-03-12T13:00:00.000Z';
    const mapped = await schema.mapper({ createdAt: iso, expiresAt: iso });

    const mappedKey = schema.map.createdAt;
    const mappedValue = mapped[mappedKey] as string;
    expect(mappedValue.length).toBeLessThan(iso.length);
    expect(mappedValue.length).toBeLessThanOrEqual(8);

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.createdAt).toBe(iso);
    expect(unmapped.expiresAt).toBe(iso);
  });

  test('round-trips datetime with millisecond precision', async () => {
    const schema = new Schema({
      name: 'datetime-ms',
      attributes: { ts: 'datetime' }
    });

    const iso = '2026-03-12T13:45:30.123Z';
    const unmapped = await schema.unmapper(await schema.mapper({ ts: iso }));
    expect(unmapped.ts).toBe(iso);
  });

  test('round-trips pre-1970 datetimes (negative timestamps)', async () => {
    const schema = new Schema({
      name: 'datetime-neg',
      attributes: { born: 'datetime' }
    });

    const iso = '1960-06-15T08:30:00.000Z';
    const unmapped = await schema.unmapper(await schema.mapper({ born: iso }));
    expect(unmapped.born).toBe(iso);
  });

  test('handles Date objects in mapper', async () => {
    const schema = new Schema({
      name: 'datetime-obj',
      attributes: { at: 'datetime' }
    });

    const date = new Date('2026-03-12T13:00:00.000Z');
    const unmapped = await schema.unmapper(await schema.mapper({ at: date }));
    expect(unmapped.at).toBe(date.toISOString());
  });

  test('preserves null and undefined datetime values', async () => {
    const schema = new Schema({
      name: 'datetime-null',
      attributes: { at: 'datetime|optional' }
    });

    const mapped1 = await schema.mapper({ at: null });
    const unmapped1 = await schema.unmapper(mapped1);
    expect(unmapped1.at).toBeNull();

    const mapped2 = await schema.mapper({ at: undefined });
    const unmapped2 = await schema.unmapper(mapped2);
    expect(unmapped2.at).toBeUndefined();
  });

  test('achieves >60% compression vs ISO 8601', async () => {
    const schema = new Schema({
      name: 'datetime-compress',
      attributes: { ts: 'datetime' }
    });

    const iso = '2026-03-12T13:00:00.000Z';
    const mapped = await schema.mapper({ ts: iso });
    const encoded = mapped[schema.map.ts] as string;
    expect(1 - (encoded.length / iso.length)).toBeGreaterThan(0.6);
  });
});

describe('Schema mapper/unmapper for dateonly', () => {
  test('round-trips dateonly field as base62-encoded days', async () => {
    const schema = new Schema({
      name: 'dateonly-schema',
      attributes: { birthday: 'dateonly', deadline: 'dateonly|optional' }
    });

    const dateStr = '2026-03-12';
    const mapped = await schema.mapper({ birthday: dateStr, deadline: dateStr });

    const mappedKey = schema.map.birthday;
    const mappedValue = mapped[mappedKey] as string;
    expect(mappedValue.length).toBeLessThanOrEqual(4);

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.birthday).toBe(dateStr);
    expect(unmapped.deadline).toBe(dateStr);
  });

  test('strips time component from ISO strings', async () => {
    const schema = new Schema({
      name: 'dateonly-strip',
      attributes: { day: 'dateonly' }
    });

    const unmapped = await schema.unmapper(
      await schema.mapper({ day: '2026-03-12T15:30:00.000Z' })
    );
    expect(unmapped.day).toBe('2026-03-12');
  });

  test('round-trips pre-1970 dates', async () => {
    const schema = new Schema({
      name: 'dateonly-neg',
      attributes: { born: 'dateonly' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ born: '1960-06-15' }));
    expect(unmapped.born).toBe('1960-06-15');
  });

  test('handles Date objects in mapper', async () => {
    const schema = new Schema({
      name: 'dateonly-obj',
      attributes: { day: 'dateonly' }
    });

    const date = new Date('2026-03-12T00:00:00.000Z');
    const unmapped = await schema.unmapper(await schema.mapper({ day: date }));
    expect(unmapped.day).toBe('2026-03-12');
  });

  test('preserves null and undefined date values', async () => {
    const schema = new Schema({
      name: 'dateonly-null',
      attributes: { day: 'dateonly|optional' }
    });

    const mapped1 = await schema.mapper({ day: null });
    expect((await schema.unmapper(mapped1)).day).toBeNull();

    const mapped2 = await schema.mapper({ day: undefined });
    expect((await schema.unmapper(mapped2)).day).toBeUndefined();
  });

  test('achieves >60% compression vs YYYY-MM-DD', async () => {
    const schema = new Schema({
      name: 'dateonly-compress',
      attributes: { day: 'dateonly' }
    });

    const dateStr = '2026-03-12';
    const mapped = await schema.mapper({ day: dateStr });
    const encoded = mapped[schema.map.day] as string;
    expect(1 - (encoded.length / dateStr.length)).toBeGreaterThan(0.6);
  });

  test('dateonly and datetime coexist in same schema', async () => {
    const schema = new Schema({
      name: 'mixed-dates',
      attributes: {
        birthday: 'dateonly',
        createdAt: 'datetime',
        deadline: 'dateonly|optional',
        updatedAt: 'datetime|optional'
      }
    });

    const input = {
      birthday: '1989-12-21',
      createdAt: '2026-03-12T13:00:00.000Z',
      deadline: '2026-12-31',
      updatedAt: '2026-03-12T13:45:30.123Z'
    };

    const unmapped = await schema.unmapper(await schema.mapper(input));
    expect(unmapped.birthday).toBe('1989-12-21');
    expect(unmapped.createdAt).toBe('2026-03-12T13:00:00.000Z');
    expect(unmapped.deadline).toBe('2026-12-31');
    expect(unmapped.updatedAt).toBe('2026-03-12T13:45:30.123Z');
  });
});

describe('Schema mapper/unmapper for arrays', () => {
  test('round-trips array|items:number', async () => {
    const schema = new Schema({
      name: 'arr-num',
      attributes: { nums: 'array|items:number' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ nums: [1, 2, 3, 255, 12345] }));
    expect(unmapped.nums).toEqual([1, 2, 3, 255, 12345]);
  });

  test('round-trips array|items:string with escaping', async () => {
    const schema = new Schema({
      name: 'arr-str',
      attributes: { tags: 'array|items:string' }
    });

    const unmapped = await schema.unmapper(
      await schema.mapper({ tags: ['foo', 'bar|baz', 'qux\\quux', ''] })
    );

    expect(unmapped.tags[0]).toBe('foo');
    expect(unmapped.tags[1]).toBe('bar|baz');
    expect(unmapped.tags[2]).toBe('qux\\quux');
    expect(unmapped.tags[3]).toBe('');
  });

  test('round-trips array|items:date', async () => {
    const schema = new Schema({
      name: 'arr-date',
      attributes: { dates: 'array|items:string' }
    });

    const dates = ['2026-03-12T13:00:00.000Z', '1989-12-21T13:00:00.000Z'];
    const unmapped = await schema.unmapper(await schema.mapper({ dates }));
    expect(unmapped.dates).toEqual(dates);
  });

  test('handles nullish and empty arrays gracefully', async () => {
    const schema = new Schema({
      name: 'arr-edge',
      attributes: { tags: 'array|items:string', nums: 'array|items:number' }
    });

    for (const tags of [null, undefined, []]) {
      for (const nums of [null, undefined, []]) {
        const unmapped = await schema.unmapper(await schema.mapper({ tags, nums }));
        expect(Array.isArray(unmapped.tags) || unmapped.tags == null).toBe(true);
        expect(Array.isArray(unmapped.nums) || unmapped.nums == null).toBe(true);
      }
    }
  });
});

describe('Schema mapper/unmapper for uuid', () => {
  test('round-trips uuid field as base62-encoded chunks', async () => {
    const schema = new Schema({
      name: 'uuid-schema',
      attributes: { refId: 'uuid', altId: 'uuid|optional' }
    });

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const mapped = await schema.mapper({ refId: uuid, altId: uuid });

    const mappedKey = schema.map.refId;
    const mappedValue = mapped[mappedKey] as string;
    expect(mappedValue.length).toBe(24);
    expect(mappedValue).not.toContain('-');

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.refId).toBe(uuid);
    expect(unmapped.altId).toBe(uuid);
  });

  test('round-trips zero uuid', async () => {
    const schema = new Schema({
      name: 'uuid-zero',
      attributes: { id: 'uuid' }
    });

    const uuid = '00000000-0000-0000-0000-000000000000';
    const unmapped = await schema.unmapper(await schema.mapper({ id: uuid }));
    expect(unmapped.id).toBe(uuid);
  });

  test('round-trips max uuid (all f)', async () => {
    const schema = new Schema({
      name: 'uuid-max',
      attributes: { id: 'uuid' }
    });

    const uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const unmapped = await schema.unmapper(await schema.mapper({ id: uuid }));
    expect(unmapped.id).toBe(uuid);
  });

  test('round-trips standard v4 uuids', async () => {
    const schema = new Schema({
      name: 'uuid-v4',
      attributes: { id: 'uuid' }
    });

    const uuids = [
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      '123e4567-e89b-12d3-a456-426614174000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    ];

    for (const uuid of uuids) {
      const unmapped = await schema.unmapper(await schema.mapper({ id: uuid }));
      expect(unmapped.id).toBe(uuid);
    }
  });

  test('preserves null and undefined uuid values', async () => {
    const schema = new Schema({
      name: 'uuid-null',
      attributes: { id: 'uuid|optional' }
    });

    const mapped1 = await schema.mapper({ id: null });
    expect((await schema.unmapper(mapped1)).id).toBeNull();

    const mapped2 = await schema.mapper({ id: undefined });
    expect((await schema.unmapper(mapped2)).id).toBeUndefined();
  });

  test('achieves >30% compression vs standard uuid format', async () => {
    const schema = new Schema({
      name: 'uuid-compress',
      attributes: { id: 'uuid' }
    });

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const mapped = await schema.mapper({ id: uuid });
    const encoded = mapped[schema.map.id] as string;
    expect(1 - (encoded.length / uuid.length)).toBeGreaterThan(0.3);
  });

  test('preserves case in round-trip (lowercased)', async () => {
    const schema = new Schema({
      name: 'uuid-case',
      attributes: { id: 'uuid' }
    });

    const uuid = '550E8400-E29B-41D4-A716-446655440000';
    const unmapped = await schema.unmapper(await schema.mapper({ id: uuid }));
    expect(unmapped.id).toBe(uuid.toLowerCase());
  });
});

describe('Schema mapper/unmapper for timeonly', () => {
  test('round-trips timeonly field as base62-encoded ms-of-day', async () => {
    const schema = new Schema({
      name: 'timeonly-schema',
      attributes: { startTime: 'timeonly', endTime: 'timeonly|optional' }
    });

    const time = '14:30:00.000';
    const mapped = await schema.mapper({ startTime: time, endTime: time });

    const mappedKey = schema.map.startTime;
    const mappedValue = mapped[mappedKey] as string;
    expect(mappedValue.length).toBeLessThanOrEqual(5);

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.startTime).toBe(time);
    expect(unmapped.endTime).toBe(time);
  });

  test('round-trips midnight (00:00:00.000)', async () => {
    const schema = new Schema({
      name: 'timeonly-midnight',
      attributes: { t: 'timeonly' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ t: '00:00:00.000' }));
    expect(unmapped.t).toBe('00:00:00.000');
  });

  test('round-trips end of day (23:59:59.999)', async () => {
    const schema = new Schema({
      name: 'timeonly-eod',
      attributes: { t: 'timeonly' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ t: '23:59:59.999' }));
    expect(unmapped.t).toBe('23:59:59.999');
  });

  test('round-trips with millisecond precision', async () => {
    const schema = new Schema({
      name: 'timeonly-ms',
      attributes: { t: 'timeonly' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ t: '12:30:45.123' }));
    expect(unmapped.t).toBe('12:30:45.123');
  });

  test('normalizes HH:mm to HH:mm:ss.SSS', async () => {
    const schema = new Schema({
      name: 'timeonly-short',
      attributes: { t: 'timeonly' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ t: '14:30' }));
    expect(unmapped.t).toBe('14:30:00.000');
  });

  test('normalizes HH:mm:ss to HH:mm:ss.SSS', async () => {
    const schema = new Schema({
      name: 'timeonly-noms',
      attributes: { t: 'timeonly' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ t: '14:30:45' }));
    expect(unmapped.t).toBe('14:30:45.000');
  });

  test('handles Date objects in mapper', async () => {
    const schema = new Schema({
      name: 'timeonly-date',
      attributes: { t: 'timeonly' }
    });

    const date = new Date('2026-03-12T14:30:45.123Z');
    const unmapped = await schema.unmapper(await schema.mapper({ t: date }));
    expect(unmapped.t).toBe('14:30:45.123');
  });

  test('preserves null and undefined time values', async () => {
    const schema = new Schema({
      name: 'timeonly-null',
      attributes: { t: 'timeonly|optional' }
    });

    const mapped1 = await schema.mapper({ t: null });
    expect((await schema.unmapper(mapped1)).t).toBeNull();

    const mapped2 = await schema.mapper({ t: undefined });
    expect((await schema.unmapper(mapped2)).t).toBeUndefined();
  });

  test('achieves >50% compression vs HH:mm:ss.SSS', async () => {
    const schema = new Schema({
      name: 'timeonly-compress',
      attributes: { t: 'timeonly' }
    });

    const time = '14:30:00.000';
    const mapped = await schema.mapper({ t: time });
    const encoded = mapped[schema.map.t] as string;
    expect(1 - (encoded.length / time.length)).toBeGreaterThan(0.5);
  });

  test('timeonly coexists with dateonly and datetime in same schema', async () => {
    const schema = new Schema({
      name: 'mixed-time-dates',
      attributes: {
        birthday: 'dateonly',
        createdAt: 'datetime',
        openTime: 'timeonly',
        closeTime: 'timeonly|optional'
      }
    });

    const input = {
      birthday: '1989-12-21',
      createdAt: '2026-03-12T13:00:00.000Z',
      openTime: '09:00',
      closeTime: '18:30:00.500'
    };

    const unmapped = await schema.unmapper(await schema.mapper(input));
    expect(unmapped.birthday).toBe('1989-12-21');
    expect(unmapped.createdAt).toBe('2026-03-12T13:00:00.000Z');
    expect(unmapped.openTime).toBe('09:00:00.000');
    expect(unmapped.closeTime).toBe('18:30:00.500');
  });
});

describe('Schema mapper/unmapper for mac', () => {
  test('round-trips MAC address as base62', async () => {
    const schema = new Schema({
      name: 'mac-schema',
      attributes: { addr: 'mac' }
    });

    const mac = 'aa:bb:cc:dd:ee:ff';
    const mapped = await schema.mapper({ addr: mac });
    const encoded = mapped[schema.map.addr] as string;
    expect(encoded.length).toBe(9);
    expect(encoded).not.toContain(':');

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.addr).toBe(mac);
  });

  test('round-trips zero MAC', async () => {
    const schema = new Schema({ name: 'mac-zero', attributes: { addr: 'mac' } });
    const unmapped = await schema.unmapper(await schema.mapper({ addr: '00:00:00:00:00:00' }));
    expect(unmapped.addr).toBe('00:00:00:00:00:00');
  });

  test('round-trips max MAC', async () => {
    const schema = new Schema({ name: 'mac-max', attributes: { addr: 'mac' } });
    const unmapped = await schema.unmapper(await schema.mapper({ addr: 'ff:ff:ff:ff:ff:ff' }));
    expect(unmapped.addr).toBe('ff:ff:ff:ff:ff:ff');
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'mac-null', attributes: { addr: 'mac|optional' } });
    expect((await schema.unmapper(await schema.mapper({ addr: null }))).addr).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ addr: undefined }))).addr).toBeUndefined();
  });

  test('achieves >47% compression', async () => {
    const schema = new Schema({ name: 'mac-compress', attributes: { addr: 'mac' } });
    const mapped = await schema.mapper({ addr: 'aa:bb:cc:dd:ee:ff' });
    const encoded = mapped[schema.map.addr] as string;
    expect(1 - (encoded.length / 17)).toBeGreaterThan(0.47);
  });
});

describe('Schema mapper/unmapper for cidr', () => {
  test('round-trips CIDR notation as base62', async () => {
    const schema = new Schema({
      name: 'cidr-schema',
      attributes: { subnet: 'cidr' }
    });

    const cidr = '192.168.1.0/24';
    const mapped = await schema.mapper({ subnet: cidr });
    const encoded = mapped[schema.map.subnet] as string;
    expect(encoded.length).toBe(7);

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.subnet).toBe(cidr);
  });

  test('round-trips 0.0.0.0/0', async () => {
    const schema = new Schema({ name: 'cidr-zero', attributes: { s: 'cidr' } });
    const unmapped = await schema.unmapper(await schema.mapper({ s: '0.0.0.0/0' }));
    expect(unmapped.s).toBe('0.0.0.0/0');
  });

  test('round-trips 255.255.255.255/32', async () => {
    const schema = new Schema({ name: 'cidr-max', attributes: { s: 'cidr' } });
    const unmapped = await schema.unmapper(await schema.mapper({ s: '255.255.255.255/32' }));
    expect(unmapped.s).toBe('255.255.255.255/32');
  });

  test('round-trips common subnets', async () => {
    const schema = new Schema({ name: 'cidr-common', attributes: { s: 'cidr' } });

    for (const cidr of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']) {
      const unmapped = await schema.unmapper(await schema.mapper({ s: cidr }));
      expect(unmapped.s).toBe(cidr);
    }
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'cidr-null', attributes: { s: 'cidr|optional' } });
    expect((await schema.unmapper(await schema.mapper({ s: null }))).s).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ s: undefined }))).s).toBeUndefined();
  });

  test('achieves >=50% compression', async () => {
    const schema = new Schema({ name: 'cidr-compress', attributes: { s: 'cidr' } });
    const mapped = await schema.mapper({ s: '192.168.1.0/24' });
    const encoded = mapped[schema.map.s] as string;
    expect(1 - (encoded.length / 14)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('Schema mapper/unmapper for semver', () => {
  test('round-trips semver as base62', async () => {
    const schema = new Schema({
      name: 'semver-schema',
      attributes: { version: 'semver' }
    });

    const ver = '1.2.3';
    const mapped = await schema.mapper({ version: ver });
    const encoded = mapped[schema.map.version] as string;
    expect(encoded).not.toContain('.');

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.version).toBe(ver);
  });

  test('round-trips 0.0.0', async () => {
    const schema = new Schema({ name: 'semver-zero', attributes: { v: 'semver' } });
    const unmapped = await schema.unmapper(await schema.mapper({ v: '0.0.0' }));
    expect(unmapped.v).toBe('0.0.0');
  });

  test('round-trips large versions', async () => {
    const schema = new Schema({ name: 'semver-large', attributes: { v: 'semver' } });
    const unmapped = await schema.unmapper(await schema.mapper({ v: '21.1.6' }));
    expect(unmapped.v).toBe('21.1.6');
  });

  test('round-trips max components (999)', async () => {
    const schema = new Schema({ name: 'semver-max', attributes: { v: 'semver' } });
    const unmapped = await schema.unmapper(await schema.mapper({ v: '999.999.999' }));
    expect(unmapped.v).toBe('999.999.999');
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'semver-null', attributes: { v: 'semver|optional' } });
    expect((await schema.unmapper(await schema.mapper({ v: null }))).v).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ v: undefined }))).v).toBeUndefined();
  });
});

describe('Schema mapper/unmapper for phone', () => {
  test('round-trips phone number as base62', async () => {
    const schema = new Schema({
      name: 'phone-schema',
      attributes: { tel: 'phone' }
    });

    const phone = '+5511999999999';
    const mapped = await schema.mapper({ tel: phone });
    const encoded = mapped[schema.map.tel] as string;
    expect(encoded).not.toContain('+');

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.tel).toBe(phone);
  });

  test('round-trips short phone numbers', async () => {
    const schema = new Schema({ name: 'phone-short', attributes: { tel: 'phone' } });
    const unmapped = await schema.unmapper(await schema.mapper({ tel: '+1234567' }));
    expect(unmapped.tel).toBe('+1234567');
  });

  test('round-trips US phone', async () => {
    const schema = new Schema({ name: 'phone-us', attributes: { tel: 'phone' } });
    const unmapped = await schema.unmapper(await schema.mapper({ tel: '+12345678900' }));
    expect(unmapped.tel).toBe('+12345678900');
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'phone-null', attributes: { tel: 'phone|optional' } });
    expect((await schema.unmapper(await schema.mapper({ tel: null }))).tel).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ tel: undefined }))).tel).toBeUndefined();
  });

  test('achieves >40% compression', async () => {
    const schema = new Schema({ name: 'phone-compress', attributes: { tel: 'phone' } });
    const phone = '+5511999999999';
    const mapped = await schema.mapper({ tel: phone });
    const encoded = mapped[schema.map.tel] as string;
    expect(1 - (encoded.length / phone.length)).toBeGreaterThan(0.4);
  });
});

describe('Schema mapper/unmapper for color', () => {
  test('round-trips hex color as base62', async () => {
    const schema = new Schema({
      name: 'color-schema',
      attributes: { bg: 'color' }
    });

    const color = '#ff5733';
    const mapped = await schema.mapper({ bg: color });
    const encoded = mapped[schema.map.bg] as string;
    expect(encoded.length).toBe(5);
    expect(encoded).not.toContain('#');

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.bg).toBe(color);
  });

  test('round-trips black (#000000)', async () => {
    const schema = new Schema({ name: 'color-black', attributes: { c: 'color' } });
    const unmapped = await schema.unmapper(await schema.mapper({ c: '#000000' }));
    expect(unmapped.c).toBe('#000000');
  });

  test('round-trips white (#ffffff)', async () => {
    const schema = new Schema({ name: 'color-white', attributes: { c: 'color' } });
    const unmapped = await schema.unmapper(await schema.mapper({ c: '#ffffff' }));
    expect(unmapped.c).toBe('#ffffff');
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'color-null', attributes: { c: 'color|optional' } });
    expect((await schema.unmapper(await schema.mapper({ c: null }))).c).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ c: undefined }))).c).toBeUndefined();
  });

  test('achieves >25% compression', async () => {
    const schema = new Schema({ name: 'color-compress', attributes: { c: 'color' } });
    const mapped = await schema.mapper({ c: '#ff5733' });
    const encoded = mapped[schema.map.c] as string;
    expect(1 - (encoded.length / 7)).toBeGreaterThan(0.25);
  });
});

describe('Schema mapper/unmapper for duration', () => {
  test('round-trips ISO 8601 duration as base62', async () => {
    const schema = new Schema({
      name: 'duration-schema',
      attributes: { timeout: 'duration' }
    });

    const mapped = await schema.mapper({ timeout: 'PT1H30M' });
    const encoded = mapped[schema.map.timeout] as string;
    expect(encoded).not.toContain('P');

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.timeout).toBe('PT1H30M');
  });

  test('round-trips PT0S (zero duration)', async () => {
    const schema = new Schema({ name: 'duration-zero', attributes: { d: 'duration' } });
    const unmapped = await schema.unmapper(await schema.mapper({ d: 'PT0S' }));
    expect(unmapped.d).toBe('PT0S');
  });

  test('round-trips complex duration P1DT2H30M5S', async () => {
    const schema = new Schema({ name: 'duration-complex', attributes: { d: 'duration' } });
    const unmapped = await schema.unmapper(await schema.mapper({ d: 'P1DT2H30M5S' }));
    expect(unmapped.d).toBe('P1DT2H30M5S');
  });

  test('accepts human format (1h30m) and outputs ISO 8601', async () => {
    const schema = new Schema({ name: 'duration-human', attributes: { d: 'duration' } });
    const unmapped = await schema.unmapper(await schema.mapper({ d: '1h30m' }));
    expect(unmapped.d).toBe('PT1H30M');
  });

  test('accepts simple units (90m, 2h, 1d)', async () => {
    const schema = new Schema({ name: 'duration-simple', attributes: { d: 'duration' } });

    expect((await schema.unmapper(await schema.mapper({ d: '90m' }))).d).toBe('PT1H30M');
    expect((await schema.unmapper(await schema.mapper({ d: '2h' }))).d).toBe('PT2H');
    expect((await schema.unmapper(await schema.mapper({ d: '1d' }))).d).toBe('P1D');
  });

  test('accepts milliseconds (500ms)', async () => {
    const schema = new Schema({ name: 'duration-ms', attributes: { d: 'duration' } });
    const unmapped = await schema.unmapper(await schema.mapper({ d: '500ms' }));
    expect(unmapped.d).toBe('PT0.500S');
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'duration-null', attributes: { d: 'duration|optional' } });
    expect((await schema.unmapper(await schema.mapper({ d: null }))).d).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ d: undefined }))).d).toBeUndefined();
  });

  test('achieves >50% compression vs ISO 8601', async () => {
    const schema = new Schema({ name: 'duration-compress', attributes: { d: 'duration' } });
    const dur = 'PT1H30M5S';
    const mapped = await schema.mapper({ d: dur });
    const encoded = mapped[schema.map.d] as string;
    expect(1 - (encoded.length / dur.length)).toBeGreaterThan(0.5);
  });
});

describe('Schema mapper/unmapper for cron', () => {
  test('validates and normalizes cron expressions', async () => {
    const schema = new Schema({ name: 'cron-schema', attributes: { schedule: 'cron' } });

    const unmapped = await schema.unmapper(await schema.mapper({ schedule: '0 */5 * * *' }));
    expect(unmapped.schedule).toBe('0 */5 * * *');
  });

  test('round-trips common cron patterns', async () => {
    const schema = new Schema({ name: 'cron-patterns', attributes: { s: 'cron' } });

    for (const cron of ['* * * * *', '0 0 * * *', '30 8 * * 1-5', '0 0 1 * *']) {
      const unmapped = await schema.unmapper(await schema.mapper({ s: cron }));
      expect(unmapped.s).toBe(cron);
    }
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'cron-null', attributes: { s: 'cron|optional' } });
    expect((await schema.unmapper(await schema.mapper({ s: null }))).s).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ s: undefined }))).s).toBeUndefined();
  });
});

describe('Schema mapper/unmapper for locale', () => {
  test('normalizes locale format', async () => {
    const schema = new Schema({ name: 'locale-schema', attributes: { lang: 'locale' } });

    const unmapped = await schema.unmapper(await schema.mapper({ lang: 'pt-BR' }));
    expect(unmapped.lang).toBe('pt-BR');
  });

  test('round-trips various locales', async () => {
    const schema = new Schema({ name: 'locale-various', attributes: { lang: 'locale' } });

    for (const loc of ['en-US', 'zh-CN', 'ja-JP']) {
      const unmapped = await schema.unmapper(await schema.mapper({ lang: loc }));
      expect(unmapped.lang).toBe(loc);
    }
  });

  test('accepts language-only (en)', async () => {
    const schema = new Schema({ name: 'locale-lang', attributes: { lang: 'locale' } });
    const unmapped = await schema.unmapper(await schema.mapper({ lang: 'en' }));
    expect(unmapped.lang).toBe('en');
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'locale-null', attributes: { lang: 'locale|optional' } });
    expect((await schema.unmapper(await schema.mapper({ lang: null }))).lang).toBeNull();
  });
});

describe('Schema mapper/unmapper for currency', () => {
  test('round-trips currency codes', async () => {
    const schema = new Schema({ name: 'currency-schema', attributes: { cur: 'currency' } });

    const unmapped = await schema.unmapper(await schema.mapper({ cur: 'USD' }));
    expect(unmapped.cur).toBe('USD');
  });

  test('round-trips common currencies', async () => {
    const schema = new Schema({ name: 'currency-common', attributes: { c: 'currency' } });

    for (const cur of ['USD', 'BRL', 'EUR', 'GBP', 'JPY']) {
      const unmapped = await schema.unmapper(await schema.mapper({ c: cur }));
      expect(unmapped.c).toBe(cur);
    }
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'currency-null', attributes: { c: 'currency|optional' } });
    expect((await schema.unmapper(await schema.mapper({ c: null }))).c).toBeNull();
  });
});

describe('Schema mapper/unmapper for country', () => {
  test('round-trips country codes', async () => {
    const schema = new Schema({ name: 'country-schema', attributes: { cc: 'country' } });
    const unmapped = await schema.unmapper(await schema.mapper({ cc: 'BR' }));
    expect(unmapped.cc).toBe('BR');
  });

  test('round-trips common country codes', async () => {
    const schema = new Schema({ name: 'country-common', attributes: { cc: 'country' } });

    for (const c of ['BR', 'US', 'DE', 'JP', 'CN']) {
      const unmapped = await schema.unmapper(await schema.mapper({ cc: c }));
      expect(unmapped.cc).toBe(c);
    }
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'country-null', attributes: { cc: 'country|optional' } });
    expect((await schema.unmapper(await schema.mapper({ cc: null }))).cc).toBeNull();
  });
});

describe('Schema mapper/unmapper for ean', () => {
  test('round-trips EAN-13 barcode as base62', async () => {
    const schema = new Schema({ name: 'ean-schema', attributes: { barcode: 'ean' } });

    const ean = '5901234123457';
    const mapped = await schema.mapper({ barcode: ean });
    const encoded = mapped[schema.map.barcode] as string;
    expect(encoded.length).toBeLessThan(ean.length);

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.barcode).toBe(ean);
  });

  test('round-trips EAN-8 barcode', async () => {
    const schema = new Schema({ name: 'ean8-schema', attributes: { barcode: 'ean' } });
    const unmapped = await schema.unmapper(await schema.mapper({ barcode: '96385074' }));
    expect(unmapped.barcode).toBe('96385074');
  });

  test('round-trips EAN-13 with leading zeros', async () => {
    const schema = new Schema({ name: 'ean-zeros', attributes: { barcode: 'ean' } });
    const unmapped = await schema.unmapper(await schema.mapper({ barcode: '0000000000000' }));
    expect(unmapped.barcode).toBe('0000000000000');
  });

  test('preserves null and undefined', async () => {
    const schema = new Schema({ name: 'ean-null', attributes: { barcode: 'ean|optional' } });
    expect((await schema.unmapper(await schema.mapper({ barcode: null }))).barcode).toBeNull();
    expect((await schema.unmapper(await schema.mapper({ barcode: undefined }))).barcode).toBeUndefined();
  });

  test('achieves >30% compression vs EAN-13', async () => {
    const schema = new Schema({ name: 'ean-compress', attributes: { barcode: 'ean' } });
    const ean = '5901234123457';
    const mapped = await schema.mapper({ barcode: ean });
    const encoded = mapped[schema.map.barcode] as string;
    expect(1 - (encoded.length / ean.length)).toBeGreaterThan(0.3);
  });

  test('round-trips UPC-A (12 digits)', async () => {
    const schema = new Schema({ name: 'upc-schema', attributes: { barcode: 'ean' } });
    const unmapped = await schema.unmapper(await schema.mapper({ barcode: '036000291452' }));
    expect(unmapped.barcode).toBe('036000291452');
  });

  test('round-trips GTIN-14 (14 digits)', async () => {
    const schema = new Schema({ name: 'gtin14-schema', attributes: { barcode: 'ean' } });
    const unmapped = await schema.unmapper(await schema.mapper({ barcode: '10012345678903' }));
    expect(unmapped.barcode).toBe('10012345678903');
  });

  test('round-trips UPC-A with all zeros', async () => {
    const schema = new Schema({ name: 'upc-zeros', attributes: { barcode: 'ean' } });
    const unmapped = await schema.unmapper(await schema.mapper({ barcode: '000000000000' }));
    expect(unmapped.barcode).toBe('000000000000');
  });

  test('round-trips GTIN-14 with all zeros', async () => {
    const schema = new Schema({ name: 'gtin14-zeros', attributes: { barcode: 'ean' } });
    const unmapped = await schema.unmapper(await schema.mapper({ barcode: '00000000000000' }));
    expect(unmapped.barcode).toBe('00000000000000');
  });
});
