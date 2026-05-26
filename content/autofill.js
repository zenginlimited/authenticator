if (!globalThis.__za) {
	Object.defineProperty(globalThis, '__za', {
		value: {
			listeners: new Map()
		}
	});
}

if (!__za.listeners.has('autoFill')) {
	__za.listeners.set('autoFill', autoFillListener);

	chrome.runtime.onMessage.addListener(autoFillListener);

	function autoFillListener(request, sender, sendResponse) {
		if (sender.id !== chrome.runtime.id) return;
		switch (request.op) {
		case 1:
			// auto-fill
			let input = querySelectorDeep(`[autocomplete*="one-time-code"], [maxLength="${request.code.length}"]`);
			// Check settings first, add experimental option for extended/"guess work" matching
			if (!input) {
				const first = querySelectorDeep('[maxLength="1"]')
					, container = first?.closest(':has(* input), form') || first?.parentElement;
				if (first && isOtpGroup(container)) {
					input = first;
				} else {
					input = querySelectorDeep('input:is([autocomplete*="otp"], [name*="otp" i], [id*="otp" i], [aria-label*="code" i])');
				}
			}

			if (input) {
				if (input.maxLength == 1) {
					for (const char of request.code) {
						input.value = char;
						input.dispatchEvent(new Event('input', { bubbles: true }));
						input.dispatchEvent(new Event('change', { bubbles: true }));
						input = document.activeElement != input && document.activeElement.tagName == 'INPUT' && document.activeElement.matches('[maxLength="1"]') ? document.activeElement : input.nextElementSibling;
						if (!input || input.maxLength !== 1) break;
					}
				} else {
					input.value = request.code;
					input.dispatchEvent(new Event('input', { bubbles: true }));
					input.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}

			sendResponse(true)
		}
	}

	function querySelectorDeep(selector, root = document) {
		if (root instanceof ShadowRoot || root instanceof Document || root instanceof HTMLElement) {
			// Try direct match
			const el = root.querySelector(selector);
			if (el) return el;
			// Traverse shadow roots of children
			for (const child of root.querySelectorAll('*')) {
				if (child.shadowRoot) {
					const found = querySelectorDeep(selector, child.shadowRoot);
					if (found) return found;
				}
			}
		}
		return null
	}

	function isOtpGroup(container) {
		const inputs = container.querySelectorAll('input[maxlength="1"]')
		if (inputs.length < 4 || inputs.length > 8) return false

		return [...inputs].every(i =>
			i.type !== "hidden" &&
			(i.inputMode === "numeric" || i.type === "tel" || i.type === "text")
		)
	}
}