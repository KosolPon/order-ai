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
}

export interface Conversation {
	id: string;
	title: string;
	messages: Message[];
	createdAt: number;
	model: string;
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
