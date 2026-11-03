import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGrabEmail, GRAB_EMAIL_SUBJECT } from './grabEmailTemplate.ts';

test('Grab winner email contains the approved copy and real redemption link', () => {
  const html = renderGrabEmail('TEST-CODE-123','https://api.grab.com/gifts/example');
  assert.equal(GRAB_EMAIL_SUBJECT,'Congratulations! Your NELBD Grab Voucher');
  assert.match(html,/Congratulations!/);
  assert.match(html,/NELBD Design Trail Lucky Dip/);
  assert.match(html,/TEST-CODE-123/);
  assert.match(html,/href="https:\/\/api.grab.com\/gifts\/example"/);
  assert.match(html,/New Everyday Life, By Design/);
  assert.match(html,/provided your email address for prize fulfilment/);
});
test('Escapes voucher text and link attributes to prevent HTML injection', () => {
  const html = renderGrabEmail('<TEST&CODE>','https://api.grab.com/gifts/example?ref=%22value');
  assert.match(html,/&lt;TEST&amp;CODE&gt;/);
  assert.doesNotMatch(html,/<TEST&CODE>/);
  assert.match(html,/href="https:\/\/api.grab.com\/gifts\/example\?ref=%22value"/);
});
test('Rejects an unrelated URL', () => {
  assert.throws(() => renderGrabEmail('TEST','https://example.com/gifts/example'));
  assert.throws(() => renderGrabEmail('TEST','http://api.grab.com/gifts/example'));
});
