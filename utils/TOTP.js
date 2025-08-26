const BASE_32_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const normalizeAlgorithm = alg => {
	switch (alg.toLowerCase()) {
	case 'sha1': return 'SHA-1';
	case 'sha256': return 'SHA-256';
	case 'sha384': return 'SHA-384';
	case 'sha512': return 'SHA-512';
	default: throw new Error('Unsupported algorithm: ' + alg)
	}
};
export class TOTP {
	algorithm = 'SHA1';
	digits = 6;
	period = 30;
	secret = null;
	windowRange = 1;
	constructor(secret, options) {
		if (typeof secret == 'object' && secret !== null) {
			options = secret;
			secret = options.secret;
		}

		if (secret && !isValidBase32(secret)) {
			throw new Error("Invalid Base32 secret: only A-Z and 2-7 characters are allowed");
		}

		Object.defineProperty(this, 'secret', {
			configurable: false,
			enumerable: false,
			value: secret || this.constructor.generateSecret()
		});

		if (options instanceof Object) {
			for (const key in options) {
				if (typeof options[key] != typeof this[key]) continue;
				this[key] = options[key]
			}
		}
	}

	assert(code) {
		for (let errorWindow = -this.windowRange; errorWindow <= this.windowRange; errorWindow++) {
			if (this.get({ window: errorWindow }) === code) return true;
		}
		return false
	}

	async get({ epoch = Date.now() / 1e3, period, window = 0 } = {}) {
		const key = base32ToBuffer(this.secret);
		const counter = Math.floor(epoch / (period ?? this.period)) + window;

		const buffer = new ArrayBuffer(8);
		const view = new DataView(buffer);
		view.setUint32(0, 0); // High 4 bytes (we assume 64-bit counter fits in 32-bit)
		view.setUint32(4, counter);

		const cryptoKey = await crypto.subtle.importKey('raw', key, {
			name: 'HMAC',
			hash: { name: normalizeAlgorithm(this.algorithm) }
		}, false, ['sign']);

		const signature = await crypto.subtle.sign('HMAC', cryptoKey, buffer);
		const hmac = new Uint8Array(signature);

		const offset = hmac[hmac.length - 1] & 0xf;
		const codeBytes = hmac.slice(offset, offset + 4);
		const codeView = new DataView(codeBytes.buffer);
		const code = (codeView.getUint32(0) & 0x7fffffff).toString();
		return code.slice(-this.digits)
	}

	setTimeout(callback, { epoch = Date.now() / 1e3, period } = {}) {
		if (typeof callback != 'function')
			throw new TypeError('Callback must be of type: function');
		period ??= this.period;
		const timeRemainingMs = Math.ceil(epoch / period) * period * 1e3 - Date.now();
		setTimeout(callback, timeRemainingMs)
	}

	toJSON() {
		return this.constructor.format(this)
	}

	toString() {
		return this.secret
	}

	static ALGORITHMS = {
		SHA1: 'SHA1',
		SHA256: 'SHA256',
		SHA512: 'SHA512'
	}

	static assert(totp, code) {
		const otp = new this(totp);
		return otp.assert(code)
	}

	static generate(options = null) {
		return new this(options)
	}

	static generateSecret(length = 16) {
		let secret = '';
		for (let i = 0; i < length; i++) {
			let rand = Math.floor(Math.random() * BASE_32_CHARSET.length);
			secret += BASE_32_CHARSET[rand];
		}
		return secret
	}

	static format(totp) {
		if (typeof totp == 'string') {
			totp = { secret: totp };
		} else if (typeof totp != 'object' || totp === null) {
			totp = {};
		}

		return {
			algorithm: totp.algorithm || 'SHA1',
			digits: totp.digits || 6,
			period: totp.period || 30,
			secret: totp.secret || this.generateSecret()
		}
	}
}

export default TOTP;
function base32ToBuffer(base32) {
	let bits = '';
	for (let char of base32.replace(/=+$/, '')) {
		let val = BASE_32_CHARSET.indexOf(char.toUpperCase());
		if (val === -1) continue;
		bits += val.toString(2).padStart(5, '0');
	}
	let bytes = bits.match(/.{1,8}/g).map(b => parseInt(b.padEnd(8, '0'), 2));
	return new Uint8Array(bytes)
}

function isValidBase32(str) {
	if (typeof str != 'string')
		throw new TypeError("Invalid Base32: str must be of type: string");
	return /^[A-Z2-7]+=*$/.test(str.toUpperCase())
}