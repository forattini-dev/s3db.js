import { 
  calculateAttributeSizes, 
  calculateTotalSize, 
  getSizeBreakdown, 
  calculateUTF8Bytes, 
  transformValue 
} from '../src/concerns/calculator.js';

describe('Calculator Tests', () => {
  
  describe('Primitive Object Types', () => {
    
    test('should handle null and undefined values', () => {
      const mappedObject = {
        '_v': '1',
        'null_field': '',
        'undefined_field': '',
        'empty_string': ''
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      expect(sizes['_v']).toBe(1);
      expect(sizes['null_field']).toBe(0);
      expect(sizes['undefined_field']).toBe(0);
      expect(sizes['empty_string']).toBe(0);
    });

    test('should handle boolean values', () => {
      const mappedObject = {
        '_v': '1',
        'true_value': '1',
        'false_value': '0'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      expect(sizes['true_value']).toBe(1);
      expect(sizes['false_value']).toBe(1);
    });

    test('should handle number values as strings', () => {
      const mappedObject = {
        '_v': '1',
        'integer': '42',
        'float': '3.14159',
        'zero': '0',
        'negative': '-123',
        'large_number': '999999999999999'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      expect(sizes['integer']).toBe(2);
      expect(sizes['float']).toBe(7);
      expect(sizes['zero']).toBe(1);
      expect(sizes['negative']).toBe(4);
      expect(sizes['large_number']).toBe(15);
    });

    test('should handle string values', () => {
      const mappedObject = {
        '_v': '1',
        'ascii_string': 'Hello World',
        'unicode_string': 'Olá mundo! 🌍',
        'chinese_string': '你好世界',
        'emoji_string': '🚀🔥💻',
        'special_chars': '!@#$%^&*()_+-=[]{}|;:,.<>?'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      expect(sizes['ascii_string']).toBe(11); // ASCII characters
      expect(sizes['unicode_string']).toBe(16); // Mixed ASCII and Unicode
      expect(sizes['chinese_string']).toBe(12); // Chinese characters (3 bytes each)
      expect(sizes['emoji_string']).toBe(12); // Emojis (4 bytes each)
      expect(sizes['special_chars']).toBe(26); // ASCII special characters (adjusted)
    });

    test('should handle array values', () => {
      const mappedObject = {
        '_v': '1',
        'empty_array': '[]',
        'simple_array': 'item1|item2|item3',
        'mixed_array': 'text|42|true|false',
        'unicode_array': 'hello|olá|你好|🌍'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      expect(sizes['empty_array']).toBe(2);
      expect(sizes['simple_array']).toBe(17);
      expect(sizes['mixed_array']).toBe(18); // Adjusted
      expect(sizes['unicode_array']).toBe(22); // Adjusted for actual Unicode characters
    });

    test('should handle object values as JSON', () => {
      const mappedObject = {
        '_v': '1',
        'simple_object': '{"key":"value"}',
        'nested_object': '{"user":{"name":"John","age":30}}',
        'array_object': '{"items":[1,2,3],"count":3}',
        'complex_object': '{"data":{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}}'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      expect(sizes['simple_object']).toBe(15);
      expect(sizes['nested_object']).toBe(33);
      expect(sizes['array_object']).toBe(27); // Adjusted
      expect(sizes['complex_object']).toBe(66); // Adjusted
    });
  });

  describe('Small Combinations', () => {
    
    test('should handle mixed data types', () => {
      const mappedObject = {
        '_v': '1',
        'user_id': '12345',
        'username': 'john_doe',
        'is_active': '1',
        'preferences': '{"theme":"dark","notifications":true}',
        'tags': 'admin|moderator|user',
        'last_login': '2024-01-15T10:30:00Z',
        'profile_complete': '0'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      const total = calculateTotalSize(mappedObject);
      
      expect(sizes['user_id']).toBe(5);
      expect(sizes['username']).toBe(8);
      expect(sizes['is_active']).toBe(1);
      expect(sizes['preferences']).toBe(37); // Adjusted
      expect(sizes['tags']).toBe(20);
      expect(sizes['last_login']).toBe(20); // Adjusted
      expect(sizes['profile_complete']).toBe(1);
      expect(total).toBeGreaterThan(0);
    });

    test('should handle nested data structures', () => {
      const mappedObject = {
        '_v': '1',
        'metadata': '{"created_at":"2024-01-01","updated_at":"2024-01-15","version":"1.0.0"}',
        'settings': '{"ui":{"language":"pt-BR","timezone":"America/Sao_Paulo"},"features":{"dark_mode":true,"notifications":false}}',
        'permissions': 'read|write|delete|admin',
        'status': 'active'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      const breakdown = getSizeBreakdown(mappedObject);
      
      expect(sizes['metadata']).toBeGreaterThan(0);
      expect(sizes['settings']).toBeGreaterThan(0);
      expect(sizes['permissions']).toBeGreaterThan(0);
      expect(sizes['status']).toBeGreaterThan(0);
      expect(breakdown.total).toBeGreaterThan(0);
      expect(breakdown.breakdown.length).toBe(5);
    });

    test('should handle edge cases', () => {
      const mappedObject = {
        '_v': '1',
        'very_long_string': 'a'.repeat(1000),
        'unicode_mix': 'Hello 世界 🌍 Olá 你好!',
        'special_json': '{"escaped":"\\"quotes\\"","newlines":"\\n\\t\\r","unicode":"\\u0041\\u0042\\u0043"}',
        'empty_arrays': '[]|[]|[]',
        'numbers_as_strings': '0|1|2|3|4|5|6|7|8|9'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      
      expect(sizes['very_long_string']).toBe(1000); // ASCII characters
      expect(sizes['unicode_mix']).toBeGreaterThan(20); // Mixed Unicode
      expect(sizes['special_json']).toBeGreaterThan(0);
      expect(sizes['empty_arrays']).toBe(8); // Adjusted: []|[]|[]
      expect(sizes['numbers_as_strings']).toBe(19); // 0|1|2|3|4|5|6|7|8|9
    });
  });

  describe('Large Objects (2KB+)', () => {
    
    test('should handle large text content', () => {
      // Create a large text content that will be over 2KB
      const largeText = `
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. 
        Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. 
        Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        
        Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, 
        eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. 
        Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores 
        eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, 
        consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.
        
        Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? 
        Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, 
        vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?
        
        At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti 
        quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia 
        deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio. 
        Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, 
        omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus 
        saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae. Itaque earum rerum hic tenetur a sapiente delectus, 
        ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat.
      `.repeat(3); // Repeat to ensure it's over 2KB
      
      const mappedObject = {
        '_v': '1',
        'large_content': largeText,
        'metadata': '{"content_type":"text","language":"en","word_count":1500,"reading_time":"5 minutes"}',
        'tags': 'lorem|ipsum|dolor|sit|amet|consectetur|adipiscing|elit|sed|do|eiusmod|tempor|incididunt|ut|labore|et|dolore|magna|aliqua',
        'author': 'Marcus Tullius Cicero',
        'category': 'philosophy',
        'published_date': '2024-01-15T12:00:00Z',
        'is_featured': '1',
        'view_count': '1250',
        'rating': '4.8'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      const total = calculateTotalSize(mappedObject);
      const breakdown = getSizeBreakdown(mappedObject);
      
      expect(total).toBeGreaterThan(2000); // Over 2KB
      expect(sizes['large_content']).toBeGreaterThan(1500); // Large content should be significant
      expect(breakdown.breakdown[0].attribute).toBe('large_content'); // Should be the largest
      expect(parseFloat(breakdown.breakdown[0].percentage)).toBeGreaterThan(50); // Should be more than 50% of total
    });

    test('should handle complex nested structures', () => {
      const complexObject = {
        '_v': '1',
        'user_profile': JSON.stringify({
          personal_info: {
            name: 'João Silva Santos',
            email: 'joao.silva@example.com',
            phone: '+55 11 99999-9999',
            birth_date: '1990-05-15',
            nationality: 'Brasileiro',
            address: {
              street: 'Rua das Flores, 123',
              city: 'São Paulo',
              state: 'SP',
              zip_code: '01234-567',
              country: 'Brasil'
            }
          },
          professional_info: {
            company: 'Tech Solutions Ltda',
            position: 'Senior Full-Stack Developer',
            department: 'Engineering',
            start_date: '2020-03-01',
            salary: 8500.00,
            skills: ['JavaScript', 'TypeScript', 'Node.js', 'React', 'Vue.js', 'Python', 'PostgreSQL', 'MongoDB', 'Docker', 'AWS'],
            certifications: [
              { name: 'AWS Certified Developer', date: '2023-06-15', expiry: '2026-06-15' },
              { name: 'Google Cloud Professional Developer', date: '2023-09-20', expiry: '2026-09-20' }
            ]
          },
          preferences: {
            language: 'pt-BR',
            timezone: 'America/Sao_Paulo',
            theme: 'dark',
            notifications: {
              email: true,
              push: false,
              sms: true
            },
            privacy: {
              profile_visible: true,
              contact_visible: false,
              location_visible: true
            }
          },
          social_media: {
            linkedin: 'linkedin.com/in/joaosilva',
            github: 'github.com/joaosilva',
            twitter: '@joaosilva',
            instagram: '@joaosilva.dev'
          }
        }),
        'activity_log': JSON.stringify(Array.from({ length: 50 }, (_, i) => ({
          id: i + 1,
          action: ['login', 'logout', 'profile_update', 'password_change', 'data_export'][i % 5],
          timestamp: new Date(Date.now() - i * 86400000).toISOString(),
          ip_address: `192.168.1.${i % 255}`,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          success: i % 10 !== 0
        }))),
        'settings': JSON.stringify({
          security: {
            two_factor_enabled: true,
            last_password_change: '2024-01-01T00:00:00Z',
            failed_login_attempts: 0,
            account_locked: false,
            password_policy: {
              min_length: 12,
              require_uppercase: true,
              require_lowercase: true,
              require_numbers: true,
              require_special_chars: true,
              expiry_days: 90
            }
          },
          display: {
            theme: 'dark',
            font_size: 'medium',
            language: 'pt-BR',
            timezone: 'America/Sao_Paulo',
            date_format: 'DD/MM/YYYY',
            time_format: '24h'
          },
          notifications: {
            email_frequency: 'daily',
            push_enabled: true,
            sms_enabled: false,
            marketing_emails: false,
            security_alerts: true,
            system_updates: true
          }
        }),
        'tags': 'developer|senior|fullstack|javascript|typescript|nodejs|react|vue|python|postgresql|mongodb|docker|aws|gcp|certified|brazil|sao-paulo',
        'status': 'active',
        'last_login': '2024-01-15T10:30:00Z',
        'login_count': '1250',
        'is_verified': '1',
        'subscription_tier': 'premium'
      };
      
      const sizes = calculateAttributeSizes(complexObject);
      const total = calculateTotalSize(complexObject);
      const breakdown = getSizeBreakdown(complexObject);
      
      expect(total).toBeGreaterThan(2000); // Over 2KB
      expect(sizes['user_profile']).toBeGreaterThan(1000); // Large profile
      expect(sizes['activity_log']).toBeGreaterThan(500); // Activity log
      expect(sizes['settings']).toBeGreaterThan(300); // Settings
      expect(breakdown.breakdown.length).toBe(10); // All fields
      expect(breakdown.total).toBe(total);
    });

    test('should handle large arrays and collections', () => {
      // Create large arrays
      const largeArray = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        description: `This is a detailed description for item ${i + 1} with some additional content to make it larger. This is item number ${i} in a large collection.`,
        category: ['electronics', 'clothing', 'books', 'home', 'sports'][i % 5],
        price: (Math.random() * 1000).toFixed(2),
        in_stock: Math.random() > 0.5,
        tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'].slice(0, (i % 3) + 1).join('|'),
        created_at: new Date(Date.now() - i * 86400000).toISOString()
      }));
      
      const mappedObject = {
        '_v': '1',
        'products': JSON.stringify(largeArray),
        'categories': 'electronics|clothing|books|home|sports|automotive|health|beauty|toys|garden|kitchen|office|outdoor|indoor|digital|physical',
        'inventory_summary': JSON.stringify({
          total_items: 100,
          total_value: 45000.50,
          low_stock_items: 15,
          out_of_stock_items: 3,
          categories_count: 16,
          last_updated: new Date().toISOString()
        }),
        'analytics': JSON.stringify({
          daily_sales: Array.from({ length: 30 }, (_, i) => ({
            date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
            sales: Math.floor(Math.random() * 1000) + 100,
            revenue: (Math.random() * 50000 + 5000).toFixed(2),
            customers: Math.floor(Math.random() * 100) + 10
          })),
          top_products: Array.from({ length: 20 }, (_, i) => ({
            id: i + 1,
            name: `Top Product ${i + 1}`,
            sales_count: Math.floor(Math.random() * 1000) + 100,
            revenue: (Math.random() * 10000 + 1000).toFixed(2)
          })),
          customer_segments: {
            new_customers: 45,
            returning_customers: 78,
            premium_customers: 23,
            inactive_customers: 12
          }
        }),
        'status': 'active',
        'last_sync': '2024-01-15T15:30:00Z',
        'sync_count': '1250'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      const total = calculateTotalSize(mappedObject);
      const breakdown = getSizeBreakdown(mappedObject);
      
      expect(total).toBeGreaterThan(2000); // Over 2KB
      expect(sizes['products']).toBeGreaterThan(1000); // Large products array
      expect(sizes['analytics']).toBeGreaterThan(500); // Analytics data
      expect(breakdown.breakdown[0].attribute).toBe('products'); // Products should be largest
      expect(breakdown.total).toBe(total);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    
    test('should handle empty object', () => {
      const mappedObject = { '_v': '1' };
      
      const sizes = calculateAttributeSizes(mappedObject);
      const total = calculateTotalSize(mappedObject);
      const breakdown = getSizeBreakdown(mappedObject);
      
      expect(sizes['_v']).toBe(1);
      expect(total).toBe(3); // 1 for value + 2 for attribute name '_v'
      expect(breakdown.total).toBe(3);
      expect(breakdown.breakdown.length).toBe(1);
    });

    test('should handle very large strings', () => {
      const largeString = '🚀'.repeat(1000); // 1000 emojis = 4000 bytes
      
      const mappedObject = {
        '_v': '1',
        'large_emoji_string': largeString
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      expect(sizes['large_emoji_string']).toBe(4000); // 4 bytes per emoji
    });

    test('should handle mixed encoding scenarios', () => {
      const mappedObject = {
        '_v': '1',
        'ascii_only': 'Hello World',
        'mixed_encoding': 'Hello 世界 🌍 Olá 你好!',
        'chinese_only': '你好世界欢迎来到我们的网站',
        'emoji_only': '🚀🔥💻🎉✨🌟💫🎊🎈🎁',
        'special_chars': '!@#$%^&*()_+-=[]{}|;:,.<>?\'"\\'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      
      expect(sizes['ascii_only']).toBe(11); // 1 byte per char
      expect(sizes['mixed_encoding']).toBeGreaterThan(20); // Mixed 1-4 bytes per char
      expect(sizes['chinese_only']).toBe(39); // Adjusted: 3 bytes per char
      expect(sizes['emoji_only']).toBe(39); // Adjusted: actual emoji size
      expect(sizes['special_chars']).toBe(29); // Adjusted: actual special chars size
    });

    test('should handle surrogate pairs correctly', () => {
      const mappedObject = {
        '_v': '1',
        'surrogate_pair': '🌍', // U+1F30D (surrogate pair)
        'high_surrogate': '\uD83C', // High surrogate only
        'low_surrogate': '\uDF0D', // Low surrogate only
        'mixed_surrogates': 'Hello 🌍 World'
      };
      
      const sizes = calculateAttributeSizes(mappedObject);
      
      expect(sizes['surrogate_pair']).toBe(4); // Complete surrogate pair
      expect(sizes['high_surrogate']).toBe(3); // Incomplete surrogate
      expect(sizes['low_surrogate']).toBe(3); // Incomplete surrogate
      expect(sizes['mixed_surrogates']).toBe(16); // Mixed ASCII and surrogate pair
    });
  });

  describe('Performance Tests', () => {
    
    test('should handle very large objects efficiently', () => {
      const startTime = Date.now();
      
      // Create a very large object
      const largeObject = {
        '_v': '1',
        'large_data': JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `Data item ${i} with some additional content to make it larger. This is item number ${i} in a large collection.`,
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          metadata: {
            category: `category_${i % 10}`,
            tags: Array.from({ length: 5 }, (_, j) => `tag_${i}_${j}`).join('|'),
            flags: Array.from({ length: 3 }, (_, j) => Math.random() > 0.5).join('|')
          }
        })))
      };
      
      const sizes = calculateAttributeSizes(largeObject);
      const total = calculateTotalSize(largeObject);
      const breakdown = getSizeBreakdown(largeObject);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(total).toBeGreaterThan(100000); // Over 100KB
      expect(executionTime).toBeLessThan(1000); // Should complete in less than 1 second
      expect(breakdown.breakdown.length).toBe(2); // _v and large_data
      expect(sizes['large_data']).toBeGreaterThan(99000); // Most of the size
    });

    test('should handle non-string input to calculateUTF8Bytes', () => {
      // Test with number input (should be converted to string)
      const result = calculateAttributeSizes({ num: 123 });
      expect(result.num).toBe(3); // "123" = 3 bytes
      // Test with boolean input
      const result2 = calculateAttributeSizes({ bool: true });
      expect(result2.bool).toBe(1); // "1" = 1 byte
      // Test with null input
      const result3 = calculateAttributeSizes({ nullVal: null });
      expect(result3.nullVal).toBe(0); // "" = 0 bytes
    });

    test('should handle transformValue edge cases', () => {
      // Test with function (should be converted to string)
      const func = () => 'test';
      const result = calculateAttributeSizes({ func });
      expect(result.func).toBeGreaterThan(0);
      // Test with Symbol (should be converted to string)
      const sym = Symbol('test');
      const result2 = calculateAttributeSizes({ sym });
      expect(result2.sym).toBeGreaterThan(0);
      // Test with Date object
      const date = new Date();
      const result3 = calculateAttributeSizes({ date });
      expect(result3.date).toBeGreaterThan(0);
    });

    test('should handle getSizeBreakdown with empty object', () => {
      const breakdown = getSizeBreakdown({});
      expect(breakdown.total).toBe(0);
      expect(breakdown.sizes).toBeUndefined();
      expect(breakdown.breakdown).toEqual([]);
    });

    test('should handle getSizeBreakdown with single attribute', () => {
      const breakdown = getSizeBreakdown({ name: 'John' });
      expect(breakdown.total).toBe(8); // "John" = 4 bytes, "name" = 4 bytes
      expect(breakdown.sizes).toBeUndefined();
      expect(breakdown.namesSize).toBe(4);
      expect(breakdown.breakdown).toEqual([
        { attribute: 'name', size: 4, percentage: '50.00%' }
      ]);
    });

    test('should handle getSizeBreakdown with equal sizes', () => {
      const breakdown = getSizeBreakdown({ a: 'x', b: 'y', c: 'z' });
      expect(breakdown.total).toBe(6); // 3 valores + 3 nomes = 6 bytes
      expect(breakdown.sizes).toBeUndefined();
      expect(breakdown.namesSize).toBe(3);
      expect(breakdown.breakdown.length).toBe(3);
      // All should have same percentage
      expect(breakdown.breakdown[0].percentage).toBe('16.67%');
      expect(breakdown.breakdown[1].percentage).toBe('16.67%');
      expect(breakdown.breakdown[2].percentage).toBe('16.67%');
    });

    test('should handle exotic types in transformValue', () => {
      // BigInt
      const big = 12345678901234567890n;
      const resultBig = calculateAttributeSizes({ big });
      expect(typeof resultBig.big).toBe('number');
      // Function
      const fn = function() { return 42; };
      const resultFn = calculateAttributeSizes({ fn });
      expect(typeof resultFn.fn).toBe('number');
      // Symbol
      const sym = Symbol('abc');
      const resultSym = calculateAttributeSizes({ sym });
      expect(typeof resultSym.sym).toBe('number');
    });

    test('should cover calculateUTF8Bytes with non-string input', () => {
      // Testar via calculateAttributeSizes que internamente chama calculateUTF8Bytes
      // com valores não-string (objetos, arrays, etc.)
      const result = calculateAttributeSizes({ 
        obj: { foo: 'bar' },
        arr: [1, 2, 3],
        num: 42,
        bool: true
      });
      expect(typeof result.obj).toBe('number');
      expect(typeof result.arr).toBe('number');
      expect(typeof result.num).toBe('number');
      expect(typeof result.bool).toBe('number');
    });

    test('should cover transformValue final return', () => {
      // Testar tipos que caem no último return de transformValue
      const result = calculateAttributeSizes({
        bigint: 12345678901234567890n,
        func: function(){},
        symbol: Symbol('abc')
      });
      expect(typeof result.bigint).toBe('number');
      expect(typeof result.func).toBe('number');
      expect(typeof result.symbol).toBe('number');
    });

    test('should cover calculateUTF8Bytes with non-string input directly', () => {
      // Testar diretamente a função com input não-string
      const result = calculateUTF8Bytes({ foo: 'bar' });
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    test('should cover transformValue final return directly', () => {
      // Testar diretamente o último return de transformValue
      const bigintResult = transformValue(12345678901234567890n);
      expect(typeof bigintResult).toBe('string');
      
      const funcResult = transformValue(function(){});
      expect(typeof funcResult).toBe('string');
      
      const symbolResult = transformValue(Symbol('abc'));
      expect(typeof symbolResult).toBe('string');
      
      // Testar com tipos que realmente caem no último return
      const dateResult = transformValue(new Date());
      expect(typeof dateResult).toBe('string');
      
      const errorResult = transformValue(new Error('test'));
      expect(typeof errorResult).toBe('string');
      
      const regexResult = transformValue(/regex/);
      expect(typeof regexResult).toBe('string');
      
      // Testar com undefined em contexto que não seja tratado como undefined
      const undefinedResult = transformValue(undefined);
      expect(typeof undefinedResult).toBe('string');
      expect(undefinedResult).toBe('');
      
      // Testar com NaN
      const nanResult = transformValue(NaN);
      expect(typeof nanResult).toBe('string');
      
      // Testar com null
      const nullResult = transformValue(null);
      expect(typeof nullResult).toBe('string');
      expect(nullResult).toBe('');
    });
  });
}); 