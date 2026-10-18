export function parseArgs(key_prefix = '--') {
    const options = new Map();
    const args = process.argv; // First arg is path to node and second is path to script

    for (let i = 2; i < args.length; i++) {
        const arg = args[i];

        if (arg.startsWith(key_prefix)) {
            const key = arg.slice(key_prefix.length);

            let value = null;
            if (i + 1 < args.length && !args[i + 1].startsWith(key_prefix)) {
                value = args[i + 1];
                i++;
            }

            options.set(key, value);
        }
    }
    return options;
}

export function isValidURL(str) {
    try {
        const parsed = new URL(str);
        // Allow only http(s) protocols for safety
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (err) {
        return false;
    }
}