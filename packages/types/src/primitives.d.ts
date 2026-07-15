/** A web address that knows its parts. */
export interface YUrl {
    raw: string;
    normalized: string;
    domain: string;
}
/** An email address with an optional human label ("work", "home"). */
export interface YEmail {
    address: string;
    label?: string;
}
/** A phone number kept split so it never decays to an ambiguous string. */
export interface YPhone {
    number: string;
    countryCode: string;
    label?: string;
}
/** Money as integer-safe amount + currency. `precision` = decimal places. */
export interface YMoney {
    amount: number;
    currency: string;
    precision: number;
}
/** A moment in time, always carrying its timezone. */
export interface YDateTime {
    iso: string;
    timezone: string;
}
/** A span of time. Seconds is the canonical unit. */
export interface YDuration {
    seconds: number;
}
/** A stored credential. Never the plaintext — only the hash + hints. */
export interface YPassword {
    hash: string;
    hint?: string;
    url?: YUrl;
}
/** An active NAS file-server session registered with the Tunnel handshake. */
export interface HostSession {
    sessionId: string;
    ownerId: string;
    hostIp: string;
    port: number;
    shareToken: string;
    pathLabel: string;
    registeredAt: string;
    expiresAt?: string;
}
/** True when the string is a structurally valid URL. */
export declare function isValidUrl(raw: string): boolean;
/** True when the email address is structurally valid. */
export declare function isValidEmail(address: string): boolean;
/** True when money is internally consistent (non-negative precision, finite amount). */
export declare function isValidMoney(money: YMoney): boolean;
