# 🧠 BUILD_AI.md

## 🎯 Goal

Augment the existing VS Code extension to:
- Hook into the default global search (⌘+⇧+F).
- Surface translation key hits (e.g. `t("some.nested.key")`) when searching for a translated value like `"Hello World"`.
- Allow users to jump directly from the search result to where the key is used in the codebase.

## 🧱 Assumptions

- A basic VS Code extension project scaffolded using `yo code` or equivalent exists.
- The user has a translation file like:

```ts
export default {
  some: { nested: { key: "Hello World" } }
}
```

---

## 🛠️ Tasks

### 1. Read and Flatten the Translation Catalogue

- Add a configuration setting:

```jsonc
"contributes": {
  "configuration": {
    "properties": {
      "i18nSearch.translationFilepath": {
        "type": "string",
        "default": "./src/i18n/en.ts",
        "description": "Path to the default-exported translation file"
      }
    }
  }
}
```

- In `extension.ts`, load and flatten the translation file:

```ts
import { Uri, workspace } from 'vscode';
import path from 'path';

async function loadTranslations(filePath: string): Promise<Map<string, string[]>> {
  const absPath = path.resolve(workspace.workspaceFolders?.[0].uri.fsPath || '', filePath);
  const translationObj = (await import(absPath)).default;

  const map = new Map<string, string[]>();

  function flatten(obj: any, prefix = "") {
    if (typeof obj === "string") {
      if (!map.has(obj)) map.set(obj, []);
      map.get(obj)!.push(prefix);
    } else if (typeof obj === "object") {
      for (const key in obj) {
        flatten(obj[key], prefix ? `${prefix}.${key}` : key);
      }
    }
  }

  flatten(translationObj);
  return map;
}
```

---

### 2. Implement a Virtual File System Provider

- Register a `FileSystemProvider` under a scheme (e.g. `i18n:`) to expose virtual files:

```ts
const scheme = 'i18n';
const fileSystemProvider: FileSystemProvider = {
  // implement readFile and stat
};
workspace.registerFileSystemProvider(scheme, fileSystemProvider, { isReadonly: true });
```

- Each virtual file path (`i18n:/some/nested/key.ts`) should contain:

```ts
export const t = "Hello World";
```

---

### 3. Register a `TextSearchProvider`

- Hook into the search panel by registering a text search provider:

```ts
workspace.registerTextSearchProvider(scheme, {
  provideTextSearchResults(query, options, progress, token) {
    for (const [value, keys] of catalogue) {
      if (value.includes(query.pattern)) {
        keys.forEach(k => {
          const uri = Uri.parse(`i18n:/${k}.ts`);
          const range = new Range(0, 0, 0, value.length);
          progress.report({
            uri,
            range,
            preview: { text: `t("${k}")`, match: range }
          });
        });
      }
    }
    return { limitHit: false };
  }
});
```

---

### 4. Redirect Virtual File Clicks to Real Usages

- Intercept `workspace.onDidOpenTextDocument`:

```ts
workspace.onDidOpenTextDocument(async doc => {
  if (doc.uri.scheme === 'i18n') {
    const key = doc.uri.path.slice(1, -3); // remove `.ts`
    const keyPattern = `t("${key}")`;

    workspace.findTextInFiles({ pattern: keyPattern }, result => {
      const location = result.uri;
      const match = result.ranges[0];
      window.showTextDocument(location, { selection: match });
    });
  }
});
```

---

### 5. Watch for Changes in the Translation File

- Use `workspace.createFileSystemWatcher()` to re-import the file and re-flatten the map when changes are detected.

---

## 🧪 Testing Checklist

1. Set `"i18nSearch.translationFilepath"` in the extension’s settings.
2. Run the extension via F5 (Extension Dev Host).
3. In your React app, search (⌘⇧F) for a string like `"Hello World"`.
4. See `t("some.nested.key")` show up as a result (under scheme `i18n:`).
5. Click the result → it opens the real usage in your source code.

---

## 📦 Future Ideas (Optional)

- Add CodeLens for each translation key usage (`Go to translation`).
- Add a command to open a search editor for a given translation key.
- Add diagnostics if a key is unused or if there’s a duplicate value.
