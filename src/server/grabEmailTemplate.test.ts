import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGrabEmail, renderGrabBundleEmail, GRAB_EMAIL_SUBJECT } from './grabEmailTemplate.ts';

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

test('Two S$5 codes produce one S$10 email with both distinct vouchers',()=>{
 const html=renderGrabBundleEmail([
  {code:'CODE-ONE',url:'https://api.grab.com/gifts/one'},
  {code:'CODE-TWO',url:'https://api.grab.com/gifts/two'}
 ]);
 assert.match(html,/S\$10 in Grab vouchers/);
 assert.match(html,/CODE-ONE/);
 assert.match(html,/CODE-TWO/);
 assert.match(html,/https:\/\/api\.grab\.com\/gifts\/one/);
 assert.match(html,/https:\/\/api\.grab\.com\/gifts\/two/);
});
test('S$50 email includes all ten individually numbered S$5 gift codes',()=>{
 const html=renderGrabBundleEmail(Array.from({length:10},(_,i)=>({
  code:'CODE-'+i,url:'https://api.grab.com/gifts/code-'+i
 })));
 assert.match(html,/S\$50 in Grab vouchers/);
 assert.match(html,/S\$5 code 10/);
 for(let i=0;i<10;i++)assert.match(html,new RegExp('CODE-'+i));
});
test('Reject incomplete Grab bundles or unrelated redemption URLs',()=>{
 assert.throws(()=>renderGrabBundleEmail([]));
 assert.throws(()=>renderGrabBundleEmail([{code:'TEST',url:'https://example.com/gifts/code'}]));
 assert.throws(()=>renderGrabBundleEmail(Array.from({length:3},(_,i)=>({
   code:'TEST-'+i,url:'https://api.grab.com/gifts/code-'+i
 }))));
});
