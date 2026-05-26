import DEFAULTS from "./settings/defaults.js";
import AutomationManager from "./automation.js";
import "./crypto.js";
import "./messaging.js";

addEventListener("install", function () {
	chrome.storage.local.get(async ({ apps = {}, settings = DEFAULTS }) => {
		settings = Object.assign(DEFAULTS, settings);
		// Only set if settings changed
		await chrome.storage.local.set({
			apps,
			settings
		});
		applySettings(settings)
	})
}, { once: true });

chrome.storage.local.onChanged.addListener(function({ settings }) {
	settings && applySettings(settings.newValue)
});

function applySettings(settings) {
	AutomationManager[(settings.autoScan || settings.autoFill) ? 'start' : 'stop']()
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	chrome.tabs.get(tabId, tab => {
		if (!tab.url?.match(/^https?:\/\//) || !URL.canParse(tab.url)) return;
		const url = new URL(tab.url);
		chrome.storage.local.get(async ({ apps }) => {
			let counter = 0;
			for (let key in apps) {
				const app = apps[key];
				// Use app.site for broad match
				if (app.origin !== url.origin) continue;
				counter++;
			}

			if (counter < 1) return;
			await chrome.action.setBadgeBackgroundColor({ color: '#333', tabId });
			await chrome.action.setBadgeText({ tabId, text: counter.toString() });
		})
	})
});