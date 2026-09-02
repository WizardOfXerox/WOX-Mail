import bcrypt from 'bcryptjs';

/**
 * Proton Custom Base64 Alphabet for Bcrypt Salt (no padding, starts with ./)
 */
const BCRYPT_BASE64_ALPHABET = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function encodeBcryptBase64(bytes) {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    let b0 = bytes[i++] || 0;
    let b1 = bytes[i++] || 0;
    let b2 = bytes[i++] || 0;

    let c0 = (b0 >> 2) & 0x3f;
    let c1 = ((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0f);
    let c2 = ((b1 & 0x0f) << 2) | ((b2 >> 6) & 0x03);
    let c3 = b2 & 0x3f;

    result += BCRYPT_BASE64_ALPHABET[c0];
    result += BCRYPT_BASE64_ALPHABET[c1];
    if (i - 1 < bytes.length) result += BCRYPT_BASE64_ALPHABET[c2];
    if (i < bytes.length) result += BCRYPT_BASE64_ALPHABET[c3];
  }
  return result;
}

/**
 * 4-Round SHA512 expandHash matching Proton go-srp / pm-srp specification.
 */
async function expandHash(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  const parts = [];

  for (let i = 0; i < 4; i++) {
    const roundBuffer = new Uint8Array(bytes.length + 1);
    roundBuffer.set(bytes);
    roundBuffer[bytes.length] = i;

    const digest = await globalThis.crypto.subtle.digest('SHA-512', roundBuffer);
    parts.push(new Uint8Array(digest));
  }

  const expanded = new Uint8Array(256);
  for (let i = 0; i < 4; i++) {
    expanded.set(parts[i], i * 64);
  }
  return expanded;
}

function bigIntToBytes(bn, len = 256) {
  let hex = bn.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const raw = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    raw[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  if (raw.length === len) return raw;
  if (raw.length < len) {
    const pad = new Uint8Array(len);
    pad.set(raw, len - raw.length);
    return pad;
  }
  return raw.slice(raw.length - len);
}

function bytesToBigInt(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

function base64ToBytes(b64) {
  const clean = b64.replace(/\s+/g, '');
  if (typeof atob !== 'undefined') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return Buffer.from(clean, 'base64');
}

function bytesToBase64(bytes) {
  if (typeof btoa !== 'undefined') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function concatBytes(...arrays) {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function modPow(base, exp, mod) {
  let res = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e % 2n === 1n) res = (res * b) % mod;
    e = e / 2n;
    b = (b * b) % mod;
  }
  return res;
}

const PROTON_MODULUS_HEX =
  'D8880B0F96156316C29C8B24C2686BC0D236D659F7433B9CE26796155568116C' +
  '9639925087794B9361AE9138D312769A67C798113C16790FF34E036B69D4D835' +
  '4E0CE6E594A490FE931A9F7B82390BF9171D67B0A949614B2A75D0F2E0AAEE469FFB94A4B1E4E303E8A6136ED30876B5B4216846BD04E768' +
  'C7DC90429B1D61516C5C76374770769897B510D6A82E0D10624159D105EBB2E6CEEF9C2D5042E0F5FA51280EC947D79A201A99B222E696B1' +
  '2DA6705647FD38EE69F542FCB49EC473A087723BC51EC14FE3A7F2D2519B63BEA858A15D3380A4C2E7CE86FE0F7EDEC9415ED716356BA400' +
  '460E34A089D8AEE2B5C4B4E22C808E59B1807B57A3EEA38000DB356A969B83';

/**
 * Perform Client-side SRP-6a Computation for Proton Mail v4.
 */
export async function computeSRPAuth(username, password, authInfo) {
  const { Salt, ServerEphemeral, SRPSession, Version = 4, Modulus } = authInfo;

  // Extract raw Modulus bytes (256 bytes)
  let modulusBytes;
  if (Modulus && Modulus.includes('-----BEGIN')) {
    const rawB64 = Modulus.split('\n\n')[1].split('-----BEGIN PGP SIGNATURE-----')[0].replace(/\s+/g, '');
    modulusBytes = base64ToBytes(rawB64);
  } else if (Modulus) {
    modulusBytes = base64ToBytes(Modulus);
  } else {
    modulusBytes = base64ToBytes(PROTON_MODULUS_HEX);
  }

  const N = bytesToBigInt(modulusBytes);
  const g = 2n;
  const gBytes = bigIntToBytes(g, 256);

  // 1. Compute HashedPassword (x) matching hashPasswordVersion3:
  // salt = base64Decode(Salt) + "proton"
  const rawSalt = base64ToBytes(Salt);
  const saltWithProton = concatBytes(rawSalt, new TextEncoder().encode('proton'));
  const encodedSalt = encodeBcryptBase64(saltWithProton).slice(0, 22);
  const formattedSalt = `$2y$10$${encodedSalt}`;
  const crypted = bcrypt.hashSync(password, formattedSalt);

  // hashedPasswordBytes = expandHash(crypted + modulus)
  const hashedPasswordBytes = await expandHash(concatBytes(new TextEncoder().encode(crypted), modulusBytes));
  const x = bytesToBigInt(hashedPasswordBytes);

  // 2. Multiplier k = expandHash(fromInt(g) + fromInt(N)) mod N
  const kBytes = await expandHash(concatBytes(gBytes, modulusBytes));
  const k = bytesToBigInt(kBytes) % N;

  // 3. Client ephemeral secret 'a' and public A = g^a mod N
  const aRandom = new Uint8Array(256);
  globalThis.crypto.getRandomValues(aRandom);
  const a = (bytesToBigInt(aRandom) % (N - 2n)) + 2n;
  const A = modPow(g, a, N);
  const aPubBytes = bigIntToBytes(A, 256);

  // 4. Server public ephemeral B
  const bPubBytes = base64ToBytes(ServerEphemeral);
  const B = bytesToBigInt(bPubBytes);

  // 5. Scrambler u = expandHash(A + B) mod N
  const uBytes = await expandHash(concatBytes(aPubBytes, bPubBytes));
  const u = bytesToBigInt(uBytes) % N;

  // 6. Shared Secret S = (B - k * g^x)^(a + u * x) mod N
  const gx = modPow(g, x, N);
  const kgx = (k * gx) % N;
  let base = (B - kgx) % N;
  if (base < 0n) base += N;
  const exp = a + (u * x);
  const S = modPow(base, exp, N);
  const sBytes = bigIntToBytes(S, 256);

  // 7. Client Proof M1 = expandHash(A + B + S)
  const clientProofBytes = await expandHash(concatBytes(aPubBytes, bPubBytes, sBytes));
  const clientProofB64 = bytesToBase64(clientProofBytes);

  // 8. Expected Server Proof M2 = expandHash(A + M1 + S)
  const serverProofBytes = await expandHash(concatBytes(aPubBytes, clientProofBytes, sBytes));
  const serverProofB64 = bytesToBase64(serverProofBytes);

  return {
    clientEphemeral: bytesToBase64(aPubBytes),
    clientProof: clientProofB64,
    expectedServerProof: serverProofB64,
    srpSession: SRPSession,
  };
}
