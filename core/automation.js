import "./storage.js";
import GoogleAuth from "./auth/google.js";
import findOTP from "../integrations/gmail/otp.js";

let int;
export default class AutomationManager {
	static Events = {
		onActivated: ({ tabId }) => {
			clearInterval(int);
			chrome.tabs.get(tabId, tab => {
				if (tab.status !== 'complete' || !tab.url?.match(/^https?:\/\//)) return;
				inject(tabId, tab)
			})
		},
		onUpdated: (tabId, changeInfo, tab) => {
			// For webapps that don't refresh the page, complete won't fire;
			// Look for changeInfo.url or handle with navigation on page
			if (changeInfo.url) clearInterval(int);
			if (changeInfo.status !== 'complete' || !tab.url?.match(/^https?:\/\//)) return;
			inject(tabId, tab)
		}
	};

	static start() {
		for (const method in AutomationManager.Events) {
			chrome.tabs[method].addListener(AutomationManager.Events[method])
		}
	}

	static stop() {
		for (const method in AutomationManager.Events) {
			chrome.tabs[method].removeListener(AutomationManager.Events[method])
		}
	}
}

function inject(tabId, tab) {
	const { settings } = chrome.storage.proxy.local;
	if (settings.autoScan) autoScan(tabId);
	if (settings.autoFill) {
		// Inject small script first to check if there is an otp input to auto-fill from gmail?
		console.log('inject', tabId, tab);
		// autoFill(tabId, code); // need to check/calculate code! -- find the stored secret with the current domain/taburl
	}

	const tabURL = new URL(tab.url);
	const activeDomain = tabURL?.host?.replace(
		/^(?:.*\.)?([^.]+\.[^.]+)$/,
		"$1",
	);
	if (settings.autoFillFromGmail && activeDomain) {
		const earliestOTPDate = Math.floor(Date.now() / 1e3) - 30;
		// Max 30 seconds ago for automation
		GoogleAuth.getToken()
			.then(async token => {
				// Check periodically for 30 seconds
				int = setInterval(async () => {
					const otp = await findOTP(token, { activeDomain, ts: earliestOTPDate });
					if (otp === null) return;
					clearInterval(int);
					console.debug('OTP Found:', otp);
					// autoFill(tab.id, otp.code);
					// Send message to extension popup -- store in session
					// chrome.storage.session.set(activeDomain, otp);
				}, 1e3);
			});
	}
}

function autoScan(tabId) {
	chrome.scripting.executeScript({
		files: ["content/libs/jsqr.min.js", "content/scan.js"],
		target: {
			allFrames: true,
			tabId
		}
	})
}

function autoFill(tabId, code) {
	chrome.scripting
		.executeScript({
			files: ["content/autofill.js"],
			target: { allFrames: true, tabId }
		})
		.then(async () => {
			chrome.tabs.sendMessage(tabId, {
				op: 1,
				code
			})
		})
}