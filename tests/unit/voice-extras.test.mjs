// voice_extras.json ემთხვევა ბიბლიას (გენერატორი იგივეს აწყობს) და ყველა id არსებობს characters.json-ში.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { byId } from '../../src/characters.js';

const vx = JSON.parse(fs.readFileSync(new URL('../../src/data/voice_extras.json', import.meta.url), 'utf8')).characters;

test('voice_extras: 16 პერსონაჟი, თითოს DO და DON\'T, ყველა id არსებობს', () => {
  const ids = Object.keys(vx);
  assert.equal(ids.length, 16);
  for (const id of ids) {
    assert.ok(byId[id], id);
    assert.ok(vx[id].do.length >= 3, `${id} DO`);
    assert.ok(vx[id].dont.length >= 3, `${id} DON'T`);
  }
  assert.ok(byId.director.voice_extras.do.length > 0, 'characters.js-ში მიბმულია');
});
