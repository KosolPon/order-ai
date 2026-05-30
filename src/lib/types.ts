import type { AgentRole } from './agents';

export interface Attachment {
	id: string;
	type: 'image' | 'file' | 'link';
	name: string;
	content: string; // base64 for images, text content for files/links
	previewUrl?: string; // object URL for previewing image
}

export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	model?: string;
	images?: string[]; // base64 strings for Ollama API
	attachments?: Attachment[]; // full attachment details for history rendering
	agentRole?: string; // Stored triggered agent role (e.g. 'ui_ux')
	feedback?: 'up' | 'down';
	completedAt?: number;
	duration?: number;
}

export interface ProjectFile {
	id: string;
	name: string;
	content: string; // The text content of the file
	size: number; // File size in bytes
}

export interface Project {
	id: string;
	name: string;
	context: string;
	createdAt: number;
	files?: ProjectFile[]; // Project-level reference files
	localPath?: string; // Target workspace directory path for file syncing
}

export interface Conversation {
	id: string;
	title: string;
	messages: Message[];
	createdAt: number;
	model: string;
	projectId?: string; // Links chat to a project
	context?: string; // Chat-specific system context
	agentRole?: 'auto' | string; // Active routing setting
	outputTone?: 'auto' | 'precise' | 'creative';
	outputLength?: 'auto' | 'summary' | 'detailed' | 'article';
	thinkingDepth?: 'auto' | 'fast' | 'thinking' | 'reflecting';
}

export interface OllamaModel {
	name: string;
	modified_at: string;
	size: number;
	digest: string;
	details: {
		parent_model: string;
		format: string;
		family: string;
		families: string[];
		parameter_size: string;
		quantization_level: string;
	};
}
