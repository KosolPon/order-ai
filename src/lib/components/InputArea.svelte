<script lang="ts">
	import type { OllamaModel } from '$lib/types';
	
	let {
		input = $bindable(),
		models = [],
		selectedModel = $bindable(),
		isGenerating = false,
		onSend,
		onStop
	} = $props<{
		input: string;
		models: OllamaModel[];
		selectedModel: string;
		isGenerating: boolean;
		onSend: () => void;
		onStop: () => void;
	}>();

	let textareaElement = $state<HTMLTextAreaElement | null>(null);

	// Auto-resize textarea logic
	$effect(() => {
		if (input === '') {
			if (textareaElement) {
				textareaElement.style.height = 'auto';
			}
		} else {
			adjustHeight();
		}
	});

	function adjustHeight() {
		if (textareaElement) {
			textareaElement.style.height = 'auto';
			const scrollHeight = textareaElement.scrollHeight;
			textareaElement.style.height = `${Math.min(scrollHeight, 200)}px`;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// Send message on Enter without shift
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (input.trim() && !isGenerating) {
				onSend();
			}
		}
	}
</script>

<div class="input-container">
	<div class="input-wrapper">
		<!-- Pill Input Box (Single Row Layout) -->
		<div class="pill-box-single">
			<!-- Prompt Textarea on the left -->
			<textarea
				bind:this={textareaElement}
				class="prompt-textarea"
				placeholder="Ask anything, type a prompt..."
				bind:value={input}
				onkeydown={handleKeydown}
				oninput={adjustHeight}
				rows="1"
				disabled={isGenerating}
			></textarea>

			<!-- Model Selector on the right of the message -->
			<div class="model-selector-wrapper">
				<svg class="model-icon" viewBox="0 0 24 24" width="16" height="16">
					<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
				</svg>
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
			</div>

			<!-- Action Button on the far right -->
			<div class="action-buttons">
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
					<button 
						class="control-btn send-btn" 
						class:active={input.trim().length > 0 && models.length > 0}
						onclick={onSend}
						disabled={!input.trim() || models.length === 0}
						title="Send prompt"
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
		border-radius: 28px;
		padding: 8px 12px 8px 16px;
		box-shadow: var(--shadow-md);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		display: flex;
		flex-direction: row;
		align-items: flex-end;
		gap: 12px;
	}

	.pill-box-single:focus-within {
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 1px var(--accent-blue), var(--shadow-lg);
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
		padding: 6px 0;
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
		padding: 0 10px;
		box-sizing: border-box;
		color: var(--text-secondary);
		position: relative;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		flex-shrink: 0;
		margin-bottom: 2px;
	}

	.model-selector-wrapper:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.model-icon {
		color: var(--accent-blue);
		flex-shrink: 0;
	}

	.model-select {
		appearance: none;
		-webkit-appearance: none;
		padding-right: 18px;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		background: transparent;
		border: none;
		outline: none;
		color: inherit;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		color: var(--text-muted);
		background-color: transparent;
	}

	.send-btn {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		cursor: not-allowed;
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

	@media (max-width: 768px) {
		.input-container {
			padding: 0 12px 16px 12px;
		}

		.pill-box-single {
			padding: 6px 10px;
			border-radius: 20px;
			gap: 8px;
		}

		.prompt-textarea {
			font-size: 0.95rem;
		}

		.model-select {
			max-width: 90px;
		}
	}
</style>
