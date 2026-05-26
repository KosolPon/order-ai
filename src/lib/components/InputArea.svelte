<script lang="ts">
	import type { OllamaModel, Attachment } from '$lib/types';
	import { onDestroy } from 'svelte';
	
	let {
		input = $bindable(),
		models = [],
		selectedModel = $bindable(),
		activeModels = [''],
		onModelPillClick,
		attachments = $bindable([]),
		isGenerating = false,
		isBusy = false,
		useCanvas = $bindable(false),
		onSend,
		onStop
	} = $props<{
		input: string;
		models: OllamaModel[];
		selectedModel: string;
		activeModels?: string[];
		onModelPillClick: () => void;
		attachments: Attachment[];
		isGenerating: boolean;
		isBusy?: boolean;
		useCanvas: boolean;
		onSend: () => void;
		onStop: () => void;
	}>();

	let textareaElement = $state<HTMLTextAreaElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let showLinkInput = $state(false);
	let linkUrl = $state('');
	let isLoadingLink = $state(false);
	let linkInputEl = $state<HTMLInputElement | null>(null);
	let isListening = $state(false);
	let recognition: any = null;
	let baseInput = '';
	let isMultiline = $state(false);

	function initSpeechRecognition() {
		if (typeof window === 'undefined') return;
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SpeechRecognition) {
			alert('Speech recognition is not supported in this browser. Please use Chrome, Safari, or Edge.');
			return;
		}

		recognition = new SpeechRecognition();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'th-TH';

		recognition.onstart = () => {
			isListening = true;
			baseInput = input;
		};

		recognition.onend = () => {
			isListening = false;
		};

		recognition.onerror = (e: any) => {
			console.error('Speech recognition error:', e);
			if (e.error !== 'no-speech') {
				isListening = false;
			}
		};

		recognition.onresult = (event: any) => {
			let interimTranscript = '';
			let finalTranscript = '';

			for (let i = event.resultIndex; i < event.results.length; ++i) {
				if (event.results[i].isFinal) {
					finalTranscript += event.results[i][0].transcript;
				} else {
					interimTranscript += event.results[i][0].transcript;
				}
			}

			let currentInput = baseInput;
			if (finalTranscript || interimTranscript) {
				const transcript = (finalTranscript + interimTranscript).trim();
				if (transcript) {
					currentInput = baseInput ? `${baseInput} ${transcript}` : transcript;
				}
			}
			input = currentInput;
			adjustHeight();
		};
	}

	function toggleSpeech() {
		if (!recognition) {
			initSpeechRecognition();
		}

		if (!recognition) return;

		if (isListening) {
			recognition.stop();
		} else {
			try {
				recognition.start();
			} catch (err) {
				console.error('Failed to start speech recognition:', err);
				initSpeechRecognition();
				recognition?.start();
			}
		}
	}

	// Auto-resize textarea logic
	$effect(() => {
		if (input === '') {
			if (textareaElement) {
				textareaElement.style.height = 'auto';
			}
			isMultiline = false;
		} else {
			adjustHeight();
		}
	});

	function adjustHeight() {
		if (textareaElement) {
			textareaElement.style.height = 'auto';
			const scrollHeight = textareaElement.scrollHeight;
			textareaElement.style.height = `${Math.min(scrollHeight, 200)}px`;
			
			// Detect multiline:
			// 1. Text contains newline.
			// 2. scrollHeight is greater than standard single line (approx 45px).
			// 3. input length is substantial (e.g. > 50 chars).
			isMultiline = scrollHeight > 45 || input.includes('\n') || input.length > 50;
		} else {
			isMultiline = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// Send message on Enter without shift
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if ((input.trim() || attachments.length > 0) && !isGenerating && !isBusy) {
				onSend();
			}
		}
	}

	function triggerFileInput() {
		if (fileInputEl) {
			fileInputEl.click();
		}
	}

	function processImageFile(file: File) {
		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target?.result as string;
			const id = Math.random().toString(36).substring(2, 9);
			const previewUrl = URL.createObjectURL(file);
			attachments = [...attachments, {
				id,
				type: 'image',
				name: file.name || 'Pasted Image',
				content,
				previewUrl
			}];
		};
		reader.readAsDataURL(file);
	}

	function processTextFile(file: File) {
		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target?.result as string;
			const id = Math.random().toString(36).substring(2, 9);
			attachments = [...attachments, {
				id,
				type: 'file',
				name: file.name,
				content
			}];
		};
		reader.readAsText(file);
	}

	function handleFileChange(e: Event) {
		const inputEl = e.target as HTMLInputElement;
		const files = inputEl.files;
		if (!files) return;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.type.startsWith('image/')) {
				processImageFile(file);
			} else {
				processTextFile(file);
			}
		}
		inputEl.value = ''; // reset so same file can be uploaded again
	}

	function handlePaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of items) {
			if (item.type.indexOf('image') !== -1) {
				const file = item.getAsFile();
				if (file) {
					e.preventDefault();
					processImageFile(file);
				}
			}
		}
	}

	async function addLinkAttachment() {
		let urlStr = linkUrl.trim();
		if (!urlStr) return;

		if (!/^https?:\/\//i.test(urlStr)) {
			urlStr = 'https://' + urlStr;
		}

		isLoadingLink = true;
		try {
			const res = await fetch(`/api/scrape?url=${encodeURIComponent(urlStr)}`);
			const data = await res.json();
			if (data.error) {
				alert(`Failed to fetch link: ${data.error}`);
			} else {
				const id = Math.random().toString(36).substring(2, 9);
				let host = urlStr;
				try {
					host = new URL(urlStr).hostname;
				} catch (e) {}

				attachments = [...attachments, {
					id,
					type: 'link',
					name: host,
					content: `URL: ${urlStr}\n\nContent:\n${data.text}`
				}];
				linkUrl = '';
				showLinkInput = false;
			}
		} catch (err: any) {
			alert(`Failed to fetch link: ${err.message || err}`);
		} finally {
			isLoadingLink = false;
		}
	}

	function handleLinkKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addLinkAttachment();
		}
	}

	function removeAttachment(id: string) {
		const item = attachments.find((a: Attachment) => a.id === id);
		if (item && item.previewUrl) {
			URL.revokeObjectURL(item.previewUrl);
		}
		attachments = attachments.filter((a: Attachment) => a.id !== id);
	}

	onDestroy(() => {
		// Clean up object URLs to prevent leaks
		attachments.forEach((attr: Attachment) => {
			if (attr.previewUrl) {
				URL.revokeObjectURL(attr.previewUrl);
			}
		});
		if (recognition) {
			recognition.stop();
		}
	});

	// Focus the link input popover when it appears
	$effect(() => {
		if (showLinkInput && linkInputEl) {
			linkInputEl.focus();
		}
	});
</script>

<div class="input-container">
	<div class="input-wrapper">
		<!-- Pill Input Box -->
		<div class="pill-box-single">
			
			<!-- Row 1: Attachment Pills (Only displays if attachments exist) -->
			{#if attachments.length > 0}
				<div class="attachments-list">
					{#each attachments as attr (attr.id)}
						<div class="attachment-pill">
							{#if attr.type === 'image'}
								<img class="attachment-thumb" src={attr.previewUrl || attr.content} alt={attr.name} />
							{:else if attr.type === 'link'}
								<svg class="attachment-icon link-icon" viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
								</svg>
							{:else}
								<svg class="attachment-icon file-icon" viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
								</svg>
							{/if}
							<div class="attachment-info" title={attr.name}>
								<span class="attachment-name">{attr.name}</span>
							</div>
							<button class="remove-attachment" onclick={() => removeAttachment(attr.id)} title="Remove">
								<svg viewBox="0 0 24 24" width="12" height="12">
									<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Row 2: Input Controls (Horizontal Align) -->
			<div class="input-row" class:multiline={isMultiline}>
				<!-- Prompt Textarea on the left -->
				<textarea
					bind:this={textareaElement}
					class="prompt-textarea"
					placeholder="Ask anything, type a prompt..."
					bind:value={input}
					onkeydown={handleKeydown}
					oninput={adjustHeight}
					onpaste={handlePaste}
					rows="1"
					disabled={isGenerating}
				></textarea>

				<!-- Model Selector on the right of prompt -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div 
					class="model-selector-wrapper"
					class:disabled={isGenerating || models.length === 0}
					class:routing-active={activeModels.length > 1}
					title={activeModels.length > 1 ? `โหมดลูกโซ่: ${activeModels.join(' ➔ ')}` : 'คลิกเพื่อเลือกโมเดล'}
					onclick={activeModels.length > 1 ? onModelPillClick : undefined}
				>
					{#if activeModels.length > 1}
						<svg class="model-icon collaboration-glow" viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
						</svg>
						<span class="model-selected-text collaboration-text">
							{activeModels.map((m: string) => m.split(':')[0] || 'Unknown').join(' + ')}
						</span>
					{:else}
						<svg class="model-icon" viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
						</svg>
						<span class="model-selected-text">
							{selectedModel || (models.length === 0 ? "No models found" : "Select model")}
						</span>
						<select 
							class="model-select" 
							bind:value={selectedModel}
							disabled={isGenerating || models.length === 0}
						>
							{#if models.length === 0}
								<option value="">No models found</option>
							{:else}
								{#each models as model}
									<option value={model.name}>{model.name}</option>
								{/each}
							{/if}
						</select>
						<svg class="chevron-down" viewBox="0 0 24 24" width="12" height="12">
							<path fill="currentColor" d="M7 10l5 5 5-5z"/>
						</svg>
					{/if}
				</div>

				<!-- Action Buttons on the far right -->
				<div class="action-buttons">
					<input 
						type="file" 
						bind:this={fileInputEl} 
						onchange={handleFileChange} 
						style="display: none;" 
						multiple 
					/>

					{#if !isGenerating}
						<!-- Plus Attach File Button -->
						<button 
							class="control-btn attach-btn" 
							onclick={triggerFileInput}
							title="Attach file or image"
						>
							<svg viewBox="0 0 24 24" width="18" height="18">
								<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
							</svg>
						</button>

						<!-- Globe URL Link Button -->
						<div class="link-btn-wrapper">
							<button 
								class="control-btn link-btn" 
								onclick={() => showLinkInput = !showLinkInput}
								title="Attach URL link"
							>
								<svg viewBox="0 0 24 24" width="18" height="18">
									<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
								</svg>
							</button>

							{#if showLinkInput}
								<div class="link-input-popover">
									<input 
										type="url" 
										placeholder="Paste link here..." 
										bind:value={linkUrl} 
										onkeydown={handleLinkKeydown} 
										bind:this={linkInputEl}
										disabled={isLoadingLink}
									/>
									<button class="link-add-btn" onclick={addLinkAttachment} disabled={isLoadingLink || !linkUrl.trim()}>
										{#if isLoadingLink}
											<span class="spinner"></span>
										{:else}
											Add
										{/if}
									</button>
									<button class="link-cancel-btn" onclick={() => showLinkInput = false} disabled={isLoadingLink}>
										Cancel
									</button>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Canvas Mode Toggle Button -->
					<button 
						class="control-btn canvas-toggle-btn" 
						class:active={useCanvas}
						onclick={() => {
							useCanvas = !useCanvas;
							localStorage.setItem('use_canvas_directive', String(useCanvas));
						}}
						disabled={isGenerating}
						title={useCanvas ? "ปิดโหมด Canvas (ส่งเป็น Markdown ปกติ)" : "เปิดโหมด Canvas (ส่งออกเอกสาร/โค้ดในหน้าต่างขวา)"}
						aria-label={useCanvas ? "Disable Canvas (Artifacts) Mode" : "Enable Canvas (Artifacts) Mode"}
					>
						<svg viewBox="0 0 24 24" width="18" height="18">
							<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
						</svg>
					</button>

					{#if isGenerating}
						<button 
							class="control-btn stop-btn" 
							onclick={onStop}
							title="Stop generating"
						>
							<svg viewBox="0 0 24 24" width="18" height="18">
								<path fill="currentColor" d="M6 6h12v12H6V6z"/>
							</svg>
						</button>
					{:else}
						<!-- Microphone Voice Input Button -->
						<button 
							class="control-btn mic-btn" 
							class:listening={isListening}
							onclick={toggleSpeech}
							title={isListening ? "Stop listening" : "Use Voice Input"}
							type="button"
						>
							<svg viewBox="0 0 24 24" width="18" height="18">
								<path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
							</svg>
						</button>

						<button 
							class="control-btn send-btn" 
							class:active={(input.trim().length > 0 || attachments.length > 0) && models.length > 0 && !isBusy}
							onclick={onSend}
							disabled={(input.trim().length === 0 && attachments.length === 0) || models.length === 0 || isBusy}
							title={isBusy ? "AI กำลังประมวลผลแชตอื่นอยู่" : "Send prompt"}
						>
							<svg viewBox="0 0 24 24" width="18" height="18">
								<path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
							</svg>
						</button>
					{/if}
				</div>
			</div>

		</div>
	</div>
</div>

<style>
	.input-container {
		width: 100%;
		max-width: 1000px;
		margin: 0 auto;
		padding: 0 16px 24px 16px;
		background-color: var(--bg-primary);
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-sizing: border-box;
	}

	.input-wrapper {
		width: 100%;
	}

	.pill-box-single {
		width: 100%;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 24px;
		padding: 10px 14px;
		box-shadow: var(--shadow-md);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		display: flex;
		flex-direction: column;
		gap: 10px;
		box-sizing: border-box;
	}

	.pill-box-single:focus-within {
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 1px var(--accent-blue), var(--shadow-lg);
	}

	.input-row {
		display: flex;
		flex-direction: row;
		align-items: flex-end;
		gap: 12px;
		width: 100%;
	}

	.input-row.multiline {
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
	}

	.input-row.multiline .prompt-textarea {
		width: 100%;
		flex: 1 1 100%;
		padding-right: 10px;
	}

	.input-row.multiline .model-selector-wrapper {
		margin-right: auto;
		margin-bottom: 0;
	}

	.input-row.multiline .action-buttons {
		margin-left: auto;
		margin-bottom: 0;
	}

	.prompt-textarea {
		flex: 1;
		width: 100%;
		resize: none;
		max-height: 200px;
		font-size: 1.05rem;
		line-height: 1.5;
		color: var(--text-primary);
		border: none;
		background: none;
		outline: none;
		padding: 6px 0 6px 10px;
		overflow-y: auto;
	}

	.prompt-textarea::placeholder {
		color: var(--text-muted);
	}

	.prompt-textarea:disabled {
		opacity: 0.7;
	}

	/* Custom Model Dropdown */
	.model-selector-wrapper {
		display: flex;
		align-items: center;
		gap: 6px;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 17px;
		height: 34px;
		padding: 0 28px 0 10px; /* Space on right for absolute-positioned chevron */
		box-sizing: border-box;
		color: var(--text-secondary);
		position: relative;
		cursor: pointer;
		transition: background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), opacity var(--transition-fast);
		flex-shrink: 0;
		margin-bottom: 2px;
	}

	.model-selector-wrapper:hover:not(.disabled) {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.model-selector-wrapper.disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.model-selector-wrapper:focus-within {
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 1px var(--accent-blue);
	}

	.model-icon {
		color: var(--accent-blue);
		flex-shrink: 0;
		pointer-events: none;
	}

	.model-selected-text {
		font-size: 0.85rem;
		font-weight: 500;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	.model-select {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		z-index: 2;
		appearance: none;
		-webkit-appearance: none;
		border: none;
		outline: none;
		background: transparent;
	}

	.model-select:disabled {
		cursor: not-allowed;
	}

	.chevron-down {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		color: var(--text-muted);
		z-index: 1;
	}

	/* Action Buttons */
	.action-buttons {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
		margin-bottom: 2px;
	}

	.control-btn {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-fast);
		color: var(--text-secondary);
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		cursor: pointer;
		flex-shrink: 0;
	}

	.control-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	.control-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.canvas-toggle-btn.active {
		background-color: color-mix(in srgb, var(--accent-blue) 15%, transparent);
		color: var(--accent-blue);
		border-color: var(--accent-blue);
		box-shadow: 0 0 8px color-mix(in srgb, var(--accent-blue) 10%, transparent);
	}

	.send-btn {
		cursor: not-allowed;
		color: var(--text-muted);
	}

	.send-btn.active {
		background: linear-gradient(135deg, #4285f4, #9b72cb);
		color: #ffffff;
		border: none;
		cursor: pointer;
		box-shadow: var(--shadow-sm);
	}

	.send-btn.active:hover {
		transform: scale(1.05);
		box-shadow: 0 2px 8px rgba(66, 133, 244, 0.4);
	}

	.stop-btn {
		background-color: #ff6b6b;
		color: #ffffff;
		cursor: pointer;
		border: none;
	}

	.stop-btn:hover {
		background-color: #fa5252;
		transform: scale(1.05);
		box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
	}

	.mic-btn {
		transition: all var(--transition-fast);
	}

	.mic-btn.listening {
		background: linear-gradient(135deg, #ea4335, #c5221f);
		color: #ffffff;
		border: none;
		cursor: pointer;
		animation: pulse-mic 1.5s infinite;
		box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.7);
	}

	@keyframes pulse-mic {
		0% {
			transform: scale(1);
			box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.7);
		}
		50% {
			transform: scale(1.08);
			box-shadow: 0 0 0 8px rgba(234, 67, 53, 0);
		}
		100% {
			transform: scale(1);
			box-shadow: 0 0 0 0 rgba(234, 67, 53, 0);
		}
	}

	/* Link Button & Popover */
	.link-btn-wrapper {
		position: relative;
		display: inline-block;
	}

	.link-input-popover {
		position: absolute;
		bottom: 44px;
		right: 0;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 10px;
		display: flex;
		gap: 8px;
		box-shadow: var(--shadow-lg);
		z-index: 100;
		width: 300px;
		box-sizing: border-box;
	}

	.link-input-popover input {
		flex: 1;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 6px 10px;
		color: var(--text-primary);
		font-size: 0.85rem;
		outline: none;
	}

	.link-input-popover input:focus {
		border-color: var(--accent-blue);
	}

	.link-add-btn {
		background: linear-gradient(135deg, #4285f4, #9b72cb);
		color: #ffffff;
		border: none;
		border-radius: 6px;
		padding: 6px 12px;
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 50px;
	}

	.link-add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.link-cancel-btn {
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 6px 12px;
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
	}

	.link-cancel-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: #ffffff;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Attachments List styling */
	.attachments-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border-color);
		width: 100%;
	}

	.attachment-pill {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 10px;
		padding: 5px 8px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
	}

	.attachment-thumb {
		width: 20px;
		height: 20px;
		border-radius: 3px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.attachment-icon {
		color: var(--accent-blue);
		flex-shrink: 0;
	}

	.attachment-info {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.attachment-name {
		font-weight: 500;
	}

	.remove-attachment {
		background: transparent;
		border: none;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 2px;
		border-radius: 50%;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.remove-attachment:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	@media (max-width: 768px) {
		.input-container {
			padding: 0 12px 16px 12px;
		}

		.pill-box-single {
			padding: 8px 10px;
			border-radius: 20px;
			gap: 8px;
		}

		.prompt-textarea {
			font-size: 0.95rem;
		}

		.model-selected-text {
			max-width: 90px;
		}

		.link-input-popover {
			width: 260px;
			right: -40px;
		}
	}

	.model-selector-wrapper.routing-active {
		border-color: rgba(66, 133, 244, 0.4);
		background-color: rgba(66, 133, 244, 0.05);
		cursor: help;
	}

	.collaboration-glow {
		color: #4285f4;
		filter: drop-shadow(0 0 3px rgba(66, 133, 244, 0.3));
	}

	.collaboration-text {
		color: var(--accent-blue) !important;
		font-weight: 600;
	}
</style>
