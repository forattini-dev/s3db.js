import Schema from '#src/schema.class.js';

describe('Fastest-validator conflict check', () => {
  const schema = new Schema({
    name: 'conflict-test',
    attributes: {
      str: 'string',
      num: 'number',
      bool: 'boolean',
      dt: 'datetime',
      donly: 'dateonly',
      tonly: 'timeonly',
      uid: 'uuid',
      macAddr: 'mac',
      subnet: 'cidr',
      ver: 'semver',
      tel: 'phone',
      bg: 'color',
      dur: 'duration',
      schedule: 'cron',
      lang: 'locale',
      cur: 'currency',
      cc: 'country',
      barcode: 'ean',
      mail: 'email',
      link: 'url',
    },
  });

  test('all types coexist and round-trip correctly in a single schema', async () => {
    const input = {
      str: 'hello world',
      num: 42,
      bool: true,
      dt: '2024-06-15T12:30:45.123Z',
      donly: '2024-06-15',
      tonly: '14:30:00.000',
      uid: '550e8400-e29b-41d4-a716-446655440000',
      macAddr: 'aa:bb:cc:dd:ee:ff',
      subnet: '192.168.1.0/24',
      ver: '1.2.3',
      tel: '+5511999887766',
      bg: '#ff5733',
      dur: 'PT1H30M',
      schedule: '*/5 * * * *',
      lang: 'pt-BR',
      cur: 'BRL',
      cc: 'BR',
      barcode: '7891234567890',
      mail: 'test@example.com',
      link: 'https://example.com',
    };

    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);

    expect(unmapped.str).toBe('hello world');
    expect(unmapped.num).toBe(42);
    expect(unmapped.dt).toBe('2024-06-15T12:30:45.123Z');
    expect(unmapped.donly).toBe('2024-06-15');
    expect(unmapped.tonly).toBe('14:30:00.000');
    expect(unmapped.uid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(unmapped.macAddr).toBe('aa:bb:cc:dd:ee:ff');
    expect(unmapped.subnet).toBe('192.168.1.0/24');
    expect(unmapped.ver).toBe('1.2.3');
    expect(unmapped.tel).toBe('+5511999887766');
    expect(unmapped.bg).toBe('#ff5733');
    expect(unmapped.dur).toBe('PT1H30M');
    expect(unmapped.schedule).toBe('*/5 * * * *');
    expect(unmapped.lang).toBe('pt-BR');
    expect(unmapped.cur).toBe('BRL');
    expect(unmapped.cc).toBe('BR');
    expect(unmapped.barcode).toBe('7891234567890');
    expect(unmapped.mail).toBe('test@example.com');
    expect(unmapped.link).toBe('https://example.com');
  });

  test('compressed types actually compress (mapped values differ from input)', async () => {
    const input = {
      str: 'test',
      num: 100,
      bool: false,
      dt: '2024-01-01T00:00:00.000Z',
      donly: '2024-01-01',
      tonly: '12:00:00.000',
      uid: '12345678-abcd-ef01-2345-678901234567',
      macAddr: 'aa:bb:cc:dd:ee:ff',
      subnet: '10.0.0.0/8',
      ver: '2.0.0',
      tel: '+5511999887766',
      bg: '#ff0000',
      dur: 'PT10S',
      schedule: '0 0 * * *',
      lang: 'en-US',
      cur: 'USD',
      cc: 'US',
      barcode: '12345678',
      mail: 'a@b.c',
      link: 'https://t.co',
    };

    const mapped = await schema.mapper(input);
    const mappedValues = Object.values(mapped);

    expect(mappedValues).not.toContain(input.dt);
    expect(mappedValues).not.toContain(input.donly);
    expect(mappedValues).not.toContain(input.tonly);
    expect(mappedValues).not.toContain(input.uid);
    expect(mappedValues).not.toContain(input.macAddr);
    expect(mappedValues).not.toContain(input.subnet);
    expect(mappedValues).not.toContain(input.ver);
    expect(mappedValues).not.toContain(input.tel);
    expect(mappedValues).not.toContain(input.bg);
    expect(mappedValues).not.toContain(input.dur);
    expect(mappedValues).not.toContain(input.barcode);

    expect(mappedValues).toContain(input.schedule);
    expect(mappedValues).toContain(input.lang);
    expect(mappedValues).toContain(input.cur);
    expect(mappedValues).toContain(input.cc);
  });
});

describe('Data integrity - no data loss', () => {
  describe('datetime', () => {
    const schema = new Schema({ name: 'dt-test', attributes: { v: 'datetime' } });
    const roundTrip = async (val: string | Date) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('epoch', async () => {
      expect(await roundTrip('1970-01-01T00:00:00.000Z')).toBe('1970-01-01T00:00:00.000Z');
    });

    test('millisecond precision', async () => {
      expect(await roundTrip('2024-06-15T12:30:45.123Z')).toBe('2024-06-15T12:30:45.123Z');
      expect(await roundTrip('2024-06-15T12:30:45.001Z')).toBe('2024-06-15T12:30:45.001Z');
      expect(await roundTrip('2024-06-15T12:30:45.999Z')).toBe('2024-06-15T12:30:45.999Z');
    });

    test('year boundaries', async () => {
      expect(await roundTrip('2000-01-01T00:00:00.000Z')).toBe('2000-01-01T00:00:00.000Z');
      expect(await roundTrip('1999-12-31T23:59:59.999Z')).toBe('1999-12-31T23:59:59.999Z');
      expect(await roundTrip('2038-01-19T03:14:07.000Z')).toBe('2038-01-19T03:14:07.000Z');
    });

    test('far future dates', async () => {
      expect(await roundTrip('3000-01-01T00:00:00.000Z')).toBe('3000-01-01T00:00:00.000Z');
      expect(await roundTrip('9999-12-31T23:59:59.999Z')).toBe('9999-12-31T23:59:59.999Z');
    });

    test('Date object input', async () => {
      const d = new Date('2024-07-04T10:20:30.456Z');
      expect(await roundTrip(d)).toBe('2024-07-04T10:20:30.456Z');
    });

    test('midnight and end of day', async () => {
      expect(await roundTrip('2024-01-01T00:00:00.000Z')).toBe('2024-01-01T00:00:00.000Z');
      expect(await roundTrip('2024-01-01T23:59:59.999Z')).toBe('2024-01-01T23:59:59.999Z');
    });

    test('ISO strings with timezone offset are normalized to UTC', async () => {
      const result = await roundTrip('2024-06-15T15:30:00.000+03:00');
      expect(result).toBe('2024-06-15T12:30:00.000Z');
    });
  });

  describe('dateonly', () => {
    const schema = new Schema({ name: 'do-test', attributes: { v: 'dateonly' } });
    const roundTrip = async (val: string | Date) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('epoch date', async () => {
      expect(await roundTrip('1970-01-01')).toBe('1970-01-01');
    });

    test('common dates', async () => {
      expect(await roundTrip('2024-06-15')).toBe('2024-06-15');
      expect(await roundTrip('2000-01-01')).toBe('2000-01-01');
      expect(await roundTrip('1999-12-31')).toBe('1999-12-31');
    });

    test('leap day', async () => {
      expect(await roundTrip('2024-02-29')).toBe('2024-02-29');
      expect(await roundTrip('2000-02-29')).toBe('2000-02-29');
    });

    test('far future', async () => {
      expect(await roundTrip('9999-12-31')).toBe('9999-12-31');
    });

    test('first and last days of months', async () => {
      expect(await roundTrip('2024-01-01')).toBe('2024-01-01');
      expect(await roundTrip('2024-01-31')).toBe('2024-01-31');
      expect(await roundTrip('2024-12-01')).toBe('2024-12-01');
      expect(await roundTrip('2024-12-31')).toBe('2024-12-31');
    });

    test('Date object input', async () => {
      const d = new Date('2024-07-04T00:00:00.000Z');
      expect(await roundTrip(d)).toBe('2024-07-04');
    });
  });

  describe('timeonly', () => {
    const schema = new Schema({ name: 'to-test', attributes: { v: 'timeonly' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('midnight', async () => {
      expect(await roundTrip('00:00:00.000')).toBe('00:00:00.000');
    });

    test('end of day', async () => {
      expect(await roundTrip('23:59:59.999')).toBe('23:59:59.999');
    });

    test('noon', async () => {
      expect(await roundTrip('12:00:00.000')).toBe('12:00:00.000');
    });

    test('1 millisecond', async () => {
      expect(await roundTrip('00:00:00.001')).toBe('00:00:00.001');
    });

    test('hour boundaries', async () => {
      expect(await roundTrip('01:00:00.000')).toBe('01:00:00.000');
      expect(await roundTrip('06:00:00.000')).toBe('06:00:00.000');
      expect(await roundTrip('12:00:00.000')).toBe('12:00:00.000');
      expect(await roundTrip('18:00:00.000')).toBe('18:00:00.000');
      expect(await roundTrip('23:00:00.000')).toBe('23:00:00.000');
    });

    test('minute and second boundaries', async () => {
      expect(await roundTrip('00:01:00.000')).toBe('00:01:00.000');
      expect(await roundTrip('00:59:00.000')).toBe('00:59:00.000');
      expect(await roundTrip('00:00:01.000')).toBe('00:00:01.000');
      expect(await roundTrip('00:00:59.000')).toBe('00:00:59.000');
    });

    test('arbitrary times', async () => {
      expect(await roundTrip('08:15:30.500')).toBe('08:15:30.500');
      expect(await roundTrip('17:45:12.750')).toBe('17:45:12.750');
      expect(await roundTrip('03:07:55.042')).toBe('03:07:55.042');
    });

    test('without milliseconds (HH:mm:ss)', async () => {
      expect(await roundTrip('08:30:00')).toBe('08:30:00.000');
    });

    test('without seconds (HH:mm)', async () => {
      expect(await roundTrip('14:30')).toBe('14:30:00.000');
    });
  });

  describe('uuid', () => {
    const schema = new Schema({ name: 'uuid-test', attributes: { v: 'uuid' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('all zeros', async () => {
      expect(await roundTrip('00000000-0000-0000-0000-000000000000')).toBe('00000000-0000-0000-0000-000000000000');
    });

    test('all f', async () => {
      expect(await roundTrip('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
    });

    test('v4 uuid', async () => {
      expect(await roundTrip('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    test('v1 uuid', async () => {
      expect(await roundTrip('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    });

    test('sequential uuids', async () => {
      const uuids = [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ];
      for (const uuid of uuids) {
        expect(await roundTrip(uuid)).toBe(uuid);
      }
    });

    test('mixed case is lowercased via hex parsing', async () => {
      const result = await roundTrip('AABBCCDD-1122-3344-5566-778899AABBCC');
      expect(result).toBe('aabbccdd-1122-3344-5566-778899aabbcc');
    });
  });

  describe('mac', () => {
    const schema = new Schema({ name: 'mac-test', attributes: { v: 'mac' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('all zeros', async () => {
      expect(await roundTrip('00:00:00:00:00:00')).toBe('00:00:00:00:00:00');
    });

    test('all ff', async () => {
      expect(await roundTrip('ff:ff:ff:ff:ff:ff')).toBe('ff:ff:ff:ff:ff:ff');
    });

    test('common vendor prefixes', async () => {
      expect(await roundTrip('00:1a:2b:3c:4d:5e')).toBe('00:1a:2b:3c:4d:5e');
      expect(await roundTrip('aa:bb:cc:dd:ee:ff')).toBe('aa:bb:cc:dd:ee:ff');
      expect(await roundTrip('de:ad:be:ef:ca:fe')).toBe('de:ad:be:ef:ca:fe');
    });

    test('broadcast address', async () => {
      expect(await roundTrip('ff:ff:ff:ff:ff:ff')).toBe('ff:ff:ff:ff:ff:ff');
    });

    test('sequential addresses', async () => {
      expect(await roundTrip('00:00:00:00:00:01')).toBe('00:00:00:00:00:01');
      expect(await roundTrip('00:00:00:00:00:0a')).toBe('00:00:00:00:00:0a');
      expect(await roundTrip('00:00:00:00:01:00')).toBe('00:00:00:00:01:00');
    });
  });

  describe('cidr', () => {
    const schema = new Schema({ name: 'cidr-test', attributes: { v: 'cidr' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('catch-all', async () => {
      expect(await roundTrip('0.0.0.0/0')).toBe('0.0.0.0/0');
    });

    test('host route', async () => {
      expect(await roundTrip('255.255.255.255/32')).toBe('255.255.255.255/32');
    });

    test('common private networks', async () => {
      expect(await roundTrip('10.0.0.0/8')).toBe('10.0.0.0/8');
      expect(await roundTrip('172.16.0.0/12')).toBe('172.16.0.0/12');
      expect(await roundTrip('192.168.1.0/24')).toBe('192.168.1.0/24');
    });

    test('loopback', async () => {
      expect(await roundTrip('127.0.0.1/32')).toBe('127.0.0.1/32');
      expect(await roundTrip('127.0.0.0/8')).toBe('127.0.0.0/8');
    });

    test('all prefix lengths /0 through /32', async () => {
      for (let prefix = 0; prefix <= 32; prefix++) {
        const cidr = `10.20.30.40/${prefix}`;
        expect(await roundTrip(cidr)).toBe(cidr);
      }
    });

    test('edge IP values', async () => {
      expect(await roundTrip('1.1.1.1/32')).toBe('1.1.1.1/32');
      expect(await roundTrip('255.0.0.0/8')).toBe('255.0.0.0/8');
      expect(await roundTrip('0.255.0.255/16')).toBe('0.255.0.255/16');
      expect(await roundTrip('128.128.128.128/1')).toBe('128.128.128.128/1');
    });
  });

  describe('semver', () => {
    const schema = new Schema({ name: 'sv-test', attributes: { v: 'semver' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('zero version', async () => {
      expect(await roundTrip('0.0.0')).toBe('0.0.0');
    });

    test('patch only', async () => {
      expect(await roundTrip('0.0.1')).toBe('0.0.1');
    });

    test('max components', async () => {
      expect(await roundTrip('999.999.999')).toBe('999.999.999');
    });

    test('common real versions', async () => {
      expect(await roundTrip('1.0.0')).toBe('1.0.0');
      expect(await roundTrip('2.1.3')).toBe('2.1.3');
      expect(await roundTrip('18.2.0')).toBe('18.2.0');
      expect(await roundTrip('5.15.42')).toBe('5.15.42');
      expect(await roundTrip('21.1.6')).toBe('21.1.6');
    });

    test('boundary values per component', async () => {
      expect(await roundTrip('0.0.999')).toBe('0.0.999');
      expect(await roundTrip('0.999.0')).toBe('0.999.0');
      expect(await roundTrip('999.0.0')).toBe('999.0.0');
      expect(await roundTrip('1.999.999')).toBe('1.999.999');
    });
  });

  describe('phone', () => {
    const schema = new Schema({ name: 'ph-test', attributes: { v: 'phone' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('Brazilian mobile', async () => {
      expect(await roundTrip('+5511999887766')).toBe('+5511999887766');
    });

    test('US number', async () => {
      expect(await roundTrip('+12125551234')).toBe('+12125551234');
    });

    test('UK number', async () => {
      expect(await roundTrip('+442071234567')).toBe('+442071234567');
    });

    test('Japanese number', async () => {
      expect(await roundTrip('+81312345678')).toBe('+81312345678');
    });

    test('shortest valid (country code + number)', async () => {
      expect(await roundTrip('+1234567')).toBe('+1234567');
    });

    test('longest valid E.164 (15 digits)', async () => {
      expect(await roundTrip('+123456789012345')).toBe('+123456789012345');
    });

    test('single digit country code', async () => {
      expect(await roundTrip('+11234567890')).toBe('+11234567890');
    });

    test('numbers with leading zeros in subscriber part', async () => {
      expect(await roundTrip('+10012345678')).toBe('+10012345678');
    });
  });

  describe('color', () => {
    const schema = new Schema({ name: 'cl-test', attributes: { v: 'color' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('black', async () => {
      expect(await roundTrip('#000000')).toBe('#000000');
    });

    test('white', async () => {
      expect(await roundTrip('#ffffff')).toBe('#ffffff');
    });

    test('primary colors', async () => {
      expect(await roundTrip('#ff0000')).toBe('#ff0000');
      expect(await roundTrip('#00ff00')).toBe('#00ff00');
      expect(await roundTrip('#0000ff')).toBe('#0000ff');
    });

    test('typical brand colors', async () => {
      expect(await roundTrip('#1da1f2')).toBe('#1da1f2');
      expect(await roundTrip('#ff5733')).toBe('#ff5733');
      expect(await roundTrip('#c0ffee')).toBe('#c0ffee');
      expect(await roundTrip('#bada55')).toBe('#bada55');
    });

    test('grayscale values', async () => {
      expect(await roundTrip('#808080')).toBe('#808080');
      expect(await roundTrip('#cccccc')).toBe('#cccccc');
      expect(await roundTrip('#333333')).toBe('#333333');
    });

    test('single channel max', async () => {
      expect(await roundTrip('#ff0000')).toBe('#ff0000');
      expect(await roundTrip('#00ff00')).toBe('#00ff00');
      expect(await roundTrip('#0000ff')).toBe('#0000ff');
    });
  });

  describe('duration', () => {
    const schema = new Schema({ name: 'dur-test', attributes: { v: 'duration' } });
    const roundTrip = async (val: string | number) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('zero duration', async () => {
      expect(await roundTrip('PT0S')).toBe('PT0S');
    });

    test('1 second', async () => {
      expect(await roundTrip('PT1S')).toBe('PT1S');
    });

    test('1 minute', async () => {
      expect(await roundTrip('PT1M')).toBe('PT1M');
    });

    test('1 hour', async () => {
      expect(await roundTrip('PT1H')).toBe('PT1H');
    });

    test('1 day', async () => {
      expect(await roundTrip('P1D')).toBe('P1D');
    });

    test('365 days', async () => {
      expect(await roundTrip('P365D')).toBe('P365D');
    });

    test('complex duration', async () => {
      expect(await roundTrip('PT23H59M59S')).toBe('PT23H59M59S');
    });

    test('fractional seconds (milliseconds)', async () => {
      expect(await roundTrip('PT0.001S')).toBe('PT0.001S');
      expect(await roundTrip('PT0.500S')).toBe('PT0.500S');
      expect(await roundTrip('PT0.999S')).toBe('PT0.999S');
      expect(await roundTrip('PT1.500S')).toBe('PT1.500S');
    });

    test('days + time', async () => {
      expect(await roundTrip('P1DT12H')).toBe('P1DT12H');
      expect(await roundTrip('P7DT6H30M')).toBe('P7DT6H30M');
    });

    test('numeric input (milliseconds)', async () => {
      expect(await roundTrip(0)).toBe('PT0S');
      expect(await roundTrip(1000)).toBe('PT1S');
      expect(await roundTrip(60000)).toBe('PT1M');
      expect(await roundTrip(3600000)).toBe('PT1H');
      expect(await roundTrip(86400000)).toBe('P1D');
    });

    test('human-readable format', async () => {
      expect(await roundTrip('1h30m')).toBe('PT1H30M');
      expect(await roundTrip('2d12h')).toBe('P2DT12H');
      expect(await roundTrip('500ms')).toBe('PT0.500S');
      expect(await roundTrip('1h30m45s')).toBe('PT1H30M45S');
    });

    test('very large duration', async () => {
      expect(await roundTrip('P3650D')).toBe('P3650D');
    });

    test('numeric input with milliseconds', async () => {
      expect(await roundTrip(1)).toBe('PT0.001S');
      expect(await roundTrip(999)).toBe('PT0.999S');
      expect(await roundTrip(1500)).toBe('PT1.500S');
    });
  });

  describe('ean', () => {
    const schema = new Schema({ name: 'ean-test', attributes: { v: 'ean' } });
    const roundTrip = async (val: string) => {
      const result = await schema.unmapper(await schema.mapper({ v: val }));
      return result.v as string;
    };

    test('EAN-8 all zeros', async () => {
      expect(await roundTrip('00000000')).toBe('00000000');
    });

    test('EAN-13 all zeros', async () => {
      expect(await roundTrip('0000000000000')).toBe('0000000000000');
    });

    test('EAN-8 max value', async () => {
      expect(await roundTrip('99999999')).toBe('99999999');
    });

    test('EAN-13 max value', async () => {
      expect(await roundTrip('9999999999999')).toBe('9999999999999');
    });

    test('real product barcodes (EAN-13)', async () => {
      expect(await roundTrip('5901234123457')).toBe('5901234123457');
      expect(await roundTrip('4006381333931')).toBe('4006381333931');
      expect(await roundTrip('7891234567890')).toBe('7891234567890');
    });

    test('real product barcodes (EAN-8)', async () => {
      expect(await roundTrip('96385074')).toBe('96385074');
      expect(await roundTrip('12345670')).toBe('12345670');
    });

    test('EAN with leading zeros', async () => {
      expect(await roundTrip('00000001')).toBe('00000001');
      expect(await roundTrip('0000000000001')).toBe('0000000000001');
    });

    test('boundary between EAN-8 and EAN-13 lengths', async () => {
      expect(await roundTrip('12345678')).toBe('12345678');
      expect(await roundTrip('1234567890123')).toBe('1234567890123');
    });

    test('UPC-A (12 digits)', async () => {
      expect(await roundTrip('012345678905')).toBe('012345678905');
      expect(await roundTrip('036000291452')).toBe('036000291452');
      expect(await roundTrip('000000000000')).toBe('000000000000');
      expect(await roundTrip('999999999999')).toBe('999999999999');
    });

    test('GTIN-14 (14 digits)', async () => {
      expect(await roundTrip('10012345678903')).toBe('10012345678903');
      expect(await roundTrip('00000000000000')).toBe('00000000000000');
      expect(await roundTrip('99999999999999')).toBe('99999999999999');
      expect(await roundTrip('14567890123456')).toBe('14567890123456');
    });

    test('all EAN format lengths are distinguishable after encoding', async () => {
      const ean8 = await schema.mapper({ v: '12345678' });
      const upc = await schema.mapper({ v: '012345678905' });
      const ean13 = await schema.mapper({ v: '1234567890123' });
      const gtin14 = await schema.mapper({ v: '10012345678903' });

      const key = schema.map.v;
      expect((ean8[key] as string)[0]).toBe('0');
      expect((upc[key] as string)[0]).toBe('2');
      expect((ean13[key] as string)[0]).toBe('1');
      expect((gtin14[key] as string)[0]).toBe('3');
    });
  });
});

describe('Batch round-trip stress test', () => {
  describe('datetime - 100 deterministic values', () => {
    const schema = new Schema({ name: 'dt-batch', attributes: { v: 'datetime' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const ms = i * 315360000000 + i * 12345678;
        const input = new Date(ms).toISOString();
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('dateonly - 100 deterministic values', () => {
    const schema = new Schema({ name: 'do-batch', attributes: { v: 'dateonly' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const days = i * 200;
        const d = new Date(days * 86_400_000);
        const input = d.toISOString().slice(0, 10);
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('timeonly - 100 deterministic values', () => {
    const schema = new Schema({ name: 'to-batch', attributes: { v: 'timeonly' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const totalMs = (i * 863999) % 86400000;
        const ms = totalMs % 1000;
        const totalSecs = Math.floor(totalMs / 1000);
        const s = totalSecs % 60;
        const totalMins = Math.floor(totalSecs / 60);
        const m = totalMins % 60;
        const h = Math.floor(totalMins / 60);
        const input = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('uuid - 100 deterministic values', () => {
    const schema = new Schema({ name: 'uuid-batch', attributes: { v: 'uuid' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const hex = i.toString(16).padStart(32, '0');
        const input = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('mac - 100 deterministic values', () => {
    const schema = new Schema({ name: 'mac-batch', attributes: { v: 'mac' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const hex = (i * 2814749767 + i).toString(16).padStart(12, '0').slice(0, 12);
        const input = hex.match(/.{2}/g)!.join(':');
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('cidr - 100 deterministic values', () => {
    const schema = new Schema({ name: 'cidr-batch', attributes: { v: 'cidr' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const a = (i * 7) % 256;
        const b = (i * 13) % 256;
        const c = (i * 17) % 256;
        const d = (i * 23) % 256;
        const prefix = i % 33;
        const input = `${a}.${b}.${c}.${d}/${prefix}`;
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('semver - 100 deterministic values', () => {
    const schema = new Schema({ name: 'sv-batch', attributes: { v: 'semver' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const major = (i * 3) % 1000;
        const minor = (i * 7) % 1000;
        const patch = (i * 11) % 1000;
        const input = `${major}.${minor}.${patch}`;
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('phone - 100 deterministic values', () => {
    const schema = new Schema({ name: 'ph-batch', attributes: { v: 'phone' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const digits = (1000000 + i * 99999).toString().slice(0, 10 + (i % 5));
        const input = '+' + digits;
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('color - 100 deterministic values', () => {
    const schema = new Schema({ name: 'cl-batch', attributes: { v: 'color' } });

    test('all 100 values round-trip exactly', async () => {
      for (let i = 0; i < 100; i++) {
        const num = (i * 167773) % 16777216;
        const input = '#' + num.toString(16).padStart(6, '0');
        const mapped = await schema.mapper({ v: input });
        const unmapped = await schema.unmapper(mapped);
        expect(unmapped.v).toBe(input);
      }
    });
  });

  describe('duration - 100 deterministic values', () => {
    const schema = new Schema({ name: 'dur-batch', attributes: { v: 'duration' } });

    test('all 100 numeric ms values round-trip correctly', async () => {
      for (let i = 0; i < 100; i++) {
        const ms = i * 8640000;
        const mapped = await schema.mapper({ v: ms });
        const unmapped = await schema.unmapper(mapped);
        const result = unmapped.v as string;

        expect(typeof result).toBe('string');
        expect(result).toMatch(/^P/);

        const remapped = await schema.mapper({ v: result });
        const reunmapped = await schema.unmapper(remapped);
        expect(reunmapped.v).toBe(result);
      }
    });
  });

  describe('ean - 100 deterministic values', () => {
    const schema = new Schema({ name: 'ean-batch', attributes: { v: 'ean' } });

    test('25 each of EAN-8, UPC-A, EAN-13, GTIN-14 round-trip exactly', async () => {
      for (let i = 0; i < 25; i++) {
        const num8 = (10000000 + i * 3600000) % 100000000;
        const input8 = num8.toString().padStart(8, '0');
        expect((await schema.unmapper(await schema.mapper({ v: input8 }))).v).toBe(input8);
      }

      for (let i = 0; i < 25; i++) {
        const num12 = (100000000000 + i * 36000000000) % 1000000000000;
        const input12 = num12.toString().padStart(12, '0');
        expect((await schema.unmapper(await schema.mapper({ v: input12 }))).v).toBe(input12);
      }

      for (let i = 0; i < 25; i++) {
        const num13 = (1000000000000 + i * 360000000000) % 10000000000000;
        const input13 = num13.toString().padStart(13, '0');
        expect((await schema.unmapper(await schema.mapper({ v: input13 }))).v).toBe(input13);
      }

      for (let i = 0; i < 25; i++) {
        const num14 = (10000000000000 + i * 3600000000000) % 100000000000000;
        const input14 = num14.toString().padStart(14, '0');
        expect((await schema.unmapper(await schema.mapper({ v: input14 }))).v).toBe(input14);
      }
    });
  });
});

describe('Null and undefined handling', () => {
  const allTypes = {
    dt: 'datetime',
    donly: 'dateonly',
    tonly: 'timeonly',
    uid: 'uuid',
    macAddr: 'mac',
    subnet: 'cidr',
    ver: 'semver',
    tel: 'phone',
    bg: 'color',
    dur: 'duration',
    schedule: 'cron',
    lang: 'locale',
    cur: 'currency',
    cc: 'country',
    barcode: 'ean',
  };

  const schema = new Schema({ name: 'null-test', attributes: allTypes });

  const fieldNames = Object.keys(allTypes);

  test('null values are preserved through round-trip', async () => {
    for (const field of fieldNames) {
      const input = { [field]: null };
      const mapped = await schema.mapper(input);
      const unmapped = await schema.unmapper(mapped);
      expect(unmapped[field]).toBeNull();
    }
  });

  test('undefined values are preserved through round-trip', async () => {
    for (const field of fieldNames) {
      const input = { [field]: undefined };
      const mapped = await schema.mapper(input);
      const unmapped = await schema.unmapper(mapped);
      expect(unmapped[field]).toBeUndefined();
    }
  });

  test('empty string values are preserved for compressed types', async () => {
    const compressedFields = ['dt', 'donly', 'tonly', 'uid', 'macAddr', 'ver', 'tel', 'dur', 'barcode'];
    for (const field of compressedFields) {
      const input = { [field]: '' };
      const mapped = await schema.mapper(input);
      const unmapped = await schema.unmapper(mapped);
      expect(unmapped[field]).toBe('');
    }
  });
});

describe('Type isolation - no cross-contamination', () => {
  const schema = new Schema({
    name: 'isolation-test',
    attributes: {
      num: 'number',
      str: 'string',
      dt: 'datetime',
      donly: 'dateonly',
      tonly: 'timeonly',
      uid: 'uuid',
      macAddr: 'mac',
      subnet: 'cidr',
      ver: 'semver',
      tel: 'phone',
      bg: 'color',
      dur: 'duration',
      barcode: 'ean',
    },
  });

  test('number field is not treated as datetime even when value is a timestamp', async () => {
    const input = { num: 1718451045123 };
    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.num).toBe(1718451045123);
    expect(typeof unmapped.num).toBe('number');
  });

  test('string field is not compressed even when it looks like a UUID', async () => {
    const uuidStr = '550e8400-e29b-41d4-a716-446655440000';
    const input = { str: uuidStr };
    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.str).toBe(uuidStr);
  });

  test('string field is not compressed even when it looks like a MAC address', async () => {
    const input = { str: 'aa:bb:cc:dd:ee:ff' };
    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.str).toBe('aa:bb:cc:dd:ee:ff');
  });

  test('string field is not compressed even when it looks like a color', async () => {
    const input = { str: '#ff5733' };
    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.str).toBe('#ff5733');
  });

  test('string field is not compressed even when it looks like an ISO duration', async () => {
    const input = { str: 'PT1H30M' };
    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.str).toBe('PT1H30M');
  });

  test('string field is not compressed even when it looks like a semver', async () => {
    const input = { str: '1.2.3' };
    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.str).toBe('1.2.3');
  });

  test('string field is not compressed even when it looks like a phone', async () => {
    const input = { str: '+5511999887766' };
    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.str).toBe('+5511999887766');
  });

  test('each type only compresses its own field in a multi-field object', async () => {
    const input = {
      num: 42,
      str: 'hello',
      dt: '2024-06-15T12:30:45.123Z',
      donly: '2024-06-15',
      tonly: '14:30:00.000',
      uid: '550e8400-e29b-41d4-a716-446655440000',
      macAddr: 'aa:bb:cc:dd:ee:ff',
      subnet: '192.168.1.0/24',
      ver: '1.2.3',
      tel: '+5511999887766',
      bg: '#ff5733',
      dur: 'PT1H30M',
      barcode: '7891234567890',
    };

    const mapped = await schema.mapper(input);
    const unmapped = await schema.unmapper(mapped);

    expect(unmapped.num).toBe(42);
    expect(unmapped.str).toBe('hello');
    expect(unmapped.dt).toBe('2024-06-15T12:30:45.123Z');
    expect(unmapped.donly).toBe('2024-06-15');
    expect(unmapped.tonly).toBe('14:30:00.000');
    expect(unmapped.uid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(unmapped.macAddr).toBe('aa:bb:cc:dd:ee:ff');
    expect(unmapped.subnet).toBe('192.168.1.0/24');
    expect(unmapped.ver).toBe('1.2.3');
    expect(unmapped.tel).toBe('+5511999887766');
    expect(unmapped.bg).toBe('#ff5733');
    expect(unmapped.dur).toBe('PT1H30M');
    expect(unmapped.barcode).toBe('7891234567890');
  });

  test('repeated round-trips produce identical results', async () => {
    const input = {
      dt: '2024-01-15T08:00:00.000Z',
      uid: 'abcdef01-2345-6789-abcd-ef0123456789',
      macAddr: 'de:ad:be:ef:ca:fe',
      subnet: '10.0.0.0/8',
      ver: '3.14.159',
      tel: '+442071234567',
      bg: '#1da1f2',
      dur: 'P1DT6H30M',
      barcode: '5901234123457',
    };

    const firstPass = await schema.unmapper(await schema.mapper(input));
    const secondPass = await schema.unmapper(await schema.mapper(firstPass as Record<string, unknown>));
    const thirdPass = await schema.unmapper(await schema.mapper(secondPass as Record<string, unknown>));

    expect(secondPass).toEqual(firstPass);
    expect(thirdPass).toEqual(firstPass);
  });
});
