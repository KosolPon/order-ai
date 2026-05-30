import type { Conversation, Project } from './types';
import { roleStore } from './roleStore.svelte';
import { classifyPromptDynamic } from './agents';

interface BuildPromptParams {
	conv: Conversation | null;
	globalContext: string;
	projects: Project[];
	useCanvas: boolean;
	memories: { content: string }[];
	canvasFiles: { name: string; type: string; content: string }[];
	enableWorkspaceBridge?: boolean;
	workspaceFileTree?: string[];
	workspaceReadFiles?: { path: string; content: string }[];
}

export function buildCombinedSystemPrompt({
	conv,
	globalContext,
	projects,
	useCanvas,
	memories,
	canvasFiles,
	enableWorkspaceBridge,
	workspaceFileTree,
	workspaceReadFiles
}: BuildPromptParams): string {
	if (!conv) return '';
	const parts: string[] = [];

	if (globalContext?.trim()) {
		parts.push(`[Global Context]:\n${globalContext.trim()}`);
	}

	// Inject Active Agent Role system prompt based on conversation setting or auto-classification
	const routingSetting = conv.agentRole || 'auto';
	let activeRoleId = 'general';

	if (routingSetting === 'auto') {
		const userMessages = conv.messages.filter(m => m.role === 'user');
		const latestPrompt = userMessages[userMessages.length - 1]?.content || '';
		activeRoleId = classifyPromptDynamic(latestPrompt, roleStore.customRoles);
	} else {
		activeRoleId = routingSetting;
	}

	const roleConfig = roleStore.getRole(activeRoleId);
	if (roleConfig) {
		parts.push(`[Active Agent Role - ${roleConfig.name}]:\n${roleConfig.prompt}`);
	}

	if (conv.projectId) {
		const project = projects.find((p) => p.id === conv.projectId);
		if (project) {
			let projectPrompt = '';
			if (project.context?.trim()) {
				projectPrompt += `[Project Context - ${project.name}]:\n${project.context.trim()}`;
			}
			
			// Inject file contents if present
			if (project.files && project.files.length > 0) {
				if (projectPrompt) projectPrompt += '\n\n';
				projectPrompt += `[Project Reference Files - ${project.name}]:\n`;
				projectPrompt += `CRITICAL DIRECTIVE: You must use the following files as your primary reference and knowledge source for all your answers in this conversation. If there are any differences between these files and your pre-trained knowledge (e.g. Svelte 5 runes syntax vs older versions), you MUST prioritize the information and syntax described in these files:`;
				for (const file of project.files) {
					projectPrompt += `\n\nFile "${file.name}":\n\`\`\`\n${file.content}\n\`\`\``;
				}
			}
			
			if (projectPrompt) {
				parts.push(projectPrompt);
			}
		}
	}

	if (conv.context?.trim()) {
		parts.push(`[Chat Context]:\n${conv.context.trim()}`);
	}

	// Inject AI Memories
	if (memories && memories.length > 0) {
		let memoryPrompt = `[AI Memories / Key Facts to Remember]:\n`;
		memories.forEach((mem, index) => {
			memoryPrompt += `${index + 1}. ${mem.content}\n`;
		});
		parts.push(memoryPrompt);
	}

	// Inject Canvas Files (Artifacts)
	if (canvasFiles && canvasFiles.length > 0) {
		let canvasPrompt = `[Active Canvas Files (Artifacts) in this Chat]:\nThese are files that you or the user have created/modified in the interactive Workspace (Canvas). You can reference, reuse, or update these files.\n`;
		for (const file of canvasFiles) {
			canvasPrompt += `\nFile "${file.name}" (${file.type}):\n\`\`\`\n${file.content}\n\`\`\``;
		}
		parts.push(canvasPrompt);
	}

	// Inject workspace file tree and pre-loaded file contents
	if (enableWorkspaceBridge && workspaceFileTree && workspaceFileTree.length > 0) {
		let treePrompt = `[WORKSPACE FILE TREE]:\nThe following files exist in the connected local project workspace. You can read, create, or modify any of these files using <canvas> or <canvas-patch> tags:\n\n`;
		treePrompt += workspaceFileTree.join('\n');
		parts.push(treePrompt);
	}

	if (enableWorkspaceBridge && workspaceReadFiles && workspaceReadFiles.length > 0) {
		let readPrompt = `[WORKSPACE FILE CONTENTS]:\nThe following files have been pre-loaded from the workspace for your reference. Use these as the source of truth when making edits — always prefer <canvas-patch> for targeted changes:\n`;
		for (const f of workspaceReadFiles) {
			readPrompt += `\nFile "${f.path}":\n\`\`\`\n${f.content}\n\`\`\``;
		}
		parts.push(readPrompt);
	}

	// Append critical canvas syntax instructions for the AI
	if (useCanvas) {
		let canvasDirective = `[CRITICAL CANVAS DIRECTIVE]: You have access to an interactive Workspace (Canvas) on the right side of the screen. You can display/modify documents, source code, or HTML pages for the user.

To CREATE a new file or make LARGE changes to an existing file, wrap the complete content inside:
<canvas name="filename.ext" type="html|markdown|code|text">...full file content...</canvas>

To make SMALL, TARGETED edits to an existing file (preferred when changing only a few lines), use the patch tag instead:
<canvas-patch name="filename.ext">
<search>exact string to find (must be unique in the file)</search>
<replace>replacement string</replace>
</canvas-patch>

IMPORTANT: Always prefer <canvas-patch> over <canvas> when modifying existing files with small changes. Only use <canvas> (full rewrite) when creating new files or making extensive changes. Do not write explanations inside canvas blocks, only file content.`;

		if (enableWorkspaceBridge) {
			canvasDirective += `\n\n[LOCAL WORKSPACE ACCESS ENABLED]: The Workspace is connected to the user's actual local filesystem. Files written via <canvas> or patched via <canvas-patch> are saved directly to the user's real project directory. Do not apologize or claim you cannot modify local files; write or patch them confidently and inform the user what was updated.${
				workspaceFileTree && workspaceFileTree.length > 0
					? ' You have been given the full file tree and pre-loaded file contents above — use them as context to make accurate, targeted edits.'
					: ''
			}`;
		}
		
		parts.push(canvasDirective);
	}

	// Inject Response Style directives
	const tone = conv.outputTone || 'auto';
	const length = conv.outputLength || 'auto';
	const thinking = conv.thinkingDepth || 'auto';

	if (tone === 'creative') {
		parts.push(`[TONE DIRECTIVE]: Be creative, innovative, and expressive. Feel free to explore novel suggestions and expressive formatting.`);
	} else if (tone === 'precise') {
		parts.push(`[TONE DIRECTIVE]: Be extremely precise, accurate, objective, and factual. Avoid speculation, assumptions, or fluffy language.`);
	}

	if (length === 'summary') {
		parts.push(`[LENGTH DIRECTIVE]: Provide a very concise summary. Keep your output short, direct, and to the point.`);
	} else if (length === 'article') {
		parts.push(`[LENGTH DIRECTIVE]: Provide a long, comprehensive, in-depth article or report style response with thorough, detailed explanations.`);
	} else if (length === 'detailed') {
		parts.push(`[LENGTH DIRECTIVE]: Provide a detailed, clear, and step-by-step response with standard length.`);
	}

	if (thinking === 'fast') {
		parts.push(`[THINKING DIRECTIVE]: Answer directly and fast. Do not explain your steps or reason aloud.`);
	} else if (thinking === 'thinking') {
		parts.push(`[THINKING DIRECTIVE]: Think carefully and outline your logical step-by-step reasoning process before giving the final answer.`);
	} else if (thinking === 'reflecting') {
		parts.push(`[THINKING DIRECTIVE]: Think step-by-step. Before rendering the final output, reflect on your answer, cross-examine it for potential errors, edge cases, or bugs, and output the polished, corrected result.`);
	}

	// Enforce language alignment to match the user's language (specifically Thai if the user asks in Thai)
	parts.push(`[LANGUAGE INSTRUCTION]: Always respond in the language used by the user. If the user prompts in Thai (ภาษาไทย), you must write all your responses, explanations, and code comments in Thai. Do not output in other languages such as Korean or English unless referencing technical keywords.`);

	return parts.join('\n\n');
}
