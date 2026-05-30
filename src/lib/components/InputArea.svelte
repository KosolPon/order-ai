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
		onStop,
		onOpenSettings,
		onRefreshModels
	} = $props<{
		input: string;
		models: (OllamaModel & { source?: 'local' | 'cloud' | 'gemini' })[];
		selectedModel: string;
		activeModels?: string[];
		onModelPillClick: () => void;
		attachments: Attachment[];
		isGenerating: boolean;
		isBusy?: boolean;
		useCanvas: boolean;
		onSend: () => void;
		onStop: () => void;
		onOpenSettings?: () => void;
		onRefreshModels?: () => void;
	}>();

	let currentModelObj = $derived(models.find((m: any) => m.name === selectedModel));
	let currentModelSource = $derived(currentModelObj?.source || (selectedModel.startsWith('gemini-') ? 'gemini' : 'local'));

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

	let showModelPopup = $state(false);
	let searchQuery = $state('');
	let activeTab = $state<'all' | 'local' | 'cloud' | 'gemini'>('all');
	let pinnedModelNames = $state<string[]>([]);
	let hiddenModelNames = $state<string[]>([]);
	
	let popupEl = $state<HTMLElement | null>(null);
	let wrapperEl = $state<HTMLElement | null>(null);

	$effect(() => {
		if (typeof window !== 'undefined') {
			const loadPinned = () => {
				const stored = localStorage.getItem('pinned_models');
				if (stored) {
					try {
						pinnedModelNames = JSON.parse(stored);
					} catch (e) {
						pinnedModelNames = [];
					}
				}
			};
			const loadHidden = () => {
				const stored = localStorage.getItem('hidden_models');
				if (stored) {
					try {
						hiddenModelNames = JSON.parse(stored);
					} catch (e) {
						hiddenModelNames = [];
					}
				}
			};
			loadPinned();
			loadHidden();
			window.addEventListener('pinned_models_updated', loadPinned);
			window.addEventListener('hidden_models_updated', loadHidden);
			return () => {
				window.removeEventListener('pinned_models_updated', loadPinned);
				window.removeEventListener('hidden_models_updated', loadHidden);
			};
		}
	});

	function handleOutsideClick(e: MouseEvent) {
		if (showModelPopup && popupEl && !popupEl.contains(e.target as Node) && wrapperEl && !wrapperEl.contains(e.target as Node)) {
			showModelPopup = false;
		}
	}

	$effect(() => {
		if (showModelPopup) {
			window.addEventListener('click', handleOutsideClick);
		}
		return () => {
			window.removeEventListener('click', handleOutsideClick);
		};
	});

	function togglePin(modelName: string, e: MouseEvent) {
		e.stopPropagation();
		if (pinnedModelNames.includes(modelName)) {
			pinnedModelNames = pinnedModelNames.filter(name => name !== modelName);
		} else {
			pinnedModelNames = [...pinnedModelNames, modelName];
			if (hiddenModelNames.includes(modelName)) {
				hiddenModelNames = hiddenModelNames.filter(name => name !== modelName);
				localStorage.setItem('hidden_models', JSON.stringify(hiddenModelNames));
				window.dispatchEvent(new Event('hidden_models_updated'));
			}
		}
		localStorage.setItem('pinned_models', JSON.stringify(pinnedModelNames));
		window.dispatchEvent(new Event('pinned_models_updated'));
	}

	function toggleHide(modelName: string, e: MouseEvent) {
		e.stopPropagation();
		if (hiddenModelNames.includes(modelName)) {
			hiddenModelNames = hiddenModelNames.filter(name => name !== modelName);
		} else {
			hiddenModelNames = [...hiddenModelNames, modelName];
			if (pinnedModelNames.includes(modelName)) {
				pinnedModelNames = pinnedModelNames.filter(name => name !== modelName);
				localStorage.setItem('pinned_models', JSON.stringify(pinnedModelNames));
				window.dispatchEvent(new Event('pinned_models_updated'));
			}
		}
		localStorage.setItem('hidden_models', JSON.stringify(hiddenModelNames));
		window.dispatchEvent(new Event('hidden_models_updated'));
	}

	let filteredModels = $derived(
		models.filter((m: any) => !searchQuery.trim() || m.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	let localModels = $derived(
		filteredModels.filter((m: any) => m.source === 'local' || (!m.source && !m.name.startsWith('gemini-')))
	);

	let cloudModels = $derived(
		filteredModels.filter((m: any) => m.source === 'cloud')
	);

	let geminiModels = $derived(
		filteredModels.filter((m: any) => m.source === 'gemini' || (!m.source && m.name.startsWith('gemini-')))
	);

	let currentTabModels = $derived.by(() => {
		if (activeTab === 'local') {
			return localModels;
		} else if (activeTab === 'cloud') {
			return cloudModels;
		} else if (activeTab === 'gemini') {
			return geminiModels;
		} else {
			return filteredModels;
		}
	});

	let favoriteModels = $derived(
		currentTabModels.filter((m: any) => pinnedModelNames.includes(m.name))
	);

	let normalModels = $derived(
		currentTabModels.filter((m: any) => !pinnedModelNames.includes(m.name) && !hiddenModelNames.includes(m.name))
	);

	let hiddenModels = $derived(
		currentTabModels.filter((m: any) => hiddenModelNames.includes(m.name))
	);

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
				<!-- Model Selector on the right of prompt -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div 
					bind:this={wrapperEl}
					class="model-selector-wrapper"
					class:disabled={isGenerating || models.length === 0}
					class:routing-active={activeModels.length > 1}
					title={activeModels.length > 1 ? `โหมดลูกโซ่: ${activeModels.join(' ➔ ')}` : 'คลิกเพื่อเลือกโมเดล'}
					onclick={(e) => {
						if (activeModels.length > 1) {
							onModelPillClick();
						} else if (!isGenerating && models.length > 0) {
							showModelPopup = !showModelPopup;
						}
					}}
				>
					{#if activeModels.length > 1}
						<svg class="model-icon collaboration-glow" viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
						</svg>
						<span class="model-selected-text collaboration-text">
							{activeModels.map((m: string) => m.split(':')[0] || 'Unknown').join(' + ')}
						</span>
					{:else}
						{#if currentModelSource === 'gemini'}
							<svg class="model-icon gemini-icon" viewBox="0 0 24 24" width="16" height="16">
								<path fill="currentColor" d="M12 2L9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5L12 2zM12 5.8l1.6 4.2 4.2 1.6-4.2 1.6L12 17.4l-1.6-4.2-4.2-1.6 4.2-1.6L12 5.8zm-7 11.2l-1 2.5-2.5 1 2.5 1 1 2.5 1-2.5 2.5-1-2.5-1-1-2.5zm15.5-2.5l-1 2.5-2.5 1 2.5 1 1 2.5 1-2.5 2.5-1-2.5-1-1-2.5z"/>
							</svg>
						{:else}
							{#if currentModelSource === 'cloud'}
								<svg class="model-icon cloud-icon" viewBox="0 0 24 24" width="16" height="16">
									<path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"/>
								</svg>
							{:else}
								<svg class="model-icon local-icon" viewBox="0 0 24 24" width="16" height="16">
									<path fill="currentColor" d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
								</svg>
							{/if}
						{/if}
						<span class="model-selected-text">
							{selectedModel || (models.length === 0 ? "No models found" : "Select model")}
						</span>
						<svg class="chevron-down" viewBox="0 0 24 24" width="12" height="12">
							<path fill="currentColor" d="M7 10l5 5 5-5z"/>
						</svg>
						{#if showModelPopup}
							<!-- Custom Popup -->
							<div 
								bind:this={popupEl} 
								class="model-popup" 
								onclick={(e) => e.stopPropagation()}
							>
								<!-- Search and Header -->
								<div class="model-popup-header">
									<div class="search-input-wrapper">
										<svg class="search-icon" viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
										</svg>
										<input 
											type="text" 
											placeholder="ค้นหาโมเดล..." 
											bind:value={searchQuery}
											onclick={(e) => e.stopPropagation()}
											onkeydown={(e) => {
												if (e.key === 'Escape') showModelPopup = false;
											}}
										/>
										{#if searchQuery}
											<button 
												class="clear-search-btn" 
												onclick={(e) => { e.stopPropagation(); searchQuery = ''; }}
											>
												✕
											</button>
										{/if}
									</div>

									{#if onRefreshModels}
										<button 
											type="button"
											class="popup-header-icon-btn" 
											onclick={(e) => { e.stopPropagation(); onRefreshModels(); }}
											title="รีเฟรชรายชื่อโมเดล"
										>
											<svg viewBox="0 0 24 24" width="16" height="16">
												<path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
											</svg>
										</button>
									{/if}

									{#if onOpenSettings}
										<button 
											type="button"
											class="popup-header-icon-btn" 
											onclick={(e) => { e.stopPropagation(); showModelPopup = false; onOpenSettings(); }}
											title="ตั้งค่าโมเดล/API"
										>
											<svg viewBox="0 0 24 24" width="16" height="16">
												<path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
											</svg>
										</button>
									{/if}
								</div>

								<!-- Tabs Header -->
								<div class="model-popup-tabs">
									<button 
										class="tab-btn" 
										class:active={activeTab === 'all'}
										onclick={(e) => { e.stopPropagation(); activeTab = 'all'; }}
									>
										ทั้งหมด ({filteredModels.length})
									</button>
									<button 
										class="tab-btn" 
										class:active={activeTab === 'local'}
										onclick={(e) => { e.stopPropagation(); activeTab = 'local'; }}
									>
										Local ({localModels.length})
									</button>
									<button 
										class="tab-btn" 
										class:active={activeTab === 'cloud'}
										onclick={(e) => { e.stopPropagation(); activeTab = 'cloud'; }}
									>
										Cloud ({cloudModels.length})
									</button>
									<button 
										class="tab-btn" 
										class:active={activeTab === 'gemini'}
										onclick={(e) => { e.stopPropagation(); activeTab = 'gemini'; }}
									>
										Gemini ({geminiModels.length})
									</button>
								</div>

								<!-- Models List Scroll Area -->
								<div class="model-popup-list">
									<!-- Favorite Models Group -->
									{#if favoriteModels.length > 0}
										<div class="model-group-title">★ โมเดลที่ชื่นชอบ</div>
										<div class="model-grid">
											{#each favoriteModels as model}
												<div 
													class="model-item-card" 
													class:selected={selectedModel === model.name}
													onclick={() => { selectedModel = model.name; showModelPopup = false; }}
												>
													<div class="model-card-content">
														<div class="model-name-row">
															<span class="model-name-text" title={model.name}>{model.name}</span>
														</div>
														<div class="model-meta-row" style="margin-top: 4px; display: flex; align-items: center; justify-content: flex-start;">
															<span class="model-source-badge {model.source || 'local'}">
																{model.source === 'gemini' ? 'Gemini' : model.source === 'cloud' ? 'Cloud' : 'Local'}
															</span>
														</div>
													</div>
													<div class="model-actions">
														<button 
															class="pin-btn pinned" 
															onclick={(e) => togglePin(model.name, e)}
															title="ถอนหมุดโมเดล"
														>
															★
														</button>
														<button 
															class="hide-btn" 
															onclick={(e) => toggleHide(model.name, e)}
															title="ซ่อนโมเดล"
														>
															<svg viewBox="0 0 24 24" width="14" height="14">
																<path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
															</svg>
														</button>
													</div>
												</div>
											{/each}
										</div>
									{/if}

									<!-- Normal Models Group -->
									{#if normalModels.length > 0}
										<div class="model-group-title">โมเดลทั่วไป</div>
										<div class="model-grid">
											{#each normalModels as model}
												<div 
													class="model-item-card" 
													class:selected={selectedModel === model.name}
													onclick={() => { selectedModel = model.name; showModelPopup = false; }}
												>
													<div class="model-card-content">
														<div class="model-name-row">
															<span class="model-name-text" title={model.name}>{model.name}</span>
														</div>
														<div class="model-meta-row" style="margin-top: 4px; display: flex; align-items: center; justify-content: flex-start;">
															<span class="model-source-badge {model.source || 'local'}">
																{model.source === 'gemini' ? 'Gemini' : model.source === 'cloud' ? 'Cloud' : 'Local'}
															</span>
														</div>
													</div>
													<div class="model-actions">
														<button 
															class="pin-btn" 
															onclick={(e) => togglePin(model.name, e)}
															title="ปักหมุดโมเดล"
														>
															★
														</button>
														<button 
															class="hide-btn" 
															onclick={(e) => toggleHide(model.name, e)}
															title="ซ่อนโมเดล"
														>
															<svg viewBox="0 0 24 24" width="14" height="14">
																<path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
															</svg>
														</button>
													</div>
												</div>
											{/each}
										</div>
									{/if}

									<!-- Hidden Models Group -->
									{#if hiddenModels.length > 0}
										<div class="model-group-title">👁️ โมเดลที่ซ่อนไว้</div>
										<div class="model-grid">
											{#each hiddenModels as model}
												<div 
													class="model-item-card model-hidden" 
													class:selected={selectedModel === model.name}
													onclick={() => { selectedModel = model.name; showModelPopup = false; }}
												>
													<div class="model-card-content">
														<div class="model-name-row">
															<span class="model-name-text" title={model.name}>{model.name}</span>
														</div>
														<div class="model-meta-row" style="margin-top: 4px; display: flex; align-items: center; justify-content: flex-start;">
															<span class="model-source-badge {model.source || 'local'}">
																{model.source === 'gemini' ? 'Gemini' : model.source === 'cloud' ? 'Cloud' : 'Local'}
															</span>
														</div>
													</div>
													<div class="model-actions">
														<button 
															class="pin-btn" 
															onclick={(e) => togglePin(model.name, e)}
															title="ปักหมุดโมเดล"
														>
															★
														</button>
														<button 
															class="hide-btn hidden-active" 
															onclick={(e) => toggleHide(model.name, e)}
															title="แสดงโมเดล"
														>
															<svg viewBox="0 0 24 24" width="14" height="14">
																<path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.82l2.92 2.92c1.51-1.2 2.7-2.78 3.44-4.74-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
															</svg>
														</button>
													</div>
												</div>
											{/each}
										</div>
									{/if}

									{#if favoriteModels.length === 0 && normalModels.length === 0 && hiddenModels.length === 0}
										<div class="no-models-msg">ไม่พบโมเดลที่ค้นหา</div>
									{/if}
								</div>
							</div>
						{/if}
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
						<!-- Attachment Selector (Hover for options, collapses plus and link) -->
						<div class="attachment-selector-container" class:has-link-open={showLinkInput}>
							<button 
								class="control-btn attach-menu-btn" 
								title="Add attachment (File or URL link)"
								aria-label="Add attachment"
							>
								<svg viewBox="0 0 24 24" width="18" height="18">
									<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
								</svg>
							</button>

							<div class="attachment-options-popup">
								<button 
									class="popup-menu-item" 
									onclick={triggerFileInput}
									type="button"
									title="Upload a file or image"
								>
									<svg viewBox="0 0 24 24" width="16" height="16">
										<path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
									</svg>
									<span>อัปโหลดไฟล์/รูปภาพ</span>
								</button>
								<button 
									class="popup-menu-item" 
									onclick={() => showLinkInput = true}
									type="button"
									title="Add context from a website URL"
								>
									<svg viewBox="0 0 24 24" width="16" height="16">
										<path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
									</svg>
									<span>ดึงข้อมูลจากลิงก์เว็บ</span>
								</button>
							</div>

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
		padding: 4px 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px;
		background-color: var(--bg-primary);
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-sizing: border-box;
		container-type: inline-size;
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

	.input-row.multiline .model-selector-wrapper .model-popup {
		left: 0;
		right: auto;
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
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	/* Custom Model Popup styles */
	.model-popup {
		position: absolute;
		bottom: 44px;
		right: 0;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		box-shadow: var(--shadow-lg);
		z-index: 100;
		width: 480px;
		min-height: 180px;
		max-width: calc(100vw - 32px);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: popup-fade-in 0.15s ease-out;
		cursor: default;
	}

	@keyframes popup-fade-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.model-popup-header {
		padding: 12px;
		border-bottom: 1px solid var(--border-color);
		display: flex;
		align-items: center;
		gap: 8px;
		background-color: var(--bg-primary);
	}

	.popup-header-icon-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		padding: 6px;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color var(--transition-fast), background-color var(--transition-fast);
		flex-shrink: 0;
	}

	.popup-header-icon-btn:hover {
		color: var(--text-primary);
		background-color: var(--bg-hover);
	}

	.search-input-wrapper {
		display: flex;
		align-items: center;
		width: 100%;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 6px 10px;
		gap: 8px;
		position: relative;
	}

	.search-input-wrapper input {
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 0.85rem;
		width: 100%;
		outline: none;
	}

	.search-icon {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.clear-search-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 4px;
		border-radius: 50%;
	}

	.clear-search-btn:hover {
		color: var(--text-primary);
		background-color: var(--bg-hover);
	}

	.model-popup-tabs {
		display: flex;
		border-bottom: 1px solid var(--border-color);
		background-color: var(--bg-primary);
		padding: 4px 12px 0 12px;
		gap: 4px;
		overflow-x: auto;
	}

	.tab-btn {
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-secondary);
		padding: 8px 12px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--transition-fast);
		border-radius: 6px 6px 0 0;
	}

	.tab-btn:hover {
		color: var(--text-primary);
		background-color: var(--bg-hover);
	}

	.tab-btn.active {
		color: var(--accent-blue);
		border-bottom-color: var(--accent-blue);
		background-color: var(--bg-secondary);
	}

	.model-popup-list {
		max-height: 320px;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.model-group-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--text-muted);
		letter-spacing: 0.5px;
		margin-bottom: 4px;
	}

	.model-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	@media (max-width: 480px) {
		.model-grid {
			grid-template-columns: 1fr;
		}
		.model-popup {
			width: 290px;
		}
	}

	.model-item-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 10px;
		cursor: pointer;
		transition: all var(--transition-fast);
		gap: 8px;
		position: relative;
	}

	.model-item-card:hover {
		background-color: var(--bg-hover);
		border-color: var(--border-light);
		box-shadow: var(--shadow-sm);
	}

	.model-item-card.selected {
		background-color: color-mix(in srgb, var(--accent-blue) 12%, var(--bg-primary));
		border-color: var(--accent-blue);
	}

	.model-card-content {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.model-name-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		width: 100%;
		min-width: 0;
	}

	.model-name-text {
		font-size: 0.85rem;
		font-weight: 550;
		color: var(--text-primary);
		word-break: break-word;
		overflow-wrap: break-word;
		line-height: 1.25;
		flex: 1;
	}

	.model-source-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 2px 4px;
		border-radius: 4px;
		width: fit-content;
		text-transform: uppercase;
		letter-spacing: 0.2px;
		flex-shrink: 0;
	}

	.model-source-badge.local {
		background-color: rgba(66, 133, 244, 0.15);
		color: #8ab4f8;
	}

	.model-source-badge.cloud {
		background-color: rgba(217, 101, 112, 0.15);
		color: #f28b82;
	}

	.model-source-badge.gemini {
		background-color: rgba(155, 114, 203, 0.15);
		color: #c5a3eb;
	}

	.pin-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: 1rem;
		cursor: pointer;
		transition: all var(--transition-fast);
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		z-index: 10;
	}

	.pin-btn:hover {
		color: #fdd663;
		transform: scale(1.1);
	}

	.pin-btn.pinned {
		color: #fdd663;
	}

	.model-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		z-index: 10;
	}

	.hide-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.hide-btn:hover {
		color: var(--accent-blue);
		transform: scale(1.1);
	}

	.hide-btn.hidden-active {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.model-item-card.model-hidden {
		opacity: 0.5;
		border-style: dashed;
	}

	.model-item-card.model-hidden:hover {
		opacity: 0.85;
	}

	.no-models-msg {
		font-size: 0.85rem;
		color: var(--text-muted);
		text-align: center;
		padding: 16px 0;
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

	/* Attachment Selector & Popover */
	.attachment-selector-container {
		position: relative;
		display: inline-block;
	}

	.attachment-options-popup {
		position: absolute;
		bottom: 44px;
		right: 0;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		box-shadow: var(--shadow-lg);
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity var(--transition-fast), transform var(--transition-fast), visibility var(--transition-fast);
		transform: translateY(8px);
		z-index: 90;
		width: 190px;
	}

	/* Bridge to keep hover active */
	.attachment-options-popup::before {
		content: '';
		position: absolute;
		bottom: -10px;
		left: 0;
		right: 0;
		height: 10px;
		background: transparent;
	}

	.attachment-selector-container:hover:not(.has-link-open) .attachment-options-popup {
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
		transform: translateY(0);
	}

	.popup-menu-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		transition: background-color var(--transition-fast), color var(--transition-fast);
		width: 100%;
		box-sizing: border-box;
	}

	.popup-menu-item:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.popup-menu-item svg {
		color: var(--accent-blue);
		flex-shrink: 0;
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
			padding: 4px 12px calc(24px + env(safe-area-inset-bottom, 0px)) 12px;
		}
	}

	@container (max-width: 720px) {
		.input-row {
			flex-wrap: wrap;
			align-items: center;
			gap: 10px 12px;
		}

		.input-row .prompt-textarea {
			width: 100%;
			flex: 1 1 100%;
			padding-right: 10px;
		}

		.input-row .model-selector-wrapper {
			margin-right: auto;
			margin-bottom: 0;
		}

		.input-row .action-buttons {
			margin-left: auto;
			margin-bottom: 0;
		}

		.model-popup {
			left: 0;
			right: auto;
		}
	}

	@container (max-width: 500px) {
		.pill-box-single {
			padding: 8px 10px;
			border-radius: 20px;
			gap: 8px;
		}

		.prompt-textarea {
			font-size: 16px; /* prevent iOS zoom */
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
