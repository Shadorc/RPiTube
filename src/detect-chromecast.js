const mdns = require('multicast-dns')();
const ChromecastData = require('./chromecast-data');

const GOOGLECAST_SERVICE = '_googlecast._tcp.local';
const DISCOVERY_TIMEOUT_MS = 2500;
const REQUERY_INTERVAL_MS = 700;

function discoverChromecasts(timeoutMs = DISCOVERY_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const instances = new Map();
        const hostToInstances = new Map(); // hostname -> Set of instances (for O(1) A/AAAA lookup)
        let isResolved = false;

        function handleResponse(response) {
            try {
                const records = (response.answers || []).concat(response.additionals || []);

                // First pass: PTR records - discover service instances
                for (const record of records) {
                    if (record.type === 'PTR' && record.name === GOOGLECAST_SERVICE) {
                        const instance = record.data;
                        if (!instances.has(instance)) {
                            instances.set(instance, new ChromecastData(instance));
                        }
                    }
                }

                // Second pass: SRV records - link instance to host + port
                for (const record of records) {
                    if (record.type === 'SRV' && record.data) {
                        const instance = record.name;
                        const data = instances.get(instance) || new ChromecastData(instance);
                        const host = record.data.target || record.data.name;

                        if (host) {
                            data.host = host;
                            // Track hostname -> instances mapping for efficient A/AAAA lookup
                            if (!hostToInstances.has(host)) {
                                hostToInstances.set(host, new Set());
                            }
                            hostToInstances.get(host).add(instance);
                        }

                        if (record.data.port) {
                            data.port = record.data.port;
                        }

                        instances.set(instance, data);
                    }
                }

                // Third pass: TXT records - metadata
                for (const record of records) {
                    if (record.type === 'TXT' && record.data) {
                        const instance = record.name;
                        const data = instances.get(instance) || new ChromecastData(instance);

                        if (Array.isArray(record.data)) {
                            data.txt = record.data.map(buf =>
                                buf instanceof Buffer ? buf.toString() : String(buf)
                            );
                        }

                        instances.set(instance, data);
                    }
                }

                // Fourth pass: A/AAAA records - IP addresses
                for (const record of records) {
                    if ((record.type === 'A' || record.type === 'AAAA') && record.data) {
                        const hostname = record.name;
                        const ip = record.data;
                        const relatedInstances = hostToInstances.get(hostname);

                        if (relatedInstances) {
                            for (const instance of relatedInstances) {
                                const data = instances.get(instance);
                                if (data && !data.addresses.includes(ip)) {
                                    data.addresses.push(ip);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling mDNS response:', error);
            }
        }

        function cleanup() {
            mdns.removeListener('response', handleResponse);
            clearInterval(repeat);
        }

        function finish(result) {
            if (isResolved) {
                return;
            }

            isResolved = true;
            cleanup();
            resolve(result);
        }

        mdns.on('response', handleResponse);

        // Initial PTR query
        mdns.query({
            questions: [{
                name: GOOGLECAST_SERVICE,
                type: 'PTR'
            }]
        });

        // Periodic requery for late-responding devices
        const repeat = setInterval(() => {
            mdns.query({
                questions: [{
                    name: GOOGLECAST_SERVICE,
                    type: 'PTR'
                }]
            });
        }, REQUERY_INTERVAL_MS);

        // Timeout handling with proper cleanup
        const timeout = setTimeout(() => {
            finish(Array.from(instances.values()));
        }, timeoutMs);

        mdns.on('error', (error) => {
            if (isResolved) {
                return;
            }

            isResolved = true;
            cleanup();
            clearTimeout(timeout);
            reject(error);
        });
    });
}

module.exports = discoverChromecasts;
