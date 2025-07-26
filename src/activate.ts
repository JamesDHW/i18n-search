import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

interface TranslationMap {
	[key: string]: string[];
}

class I18nSearchViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "i18nSearchView";
	private _view?: vscode.WebviewView;
	private translationMap: TranslationMap = {};

	constructor(private context: vscode.ExtensionContext) {
		console.log("I18nSearchViewProvider constructor called");
	}

	updateTranslations(newMap: TranslationMap) {
		this.translationMap = newMap;
		this.updateResults();
	}

	focusSearch() {
		if (this._view) {
			this._view.webview.postMessage({ type: "focusSearch" });
		}
	}

	resolveWebviewView(view: vscode.WebviewView) {
		console.log("WebviewView resolved!");
		console.log("View type:", view.viewType);
		console.log("View visible:", view.visible);

		this._view = view;

		view.webview.options = {
			enableScripts: true,
		};

		const html = this.getHtml();
		console.log("Setting webview HTML, length:", html.length);
		view.webview.html = html;
		console.log("Webview HTML set");

		// Send initial data
		view.webview.postMessage({
			type: "initialized",
			translations: Object.keys(this.translationMap).length,
		});

		view.webview.onDidReceiveMessage((msg) => {
			console.log("Received message from webview:", msg);
			if (msg.type === "search") {
				const matches = this.findTranslations(msg.text);
				console.log("Search results:", matches);
				view.webview.postMessage({ type: "results", results: matches });
			} else if (msg.type === "reveal") {
				this.revealKeyUsage(msg.key);
			}
		});

		// Listen for visibility changes
		view.onDidChangeVisibility(() => {
			console.log("View visibility changed:", view.visible);
		});
	}

	private findTranslations(
		searchText: string,
	): { key: string; label: string; value: string }[] {
		const results: { key: string; label: string; value: string }[] = [];

		for (const [value, keys] of Object.entries(this.translationMap)) {
			if (value.toLowerCase().includes(searchText.toLowerCase())) {
				keys.forEach((key) => {
					results.push({
						key,
						label: `t("${key}") → ${value}`,
						value,
					});
				});
			}
		}

		return results;
	}

	private async revealKeyUsage(key: string) {
		try {
			// Use the search command to find the key usage
			await vscode.commands.executeCommand("workbench.action.findInFiles", {
				query: key,
				isRegex: false,
				isCaseSensitive: false,
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Error finding usage for key: ${key}`);
		}
	}

	private updateResults() {
		if (this._view) {
			this._view.webview.postMessage({ type: "translationsUpdated" });
		}
	}

	private getHtml(): string {
		return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            margin: 0;
            padding: 10px;
          }
          
          #search {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            box-sizing: border-box;
            margin-bottom: 10px;
          }
          
          #search:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
          }
          
          #results {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .result-item {
            padding: 8px;
            margin: 4px 0;
            background-color: var(--vscode-list-hoverBackground);
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.2s;
            outline: none;
          }
          
          .result-item:hover,
          .result-item:focus {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
          }
          
          .result-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
            border: 1px solid var(--vscode-focusBorder);
          }
          
          .result-key {
            font-weight: bold;
            color: var(--vscode-textPreformat-foreground);
          }
          
          .result-value {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
            margin-top: 2px;
          }
          
          .no-results {
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <input id="search" type="text" placeholder="Search for translation text..." />
        <ul id="results"></ul>
        
        <script>
          const vscode = acquireVsCodeApi();
          let searchTimeout;
          let selectedIndex = -1;
          let currentResults = [];
          
          document.getElementById('search').addEventListener('input', e => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
              vscode.postMessage({ type: 'search', text: e.target.value });
            }, 300);
          });

          // Handle keyboard navigation
          document.addEventListener('keydown', e => {
            const results = document.querySelectorAll('.result-item');
            if (results.length === 0) return;
            
            switch (e.key) {
              case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
                updateSelection();
                break;
              case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection();
                break;
              case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < results.length) {
                  const selectedItem = results[selectedIndex];
                  vscode.postMessage({ type: 'reveal', key: selectedItem.dataset.key });
                }
                break;
            }
          });

          function updateSelection() {
            const results = document.querySelectorAll('.result-item');
            results.forEach((item, index) => {
              if (index === selectedIndex) {
                item.classList.add('selected');
                item.focus();
              } else {
                item.classList.remove('selected');
              }
            });
          }

          window.addEventListener('message', event => {
            const { type, results } = event.data;
            if (type === 'results') {
              currentResults = results;
              selectedIndex = -1;
              const ul = document.getElementById('results');
              if (results.length === 0) {
                ul.innerHTML = '<div class="no-results">No translation keys found</div>';
              } else {
                ul.innerHTML = results.map((r, index) =>
                  \`<li class="result-item" data-key="\${r.key}" tabindex="0">
                    <div class="result-key">\${r.key}</div>
                    <div class="result-value">\${r.value}</div>
                  </li>\`
                ).join('');
                
                ul.querySelectorAll('.result-item').forEach((item, index) => {
                  item.onclick = () => {
                    vscode.postMessage({ type: 'reveal', key: item.dataset.key });
                  };
                  
                  // Handle Enter key on individual items
                  item.addEventListener('keydown', e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      vscode.postMessage({ type: 'reveal', key: item.dataset.key });
                    }
                  });
                });
              }
            } else if (type === 'focusSearch') {
              document.getElementById('search').focus();
            }
          });
        </script>
      </body>
      </html>
    `;
	}
}

class I18nFileSystemProvider implements vscode.FileSystemProvider {
	private _onDidChangeFile = new vscode.EventEmitter<
		vscode.FileChangeEvent[]
	>();
	readonly onDidChangeFile = this._onDidChangeFile.event;

	constructor(private translationMap: TranslationMap) {}

	updateTranslations(newMap: TranslationMap) {
		this.translationMap = newMap;
	}

	watch(): vscode.Disposable {
		return { dispose: () => {} };
	}

	stat(uri: vscode.Uri): vscode.FileStat {
		const key = this.getKeyFromUri(uri);
		if (key && this.translationMap[key]) {
			return {
				type: vscode.FileType.File,
				ctime: Date.now(),
				mtime: Date.now(),
				size: 0,
			};
		}
		throw vscode.FileSystemError.FileNotFound();
	}

	readDirectory(): [string, vscode.FileType][] {
		return [];
	}

	createDirectory(): void {
		throw vscode.FileSystemError.NoPermissions();
	}

	readFile(uri: vscode.Uri): Uint8Array {
		const key = this.getKeyFromUri(uri);
		if (key && this.translationMap[key]) {
			const content = `export const t = "${this.translationMap[key][0]}";`;
			return Buffer.from(content, "utf8");
		}
		throw vscode.FileSystemError.FileNotFound();
	}

	writeFile(): void {
		throw vscode.FileSystemError.NoPermissions();
	}

	delete(): void {
		throw vscode.FileSystemError.NoPermissions();
	}

	rename(): void {
		throw vscode.FileSystemError.NoPermissions();
	}

	private getKeyFromUri(uri: vscode.Uri): string | null {
		if (uri.scheme !== "i18n") {
			return null;
		}
		const path = uri.path;
		if (path.endsWith(".ts")) {
			return path.slice(1, -3); // remove leading '/' and '.ts'
		}
		return path.slice(1); // remove leading '/'
	}
}

async function loadTranslations(filePath: string): Promise<TranslationMap> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error("No workspace folder found");
		}

		const absPath = path.resolve(workspaceFolders[0].uri.fsPath, filePath);

		if (!fs.existsSync(absPath)) {
			throw new Error(`Translation file not found: ${absPath}`);
		}

		// Read the translation file
		const fileContent = fs.readFileSync(absPath, "utf-8");

		// Extract the object from the export default statement
		const match = fileContent.match(/export\s+default\s+(\{[\s\S]*\})/);
		if (!match) {
			throw new Error("Translation file must export a default object");
		}

		// Parse the object safely by converting to valid JSON
		const objectString = match[1];
		const jsonString = objectString
			.replace(/(\w+):/g, '"$1":') // Quote property names
			.replace(/'/g, '"') // Replace single quotes with double quotes
			.replace(/,(\s*[}\]])/g, "$1") // Remove trailing commas before } or ]
			.replace(/,\s*}/g, "}") // Remove trailing commas before closing braces
			.replace(/,\s*]/g, "]"); // Remove trailing commas before closing brackets

		let translationObj: any;
		try {
			translationObj = JSON.parse(jsonString);
		} catch (parseError) {
			console.error("JSON parse error:", parseError);
			console.error("Attempted to parse:", jsonString);
			// Fallback: try to use Function constructor (safer than eval)
			try {
				translationObj = Function(`return ${objectString}`)();
			} catch (fallbackError) {
				console.error("Fallback parse also failed:", fallbackError);
				throw new Error("Failed to parse translation object");
			}
		}

		if (!translationObj || typeof translationObj !== "object") {
			throw new Error("Translation file must export a default object");
		}

		const map: TranslationMap = {};

		function flatten(obj: any, prefix = "") {
			if (typeof obj === "string") {
				if (!map[obj]) {
					map[obj] = [];
				}
				map[obj].push(prefix);
			} else if (typeof obj === "object" && obj !== null) {
				for (const key in obj) {
					flatten(obj[key], prefix ? `${prefix}.${key}` : key);
				}
			}
		}

		flatten(translationObj);
		console.log("Translation map loaded:", map);
		console.log("Translation values:", Object.keys(map));
		return map;
	} catch (error) {
		console.error("Failed to load translations:", error);
		return {};
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log("i18n-search extension is now active!");

	let translationMap: TranslationMap = {};
	let fileSystemProvider: I18nFileSystemProvider;
	const searchViewProvider: I18nSearchViewProvider = new I18nSearchViewProvider(
		context,
	);

	const scheme = "i18n";

	// Register webview view provider immediately
	console.log("Registering WebviewViewProvider...");
	console.log("View type:", I18nSearchViewProvider.viewType);

	// Register the provider for the sidebar view
	const registration = vscode.window.registerWebviewViewProvider(
		"i18nSearchView",
		searchViewProvider,
	);

	context.subscriptions.push(registration);
	console.log("WebviewViewProvider registered successfully");

	// Also register for the panel view
	const panelRegistration = vscode.window.registerWebviewViewProvider(
		"i18nSearchPanelView",
		searchViewProvider,
	);

	context.subscriptions.push(panelRegistration);
	console.log("Panel WebviewViewProvider registered successfully");

	// Try to trigger view creation when editor changes
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			console.log("Editor changed, checking if view needs to be created...");
		}),
	);

	async function initializeExtension() {
		const config = vscode.workspace.getConfiguration("i18nSearch");
		const catalogPath = config.get<string>("catalogPath", "./src/i18n/en.ts");

		try {
			translationMap = await loadTranslations(catalogPath);

			// Register file system provider
			fileSystemProvider = new I18nFileSystemProvider(translationMap);
			context.subscriptions.push(
				vscode.workspace.registerFileSystemProvider(
					scheme,
					fileSystemProvider,
					{ isReadonly: true },
				),
			);

			console.log(
				`Loaded ${Object.keys(translationMap).length} translation values`,
			);
		} catch (error) {
			console.error("Failed to initialize i18n-search:", error);
			vscode.window.showErrorMessage(
				`Failed to load translation file: ${error}`,
			);
		}
	}

	// Watch for changes in the translation file
	function setupFileWatcher() {
		const config = vscode.workspace.getConfiguration("i18nSearch");
		const catalogPath = config.get<string>("catalogPath", "./src/i18n/en.ts");

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const absPath = path.resolve(workspaceFolders[0].uri.fsPath, catalogPath);

		const watcher = vscode.workspace.createFileSystemWatcher(absPath);

		watcher.onDidChange(async () => {
			console.log("Translation file changed, reloading...");
			translationMap = await loadTranslations(catalogPath);

			if (fileSystemProvider) {
				fileSystemProvider.updateTranslations(translationMap);
			}

			if (searchViewProvider) {
				searchViewProvider.updateTranslations(translationMap);
			}
		});

		context.subscriptions.push(watcher);
	}

	// Handle clicks on virtual files
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(async (document) => {
			if (document.uri.scheme === scheme) {
				const key = document.uri.path.slice(1, -3);
				const keyPattern = `t("${key}")`;

				try {
					// Use the search API to find the key usage
					await vscode.commands.executeCommand("workbench.action.findInFiles", {
						query: keyPattern,
						isRegex: false,
						isCaseSensitive: true,
					});

					// Since we can't directly get the results, we'll show a message
					vscode.window.showInformationMessage(
						`Searching for key usage: ${keyPattern}`,
					);
				} catch (error) {
					console.error("Error finding key usage:", error);
					vscode.window.showErrorMessage(`Error finding usage for key: ${key}`);
				}
			}
		}),
	);

	// Register a command to search for translation keys
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"i18n-search.searchForKey",
			async (key?: string) => {
				// If no key is provided, prompt the user
				if (!key) {
					key = await vscode.window.showInputBox({
						prompt: "Enter the translation key to search for",
						placeHolder: "e.g., common.hello",
					});

					if (!key) {
						return; // User cancelled
					}
				}

				const keyPattern = `t("${key}")`;
				await vscode.commands.executeCommand("workbench.action.findInFiles", {
					query: keyPattern,
					isRegex: false,
					isCaseSensitive: true,
				});
			},
		),
	);

	// Register a command to show translation values in search
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"i18n-search.searchForValue",
			async (value?: string) => {
				// If no value is provided, prompt the user
				if (!value) {
					value = await vscode.window.showInputBox({
						prompt: "Enter the translation value to search for",
						placeHolder: "e.g., Hello World",
					});

					if (!value) {
						return; // User cancelled
					}
				}

				const matchingKeys = Object.entries(translationMap)
					.filter(([translationValue]) =>
						translationValue.toLowerCase().includes(value!.toLowerCase()),
					)
					.flatMap(([, keys]) => keys);

				if (matchingKeys.length > 0) {
					const key = matchingKeys[0];
					const keyPattern = `t("${key}")`;
					await vscode.commands.executeCommand("workbench.action.findInFiles", {
						query: keyPattern,
						isRegex: false,
						isCaseSensitive: true,
					});
				} else {
					vscode.window.showInformationMessage(
						`No translation keys found for value: ${value}`,
					);
				}
			},
		),
	);

	// Initialize the extension
	initializeExtension().then(() => {
		// Update the search view with translations after they're loaded
		if (searchViewProvider && translationMap) {
			searchViewProvider.updateTranslations(translationMap);
		}
	});
	setupFileWatcher();

	// Register commands
	const disposable = vscode.commands.registerCommand(
		"i18n-search.helloWorld",
		() => {
			vscode.window.showInformationMessage("Hello from i18n-search!");
		},
	);

	context.subscriptions.push(disposable);

	// Register command to show the search panel
	context.subscriptions.push(
		vscode.commands.registerCommand("i18n-search.showSearchPanel", () => {
			console.log("Showing search panel...");
			vscode.commands.executeCommand("workbench.view.extension.i18nSearch");
		}),
	);

	// Register command to focus search input
	context.subscriptions.push(
		vscode.commands.registerCommand("i18n-search.focusSearch", () => {
			console.log("Focusing search input...");
			// First ensure the view is visible
			vscode.commands
				.executeCommand("workbench.view.extension.i18nSearch")
				.then(() => {
					// Send message to focus the search input
					searchViewProvider.focusSearch();
				});
		}),
	);
}
