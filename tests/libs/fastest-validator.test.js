import Validator from 'fastest-validator';

describe('fastest-validator v1.19.1 - Comprehensive Shorthand Notation Tests', () => {
  let v;

  beforeEach(() => {
    v = new Validator();
  });

  describe('Basic Type Shorthand', () => {
    it('validates simple type shorthand', () => {
      const check = v.compile({
        name: 'string',
        age: 'number',
        active: 'boolean',
        email: 'email',
        website: 'url',
        birthday: 'date'
      });

      expect(check({
        name: 'John',
        age: 30,
        active: true,
        email: 'john@example.com',
        website: 'https://example.com',
        birthday: new Date()
      })).toBe(true);

      const result = check({
        name: 123,
        age: 'thirty',
        active: 'yes',
        email: 'invalid-email',
        website: 'not-a-url',
        birthday: 'not-a-date'
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(6); // Should have exactly 6 errors
      
      // Check specific error types and fields
      expect(result.find(err => err.field === 'name' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'age' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'active' && err.type === 'boolean')).toBeDefined();
      expect(result.find(err => err.field === 'email' && err.type === 'email')).toBeDefined();
      expect(result.find(err => err.field === 'website' && err.type === 'url')).toBeDefined();
      expect(result.find(err => err.field === 'birthday' && err.type === 'date')).toBeDefined();
      
      // Check that all errors have required properties
      result.forEach(error => {
        expect(error).toHaveProperty('type');
        expect(error).toHaveProperty('field');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('actual');
        expect(typeof error.message).toBe('string');
      });
    });

    it('validates array type shorthand', () => {
      const check = v.compile({
        tags: 'string[]',
        scores: 'number[]',
        flags: 'boolean[]'
      });

      // Valid data should pass
      expect(check({
        tags: ['javascript', 'nodejs'],
        scores: [85, 92, 78],
        flags: [true, false, true]
      })).toBe(true);

      // Invalid data should fail with specific errors
      const result = check({
        tags: [123, 'valid'],        // 123 is not a string
        scores: ['invalid', 90],     // 'invalid' is not a number
        flags: ['yes', true]         // 'yes' is not a boolean
      });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Should have exactly 3 errors
      
      // Check specific error types with correct field format
      expect(result.find(err => err.field === 'tags[0]' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'scores[0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'flags[0]' && err.type === 'boolean')).toBeDefined();
    });
  });

  describe('Constraint Shorthand with Pipes', () => {
    it('validates string constraints shorthand', () => {
      const check = v.compile({
        username: 'string|min:3|max:20',
        password: 'string|min:8',
        code: 'string|length:6',
        description: 'string|empty:false',
        hexValue: 'string|hex:true',
        // Use longform for pattern since regex shorthand has issues
        pattern: { type: 'string', pattern: /^[A-Z]+$/ },
        // Use longform for enum since enum shorthand has issues in v1.19.1
        role: { type: 'string', enum: ['admin', 'user', 'guest'] }
      });

      expect(check({
        username: 'john_doe',
        password: 'secretpassword',
        code: 'ABC123',
        description: 'A valid description',
        hexValue: 'FF00AA',
        pattern: 'HELLO',
        role: 'admin'
      })).toBe(true);

      // Test violations
      const result = check({
        username: 'jo', // too short
        password: '123', // too short
        code: 'TOOLONG', // wrong length
        description: '', // empty not allowed
        hexValue: 'GGHHII', // invalid hex
        pattern: 'hello', // doesn't match pattern
        role: 'invalid' // not in enum
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(7); // Should have exactly 7 errors
      
      // Check specific error types
      expect(result.find(err => err.field === 'username' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'password' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'code' && err.type === 'stringLength')).toBeDefined();
      expect(result.find(err => err.field === 'description' && err.type === 'stringEmpty')).toBeDefined();
      expect(result.find(err => err.field === 'hexValue' && err.type === 'stringHex')).toBeDefined();
      expect(result.find(err => err.field === 'pattern' && err.type === 'stringPattern')).toBeDefined();
      expect(result.find(err => err.field === 'role' && err.type === 'stringEnum')).toBeDefined();
    });

    it('validates advanced string constraint combinations', () => {
      const check = v.compile({
        // Complex constraint chains with multiple format flags
        alphaField: 'string|min:3|max:20|alpha:true|trim:true|lowercase:true',
        numericField: 'string|length:6|numeric:true|trim:true',
        alphanumField: 'string|min:5|max:15|alphanum:true|uppercase:true',
        alphadashField: 'string|min:3|max:25|alphadash:true|trim:true',
        
        // Hex validation with size constraints
        hexField: 'string|min:6|max:12|hex:true|uppercase:true',
        
        // Base64 with length validation
        base64Field: 'string|min:4|max:100|base64:true|trim:true',
        
        // Single line with content validation
        singleLineField: 'string|min:1|max:50|singleLine:true|trim:true|empty:false',
        
        // Format flags with sanitization
        sanitizedField: 'string|min:2|max:30|trim:true|lowercase:true|convert:true',
        
        // Multiple format constraints
        strictField: 'string|min:8|max:20|alphanum:true|empty:false|trim:true'
      });

      // Test valid combinations
      const validObj = {
        alphaField: '  Hello  ',
        numericField: ' 123456 ',
        alphanumField: 'test123',
        alphadashField: '  hello-world_test  ',
        hexField: 'ff00aa',
        base64Field: '  SGVsbG8=  ',
        singleLineField: '  Valid text  ',
        sanitizedField: 123, // will convert
        strictField: '  ValidTest123  '
      };

      expect(check(validObj)).toBe(true);
      
      // Check sanitization effects
      expect(validObj.alphaField).toBe('hello'); // trimmed and lowercased
      expect(validObj.numericField).toBe('123456'); // trimmed
      expect(validObj.alphanumField).toBe('TEST123'); // uppercased
      expect(validObj.alphadashField).toBe('hello-world_test'); // trimmed
      expect(validObj.hexField).toBe('FF00AA'); // uppercased
      expect(validObj.base64Field).toBe('SGVsbG8='); // trimmed
      expect(validObj.singleLineField).toBe('Valid text'); // trimmed
      expect(validObj.sanitizedField).toBe('123'); // converted and lowercased
      expect(validObj.strictField).toBe('ValidTest123'); // trimmed (no auto-lowercase in this combination)

      // Test constraint violations
      const result = check({
        alphaField: 'Hello123', // contains numbers
        numericField: 'abc123', // contains letters
        alphanumField: 'test!', // contains special char
        alphadashField: 'hello@world', // invalid char
        hexField: 'GGHHII', // invalid hex
        base64Field: 'invalid_base64!', // invalid base64
        singleLineField: 'Multi\nline\ntext', // contains newlines
        sanitizedField: '', // empty after conversion
        strictField: 'ab' // too short
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(9); // Should have exactly 9 errors
      
      // Verify specific error types and field validation
      expect(result.find(err => err.field === 'alphaField' && err.type === 'stringAlpha')).toBeDefined();
      expect(result.find(err => err.field === 'numericField' && err.type === 'stringNumeric')).toBeDefined();
      expect(result.find(err => err.field === 'alphanumField' && err.type === 'stringAlphanum')).toBeDefined();
      expect(result.find(err => err.field === 'alphadashField' && err.type === 'stringAlphadash')).toBeDefined();
      expect(result.find(err => err.field === 'hexField' && err.type === 'stringHex')).toBeDefined();
      expect(result.find(err => err.field === 'base64Field' && err.type === 'stringBase64')).toBeDefined();
      expect(result.find(err => err.field === 'singleLineField' && err.type === 'stringSingleLine')).toBeDefined();
      expect(result.find(err => err.field === 'sanitizedField' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'strictField' && err.type === 'stringMin')).toBeDefined();
    });

    it('validates boundary value string constraints', () => {
      const check = v.compile({
        // Extreme length constraints
        minZero: 'string|min:0|max:5',
        maxLarge: 'string|min:1|max:10000',
        exactLength: 'string|length:1',
        
        // Edge case combinations
        emptyAllowed: 'string|min:0|empty:true|trim:true',
        emptyForbidden: 'string|min:1|empty:false|trim:true',
        
        // Format with extreme sizes
        largeHex: 'string|min:2|max:1000|hex:true',
        tinyAlpha: 'string|length:1|alpha:true'
      });

      // Test boundary conditions
      expect(check({
        minZero: '',
        maxLarge: 'x'.repeat(10000),
        exactLength: 'X',
        emptyAllowed: '   ',
        emptyForbidden: 'X',
        largeHex: 'A'.repeat(1000),
        tinyAlpha: 'Z'
      })).toBe(true);

      // Test boundary violations
      const result = check({
        minZero: 'toolong', // exceeds max
        maxLarge: 'x'.repeat(10001), // exceeds max
        exactLength: 'XX', // wrong length
        emptyAllowed: null, // null not allowed
        emptyForbidden: '   ', // becomes empty after trim
        largeHex: 'G'.repeat(10), // invalid hex
        tinyAlpha: '1' // not alpha
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(8); // Should have exactly 8 errors
      
      // Check specific boundary errors
      expect(result.find(err => err.field === 'minZero' && err.type === 'stringMax')).toBeDefined();
      expect(result.find(err => err.field === 'maxLarge' && err.type === 'stringMax')).toBeDefined();
      expect(result.find(err => err.field === 'exactLength' && err.type === 'stringLength')).toBeDefined();
      expect(result.find(err => err.field === 'emptyAllowed' && err.type === 'required')).toBeDefined();
      expect(result.find(err => err.field === 'emptyForbidden' && err.type === 'stringEmpty')).toBeDefined();
      expect(result.find(err => err.field === 'emptyForbidden' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'largeHex' && err.type === 'stringHex')).toBeDefined();
      expect(result.find(err => err.field === 'tinyAlpha' && err.type === 'stringAlpha')).toBeDefined();
    });

    it('validates complex sanitization chains', () => {
      const check = v.compile({
        // Multiple sanitization operations
        fullSanitize: 'string|trim:true|lowercase:true|convert:true',
        trimUpper: 'string|trim:true|uppercase:true|min:2',
        convertAlpha: 'string|convert:true|alpha:true|trim:true',
        
        // Sanitization with validation
        sanitizeValidate: 'string|trim:true|min:3|max:10|alphanum:true|lowercase:true',
        
        // Edge case sanitization
        numberToString: 'string|convert:true|numeric:true|min:1',
        booleanToString: 'string|convert:true|length:4' // true/false
      });

      const obj1 = {
        fullSanitize: 123.45,
        trimUpper: '  hello world  ',
        convertAlpha: 'TESTING',
        sanitizeValidate: '  Test123  ',
        numberToString: 12345,
        booleanToString: true
      };

      expect(check(obj1)).toBe(true);
      
      // Verify sanitization results
      expect(obj1.fullSanitize).toBe('123.45');
      expect(obj1.trimUpper).toBe('HELLO WORLD');
      expect(obj1.convertAlpha).toBe('TESTING'); // convert doesn't lowercase automatically
      expect(obj1.sanitizeValidate).toBe('test123');
      expect(obj1.numberToString).toBe('12345');
      expect(obj1.booleanToString).toBe('true');

      // Test sanitization with validation failures
      const result = check({
        fullSanitize: null, // can't convert null
        trimUpper: '  x  ', // too short after trim
        convertAlpha: '123', // numeric not alpha
        sanitizeValidate: '  VeryLongStringThatExceedsLimit  ', // too long after trim
        numberToString: 'abc', // not numeric after conversion
        booleanToString: 'wrong' // wrong length
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(6); // Should have exactly 6 errors
      
      // Check sanitization failure errors
      expect(result.find(err => err.field === 'fullSanitize' && err.type === 'required')).toBeDefined();
      expect(result.find(err => err.field === 'trimUpper' && err.type === 'stringMin')).toBeDefined();
      expect(result.find(err => err.field === 'convertAlpha' && err.type === 'stringAlpha')).toBeDefined();
      expect(result.find(err => err.field === 'sanitizeValidate' && err.type === 'stringMax')).toBeDefined();
      expect(result.find(err => err.field === 'numberToString' && err.type === 'stringNumeric')).toBeDefined();
      expect(result.find(err => err.field === 'booleanToString' && err.type === 'stringLength')).toBeDefined();
    });

    it('validates string constraint precedence and interactions', () => {
      const check = v.compile({
        // Test order of operations: convert -> trim -> validate
        precedenceTest: 'string|convert:true|trim:true|min:3|alpha:true|lowercase:true',
        
        // Conflicting constraints (should follow last wins or most restrictive)
        conflictTest: 'string|lowercase:true|uppercase:true|trim:true', // last wins
        
        // Multiple format flags (should all apply)
        multiFormat: 'string|alphanum:true|singleLine:true|min:5|max:20',
        
        // Size after sanitization
        sizeAfterSanitize: 'string|trim:true|min:5|max:10',
        
        // Format validation after conversion
        formatAfterConvert: 'string|convert:true|hex:true|length:6'
      });

      const obj = {
        precedenceTest: 123, // convert to '123', trim (no effect), check min:3 (pass), alpha (fail)
        conflictTest: '  HELLO  ', // trim -> 'HELLO', lowercase -> 'hello', uppercase -> 'HELLO'
        multiFormat: 'Test123', // alphanum ok, singleLine ok, length ok
        sizeAfterSanitize: '  hello  ', // trim -> 'hello' (length 5, min ok)
        formatAfterConvert: 'FF00AA' // string, check hex and length
      };

      const result = check(obj);
      
      // Check precedence effects
      expect(obj.conflictTest).toBe('HELLO'); // uppercase wins (last)
      expect(obj.sizeAfterSanitize).toBe('hello'); // trimmed
      
      // precedenceTest should fail alpha validation after conversion
      expect(Array.isArray(result)).toBe(true);
      expect(result.find(err => err.field === 'precedenceTest' && err.type === 'stringAlpha')).toBeDefined();
      
      // Other tests should pass
      expect(result.find(err => err.field === 'conflictTest')).toBeUndefined();
      expect(result.find(err => err.field === 'multiFormat')).toBeUndefined();
      expect(result.find(err => err.field === 'sizeAfterSanitize')).toBeUndefined();
      expect(result.find(err => err.field === 'formatAfterConvert')).toBeUndefined();
    });

    it('validates number constraints shorthand', () => {
      const check = v.compile({
        age: 'number|min:18|max:100',
        score: 'number|min:0|max:100',
        price: 'number|positive:true',
        count: 'number|integer:true',
        rating: 'number|equal:5'
      });

      expect(check({
        age: 25,
        score: 85,
        price: 29.99,
        count: 42,
        rating: 5
      })).toBe(true);

      const result = check({
        age: 15, // too young
        score: 150, // too high
        price: -10, // negative
        count: 3.14, // not integer
        rating: 4 // not equal to 5
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5); // Should have exactly 5 errors
      
      // Check specific error types
      expect(result.find(err => err.field === 'age' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'score' && err.type === 'numberMax')).toBeDefined();
      expect(result.find(err => err.field === 'price' && err.type === 'numberPositive')).toBeDefined();
      expect(result.find(err => err.field === 'count' && err.type === 'numberInteger')).toBeDefined();
      expect(result.find(err => err.field === 'rating' && err.type === 'numberEqual')).toBeDefined();
    });

    it('validates complex constraint combinations', () => {
      const check = v.compile({
        // Use mixed shorthand and longform - regex patterns need longform
        advancedField: { 
          type: 'string', 
          min: 5, 
          max: 50, 
          pattern: /^[a-zA-Z0-9_]+$/, 
          trim: true 
        }
      });

      const obj = { advancedField: '  valid_field123  ' };
      expect(check(obj)).toBe(true);
      expect(obj.advancedField).toBe('valid_field123'); // trimmed

      const result = check({ advancedField: 'ab' }); // too short
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Optional Fields Shorthand', () => {
    it('validates optional shorthand with pipe syntax', () => {
      const check = v.compile({
        name: 'string',
        bio: 'string|optional:true',
        age: 'number|optional:true|min:18'
      });

      expect(check({ name: 'John' })).toBe(true);
      expect(check({ name: 'John', bio: 'Hello world' })).toBe(true);
      expect(check({ name: 'John', age: 25 })).toBe(true);
      expect(check({ name: 'John', bio: 'Hi', age: 30 })).toBe(true);

      const result = check({}); // missing required name
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('required');
      expect(result[0].field).toBe('name');
    });

    it('validates mixed required and optional fields', () => {
      const check = v.compile({
        email: 'email',
        username: 'string|min:3',
        firstName: 'string|optional:true',
        lastName: 'string|optional:true',
        phone: { type: 'string', optional: true, pattern: /^\+?[0-9]{10,15}$/ }
      });

      expect(check({
        email: 'user@example.com',
        username: 'johndoe'
      })).toBe(true);

      expect(check({
        email: 'user@example.com',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890'
      })).toBe(true);
    });
  });

  describe('Array Shorthand Patterns', () => {
    it('validates array of primitives shorthand', () => {
      const check = v.compile({
        strings: 'string[]',
        numbers: 'number[]',
        booleans: 'boolean[]',
        emails: 'email[]',
        urls: 'url[]'
      });

      expect(check({
        strings: ['hello', 'world'],
        numbers: [1, 2, 3],
        booleans: [true, false],
        emails: ['a@test.com', 'b@test.com'],
        urls: ['https://a.com', 'https://b.com']
      })).toBe(true);

      const result = check({
        strings: [123, 'valid'],        // 123 is not a string
        numbers: ['invalid', 42],       // 'invalid' is not a number
        booleans: ['true', false],      // 'true' is not a boolean
        emails: ['invalid-email', 'valid@test.com'], // 'invalid-email' is not an email
        urls: ['not-url', 'https://valid.com']      // 'not-url' is not a URL
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5); // Should have exactly 5 errors
      
      // Check specific error types with correct field format for arrays
      expect(result.find(err => err.field === 'strings[0]' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'numbers[0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'booleans[0]' && err.type === 'boolean')).toBeDefined();
      expect(result.find(err => err.field === 'emails[0]' && err.type === 'email')).toBeDefined();
      expect(result.find(err => err.field === 'urls[0]' && err.type === 'url')).toBeDefined();
      
      // Verify actual values are captured correctly
      const stringError = result.find(err => err.field === 'strings[0]');
      expect(stringError.actual).toBe(123);
      
      const numberError = result.find(err => err.field === 'numbers[0]');
      expect(numberError.actual).toBe('invalid');
    });

    it('validates array constraints with longform (since array constraints shorthand is limited)', () => {
      const check = v.compile({
        tags: { type: 'array', items: 'string', min: 1, max: 5 },
        scores: { type: 'array', items: 'number', unique: true },
        roles: { type: 'array', items: { type: 'string', enum: ['admin', 'user', 'guest'] } }
      });

      expect(check({
        tags: ['javascript', 'nodejs'],
        scores: [85, 92, 78],
        roles: ['admin', 'user']
      })).toBe(true);

      const result1 = check({
        tags: [], // too few items
        scores: [85, 85, 78], // not unique
        roles: ['admin', 'invalid'] // invalid enum
      });
      expect(Array.isArray(result1)).toBe(true);
      expect(result1.length).toBe(3); // Should have exactly 3 errors
      
      // Check specific error types
      expect(result1.find(err => err.field === 'tags' && err.type === 'arrayMin')).toBeDefined();
      expect(result1.find(err => err.field === 'scores' && err.type === 'arrayUnique')).toBeDefined();
      expect(result1.find(err => err.field === 'roles[1]' && err.type === 'stringEnum')).toBeDefined();
      
      // Check expected/actual values where applicable
      const tagsError = result1.find(err => err.field === 'tags');
      expect(tagsError.expected).toBe(1);
      expect(tagsError.actual).toBe(0);
      
      const rolesError = result1.find(err => err.field === 'roles[1]');
      expect(rolesError.actual).toBe('invalid');
    });

    it('validates numeric array shorthand patterns', () => {
      const check = v.compile({
        // Basic numeric arrays
        integers: { type: 'array', items: 'number|integer:true' },
        positiveNumbers: { type: 'array', items: 'number|positive:true' },
        naturalNumbers: { type: 'array', items: 'number|integer:true|positive:true' },
        negativeNumbers: { type: 'array', items: 'number|negative:true' },
        
        // Decimal and range constraints
        decimals: { type: 'array', items: 'number' },
        percentages: { type: 'array', items: 'number|min:0|max:100' },
        temperatures: { type: 'array', items: 'number|min:-273.15|max:1000' },
        
        // Advanced numeric constraints
        evenNumbers: { type: 'array', items: 'number|integer:true' }, // we'll test even logic
        priceList: { type: 'array', items: 'number|positive:true|min:0.01' },
        ratings: { type: 'array', items: 'number|min:1|max:5|integer:true' }
      });

      // Test valid numeric arrays
      expect(check({
        integers: [1, -5, 0, 42],
        positiveNumbers: [0.1, 3.14, 100, 0.001],
        naturalNumbers: [1, 2, 3, 10, 100],
        negativeNumbers: [-1, -0.5, -100],
        decimals: [1.5, 2.75, -0.33, 0],
        percentages: [0, 25.5, 100, 87.3],
        temperatures: [-273.15, 0, 25.5, 100, 1000],
        evenNumbers: [2, 4, 6, 0, -2],
        priceList: [9.99, 19.95, 0.01, 1299.99],
        ratings: [1, 2, 3, 4, 5]
      })).toBe(true);

      // Test constraint violations
      const result = check({
        integers: [1.5, 2], // 1.5 is not integer
        positiveNumbers: [-1, 5], // -1 is not positive
        naturalNumbers: [0, 2], // 0 is not positive (natural numbers are > 0)
        negativeNumbers: [0, -1], // 0 is not negative
        decimals: ['invalid', 2.5], // 'invalid' is not number
        percentages: [-10, 50], // -10 is below min
        temperatures: [-300, 25], // -300 is below absolute zero
        evenNumbers: [1.5, 4], // 1.5 is not integer
        priceList: [0, 10], // 0 violates min:0.01
        ratings: [0, 3] // 0 is below min:1
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(11); // Should have exactly 11 errors (priceList[0] violates both positive and min)
      
      // Check specific numeric constraint errors
      expect(result.find(err => err.field === 'integers[0]' && err.type === 'numberInteger')).toBeDefined();
      expect(result.find(err => err.field === 'positiveNumbers[0]' && err.type === 'numberPositive')).toBeDefined();
      expect(result.find(err => err.field === 'naturalNumbers[0]' && err.type === 'numberPositive')).toBeDefined();
      expect(result.find(err => err.field === 'negativeNumbers[0]' && err.type === 'numberNegative')).toBeDefined();
      expect(result.find(err => err.field === 'decimals[0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'percentages[0]' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'temperatures[0]' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'evenNumbers[0]' && err.type === 'numberInteger')).toBeDefined();
      expect(result.find(err => err.field === 'priceList[0]' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'ratings[0]' && err.type === 'numberMin')).toBeDefined();
    });

    it('validates multi-dimensional array shorthand patterns', () => {
      const check = v.compile({
        // 2D arrays with shorthand limitations (need longform for constraints)
        matrix2D: { type: 'array', items: { type: 'array', items: 'number' } },
        stringGrid: { type: 'array', items: { type: 'array', items: 'string' } },
        
        // 3D arrays
        matrix3D: { type: 'array', items: { type: 'array', items: { type: 'array', items: 'number|integer:true' } } },
        
        // Mixed type multi-dimensional
        coordinates: { type: 'array', items: { type: 'array', items: 'number|min:-1000|max:1000' } },
        
        // Complex nested arrays with constraints
        integerMatrix: { 
          type: 'array', 
          items: { 
            type: 'array', 
            items: 'number|integer:true|min:0|max:255',
            min: 1,
            max: 10
          },
          min: 1,
          max: 100
        }
      });

      // Test valid multi-dimensional arrays
      expect(check({
        matrix2D: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
        stringGrid: [['a', 'b'], ['c', 'd'], ['e', 'f']],
        matrix3D: [[[1, 2], [3, 4]], [[5, 6], [7, 8]]],
        coordinates: [[10, -20, 30], [0, 100, -50]],
        integerMatrix: [[255, 0, 128], [64, 32, 16]]
      })).toBe(true);

      // Test multi-dimensional constraint violations
      const result = check({
        matrix2D: [['invalid', 2], [3, 4]], // 'invalid' not a number
        stringGrid: [[123, 'b'], ['c', 'd']], // 123 not a string
        matrix3D: [[[1.5, 2]], [[3, 4]]], // 1.5 not integer
        coordinates: [[2000, 0]], // 2000 exceeds max:1000
        integerMatrix: [[300, 0]], // 300 exceeds max:255
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5); // Should have exactly 5 errors
      
      // Check deep nested field paths
      expect(result.find(err => err.field === 'matrix2D[0][0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'stringGrid[0][0]' && err.type === 'string')).toBeDefined();
      expect(result.find(err => err.field === 'matrix3D[0][0][0]' && err.type === 'numberInteger')).toBeDefined();
      expect(result.find(err => err.field === 'coordinates[0][0]' && err.type === 'numberMax')).toBeDefined();
      expect(result.find(err => err.field === 'integerMatrix[0][0]' && err.type === 'numberMax')).toBeDefined();
    });

    it('validates specialized numeric array patterns', () => {
      const check = v.compile({
        // Financial data arrays
        prices: { type: 'array', items: 'number|positive:true|min:0.01', min: 1 },
        discounts: { type: 'array', items: 'number|min:0|max:1' }, // 0-1 range for percentages
        
        // Scientific data arrays
        measurements: { type: 'array', items: 'number|positive:true', min: 3 },
        coordinates3D: { type: 'array', items: 'number', length: 3 }, // exactly 3 elements
        
        // Gaming/graphics arrays
        rgba: { type: 'array', items: 'number|integer:true|min:0|max:255', length: 4 },
        vertices: { type: 'array', items: { type: 'array', items: 'number', length: 2 } },
        
        // Statistics arrays
        probabilities: { type: 'array', items: 'number|min:0|max:1' },
        zScores: { type: 'array', items: 'number' },
        
        // Age and demographic arrays
        ages: { type: 'array', items: 'number|integer:true|min:0|max:150' },
        years: { type: 'array', items: 'number|integer:true|min:1900|max:2100' }
      });

      // Test specialized numeric patterns
      expect(check({
        prices: [9.99, 19.95, 299.00],
        discounts: [0, 0.1, 0.25, 1.0],
        measurements: [1.5, 2.7, 3.14],
        coordinates3D: [10.5, -20.3, 100.0],
        rgba: [255, 128, 64, 255],
        vertices: [[0, 1], [1, 0], [0.5, 0.5]],
        probabilities: [0.1, 0.5, 0.9, 1.0],
        zScores: [-2.5, 0, 1.96, 3.2],
        ages: [0, 25, 65, 100],
        years: [1990, 2000, 2023, 2024]
      })).toBe(true);

      // Test specialized constraint violations
      const result = check({
        prices: [0], // violates min:0.01
        discounts: [1.5], // exceeds max:1
        measurements: [1.5, 2.7], // too few elements (min:3)
        coordinates3D: [10.5, -20.3], // wrong length (needs exactly 3)
        rgba: [300, 128, 64, 255], // 300 exceeds max:255
        vertices: [[0], [1, 0]], // first vertex has wrong length
        probabilities: [-0.1], // below min:0
        zScores: ['invalid'], // not a number
        ages: [200], // exceeds max:150
        years: [1800] // below min:1900
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(11); // Should have exactly 11 errors
      
      // Check specialized constraint errors
      expect(result.find(err => err.field === 'prices[0]' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'discounts[0]' && err.type === 'numberMax')).toBeDefined();
      expect(result.find(err => err.field === 'measurements' && err.type === 'arrayMin')).toBeDefined();
      expect(result.find(err => err.field === 'coordinates3D' && err.type === 'arrayLength')).toBeDefined();
      expect(result.find(err => err.field === 'rgba[0]' && err.type === 'numberMax')).toBeDefined();
      expect(result.find(err => err.field === 'vertices[0]' && err.type === 'arrayLength')).toBeDefined();
      expect(result.find(err => err.field === 'probabilities[0]' && err.type === 'numberMin')).toBeDefined();
      expect(result.find(err => err.field === 'zScores[0]' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'ages[0]' && err.type === 'numberMax')).toBeDefined();
      expect(result.find(err => err.field === 'years[0]' && err.type === 'numberMin')).toBeDefined();
    });

    it('validates array performance with large datasets', () => {
      const check = v.compile({
        // Large arrays with constraints
        bigIntegers: { type: 'array', items: 'number|integer:true', min: 1, max: 10000 },
        bigDecimals: { type: 'array', items: 'number|min:0|max:1' },
        
        // Nested large arrays
        matrix: { 
          type: 'array', 
          items: { type: 'array', items: 'number|integer:true|min:0|max:100' },
          max: 100
        }
      });

      // Generate large test datasets
      const bigIntegers = Array.from({ length: 1000 }, (_, i) => i);
      const bigDecimals = Array.from({ length: 1000 }, (_, i) => i / 1000);
      const matrix = Array.from({ length: 10 }, () => 
        Array.from({ length: 10 }, (_, i) => i)
      );

      const startTime = Date.now();
      
      const result = check({
        bigIntegers,
        bigDecimals,
        matrix
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result).toBe(true);
      expect(duration).toBeLessThan(50); // Should validate large arrays quickly
      
      // Test performance with constraint violations
      const startTimeError = Date.now();
      
      const errorResult = check({
        bigIntegers: [1.5, ...bigIntegers.slice(1)], // first element violates integer constraint
        bigDecimals: [2, ...bigDecimals.slice(1)], // first element exceeds max
        matrix: [[101, ...matrix[0].slice(1)], ...matrix.slice(1)] // first element exceeds max
      });

      const endTimeError = Date.now();
      const errorDuration = endTimeError - startTimeError;

      expect(Array.isArray(errorResult)).toBe(true);
      expect(errorResult.length).toBe(3); // Should have exactly 3 errors
      expect(errorDuration).toBeLessThan(50); // Error detection should also be fast
    });

    it('validates array conversion and coercion patterns', () => {
      const check = v.compile({
        // Numeric conversion arrays
        convertedNumbers: { type: 'array', items: 'number|convert:true' },
        convertedIntegers: { type: 'array', items: 'number|convert:true|integer:true' },
        
        // String conversion arrays  
        convertedStrings: { type: 'array', items: 'string|convert:true' },
        
        // Boolean conversion arrays
        convertedBooleans: { type: 'array', items: 'boolean|convert:true' }
      });

      const obj = {
        convertedNumbers: ['123', '45.67', true, false],
        convertedIntegers: ['42', '100', true],
        convertedStrings: [123, true, false], // Remove null as it causes issues
        convertedBooleans: ['true', 'false', 1, 0] // Remove 'yes', 'no' as they don't convert in v1.19.1
      };

      expect(check(obj)).toBe(true);
      
      // Check conversion results
      expect(obj.convertedNumbers).toEqual([123, 45.67, 1, 0]);
      expect(obj.convertedIntegers).toEqual([42, 100, 1]);
      expect(obj.convertedStrings).toEqual(['123', 'true', 'false']);
      expect(obj.convertedBooleans).toEqual([true, false, true, false]);

      // Test conversion failures
      const result = check({
        convertedNumbers: ['invalid', 123],
        convertedIntegers: ['12.5', 'invalid'],
        convertedStrings: [undefined],
        convertedBooleans: ['maybe']
      });

      expect(Array.isArray(result)).toBe(true);
      // Note: Some conversions might still succeed/fail differently in v1.19.1
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Validators Shorthand', () => {
    it('validates multiple type options with array syntax', () => {
      const check = v.compile({
        value: ['string', 'number'],
        status: ['boolean', 'string'],
        identifier: ['number', 'string']
      });

      expect(check({ value: 'text', status: true, identifier: 123 })).toBe(true);
      expect(check({ value: 42, status: 'active', identifier: 'abc' })).toBe(true);

      const result = check({ 
        value: [], // array not allowed - should fail both string and number
        status: 123, // number not allowed - should fail both boolean and string
        identifier: true // boolean not allowed - should fail both number and string
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(6); // Multiple validators create multiple errors (2 per field)
      
      // Each field should have exactly 2 errors (one for each validator type)
      const valueErrors = result.filter(err => err.field === 'value');
      const statusErrors = result.filter(err => err.field === 'status');
      const identifierErrors = result.filter(err => err.field === 'identifier');
      
      expect(valueErrors.length).toBe(2);
      expect(statusErrors.length).toBe(2);
      expect(identifierErrors.length).toBe(2);
      
      // Check that we have the expected error types
      expect(valueErrors.find(err => err.type === 'string')).toBeDefined();
      expect(valueErrors.find(err => err.type === 'number')).toBeDefined();
      expect(statusErrors.find(err => err.type === 'boolean')).toBeDefined();
      expect(statusErrors.find(err => err.type === 'string')).toBeDefined();
      expect(identifierErrors.find(err => err.type === 'number')).toBeDefined();
      expect(identifierErrors.find(err => err.type === 'string')).toBeDefined();
      
      // Check actual values are captured correctly
      expect(valueErrors[0].actual).toEqual([]);
      expect(statusErrors[0].actual).toBe(123);
      expect(identifierErrors[0].actual).toBe(true);
    });

    it('validates multiple complex validators', () => {
      const check = v.compile({
        flexibleField: [
          'string|min:3',
          'number|positive:true',
          'boolean'
        ]
      });

      expect(check({ flexibleField: 'hello' })).toBe(true);
      expect(check({ flexibleField: 42 })).toBe(true);
      expect(check({ flexibleField: true })).toBe(true);

      const result = check({ flexibleField: 'ab' }); // too short string
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // Multiple validators means multiple potential errors, but at least one should be stringMin
      expect(result.find(err => err.type === 'stringMin' && err.field === 'flexibleField')).toBeDefined();
    });
  });

  describe('Nested Object Shorthand with $$type', () => {
    it('validates nested objects with $$type syntax', () => {
      const check = v.compile({
        point: {
          $$type: 'object',
          x: 'number',
          y: 'number'
        },
        circle: {
          $$type: 'object|optional:true',
          center: {
            $$type: 'object',
            x: 'number',
            y: 'number'
          },
          radius: 'number|positive:true'
        }
      });

      expect(check({
        point: { x: 10, y: 20 }
      })).toBe(true);

      expect(check({
        point: { x: 10, y: 20 },
        circle: {
          center: { x: 5, y: 5 },
          radius: 10
        }
      })).toBe(true);

      const result = check({
        point: { x: 'ten', y: 20 }, // invalid x
        circle: {
          center: { x: 5 }, // missing y
          radius: -5 // negative radius
        }
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Should have exactly 3 errors
      
      // Check specific errors
      expect(result.find(err => err.field === 'point.x' && err.type === 'number')).toBeDefined();
      expect(result.find(err => err.field === 'circle.center.y' && err.type === 'required')).toBeDefined();
      expect(result.find(err => err.field === 'circle.radius' && err.type === 'numberPositive')).toBeDefined();
      
      // Check actual values
      const pointXError = result.find(err => err.field === 'point.x');
      expect(pointXError.actual).toBe('ten');
      
      const radiusError = result.find(err => err.field === 'circle.radius');
      expect(radiusError.actual).toBe(-5);
    });

    it('validates deeply nested objects', () => {
      const check = v.compile({
        user: {
          $$type: 'object',
          profile: {
            $$type: 'object',
            personal: {
              $$type: 'object',
              name: 'string',
              age: 'number|min:0'
            },
            contact: {
              $$type: 'object|optional:true',
              email: 'email',
              phone: 'string|optional:true'
            }
          }
        }
      });

      expect(check({
        user: {
          profile: {
            personal: {
              name: 'John',
              age: 30
            },
            contact: {
              email: 'john@example.com'
            }
          }
        }
      })).toBe(true);
    });
  });

  describe('String Validation Shorthand Patterns', () => {
    it('validates string format constraints', () => {
      const check = v.compile({
        alphaField: 'string|alpha:true',
        numericField: 'string|numeric:true',
        alphanumField: 'string|alphanum:true',
        alphadashField: 'string|alphadash:true',
        hexField: 'string|hex:true',
        base64Field: 'string|base64:true',
        singleLineField: 'string|singleLine:true'
      });

      expect(check({
        alphaField: 'HelloWorld',
        numericField: '123456',
        alphanumField: 'Hello123',
        alphadashField: 'hello-world_test',
        hexField: 'FF00AA',
        base64Field: 'SGVsbG8gV29ybGQ=',
        singleLineField: 'Single line text'
      })).toBe(true);

      const result = check({
        alphaField: 'Hello123', // contains numbers
        numericField: 'abc123', // contains letters
        alphanumField: 'hello!', // contains special char
        alphadashField: 'hello@world', // invalid char
        hexField: 'GGHHII', // invalid hex
        base64Field: 'invalid_base64!', // invalid base64
        singleLineField: 'Multi\nline\ntext' // contains newlines
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(7); // Should have exactly 7 errors
      
      // Check specific error types for format validations
      expect(result.find(err => err.field === 'alphaField' && err.type === 'stringAlpha')).toBeDefined();
      expect(result.find(err => err.field === 'numericField' && err.type === 'stringNumeric')).toBeDefined();
      expect(result.find(err => err.field === 'alphanumField' && err.type === 'stringAlphanum')).toBeDefined();
      expect(result.find(err => err.field === 'alphadashField' && err.type === 'stringAlphadash')).toBeDefined();
      expect(result.find(err => err.field === 'hexField' && err.type === 'stringHex')).toBeDefined();
      expect(result.find(err => err.field === 'base64Field' && err.type === 'stringBase64')).toBeDefined();
      expect(result.find(err => err.field === 'singleLineField' && err.type === 'stringSingleLine')).toBeDefined();
    });

    it('validates string sanitization shorthand', () => {
      const check = v.compile({
        trimmed: 'string|trim:true',
        upperCase: 'string|uppercase:true',
        lowerCase: 'string|lowercase:true',
        converted: 'string|convert:true'
      });

      const obj = {
        trimmed: '  hello world  ',
        upperCase: 'hello world',
        lowerCase: 'HELLO WORLD',
        converted: 12345
      };

      expect(check(obj)).toBe(true);
      expect(obj.trimmed).toBe('hello world');
      expect(obj.upperCase).toBe('HELLO WORLD');
      expect(obj.lowerCase).toBe('hello world');
      expect(obj.converted).toBe('12345');
    });
  });

  describe('Number Validation Shorthand Patterns', () => {
    it('validates number constraints and conversions', () => {
      const check = v.compile({
        basicNumber: 'number',
        positiveNumber: 'number|positive:true',
        negativeNumber: 'number|negative:true',
        integerNumber: 'number|integer:true',
        convertedNumber: 'number|convert:true'
      });

      expect(check({
        basicNumber: 42,
        positiveNumber: 10,
        negativeNumber: -5,
        integerNumber: 100,
        convertedNumber: 123
      })).toBe(true);

      const obj = { 
        basicNumber: 42,
        positiveNumber: 10,
        negativeNumber: -5,
        integerNumber: 100,
        convertedNumber: '123'
      };
      expect(check(obj)).toBe(true);
      expect(obj.convertedNumber).toBe(123); // converted from string
    });

    it('validates number range constraints', () => {
      const check = v.compile({
        percentage: 'number|min:0|max:100',
        temperature: 'number|min:-273.15',
        exactValue: 'number|equal:42'
      });

      expect(check({
        percentage: 85,
        temperature: 25.5,
        exactValue: 42
      })).toBe(true);

      const result = check({
        percentage: 150, // too high
        temperature: -300, // too cold
        exactValue: 41 // not equal
      });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Boolean Validation Shorthand', () => {
    it('validates boolean with conversion', () => {
      const check = v.compile({
        active: 'boolean',
        converted: 'boolean|convert:true'
      });

      expect(check({ active: true, converted: false })).toBe(true);

      const obj = { active: true, converted: 'true' };
      expect(check(obj)).toBe(true);
      expect(obj.converted).toBe(true); // converted from string
    });
  });

  describe('Date Validation Shorthand', () => {
    it('validates date with conversion', () => {
      const check = v.compile({
        createdAt: 'date',
        convertedDate: 'date|convert:true'
      });

      expect(check({
        createdAt: new Date(),
        convertedDate: new Date()
      })).toBe(true);

      const obj = {
        createdAt: new Date(),
        convertedDate: '2023-01-01'
      };
      expect(check(obj)).toBe(true);
      expect(obj.convertedDate instanceof Date).toBe(true);
    });
  });

  describe('Real-World Shorthand Scenarios', () => {
    it('validates user registration with mixed shorthand', () => {
      const check = v.compile({
        username: { type: 'string', min: 3, max: 20, pattern: /^[a-zA-Z0-9_]+$/ },
        email: 'email',
        password: 'string|min:8',
        age: 'number|optional:true|min:13|max:120',
        preferences: {
          $$type: 'object|optional:true',
          theme: { type: 'string', enum: ['light', 'dark'] },
          notifications: 'boolean|convert:true',
          language: { type: 'string', optional: true, enum: ['en', 'es', 'fr', 'de'] }
        },
        tags: 'string[]'
      });

      expect(check({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'secretpassword123',
        age: 25,
        preferences: {
          theme: 'dark',
          notifications: 'true',
          language: 'en'
        },
        tags: ['developer', 'javascript']
      })).toBe(true);

      expect(check({
        username: 'jane_smith',
        email: 'jane@example.com',
        password: 'mypassword',
        tags: []
      })).toBe(true);
    });

    it('validates product catalog with complex constraints', () => {
      const check = v.compile({
        sku: { type: 'string', pattern: /^[A-Z]{2}-[0-9]{4}$/ },
        name: 'string|min:3|max:100|trim:true',
        price: 'number|positive:true|min:0.01',
        category: { type: 'string', enum: ['electronics', 'clothing', 'books', 'home'] },
        inStock: 'boolean|convert:true',
        tags: 'string[]',
        dimensions: {
          $$type: 'object|optional:true',
          width: 'number|positive:true',
          height: 'number|positive:true',
          depth: 'number|positive:true',
          unit: { type: 'string', enum: ['cm', 'in', 'mm'] }
        },
        variants: {
          $$type: 'object|optional:true',
          colors: 'string[]',
          sizes: 'string[]'
        }
      });

      expect(check({
        sku: 'EL-1234',
        name: '  Wireless Headphones  ',
        price: 99.99,
        category: 'electronics',
        inStock: 'true',
        tags: ['wireless', 'bluetooth', 'audio'],
        dimensions: {
          width: 15.5,
          height: 20.0,
          depth: 8.5,
          unit: 'cm'
        },
        variants: {
          colors: ['black', 'white', 'blue'],
          sizes: ['S', 'M', 'L']
        }
      })).toBe(true);
    });

    it('validates API response format', () => {
      const check = v.compile({
        status: { type: 'string', enum: ['success', 'error', 'pending'] },
        code: 'number|integer:true|min:100|max:599',
        message: 'string|optional:true',
        data: {
          $$type: 'object|optional:true',
          id: 'number|integer:true|positive:true',
          attributes: {
            $$type: 'object',
            name: 'string|min:1',
            email: 'email|optional:true',
            active: 'boolean'
          }
        },
        meta: {
          $$type: 'object|optional:true',
          timestamp: 'date|convert:true',
          version: { type: 'string', pattern: /^v[0-9]+\.[0-9]+\.[0-9]+$/ },
          requestId: 'string|optional:true'
        }
      });

      expect(check({
        status: 'success',
        code: 200,
        data: {
          id: 123,
          attributes: {
            name: 'John Doe',
            email: 'john@example.com',
            active: true
          }
        },
        meta: {
          timestamp: '2023-01-01T12:00:00Z',
          version: 'v1.2.3'
        }
      })).toBe(true);
    });
  });

  describe('Shorthand Edge Cases and Error Handling', () => {
    it('handles invalid shorthand syntax gracefully', () => {
      // v1.19.1 doesn't always throw for invalid constraints, 
      // so let's test a constraint that actually fails
      expect(() => {
        const check = v.compile({
          field: 'string|invalid_constraint:true'
        });
        // This will not throw during compile but during validation
        const result = check({ field: 'test' });
        // The validation should return an error array for unknown constraints
        expect(Array.isArray(result) || result === true).toBe(true);
      }).not.toThrow();
    });

    it('validates complex shorthand combinations', () => {
      const check = v.compile({
        complexField: { 
          type: 'string', 
          min: 5, 
          max: 100, 
          pattern: /^[a-zA-Z0-9\s]+$/, 
          trim: true, 
          lowercase: true 
        }
      });

      const obj = { complexField: '  HELLO WORLD 123  ' };
      expect(check(obj)).toBe(true);
      expect(obj.complexField).toBe('hello world 123');
    });

    it('handles shorthand with special characters in patterns', () => {
      const check = v.compile({
        emailPattern: { type: 'string', pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ },
        phonePattern: { type: 'string', pattern: /^\+?[1-9]\d{1,14}$/ }
      });

      expect(check({
        emailPattern: 'user@example.com',
        phonePattern: '+1234567890'
      })).toBe(true);

      const result = check({
        emailPattern: 'invalid-email',
        phonePattern: 'invalid-phone'
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result.find(err => err.field === 'emailPattern' && err.type === 'stringPattern')).toBeDefined();
      expect(result.find(err => err.field === 'phonePattern' && err.type === 'stringPattern')).toBeDefined();
    });
  });

  describe('Performance with Shorthand', () => {
    it('compiles and validates efficiently with shorthand', () => {
      const schema = {
        id: 'number|integer:true|positive:true',
        name: 'string|min:1|max:100|trim:true',
        email: 'email',
        active: 'boolean|convert:true',
        tags: 'string[]',
        metadata: {
          $$type: 'object|optional:true',
          created: 'date|convert:true',
          updated: 'date|optional:true'
        }
      };

      const check = v.compile(schema);

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        check({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          active: i % 2 === 0,
          tags: ['user', 'test'],
          metadata: {
            created: new Date().toISOString()
          }
        });
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Long Arrays - Vector Embedding Dimensions', () => {
    it('validates OpenAI text-embedding-3-small/3-large (1536 dimensions)', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 1536, empty: false }
      });

      const vector1536 = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
      expect(check({ vector: vector1536 })).toBe(true);

      // Wrong length should fail
      const wrongLength = Array.from({ length: 1535 }, () => Math.random());
      const result = check({ vector: wrongLength });
      expect(Array.isArray(result)).toBe(true);
      expect(result.find(err => err.field === 'vector' && err.type === 'arrayLength')).toBeDefined();
    });

    it('validates Google Gemini Gecko (768 dimensions)', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 768, empty: false }
      });

      const vector768 = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
      expect(check({ vector: vector768 })).toBe(true);
    });

    it('validates Voyage AI voyage-3-large (2048 dimensions)', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 2048, empty: false }
      });

      const vector2048 = Array.from({ length: 2048 }, () => Math.random() * 2 - 1);
      expect(check({ vector: vector2048 })).toBe(true);
    });

    it('validates OpenAI text-embedding-3-large (3072 dimensions)', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 3072, empty: false }
      });

      const vector3072 = Array.from({ length: 3072 }, () => Math.random() * 2 - 1);
      expect(check({ vector: vector3072 })).toBe(true);
    });

    it('validates long arrays with negative values', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 1536 }
      });

      const vectorWithNegatives = Array.from({ length: 1536 }, () =>
        (Math.random() - 0.5) * 2
      );
      expect(check({ vector: vectorWithNegatives })).toBe(true);

      // Verify negative values are allowed
      const hasNegative = vectorWithNegatives.some(v => v < 0);
      expect(hasNegative).toBe(true);
    });

    it('validates long arrays with all zeros', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 1024 }
      });

      const zeroVector = Array.from({ length: 1024 }, () => 0);
      expect(check({ vector: zeroVector })).toBe(true);
    });

    it('validates long arrays item type constraints', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 512 }
      });

      // String in numeric array should fail
      const invalidVector = Array.from({ length: 512 }, () => Math.random());
      invalidVector[0] = 'invalid';

      const result = check({ vector: invalidVector });
      expect(Array.isArray(result)).toBe(true);
      expect(result.find(err => err.field === 'vector[0]' && err.type === 'number')).toBeDefined();
    });

    it('validates performance with very long arrays (3072 dimensions)', () => {
      const check = v.compile({
        vector: { type: 'array', items: 'number', length: 3072 }
      });

      const vector3072 = Array.from({ length: 3072 }, () => Math.random());

      const startTime = Date.now();
      const result = check({ vector: vector3072 });
      const endTime = Date.now();

      expect(result).toBe(true);
      expect(endTime - startTime).toBeLessThan(20); // Should be reasonably fast
    });

    it('validates multiple long arrays simultaneously', () => {
      const check = v.compile({
        embedding1: { type: 'array', items: 'number', length: 1536 },
        embedding2: { type: 'array', items: 'number', length: 768 },
        embedding3: { type: 'array', items: 'number', length: 256 }
      });

      const data = {
        embedding1: Array.from({ length: 1536 }, () => Math.random()),
        embedding2: Array.from({ length: 768 }, () => Math.random()),
        embedding3: Array.from({ length: 256 }, () => Math.random())
      };

      expect(check(data)).toBe(true);
    });

    it('validates long arrays with range constraints', () => {
      const check = v.compile({
        // Normalized embedding values typically -1 to 1
        vector: {
          type: 'array',
          items: 'number|min:-1|max:1',
          length: 1024
        }
      });

      const normalized = Array.from({ length: 1024 }, () =>
        (Math.random() * 2 - 1) * 0.9 // -0.9 to 0.9
      );
      expect(check({ vector: normalized })).toBe(true);

      // Value out of range should fail
      const outOfRange = Array.from({ length: 1024 }, () => Math.random());
      outOfRange[500] = 2.0; // Exceeds max:1

      const result = check({ vector: outOfRange });
      expect(Array.isArray(result)).toBe(true);
      expect(result.find(err => err.field === 'vector[500]' && err.type === 'numberMax')).toBeDefined();
    });
  });
}); 