// https://developer.chrome.com/docs/extensions/reference/api/identity#type-TokenDetails
export default class GoogleAuth {
	static getToken({ interactive = true, scopes } = {}) {
		const opts = { interactive };
		if (Array.isArray(scopes)) opts.scopes = scopes;
		return new Promise((resolve, reject) => {
			chrome.identity.getAuthToken(opts, (token) => {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError);
				}

				resolve(token)
			})
		})
	}

	static clearAllTokens() {
		return new Promise(resolve => {
			chrome.identity.clearAllCachedAuthTokens(resolve)
		})
	}

	static async clearToken(token) {
		token ||= await GoogleAuth.getToken({ interactive: false });
		return new Promise(resolve => {
			chrome.identity.removeCachedAuthToken({ token }, resolve)
		})
	}

	static async revokeToken(token) {
		token ||= await GoogleAuth.getToken({ interactive: false })
			.catch(() => null);
		if (!token) return;
		await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: "POST" })
	}
}