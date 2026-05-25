import type { OllamaModel, Message } from './types';

// Default Ollama API URL
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/**
 * Helper to determine the correct Ollama endpoint URL.
 * If the site is deployed publicly and the user targets localhost, we fetch directly.
 * Otherwise, we route via SvelteKit proxy to handle CORS/local dev.
 */
function getTargetUrl(path: string, ollamaUrl: string): { url: string; useProxy: boolean } {
	const isBrowser = typeof window !== 'undefined';
	const isPageLocal = isBrowser && 
		(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

	let isTargetLocal = false;
	try {
		const parsed = new URL(ollamaUrl);
		isTargetLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
	} catch (e) {
		isTargetLocal = ollamaUrl.includes('localhost') || ollamaUrl.includes('127.0.0.1');
	}

	if (isBrowser && !isPageLocal && isTargetLocal) {
		return {
			url: `${ollamaUrl}/${path}`,
			useProxy: false
		};
	}

	return {
		url: `/api/ollama/${path}`,
		useProxy: true
	};
}

/**
 * Fetch available Ollama models from local service (via SvelteKit proxy or direct fetch)
 */
export async function fetchModels(ollamaUrl: string = DEFAULT_OLLAMA_URL): Promise<OllamaModel[]> {
	if (typeof window === 'undefined') return [];
	try {
		const target = getTargetUrl('api/tags', ollamaUrl);
		const headers: Record<string, string> = {};
		if (target.useProxy) {
			headers['x-ollama-url'] = ollamaUrl;
		}

		const res = await fetch(target.url, { headers });

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
 * Stream a chat completion from Ollama (via SvelteKit proxy or direct fetch)
 */
export async function streamChat(
	options: {
		messages: Message[];
		model: string;
		systemPrompt?: string;
		ollamaUrl?: string;
		temperature?: number;
		topP?: number;
		topK?: number;
		numCtx?: number;
		numPredict?: number;
		repeatPenalty?: number;
	},
	onChunk: (chunk: string) => void,
	onDone: (fullResponse: string) => void,
	onError: (error: Error) => void,
	signal?: AbortSignal
) {
	const { messages, model, systemPrompt, ollamaUrl = DEFAULT_OLLAMA_URL, temperature = 0.7, topP, topK, numCtx, numPredict, repeatPenalty } = options;

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

		// Limit duplicating the system prompt into the user message only if it is short (e.g., < 1500 characters).
		// Duplicating large reference files/contexts overflows the context window and causes reasoning loops.
		if (systemPrompt && chatMessages.length > 0 && systemPrompt.length < 1500) {
			let lastUserMsg = null;
			for (let i = chatMessages.length - 1; i >= 0; i--) {
				if (chatMessages[i].role === 'user') {
					lastUserMsg = chatMessages[i];
					break;
				}
			}

			if (lastUserMsg) {
				lastUserMsg.content += `\n\n---\n[System Instructions & Reference Context]:\n${systemPrompt}`;
			}
		}

		if (systemPrompt) {
			chatMessages.unshift({
				role: 'system',
				content: systemPrompt
			});
		}

		const target = getTargetUrl('api/chat', ollamaUrl);
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		if (target.useProxy) {
			headers['x-ollama-url'] = ollamaUrl;
		}

		const response = await fetch(target.url, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				model,
				messages: chatMessages,
				options: {
					temperature,
					top_p: topP,
					top_k: topK,
					num_ctx: numCtx,
					num_predict: numPredict === 0 ? -1 : numPredict,
					repeat_penalty: repeatPenalty
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

		try {
			const decoder = new TextDecoder('utf-8');
			let buffer = '';
			let fullResponseText = '';
			let hasStartedThinking = false;
			let hasFinishedThinking = false;
			let loopDetected = false;

			while (true) {
				if (signal?.aborted) {
					throw new DOMException('The user aborted a request.', 'AbortError');
				}
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
						
						const thinking = json.message?.thinking || json.message?.reasoning || '';
						const content = json.message?.content || '';
						let chunkToStream = '';

						if (thinking) {
							if (!hasStartedThinking) {
								chunkToStream += '<think>';
								hasStartedThinking = true;
							}
							chunkToStream += thinking;
						} else if (content) {
							if (hasStartedThinking && !hasFinishedThinking) {
								chunkToStream += '</think>';
								hasFinishedThinking = true;
							}
							chunkToStream += content;
						}

						if (chunkToStream) {
							fullResponseText += chunkToStream;
							onChunk(chunkToStream);

							// Check for repetition loop
							const repetition = detectRepetition(fullResponseText);
							if (repetition.detected) {
								const warning = '\n\n⚠️ **[Repetition loop detected! Generation stopped / ตรวจพบข้อความวนซ้ำ ระบบจึงหยุดทำงาน]**';
								onChunk(warning);
								fullResponseText += warning;
								loopDetected = true;
								break;
							}
						}
						
						if (json.done) {
							break;
						}
					} catch (e: any) {
						console.warn('Error parsing stream JSON line:', e, line);
					}
				}

				if (loopDetected) {
					break;
				}
			}

			// Ensure we close the think tag if the stream finished while thinking
			if (!loopDetected && hasStartedThinking && !hasFinishedThinking) {
				onChunk('</think>');
				fullResponseText += '</think>';
				hasFinishedThinking = true;
			}

			// Handle any remaining text in buffer
			if (!loopDetected && buffer.trim()) {
				try {
					const json = JSON.parse(buffer);
					const thinking = json.message?.thinking || json.message?.reasoning || '';
					const content = json.message?.content || '';
					let chunkToStream = '';

					if (thinking) {
						if (!hasStartedThinking) {
							chunkToStream += '<think>';
							hasStartedThinking = true;
						}
						chunkToStream += thinking;
					} else if (content) {
						if (hasStartedThinking && !hasFinishedThinking) {
							chunkToStream += '</think>';
							hasFinishedThinking = true;
						}
						chunkToStream += content;
					}

					if (chunkToStream) {
						fullResponseText += chunkToStream;
						onChunk(chunkToStream);
					}
				} catch (e) {
					// Ignore trailing syntax details
				}
			}

			// Double check closing tag
			if (!loopDetected && hasStartedThinking && !hasFinishedThinking) {
				onChunk('</think>');
				fullResponseText += '</think>';
				hasFinishedThinking = true;
			}

			onDone(fullResponseText);
		} finally {
			try {
				await reader.cancel();
			} catch (e) {}
		}
	} catch (error: any) {
		if (error.name === 'AbortError') {
			// Request was cancelled by user
			return;
		}
		console.error('Error during streaming chat:', error);
		onError(error);
	}
}

/**
 * Detects if the given text ends with a sequence of characters repeated consecutively.
 * Returns true and the repeated pattern if a loop is detected.
 */
export function detectRepetition(text: string, maxRepeats: number = 3): { detected: boolean; pattern: string } {
	const minPatternLen = 10; // Avoid false positives on small phrases or formatting syntax
	const textToCheck = text.trim();
	// Limit pattern search space for performance on very long text histories
	const maxPatternLen = Math.min(500, Math.floor(textToCheck.length / maxRepeats));

	if (maxPatternLen < minPatternLen) {
		return { detected: false, pattern: '' };
	}

	// Slice text once to keep the check area small
	const charsNeeded = maxRepeats * maxPatternLen;
	const checkArea = textToCheck.slice(-charsNeeded);
	const checkAreaLen = checkArea.length;

	for (let P = minPatternLen; P <= maxPatternLen; P++) {
		const startIdx = checkAreaLen - (maxRepeats * P);
		const chunk0 = checkArea.substring(startIdx, startIdx + P);
		
		let isRepetitive = true;
		for (let r = 1; r < maxRepeats; r++) {
			const currentChunk = checkArea.substring(startIdx + r * P, startIdx + (r + 1) * P);
			if (currentChunk !== chunk0) {
				isRepetitive = false;
				break;
			}
		}
		
		if (isRepetitive) {
			const trimmed = chunk0.trim();
			
			// Pattern should have a reasonable trimmed length
			if (trimmed.length < 10) continue;
			
			// Avoid triggering on repeated single characters (e.g. '----------', '..........', '          ')
			const firstChar = trimmed[0];
			let allSame = true;
			for (let i = 1; i < trimmed.length; i++) {
				if (trimmed[i] !== firstChar) {
					allSame = false;
					break;
				}
			}
			if (allSame) continue;
			
			return { detected: true, pattern: chunk0 };
		}
	}
	
	return { detected: false, pattern: '' };
}
