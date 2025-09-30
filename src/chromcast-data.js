class ChromecastData {
    constructor(instance) {
        this.instanceName = instance;
        this.addresses = [];
    }

    getTxtValue(key) {
        let value = 'unknown';
        if (this.txt) {
            this.txt.forEach(element => {
                if (element.startsWith(`${key}=`)) {
                    value = element.substring(key.length + 1);
                }
            });
        }

        return value;
    }
}

module.exports = ChromecastData;