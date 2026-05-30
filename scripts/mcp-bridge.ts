import { join, resolve, relative } from "path";
import { readdir, stat, mkdir } from "fs/promises";

const PORT = 3000;
// Resolve the root directory of the project
const WORKSPACE_DIR = resolve(join(import.meta.dir, ".."));

// CORS headers helper
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, x-local-path",
};

// Safe path resolution to prevent directory traversal
function getSafePath(relativePath: string, allowedPath: string): string {
	const absoluteAllowedPath = resolve(allowedPath);
	const absolutePath = resolve(absoluteAllowedPath, relativePath);
	if (!absolutePath.startsWith(absoluteAllowedPath)) {
		throw new Error("Access denied: Path is outside workspace directory");
	}

	const fileName = absolutePath.split(/[/\\]/).pop() || "";
	const lowerName = fileName.toLowerCase();
	const isDangerous = 
		lowerName === ".bashrc" ||
		lowerName === ".zshrc" ||
		lowerName === ".bash_profile" ||
		lowerName === ".profile" ||
		lowerName === ".login" ||
		lowerName === ".env" ||
		absolutePath.includes("/.ssh/") ||
		absolutePath.includes("\\.ssh\\");

	if (isDangerous) {
		throw new Error("Access denied: Operating on dangerous/sensitive files is blocked.");
	}

	return absolutePath;
}

// Recursively get files list
async function getFilesRecursively(dir: string, baseDir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const resPath = join(dir, entry.name);
		const relPath = relative(baseDir, resPath);

		// Exclusions to keep the payload small and safe
		if (
			entry.name === "node_modules" ||
			entry.name === ".git" ||
			entry.name === ".svelte-kit" ||
			entry.name === ".netlify" ||
			entry.name === ".DS_Store" ||
			entry.name === "bun.lock"
		) {
			continue;
		}

		if (entry.isDirectory()) {
			files.push(...(await getFilesRecursively(resPath, baseDir)));
		} else {
			files.push(relPath);
		}
	}

	return files;
}

const KEY_PATH = join(WORKSPACE_DIR, "key.pem");
const CERT_PATH = join(WORKSPACE_DIR, "cert.pem");

const hasCert = await Bun.file(KEY_PATH).exists() && await Bun.file(CERT_PATH).exists();

const tlsConfig = hasCert ? {
	key: Bun.file(KEY_PATH),
	cert: Bun.file(CERT_PATH),
} : undefined;

console.log(`Starting Local Workspace Bridge...`);
console.log(`Target Workspace: ${WORKSPACE_DIR}`);
if (hasCert) {
	console.log(`TLS certificates detected. Running in secure HTTPS mode.`);
} else {
	console.log(`No certificates found (key.pem / cert.pem). Running in HTTP mode.`);
}

Bun.serve({
	port: PORT,
	tls: tlsConfig,
	async fetch(req) {
		// Handle CORS Preflight OPTIONS request
		if (req.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(req.url);
		const allowedPath = req.headers.get("x-local-path");

		try {
			// GET /status
			if (url.pathname === "/status" && req.method === "GET") {
				return Response.json(
					{ status: "ok", workspace: WORKSPACE_DIR },
					{ headers: corsHeaders }
				);
			}

			// GET /browse?path=... - Browse directories for selector UI
			if (url.pathname === "/browse" && req.method === "GET") {
				const browsePath = url.searchParams.get("path") || WORKSPACE_DIR;
				try {
					const resolvedPath = resolve(browsePath);
					const entries = await readdir(resolvedPath, { withFileTypes: true });
					
					// Exclude hidden folders like .git, node_modules etc. to keep it clean
					const dirs = entries
						.filter(entry => {
							if (!entry.isDirectory()) return false;
							const name = entry.name;
							return name !== "node_modules" && name !== ".git" && !name.startsWith(".");
						})
						.map(entry => entry.name)
						.sort();

					return Response.json(
						{
							currentPath: resolvedPath,
							parentPath: resolve(resolvedPath, ".."),
							directories: dirs
						},
						{ headers: corsHeaders }
					);
				} catch (err: any) {
					return Response.json(
						{ error: err.message },
						{ status: 400, headers: corsHeaders }
					);
				}
			}

			// For files and file operations, validate x-local-path header
			if (url.pathname === "/files" || url.pathname === "/file") {
				if (!allowedPath) {
					return new Response("Access Denied: Missing 'x-local-path' header", {
						status: 403,
						headers: corsHeaders
					});
				}

				const dirStat = await stat(allowedPath).catch(() => null);
				if (!dirStat || !dirStat.isDirectory()) {
					return new Response("Access Denied: Invalid target directory path", {
						status: 400,
						headers: corsHeaders
					});
				}
			}

			// GET /files - List all project files
			if (url.pathname === "/files" && req.method === "GET") {
				const files = await getFilesRecursively(allowedPath!, allowedPath!);
				return Response.json({ files }, { headers: corsHeaders });
			}

			// GET /file?path=... - Read file content
			if (url.pathname === "/file" && req.method === "GET") {
				const filePathParam = url.searchParams.get("path");
				if (!filePathParam) {
					return new Response("Missing path parameter", { status: 400, headers: corsHeaders });
				}

				const safePath = getSafePath(filePathParam, allowedPath!);
				const file = Bun.file(safePath);
				
				if (!(await file.exists())) {
					return new Response("File not found", { status: 404, headers: corsHeaders });
				}

				const content = await file.text();
				return Response.json({ path: filePathParam, content }, { headers: corsHeaders });
			}

			// POST /file - Write/create file content (full overwrite)
			if (url.pathname === "/file" && req.method === "POST") {
				const body = await req.json();
				const { path: filePathParam, content } = body;

				if (!filePathParam || typeof content !== "string") {
					return new Response("Invalid request body. 'path' and 'content' are required.", {
						status: 400,
						headers: corsHeaders,
					});
				}

				const safePath = getSafePath(filePathParam, allowedPath!);
				
				// Ensure parent directory exists
				const parentDir = resolve(safePath, "..");
				await mkdir(parentDir, { recursive: true });
				await Bun.write(safePath, content);

				console.log(`Saved file: ${filePathParam} to ${allowedPath}`);
				return Response.json({ success: true, path: filePathParam }, { headers: corsHeaders });
			}

			// PATCH /file - Targeted search & replace within a file
			if (url.pathname === "/file" && req.method === "PATCH") {
				if (!allowedPath) {
					return new Response("Access Denied: Missing 'x-local-path' header", {
						status: 403,
						headers: corsHeaders
					});
				}

				const dirStat = await stat(allowedPath).catch(() => null);
				if (!dirStat || !dirStat.isDirectory()) {
					return new Response("Access Denied: Invalid target directory path", {
						status: 400,
						headers: corsHeaders
					});
				}

				const body = await req.json();
				const { path: filePathParam, search, replace } = body;

				if (!filePathParam || typeof search !== "string" || typeof replace !== "string") {
					return new Response("Invalid request body. 'path', 'search', and 'replace' are required.", {
						status: 400,
						headers: corsHeaders,
					});
				}

				const safePath = getSafePath(filePathParam, allowedPath!);
				const file = Bun.file(safePath);

				if (!(await file.exists())) {
					return new Response("File not found", { status: 404, headers: corsHeaders });
				}

				const originalContent = await file.text();

				if (!originalContent.includes(search)) {
					return Response.json(
						{ success: false, error: "Search string not found in file" },
						{ status: 422, headers: corsHeaders }
					);
				}

				const updatedContent = originalContent.replace(search, replace);
				await Bun.write(safePath, updatedContent);

				console.log(`Patched file: ${filePathParam} in ${allowedPath}`);
				return Response.json({ success: true, path: filePathParam }, { headers: corsHeaders });
			}

			return new Response("Not found", { status: 404, headers: corsHeaders });
		} catch (error: any) {
			console.error("Error processing request:", error);
			return Response.json(
				{ error: error.message || "Internal Server Error" },
				{ status: 500, headers: corsHeaders }
			);
		}
	},
});

console.log(`Local Workspace Bridge is running on ${hasCert ? 'https' : 'http'}://localhost:${PORT}`);
