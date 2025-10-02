class ChromecastData {
    constructor(instance) {
        this.instance = instance;
        this.addresses = [];
    }

    getTxtValue(key) {
        let value = 'unknown';
        if (this.txt) {
            for (const element of this.txt) {
                if (element.startsWith(`${key}=`)) {
                    value = element.substring(key.length + 1);
                }
            }
        }

        return value;
    }
}

module.exports = ChromecastData;