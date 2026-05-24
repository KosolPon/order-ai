export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	model?: string;
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
