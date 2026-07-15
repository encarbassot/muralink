// Primitive types — the interoperability atoms.
// Zero dependencies. No React, no Express, no logic beyond pure validators.
// Every module imports from here. These are the contract that lets a contact's
// website be the same `YUrl` a password's site is, the same url module renders.
// ── Pure validators ─────────────────────────────────────────────────────────
// No network, no framework, no side effects. Safe in any environment.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** True when the string is a structurally valid URL. */
export function isValidUrl(raw) {
    try {
        new URL(raw);
        return true;
    }
    catch {
        return false;
    }
}
/** True when the email address is structurally valid. */
export function isValidEmail(address) {
    return emailPattern.test(address);
}
/** True when money is internally consistent (non-negative precision, finite amount). */
export function isValidMoney(money) {
    return (Number.isFinite(money.amount) &&
        Number.isInteger(money.precision) &&
        money.precision >= 0 &&
        money.currency.length > 0);
}
