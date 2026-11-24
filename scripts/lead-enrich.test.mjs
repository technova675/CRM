import test from 'node:test';
import assert from 'node:assert/strict';
import {contactsFromHtml,contactPages,mergeContacts,normalPhone,pickEmail,socialFrom} from '../lib/domain/leadEnrich.ts';

const page=`<html><head><title>Glowleaf | Skincare from Pune</title><meta name="description" content="Clean skincare &amp; body care.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Glowleaf Naturals","telephone":"+91 98765 43210","address":{"addressLocality":"Pune","addressRegion":"MH","addressCountry":"IN"},"sameAs":["https://www.instagram.com/glowleaf.in/","https://www.linkedin.com/company/glowleaf"]}</script>
<script>var x="spam@tracker.com"</script></head><body>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a><a href="https://www.facebook.com/glowleafnaturals">FB</a>
<a href="https://x.com/intent/tweet?text=hi">Tweet</a><a href="https://twitter.com/glowleaf">X</a>
<a href="https://www.youtube.com/@glowleaf">YT</a><a href="https://wa.me/919876543210">Chat</a>
<a href="mailto:privacy@glowleaf.in">Privacy</a><a href="mailto:hello@glowleaf.in?subject=Hi">Mail</a>
<a href="/contact-us">Contact</a><a href="/about">About</a><a href="/blog/post">Blog</a><a href="https://other.com/contact">Ext</a>
<img src="logo@2x.png"></body></html>`;

test('reads company details from schema.org, links and mailto, skipping share buttons and scripts',()=>{
  const c=contactsFromHtml(page,'https://www.glowleaf.in/');
  assert.equal(c.company,'Glowleaf Naturals');
  assert.equal(c.description,'Clean skincare & body care.');
  assert.equal(c.phone,'+91 98765 43210');
  assert.equal(c.email,'hello@glowleaf.in');
  assert.equal(c.location,'Pune, MH, IN');
  assert.deepEqual(c.socials,{
    instagram:'https://www.instagram.com/glowleaf.in',
    linkedin:'https://www.linkedin.com/company/glowleaf',
    facebook:'https://www.facebook.com/glowleafnaturals',
    twitter:'https://twitter.com/glowleaf',
    youtube:'https://www.youtube.com/@glowleaf',
    whatsapp:'https://wa.me/919876543210',
  });
});

test('a phone in plain text counts only next to a label; dates and short numbers do not',()=>{
  assert.equal(contactsFromHtml('<p>Founded 2019. Call us: 020 2567 8901</p>','https://a.in').phone,'020 2567 8901');
  assert.equal(contactsFromHtml('<p>Order 12345678 shipped on 20240115</p>','https://a.in').phone,undefined);
  assert.equal(normalPhone('tel:20240115'),undefined);
  assert.equal(normalPhone('tel:1234'),undefined);
});

test('emails prefer the company domain and sales addresses over no-reply, images and placeholders',()=>{
  assert.equal(pickEmail(['noreply@shop.in','sales@shop.in','x@gmail.com'],'www.shop.in'),'sales@shop.in');
  assert.equal(pickEmail(['founder@gmail.com','icon@2x.png','you@example.com'],'shop.in'),'founder@gmail.com');
  assert.equal(pickEmail([],'shop.in'),undefined);
});

test('social links: profiles only, never posts, share or intent pages',()=>{
  assert.equal(socialFrom('https://www.instagram.com/p/abc123/'),null);
  assert.equal(socialFrom('https://www.facebook.com/sharer.php?u=1'),null);
  assert.equal(socialFrom('https://x.com/intent/follow?screen_name=a'),null);
  assert.deepEqual(socialFrom('https://in.linkedin.com/company/acme/about?x=1'),['linkedin','https://in.linkedin.com/company/acme/about']);
});

test('contact pages: same site only, contact before about, at most two',()=>{
  assert.deepEqual(contactPages(['/blog/post','/about','/contact-us','https://other.com/contact','/team'],'https://www.glowleaf.in/'),['https://www.glowleaf.in/contact-us','https://www.glowleaf.in/about']);
});

test('merging keeps the first value found for each field',()=>{
  const m=mergeContacts([{phone:'1',socials:{instagram:'a'}},{phone:'2',email:'e@x.in',socials:{instagram:'b',facebook:'f'}}]);
  assert.equal(m.phone,'1');assert.equal(m.email,'e@x.in');assert.deepEqual(m.socials,{instagram:'a',facebook:'f'});
});
