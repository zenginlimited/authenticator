import OTPAuthURI from "./auth/otpauthuri.js";
import VaultCrypto from "./crypto.js";
import "./storage.js";

let vault;
chrome.runtime.onMessage.addListener(async function (data, sender, sendResponse) {
	if (!data || typeof data != 'object') return;
	switch (data.op) {
	case 'assertPin':
		if (chrome.runtime.id !== sender?.id) return;
		const key = await VaultCrypto._deriveKey(data.pin, vault.salt ?? chrome.storage.proxy.local.vault?.salt);
		const matches = await VaultCrypto.decrypt(vault?.test ?? chrome.storage.proxy.local.vault?.test, key)
			.then(secret => secret === 'secret')
			.catch(() => false);
		sendResponse(matches);
		break;
	case 'initEncryption':
		if (chrome.runtime.id !== sender?.id) return;
		// If vault exists, decrypt all secrets BEFORE creating new vault
		vault = await VaultCrypto.init(data.pin, chrome.storage.proxy.local.vault?.salt);
		vault.test = await vault.encrypt('secret');
		chrome.storage.proxy.local.set('vault', {
			salt: vault.salt,
			test: vault.test
		});
		break;
	case 'decrypt':
		if (!vault) {
			sendResponse(null);
			break;
		}

		const secret = await vault.decrypt(data.cipher);
		sendResponse(secret);
		break;
	case 'storeSecret':
		const otpAuthUri = parseOTPAuthUri(data.uri);
		const hash = await createHash(`${data.site}:${data.account ?? otpAuthUri.secret}`);
		// const cipher = await VaultCrypto.encrypt(secret, key);
		chrome.storage.proxy.local.apps.set(hash, {
			_cts: Date.now(),
			account: otpAuthUri.account,
			algorithm: otpAuthUri.algorithm,
			digits: otpAuthUri.digits,
			origin: data.origin,
			site: data.site,
			siteIcon: await createIcon(data.site)
				.catch(err => console.warn('Failed to load icon:', err)) ||data.icon,
			issuer: otpAuthUri.issuer,
			period: otpAuthUri.period,
			secret: otpAuthUri.secret
		})
	}
});

function parseOTPAuthUri(uri) {
	return new OTPAuthURI(uri)
}

async function createHash(input) {
	const hashBuffer = await crypto.subtle.digest(
		'SHA-1',
		new TextEncoder().encode(input)
	);
	const hash = [...new Uint8Array(hashBuffer)]
		.map(v => v.toString(16).padStart(2, '0'))
		.join('');
	return hash
}

async function createIcon(site, size = 32) {
	const blob = await fetch(`https://www.google.com/s2/favicons?domain=${site}&sz=${size}`)
		.then(r => r.blob());
	const reader = new FileReader();
	return new Promise(async resolve => {
		reader.onload = () => resolve(reader.result);
		reader.readAsDataURL(blob)
	})
}