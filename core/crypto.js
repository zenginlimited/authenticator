export default class VaultCrypto {
	static algorithm = 'AES-GCM';
	constructor(key, salt) {
		Object.defineProperty(this, 'key', { value: key });
		this.salt = salt || null
	}

	encrypt(secret) {
		return VaultCrypto.encrypt(secret, this.key)
	}

	decrypt(cipher) {
		return VaultCrypto.decrypt(cipher, this.key)
	}

	static #encoder = null;
	static async init(password, salt) {
		salt ||= crypto.getRandomValues(new Uint8Array(16));
		const key = await VaultCrypto._deriveKey(password, salt);
		const vault = new VaultCrypto(key, salt);
		return vault
	}

	static async _deriveKey(password, salt) {
		if (!VaultCrypto.#encoder) VaultCrypto.#encoder = new TextEncoder();
		const keyDerivationFunction = "PBKDF2";
		const keyMaterial = await crypto.subtle.importKey(
			"raw",
			VaultCrypto.#encoder.encode(password),
			{ name: keyDerivationFunction },
			false,
			["deriveKey"]
		);

		return crypto.subtle.deriveKey({
			name: keyDerivationFunction,
			salt,
			iterations: 6e5,
			hash: 'SHA-256'
		}, keyMaterial, {
			name: VaultCrypto.algorithm,
			length: 256
		}, false, ["encrypt", "decrypt"])
	}

	static async encrypt(secret, key) {
		if (!VaultCrypto.#encoder) VaultCrypto.#encoder = new TextEncoder();
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoded = VaultCrypto.#encoder.encode(secret);
		const ciphertext = await crypto.subtle.encrypt({
			name: VaultCrypto.algorithm,
			iv
		}, key, encoded);

		return {
			iv: Array.from(iv),
			ciphertext: Array.from(new Uint8Array(ciphertext))
		}
	}

	static #decoder = new TextDecoder();
	static async decrypt(stored, key) {
		const iv = new Uint8Array(stored.iv);
		const data = new Uint8Array(stored.ciphertext);

		try {
			const plaintextBuffer = await crypto.subtle.decrypt({
				name: VaultCrypto.algorithm,
				iv
			}, key, data);

			if (!VaultCrypto.#decoder) VaultCrypto.#decoder = new TextDecoder();
			return VaultCrypto.#decoder.decode(plaintextBuffer)
		} catch (e) {
			throw new Error("Wrong PIN or corrupted data")
		}
	}
}

const pin = 1234; // DON'T STORE
const salt = crypto.getRandomValues(new Uint8Array(16)); // store

// DON'T STORE
// VaultCrypto.deriveKey(pin, salt).then(async key => {
// 	const cipherText = await VaultCrypto.encrypt('SUPER secRET!! 123', key);
// 	console.log(cipherText, key, btoa(JSON.stringify(cipherText)), await decryptSecret(pin, cipherText, salt))

// 	// const cipherText2 = await VaultCrypto.encrypt('SUPER secRET!! 123', key);
// 	// console.log(cipherText2, key)
// });

VaultCrypto.init(pin).then(async vault => {
	const cipher = await vault.encrypt('SUPER secRET!! 123');
	console.log(vault, cipher, await vault.decrypt(cipher))
});