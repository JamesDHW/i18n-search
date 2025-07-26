# Translation Parser Module

This module provides a robust, type-safe parser for translation files using TypeScript's compiler API.

## Features

- **AST-based parsing**: Uses TypeScript's compiler API to safely parse translation files
- **No runtime evaluation**: Eliminates security risks from `eval()` or `Function()` calls
- **Strong typing**: Provides comprehensive TypeScript interfaces for all data structures
- **Error handling**: Detailed error reporting with line and column information
- **Validation**: Built-in validation for common translation file issues
- **Support for complex structures**: Handles nested objects, special characters, and various export patterns

## Usage

```typescript
import { TranslationParser } from './parser';

const parser = new TranslationParser(logger);
const parsed = await parser.parseTranslationFile('./src/i18n/en.ts');

// Access the parsed data
const { valueToKeys, keyToValue, errors } = parsed;

// Validate the file
const validation = parser.validateTranslationFile(parsed);
```

## Data Structures

### TranslationMap
```typescript
interface TranslationMap {
  [value: string]: string[]; // Maps translation values to their keys
}
```

### TranslationKeyMap
```typescript
interface TranslationKeyMap {
  [key: string]: string; // Maps translation keys to their values
}
```

### ParsedTranslationFile
```typescript
interface ParsedTranslationFile {
  valueToKeys: TranslationMap;
  keyToValue: TranslationKeyMap;
  errors: ParseError[];
}
```

## Supported Translation File Formats

The parser supports translation files that export a default object:

```typescript
// Simple flat structure
export default {
  hello: "Hello World",
  welcome: "Welcome"
};

// Nested structure
export default {
  common: {
    hello: "Hello World",
    welcome: "Welcome"
  },
  navigation: {
    home: "Home",
    about: "About"
  }
};

// With comments and special characters
export default {
  greeting: "Hello & World",
  message: 'Single quotes and "double quotes"',
  unicode: "Café & résumé"
};
```

## Error Handling

The parser provides detailed error information:

```typescript
interface ParseError {
  message: string;
  line?: number;
  column?: number;
}
```

Common error scenarios:
- Missing default export
- Invalid property assignments
- Unsupported syntax (spread operators, computed properties, etc.)
- File not found or unreadable

## Validation

The parser includes built-in validation for common issues:

- **Duplicate values**: Warns when the same translation value is used for multiple keys
- **Empty values**: Warns about empty translation strings
- **Long values**: Warns about very long translation strings (>200 characters)

## Security

- No runtime code evaluation
- AST-based parsing prevents injection attacks
- Type-safe interfaces prevent runtime errors
- Comprehensive error handling

## Performance

- Single-pass AST traversal
- Efficient memory usage
- Cached parsing results
- Minimal dependencies (only TypeScript compiler API)

## Migration from Old Parser

The old parser used regex-based extraction and `Function()` evaluation, which was:
- Fragile (broke on comments, template literals, imports)
- Insecure (evaluated arbitrary code)
- Weakly typed (returned `any`)

The new parser:
- Uses TypeScript's compiler API for robust parsing
- Provides strong typing throughout
- Includes comprehensive error handling and validation
- Is deterministic and secure 