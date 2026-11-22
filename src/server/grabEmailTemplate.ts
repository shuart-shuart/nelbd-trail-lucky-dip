export const GRAB_EMAIL_SUBJECT = 'Congratulations! Your NELBD Grab Voucher';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);
export function renderGrabEmail(code: string, redemptionUrl: string): string {
  const parsed = new URL(redemptionUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.grab.com' || !parsed.pathname.startsWith('/gifts/')) throw new Error('Invalid voucher URL');
  return [
    '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#270342">',
    '<p>Congratulations!</p>',
    '<p>You&#39;ve won a <strong>Grab Voucher</strong> at the NELBD Design Trail Lucky Dip!</p>',
    '<p><strong>Your Grab voucher code:</strong></p>',
    '<p><code>'+esc(code)+'</code></p>',
    '<p><strong>Redeem your voucher:</strong></p>',
    '<p><a href="'+esc(parsed.toString())+'">Open your Grab voucher</a></p>',
    '<p>You can either click the redemption link above or manually enter your voucher code in the Grab app, following the instructions provided by Grab.</p>',
    '<p><strong>Important:</strong> Please check your voucher&#39;s validity and redemption terms. Keep your code private, as each voucher is intended for one winner.</p>',
    '<p>Thank you for exploring New Everyday Life, By Design!</p>',
    '<p><strong>NELBD Team</strong></p>',
    '<p><em>This email was sent because you won a Grab Voucher and provided your email address for prize fulfilment.</em></p>',
    '</div>'
  ].join('');
}

/** One email for a denomination bundle, never send only a subset of its S$5 codes. */
export function renderGrabBundleEmail(vouchers: ReadonlyArray<{code:string;url:string}>): string {
  if(![1,2,10].includes(vouchers.length))throw Error('Unexpected Grab bundle size');
  if(vouchers.length===1)return renderGrabEmail(vouchers[0].code,vouchers[0].url);
  const total=vouchers.length*5;
  const entries=vouchers.map((voucher,index)=>{
    const parsed=new URL(voucher.url);
    if(parsed.protocol!=='https:' || parsed.hostname!=='api.grab.com' ||
       !parsed.pathname.startsWith('/gifts/'))throw Error('Invalid voucher URL');
    return '<li><strong>S$5 code '+(index+1)+':</strong> <code>'+esc(voucher.code)+
      '</code> — <a href="'+esc(parsed.toString())+'">Open Grab gift link</a></li>';
  });
  return [
    '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#270342">',
    '<p>Congratulations!</p>',
    '<p>You&#39;ve won <strong>S$'+total+' in Grab vouchers</strong> at the NELBD Design Trail Lucky Dip!</p>',
    '<p>Your prize contains '+vouchers.length+' separate S$5 vouchers. Redeem each code or link individually:</p>',
    '<ol>'+entries.join('')+'</ol>',
    '<p>Open the links or enter the codes in the Grab app, according to Grab&#39;s instructions.</p>',
    '<p>Please check the validity and redemption terms for each voucher. Keep these codes private.</p>',
    '<p>Thank you for exploring New Everyday Life, By Design!</p>',
    '<p><strong>NELBD Team</strong></p>',
    '<p><em>This email was sent because you won Grab vouchers and provided your email address for prize fulfilment.</em></p>',
    '</div>'
  ].join('');
}
