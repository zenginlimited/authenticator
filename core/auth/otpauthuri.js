export default class OTPAuthURI {
	account = null;
	algorithm = 'SHA1';
	digits = 6;
	issuer = null;
	period = 30;
	type = null;
	constructor(uri) {
		if (!uri || !uri.startsWith('otpauth://')) return null;
		const url = new URL(uri);
		this.type = url.hostname;
		const parts = url.pathname.slice(1).split(':');
		const account = parts.pop();
		if (account) this.account = decodeURIComponent(account);
		const issuer = parts.pop() || url.searchParams.get('issuer');
		if (issuer) this.issuer = decodeURIComponent(issuer);
		this.algorithm = url.searchParams.get('algorithm') || 'SHA1';
		this.digits = url.searchParams.get('digits') || 6;
		this.period = url.searchParams.get('period') || 30;
		Object.defineProperty(this, 'secret', {
			value: url.searchParams.get('secret')
		})
	}

	toString() {
		let label = this.issuer || '';
		if (this.account) {
			if (label.length > 0) label += ':';
			label += this.account;
		}
		if (label.length > 0) label = '/' + label;
		return `otpauth://totp${label}?algorithm=${this.algorithm}&digits=${this.digits}&period=${this.period}`
	}
}