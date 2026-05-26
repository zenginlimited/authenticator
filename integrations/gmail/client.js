export default class GmailAPI {
	static baseURL = 'https://gmail.googleapis.com/gmail/';
	static version = 1;
	constructor(token) {
		Object.defineProperty(this, 'token', {
			value: token ?? null,
			writable: true
		})
	}

	list() {
		return GmailAPI.list(this.token, ...arguments)
	}

	get(id) {
		return GmailAPI.get(this.token, id, ...arguments)
	}

	static async fetch(endpoint, options, token) {
		if (token) {
			if (!options || typeof options != 'object') options = {};
			if (!options.headers || typeof options.headers != 'object') options.headers = {};
			if (options.headers instanceof Headers) {
				options.headers.set("Authorization", `Bearer ${token}`);
			} else {
				options.headers.Authorization = `Bearer ${token}`;
			}
		}

		const res = await fetch(`${GmailAPI.baseURL}v${GmailAPI.version}/${endpoint}`, options);
		if (!res.ok) {
			throw new Error(await res.text());
		}

		return res.json()
	}

	static async list(token, opts) {
		const searchParams = new URLSearchParams({
			maxResults: opts?.maxResults ?? 3
		});

		let query = { newer_than: "1h" };
		if (typeof opts?.filter == 'object') {
			for (let key in opts.filter) {
				switch (key) {
				case 'unread':
					query.is = key;
					continue;
				}

				query[key] = opts.filter[key];
			}
		}

		// searchParams.set('includeSpamTrash', true);
		searchParams.set(
			"q",
			Object.entries(query)
				.map(([k, v]) => `${k}:${v}`)
				.join(" "),
		);

		// console.debug('Email Query:', query, searchParams.toString());

		return GmailAPI.fetch(`users/me/messages${searchParams.size > 0 ? "?" + searchParams.toString() : ""}`, null, token)
			.then(list => {
				return Object.defineProperty(list, Symbol.asyncIterator, {
					async *value() {
						if (this.resultSizeEstimate < 1) return;
						for (const messageData of this.messages) {
							const email = await GmailAPI.get(token, messageData.id);
							yield email
						}
					}
				})
			})
	}

	static async get(token, id) {
		return GmailAPI.fetch(`users/me/messages/${id}`, null, token)
			.then(emailData => {
				const headers = new Headers(emailData.payload.headers.map(header => [header.name, encodeURIComponent(header.value)]));
				const sender = decodeURIComponent(headers.get('from'));
				const [from] = sender?.match(/(?<=<).+(?=>$)/) || [];
				return Object.defineProperties({
					createdTimestamp: +emailData.internalDate,
					id: emailData.id,
					snippet: emailData.snippet,
					text: extractBody(emailData.payload)
				}, {
					_raw: { value: emailData }, // Debug
					createdAt: { value: new Date(+emailData.internalDate) },
					from: { value: from },
					origin: { value: from?.split('@').slice(1).join('@') },
					sender: { value: sender?.match(/(?<=^"?)[^"<]+/)?.[0] || null }
				})
			})
	}

	static async trash(token, id) {
		return GmailAPI.fetch(`users/me/messages/${id}/trash`, { method: 'POST' }, token)
	}

	static async delete(token, id) {
		return GmailAPI.fetch(`users/me/messages/${id}`, { method: 'DELETE' }, token)
	}
}

function decodeBase64Url(data) {
	const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
	return atob(base64);
}

function extractText(html) {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<[^>]*>/g, " ")
		.replace(/&[a-z#0-9]+;/gi, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function parseText(part) {
	const body = decodeBase64Url(part.body.data);
	switch (part.mimeType) {
	case 'text/plain': return body;
	case 'text/html': return extractText(body);
	}

	console.warn(`Unsupported mime type: ${part.mimeType}`, body);
	return ''
}

export function extractBody(payload) {
	if (payload.body?.data) {
		// return decodeBase64Url(payload.body.data);
		return parseText(payload);
	}

	for (const part of payload.parts || []) {
		// if (part.mimeType === "text/plain") {
		// 	return decodeBase64Url(part.body.data);
		// }
		return parseText(part);
	}

	return "";
}