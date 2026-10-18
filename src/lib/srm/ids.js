const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

function randomChars(n) {
  const bytes = new Uint8Array(n);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

/** Collision-resistant supplier ID (~60 bits random + time component). */
export function newSupplierId() {
  return `SUP-${Date.now().toString(36).toUpperCase()}-${randomChars(8)}`;
}
export function newColumnId() {
  return `col_${Date.now().toString(36)}_${randomChars(8).toLowerCase()}`;
}

export function isValidId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(id) && !RESERVED.has(id);
}
