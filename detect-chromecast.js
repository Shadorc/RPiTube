const mdns = require('multicast-dns')();

const ChromecastData = require('./chromcast-data');

function discoverChromecasts(timeoutMs = 2500) {
    return new Promise((resolve) => {
        const instances = new Map();

        function handleResponse(response) {
            const answers = response.answers || [];
            const additionals = response.additionals || [];
            const records = answers.concat(additionals);

            // handle PTR -> service instance names
            for (const ans of records) {
                if (ans.type === 'PTR') {
                    if (ans.name !== '_googlecast._tcp.local') {
                        // Ignore response from other devices
                        return;
                    }

                    const instance = ans.data;
                    if (!instances.has(instance)) {
                        instances.set(instance, new ChromecastData(instance));
                    }
                }
            }

            // handle SRV records: link instance -> target host + port
            for (const record of records) {
                if (record.type === 'SRV') {
                    const instance = record.name;
                    const data = instances.get(instance) || new ChromecastData(instance);
                    data.host = record.data.target || record.data.name || record.data; // depends on mdns lib shape
                    data.port = record.data.port || (record.data && record.data.port);
                    instances.set(instance, data);
                }
            }

            // handle TXT (metadata)
            for (const record of records) {
                if (record.type === 'TXT') {
                    const instance = record.name;
                    const data = instances.get(instance) || new ChromecastData(instance);
                    // mdns lib returns TXT as Buffer[] or array of strings
                    data.txt = (record.data && Array.isArray(record.data)) ? record.data.map(buf => buf.toString()) : data.txt;
                    instances.set(instance, data);
                }
            }

            // handle A / AAAA
            for (const record of records) {
                if (record.type === 'A' || record.type === 'AAAA') {
                    const hostname = record.name;
                    const ip = record.data;
                    for (const instanceData of instances.values()) {
                        if (instanceData.host && (instanceData.host === hostname || instanceData.host === hostname + '.')) {
                            instanceData.addresses.push(ip);
                        }
                    }
                }
            }
        }

        mdns.on('response', handleResponse);

        const PTR_QUERY = {
            questions: [{
                name: '_googlecast._tcp.local',
                type: 'PTR'
            }]
        };

        // initial query for PTR records of Chromecasts
        mdns.query(PTR_QUERY);

        // some devices respond a bit later; query again after small interval
        const repeat = setInterval(() => mdns.query(PTR_QUERY), 1000);

        // stop after timeout
        setTimeout(() => {
            clearInterval(repeat);
            mdns.removeListener('response', handleResponse);
            resolve(Array.from(instances.values()));
        }, timeoutMs);
    });
}

module.exports = discoverChromecasts;
