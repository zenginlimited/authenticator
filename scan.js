self.ZA_BADGE = ['%cZengin Authenticator', 'background: #5865F2;color: white;font-weight: bold;padding: 1px 6px;border-radius: 4px;'];
// wrap everything in another function and emit when
self.navigation && navigation.addEventListener('navigatesuccess', attach);
attach();
function attach() {
	// search for the main video player if multiple exist
	let imageElements = document.querySelectorAll('img, svg');
	if (imageElements.length < 1) return;
	for (let img of imageElements) {
		try {
			img.complete && img.naturalWidth > 0 && processImage(img);
		} catch (err) {
			console.warn(...ZA_BADGE, 'Error processing image:', err);
		}
	}

	chrome.runtime.sendMessage({ op: 'search-complete' })
}

function processImage(img) {
	let canvas = document.createElement('canvas');
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	let ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);
	let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

	// Here, you would decode the imageData using your QR decoder
	// Placeholder:
	// console.log('Image data', imageData);
	const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
	let result = qrCode.data;
	if (result && result.startsWith('otpauth://')) {
		chrome.runtime.sendMessage({
			op: 'secret-found',
			data: result
		});
	}
}