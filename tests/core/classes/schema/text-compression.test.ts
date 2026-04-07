import Schema from '#src/schema.class.js';
import {
  compressText,
  decompressText,
  encodeBase85,
  decodeBase85,
} from '#src/concerns/text-compression.js';
import { metadataEncode, metadataDecode } from '#src/concerns/metadata-encoding.js';

const SHORT_TEXT = 'Hello world';
const LONG_TEXT = 'The payment processing system started showing intermittent failures when handling wire transfers starting at 14:30 today. The errors occur specifically when the transaction amount exceeds five thousand dollars. The integration with the central banking API returns a timeout after thirty seconds of waiting.';
const EMOJI_TEXT = 'User 🚀 sent a message with emojis 🎉 and special chars: caf\u00e9, a\u00e7\u00e3o. This text needs to be long enough to exceed the default compression threshold of one hundred bytes in the system.';

describe('text-compression: encodeBase85 / decodeBase85', () => {
  test('round-trips empty buffer', () => {
    const buf = Buffer.alloc(0);
    expect(decodeBase85(encodeBase85(buf))).toEqual(buf);
  });

  test('round-trips small buffers (1-8 bytes)', () => {
    for (let len = 1; len <= 8; len++) {
      const buf = Buffer.from(Array.from({ length: len }, (_, i) => i * 37));
      const encoded = encodeBase85(buf);
      const decoded = decodeBase85(encoded);
      expect(decoded).toEqual(buf);
    }
  });

  test('round-trips larger buffer', () => {
    const buf = Buffer.from('The quick brown fox jumps over the lazy dog', 'utf-8');
    const encoded = encodeBase85(buf);
    const decoded = decodeBase85(encoded);
    expect(decoded).toEqual(buf);
  });

  test('produces only printable ASCII chars', () => {
    const buf = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) buf[i] = i;
    const encoded = encodeBase85(buf);
    for (const char of encoded) {
      const code = char.charCodeAt(0);
      expect(code).toBeGreaterThanOrEqual(0x21);
      expect(code).toBeLessThanOrEqual(0x7e);
    }
  });

  test('overhead is ~25% (5 chars per 4 bytes)', () => {
    const buf = Buffer.alloc(100);
    const encoded = encodeBase85(buf);
    expect(encoded.length).toBe(125);
  });
});

describe('text-compression: compressText / decompressText', () => {
  test('short text below threshold is NOT compressed', () => {
    const result = compressText(SHORT_TEXT);
    expect(result).toBe(SHORT_TEXT);
    expect(result.startsWith('z:')).toBe(false);
  });

  test('long text above threshold IS compressed with z: prefix', () => {
    const result = compressText(LONG_TEXT);
    expect(result.startsWith('z:')).toBe(true);
    expect(result.length).toBeLessThan(LONG_TEXT.length);
  });

  test('round-trips long text correctly', () => {
    const compressed = compressText(LONG_TEXT);
    const decompressed = decompressText(compressed);
    expect(decompressed).toBe(LONG_TEXT);
  });

  test('round-trips unicode/emoji text', () => {
    const compressed = compressText(EMOJI_TEXT);
    const decompressed = decompressText(compressed);
    expect(decompressed).toBe(EMOJI_TEXT);
  });

  test('uncompressed text passes through decompressText unchanged', () => {
    expect(decompressText(SHORT_TEXT)).toBe(SHORT_TEXT);
    expect(decompressText('regular string')).toBe('regular string');
  });

  test('handles null/undefined/empty gracefully', () => {
    expect(compressText(null as any)).toBe(null);
    expect(compressText(undefined as any)).toBe(undefined);
    expect(compressText('')).toBe('');
    expect(decompressText(null as any)).toBe(null);
    expect(decompressText(undefined as any)).toBe(undefined);
  });

  test('custom threshold controls compression trigger', () => {
    const result50 = compressText(LONG_TEXT, { threshold: 50 });
    expect(result50.startsWith('z:')).toBe(true);

    const result9999 = compressText(LONG_TEXT, { threshold: 9999 });
    expect(result9999).toBe(LONG_TEXT);
  });

  test('compression levels 1 and 9 both produce valid output', () => {
    const c1 = compressText(LONG_TEXT, { level: 1 });
    const c9 = compressText(LONG_TEXT, { level: 9 });
    expect(decompressText(c1)).toBe(LONG_TEXT);
    expect(decompressText(c9)).toBe(LONG_TEXT);
  });

  test('base85 encoding uses z85: prefix', () => {
    const result = compressText(LONG_TEXT, { encoding: 'base85' });
    expect(result.startsWith('z85:')).toBe(true);
    expect(decompressText(result)).toBe(LONG_TEXT);
  });

  test('base85 produces smaller output than base64', () => {
    const b64 = compressText(LONG_TEXT, { encoding: 'base64' });
    const b85 = compressText(LONG_TEXT, { encoding: 'base85' });
    expect(b85.length).toBeLessThan(b64.length);
  });
});

describe('text-compression: Schema integration', () => {
  const mapAndUnmap = async (schema: InstanceType<typeof Schema>, input: Record<string, unknown>) => {
    const mapped = await schema.mapper(input);
    return schema.unmapper(mapped);
  };

  test('text type round-trips through mapper/unmapper', async () => {
    const schema = new Schema({
      name: 'text-rt',
      attributes: { bio: 'text', name: 'string' },
    });

    const result = await mapAndUnmap(schema, { bio: LONG_TEXT, name: 'João' });
    expect(result.bio).toBe(LONG_TEXT);
    expect(result.name).toBe('João');
  });

  test('text type with short value does NOT compress (round-trips correctly)', async () => {
    const schema = new Schema({
      name: 'text-short',
      attributes: { bio: 'text' },
    });

    const result = await mapAndUnmap(schema, { bio: SHORT_TEXT });
    expect(result.bio).toBe(SHORT_TEXT);
  });

  test('text type with inline level modifier', async () => {
    const schema = new Schema({
      name: 'text-level',
      attributes: { notes: 'text|compress:9' },
    });

    const result = await mapAndUnmap(schema, { notes: LONG_TEXT });
    expect(result.notes).toBe(LONG_TEXT);
  });

  test('text|compress:false disables compression', async () => {
    const schema = new Schema({
      name: 'text-nocompress',
      attributes: { raw: 'text|compress:false' },
    });

    const mapped = await schema.mapper({ raw: LONG_TEXT });
    const values = Object.values(mapped).filter(v => typeof v === 'string');
    expect(values.some(v => (v as string).startsWith('z:'))).toBe(false);

    const result = await schema.unmapper(mapped);
    expect(result.raw).toBe(LONG_TEXT);
  });

  test('text|encoding:base85 uses beta base85', async () => {
    const schema = new Schema({
      name: 'text-b85',
      attributes: { data: 'text|encoding:base85' },
    });

    const mapped = await schema.mapper({ data: LONG_TEXT });
    const values = Object.values(mapped).filter(v => typeof v === 'string');
    expect(values.some(v => (v as string).startsWith('z85:'))).toBe(true);

    const result = await schema.unmapper(mapped);
    expect(result.data).toBe(LONG_TEXT);
  });

  test('text|threshold:50 overrides default threshold', async () => {
    const mediumText = 'This text has more than fifty bytes but less than one hundred bytes right now. This text has more than fifty bytes but less than a hundred bytes right now yes yes yes.';
    const schema = new Schema({
      name: 'text-threshold',
      attributes: { desc: 'text|threshold:50' },
    });

    const mapped = await schema.mapper({ desc: mediumText });
    const values = Object.values(mapped).filter(v => typeof v === 'string');
    expect(values.some(v => (v as string).startsWith('z:'))).toBe(true);

    const result = await schema.unmapper(mapped);
    expect(result.desc).toBe(mediumText);
  });

  test('compression config from schema constructor is used', async () => {
    const schema = new Schema({
      name: 'text-config',
      attributes: { bio: 'text' },
      compression: { level: 1, threshold: 50 },
    });

    const mediumText = 'This text has more than fifty bytes but would be ignored at the default threshold value.';
    const result = await mapAndUnmap(schema, { bio: mediumText });
    expect(result.bio).toBe(mediumText);
  });

  test('attribute-level modifiers override schema compression config', async () => {
    const schema = new Schema({
      name: 'text-override',
      attributes: { bio: 'text|threshold:9999' },
      compression: { threshold: 50 },
    });

    const mapped = await schema.mapper({ bio: LONG_TEXT });
    const values = Object.values(mapped).filter(v => typeof v === 'string');
    expect(values.some(v => (v as string).startsWith('z:'))).toBe(false);

    const result = await schema.unmapper(mapped);
    expect(result.bio).toBe(LONG_TEXT);
  });

  test('text with other modifiers like required', async () => {
    const schema = new Schema({
      name: 'text-required',
      attributes: { desc: 'text|required' },
    });

    const result = await mapAndUnmap(schema, { desc: LONG_TEXT });
    expect(result.desc).toBe(LONG_TEXT);
  });

  test('handles null/undefined values in text fields', async () => {
    const schema = new Schema({
      name: 'text-null',
      attributes: { bio: 'text' },
    });

    const result = await mapAndUnmap(schema, { bio: null });
    expect(result.bio).toBe(null);
  });
});

describe('text-compression: metadata-encoding prefix safety', () => {
  test('raw value starting with z: is force-encoded to prevent collision', () => {
    const rawValue = 'z:this-looks-like-compressed-data';
    const { encoded } = metadataEncode(rawValue);
    const decoded = metadataDecode(encoded);
    expect(decoded).toBe(rawValue);
  });

  test('raw value starting with z85: is force-encoded to prevent collision', () => {
    const rawValue = 'z85:some-fake-compressed-data';
    const { encoded } = metadataEncode(rawValue);
    const decoded = metadataDecode(encoded);
    expect(decoded).toBe(rawValue);
  });

  test('actual compressed value round-trips through metadataDecode', () => {
    const compressed = compressText(LONG_TEXT);
    const decoded = metadataDecode(compressed);
    expect(decoded).toBe(LONG_TEXT);
  });
});
