import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as vscode from "vscode";

export interface TranslationMap {
	[key: string]: string[];
}

export interface TranslationKeyMap {
	[key: string]: string;
}

export interface ParsedTranslationFile {
	valueToKeys: TranslationMap;
	keyToValue: TranslationKeyMap;
	errors: ParseError[];
}

export interface ParseError {
	message: string;
	line?: number;
	column?: number;
}

export class TranslationParser {
	private readonly logger: (message: string, ...args: any[]) => void;

	constructor(logger: (message: string, ...args: any[]) => void) {
		this.logger = logger;
	}

	async parseTranslationFile(filePath: string): Promise<ParsedTranslationFile> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				throw new Error("No workspace folder found");
			}

			const absPath = path.resolve(workspaceFolders[0].uri.fsPath, filePath);

			if (!fs.existsSync(absPath)) {
				throw new Error(`Translation file not found: ${absPath}`);
			}

			const fileContent = fs.readFileSync(absPath, "utf-8");
			return this.parseContent(fileContent, absPath);
		} catch (error) {
			this.logger("Failed to parse translation file:", error);
			return {
				valueToKeys: {},
				keyToValue: {},
				errors: [{ message: `Failed to parse translation file: ${error}` }],
			};
		}
	}

	private parseContent(
		content: string,
		filePath: string,
	): ParsedTranslationFile {
		const errors: ParseError[] = [];
		const valueToKeys: TranslationMap = {};
		const keyToValue: TranslationKeyMap = {};

		try {
			const sourceFile = ts.createSourceFile(
				filePath,
				content,
				ts.ScriptTarget.ES2020,
				true,
			);

			// Find the default export
			const defaultExport = this.findDefaultExport(sourceFile);
			if (!defaultExport) {
				errors.push({
					message: "No default export found in translation file",
				});
				return { valueToKeys, keyToValue, errors };
			}

			// Parse the exported object
			this.parseTranslationObject(
				sourceFile,
				defaultExport,
				"",
				valueToKeys,
				keyToValue,
				errors,
			);

			this.logger("Successfully parsed translation file");
			this.logger(
				"Found",
				Object.keys(valueToKeys).length,
				"translation values",
			);
			this.logger("Found", Object.keys(keyToValue).length, "translation keys");
		} catch (error) {
			errors.push({
				message: `Parse error: ${error}`,
			});
		}

		return { valueToKeys, keyToValue, errors };
	}

	private findDefaultExport(sourceFile: ts.SourceFile): ts.Expression | null {
		for (const statement of sourceFile.statements) {
			if (ts.isExportAssignment(statement)) {
				return statement.expression;
			}
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					if (declaration.initializer && ts.isIdentifier(declaration.name)) {
						// Check if this variable is exported as default
						const exportDeclarations = sourceFile.statements.filter(
							(s) =>
								ts.isExportDeclaration(s) &&
								s.exportClause &&
								ts.isNamedExports(s.exportClause),
						);
						for (const exportDecl of exportDeclarations) {
							if (
								ts.isExportDeclaration(exportDecl) &&
								exportDecl.exportClause
							) {
								const namedExports = exportDecl.exportClause as ts.NamedExports;
								for (const exportSpecifier of namedExports.elements) {
									if (exportSpecifier.name.text === "default") {
										return declaration.initializer;
									}
								}
							}
						}
					}
				}
			}
		}
		return null;
	}

	private parseTranslationObject(
		sourceFile: ts.SourceFile,
		node: ts.Node,
		prefix: string,
		valueToKeys: TranslationMap,
		keyToValue: TranslationKeyMap,
		errors: ParseError[],
	): void {
		if (ts.isObjectLiteralExpression(node)) {
			for (const property of node.properties) {
				if (
					ts.isPropertyAssignment(property) &&
					ts.isIdentifier(property.name)
				) {
					const key = property.name.text;
					const fullKey = prefix ? `${prefix}.${key}` : key;

					if (ts.isStringLiteral(property.initializer)) {
						const value = property.initializer.text;
						this.addTranslation(value, fullKey, valueToKeys, keyToValue);
					} else if (ts.isObjectLiteralExpression(property.initializer)) {
						this.parseTranslationObject(
							sourceFile,
							property.initializer,
							fullKey,
							valueToKeys,
							keyToValue,
							errors,
						);
					} else {
						errors.push({
							message: `Invalid translation value for key '${fullKey}': must be string or object`,
							line:
								sourceFile.getLineAndCharacterOfPosition(property.getStart())
									.line + 1,
							column:
								sourceFile.getLineAndCharacterOfPosition(property.getStart())
									.character + 1,
						});
					}
				} else if (ts.isShorthandPropertyAssignment(property)) {
					// Handle shorthand properties (e.g., { key })
					errors.push({
						message: `Shorthand properties not supported in translation objects`,
						line:
							sourceFile.getLineAndCharacterOfPosition(property.getStart())
								.line + 1,
						column:
							sourceFile.getLineAndCharacterOfPosition(property.getStart())
								.character + 1,
					});
				} else if (ts.isSpreadAssignment(property)) {
					// Handle spread assignments (e.g., { ...obj })
					errors.push({
						message: `Spread assignments not supported in translation objects`,
						line:
							sourceFile.getLineAndCharacterOfPosition(property.getStart())
								.line + 1,
						column:
							sourceFile.getLineAndCharacterOfPosition(property.getStart())
								.character + 1,
					});
				} else if (ts.isComputedPropertyName(property.name)) {
					// Handle computed property names
					errors.push({
						message: `Computed property names not supported in translation objects`,
						line:
							sourceFile.getLineAndCharacterOfPosition(property.getStart())
								.line + 1,
						column:
							sourceFile.getLineAndCharacterOfPosition(property.getStart())
								.character + 1,
					});
				}
			}
		} else if (ts.isStringLiteral(node)) {
			// Handle direct string values (shouldn't happen in normal structure)
			const value = node.text;
			this.addTranslation(value, prefix, valueToKeys, keyToValue);
		} else {
			errors.push({
				message: `Unexpected node type in translation object: ${node.kind}`,
				line:
					sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
				column:
					sourceFile.getLineAndCharacterOfPosition(node.getStart()).character +
					1,
			});
		}
	}

	private addTranslation(
		value: string,
		key: string,
		valueToKeys: TranslationMap,
		keyToValue: TranslationKeyMap,
	): void {
		// Add to valueToKeys map
		if (!valueToKeys[value]) {
			valueToKeys[value] = [];
		}
		valueToKeys[value].push(key);

		// Add to keyToValue map
		keyToValue[key] = value;
	}

	validateTranslationFile(parsed: ParsedTranslationFile): ValidationResult {
		const warnings: string[] = [];
		const errors: string[] = [];

		// Check for duplicate values
		const duplicateValues = Object.entries(parsed.valueToKeys).filter(
			([, keys]) => keys.length > 1,
		);
		if (duplicateValues.length > 0) {
			warnings.push(
				`Found ${duplicateValues.length} duplicate translation values: ${duplicateValues
					.map(([value]) => `"${value}"`)
					.join(", ")}`,
			);
		}

		// Check for empty values
		const emptyValues = Object.entries(parsed.keyToValue).filter(
			([, value]) => value.trim() === "",
		);
		if (emptyValues.length > 0) {
			warnings.push(
				`Found ${emptyValues.length} empty translation values: ${emptyValues
					.map(([key]) => key)
					.join(", ")}`,
			);
		}

		// Check for very long values (potential issues)
		const longValues = Object.entries(parsed.keyToValue).filter(
			([, value]) => value.length > 200,
		);
		if (longValues.length > 0) {
			warnings.push(
				`Found ${longValues.length} very long translation values (>200 chars)`,
			);
		}

		return { warnings, errors };
	}
}

export interface ValidationResult {
	warnings: string[];
	errors: string[];
}
