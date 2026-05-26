for (const i of document.querySelectorAll('input[pending]')) {
	i.addEventListener('click', function(e) {
		if (triggerPre(i).defaultPrevented)
			e.preventDefault()
	});
}

function triggerPre(i) {
	const e = new CustomEvent('beforechange', {
		cancelable: true,
		detail: i.checked
	});
	i.dispatchEvent(e);
	return e
}