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
}

export function buildCombinedSystemPrompt({
	conv,
	globalContext,
	projects,
	useCanvas,
	memories,
	canvasFiles
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

	// Append critical canvas syntax instructions for the AI
	if (useCanvas) {
		parts.push(`[CRITICAL CANVAS DIRECTIVE]: You have access to an interactive Workspace (Canvas) on the right side of the screen. You can display/modify documents, source code, or HTML pages for the user. To create a new file or modify an existing file, you MUST wrap the complete, updated content of the file inside a <canvas name="filename.ext" type="html|markdown|code|text">...</canvas> tag block. Do not write explanations inside the <canvas> block itself, only the exact file contents. The system will extract it and display it in the Canvas panel on the right. For HTML pages, ensure they are self-contained and run standalone.`);
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
