chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	if (sender.id !== chrome.runtime.id) return;
	switch (request.op) {
	case 1:
		// auto-fill
		let input = querySelectorDeep('[autocomplete*="one-time-code"]');
		if (input) {
			if (input.maxLength == 1) {
				for (const char of request.code) {
					input.value = char;
					input.dispatchEvent(new Event('input', { bubbles: true }));
					input.dispatchEvent(new Event('change', { bubbles: true }));
					input = input.nextElementSibling;
					if (!input || input.maxLength !== 1) break;
				}
			} else {
				input.value = request.code;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}
		}

		sendResponse(true);
	}
});

function querySelectorDeep(selector, root = document) {
	if (root instanceof ShadowRoot || root instanceof Document || root instanceof HTMLElement) {
		// Try direct match
		let el = root.querySelector(selector);
		if (el) return el;
		// Traverse shadow roots of children
		for (let child of root.querySelectorAll('*')) {
			if (child.shadowRoot) {
				let found = querySelectorDeep(selector, child.shadowRoot);
				if (found) return found;
			}
		}
	}
	return null
}