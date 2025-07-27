import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as ts from "typescript";

interface TranslationMap {
	[key: string]: string[];
}

// Logger utility
class Logger {
	private outputChannel: vscode.OutputChannel;
	private logLevel: string = "info";

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel("i18n-search");
	}

	setLogLevel(level: string) {
		this.logLevel = level;
	}

	private shouldLog(level: string): boolean {
		const levels = { error: 0, warn: 1, info: 2, debug: 3 };
		return (
			levels[level as keyof typeof levels] <=
			levels[this.logLevel as keyof typeof levels]
		);
	}

	private formatMessage(
		level: string,
		message: string,
		...args: any[]
	): string {
		const timestamp = new Date().toISOString();
		const formattedArgs =
			args.length > 0
				? " " +
					args
						.map((arg) =>
							typeof arg === "object"
								? JSON.stringify(arg, null, 2)
								: String(arg),
						)
						.join(" ")
				: "";
		return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
	}

	debug(message: string, ...args: any[]) {
		if (this.shouldLog("debug")) {
			this.outputChannel.appendLine(
				this.formatMessage("debug", message, ...args),
			);
		}
	}

	info(message: string, ...args: any[]) {
		if (this.shouldLog("info")) {
			this.outputChannel.appendLine(
				this.formatMessage("info", message, ...args),
			);
		}
	}

	warn(message: string, ...args: any[]) {
		if (this.shouldLog("warn")) {
			this.outputChannel.appendLine(
				this.formatMessage("warn", message, ...args),
			);
		}
	}

	error(message: string, error?: Error | any) {
		if (this.shouldLog("error")) {
			let errorDetails = "";
			if (error instanceof Error) {
				errorDetails = `\n${error.message}\n${error.stack}`;
			} else if (error) {
				errorDetails = `\n${JSON.stringify(error, null, 2)}`;
			}
			this.outputChannel.appendLine(
				this.formatMessage("error", message + errorDetails),
			);
		}
	}

	show() {
		this.outputChannel.show();
	}
}

// Global logger instance
let logger: Logger;

// Logger singleton that's always available
const getLogger = () =>
	logger || {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		show: () => {},
		setLogLevel: () => {},
	};

class I18nSearchViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "i18nSearchView";
	private _view?: vscode.WebviewView;
	private translationMap: TranslationMap = {};
	private webviewReady = false;
	private pendingFocus = false;
	private lastSearchTerm = "";
	private lastSearchResults: { key: string; label: string; value: string }[] =
		[];

	constructor(private context: vscode.ExtensionContext) {
		getLogger().debug("I18nSearchViewProvider constructor called");
		// Load last search from global state
		this.lastSearchTerm = context.globalState.get(
			"i18nSearch.lastSearchTerm",
			"",
		);
		this.lastSearchResults = context.globalState.get(
			"i18nSearch.lastSearchResults",
			[],
		);
	}

	private getHtml(): string {
		const htmlPath = path.join(__dirname, "webview.html");
		const fs = require("fs");
		return fs.readFileSync(htmlPath, "utf8");
	}

	updateTranslations(newMap: TranslationMap) {
		this.translationMap = newMap;
		this.updateResults();
	}

	focusSearch() {
		if (this._view && this.webviewReady) {
			this._view.webview.postMessage({ type: "focusSearch" });
			this.pendingFocus = false;
		} else {
			// Mark that we want to focus when ready
			this.pendingFocus = true;
		}
	}

	private saveSearchState(
		searchTerm: string,
		results: { key: string; label: string; value: string }[],
	) {
		this.lastSearchTerm = searchTerm;
		this.lastSearchResults = results;
		this.context.globalState.update("i18nSearch.lastSearchTerm", searchTerm);
		this.context.globalState.update("i18nSearch.lastSearchResults", results);
	}

	private restoreLastSearch() {
		if (this._view && this.webviewReady && this.lastSearchTerm) {
			this._view.webview.postMessage({
				type: "restoreSearch",
				searchTerm: this.lastSearchTerm,
				results: this.lastSearchResults,
			});
		}
	}

	resolveWebviewView(view: vscode.WebviewView) {
		getLogger().debug("WebviewView resolved!");
		getLogger().debug("View type:", view.viewType);
		getLogger().debug("View visible:", view.visible);

		this._view = view;

		view.webview.options = {
			enableScripts: true,
		};

		const html = this.getHtml();
		getLogger().debug("Setting webview HTML, length:", html.length);
		view.webview.html = html;
		getLogger().debug("Webview HTML set");

		// Send initial data
		view.webview.postMessage({
			type: "initialized",
			translations: Object.keys(this.translationMap).length,
		});

		view.webview.onDidReceiveMessage((msg) => {
			getLogger().debug("Received message from webview:", msg);
			if (msg.type === "search") {
				const matches = this.findTranslations(msg.text);
				getLogger().debug("Search results:", matches);

				// Get configuration
				const config = vscode.workspace.getConfiguration("i18nSearch");
				const enableMixedSearch = config.get<boolean>(
					"enableMixedSearch",
					true,
				);

				view.webview.postMessage({
					type: "results",
					results: matches,
					searchText: msg.text,
					enableMixedSearch,
				});

				// Save search state (including empty searches)
				this.saveSearchState(msg.text, matches);
			}
			if (msg.type === "reveal") {
				this.revealKeyUsage(msg.key, msg.value);
			}
			if (msg.type === "searchCodebase") {
				this.searchCodebase(msg.searchText);
			}
			if (msg.type === "webviewReady") {
				this.webviewReady = true;
				getLogger().debug("Webview is ready for interaction");

				// Process any pending focus requests
				if (this.pendingFocus) {
					this.focusSearch();
				}

				// Restore last search if available, otherwise show all translations
				if (this.lastSearchTerm) {
					this.restoreLastSearch();
				} else {
					// Show all translations by default
					const allMatches = this.findTranslations("");
					view.webview.postMessage({
						type: "results",
						results: allMatches,
						searchText: "",
						enableMixedSearch: vscode.workspace
							.getConfiguration("i18nSearch")
							.get<boolean>("enableMixedSearch", true),
					});
				}
			}
		});

		// Listen for visibility changes
		view.onDidChangeVisibility(() => {
			getLogger().debug("View visibility changed:", view.visible);
		});
	}

	private findTranslations(
		searchText: string,
	): { key: string; label: string; value: string }[] {
		const results: { key: string; label: string; value: string }[] = [];

		// If search text is empty, return all translations
		if (!searchText.trim()) {
			for (const [value, keys] of Object.entries(this.translationMap)) {
				keys.forEach((key) => {
					results.push({
						key,
						label: `t("${key}") → ${value}`,
						value,
					});
				});
			}
		} else {
			// Filter by search text
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
		}

		return results;
	}

	private async searchCodebase(searchText: string) {
		await vscode.commands.executeCommand(
			"i18n-search.searchCodebase",
			searchText,
		);
	}

	private async revealKeyUsage(key: string, translationValue?: string) {
		try {
			// Get configuration
			const config = vscode.workspace.getConfiguration("i18nSearch");
			const enableMixedSearch = config.get<boolean>("enableMixedSearch", true);

			let searchPattern: string;
			let isRegex: boolean;

			if (enableMixedSearch && translationValue) {
				// Escape special regex characters in both key and value
				const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const escapedValue = translationValue.replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&",
				);

				// Build regex pattern to search for both key and value
				searchPattern = `${escapedKey}|${escapedValue}`;
				isRegex = true;
			} else {
				// Just search for the translation key
				searchPattern = key;
				isRegex = false;
			}

			// Use the official VS Code API to find and navigate to the first match
			await this.findAndNavigateToFirstMatch(searchPattern, isRegex);
		} catch (error) {
			vscode.window.showErrorMessage(`Error finding usage for key: ${key}`);
		}
	}

	private async findAndNavigateToFirstMatch(
		searchPattern: string,
		isRegex: boolean,
	) {
		try {
			// Get configuration for timeout and jump behavior
			const config = vscode.workspace.getConfiguration("i18nSearch");
			const searchTimeout = config.get<number>("searchTimeout", 300);
			const jumpToFirstResult = config.get<boolean>("jumpToFirstResult", true);

			// Use the workbench action to find matches and show results
			await vscode.commands.executeCommand("workbench.action.findInFiles", {
				query: searchPattern,
				isRegex: isRegex,
				isCaseSensitive: false,
			});

			// Execute the search to ensure results are loaded
			await vscode.commands.executeCommand(
				"search.action.refreshSearchResults",
			);

			// Only wait and navigate if jumpToFirstResult is enabled
			if (jumpToFirstResult) {
				// Wait for results to load, then navigate
				await new Promise((resolve) => setTimeout(resolve, searchTimeout));

				// Navigate to the first result
				await vscode.commands.executeCommand(
					"search.action.focusNextSearchResult",
				);
				await vscode.commands.executeCommand("search.action.openResult");
			}
		} catch (error) {
			getLogger().error("Error finding matches:", error);
			vscode.window.showErrorMessage(`Error searching for: ${searchPattern}`);
		}
	}

	private updateResults() {
		if (this._view) {
			this._view.webview.postMessage({ type: "translationsUpdated" });
		}
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

// Robust parser for TypeScript/JavaScript object literals
function parseObjectLiteral(objectString: string): any {
	// Strategy 1: Try JSON.parse with basic transformations
	try {
		const jsonString = objectString
			.replace(/(\w+):/g, '"$1":') // Quote property names
			.replace(/'/g, '"') // Replace single quotes with double quotes
			.replace(/,(\s*[}\]])/g, "$1") // Remove trailing commas before } or ]
			.replace(/,\s*}/g, "}") // Remove trailing commas before closing braces
			.replace(/,\s*]/g, "]"); // Remove trailing commas before closing brackets

		return JSON.parse(jsonString);
	} catch (error) {
		getLogger().debug("JSON.parse failed, trying enhanced parsing...");
	}

	// Strategy 2: TypeScript AST-based parsing (most robust)
	try {
		// Create a TypeScript source file
		const sourceFile = ts.createSourceFile(
			"translation.ts",
			`const translations = ${objectString};`,
			ts.ScriptTarget.Latest,
			true,
		);

		// Find the variable declaration
		const variableStatement = sourceFile.statements.find(
			(stmt): stmt is ts.VariableStatement => ts.isVariableStatement(stmt),
		);

		if (!variableStatement) {
			throw new Error("No variable statement found");
		}

		const variableDeclaration =
			variableStatement.declarationList.declarations[0];
		if (!variableDeclaration || !variableDeclaration.initializer) {
			throw new Error("No variable initializer found");
		}

		// Extract the object literal
		const objectLiteral = variableDeclaration.initializer;
		if (!ts.isObjectLiteralExpression(objectLiteral)) {
			throw new Error("Variable initializer is not an object literal");
		}

		// Convert the AST back to a JavaScript object
		const result: any = {};

		function processPropertyAssignment(prop: ts.ObjectLiteralElementLike): any {
			if (ts.isPropertyAssignment(prop)) {
				const key = prop.name.getText(sourceFile);
				const value = processExpression(prop.initializer);
				return { key, value };
			}
			return null;
		}

		function processExpression(expr: ts.Expression): any {
			if (ts.isStringLiteral(expr)) {
				return expr.text;
			} else if (ts.isNumericLiteral(expr)) {
				return Number(expr.text);
			} else if (expr.kind === ts.SyntaxKind.TrueKeyword) {
				return true;
			} else if (expr.kind === ts.SyntaxKind.FalseKeyword) {
				return false;
			} else if (expr.kind === ts.SyntaxKind.NullKeyword) {
				return null;
			} else if (ts.isObjectLiteralExpression(expr)) {
				const obj: any = {};
				expr.properties.forEach((prop) => {
					const assignment = processPropertyAssignment(prop);
					if (assignment) {
						obj[assignment.key] = assignment.value;
					}
				});
				return obj;
			} else if (ts.isArrayLiteralExpression(expr)) {
				return expr.elements.map((element) => processExpression(element));
			} else if (ts.isTemplateExpression(expr)) {
				// Convert template literals to regular strings
				let result = "";
				result += expr.head.text;
				expr.templateSpans.forEach((span) => {
					result += span.literal.text;
				});
				return result;
			}
			// For other expressions, return as string
			return expr.getText(sourceFile);
		}

		objectLiteral.properties.forEach((prop) => {
			const assignment = processPropertyAssignment(prop);
			if (assignment) {
				result[assignment.key] = assignment.value;
			}
		});

		return result;
	} catch (error) {
		getLogger().debug(
			"TypeScript AST parsing failed, trying enhanced regex...",
		);
	}

	getLogger().error("Failed to parse translation object");
	return {};
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

		const objectString = match[1];
		const translationObj = parseObjectLiteral(objectString);

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
		getLogger().debug("Translation map loaded:", map);
		getLogger().debug("Translation values:", Object.keys(map));
		return map;
	} catch (error) {
		getLogger().error("Failed to load translations:", error);
		return {};
	}
}

export function activate(context: vscode.ExtensionContext) {
	logger = new Logger();

	// Set log level from configuration
	const config = vscode.workspace.getConfiguration("i18nSearch");
	const logLevel = config.get<string>("logLevel", "info");
	logger.setLogLevel(logLevel);

	logger.info("i18n-search extension is now active!");

	let translationMap: TranslationMap = {};
	let fileSystemProvider: I18nFileSystemProvider;
	const searchViewProvider: I18nSearchViewProvider = new I18nSearchViewProvider(
		context,
	);

	const scheme = "i18n";

	// Register webview view provider immediately
	getLogger().debug("Registering WebviewViewProvider...");
	getLogger().debug("View type:", I18nSearchViewProvider.viewType);

	// Register the provider for the sidebar view
	const registration = vscode.window.registerWebviewViewProvider(
		"i18nSearchView",
		searchViewProvider,
	);

	context.subscriptions.push(registration);
	getLogger().debug("WebviewViewProvider registered successfully");

	// Also register for the panel view
	const panelRegistration = vscode.window.registerWebviewViewProvider(
		"i18nSearchPanelView",
		searchViewProvider,
	);

	context.subscriptions.push(panelRegistration);
	getLogger().debug("Panel WebviewViewProvider registered successfully");

	// Try to trigger view creation when editor changes
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			getLogger().debug(
				"Editor changed, checking if view needs to be created...",
			);
		}),
	);

	async function initializeExtension() {
		const config = vscode.workspace.getConfiguration("i18nSearch");
		const translationFilepath = config.get<string>(
			"translationFilepath",
			"./src/i18n/en.ts",
		);

		try {
			translationMap = await loadTranslations(translationFilepath);

			// Register file system provider
			fileSystemProvider = new I18nFileSystemProvider(translationMap);
			context.subscriptions.push(
				vscode.workspace.registerFileSystemProvider(
					scheme,
					fileSystemProvider,
					{ isReadonly: true },
				),
			);

			getLogger().info(
				`Loaded ${Object.keys(translationMap).length} translation values`,
			);
		} catch (error) {
			getLogger().error("Failed to initialize i18n-search:", error);
			vscode.window.showErrorMessage(
				`Failed to load translation file: ${error}`,
			);
		}
	}

	// Watch for changes in the translation file
	function setupFileWatcher() {
		const config = vscode.workspace.getConfiguration("i18nSearch");
		const translationFilepath = config.get<string>(
			"translationFilepath",
			"./src/i18n/en.ts",
		);

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const absPath = path.resolve(
			workspaceFolders[0].uri.fsPath,
			translationFilepath,
		);

		const watcher = vscode.workspace.createFileSystemWatcher(absPath);

		watcher.onDidChange(async () => {
			getLogger().info("Translation file changed, reloading...");
			translationMap = await loadTranslations(translationFilepath);

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
					getLogger().error("Error finding key usage:", error);
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

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("i18nSearch.logLevel")) {
				const newLogLevel = vscode.workspace
					.getConfiguration("i18nSearch")
					.get<string>("logLevel", "info");
				getLogger().setLogLevel(newLogLevel);
				getLogger().debug("Log level updated to:", newLogLevel);
			}
		}),
	);

	// Initialize the extension
	initializeExtension().then(() => {
		// Update the search view with translations after they're loaded
		if (searchViewProvider && translationMap) {
			searchViewProvider.updateTranslations(translationMap);
		}
	});
	setupFileWatcher();

	// Update search view immediately with empty translations so UI shows up
	searchViewProvider.updateTranslations({});

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
			getLogger().debug("Showing search panel...");
			vscode.commands.executeCommand("workbench.view.extension.i18nSearch");
		}),
	);

	// Register command to focus search input
	context.subscriptions.push(
		vscode.commands.registerCommand("i18n-search.focusSearch", () => {
			getLogger().debug("Focusing search input...");
			// First ensure the view is visible
			vscode.commands
				.executeCommand("workbench.view.extension.i18nSearch")
				.then(() => {
					// Use the provider's focus method which handles ready state
					searchViewProvider.focusSearch();
				});
		}),
	);

	// Register command to search codebase
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"i18n-search.searchCodebase",
			async (searchTerm?: string) => {
				if (!searchTerm) {
					searchTerm = await vscode.window.showInputBox({
						prompt: "Enter text to search in codebase",
						placeHolder: "e.g., Hello World",
					});
					if (!searchTerm) {
						return;
					}
				}

				await vscode.commands.executeCommand("workbench.action.findInFiles", {
					query: searchTerm,
					isRegex: false,
					isCaseSensitive: false,
				});
			},
		),
	);

	// Register command to show log output
	context.subscriptions.push(
		vscode.commands.registerCommand("i18n-search.showLogs", () => {
			getLogger().show();
		}),
	);
}
