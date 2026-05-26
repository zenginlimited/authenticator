import GmailAPI from "./client.js";

const PREDICTABLE_SEARCH_REGEX = /(?<=(?:otp|one[-\s]?time password|(?:verification|secure|security|(?:log|sign)[-\s]?in|otp|one[-\s]?time) code)[^\d]{0,40})\d{4,8}/i;
const BROAD_SEARCH_REGEX = /\b(?:\d{4,8}|(?:\d\s+){3,7}\d)\b/;

export default async function findOTP(token, opts = {}) {
	const filter = {
		// newer_than: '1h', // Min -- likely max time before OTPs expire
		newer_than: '1d', // Debug
		unread: true
	};
	if (opts?.after) filter.after = opts.after;
	if (opts?.from) filter.from = opts.from;
	if (opts?.newerThan) filter.newer_than = opts.newerThan;
	const list = await GmailAPI.list(token, { filter });
	if (list.resultSizeEstimate < 1) return [];
	// Iterate and once OTP is found break loop
	let results = [];
	for await (const email of list) {
		let match = email.snippet.match(PREDICTABLE_SEARCH_REGEX) ||
			email.text.match(PREDICTABLE_SEARCH_REGEX) ||
			email.snippet.match(BROAD_SEARCH_REGEX); // Always expand search to snippet
		// Unpredictable
		if (!match) {
			if (opts?.expandSearch) {
				// Match edge cases:
				// 123-456
				// 1 2 3 4 5 6
				// 1 2 3 - 4 5 6
				match = email.snippet.match(BROAD_SEARCH_REGEX) ||
					email.text.match(BROAD_SEARCH_REGEX);
			}
			if (!match) continue;
		}

		const [code] = match;
		const result = Object.defineProperties({ code }, {
			email: { value: email },
			match: { value: match }
		});
		results.push(result);
		if (results.length >= opts?.limit) break;
	}

	if (opts?.limit) results = results.slice(0, opts.limit);
	return results
}