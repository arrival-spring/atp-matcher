import { URL } from 'url';

export function isAllowedSourceUri(sourceUri, allowedList) {
    if (!sourceUri || !allowedList || !Array.isArray(allowedList)) return false;
    try {
        const url = new URL(sourceUri);
        const hostname = url.hostname.toLowerCase();
        return allowedList.some(
            allowed => hostname === allowed.toLowerCase() || hostname.endsWith('.' + allowed.toLowerCase())
        );
    } catch {
        return false;
    }
}

export function getRootDomain(sourceUri) {
    try {
        const url = new URL(sourceUri);
        const parts = url.hostname.split('.');
        if (parts.length <= 2) return url.hostname;
        // This is a very basic root domain extractor.
        // For more accuracy one would use something like psl or tldts.
        // But for this project's needs, taking the last two parts might be enough,
        // unless it's a .co.za which has 3.
        if (url.hostname.endsWith('.co.za') || url.hostname.endsWith('.org.za') || url.hostname.endsWith('.net.za')) {
            return parts.slice(-3).join('.');
        }
        return parts.slice(-2).join('.');
    } catch {
        return sourceUri;
    }
}
