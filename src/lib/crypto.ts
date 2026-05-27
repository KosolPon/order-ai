// Client-side encryption/decryption using Web Crypto API and IndexedDB
// The key is generated dynamically in the browser, stored in IndexedDB with extractable: false,
// ensuring Javascript (including XSS scripts) cannot extract the raw key bytes.

let activeKey: CryptoKey | null = null;

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB is not supported'));
			return;
		}
		const request = indexedDB.open('OrderAICryptoKeyDB', 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains('keys')) {
				db.createObjectStore('keys');
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function getOrCreateKey(): Promise<CryptoKey> {
	if (activeKey) return activeKey;

	try {
		const db = await openDB();
		
		// Try to read existing key
		const storedKey = await new Promise<CryptoKey | null>((resolve, reject) => {
			const tx = db.transaction('keys', 'readonly');
			const store = tx.objectStore('keys');
			const request = store.get('encryption_key');
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});

		if (storedKey) {
			activeKey = storedKey;
			return storedKey;
		}

		// Generate new AES-GCM 256-bit key (non-extractable)
		const newKey = await window.crypto.subtle.generateKey(
			{
				name: 'AES-GCM',
				length: 256
			},
			false, // extractable: false -> Cannot be exported or read as raw bytes in JS
			['encrypt', 'decrypt']
		);

		// Store in IndexedDB
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction('keys', 'readwrite');
			const store = tx.objectStore('keys');
			const request = store.put(newKey, 'encryption_key');
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});

		activeKey = newKey;
		return newKey;
	} catch (e) {
		console.error('Failed to initialize cryptographic key:', e);
		throw e;
	}
}

// Convert ArrayBuffer to Base64 safely
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return window.btoa(binary);
}

// Convert Base64 back to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
	const binary = window.atob(base64);
	const len = binary.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Encrypt a plaintext string using the non-extractable client key.
 * Returns a base64 encoded string format: "ivBase64:ciphertextBase64"
 */
export async function encryptData(plaintext: string): Promise<string> {
	if (!plaintext) return '';
	if (typeof window === 'undefined' || !window.crypto) {
		return plaintext; // Fallback for SSR or unsupported environments
	}

	try {
		const key = await getOrCreateKey();
		const encoder = new TextEncoder();
		const data = encoder.encode(plaintext);

		// Generate a unique 12-byte Initialization Vector (IV)
		const iv = window.crypto.getRandomValues(new Uint8Array(12));

		const ciphertext = await window.crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: iv as any
			},
			key,
			data as any
		);

		const ivBase64 = arrayBufferToBase64(iv.buffer);
		const ciphertextBase64 = arrayBufferToBase64(ciphertext);

		return `${ivBase64}:${ciphertextBase64}`;
	} catch (e) {
		console.error('Encryption failed:', e);
		throw e;
	}
}

/**
 * Decrypt data that was encrypted using encryptData.
 */
export async function decryptData(encryptedStr: string): Promise<string> {
	if (!encryptedStr) return '';
	if (typeof window === 'undefined' || !window.crypto) {
		return encryptedStr;
	}

	// If it doesn't contain a colon, it's not encrypted (legacy plaintext)
	if (!encryptedStr.includes(':')) {
		return encryptedStr;
	}

	try {
		const key = await getOrCreateKey();
		const [ivBase64, ciphertextBase64] = encryptedStr.split(':');
		
		const iv = base64ToUint8Array(ivBase64);
		const ciphertext = base64ToUint8Array(ciphertextBase64);

		const decryptedBuffer = await window.crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: iv as any
			},
			key,
			ciphertext as any
		);

		const decoder = new TextDecoder();
		return decoder.decode(decryptedBuffer);
	} catch (e) {
		console.error('Decryption failed, returning ciphertext or empty string:', e);
		// If decryption fails (e.g. key changed/cleared), return empty or handle gracefully
		return '';
	}
}
