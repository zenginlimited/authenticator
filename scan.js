{
	let canvas, ctx;

	attach();
	// Only if auto-scan is enabled
	window.navigation?.addEventListener('navigatesuccess', attach, { passive: true });

	const ZA_BADGE = ['%cZengin Authenticator', 'background: #5865F2;color: white;font-weight: bold;padding: 1px 6px;border-radius: 4px;'];
	async function attach() {
		const imageElements = document.querySelectorAll('img, svg');
		if (imageElements.length < 1) return;
		for (const img of imageElements) {
			try {
				switch (img.tagName.toUpperCase()) {
				case 'IMG':
					if (img.complete) {
						const success = img.naturalWidth > 0;
						if (!success) break;
						processImage(img);
					} else {
						await new Promise((resolve, reject) => {
							var cleanUp = () => {
								img.removeEventListener('load', loadListener);
								img.removeEventListener('error', errorListener);
							};
							var loadListener = () => {
								processImage(img);
								cleanUp();
								resolve();
							};
							var errorListener = () => {
								cleanUp();
								reject();
							};
							img.addEventListener()
						});
					}
					break;
				case 'SVG':
					if (!img.width) break;
					const svgImage = await svgToImage(img);
					processImage(svgImage);
				}
			} catch (err) {
				console.warn(...ZA_BADGE, 'Error processing image:', err, img);
			}
		}

		canvas = null;
		ctx = null;
		chrome.runtime.sendMessage({ op: 'search-complete' })
	}

	function processImage(img) {
		if (!canvas) {
			canvas = document.createElement('canvas');
			ctx = canvas.getContext('2d', { willReadFrequently: true });
		}

		let width, height;
		switch (img.tagName.toUpperCase()) {
		case 'IMG':
			width = img.naturalWidth;
			height = img.naturalHeight;
			break;
		case 'SVG':
			width = img.clientWidth;
			height = img.clientHeight;
			console.log(img.width, 'svg width')
		}
		if (width != canvas.width ||
		height != canvas.height) {
			canvas.width = width;
			canvas.height = height;
		} else {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}

		ctx.drawImage(img, 0, 0);

		let imageData;
		try {
			imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		} catch (e) {
			console.warn('Canvas is tainted (cross-origin image)');
			// Bypass cross-origin restriction
			// const res = await fetch(img.src)
			// const blob = await res.blob()

			// const safeImg = new Image()
			// safeImg.src = URL.createObjectURL(blob)

			// await safeImg.decode()

			// processImage(safeImg)
			// Or add "permissions": ["<all_urls>"] to manifest.json
			return;
		}

		const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
		if (qrCode?.data?.startsWith('otpauth://')) {
			chrome.runtime.sendMessage({
				op: 'secret-found',
				data: qrCode.data
			})
		}
	}

	function svgToImage(svg) {
		const img = new Image();
		img.src = URL.createObjectURL(
			new Blob([
				new XMLSerializer()
					.serializeToString(svg)
			], { type: 'image/svg+xml' })
		);

		return img.decode().then(() => {
			URL.revokeObjectURL(img.src);
			return img
		})
	}
}