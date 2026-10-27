import path from "node:path";

import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const FEATURE_PATH = /^src\/features\/([^/]+)(?:\/(.*))?$/u;

/** Sanctioned exceptions: the schema aggregator, drizzle-kit, the one-off importer and tests. */
const EXEMPT_FILES = [
	/^src\/server\/db\/schema\.ts$/u,
	/^drizzle\.config\.ts$/u,
	/^scripts\/import-convex\//u,
	/^tests\//u,
	/^src\/server\/testing\//u,
];

/** Code that ends up in the browser bundle. */
const UI_FILES = [/^src\/features\/[^/]+\/ui\//u, /^src\/app\//u, /^src\/components\//u, /^src\/hooks\//u, /^src\/lib\//u];

/** The only kernel module that may depend on features. */
const COMPOSITION_ROOT = "src/server/app.ts";

function toProjectPath(cwd: string, absolute: string): string {
	return path.relative(cwd, absolute).split(path.sep).join("/");
}

function resolveSource(file: string, source: string): string | null {
	if (source.startsWith("@/")) return `src/${source.slice(2)}`;
	if (source.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(file), source));
	return null;
}

function stripIndex(target: string): string {
	return target.replace(/\/index(?:\.[cm]?[jt]sx?)?$/u, "").replace(/\.[cm]?[jt]sx?$/u, "");
}

function isTypeOnly(node: ESTree.ImportDeclaration | ESTree.ExportNamedDeclaration | ESTree.ExportAllDeclaration): boolean {
	if (node.type === "ImportDeclaration") {
		if (node.importKind === "type") return true;
		return node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type");
	}
	return node.exportKind === "type";
}

/**
 * Feature ownership (docs/migration-convex-to-postgres.md §3):
 *  - no deep imports: another feature is reached only through `server/index.ts` or `ui/index.ts`;
 *  - UI never imports server code at runtime; `ui/` may `import type` its own `server/admin.routes`;
 *  - only the composition root (`src/server/app.ts`) of the kernel depends on features.
 */
export const featureBoundariesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Enforce feature ownership boundaries between src/features/*, the server kernel and UI code.",
		},
		messages: {
			deepImport:
				'Import "{{source}}" through its public entry ("@/features/{{feature}}/server" or "@/features/{{feature}}/ui"); deep imports into another feature are not allowed.',
			uiImportsServer:
				'UI code must not import server code at runtime ("{{source}}"). Use the feature\'s `ui/api.ts` hooks; `ui/` may only `import type` its own `server/admin.routes`.',
			kernelImportsFeature:
				'The server kernel must not depend on features ("{{source}}"); only src/server/app.ts composes them.',
		},
	},
	create(context) {
		const file = toProjectPath(context.cwd, context.filename);
		if (TEST_FILE.test(file) || EXEMPT_FILES.some((pattern) => pattern.test(file))) return {};

		const ownFeature = FEATURE_PATH.exec(file)?.[1] ?? null;
		const isUiFile = UI_FILES.some((pattern) => pattern.test(file));
		const isKernelFile = file.startsWith("src/server/");

		function check(node: ESTree.ImportDeclaration | ESTree.ExportNamedDeclaration | ESTree.ExportAllDeclaration, source: string) {
			const resolved = resolveSource(file, source);
			if (resolved === null) return;
			const target = stripIndex(resolved);
			const targetFeature = FEATURE_PATH.exec(target);

			if (isUiFile) {
				const isServerTarget = target.startsWith("src/server/") || target === "src/server"
					|| (targetFeature !== null && /^server(?:\/|$)/u.test(targetFeature[2] ?? ""));
				if (isServerTarget) {
					const isOwnRoutesType = targetFeature !== null
						&& targetFeature[1] === ownFeature
						&& targetFeature[2] === "server/admin.routes"
						&& isTypeOnly(node);
					if (!isOwnRoutesType) {
						context.report({ node, messageId: "uiImportsServer", data: { source } });
						return;
					}
				}
			}

			if (targetFeature === null) return;
			const [, feature, rest = ""] = targetFeature;

			if (isKernelFile && file !== COMPOSITION_ROOT) {
				context.report({ node, messageId: "kernelImportsFeature", data: { source } });
				return;
			}

			if (feature === ownFeature) return;
			if (rest !== "server" && rest !== "ui") {
				context.report({ node, messageId: "deepImport", data: { source, feature } });
			}
		}

		return {
			ImportDeclaration(node) {
				check(node, node.source.value);
			},
			ExportNamedDeclaration(node) {
				if (node.source) check(node, node.source.value);
			},
			ExportAllDeclaration(node) {
				check(node, node.source.value);
			},
		};
	},
});
