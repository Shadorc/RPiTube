class ChromecastData {
    constructor(instance) {
        this.instance = instance;
        this.host = null;
        this.port = null;
        this.txt = [];
        this.addresses = [];
    }

    getTxtValue(key) {
        if (this.txt && Array.isArray(this.txt)) {
            const prefix = `${key}=`;
            for (const element of this.txt) {
                if (element.startsWith(prefix)) {
                    return element.substring(prefix.length);
                }
            }
        }

        return 'unknown';
    }

    getAddress() {
        return this.addresses.length > 0 ? this.addresses[0] : null;
    }

    getFriendlyName() {
        return this.getTxtValue('fn');
    }
}

module.exports = ChromecastData;
