import defaults from "./constants/defaults.js";

self.addEventListener('install', async function() {
	chrome.storage.local.get(({ settings }) => {
		chrome.storage.local.set({
			settings: Object.assign(defaults, settings)
		})
	})
}, { once: true });