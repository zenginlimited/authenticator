import DynamicMap from "../shared/hybridmap.js";

const proxyMap = {};
Object.defineProperty(chrome.storage, 'proxy', {
	enumerable: true,
	value: proxyMap
});

for (const scope of ['local', 'session'].filter(scope => typeof chrome.storage[scope] == 'object' && chrome.storage.proxy[scope] == null)) {
	const root = new DynamicMap();
	const handler = {
		set(target, property, value, receiver) {
			if (value && typeof value == 'object' && !(value instanceof DynamicMap)) {
				value = new Proxy(new DynamicMap(value), this);
			}
			const returnValue = Reflect.set(target, property, value, receiver);
			if (target === root) {
				chrome.storage[scope].set({ [property]: value });
			} else {
				chrome.storage[scope].set(chrome.storage.proxy[scope]);
			}
			return returnValue
		},
		deleteProperty(target, property) {
			const returnValue = Reflect.deleteProperty(target, property);
			if (target === root) {
				chrome.storage[scope].remove(property);
			} else {
				chrome.storage[scope].set(chrome.storage.proxy[scope]);
			}
			return returnValue
		}
	};
	const instance = new Proxy(root, handler);
	chrome.storage[scope].get(data => {
		for (const key in data) {
			const value = data[key];
			if (value != null && typeof value != 'object') {
				root[key] = value;
				continue;
			}

			root[key] = proxify(value)
		}
	});
	chrome.storage[scope].onChanged.addListener(changes => {
		for (const key in changes) {
			const record = changes[key];
			if (!Object.hasOwn(record, 'newValue')) {
				delete root[key];
				continue;
			}

			let value = record.newValue;
			if (value != null && typeof value != 'object') {
				root[key] = value;
				continue;
			}

			// Causes infinite recursion -- must not set on instance or proxy here
			// changes = diff(root[key], value);
			// deepMerge(root[key], changes, value =>
			// 	new Proxy(new DynamicMap(value), handler)
			// );
			root[key] = proxify(value)
		}
	});

	Object.defineProperty(proxyMap, scope, {
		enumerable: true,
		value: new Proxy(root, handler),
		writable: true
	});

	function proxify(obj) {
		const proxy = {};
		for (const key in obj) {
			const value = obj[key];
			if (typeof value != 'object' || value == null) {
				proxy[key] = value;
				continue;
			}

			proxy[key] = new Proxy(new DynamicMap(proxify(value)), handler);
		}

		return new Proxy(new DynamicMap(proxy), handler);
	}
}

function diff(target, obj) {
	const changes = {};
	for (const key in obj) {
		if (target[key] === obj[key]) continue;
		if (typeof obj[key] == 'object' && obj[key] != null) {
			const left = diff(target[key], obj[key]);
			if (Object.keys(left).length < 1) continue;
			changes[key] = left;
			continue;
		}

		changes[key] = obj[key];
	}
	return changes
}

function deepMerge(target, obj, cb) {
	for (const key in obj) {
		if (typeof obj[key] == 'object' && obj[key] != null) {
			if (typeof target[key] != 'object' || target[key] == null) {
				if (typeof cb == 'function') {
					target[key] = cb(obj[key]);
					continue;
				}
			} else {
				deepMerge(target[key], obj[key], cb);
				continue;
			}
		}

		target[key] = obj[key]
	}
}