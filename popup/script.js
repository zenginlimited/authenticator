import "../utils/Storage.js";
import defaults from "../constants/defaults.js";
import TOTP from "../utils/TOTP.js";

const APP = {
	container: document.querySelector('#app-container'),
	dialog: document.querySelector('#app-container > dialog'),
	template: document.querySelector('#app-container > template')
};

APP.dialog.addEventListener('close', function() {
	delete this.dataset.id
});

const copyAppCode = APP.dialog.querySelector('.copy-icon');
copyAppCode.addEventListener('click', async function() {
	const code = APP.dialog.querySelector('[data-name="code"]');
	if (this.classList.contains('copied')) return;
	await navigator.clipboard.writeText(code.textContent.replaceAll(' ', ''));
	this.classList.add('copied');
	setTimeout(() => this.classList.remove('copied'), 1e3)
});

const removeApp = APP.dialog.querySelector('.delete-icon');
removeApp.addEventListener('click', async function() {
	await chrome.storage.proxy.local.delete(APP.dialog.dataset.id);
	APP.dialog.close('removed')
});

const formatDate = Object.defineProperty(date => {
	return new Date(date).toLocaleString([], {
		// weekday: 'short',
		// weekday: 'long',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		// hour: 'numeric',
		// minute: '2-digit',
		// second: '2-digit'
	}).replace(new RegExp(',? ' + formatDate.CURRENT_YEAR + ',?'), '')
}, 'CURRENT_YEAR', {
	value: new Date().getFullYear(),
	writable: true
});

const scan = document.querySelector('#scan');
chrome.tabs.query({ active: true, currentWindow: true }).then(([currentTab]) => {
	if (!currentTab) return;
	const isHttp = /^https?:/.test(currentTab.url);
	chrome.storage.local.get(data => {
		const tabURL = currentTab.url && isHttp && new URL(currentTab.url);
		const activeDomain = tabURL?.host?.replace(/^(?:.*\.)?([^.]+\.[^.]+)$/, '$1');
		const secrets = new Map();
		for (const key in data) {
			if (!key.includes(':')) continue;
			secrets.set(key, data[key]);
			if (data.settings.autoFill && activeDomain && activeDomain === data[key].domain) {
				autoFill(currentTab.id, data[key]);
			}
		}

		secrets.size > 0 && updateSecrets(secrets);
		// move current tab secret to top -- check url and find secret w/ url
		data.settings.autoScan && autoScan(currentTab.id)
	});

	if (!isHttp) return;
	scan.disabled = false;
	scan.addEventListener('click', async function () {
		if (this.classList.contains('update-available')) {
			return chrome.runtime.reload();
		}

		this.classList.add('loading');
		autoScan(currentTab.id)
	});

	chrome.runtime.onMessage.addListener(async function(data) {
		switch (data.op) {
		case 'secret-found':
			const tabURL = new URL(currentTab.url);
			const oauthURL = new URL(data.data);
			const parts = oauthURL.pathname.replace(/^\//, '').split(':');
			const issuer = (parts.length > 1 && parts.shift()) || oauthURL.searchParams.get('issuer') || tabURL.host.replace(/^(?:.*\.)?([^.]+)\.[^.]+$/, '$1');
			const uid = parts[0];
			const credential = issuer + ':' + uid;
			const secret = oauthURL.searchParams.get('secret');
			if (!secret) break;
			chrome.storage.proxy.local.set(credential, {
				algorithm: oauthURL.searchParams.get('algorithm') || 'SHA1',
				appIconURL: currentTab.favIconUrl,
				cts: Date.now(),
				digits: oauthURL.searchParams.get('digits') || 6,
				domain: tabURL.host.replace(/^(?:.*\.)?([^.]+\.[^.]+)$/, '$1'),
				issuer,
				period: oauthURL.searchParams.get('period') || 30,
				secret,
				uid
			});
			break;
		case 'search-complete':
			scan.classList.remove('loading')
		}
	});

	function autoFill(tabId, data) {
		chrome.scripting.executeScript({
			files: ['autofill.js'],
			target: { allFrames: true, tabId }
		}).then(async () => {
			const totp = new TOTP(data);
			const code = await totp.get();
			chrome.tabs.sendMessage(tabId, {
				op: 1,
				code
			})
		})
	}
});

function autoScan(tabId) {
	chrome.scripting.executeScript({
		files: ['libs/jsqr.js', 'scan.js'],
		target: {
			allFrames: true,
			tabId
		}
	})
}

chrome.storage.local.onChanged.addListener(function(changed) {
	const secrets = new Map();
	for (const key in changed) {
		if (key === 'settings') {
			restoreSettings(changed[key].newValue);
			continue;
		} else if (!key.includes(':')) continue;
		const { newValue } = changed[key];
		if (newValue) {
			secrets.set(key, newValue);
		} else {
			const element = document.querySelector(`#app-container > .secret[data-id="${key}"]`);
			element && element.remove();
		}
	}

	secrets.size > 0 && updateSecrets(secrets)
});
chrome.storage.local.get(({ settings }) => restoreSettings(settings));
function updateSecrets(secrets) {
	for (const [key, value] of secrets.entries()) {
		updateSecret(key, value, { createIfNotExists: true })
	}
}

async function updateSecret(id, data, { createIfNotExists } = {}) {
	let element = document.querySelector(`[data-id="${id}"]`);
	let icon, issuer, uid, code;
	if (!element) {
		if (!createIfNotExists) return;
		element = APP.template.content.cloneNode(true);
		element.firstElementChild.dataset.id = id;
		icon = element.querySelector('img');
		issuer = element.querySelector('.issuer');
		uid = element.querySelector('.uid');
		code = element.querySelector('.code');

		const totp = new TOTP(data);
		const callback = async () => {
			code.textContent = await totp.get()
				.then(r => {
					if (r.length === 6)
						return r.replace(/(?<=^\d{3})/, ' ');
					return r
				});
			totp.setTimeout(callback)
		};
		callback();

		const editButton = element.querySelector('.edit-icon');
		editButton.addEventListener('click', async function() {
			const icon = APP.dialog.querySelector('img');
			icon.src = data.appIconURL;
			const issuer = APP.dialog.querySelector('[data-name="issuer"]');
			issuer.textContent = data.issuer;
			const cts = APP.dialog.querySelector('[data-name="timestamp"]');
			cts.textContent = formatDate(data.cts);
			const uid = APP.dialog.querySelector('[data-name="uid"]');
			uid.textContent = data.uid;
			const code = APP.dialog.querySelector('[data-name="code"]');
			code.textContent = await totp.get()
				.then(r => {
					if (r.length === 6)
						return r.replace(/(?<=^\d{3})/, ' ');
					return r
				});
			APP.dialog.dataset.id = id;
			APP.dialog.showModal()
		});

		const copyButton = element.querySelector('.copy-icon');
		copyButton.addEventListener('click', async function() {
			if (this.classList.contains('copied')) return;
			await navigator.clipboard.writeText(code.textContent.replaceAll(' ', ''));
			this.classList.add('copied');
			setTimeout(() => this.classList.remove('copied'), 1e3)
		});

		APP.container.appendChild(element);
	}

	icon ||= element.querySelector('img');
	issuer ||= element.querySelector('.issuer');
	uid ||= element.querySelector('.uid');
	code ||= element.querySelector('.code');
	icon.src !== data.appIconURL && (icon.src = data.appIconURL);
	issuer.href = 'https://' + data.domain;
	issuer.textContent = data.issuer;
	uid.textContent = data.uid
}

for (const item in defaults) {
	let element = document.getElementById(item);
	if (!element) continue;
	switch (element.type.toLowerCase()) {
	case 'checkbox':
		element.addEventListener('change', ({ target }) => chrome.storage.proxy.local.settings.set(target.id, target.checked), { passive: true })
	}
}

function restoreSettings(data) {
	for (const item in data) {
		let element = document.getElementById(item);
		if (!element) continue;
		switch (element.type.toLowerCase()) {
		case 'checkbox':
			element.checked = data[item]
		}
	}
}

const rippleCache = new WeakMap();
document.documentElement.addEventListener('pointerdown', function (event) {
	event.target.style.setProperty('--offsetX', event.offsetX);
	event.target.style.setProperty('--offsetY', event.offsetY);
	rippleCache.has(event.target) && clearTimeout(rippleCache.get(event.target));
	const timeout = setTimeout(() => {
		event.target.style.removeProperty('--offsetX', event.offsetX);
		event.target.style.removeProperty('--offsetY', event.offsetY);
		event.target.style.length === 0 && event.target.removeAttribute('style');
		rippleCache.delete(event.target)
	}, 1e3);
	rippleCache.set(event.target, timeout)
	// this.style.setProperty('--offsetX', event.offsetX);
	// this.style.setProperty('--offsetY', event.offsetY)
});