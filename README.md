
<p align="center">
  <img src="public/i18n-search.png" width="300" alt="i18n-search Logo" />
</p>

# i18n-search

> [!NOTE]  
> Find usages of i18n translation keys in the codebase just from the translated text.

<p align="center">
  <img src="public/demo.gif" width="1000" alt="demo gif" />
</p>


A VS Code extension that bridges the gap between translated text and translation keys. When you search for translated values like "Hello World", it automatically shows you the corresponding translation to find and navigate directly to usages like `t("common.hello")`.


## The Problem

When working with internationalized applications, developers often need to find where a specific translation key is used in the codebase. Traditional search methods require knowing the exact key name (or adding an extra step of navigating to the translation file first to find the key), but what if you only know the translated text? 

This extension solves that problem by creating a reverse lookup from translated values to their keys.

## Features

- **🔍 Smart Translation Search**: Search for translated text and find the corresponding translation keys in the codebase
- **🔄 Mixed Search Mode**: Search both translation keys and their values simultaneously
- **🎯 Direct Navigation**: Click on search results to jump directly to key usage in your codebase
- **⚡ Real-time Updates**: Automatically reloads when your translation file changes
- **📊 Dedicated Search Panel**: Accessible from the activity bar or panel

## Quick Start

1. **Configure your translation file path** in VS Code settings:
   - Open Settings (`Cmd+,` / `Ctrl+,`) (or open/create your `.vscode/settings.json`)
   - Search for "i18nSearch.translationFilepath"
   - Set to your translation file (default: `./src/i18n/en.ts`)

2. **Search for translated text**:
   - Use `Ctrl+Shift+F` (`^+Shift+F`) to focus the search panel
   - Type a translated value like "Hello World"
   - See results showing the corresponding translation key `common.helloWorld`
   - Click to navigate to where that key is used in your code

## Translation File Format

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

You can also use a plain JSON file.

## Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `i18n-search: Focus Search Input` | Focus the translation search input |
| `i18n-search: Show Search Panel` | Open the translation search panel |
| `i18n-search: Search for Key` | Search for a specific translation key |
| `i18n-search: Search for Value` | Search for keys containing a specific value |
| `i18n-search: Search Codebase` | Search for text in your codebase |
| `i18n-search: Show Logs` | Display extension logs for debugging |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` (`^+Shift+F`) | Focus translation search input |

## Configuration

Configure the extension behavior in VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `i18nSearch.translationFilepath` | `./src/i18n/en.ts` | Path to your translation file |
| `i18nSearch.enableMixedSearch` | `true` | Search both keys and values simultaneously |
| `i18nSearch.searchTimeout` | `300` | Timeout (ms) before navigating to search results - technical workaround, increase for larger codebases/ slower machines |
| `i18nSearch.jumpToFirstResult` | `true` | Automatically jump to first result when clicking |
| `i18nSearch.logLevel` | `info` | Logging level (`error`, `warn`, `info`, `debug`) |

## Usage Examples

### Finding Translation Key Usage

1. You see "Welcome to our application" in your app
2. Search for "Welcome to our application" in the translation panel
3. See result: `t("common.welcome") → Welcome to our application`
4. Click to find all usages of `t("common.welcome")` in your codebase

### Mixed Search Mode

With `enableMixedSearch` enabled, clicking a translation result will search for both:
- The translation key: `t("common.hello")`
- The translated value: `Hello World`

This helps find both direct key usage and any hardcoded text that should use the translation key.


## Requirements

- VS Code 1.96.0 or higher
- TypeScript/JavaScript project with translation files
- Translation file must export a default object

## Troubleshooting

- **No results showing**: Check that your translation file path is correct in settings
- **Search not working**: Verify your translation file exports a default object
- **Navigation issues**: Adjust `searchTimeout` if results aren't loading fast enough
- **Debug issues**: Use `i18n-search: Show Logs` command and set `logLevel` to `debug`

#### Output Panel
- **Access**: Go to `View` → `Output` in the menu bar, or use `Ctrl+Shift+U` (`Cmd+Shift+U` on Mac)
- **Select**: Choose "i18n-search" from the dropdown in the Output panel
- **Alternative**: Use the `i18n-search: Show Logs` command from the Command Palette

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
