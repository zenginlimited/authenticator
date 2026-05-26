import "../core/storage.js";
import defaults from "../core/settings/defaults.js";
import GoogleAuth from "../core/auth/google.js";
import TOTP from "../core/auth/totp.js";
import GmailAPI from "../integrations/gmail/client.js";
import findOTP from "../integrations/gmail/otp.js";

const sponsor = document.getElementById("sponsor");
sponsor.addEventListener("click", function () {
	chrome.tabs.create({ url: "https://github.com/sponsors/zenginlimited" })
}, { passive: true });

const Dialog = {
	App: document.querySelector('#app-container > dialog'),
	Manual: document.querySelector('dialog[data-id="manual"]'),
	Pin: document.querySelector('dialog#change-pin')
};

const Template = {
	App: document.querySelector("#app-container > template"),
	Email: document.querySelector("#email-container > template")
};
const appContainer = document.querySelector("#app-container");
const emailContainer = document.querySelector("#email-container");

Dialog.App.addEventListener("close", function() {
	delete this.dataset.id;
});

const secretInput = document.getElementById("manual-secret");
Dialog.Manual.addEventListener("close", function() {
	console.log("close manual")
	secretInput.value = null
});

addEventListener("paste", async function(event) {
	const text = event.clipboardData.getData("text/plain").trim();
	if (!text.startsWith("otpauth://")) return;
	event.preventDefault();
	// if (Dialog.Manual.open) Dialog.Manual.close();
	const { icon, url } = await chrome.tabs.query({ active: true, currentWindow: true })
		.then(([tab]) => {
			if (!tab?.url?.startsWith('http') || !URL.canParse(tab.url)) return null;
			return {
				icon: tab.favIconUrl,
				url: new URL(tab.url)
			}
		});
	chrome.runtime.sendMessage({
		op: 'storeSecret',
		icon,
		origin: url?.origin || null,
		site: url?.hostname || null,
		uri: text
	});
});

const manualAdd = document.querySelector("#manual");
manualAdd.addEventListener("click", function() {
	Dialog.Manual.showModal()
}, { passive: true });

const copyAppCode = Dialog.App.querySelector(".copy-icon");
copyAppCode.addEventListener("click", async function () {
	const code = Dialog.App.querySelector('[data-name="code"]');
	if (this.classList.contains("copied")) return;
	await navigator.clipboard.writeText(code.textContent.replaceAll(" ", ""));
	this.classList.add("copied");
	setTimeout(() => this.classList.remove("copied"), 1e3);
});

const removeApp = Dialog.App.querySelector('button:has(> [icon="delete"])');
removeApp.addEventListener("click", async function () {
	if (!confirm(
		"Are you sure you want to permanently delete your secret? This action cannot be undone and may prevent further access into your account.",
	)) return;
	await chrome.storage.proxy.local.delete(Dialog.App.dataset.id);
	Dialog.App.close("removed");
});

const formatDate = Object.defineProperty(date =>
	new Date(date)
		.toLocaleString([], {
			// weekday: 'short',
			// weekday: 'long',
			year: "numeric",
			month: "short",
			day: "numeric",
			// hour: 'numeric',
			// minute: '2-digit',
			// second: '2-digit'
		})
		.replace(new RegExp(",? " + formatDate.CURRENT_YEAR + ",?"), "")
, "CURRENT_YEAR", {
	value: new Date().getFullYear(),
	writable: true,
});

const scan = document.getElementById("scan");
const paste = document.getElementById("paste");
chrome.tabs
	.query({ active: true, currentWindow: true })
	.then(([currentTab]) => {
		if (!currentTab) return;
		const isHttp = /^https?:/.test(currentTab.url);
		chrome.storage.local.get(async (data) => {
			// Prompt on popup open
			// if (settings.encrypt && vault) {
			// 	chrome.runtime.sendMessage({
			// 		op: 'initEncryption',
			// 		pin: ''
			// 	});
			// }

			const tabURL = currentTab.url && isHttp && new URL(currentTab.url);
			const activeDomain = tabURL?.host?.replace(
				/^(?:.*\.)?([^.]+\.[^.]+)$/,
				"$1",
			);
			const secrets = new Map();
			for (const key in data.apps) {
				const app = data.apps[key];
				secrets.set(key, app);
				// Compare SLD -- second level domain>
				if (!isHttp || !tabURL?.hostname || app.site !== tabURL.hostname) continue;
				// Move current tab to top
				app.active = true;
				const totp = new TOTP(app);
				const code = await totp.get();
				if (data.settings.suggestOnOpen) {
					paste.addEventListener('click', async function() {
						this.classList.add('loading');
						await autoFill(currentTab.id, code);
						this.classList.remove('loading')
					}, { passive: true });
					paste.style.removeProperty('display');
				}

				if (data.settings.fillOnOpen) {
					autoFill(currentTab.id, code);
				}
			}

			secrets.size > 0 && updateSecrets(secrets);
			// Move current tab secret to top -- check url and find secret w/ url
			if (data.settings.gmailIntegration) {
				const details = document.querySelector('#gmail-integration.details');
				details?.removeAttribute('hidden');
				// Cache results in session storage
				// Remove them if they're older than x minutes?
				GoogleAuth.getToken()
					.then(async token => {
						const counter = details.querySelector('[for="gmail-codes"] > .counter');
						await refresh();
						const refreshGmail = document.getElementById('refresh-gmail');
						refreshGmail.addEventListener('click', async function() {
							this.classList.add('loading');
							await refresh();
							this.classList.remove('loading')
						});

						async function refresh() {
							// const earliestOTPDate = Math.floor(Date.now() / 1e3) - 60 * 5;
							const earliestOTPDate = Math.floor(Date.now() / 1e3) - 60 * 240;
							// Max 5 minutes ago for automation;
							// Find OTP should return a list of OTPs from the last 5 minutes
							// Filter the list here, look for one that matches tabURL?.hostname
							const result = await findOTP(token, {
								after: earliestOTPDate,
								expandSearch: data.settings.expandSearch,
								from: activeDomain?.split(".").at(-2) // data.settings.expandSearch ? split
							}).then(async results => {
								if (results.length < 1) {
									if (data.settings.expandSearch) {
										results = await findOTP(token, { after: earliestOTPDate, expandSearch: true });
									}
									if (results.length < 1) return null;
								}

								// Filter duplicates -- only keep most recent
								results = results.filter(result => {
									const sameOrigin = results.find(p => p !== result && p.email.origin === result.email.origin);
									if (!sameOrigin) return true;
									return sameOrigin.email.createdTimestamp < result.email.createdTimestamp
								});
								counter.textContent = results.length;

								let result;
								for (const otp of results) {
									const sld = otp.email.origin?.split('.').slice(-2).join('.');
									if (sld === activeDomain) result = otp;
									// ONLY SHOW DELETE OPT IF AUTO-DELETE IS ENABLED
									// OR prompt for new token
									// Get "issuer" from sender
									updateEmailCode(otp.email.id, {
										code: otp.code,
										origin: otp.email.origin,
										sender: otp.email.sender,
										sld
									}, { createIfNotExists: true });
								}
								return result
							});
							counter.classList.remove('loading');
							emailContainer.classList.remove('loading');
							if (!isHttp || !activeDomain || !result) return;
							if (data.settings.suggestOnOpen) {
								paste.setAttribute('icon', 'gmail');
								// paste.setAttribute('icon-mode', 'bg');
								paste.textContent = 'Paste from Gmail';
								paste.addEventListener('click', async function() {
									this.classList.add('loading');
									await autoFill(currentTab.id, result.code);
									// Upon success, send message to delete email
									// Handle in core/messaging.js
									this.classList.remove('loading')
								}, { passive: true });
								paste.style.removeProperty('display');
							}

							if (data.settings.fillOnOpen) {
								autoFill(currentTab.id, result.code);
							}
						}
					});
			}
		});

		if (!isHttp) return;
		scan.disabled = false;
		scan.addEventListener("click", async function () {
			if (this.classList.contains("update-available")) {
				return chrome.runtime.reload();
			}

			this.classList.add("loading");
			scanPage(currentTab.id);
			// Disable button
			// Only enable on navigation/mutation change or img,svg added to page
		});

		chrome.runtime.onMessage.addListener(function (data) {
			switch (data.event) {
			case "searchComplete":
				scan.classList.remove("loading")
			}
		});
	});

async function scanPage(tabId) {
	await chrome.scripting.executeScript({
		files: ["content/libs/jsqr.min.js", "content/scan.js"],
		target: {
			allFrames: true,
			tabId,
		},
	});
}

async function autoFill(tabId, code) {
	await chrome.scripting
		.executeScript({
			files: ["content/autofill.js"],
			target: { allFrames: true, tabId },
		})
		.then(async () => {
			chrome.tabs.sendMessage(tabId, {
				op: 1,
				code
			});
		});
}

chrome.storage.local.onChanged.addListener(function (changed) {
	const secrets = new Map();
	for (const key in changed) {
		switch (key) {
		case 'settings':
			restoreSettings(changed[key].newValue);
			continue;
		case 'apps':
			const { newValue, oldValue } = changed[key];
			for (const id of Object.keys(oldValue).filter(k => !Object.hasOwn(newValue, k))) {
				const element = appContainer.querySelector(`.secret[data-id="${id}"]`);
				element && element.remove();
			}

			for (const id in newValue) {
				if (JSON.stringify(newValue[id]) === JSON.stringify(oldValue[id])) continue;
				secrets.set(id, newValue[id]);
			}
		}
	}

	secrets.size > 0 && updateSecrets(secrets);
});
chrome.storage.local.get(({ settings }) => restoreSettings(settings));
function updateSecrets(secrets) {
	for (const [key, value] of secrets.entries()) {
		updateSecret(key, value, { createIfNotExists: true });
	}
}

async function updateSecret(id, data, { createIfNotExists } = {}) {
	let element = document.querySelector(`[data-id="${id}"]`);
	let icon, issuer, uid, code;
	if (!element) {
		if (!createIfNotExists) return;
		element = Template.App.content.cloneNode(true);
		element.firstElementChild.dataset.id = id;
		let timer = element.querySelector("svg");
		icon = timer.querySelector("img");
		issuer = element.querySelector(".issuer");
		uid = element.querySelector(".account");
		code = element.querySelector(".code");

		const totp = new TOTP(data);
		const callback = async () => {
			code.textContent = await totp.get().then((r) => {
				if (r.length === 6) return r.replace(/(?<=^\d{3})/, " ");
				return r;
			});
			totp.setTimeout(callback);
		};
		callback();

		timer.style.setProperty("--duration", totp.period);
		const epoch = Date.now() / 1e3;
		timer.style.setProperty("--elapsed", totp.period - (Math.ceil(epoch / totp.period) * totp.period - Math.ceil(epoch)));

		const editButton = element.querySelector(".edit-icon");
		editButton.addEventListener("click", async function () {
			const icon = Dialog.App.querySelector("img");
			icon.src = data.siteIcon;
			const issuer = Dialog.App.querySelector('[data-name="issuer"]');
			issuer.textContent = data.issuer;
			const cts = Dialog.App.querySelector('[data-name="timestamp"]');
			cts.textContent = formatDate(data._cts);
			const uid = Dialog.App.querySelector('[data-name="account"]');
			uid.textContent = data.account;
			const code = Dialog.App.querySelector('[data-name="code"]');
			code.textContent = await totp.get().then((r) => {
				if (r.length === 6) return r.replace(/(?<=^\d{3})/, " ");
				return r;
			});
			Dialog.App.dataset.id = id;
			Dialog.App.showModal();
		});

		const copyButton = element.querySelector(".copy-icon");
		copyButton.addEventListener("click", async function () {
			if (this.classList.contains("copied")) return;
			await navigator.clipboard.writeText(code.textContent.replaceAll(" ", ""));
			this.classList.add("copied");
			setTimeout(() => this.classList.remove("copied"), 1e3);
		});

		appContainer[data.active ? 'prepend' : 'appendChild'](element);
	}

	icon ||= element.querySelector("svg img");
	issuer ||= element.querySelector(".issuer");
	uid ||= element.querySelector(".account");
	icon.src !== data.siteIcon && (icon.src = data.siteIcon || 'icons/web-full.svg');
	issuer[(data.origin ? 'set' : 'remove') + 'Attribute']('href', data.origin);
	issuer.textContent = data.issuer || data.site;
	uid.textContent = data.account;
	uid.title = data.account;
}

async function updateEmailCode(id, data, { createIfNotExists } = {}) {
	let element = document.querySelector(`[data-id="${id}"]`);
	let icon, issuer, account, code;
	if (!element) {
		if (!createIfNotExists) return;
		element = Template.Email.content.cloneNode(true);
		element.firstElementChild.dataset.id = id;
		icon = element.querySelector("img");
		issuer = element.querySelector(".issuer");
		account = element.querySelector(".account");
		code = element.querySelector(".code");

		icon.addEventListener('error', function() {
			this.src = "icons/web-full.svg";
		});
		icon.src = await createIcon(data.sld);
		// Only show if data.settings.autoDeleteOnSuccess is enabled?
		const deleteBtn = element.querySelector(".delete-icon");
		deleteBtn.addEventListener("click", async function () {
			// Prompt new token with delete email permission scope?
			const emailId = element.dataset.id;
			// GmailAPI.delete(token, emailId)
			alert('Unfinished')
		});

		const copyButton = element.querySelector(".copy-icon");
		copyButton.addEventListener("click", async function () {
			if (this.classList.contains("copied")) return;
			await navigator.clipboard.writeText(code.textContent.replaceAll(" ", ""));
			this.classList.add("copied");
			setTimeout(() => this.classList.remove("copied"), 1e3);
		});

		emailContainer[data.active ? 'prepend' : 'appendChild'](element);
	}

	icon ||= element.querySelector("img");
	issuer ||= element.querySelector(".issuer");
	account ||= element.querySelector('.account');
	code ||= element.querySelector(".code");
	issuer[(data.origin ? 'set' : 'remove') + 'Attribute']('href', data.sld);
	issuer.textContent = data.sender || data.sld || data.origin;
	account.textContent = data.origin;
	account.title = data.origin;
	let readable = data.code.toString();
	if ((readable.length % 2) === 0 && isFinite(readable)) {
		readable = `${readable.slice(0, readable.length / 2)} ${readable.slice(readable.length / 2)}`
	}
	code.textContent = readable;
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

for (const item in defaults) {
	let element = document.getElementById(item);
	if (!element) continue;
	switch (item) {
	case 'autoFill':
		element.addEventListener('click', event => {
			if (!element.checked) return;
			event.preventDefault();
			if (!confirm(`Enabling ${item} will make it run in the background on every page. It is strongly recommended that you keep these options disabled as they may result in unexpected behaviour.`)) return;
			element.checked = true;
			element.dispatchEvent(new Event('change'));
		});
		break;
	case "encrypt": {
		const input = Dialog.Pin.querySelector('input[type="password"]');
		element.addEventListener("change", async ({ target }) => {
			// REQUIRE PIN TO DISABLE OR CHANGE
			if (target.checked) {
				const parent = target.closest('.summary');
				parent.classList.toggle('loading', true);
				const pin = await new Promise((resolve, reject) => {
					Dialog.Pin.addEventListener('close', function() {
						if (this.returnValue !== 'save' || input.value.length < 1) return reject(null);
						resolve(input.value)
					}, { once: true });
					Dialog.Pin.showModal()
				}).catch(() => {
					target.checked = false
				});
				await chrome.runtime.sendMessage({
					op: 'initEncryption',
					pin
				});
				console.log(await chrome.runtime.sendMessage({
					op: 'assertPin',
					pin
				}), await chrome.runtime.sendMessage({
					op: 'assertPin',
					pin: 1234
				}));
				parent.classList.toggle('loading', false);
			}

			chrome.storage.proxy.local.settings.set(target.id, target.checked)
		}, { passive: true });
		continue;
	}
	case "gmailIntegration":
		element.addEventListener("change", async ({ target }) => {
			const parent = target.closest('.summary');
			parent.classList.toggle('loading', true);
			await GoogleAuth.getToken({ interactive: target.checked }).then(async token => {
				if (!target.checked) {
					await GoogleAuth.revokeToken(token);
					await GoogleAuth.clearToken(token);
				}
			}).catch(err => {
				console.warn(err.message);
				target.checked = false
			});
			chrome.storage.proxy.local.settings.set(target.id, target.checked);
			parent.classList.toggle('loading', false)
		}, { passive: true });
		continue;
	case "autoDeleteOnSuccess":
		element.addEventListener("change", async ({ target }) => {
			target.parentElement.classList.toggle('loading', true);
		 	await GoogleAuth.getToken({
				interactive: target.checked,
				scopes: [
					"https://www.googleapis.com/auth/gmail.readonly",
					// "https://www.googleapis.com/auth/gmail.modify" // needed for trash
					"https://mail.google.com" // needed for permanently delete -- also works for trash
				]
			}).then(async token => {
				if (!target.checked) {
					await GoogleAuth.revokeToken(token);
					await GoogleAuth.clearToken(token);
				}
			}).catch(err => {
				console.warn(err.message);
				target.checked = false
			});
			chrome.storage.proxy.local.settings.set(target.id, target.checked);
			target.parentElement.classList.toggle('loading', false)
		}, { passive: true });
		continue;
	}
	switch (element.type.toLowerCase()) {
	case "checkbox":
		element.addEventListener("change", ({ target }) =>
			chrome.storage.proxy.local.settings.set(target.id, target.checked)
		, { passive: true });
	}
}

function restoreSettings(data) {
	for (const item in data) {
		let element = document.getElementById(item);
		if (!element) continue;
		switch (element.type.toLowerCase()) {
			case "checkbox":
				element.checked = data[item];
		}
	}
}
