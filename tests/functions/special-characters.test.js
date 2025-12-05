import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseForTest } from '../config.js';

describe('Comprehensive Special Characters Encoding Tests', () => {
  let db;
  let resource;

  beforeAll(async () => {
    db = await createDatabaseForTest('suite=functions/special-characters');
    resource = await db.createResource({
      name: 'test_comprehensive_special_chars',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        description: 'string|optional',
        location: 'string|optional',
        notes: 'string|optional'
      },
      behavior: 'user-managed'
    });
  });

  afterAll(async () => {
    if (db?.teardown) await db.teardown();
  });

  test('should preserve Portuguese and Latin characters with diacritics', async () => {
    const testData = {
      id: 'test-latin',
      name: 'Vovôs Bressan',
      description: 'Àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
      location: 'São Paulo, Brasil',
      notes: 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸ'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-latin');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Spanish characters', async () => {
    const testData = {
      id: 'test-spanish',
      name: 'José María Rodríguez',
      description: 'Descripción en español con ñ, á, é, í, ó, ú',
      location: 'Barcelona, España',
      notes: 'Niño, señor, años, corazón'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-spanish');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve French characters', async () => {
    const testData = {
      id: 'test-french',
      name: 'François Müller',
      description: 'Caractères français: é, è, ê, ë, à, ù, ç, œ',
      location: 'Paris, France',
      notes: 'Élève, être, naïve, cœur'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-french');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve German characters', async () => {
    const testData = {
      id: 'test-german',
      name: 'Jürgen Müller',
      description: 'Deutsche Zeichen: ä, ö, ü, ß',
      location: 'München, Deutschland',
      notes: 'Größe, Fußball, Mädchen'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-german');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Cyrillic characters (Russian)', async () => {
    const testData = {
      id: 'test-cyrillic',
      name: 'Владимир Путин',
      description: 'Москва, Россия. АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
      location: 'Санкт-Петербург',
      notes: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-cyrillic');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Greek characters', async () => {
    const testData = {
      id: 'test-greek',
      name: 'Αλέξανδρος Μακεδών',
      description: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
      location: 'Αθήνα, Ελλάδα',
      notes: 'αβγδεζηθικλμνξοπρστυφχψω'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-greek');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Hebrew characters (RTL)', async () => {
    const testData = {
      id: 'test-hebrew',
      name: 'דוד בן-גוריון',
      description: 'אבגדהוזחטיכלמנסעפצקרשת',
      location: 'ירושלים, ישראל',
      notes: 'עברית מימין לשמאל'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-hebrew');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Arabic characters (RTL)', async () => {
    const testData = {
      id: 'test-arabic',
      name: 'محمد علي',
      description: 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي',
      location: 'القاهرة، مصر',
      notes: 'العربية من اليمين إلى اليسار'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-arabic');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Chinese characters (Simplified)', async () => {
    const testData = {
      id: 'test-chinese-simplified',
      name: '习近平',
      description: '中华人民共和国主席',
      location: '北京，中国',
      notes: '简体中文测试'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-chinese-simplified');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Chinese characters (Traditional)', async () => {
    const testData = {
      id: 'test-chinese-traditional',
      name: '蔡英文',
      description: '中華民國總統',
      location: '臺北，臺灣',
      notes: '繁體中文測試'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-chinese-traditional');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Japanese characters (Hiragana, Katakana, Kanji)', async () => {
    const testData = {
      id: 'test-japanese',
      name: '田中太郎',
      description: 'ひらがな：あいうえおかきくけこさしすせそ',
      location: '東京、日本',
      notes: 'カタカナ：アイウエオカキクケコサシスセソ'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-japanese');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Korean characters (Hangul)', async () => {
    const testData = {
      id: 'test-korean',
      name: '김정은',
      description: '조선민주주의인민공화국 최고령도자',
      location: '평양, 북한',
      notes: '한글: ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-korean');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Thai characters', async () => {
    const testData = {
      id: 'test-thai',
      name: 'สมเด็จพระเจ้าอยู่หัว',
      description: 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ',
      location: 'กรุงเทพฯ, ประเทศไทย',
      notes: 'ภาษาไทยมีวรรณยุกต์'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-thai');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Vietnamese characters', async () => {
    const testData = {
      id: 'test-vietnamese',
      name: 'Nguyễn Phú Trọng',
      description: 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
      location: 'Hà Nội, Việt Nam',
      notes: 'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-vietnamese');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Emoji and special symbols', async () => {
    const testData = {
      id: 'test-emoji',
      name: 'User 👤',
      description: '🌍🌎🌏🚀⭐🎉🎊🔥💡⚡🌈☀️🌙⭐',
      location: 'Earth 🌍',
      notes: '🇧🇷🇺🇸🇬🇧🇫🇷🇩🇪🇯🇵🇨🇳🇷🇺🇰🇷🇮🇳'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-emoji');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve mathematical and technical symbols', async () => {
    const testData = {
      id: 'test-symbols',
      name: 'Mathematics ∑',
      description: '∀∃∄∅∆∇∈∉∊∋∌∍∎∏∐∑−∓∔∕∖∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦∧∨∩∪∫∬∭∮∯∰∱∲∳∴∵∶∷∸∹∺∻∼∽∾∿≀≁≂≃≄≅≆≇≈≉≊≋≌≍≎≏≐≑≒≓≔≕≖≗≘≙≚≛≜≝≞≟',
      location: 'Universe ∞',
      notes: '±×÷≠≤≥±∓∞∫∂∇∆√∑∏∐'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-symbols');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve currency and financial symbols', async () => {
    const testData = {
      id: 'test-currency',
      name: 'Financial Report $',
      description: '$€£¥₹₩₪₫₽₨₦₱₡₢₣₤₥₦₧₨₩₪₫€₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿',
      location: 'Global Market 💰',
      notes: 'Currencies: $ € £ ¥ ₹ ₩ ₪ ₫ ₽'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-currency');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve mixed content with all character types', async () => {
    const testData = {
      id: 'test-mixed',
      name: 'Global User 🌍: José María 李明 Владимир',
      description: 'Mixed content: English, Português (ação), 中文 (简体), العربية, Русский, Ελληνικά, עברית, 日本語, 한국어, ไทย, Việt Nam 🚀',
      location: 'São Paulo 🇧🇷 → New York 🇺🇸 → Tokyo 🇯🇵',
      notes: 'Special chars: àáâãäåæç ñ ü ß € $ ¥ ₹ 🎉 ∑ ∞ ≠ ≤ ≥ ± × ÷'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-mixed');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve edge cases: moderately long strings with special characters', async () => {
    const longText = 'A'.repeat(50) + 'ção'.repeat(20) + '🌟'.repeat(10) + 'Владимир'.repeat(10) + '中文'.repeat(20) + 'العربية'.repeat(10);
    
    const testData = {
      id: 'test-long',
      name: 'Long Test',
      description: longText,
      location: 'Global',
      notes: `Length: ${longText.length} chars - Mixed Unicode content`
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-long');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.description.length).toBe(longText.length);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should handle ASCII characters normally', async () => {
    const testData = {
      id: 'test-ascii',
      name: 'Regular ASCII Name',
      description: 'Regular description with no special characters',
      location: 'New York, USA'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-ascii');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should preserve special characters in updates', async () => {
    const initialData = {
      id: 'test-update',
      name: 'Initial Name',
      description: 'Initial description'
    };

    await resource.insert(initialData);

    const updateData = {
      name: 'José María Fernández 李明 🌟',
      description: 'Atualização com açentôs, 中文, العربية, Русский e 🎉'
    };

    const updated = await resource.update('test-update', updateData);
    expect(updated.name).toBe(updateData.name);
    expect(updated.description).toBe(updateData.description);

    const retrieved = await resource.get('test-update');
    expect(retrieved.name).toBe(updateData.name);
    expect(retrieved.description).toBe(updateData.description);
  });
}); 