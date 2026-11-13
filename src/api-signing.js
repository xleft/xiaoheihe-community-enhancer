(function exposeApiSigning(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XiaoheiheApiSigning = api;
}(globalThis, function createApiSigning() {
  'use strict';

  function md5(input) {
    const bytes = new TextEncoder().encode(String(input));
    const bitLength = bytes.length * 8;
    const paddedLength = (((bytes.length + 8) >>> 6) + 1) * 64;
    const buffer = new Uint8Array(paddedLength);
    buffer.set(bytes);
    buffer[bytes.length] = 0x80;
    const view = new DataView(buffer.buffer);
    view.setUint32(paddedLength - 8, bitLength >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

    const shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const constants = Array.from({ length: 64 }, (_, i) =>
      Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    const rotateLeft = (value, shift) => ((value << shift) | (value >>> (32 - shift))) >>> 0;

    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true));
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;

      for (let i = 0; i < 64; i += 1) {
        let f;
        let g;
        if (i < 16) {
          f = (b & c) | ((~b) & d);
          g = i;
        } else if (i < 32) {
          f = (d & b) | ((~d) & c);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          f = b ^ c ^ d;
          g = (3 * i + 5) % 16;
        } else {
          f = c ^ (b | (~d));
          g = (7 * i) % 16;
        }

        const nextD = c;
        const nextC = b;
        const sum = (a + (f >>> 0) + constants[i] + words[g]) >>> 0;
        const nextB = (b + rotateLeft(sum, shifts[i])) >>> 0;
        a = d;
        d = nextD;
        c = nextC;
        b = nextB;
      }

      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }

    const output = new Uint8Array(16);
    const outputView = new DataView(output.buffer);
    outputView.setUint32(0, a0, true);
    outputView.setUint32(4, b0, true);
    outputView.setUint32(8, c0, true);
    outputView.setUint32(12, d0, true);
    return Array.from(output, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function mixColumns(values) {
    const source = values.slice();
    const xtime = (value) => (value & 128 ? ((value << 1) ^ 27) & 255 : value << 1);
    const q = (value) => xtime(value) ^ value;
    const r = (value) => q(xtime(value));
    const y = (value) => r(q(xtime(value)));
    const g = (value) => y(value) ^ r(value) ^ q(value);
    const result = [
      g(source[0]) ^ y(source[1]) ^ r(source[2]) ^ q(source[3]),
      q(source[0]) ^ g(source[1]) ^ y(source[2]) ^ r(source[3]),
      r(source[0]) ^ q(source[1]) ^ g(source[2]) ^ y(source[3]),
      y(source[0]) ^ r(source[1]) ^ q(source[2]) ^ g(source[3]),
    ];
    for (let i = 0; i < 4; i += 1) source[i] = result[i];
    return source;
  }

  function mapByAlphabet(value, alphabet, end) {
    const source = alphabet.slice(0, end);
    let result = '';
    for (let i = 0; i < value.length; i += 1) {
      result += source[value.charCodeAt(i) % source.length];
    }
    return result;
  }

  function pathToAlphabet(value, alphabet) {
    let result = '';
    for (let i = 0; i < value.length; i += 1) {
      result += alphabet[value.charCodeAt(i) % alphabet.length];
    }
    return result;
  }

  function interleave(values) {
    let result = '';
    const maxLength = Math.max(...values.map((value) => value.length));
    for (let i = 0; i < maxLength; i += 1) {
      for (const value of values) {
        if (i < value.length) result += value[i];
      }
    }
    return result;
  }

  function createSignedParams(path, options = {}) {
    const time = Number.isFinite(options.time) ? Math.floor(options.time) : Math.floor(Date.now() / 1000);
    const nonce = typeof options.nonce === 'string' && options.nonce
      ? options.nonce.toUpperCase()
      : md5(`${time}${options.random ?? Math.random()}`).toUpperCase();
    const normalizedPath = `/${String(path).split('/').filter(Boolean).join('/')}/`;
    const alphabet = 'AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89';
    const seed = interleave([
      mapByAlphabet(String(time + 1), alphabet, -2),
      pathToAlphabet(normalizedPath, alphabet),
      pathToAlphabet(nonce, alphabet),
    ]).slice(0, 20);
    const hash = md5(seed);
    const checksum = String(
      mixColumns(hash.slice(-6).split('').map((char) => char.charCodeAt(0)))
        .reduce((sum, value) => sum + value, 0) % 100
    ).padStart(2, '0');

    return {
      hkey: `${mapByAlphabet(hash.substring(0, 5), alphabet, -4)}${checksum}`,
      _time: time,
      nonce,
    };
  }

  return { md5, createSignedParams };
}));
