<script lang="ts">
	import type { Conversation, Message, Attachment } from '$lib/types';
	import { renderMarkdown, parseThinking } from '$lib/markdown';
	import { tick, untrack } from 'svelte';
	import { fade } from 'svelte/transition';

	let {
		conversation = null,
		isGenerating = false,
		isBusy = false,
		isInitialized = false,
		showContextPanel = false,
		showSidebar = true,
		theme = 'dark-blue',
		onSendPrompt,
		onEditPrompt,
		onStopGeneration,
		onToggleContextPanel,
		onOpenThinking,
		onToggleSidebar,
		onToggleTheme,
		onSelectColor
	} = $props<{
		conversation: Conversation | null;
		isGenerating: boolean;
		isBusy?: boolean;
		isInitialized: boolean;
		showContextPanel: boolean;
		showSidebar: boolean;
		theme: string;
		onSendPrompt: (prompt: string) => void;
		onEditPrompt: (messageId: string, newContent: string) => void;
		onStopGeneration: () => void;
		onToggleContextPanel: () => void;
		onOpenThinking: (messageId: string) => void;
		onToggleSidebar: () => void;
		onToggleTheme: () => void;
		onSelectColor: (color: string) => void;
	}>();

	let chatContainer = $state<HTMLDivElement | null>(null);
	let fontSize = $state(15);
	let userScrolledUp = $state(false);
	let lastConversationId = $state<string | null>(null);
	let editingMessageId = $state<string | null>(null);
	let editingMessageContent = $state('');

	let openedThoughts = $state<Record<string, boolean>>({});

	// Auto-open thought process for a message when it starts actively thinking
	$effect(() => {
		if (isGenerating && conversation && conversation.messages.length > 0) {
			const lastMsg = conversation.messages[conversation.messages.length - 1];
			if (lastMsg.role === 'assistant') {
				const parsed = parseThinking(lastMsg.content);
				if (parsed.isThinking && openedThoughts[lastMsg.id] === undefined) {
					openedThoughts[lastMsg.id] = true;
				}
			}
		}
	});

	let isExportMenuOpen = $state(false);

	let lightboxImage = $state<string | null>(null);
	let lightboxAlt = $state('');

	if (typeof window !== 'undefined') {
		(window as any).showMediaLightbox = (src: string, altEscaped: string) => {
			lightboxImage = src;
			lightboxAlt = decodeURIComponent(altEscaped || '');
		};
	}

	function closeLightbox() {
		lightboxImage = null;
		lightboxAlt = '';
	}

	// Close lightbox on Escape key
	$effect(() => {
		if (lightboxImage) {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					closeLightbox();
				}
			};
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	});

	// Mermaid states
	let mermaidLib = $state<any>(null);
	let lightboxMermaidCode = $state<string | null>(null);
	let lightboxMermaidScale = $state(1);
	let lightboxMermaidOffset = $state({ x: 0, y: 0 });
	let lightboxMermaidIsDragging = $state(false);
	let lightboxMermaidDragStart = $state({ x: 0, y: 0 });
	let lightboxMermaidContainer = $state<HTMLDivElement | null>(null);

	// Dynamically load Mermaid on client-side and re-initialize when theme changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			const initMermaid = (m: any) => {
				m.initialize({
					startOnLoad: false,
					theme: theme === 'dark' ? 'base' : 'neutral',
					securityLevel: 'loose',
					fontFamily: 'var(--font-main)',
					themeVariables: theme === 'dark' ? {
						background: '#1a1a1b',
						primaryColor: '#c2d9ff', // Soft light blue for node background
						primaryTextColor: '#111827', // Dark gray for node text
						primaryBorderColor: '#4b5563', // Grey node border
						lineColor: '#8e918f', // Grey arrow line color
						secondaryColor: '#e5e7eb',
						tertiaryColor: '#f3f4f6',
						labelTextColor: '#c4c7c5', // Light text for edge labels
						edgeLabelBackground: '#1a1a1b' // Dark background for edge labels to hide lines behind
					} : {
						background: '#faf8f5',
						primaryColor: '#e2ddd2', // Soft warm sand for node background
						primaryTextColor: '#2b2620', // Warm dark charcoal for node text
						primaryBorderColor: '#dcd6ca', // Warm border
						lineColor: '#857e75', // Warm grey arrow line color
						secondaryColor: '#f5f2eb',
						tertiaryColor: '#ffffff',
						labelTextColor: '#57514a', // Warm secondary text for edge labels
						edgeLabelBackground: '#faf8f5' // Warm code bg for edge labels
					}
				});
				renderAllMermaid(true);
			};

			if (!mermaidLib) {
				import('mermaid').then((m) => {
					mermaidLib = m.default;
					initMermaid(mermaidLib);
				}).catch((err) => {
					console.error('Failed to load mermaid:', err);
				});
			} else {
				// Re-initialize when theme changes
				initMermaid(mermaidLib);
			}
		}
	});

	// Re-render mermaid whenever conversation changes or generation ends
	$effect(() => {
		if (conversation && conversation.messages && mermaidLib) {
			// Watch isGenerating to re-trigger rendering once generation completes
			const _ = isGenerating;
			tick().then(() => {
				renderAllMermaid();
			});
		}
	});

	function sanitizeMermaidCode(code: string): string {
		if (!code) return '';
		
		const lines = code.split('\n');
		const specialCharRegex = /[()/\&:+%,-]/;
		
		const sanitizedLines = lines.map(line => {
			let trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('%%')) {
				return line;
			}
			
			// 1. Stadium shape: ID([text])
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\(\s*\[([^"\]]+)\]\s*\)/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}(["${escapedText}"])`;
				}
				return match;
			});

			// 2. Subroutine shape: ID[[text]]
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\[\s*\[([^"\]]+)\]\s*\]/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}[["${escapedText}"]]`;
				}
				return match;
			});

			// 3. Cylinder shape: ID[(text)]
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\[\s*\(([^")]+)\)\s*\]/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}[("${escapedText}")]`;
				}
				return match;
			});

			// 4. Circle shape: ID((text))
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\(\s*\(([^")]+)\)\s*\)/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}(("${escapedText}"))`;
				}
				return match;
			});

			// 5. Hexagon shape: ID{{text}}
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\{\s*\{([^"}]+)\}\s*\}/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}{{"${escapedText}"}}`;
				}
				return match;
			});

			// 6. Rhombus/Decision shape: ID{text}
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\{\s*([^"}]+)\s*\}/g, (match, id, text) => {
				if (text.startsWith('{') || text.endsWith('}')) return match;
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}{"${escapedText}"}`;
				}
				return match;
			});

			// 7. Round shape: ID(text)
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\(\s*([^")]+)\s*\)/g, (match, id, text) => {
				if (text.startsWith('(') || text.endsWith(')')) return match;
				if (id === 'graph' || id === 'flowchart') return match;
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}("${escapedText}")`;
				}
				return match;
			});

			// 8. Square shape: ID[text]
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\[\s*([^"\]]+)\s*\]/g, (match, id, text) => {
				if (text.startsWith('[') || text.endsWith(']')) return match;
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}["${escapedText}"]`;
				}
				return match;
			});

			return line;
		});
		
		return sanitizedLines.join('\n');
	}

	async function renderAllMermaid(force: boolean = false) {
		if (!mermaidLib) return;
		
		const containers = document.querySelectorAll('.mermaid-preview-container');
		for (const container of containers) {
			const id = container.id.replace('container-', '');
			const template = document.getElementById(id) as HTMLTemplateElement;
			if (!template) continue;
			
			const rawCode = decodeURIComponent(template.innerHTML).trim();
			const code = sanitizeMermaidCode(rawCode);
			const lastCode = container.getAttribute('data-last-code');
			
			// Avoid re-rendering if code is exactly the same and already processed, unless forced (e.g. theme changed)
			if (!force && lastCode === code && container.getAttribute('data-processed') === 'true') {
				continue;
			}
			
			if (force) {
				container.removeAttribute('data-processed');
				container.removeAttribute('data-last-code');
			}
			
			container.setAttribute('data-last-code', code);
			
			try {
				// Parse to validate syntax
				await mermaidLib.parse(code);
				
				// Generate a completely unique element ID for mermaid.render to avoid collisions
				const renderId = `svg-${id}-${Math.random().toString(36).slice(2, 7)}`;
				
				// Render diagram
				const { svg } = await mermaidLib.render(renderId, code);
				container.innerHTML = svg;
				container.setAttribute('data-processed', 'true');
				container.classList.remove('has-error');
			} catch (err: any) {
				// If not generating, show error block. If generating, keep loading/partial preview
				if (!isGenerating) {
					console.error('Mermaid render error:', err);
					container.innerHTML = `
						<div class="mermaid-error">
							<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 8px; display: inline-block;">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v2z"/>
							</svg>
							<span>Error rendering flowchart: ${err.message || 'Syntax error'}</span>
						</div>
					`;
					container.classList.add('has-error');
					container.setAttribute('data-processed', 'true');
				} else {
					if (!container.innerHTML || container.innerHTML.includes('mermaid-error')) {
						container.innerHTML = `
							<div class="mermaid-loading">
								<div class="spinner-glow small"></div>
								<span>Generating flowchart...</span>
							</div>
						`;
					}
				}
			}
		}
	}

	// Register global handlers for tab switching & fullscreen zoom
	if (typeof window !== 'undefined') {
		(window as any).zoomMermaid = (id: string) => {
			const template = document.getElementById(id) as HTMLTemplateElement;
			if (!template) return;
			const code = decodeURIComponent(template.innerHTML);
			lightboxMermaidCode = code;
			lightboxMermaidScale = 1;
			lightboxMermaidOffset = { x: 0, y: 0 };
		};

		(window as any).switchMermaidTab = (id: string, tab: 'preview' | 'code') => {
			const wrapper = document.getElementById(`wrapper-${id}`);
			if (!wrapper) return;
			
			const previewContainer = document.getElementById(`container-${id}`);
			const codeContainer = document.getElementById(`code-container-${id}`);
			const zoomBtn = document.getElementById(`zoom-btn-${id}`);
			const tabs = wrapper.querySelectorAll('.mermaid-tab');
			
			if (tab === 'preview') {
				previewContainer?.classList.remove('hidden');
				codeContainer?.classList.add('hidden');
				zoomBtn?.classList.remove('hidden');
				tabs[0]?.classList.add('active');
				tabs[1]?.classList.remove('active');
			} else {
				previewContainer?.classList.add('hidden');
				codeContainer?.classList.remove('hidden');
				zoomBtn?.classList.add('hidden');
				tabs[0]?.classList.remove('active');
				tabs[1]?.classList.add('active');
			}
		};
	}

	function closeMermaidLightbox() {
		lightboxMermaidCode = null;
	}

	function zoomIn(e: MouseEvent) {
		e.stopPropagation();
		lightboxMermaidScale = Math.min(lightboxMermaidScale + 0.15, 3);
	}

	function zoomOut(e: MouseEvent) {
		e.stopPropagation();
		lightboxMermaidScale = Math.max(lightboxMermaidScale - 0.15, 0.3);
	}

	function zoomReset(e: MouseEvent) {
		e.stopPropagation();
		lightboxMermaidScale = 1;
		lightboxMermaidOffset = { x: 0, y: 0 };
	}

	function startDrag(e: MouseEvent) {
		if (e.button !== 0) return; // Only left click
		lightboxMermaidIsDragging = true;
		lightboxMermaidDragStart = {
			x: e.clientX - lightboxMermaidOffset.x,
			y: e.clientY - lightboxMermaidOffset.y
		};
	}

	function drag(e: MouseEvent) {
		if (!lightboxMermaidIsDragging) return;
		lightboxMermaidOffset = {
			x: e.clientX - lightboxMermaidDragStart.x,
			y: e.clientY - lightboxMermaidDragStart.y
		};
	}

	function endDrag() {
		lightboxMermaidIsDragging = false;
	}

	// Close mermaid lightbox on Escape key
	$effect(() => {
		if (lightboxMermaidCode) {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					closeMermaidLightbox();
				}
			};
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	});

	// Handle wheel zoom inside viewport without passive listeners warning
	$effect(() => {
		if (lightboxMermaidCode && typeof window !== 'undefined') {
			const viewport = document.querySelector('.lightbox-mermaid-viewport');
			if (viewport) {
				const preventDefaultWheel = (e: WheelEvent) => {
					e.preventDefault();
					const zoomFactor = 0.08;
					const direction = e.deltaY < 0 ? 1 : -1;
					const newScale = lightboxMermaidScale + direction * zoomFactor;
					lightboxMermaidScale = Math.max(0.3, Math.min(newScale, 4));
				};
				viewport.addEventListener('wheel', preventDefaultWheel as any, { passive: false });
				return () => {
					viewport.removeEventListener('wheel', preventDefaultWheel as any);
				};
			}
		}
	});

	// Watch for lightbox opening to render the Mermaid SVG into it
	$effect(() => {
		if (lightboxMermaidCode && lightboxMermaidContainer && mermaidLib) {
			const code = sanitizeMermaidCode(lightboxMermaidCode);
			const container = lightboxMermaidContainer;
			const renderId = `lightbox-svg-${Math.random().toString(36).slice(2, 7)}`;
			
			mermaidLib.render(renderId, code).then(({ svg }: { svg: string }) => {
				if (container) {
					container.innerHTML = svg;
				}
			}).catch((err: any) => {
				console.error('Lightbox Mermaid render error:', err);
				if (container) {
					container.innerHTML = `
						<div class="mermaid-error">
							<span>Error rendering flowchart: ${err.message || 'Syntax error'}</span>
						</div>
					`;
				}
			});
		}
	});

	// Close dropdown when clicking outside
	$effect(() => {
		if (isExportMenuOpen) {
			const handleOutsideClick = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (!target.closest('.export-controls')) {
					isExportMenuOpen = false;
				}
			};
			window.addEventListener('click', handleOutsideClick);
			return () => {
				window.removeEventListener('click', handleOutsideClick);
			};
		}
	});

	function exportToMarkdown() {
		if (!conversation) return;
		isExportMenuOpen = false;

		let mdContent = `# ${conversation.title}\n\n`;
		mdContent += `- **Model**: ${conversation.model || 'Unknown'}\n`;
		mdContent += `- **Date**: ${new Date(conversation.createdAt).toLocaleString()}\n\n`;
		mdContent += `---\n\n`;

		conversation.messages.forEach((msg: Message) => {
			if (msg.role === 'assistant' && msg.content === '') return;
			const roleName = msg.role === 'user' ? 'User' : `Assistant (${msg.model || conversation.model || 'Ollama'})`;
			mdContent += `### ${roleName}\n`;
			
			// Include attachments if any
			if (msg.attachments && msg.attachments.length > 0) {
				mdContent += `**Attachments:**\n`;
				msg.attachments.forEach((att: Attachment) => {
					if (att.type === 'image') {
						mdContent += `- [Image] ${att.name}\n`;
					} else {
						mdContent += `- [${att.type}] ${att.name}\n`;
					}
				});
				mdContent += `\n`;
			}

			mdContent += `${msg.content}\n\n`;
			mdContent += `---\n\n`;
		});

		// Trigger download
		const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		
		// Clean file name
		const safeTitle = conversation.title
			.toLowerCase()
			.replace(/[^a-z0-9\u0e00-\u0e7f]+/g, '-') // Allow Thai characters and alphanumeric
			.replace(/(^-|-$)/g, '');
		const fileName = safeTitle ? `${safeTitle}.md` : `chat-export.md`;

		link.setAttribute('download', fileName);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function exportToPdf() {
		isExportMenuOpen = false;
		window.print();
	}

	// Show thinking loader only before the first response chunk arrives
	const showThinking = $derived(
		isGenerating &&
		conversation &&
		conversation.messages.length > 0 &&
		conversation.messages[conversation.messages.length - 1].role === 'assistant' &&
		conversation.messages[conversation.messages.length - 1].content === ''
	);

	function startEditPrompt(msg: Message) {
		editingMessageId = msg.id;
		editingMessageContent = msg.content;
	}

	function saveEditPrompt(id: string) {
		if (editingMessageContent.trim()) {
			onEditPrompt(id, editingMessageContent.trim());
		}
		editingMessageId = null;
	}

	// Load stored font size on mount
	$effect(() => {
		untrack(() => {
			const storedSize = localStorage.getItem('chat_font_size');
			if (storedSize) {
				const parsed = parseInt(storedSize, 10);
				if (!isNaN(parsed) && parsed >= 10 && parsed <= 30) {
					fontSize = parsed;
				}
			}
		});
	});

	function increaseFont() {
		if (fontSize < 30) {
			fontSize += 1;
			localStorage.setItem('chat_font_size', fontSize.toString());
		}
	}

	function decreaseFont() {
		if (fontSize > 10) {
			fontSize -= 1;
			localStorage.setItem('chat_font_size', fontSize.toString());
		}
	}

	// Suggestions for empty state
	const suggestions = [
		{
			title: 'Write a Svelte 5 component',
			desc: 'for a sleek modal dialog using runes',
			prompt: 'Write a Svelte 5 component for a sleek modal dialog. Use TypeScript and Svelte 5 runes ($state, $props, $effect). Add beautiful transition animations and CSS styling.'
		},
		{
			title: 'Explain Svelte 5 Runes',
			desc: 'versus Svelte 3/4 stores and reactivity',
			prompt: 'Can you explain Svelte 5 Runes ($state, $derived, $effect) and compare them with Svelte 3/4 reactive statements ($:) and stores? Provide code examples showing how to convert a store-based component to runes.'
		},
		{
			title: 'Create a Python script',
			desc: 'to parse a JSON log file and extract errors',
			prompt: 'Write a Python script to parse a JSON log file, extract all logs that have level "ERROR" or "CRITICAL", and write them into a CSV file. Include sample data and make the code well-documented.'
		},
		{
			title: 'Design a CSS layout',
			desc: 'for a glassmorphism dashboard card',
			prompt: 'Design a modern CSS glassmorphism dashboard card. Provide the HTML structure and complete CSS styles. Include hover effects, backdrop-filter, border gradients, and dynamic shadow effects.'
		}
	];

	// Smart scroll controller
	$effect(() => {
		if (!conversation || !conversation.messages) return;
		
		const currentId = conversation.id;
		const msgLength = conversation.messages.length;
		const lastMsg = conversation.messages[msgLength - 1];
		const lastMsgContent = lastMsg?.content || '';

		untrack(() => {
			// 1. Conversation switch
			if (currentId !== lastConversationId) {
				lastConversationId = currentId;
				userScrolledUp = false;
				openedThoughts = {}; // reset open thoughts record
				scrollToBottom('auto');
				return;
			}

			if (msgLength === 0) return;

			// 2. Active AI generation (streaming response)
			if (isGenerating && lastMsg && lastMsg.role === 'assistant') {
				if (!userScrolledUp) {
					scrollToBottom('auto');
				}
				return;
			}

			// 3. User message sent
			if (lastMsg && lastMsg.role === 'user') {
				userScrolledUp = false;
				scrollToBottom('smooth');
			}
		});
	});

	function handleScroll() {
		if (!chatContainer) return;
		
		const { scrollTop, scrollHeight, clientHeight } = chatContainer;
		// If the user scrolls to the bottom (within 80px), reset userScrolledUp
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
		
		if (isAtBottom) {
			userScrolledUp = false;
		} else {
			// If user scrolled up and is not near the bottom, mark userScrolledUp as true
			userScrolledUp = true;
		}
	}

	async function scrollToBottom(behavior: 'auto' | 'smooth' = 'smooth') {
		await tick();
		if (chatContainer) {
			chatContainer.scrollTo({
				top: chatContainer.scrollHeight,
				behavior
			});
		}
	}

	function autoScroll(node: HTMLElement, params: { active: boolean; text: string }) {
		const scroll = () => {
			if (params.active && node.scrollHeight > 0) {
				node.scrollTop = node.scrollHeight;
			}
		};
		// Scroll initially
		setTimeout(scroll, 50);

		return {
			update(newParams: { active: boolean; text: string }) {
				params = newParams;
				setTimeout(scroll, 0);
			}
		};
	}
</script>

<div class="chat-area">
	<!-- Sticky Header Bar -->
	<header class="chat-header">
		<div class="chat-title-group">
			<button 
				class="sidebar-toggle-btn" 
				onclick={onToggleSidebar}
				title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
				aria-label={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
			>
				<svg viewBox="0 0 24 24" width="20" height="20">
					{#if showSidebar}
						<!-- Sidebar Shown Icon -->
						<path fill="currentColor" d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 4v10h4V8H4zm6 0v10h10V8H10z"/>
					{:else}
						<!-- Sidebar Hidden Icon -->
						<path fill="currentColor" d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 4v10h16V8H4z"/>
					{/if}
				</svg>
			</button>
			<div class="chat-title">
				{#if conversation}
					{conversation.title}
				{:else}
					New Conversation
				{/if}
			</div>
		</div>

		<div class="header-actions">
			<!-- Theme Color Picker -->
			<div class="theme-color-picker">
				{#each [
					{ name: 'blue', label: 'Blue (ฟ้า)', color: '#3b82f6' },
					{ name: 'yellow', label: 'Yellow (เหลือง)', color: '#eab308' },
					{ name: 'pink', label: 'Pink (ชมพู)', color: '#ec4899' },
					{ name: 'purple', label: 'Purple (ม่วง)', color: '#a855f7' },
					{ name: 'green', label: 'Green (เขียว)', color: '#22c55e' }
				] as col}
					<button
						class="color-dot {col.name}"
						class:active={theme.endsWith(col.name)}
						onclick={() => onSelectColor(col.name)}
						title="Switch to {col.label} theme"
						aria-label="Switch to {col.label} theme"
						style="background-color: {col.color}"
					></button>
				{/each}
			</div>

			<!-- Theme Toggle Button -->
			<button 
				class="theme-toggle-btn"
				onclick={onToggleTheme}
				title={theme.startsWith('dark') ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
				aria-label={theme.startsWith('dark') ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
			>
				{#if theme.startsWith('dark')}
					<!-- Sun Icon -->
					<svg viewBox="0 0 24 24" width="18" height="18">
						<path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41zm-12.37 12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41z"/>
					</svg>
				{:else}
					<!-- Moon Icon -->
					<svg viewBox="0 0 24 24" width="18" height="18">
						<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
					</svg>
				{/if}
			</button>

			{#if conversation}
				<button 
					class="context-toggle-btn-header" 
					class:active-panel={showContextPanel}
					onclick={onToggleContextPanel}
					title="Toggle Context Settings"
				>
					<svg viewBox="0 0 24 24" width="16" height="16">
						<path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
					</svg>
					<span>Context</span>
				</button>
			{/if}

			{#if conversation && conversation.messages.length > 0}
				<div class="export-controls">
					<button 
						class="export-btn" 
						onclick={() => isExportMenuOpen = !isExportMenuOpen}
						aria-expanded={isExportMenuOpen}
						title="Export Chat"
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
						</svg>
						<span>Export</span>
						<svg class="chevron-down" class:open={isExportMenuOpen} viewBox="0 0 24 24" width="12" height="12">
							<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
						</svg>
					</button>

					{#if isExportMenuOpen}
						<div class="export-controls-dropdown animate-fade-in">
							<button class="dropdown-item" onclick={exportToMarkdown}>
								<svg viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
								</svg>
								<span>Export as Markdown (.md)</span>
							</button>
							<button class="dropdown-item" onclick={exportToPdf}>
								<svg viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9.5 8.5c0 .83-.67 1.5-1.5 1.5H7v1.5H5.5V9H8c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V9H13c.83 0 1.5.67 1.5 1.5v3zm4-3.5h-2.5v1H18v1.5h-1.5V14H15V9h4v1.5zM9 11.5H8v-1h1v1zm4 1.5h-1v-2h1v2z"/>
								</svg>
								<span>Export as PDF (.pdf)</span>
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<div class="font-controls">
				<button 
					class="font-btn" 
					onclick={decreaseFont} 
					disabled={fontSize <= 10}
					title="Decrease font size"
				>
					A-
				</button>
				<button 
					class="font-indicator-btn" 
					onclick={() => {
						fontSize = 15;
						localStorage.setItem('chat_font_size', '15');
					}}
					title="Reset to 100%"
				>
					{Math.round((fontSize / 15) * 100)}%
				</button>
				<button 
					class="font-btn" 
					onclick={increaseFont} 
					disabled={fontSize >= 30}
					title="Increase font size"
				>
					A+
				</button>
			</div>
		</div>
	</header>

	<div 
		class="chat-viewport" 
		bind:this={chatContainer} 
		onscroll={handleScroll}
		style="--chat-font-size: {fontSize}px"
	>
		{#if !isInitialized}
			<div class="chat-loading-placeholder">
				<div class="spinner-glow"></div>
			</div>
		{:else if !conversation || conversation.messages.length === 0}
			<!-- Gemini-style Welcome Screen -->
			<div class="welcome-container animate-fade-in">
				<div class="welcome-header">
					<h1 class="gradient-text">Hello, Developer</h1>
					<h2 class="subtitle-text">What would you like to build or discuss today?</h2>
				</div>

				<div class="suggestions-grid">
					{#each suggestions as sug}
						<button 
							class="suggestion-card" 
							onclick={() => onSendPrompt(sug.prompt)}
						>
							<div class="sug-title">{sug.title}</div>
							<div class="sug-desc">{sug.desc}</div>
							<div class="sug-icon">
								<svg viewBox="0 0 24 24" width="18" height="18">
									<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
								</svg>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<!-- Message Thread -->
			<div class="messages-list">
				{#each conversation.messages as msg, idx (msg.id)}
					{#if msg.role !== 'assistant' || msg.content !== ''}
						<div class="message-wrapper" class:user={msg.role === 'user'}>
						<div class="message-avatar">
							{#if msg.role === 'user'}
								<div class="avatar user-avatar">U</div>
							{:else}
								<div class="avatar ai-avatar">
									<svg viewBox="0 0 24 24" width="16" height="16">
										<path fill="currentColor" d="M12 2L2 22h20L12 2zm0 3.99L18.8 19H5.2L12 5.99zM12 17c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1zm0-7.75c.41 0 .75-.34.75-.75s-.34-.75-.75-.75-.75.34-.75.75.34.75.75.75z"/>
									</svg>
								</div>
							{/if}
						</div>
						
						<div class="message-body">
							<div class="message-info">
								<span class="sender-name">
									{msg.role === 'user' ? 'You' : (msg.model || 'Assistant')}
								</span>
								<span class="timestamp">
									{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
								</span>
							</div>

							<div class="message-content markdown-body">
								{#if msg.role === 'user'}
									{#if editingMessageId === msg.id}
										<!-- Edit prompt textarea -->
										<div class="edit-prompt-wrapper">
											<textarea 
												class="edit-prompt-textarea"
												bind:value={editingMessageContent}
												rows="3"
											></textarea>
											<div class="edit-prompt-actions">
												<button class="edit-btn cancel" onclick={() => editingMessageId = null}>
													Cancel
												</button>
												<button 
													class="edit-btn submit" 
													onclick={() => saveEditPrompt(msg.id)}
													disabled={!editingMessageContent.trim() || isGenerating || isBusy}
												>
													Save & Submit
												</button>
											</div>
										</div>
									{:else}
										<div class="user-message-container">
											<div class="user-message-bubble-wrapper">
												{#if msg.attachments && msg.attachments.length > 0}
													<div class="message-attachments-grid">
														{#each msg.attachments as attr (attr.id)}
															<div class="msg-attachment-card">
																{#if attr.type === 'image'}
																	<img class="msg-attachment-image" src={attr.content} alt={attr.name} />
																{:else}
																	<div class="msg-attachment-info">
																		{#if attr.type === 'link'}
																			<svg class="msg-attachment-icon link-icon" viewBox="0 0 24 24" width="14" height="14">
																				<path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
																			</svg>
																		{:else}
																			<svg class="msg-attachment-icon file-icon" viewBox="0 0 24 24" width="14" height="14">
																				<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
																			</svg>
																		{/if}
																		<span class="msg-attachment-name" title={attr.name}>{attr.name}</span>
																	</div>
																{/if}
															</div>
														{/each}
													</div>
												{/if}
												{#if msg.content}
													<div class="user-text-container-with-edit">
														<pre class="user-text-pre">{msg.content}</pre>
														<button 
															class="message-edit-trigger" 
															onclick={() => startEditPrompt(msg)}
															title="Edit prompt"
														>
															<svg viewBox="0 0 24 24" width="14" height="14">
																<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
															</svg>
														</button>
													</div>
												{/if}
											</div>
											{#if !msg.content}
												<button 
													class="message-edit-trigger" 
													onclick={() => startEditPrompt(msg)}
													title="Edit prompt"
												>
													<svg viewBox="0 0 24 24" width="14" height="14">
														<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
													</svg>
												</button>
											{/if}
										</div>
									{/if}
								{:else}
									<!-- Render parsed markdown with thinking block extraction -->
									{@const parsed = parseThinking(msg.content)}
									{@const isLastMsg = idx === conversation.messages.length - 1}
									{@const isActivelyThinking = parsed.isThinking && isGenerating && isLastMsg}
									{#if parsed.thinking}
										<details class="thoughts-details" bind:open={openedThoughts[msg.id]}>
											<summary class="thoughts-summary">
												<span class="thinking-icon-wrapper">
													<svg class="thinking-icon" class:animate-pulse={isActivelyThinking} viewBox="0 0 24 24" width="14" height="14">
														<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
													</svg>
												</span>
												<span class="thinking-text-label">
													{isActivelyThinking ? 'Thinking Process...' : 'Thought Process'}
												</span>
												<button 
													type="button" 
													class="open-thinking-pane-inline-btn" 
													onclick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenThinking(msg.id); }}
													title="Open thinking process in right pane"
												>
													View in Right Pane ↗
												</button>
											</summary>
											<div class="thoughts-content markdown-body" use:autoScroll={{ active: isActivelyThinking, text: parsed.thinking }}>
												{@html renderMarkdown(parsed.thinking)}
											</div>
										</details>
									{/if}

									{#if parsed.response}
										<div class="assistant-response-content">
											{@html renderMarkdown(parsed.response)}
										</div>
									{:else if isActivelyThinking}
										<div class="thinking-placeholder-msg">
											<div class="typing-indicator small-indicator">
												<span></span><span></span><span></span>
											</div>
										</div>
									{/if}
								{/if}
							</div>
						</div>
					</div>
					{/if}
				{/each}

				{#if showThinking}
					<div class="message-wrapper assistant generating">
						<div class="message-avatar">
							<div class="avatar ai-avatar animate-pulse">
								<svg viewBox="0 0 24 24" width="16" height="16">
									<path fill="currentColor" d="M12 2L2 22h20L12 2zm0 3.99L18.8 19H5.2L12 5.99zM12 17c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1zm0-7.75c.41 0 .75-.34.75-.75s-.34-.75-.75-.75-.75.34-.75.75.34.75.75.75z"/>
								</svg>
							</div>
						</div>
						<div class="message-body">
							<div class="message-info">
								<span class="sender-name">
									{conversation.messages[conversation.messages.length - 1].model || conversation.model || 'Ollama'}
								</span>
								<span class="status-tag">Thinking...</span>
							</div>
							<div class="message-content markdown-body">
								<div class="typing-indicator">
									<span></span><span></span><span></span>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
	
	{#if lightboxImage}
		<div class="lightbox-overlay" onclick={closeLightbox} onkeydown={(e) => e.key === 'Escape' && closeLightbox()} role="button" tabindex="-1" aria-label="Close Lightbox" transition:fade={{ duration: 150 }}>
			<button class="lightbox-close" onclick={closeLightbox} aria-label="Close Lightbox">&times;</button>
			<div onclick={(e) => e.stopPropagation()} role="presentation">
				<img src={lightboxImage} alt={lightboxAlt} class="lightbox-content" />
			</div>
			{#if lightboxAlt}
				<div class="lightbox-caption">{lightboxAlt}</div>
			{/if}
		</div>
	{/if}

	{#if lightboxMermaidCode}
		<div 
			class="lightbox-overlay mermaid-lightbox" 
			onclick={closeMermaidLightbox} 
			onkeydown={(e) => e.key === 'Escape' && closeMermaidLightbox()} 
			role="button" 
			tabindex="-1" 
			aria-label="Close Lightbox" 
			transition:fade={{ duration: 150 }}
		>
			<button class="lightbox-close" onclick={closeMermaidLightbox} aria-label="Close Lightbox">&times;</button>
			
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="lightbox-mermaid-header" onclick={(e) => e.stopPropagation()}>
				<span class="lightbox-mermaid-title">Interactive Flowchart Viewer</span>
				<div class="lightbox-mermaid-controls">
					<button class="control-btn" onclick={zoomIn} title="Zoom In">+</button>
					<span class="zoom-indicator">{Math.round(lightboxMermaidScale * 100)}%</span>
					<button class="control-btn" onclick={zoomOut} title="Zoom Out">-</button>
					<button class="control-btn" onclick={zoomReset} title="Reset View">Reset</button>
				</div>
			</div>

			<div 
				class="lightbox-mermaid-viewport" 
				onclick={(e) => e.stopPropagation()}
				onmousedown={startDrag}
				onmousemove={drag}
				onmouseup={endDrag}
				onmouseleave={endDrag}
				role="presentation"
				style="cursor: {lightboxMermaidIsDragging ? 'grabbing' : 'grab'}"
			>
				<div 
					class="lightbox-mermaid-content"
					bind:this={lightboxMermaidContainer}
					style="transform: translate({lightboxMermaidOffset.x}px, {lightboxMermaidOffset.y}px) scale({lightboxMermaidScale}); transform-origin: center;"
				>
					<div class="mermaid-loading">
						<div class="spinner-glow small"></div>
						<span>Rendering flowchart...</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.chat-area {
		flex: 1;
		min-height: 0; /* Prevents flex items from overflowing their container */
		display: flex;
		flex-direction: column;
		background-color: var(--bg-primary);
		position: relative;
		container-type: inline-size;
	}

	.chat-header {
		height: var(--header-height, 56px);
		border-bottom: 1px solid var(--border-color);
		background-color: var(--header-bg);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 24px;
		z-index: 5;
		position: sticky;
		top: 0;
		flex-shrink: 0;
	}

	.chat-title-group {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		flex: 1;
		margin-right: 16px;
	}

	.sidebar-toggle-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 6px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--transition-fast), color var(--transition-fast);
		flex-shrink: 0;
	}

	.sidebar-toggle-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.chat-title {
		font-family: var(--font-title);
		font-weight: 500;
		font-size: 1.05rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.export-controls {
		position: relative;
	}

	.export-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 20px;
		padding: 6px 14px;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
	}

	.export-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	.export-btn svg {
		flex-shrink: 0;
	}

	.chevron-down {
		color: var(--text-muted);
		transition: transform var(--transition-normal);
	}

	.chevron-down.open {
		transform: rotate(180deg);
	}

	.export-controls-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		background-color: var(--bg-secondary);
		backdrop-filter: blur(12px);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		padding: 6px 0;
		width: 230px;
		z-index: 100;
		display: flex;
		flex-direction: column;
	}

	.dropdown-item {
		width: 100%;
		text-align: left;
		padding: 10px 16px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.85rem;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.dropdown-item:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.dropdown-item svg {
		color: var(--accent-blue);
		flex-shrink: 0;
	}

	.font-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 20px;
		padding: 3px 6px;
	}

	.font-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-weight: 600;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.font-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.font-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.font-indicator-btn {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-secondary);
		padding: 2px 6px;
		min-width: 44px;
		text-align: center;
		user-select: none;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.font-indicator-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.chat-viewport {
		flex: 1;
		overflow-y: auto;
		padding: 32px 16px 120px 16px; /* Generous bottom padding to prevent overlap with input area */
		display: flex;
		flex-direction: column;
	}

	/* Welcome screen styles */
	.welcome-container {
		max-width: 1000px;
		width: 100%;
		margin: auto;
		display: flex;
		flex-direction: column;
		gap: 40px;
		padding: 20px 0;
	}

	.welcome-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.gradient-text {
		font-family: var(--font-title);
		font-size: 3.2rem;
		font-weight: 600;
		line-height: 1.25;
		background: linear-gradient(74deg, #4285f4 0, #9b72cb 25%, #d96570 50%, #4285f4 100%);
		background-size: 200% auto;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		animation: pulseGradient 8s linear infinite;
	}

	.subtitle-text {
		font-family: var(--font-title);
		font-size: 2rem;
		font-weight: 500;
		color: var(--text-muted);
		line-height: 1.3;
	}

	.suggestions-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.suggestion-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 20px;
		text-align: left;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 130px;
		position: relative;
		transition: background-color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
	}

	.suggestion-card:hover {
		background-color: var(--bg-hover);
		border-color: var(--border-light);
		transform: translateY(-2px);
	}

	.sug-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 6px;
	}

	.sug-desc {
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.sug-icon {
		position: absolute;
		bottom: 16px;
		right: 16px;
		color: var(--text-muted);
		background: var(--bg-primary);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-color);
		opacity: 0;
		transform: scale(0.8);
		transition: opacity var(--transition-fast), transform var(--transition-fast);
	}

	.suggestion-card:hover .sug-icon {
		opacity: 1;
		transform: scale(1);
	}

	/* Message thread styling */
	.messages-list {
		max-width: 1000px;
		width: 100%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.message-wrapper {
		display: flex;
		gap: 20px;
		animation: fadeIn var(--transition-normal) forwards;
		position: relative;
	}

	@container (min-width: 1120px) {
		.message-wrapper {
			margin-left: -56px; /* Offset the avatar (36px width + 20px gap) to the left gutter */
		}
	}

	.message-wrapper.user {
		/* Right-align user messages slightly for cleaner hierarchy */
		flex-direction: row;
	}

	.message-avatar {
		flex-shrink: 0;
	}

	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.user-avatar {
		background-color: var(--bg-hover);
		color: var(--accent-blue);
		border: 1px solid var(--border-color);
	}

	.ai-avatar {
		background: linear-gradient(135deg, #4285f4, #9b72cb);
		color: #ffffff;
		box-shadow: var(--shadow-sm);
	}

	.message-body {
		flex: 1;
		min-width: 0; /* Important for preventing code block overflow */
	}

	.message-info {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 6px;
	}

	.sender-name {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text-primary);
	}

	.timestamp {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.status-tag {
		font-size: 0.75rem;
		color: var(--accent-blue);
		font-style: italic;
	}

	.message-content {
		color: var(--text-primary);
	}

	.user-text-pre {
		font-family: inherit;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: var(--chat-font-size, 15px);
		color: var(--text-primary);
		background-color: var(--bg-secondary);
		padding: 12px 16px;
		border-radius: 12px;
		border: 1px solid var(--border-color);
		max-width: 100%;
		display: inline-block;
	}

	.message-wrapper.user .message-body {
		text-align: left;
	}

	/* Typing indicator */
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
	}

	.typing-indicator span {
		width: 8px;
		height: 8px;
		background-color: var(--accent-blue);
		border-radius: 50%;
		display: inline-block;
		animation: bounce 1.4s infinite ease-in-out both;
	}

	.typing-indicator span:nth-child(1) {
		animation-delay: -0.32s;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: -0.16s;
	}

	@keyframes bounce {
		0%, 80%, 100% { transform: scale(0); }
		40% { transform: scale(1.0); }
	}

	.animate-pulse {
		animation: pulse 2s infinite ease-in-out;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 1; }
	}

	@media (max-width: 768px) {
		.welcome-container {
			gap: 24px;
		}

		.gradient-text {
			font-size: 2.2rem;
		}

		.subtitle-text {
			font-size: 1.4rem;
		}

		.suggestions-grid {
			grid-template-columns: 1fr;
			gap: 12px;
		}

		.suggestion-card {
			height: 100px;
		}
	}

	/* User message edit prompt styles */

	.user-message-container {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		position: relative;
		width: 100%;
	}

	.user-text-container-with-edit {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
	}

	.user-text-container-with-edit .user-text-pre {
		max-width: calc(100% - 40px);
	}

	.user-message-container:hover .message-edit-trigger {
		opacity: 1;
	}

	.message-edit-trigger {
		opacity: 0;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		color: var(--text-muted);
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
		margin-top: 8px;
		flex-shrink: 0;
	}

	.message-edit-trigger:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.edit-prompt-wrapper {
		display: flex;
		flex-direction: column;
		gap: 12px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		padding: 16px;
		border-radius: 12px;
		width: 100%;
		max-width: 90%;
	}

	.edit-prompt-textarea {
		width: 100%;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 10px 12px;
		color: var(--text-primary);
		font-family: var(--font-main);
		font-size: var(--chat-font-size, 15px);
		resize: vertical;
		outline: none;
	}

	.edit-prompt-textarea:focus {
		border-color: var(--accent-blue);
	}

	.edit-prompt-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.edit-btn {
		padding: 6px 14px;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		transition: background-color var(--transition-fast), opacity var(--transition-fast);
	}

	.edit-btn.cancel {
		background-color: transparent;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
	}

	.edit-btn.cancel:hover {
		background-color: var(--bg-hover);
	}

	.edit-btn.submit {
		background: linear-gradient(135deg, #4285f4, #9b72cb);
		color: #ffffff;
		border: none;
	}

	.edit-btn.submit:hover:not(:disabled) {
		opacity: 0.9;
	}

	.edit-btn.submit:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* User Message Attachments Grid */
	.user-message-bubble-wrapper {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 90%;
		align-items: flex-start;
	}

	.message-attachments-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 2px;
	}

	.msg-attachment-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		overflow: hidden;
		max-width: 220px;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-sm);
	}

	.msg-attachment-image {
		max-width: 100%;
		max-height: 150px;
		object-fit: cover;
		display: block;
	}

	.msg-attachment-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		font-size: 0.8rem;
		color: var(--text-primary);
	}

	.msg-attachment-icon {
		color: var(--accent-blue);
		flex-shrink: 0;
	}

	.msg-attachment-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
		font-weight: 500;
	}

	/* Loading Placeholder */
	.chat-loading-placeholder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.spinner-glow {
		width: 32px;
		height: 32px;
		border: 3px solid rgba(66, 133, 244, 0.1);
		border-radius: 50%;
		border-top-color: var(--accent-blue);
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.context-toggle-btn-header {
		display: flex;
		align-items: center;
		gap: 8px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 20px;
		padding: 6px 14px;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
		cursor: pointer;
	}

	.context-toggle-btn-header:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	.context-toggle-btn-header.active-panel {
		background-color: rgba(168, 199, 250, 0.15);
		color: var(--accent-blue);
		border-color: var(--accent-blue);
	}

	/* Collapsible thoughts/thinking block styling */
	.thoughts-details {
		background-color: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		margin-bottom: 12px;
		overflow: hidden;
		transition: border-color var(--transition-fast);
	}

	.thoughts-details[open] {
		border-color: var(--border-light);
	}

	.thoughts-summary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		font-size: 0.8rem;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
		font-weight: 500;
	}

	.thoughts-summary:hover {
		color: var(--text-secondary);
		background-color: rgba(255, 255, 255, 0.01);
	}

	.thinking-icon-wrapper {
		color: #e2a54b;
		display: flex;
		align-items: center;
	}

	.thinking-text-label {
		flex: 1;
	}

	.open-thinking-pane-inline-btn {
		background: none;
		border: none;
		color: var(--accent-blue);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
		margin-left: auto;
	}

	.open-thinking-pane-inline-btn:hover {
		background-color: rgba(168, 199, 250, 0.1);
		color: var(--text-primary);
		text-decoration: underline;
	}

	.thoughts-content {
		padding: 10px 14px;
		border-top: 1px solid var(--border-light);
		background-color: rgba(0, 0, 0, 0.05);
		max-height: 200px;
		overflow-y: auto;
	}

	.thoughts-content :global(p) {
		margin-bottom: 0.5rem;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.thoughts-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.thoughts-content :global(h1),
	.thoughts-content :global(h2),
	.thoughts-content :global(h3),
	.thoughts-content :global(h4),
	.thoughts-content :global(h5),
	.thoughts-content :global(h6) {
		font-size: 0.85rem;
		margin-top: 10px;
		margin-bottom: 4px;
		color: var(--text-secondary);
	}

	.thoughts-content :global(ul),
	.thoughts-content :global(ol) {
		margin-bottom: 8px;
		padding-left: 20px;
	}

	.thoughts-content :global(li) {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-bottom: 2px;
	}

	.thoughts-content :global(code) {
		font-size: 0.82em;
	}

	.thoughts-content :global(.code-block-wrapper) {
		margin: 8px 0;
		font-size: 0.8rem;
	}

	.thoughts-content :global(.code-block-header) {
		padding: 4px 10px;
	}

	.thoughts-content :global(pre[class*="language-"]) {
		padding: 8px 12px;
	}

	.thinking-placeholder-msg {
		display: flex;
		align-items: center;
		padding: 8px 0;
	}

	.small-indicator {
		padding: 0;
		gap: 4px;
	}

	.small-indicator span {
		width: 6px;
		height: 6px;
	}

	.theme-toggle-btn {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
		flex-shrink: 0;
	}

	.theme-toggle-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
		transform: scale(1.05);
	}

	.theme-toggle-btn:active {
		transform: scale(0.95);
	}

	.theme-toggle-btn svg {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	.theme-color-picker {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-right: 8px;
		padding: 4px 8px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 99px;
		height: 34px;
		box-sizing: border-box;
	}

	.color-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.15);
		transition: transform var(--transition-fast), box-shadow var(--transition-fast);
		cursor: pointer;
		padding: 0;
		outline: none;
		position: relative;
	}

	.color-dot:hover {
		transform: scale(1.2);
	}

	.color-dot.active {
		transform: scale(1.1);
		box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent-blue);
	}
</style>
