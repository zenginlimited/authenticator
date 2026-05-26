if (!globalThis.__za) {
	Object.defineProperty(globalThis, '__za', {
		value: {
			listeners: new Map()
		}
	});
}

if (!__za.listeners.has('scan')) {
	__za.listeners.set('scan', scan);

	Object.defineProperty(__za, 'asyncRunner', {
		async value(gen, opts = {}, callback) {
			if (typeof gen == 'function') gen = gen();
			let progress = 0;
			const chunkSize = opts?.chunkSize ?? 100;
			return new Promise(resolve => {
				(async function step() {
					requestAnimationFrame(step);
					for (let i = 0; i < chunkSize; i++) {
						const result = await gen.next();
						if (result.done) return resolve(result.value);
					}

					typeof callback == 'function' && callback(progress++)
				})()
			})
		}
	});

	let canvas, ctx;

	const ZA_BADGE = ['%cZengin Authenticator', 'background: #5865F2;color: white;font-weight: bold;padding: 1px 6px;border-radius: 4px;'];
	scan();
	// Only if auto-scan is enabled
	window.navigation?.addEventListener('navigatesuccess', scan, { passive: true });
	async function scan() {
		// Check canvas/video elements?
		const imageElements = Array.prototype.filter.call(document.querySelectorAll('canvas, img, svg'), e => {
			switch (e.tagName) {
			case 'CANVAS': if (!isValidQrCanvas(e)) return false; break;
			case 'IMG': if (e.complete && e.naturalWidth > 0 && !isValidQrImg(e)) return false; break;
			case 'SVG': if (!isValidQrSvg(e)) return false; break;
			}
			 return true
		});
		if (imageElements.length < 1) return false;
		// Sort imageElements first by-- ALSO CHECK Canvas imageElements
		// Sort by priority & probability
		// SVGs
		// Image: Blob URLs first, then images by the current domain, then SLD (second-level domain -- not subdomain)
		// imageElements.sort((a, b) => {});
		await __za.asyncRunner(async function*() {
			let found;
			for (let img of imageElements) {
				try {
					switch (img.tagName) {
					case 'CANVAS':
						found = processImage(img, { width: img.width, height: img.height });
						break;
					case 'SVG':
						img = await svgToImage(img);
					case 'IMG':
						await img.decode().catch(err => {
							// console.warn('Failed to decode:', err);
							img = null;
						});
						if (!img || !isValidQrImg(img)) continue;
						found = processImage(img);
					}

					if (found) break;
					yield;
				} catch (err) {
					console.warn(...ZA_BADGE, 'Error processing image:', err, img);
				}
			}

			return true
		}, { chunkSize: 1 });

		canvas = null;
		ctx = null;
		chrome.runtime.sendMessage({ event: 'searchComplete' });
		return true
	}

	function processImage(img, opts) {
		if (!canvas) {
			canvas = document.createElement('canvas');
			ctx = canvas.getContext('2d', {
				alpha: false,
				desynchronized: true,
				willReadFrequently: true
			});
			ctx.fillStyle = '#808080';
		}

		const width = opts?.width ?? img.naturalWidth;
		const height = opts?.height ?? img.naturalHeight;
		if (width != canvas.width ||
		height != canvas.height) {
			canvas.width = width;
			canvas.height = height;
			ctx.fillStyle = '#808080';
		} else {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}

		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0);
		return extractQr(canvas, ctx)
	}

	function extractQr(canvas, ctx) {
		let imageData;
		try {
			imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		} catch (e) {
			// console.warn('Canvas is tainted (cross-origin image)');
			// Bypass cross-origin restriction
			// const blob = await fetch(img.src)
			// 	.then(r => r.blob());

			// const safeImg = new Image();
			// safeImg.src = URL.createObjectURL(blob);

			// await safeImg.decode();

			// return processImage(safeImg);
			// Or add "permissions": ["<all_urls>"] to manifest.json
			return;
		}

		const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
		if (qrCode?.data?.startsWith('otpauth://')) {
			const icon =
				document.querySelector("link[rel~='icon']")?.href ||
				document.querySelector("link[rel='shortcut icon']")?.href ||
				`https://www.google.com/s2/favicons?sz=64&domain=${location.hostname}`;
			chrome.runtime.sendMessage({
				op: 'storeSecret',
				icon,
				origin: location.origin,
				site: location.hostname,
				uri: qrCode.data
			});
			return true
		}
	}

	async function svgToImage(svg) {
		const img = new Image();
		img.crossOrigin = 'anonymous';
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

	function isValidQrCanvas(e) {
		const width = e.width;
		const height = e.height;
		if (width <= 0 || height <= 0) return false;
		if (width !== height) return false;
		// Filter tiny images
		if (width < 64) return false;
		return true
	}

	function isValidQrImg(e) {
		const width = e.naturalWidth;
		const height = e.naturalHeight;
		if (width <= 0 || height <= 0) return false;
		if (width !== height) return false;
		// Filter tiny images
		if (width < 64) return false;
		return true
	}

	function isValidQrSvg(svgElement) {
		const viewBox = svgElement.getAttribute("viewBox");
		if (!viewBox) return false;

		const parts = viewBox.trim().split(/\s+/);
		if (parts.length !== 4) return false;

		const width = parseFloat(parts[2]);
		const height = parseFloat(parts[3]);

		if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
		if (width <= 0 || height <= 0) return false;
		if (width !== height) return false;
		if (width < 21 || width > 177) return false;
		return true
	}
} else {
	__za.listeners.get('scan')()
}