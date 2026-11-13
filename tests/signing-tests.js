'use strict';
const assert = require('node:assert/strict');
const signing = require('../src/api-signing.js');
assert.equal(signing.md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
assert.equal(signing.md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
const signed = signing.createSignedParams('/bbs/app/profile/award/link', {
  time: 1700000000,
  nonce: '0123456789abcdef0123456789abcdef',
});
assert.equal(signed._time, 1700000000);
assert.equal(signed.nonce, '0123456789ABCDEF0123456789ABCDEF');
assert.match(signed.hkey, /^[A-Z0-9]+\d{2}$/);
console.log('signing-tests: OK');
