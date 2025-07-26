const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started");
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(
					`    ${location.file}:${location.line}:${location.column}:`,
				);
			});
			console.log("[watch] build finished");
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const copyHtmlPlugin = {
	name: "copy-html",

	setup(build) {
		build.onEnd(async (result) => {
			if (result.errors.length === 0) {
				try {
					// Ensure dist directory exists
					if (!fs.existsSync("dist")) {
						fs.mkdirSync("dist", { recursive: true });
					}

					// Copy HTML file
					const sourcePath = path.join(__dirname, "src", "webview.html");
					const destPath = path.join(__dirname, "dist", "webview.html");

					if (fs.existsSync(sourcePath)) {
						fs.copyFileSync(sourcePath, destPath);
						console.log("[build] Copied webview.html to dist/");
					}
				} catch (error) {
					console.error("[build] Failed to copy HTML file:", error);
				}
			}
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ["src/extension.ts"],
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: "node",
		outfile: "dist/extension.js",
		external: ["vscode"],
		logLevel: "silent",
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
			copyHtmlPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
