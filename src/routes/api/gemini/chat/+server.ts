import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const geminiKey = request.headers.get('x-gemini-key');
	if (!geminiKey || !geminiKey.trim()) {
		return new Response(JSON.stringify({ error: 'Missing Gemini API Key. Please configure it in Settings.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let body: any;
	try {
		body = await request.json();
	} catch (e) {
		return new Response(JSON.stringify({ error: 'Invalid JSON request body.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { model, messages, systemPrompt, temperature = 0.7, topP, topK, numPredict } = body;

	if (!model) {
		return new Response(JSON.stringify({ error: 'Model name is required.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 1. Structure systemInstruction if systemPrompt exists
	let systemInstruction: any = undefined;
	if (systemPrompt && systemPrompt.trim()) {
		systemInstruction = {
			parts: [{ text: systemPrompt.trim() }]
		};
	}

	// 2. Map messages to Gemini's content structures
	const contents: any[] = [];
	for (const msg of messages) {
		// System instructions go to the top level, skip in messages
		if (msg.role === 'system') continue;

		const parts: any[] = [];
		if (msg.content && msg.content.trim()) {
			parts.push({ text: msg.content });
		}

		if (msg.images && msg.images.length > 0) {
			for (const imgBase64 of msg.images) {
				parts.push({
					inlineData: {
						mimeType: 'image/jpeg',
						data: imgBase64
					}
				});
			}
		}

		// Ensure we don't push empty parts
		if (parts.length === 0) continue;

		contents.push({
			role: msg.role === 'assistant' ? 'model' : 'user',
			parts
		});
	}

	// 3. Alternate roles and merge consecutive identical roles
	const normalizedContents: any[] = [];
	for (const turn of contents) {
		if (normalizedContents.length > 0 && normalizedContents[normalizedContents.length - 1].role === turn.role) {
			// Merge parts of consecutive messages with same role
			normalizedContents[normalizedContents.length - 1].parts.push(...turn.parts);
		} else {
			normalizedContents.push(turn);
		}
	}

	// Gemini requires first message to be user role
	if (normalizedContents.length > 0 && normalizedContents[0].role === 'model') {
		normalizedContents.shift();
	}

	if (normalizedContents.length === 0) {
		return new Response(JSON.stringify({ error: 'No valid user or assistant messages found.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 4. Configure generation settings
	const generationConfig: any = {
		temperature
	};
	if (topP !== undefined) generationConfig.topP = topP;
	if (topK !== undefined) generationConfig.topK = topK;
	if (numPredict !== undefined && numPredict > 0) generationConfig.maxOutputTokens = numPredict;

	const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiKey}`;

	try {
		const googleResponse = await fetch(targetUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				contents: normalizedContents,
				systemInstruction,
				generationConfig
			})
		});

		if (!googleResponse.ok) {
			const errorText = await googleResponse.text();
			let errorMessage = `Google API responded with HTTP ${googleResponse.status}`;
			try {
				const errorJson = JSON.parse(errorText);
				errorMessage = errorJson.error?.message || errorMessage;
			} catch (e) {}
			return new Response(JSON.stringify({ error: errorMessage }), {
				status: googleResponse.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Stream translation: Stream Google's SSE format and yield Ollama NDJSON format
		const stream = new ReadableStream({
			async start(controller) {
				const reader = googleResponse.body?.getReader();
				if (!reader) {
					controller.close();
					return;
				}

				const decoder = new TextDecoder('utf-8');
				const encoder = new TextEncoder();
				let buffer = '';

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						buffer += decoder.decode(value, { stream: true });

						// Google streams as a JSON array e.g.,
						// [
						//   { ...candidate chunk... }
						//   ,
						//   { ...candidate chunk... }
						// ]
						// We split the buffer and parse chunks individually.
						
						// Replace JSON array start/end and commas
						let cleanedBuffer = buffer.trim();
						if (cleanedBuffer.startsWith('[')) {
							cleanedBuffer = cleanedBuffer.substring(1).trim();
						}
						if (cleanedBuffer.startsWith(',')) {
							cleanedBuffer = cleanedBuffer.substring(1).trim();
						}
						
						// Try to locate complete JSON objects by brackets
						let index = 0;
						let braceCount = 0;
						let inString = false;
						let escape = false;
						let startIdx = -1;

						while (index < cleanedBuffer.length) {
							const char = cleanedBuffer[index];
							
							if (escape) {
								escape = false;
								index++;
								continue;
							}

							if (char === '\\') {
								escape = true;
								index++;
								continue;
							}

							if (char === '"') {
								inString = !inString;
							}

							if (!inString) {
								if (char === '{') {
									if (braceCount === 0) {
										startIdx = index;
									}
									braceCount++;
								} else if (char === '}') {
									braceCount--;
									if (braceCount === 0 && startIdx !== -1) {
										const jsonString = cleanedBuffer.substring(startIdx, index + 1);
										try {
											const chunkJson = JSON.parse(jsonString);
											const candidate = chunkJson.candidates?.[0];
											if (candidate?.content?.parts) {
												for (const part of candidate.content.parts) {
													if (part.thought) {
														// Gemini 2.0 thinking/reasoning block
														const payload = {
															message: { role: 'assistant', thinking: part.text || '' },
															done: false
														};
														controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'));
													} else if (part.text) {
														// Standard text output block
														const payload = {
															message: { role: 'assistant', content: part.text },
															done: false
														};
														controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'));
													}
												}
											}
										} catch (e) {
											console.warn('Failed to parse chunk JSON string:', e);
										}
										
										// Slice parsed string out of buffer
										cleanedBuffer = cleanedBuffer.substring(index + 1).trim();
										if (cleanedBuffer.startsWith(',')) {
											cleanedBuffer = cleanedBuffer.substring(1).trim();
										}
										index = -1; // Reset search index to start of sliced buffer
										startIdx = -1;
									}
								}
							}
							index++;
						}
						
						// Restore the unparsed part back to the buffer
						buffer = cleanedBuffer;
					}

					// Send done event
					controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + '\n'));
				} catch (err: any) {
					console.error('Error during streaming conversion:', err);
					controller.error(err);
				} finally {
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'application/x-ndjson',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			}
		});
	} catch (error: any) {
		console.error('Gemini connection error:', error);
		return new Response(JSON.stringify({ error: `Connection to Gemini API failed: ${error.message}` }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
