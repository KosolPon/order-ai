import type { OllamaModel, Message } from './types';

// Default Ollama API URL
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/**
 * Fetch available Ollama models from local service (via SvelteKit proxy)
 */
export async function fetchModels(ollamaUrl: string = DEFAULT_OLLAMA_URL): Promise<OllamaModel[]> {
	try {
		const res = await fetch('/api/ollama/api/tags', {
			headers: {
				'x-ollama-url': ollamaUrl
			}
		});

		if (!res.ok) {
			const errorData = await res.json().catch(() => ({}));
			throw new Error(errorData.error || `HTTP error ${res.status}`);
		}

		const data = await res.json();
		return data.models || [];
	} catch (error) {
		console.error('Error fetching models:', error);
		throw error;
	}
}

/**
 * Stream a chat completion from Ollama (via SvelteKit proxy)
 */
export async function streamChat(
	options: {
		messages: Message[];
		model: string;
		systemPrompt?: string;
		ollamaUrl?: string;
		temperature?: number;
	},
	onChunk: (chunk: string) => void,
	onDone: (fullResponse: string) => void,
	onError: (error: Error) => void,
	signal?: AbortSignal
) {
	const { messages, model, systemPrompt, ollamaUrl = DEFAULT_OLLAMA_URL, temperature = 0.7 } = options;

	try {
		// Prepare chat payload
		const chatMessages = messages.map((m) => {
			let content = m.content;
			
			// Append file and link attachments as system context to the user message
			if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
				const nonImages = m.attachments.filter(a => a.type !== 'image');
				if (nonImages.length > 0) {
					content += '\n\n---';
					content += '\n[Attached Reference Context]:';
					for (const attr of nonImages) {
						if (attr.type === 'file') {
							content += `\n\nFile "${attr.name}":\n\`\`\`\n${attr.content}\n\`\`\``;
						} else if (attr.type === 'link') {
							content += `\n\nWebpage Content from "${attr.name}":\n${attr.content}`;
						}
					}
				}
			}

			const msg: any = {
				role: m.role,
				content: content
			};

			if (m.images && m.images.length > 0) {
				msg.images = m.images.map(img => img.replace(/^data:image\/[a-z]+;base64,/, ''));
			}

			return msg;
		});

		if (systemPrompt) {
			chatMessages.unshift({
				role: 'system',
				content: systemPrompt
			});
		}

		const response = await fetch('/api/ollama/api/chat', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-ollama-url': ollamaUrl
			},
			body: JSON.stringify({
				model,
				messages: chatMessages,
				options: {
					temperature
				},
				stream: true
			}),
			signal
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || `Failed to initiate chat: HTTP ${response.status}`);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('Response body is not readable');
		}

		const decoder = new TextDecoder('utf-8');
		let buffer = '';
		let fullResponseText = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			
			// Parse lines (Ollama responses are NDJSON)
			const lines = buffer.split('\n');
			// Keep the last partial line in the buffer
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const json = JSON.parse(line);
					if (json.error) {
						throw new Error(json.error);
					}
					const content = json.message?.content || '';
					if (content) {
						fullResponseText += content;
						onChunk(content);
					}
					if (json.done) {
						// Stream is finished
						break;
					}
				} catch (e: any) {
					console.warn('Error parsing stream JSON line:', e, line);
				}
			}
		}

		// Handle any remaining text in buffer
		if (buffer.trim()) {
			try {
				const json = JSON.parse(buffer);
				const content = json.message?.content || '';
				if (content) {
					fullResponseText += content;
					onChunk(content);
				}
			} catch (e) {
				// Ignore trailing syntax details
			}
		}

		onDone(fullResponseText);
	} catch (error: any) {
		if (error.name === 'AbortError') {
			// Request was cancelled by user
			return;
		}
		console.error('Error during streaming chat:', error);
		onError(error);
	}
}
