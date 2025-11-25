/**
 * Code Samples Generator
 *
 * Generates code examples in multiple languages for API endpoints
 */

export class CodeSamplesGenerator {
  /**
   * Generate code samples for a route
   * @param {Object} route - Route metadata
   * @param {string} baseUrl - API base URL
   * @returns {Object} Code samples by language
   */
  static generate(route, baseUrl = 'https://api.example.com') {
    const { method, path, requestSchema, responseSchema } = route;
    const url = `${baseUrl}${path}`;

    // Generate example request body from schema
    const exampleBody = requestSchema ? this.generateExampleFromSchema(requestSchema) : null;
    const exampleResponse = responseSchema ? this.generateExampleFromSchema(responseSchema) : null;

    return {
      curl: this.generateCurl(method, url, exampleBody, route),
      nodejs: this.generateNodeJS(method, url, exampleBody, route),
      javascript: this.generateJavaScript(method, url, exampleBody, route),
      python: this.generatePython(method, url, exampleBody, route),
      php: this.generatePHP(method, url, exampleBody, route),
      go: this.generateGo(method, url, exampleBody, route),
      response: exampleResponse
    };
  }

  /**
   * Generate example data from OpenAPI schema
   */
  static generateExampleFromSchema(schema) {
    if (!schema || typeof schema !== 'object') return null;

    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    switch (schema.type) {
      case 'object':
        return this.generateObjectExample(schema);
      case 'array':
        return this.generateArrayExample(schema);
      case 'string':
        return this.generateStringExample(schema);
      case 'number':
      case 'integer':
        return this.generateNumberExample(schema);
      case 'boolean':
        return schema.default !== undefined ? schema.default : true;
      default:
        return null;
    }
  }

  static generateObjectExample(schema) {
    const obj = {};
    const properties = schema.properties || {};
    const required = schema.required || [];

    // Generate required fields first
    for (const key of required) {
      if (properties[key]) {
        obj[key] = this.generateExampleFromSchema(properties[key]);
      }
    }

    // Add optional fields for completeness
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!obj.hasOwnProperty(key)) {
        obj[key] = this.generateExampleFromSchema(propSchema);
      }
    }

    return obj;
  }

  static generateArrayExample(schema) {
    const items = schema.items || { type: 'string' };
    const minItems = schema.minItems || 1;
    const maxItems = Math.min(schema.maxItems || 3, 3); // Max 3 examples
    const count = Math.max(minItems, Math.min(maxItems, 2));

    return Array.from({ length: count }, () => this.generateExampleFromSchema(items));
  }

  static generateStringExample(schema) {
    if (schema.enum) return schema.enum[0];

    const format = schema.format;
    const examples = {
      'email': 'user@example.com',
      'uri': 'https://example.com',
      'url': 'https://example.com',
      'uuid': '123e4567-e89b-12d3-a456-426614174000',
      'date-time': new Date().toISOString(),
      'date': new Date().toISOString().split('T')[0],
      'ipv4': '192.168.1.1',
      'ipv6': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      'password': '********'
    };

    if (format && examples[format]) return examples[format];

    // Generate based on constraints
    const minLength = schema.minLength || 3;
    const maxLength = schema.maxLength || 20;
    const length = Math.min(Math.max(minLength, 10), maxLength);

    if (schema.pattern) {
      // Try to generate from pattern (simplified)
      if (schema.pattern === '^[A-Z]{3}$') return 'ABC';
      if (schema.pattern.includes('[A-Z]')) return 'Example';
    }

    return 'example'.padEnd(length, 'x').substring(0, length);
  }

  static generateNumberExample(schema) {
    if (schema.enum) return schema.enum[0];

    const min = schema.minimum ?? 0;
    const max = schema.maximum ?? 100;
    const isInteger = schema.type === 'integer';

    const value = min + (max - min) / 2;
    return isInteger ? Math.round(value) : value;
  }

  /**
   * Generate cURL example
   */
  static generateCurl(method, url, body, route) {
    const lines = [`curl -X ${method} '${url}'`];

    lines.push(`  -H 'Content-Type: application/json'`);

    // Add auth header example if route has guards
    if (route.guards && route.guards.length > 0) {
      lines.push(`  -H 'Authorization: Bearer YOUR_TOKEN'`);
    }

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      const bodyStr = JSON.stringify(body, null, 2).split('\n').join('\n    ');
      lines.push(`  -d '${bodyStr}'`);
    }

    return lines.join(' \\\n');
  }

  /**
   * Generate Node.js example (native fetch)
   */
  static generateNodeJS(method, url, body, route) {
    const hasBody = body && ['POST', 'PUT', 'PATCH'].includes(method);
    const hasAuth = route.guards && route.guards.length > 0;

    return `const response = await fetch('${url}', {
  method: '${method}',
  headers: {
    'Content-Type': 'application/json'${hasAuth ? ",\n    'Authorization': 'Bearer YOUR_TOKEN'" : ''}
  }${hasBody ? `,
  body: JSON.stringify(${JSON.stringify(body, null, 4).split('\n').join('\n    ')})` : ''}
});

const data = await response.json();
console.log(data);`;
  }

  /**
   * Generate JavaScript example (browser)
   */
  static generateJavaScript(method, url, body, route) {
    const hasBody = body && ['POST', 'PUT', 'PATCH'].includes(method);
    const hasAuth = route.guards && route.guards.length > 0;

    return `fetch('${url}', {
  method: '${method}',
  headers: {
    'Content-Type': 'application/json'${hasAuth ? ",\n    'Authorization': 'Bearer YOUR_TOKEN'" : ''}
  }${hasBody ? `,
  body: JSON.stringify(${JSON.stringify(body, null, 4).split('\n').join('\n    ')})` : ''}
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`;
  }

  /**
   * Generate Python example
   */
  static generatePython(method, url, body, route) {
    const hasBody = body && ['POST', 'PUT', 'PATCH'].includes(method);
    const hasAuth = route.guards && route.guards.length > 0;

    return `import requests

url = '${url}'
headers = {
    'Content-Type': 'application/json'${hasAuth ? ",\n    'Authorization': 'Bearer YOUR_TOKEN'" : ''}
}${hasBody ? `
data = ${JSON.stringify(body, null, 4).split('\n').join('\n       ')}

response = requests.${method.toLowerCase()}(url, headers=headers, json=data)` : `

response = requests.${method.toLowerCase()}(url, headers=headers)`}
print(response.json())`;
  }

  /**
   * Generate PHP example
   */
  static generatePHP(method, url, body, route) {
    const hasBody = body && ['POST', 'PUT', 'PATCH'].includes(method);
    const hasAuth = route.guards && route.guards.length > 0;

    return `<?php
$url = '${url}';
$headers = [
    'Content-Type: application/json'${hasAuth ? ",\n    'Authorization: Bearer YOUR_TOKEN'" : ''}
];
${hasBody ? `
$data = ${JSON.stringify(body, null, 4).split('\n').map(line => '    ' + line).join('\n')};

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method}');
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
curl_close($ch);

echo $response;` : `
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method}');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
curl_close($ch);

echo $response;`}
?>`;
  }

  /**
   * Generate Go example
   */
  static generateGo(method, url, body, route) {
    const hasBody = body && ['POST', 'PUT', 'PATCH'].includes(method);
    const hasAuth = route.guards && route.guards.length > 0;

    return `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
)

func main() {
    url := "${url}"
    ${hasBody ? `
    data := map[string]interface{}${JSON.stringify(body, null, 8).split('\n').join('\n    ')}

    jsonData, _ := json.Marshal(data)
    req, _ := http.NewRequest("${method}", url, bytes.NewBuffer(jsonData))` : `
    req, _ := http.NewRequest("${method}", url, nil)`}

    req.Header.Set("Content-Type", "application/json")${hasAuth ? `
    req.Header.Set("Authorization", "Bearer YOUR_TOKEN")` : ''}

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`;
  }

  /**
   * Generate all possible error responses for a route
   */
  static generateErrorResponses(route) {
    const errors = [];

    // 400 - Bad Request
    if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
      errors.push({
        status: 400,
        code: 'BAD_REQUEST',
        description: 'Invalid request format or missing required fields',
        example: {
          success: false,
          error: {
            message: 'Invalid request',
            code: 'BAD_REQUEST',
            status: 400
          }
        }
      });
    }

    // 401 - Unauthorized
    if (route.guards && route.guards.length > 0) {
      errors.push({
        status: 401,
        code: 'UNAUTHORIZED',
        description: 'Missing or invalid authentication token',
        example: {
          success: false,
          error: {
            message: 'Authentication required',
            code: 'UNAUTHORIZED',
            status: 401
          }
        }
      });
    }

    // 403 - Forbidden
    if (route.guards && route.guards.length > 0) {
      errors.push({
        status: 403,
        code: 'FORBIDDEN',
        description: 'Insufficient permissions to access this resource',
        example: {
          success: false,
          error: {
            message: 'Access denied',
            code: 'FORBIDDEN',
            status: 403
          }
        }
      });
    }

    // 404 - Not Found
    if (['GET', 'PUT', 'PATCH', 'DELETE'].includes(route.method) && route.path.includes(':id')) {
      errors.push({
        status: 404,
        code: 'NOT_FOUND',
        description: 'Resource not found with the provided ID',
        example: {
          success: false,
          error: {
            message: 'Resource not found',
            code: 'NOT_FOUND',
            status: 404
          }
        }
      });
    }

    // 422 - Validation Error
    if (route.requestSchema) {
      const validationExample = this.generateValidationErrorExample(route.requestSchema);
      errors.push({
        status: 422,
        code: 'VALIDATION_ERROR',
        description: 'Request validation failed',
        example: validationExample
      });
    }

    // 500 - Internal Server Error
    errors.push({
      status: 500,
      code: 'INTERNAL_ERROR',
      description: 'An unexpected error occurred on the server',
      example: {
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          status: 500
        }
      }
    });

    return errors;
  }

  /**
   * Generate validation error example from schema
   */
  static generateValidationErrorExample(schema) {
    const errors = [];

    if (schema.properties) {
      const required = schema.required || [];

      // Example: missing required field
      if (required.length > 0) {
        errors.push({
          field: required[0],
          message: `The '${required[0]}' field is required.`,
          type: 'required'
        });
      }

      // Example: invalid format
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.format === 'email') {
          errors.push({
            field: key,
            message: `The '${key}' field must be a valid email address.`,
            type: 'email',
            expected: 'user@example.com',
            actual: 'invalid-email'
          });
          break;
        }
      }
    }

    return {
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        status: 422,
        details: errors.length > 0 ? errors : [
          {
            field: 'example',
            message: 'Validation constraint not met',
            type: 'validation'
          }
        ]
      }
    };
  }
}
