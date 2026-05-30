import { join, resolve, relative } from "path";
import { readdir, stat } from "fs/promises";
import { spawn } from "child_process";
import readline from "readline";

const PORT = 3000;
// Resolve the root directory of the project
const WORKSPACE_DIR = resolve(join(import.meta.dir, ".."));

// CORS headers helper
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, x-local-path",
};

// Prompt user confirmation in terminal
function askConfirmation(command: string): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question(`\n⚠️  [AI Execution Request] The AI wants to run the following command:\n   👉 \x1b[33m${command}\x1b[0m\n   Allow execution? (y/N): `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

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
			if (url.pathname === "/files" || url.pathname === "/file" || url.pathname === "/execute") {
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

			// POST /file - Write/create file content
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
				await Bun.write(safePath, content);

				console.log(`Saved file: ${filePathParam} to ${allowedPath}`);
				return Response.json({ success: true, path: filePathParam }, { headers: corsHeaders });
			}

			// POST /execute - Execute terminal command
			if (url.pathname === "/execute" && req.method === "POST") {
				const body = await req.json();
				const { command } = body;

				if (!command || typeof command !== "string") {
					return Response.json(
						{ error: "Invalid request body. 'command' is required." },
						{ status: 400, headers: corsHeaders }
					);
				}

				const normalized = command.trim();
				
				// 1. Safety check for command chaining/redirection
				const dangerousChars = [";", "&&", "|", "||", ">", "<", "`", "$("];
				if (dangerousChars.some(char => normalized.includes(char))) {
					return Response.json(
						{ error: "Access Denied: Dangerous command chaining/redirection characters are blocked." },
						{ status: 400, headers: corsHeaders }
					);
				}

				// 2. Safety check against whitelist
				const isWhitelisted = 
					normalized === "bun install" ||
					normalized.startsWith("bun install ") ||
					normalized === "bun add" ||
					normalized.startsWith("bun add ") ||
					normalized === "bunx sv create" ||
					normalized.startsWith("bunx sv create ") ||
					normalized === "bun test" ||
					normalized.startsWith("bun test ") ||
					normalized === "bun run dev" ||
					normalized.startsWith("bun run dev ");

				if (!isWhitelisted) {
					return Response.json(
						{ error: "Access Denied: Command is not whitelisted. Allowed: bun install, bun add, bunx sv create, bun test, bun run dev" },
						{ status: 400, headers: corsHeaders }
					);
				}

				// 3. Prompt user confirmation in bridge terminal
				const confirmed = await askConfirmation(normalized);
				if (!confirmed) {
					console.log(`Command execution denied by user: ${normalized}`);
					return Response.json(
						{ error: "Command execution denied by the user in terminal." },
						{ status: 403, headers: corsHeaders }
					);
				}

				console.log(`Executing command in ${allowedPath}: ${normalized}`);

				// Parse command into binary and arguments
				const args = normalized.split(/\s+/);
				const cmd = args.shift() || "";

				try {
					const isDevServer = normalized.startsWith("bun run dev");

					if (isDevServer) {
						// For run dev, spawn in background, capture initial output for 2 seconds, then return
						const proc = spawn(cmd, args, { cwd: allowedPath, shell: true });
						
						let output = "";
						proc.stdout?.on("data", (data) => {
							output += data.toString();
						});
						proc.stderr?.on("data", (data) => {
							output += data.toString();
						});

						await new Promise((resolve) => setTimeout(resolve, 2000));

						return Response.json(
							{ 
								success: true, 
								output: `[Dev server started in background]\n${output}\n(Process is running on background PID ${proc.pid})` 
							},
							{ headers: corsHeaders }
						);
					} else {
						// For standard commands, execute to completion
						const proc = spawn(cmd, args, { cwd: allowedPath, shell: true });
						
						let stdout = "";
						let stderr = "";

						proc.stdout?.on("data", (data) => {
							const str = data.toString();
							stdout += str;
							process.stdout.write(str);
						});
						proc.stderr?.on("data", (data) => {
							const str = data.toString();
							stderr += str;
							process.stderr.write(str);
						});

						// Pipe stdin so interactive commands (like bunx sv create) can receive terminal answers
						process.stdin.resume();
						process.stdin.pipe(proc.stdin);

						const code = await new Promise<number | null>((resolve) => {
							proc.on("close", (code) => {
								process.stdin.unpipe(proc.stdin);
								process.stdin.pause();
								resolve(code);
							});
						});

						return Response.json(
							{ 
								success: code === 0, 
								output: stdout || stderr,
								error: code !== 0 ? stderr || `Exit code ${code}` : undefined,
								exitCode: code
							},
							{ headers: corsHeaders }
						);
					}
				} catch (execError: any) {
					console.error("Execution error:", execError);
					return Response.json(
						{ error: `Execution error: ${execError.message}` },
						{ status: 500, headers: corsHeaders }
					);
				}
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
