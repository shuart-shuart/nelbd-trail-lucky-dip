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
