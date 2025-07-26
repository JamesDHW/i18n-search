<p align="center">
  <img src="public/i18n-search.png" width="300" alt="i18n-search Logo" />
</p>

# i18n-search

A VS Code extension that helps you find translation keys when searching for translated values. This extension integrates with VS Code's global search to surface translation key hits when searching for translated text.

## Features

- **Translation File Integration**: Automatically loads and flattens your translation catalog
- **Virtual File System**: Creates virtual files for each translation key that can be searched
- **Smart Search**: When you search for a translated value like "Hello World", the extension shows the corresponding translation key `t("common.hello")`
- **Direct Navigation**: Click on search results to jump directly to where the translation key is used in your codebase
- **File Watching**: Automatically reloads translations when your translation file changes

## Installation

1. Clone this repository
2. Run `pnpm install` to install dependencies
3. Press `F5` to run the extension in a new Extension Development Host window

## Configuration

The extension looks for your translation file at the path specified in the `i18nSearch.catalogPath` setting. By default, it expects the file at `./src/i18n/en.ts`.

To configure the path:

1. Open VS Code settings (`Cmd+,` on macOS, `Ctrl+,` on Windows/Linux)
2. Search for "i18nSearch.catalogPath"
3. Set the path to your translation file relative to your workspace root

## Usage

### Basic Search

1. Open the global search panel (`Cmd+Shift+F` on macOS, `Ctrl+Shift+F` on Windows/Linux)
2. Search for a translated value like "Hello World"
3. The extension will show results with the corresponding translation keys
4. Click on a result to navigate to where that key is used in your code

### Translation File Format

Your translation file should export a default object with nested translation keys:

```typescript
export default {
  common: {
    hello: "Hello World",
    welcome: "Welcome to our application"
  },
  navigation: {
    home: "Home",
    about: "About"
  }
};
```

### Commands

The extension provides several commands that you can access via the command palette (`Cmd+Shift+P`):

- `i18n-search: Search for Key` - Search for a specific translation key
- `i18n-search: Search for Value` - Search for translation keys that contain a specific value

## Development

### Building

```bash
pnpm run compile
```

### Watching for Changes

```bash
pnpm run watch
```

### Testing

```bash
pnpm run test
```

## How It Works

1. **Translation Loading**: The extension reads your translation file and flattens the nested structure into a map of values to keys
2. **Virtual Files**: Creates virtual files under the `i18n:` scheme for each translation key
3. **Search Integration**: When you search, the extension intercepts the search and includes relevant translation keys
4. **Navigation**: Clicking on a virtual file result triggers a search for the actual key usage in your codebase

## Example

If you have a translation like:
```typescript
export default {
  common: {
    hello: "Hello World"
  }
};
```

And you search for "Hello World" in VS Code, the extension will show a result like:
```
i18n:/common/hello.ts
t("common.hello")
```

Clicking this result will search for `t("common.hello")` in your codebase and take you to the first usage.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT
