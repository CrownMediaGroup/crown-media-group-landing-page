// generators/proposal.js — Generates faith-forward Crown Media proposal PDFs
import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { slugify } from '../schema.js';
import { tierPrice } from '../processor.js';

const ROYAL = '#1a3a8e';
const DEEP  = '#0f2452';
const GOLD  = '#d4a73c';
const INK   = '#0a1628';
const MUTE  = '#5a6a87';

const TIERS = [
  { id:'Starter', setup:'$150 - $300',   monthly:'$500 - $800',
    includes:['Starter church website (mobile-ready)','3 social media posts/week','Monthly content calendar','Email + content support'] },
  { id:'Growth',  setup:'$300 - $500',   monthly:'$1,000 - $1,500',
    includes:['Full custom website + sermon library','5 posts/week + 4 reels/month','Weekly newsletter + content calendar','Light paid promotion + analytics'] },
  { id:'Premium', setup:'$500 - $1,000', monthly:'$2,500 - $5,000',
    includes:['Custom website + livestream integration','Daily content + sermon clips + reels','Full-funnel ad campaigns + retargeting','Brand strategy, growth tracking, monthly reporting'] },
];

export function writeProposal(outputRoot, data) {
  const slug = slugify(data.church_name);
  const dir  = join(outputRoot, 'proposals');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}_proposal.pdf`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size:'LETTER', margin:54, info:{
        Title:    `Crown Media Group Proposal — ${data.church_name}`,
        Author:   'King | Crown Media Group',
        Subject:  'Kingdom Reach Proposal',
        Keywords: 'church marketing, faith, AI, Columbia SC',
      }});
      const stream = createWriteStream(file);
      doc.pipe(stream);

      // ─── Cover band ─────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 110).fill(ROYAL);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('CROWN MEDIA GROUP', 54, 32);
      doc.font('Helvetica').fontSize(11).fillColor('#cfd8ee')
         .text('king@crownmediagroup.co  ·  crownmediagroup.co  ·  Columbia, SC', 54, 64);
      doc.fontSize(10).fillColor(GOLD).text('Built by Faith. Powered by AI.', 54, 84);

      doc.moveDown(3.6);
      doc.fillColor(INK);

      // ─── Greeting ───────────────────────────────────────────────────────────
      const greet = data.pastor_name ? `Pastor ${data.pastor_name}` : `${data.church_name} Leadership Team`;
      doc.font('Helvetica-Bold').fontSize(20).fillColor(DEEP)
         .text(`A Proposal for ${data.church_name}`, { align:'left' });
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(12).fillColor(MUTE)
         .text(new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }));
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(12).fillColor(INK);
      doc.text(`Dear ${greet},`, { paragraphGap: 8 });

      const opener = data.website_needed
        ? `Thank you for the time we shared. We noticed your church is operating without a strong online presence — and in 2026, that gap is the difference between the families looking for you finding you... or scrolling past.`
        : `Thank you for the time we shared. Your heart for ${data.church_name} is real, and the people of Columbia need what you carry. Let's amplify it.`;
      doc.text(opener, { paragraphGap: 14, align:'justify' });

      // ─── Pain points pulled from transcript ─────────────────────────────────
      if (Array.isArray(data.pain_points) && data.pain_points.length) {
        sectionHeader(doc, 'WHAT WE HEARD');
        for (const p of data.pain_points.slice(0, 6)) {
          bullet(doc, p);
        }
        doc.moveDown(0.6);
      }

      // ─── Quotes ─────────────────────────────────────────────────────────────
      if (Array.isArray(data.key_quotes) && data.key_quotes.length) {
        sectionHeader(doc, 'IN YOUR OWN WORDS');
        for (const q of data.key_quotes.slice(0, 3)) {
          doc.font('Helvetica-Oblique').fontSize(11).fillColor(DEEP)
             .text(`“${q}”`, { paragraphGap: 8, indent: 18 });
        }
        doc.moveDown(0.4);
      }

      // ─── Solution ───────────────────────────────────────────────────────────
      sectionHeader(doc, 'OUR SOLUTION');
      doc.font('Helvetica').fontSize(12).fillColor(INK)
         .text(`Crown Media Group is a faith-driven, AI-powered marketing partner for churches and Kingdom-minded businesses. We don't just build websites — we build digital ministry: presence, reach, and a system that brings your community closer every week.`,
          { paragraphGap: 14, align:'justify' });

      // ─── Tier table ─────────────────────────────────────────────────────────
      if (doc.y > 580) doc.addPage();
      sectionHeader(doc, 'INVESTMENT OPTIONS');

      for (const t of TIERS) {
        const recommended = data.recommended_tier === t.id;
        if (doc.y > 680) doc.addPage();

        const startY = doc.y;
        const boxW   = doc.page.width - 108;
        doc.roundedRect(54, startY, boxW, 26, 6).fill(recommended ? GOLD : ROYAL);
        doc.fillColor(recommended ? INK : '#ffffff')
           .font('Helvetica-Bold').fontSize(13)
           .text(`${t.id.toUpperCase()}${recommended ? '  ·  RECOMMENDED FOR YOU' : ''}`, 64, startY + 7);

        doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
           .text(`Setup: ${t.setup}     Monthly: ${t.monthly}`, 64, startY + 36);

        doc.font('Helvetica').fontSize(11).fillColor(INK);
        let y = startY + 56;
        for (const inc of t.includes) {
          doc.circle(72, y + 5, 2).fill(GOLD);
          doc.fillColor(INK).text(inc, 82, y, { width: boxW - 30 });
          y = doc.y + 4;
        }
        doc.moveDown(0.8);
      }

      // ─── Why it matters ─────────────────────────────────────────────────────
      if (doc.y > 620) doc.addPage();
      sectionHeader(doc, 'WHY THIS MATTERS');
      doc.font('Helvetica').fontSize(12).fillColor(INK)
         .text('Every church without an online presence is a Kingdom connection waiting to happen. Every family that finds your services online is a soul we get to reach together. This isn’t marketing — this is ministry with momentum.',
          { paragraphGap: 14, align:'justify' });

      // ─── CTA ────────────────────────────────────────────────────────────────
      sectionHeader(doc, 'NEXT STEPS');
      doc.font('Helvetica').fontSize(12).fillColor(INK).text('Reply to this email or call to schedule:', { paragraphGap: 6 });
      bullet(doc, 'A 15-minute clarity call to lock in your tier');
      bullet(doc, 'A first-draft starter website (yours to keep, no obligation)');
      bullet(doc, 'A simple one-page agreement so we can start building this week');
      doc.moveDown(1);

      // ─── Signature ──────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(13).fillColor(DEEP).text('In Christ and in service,');
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text('King');
      doc.font('Helvetica').fontSize(11).fillColor(MUTE)
         .text('Founder · Crown Media Group')
         .text('king@crownmediagroup.co · crownmediagroup.co')
         .text('"Whatever you do, work heartily, as for the Lord and not for men." — Colossians 3:23');

      // ─── Footer band ────────────────────────────────────────────────────────
      const fy = doc.page.height - 38;
      doc.rect(0, fy, doc.page.width, 38).fill(DEEP);
      doc.fillColor('#cfd8ee').font('Helvetica').fontSize(9)
         .text('All Glory to Jesus Global LLC  ·  Crown Media Group  ·  Columbia, SC', 54, fy + 14);

      doc.end();
      stream.on('finish', () => resolve({ slug, path:file, relPath:`output/proposals/${slug}_proposal.pdf` }));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

function sectionHeader(doc, label) {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(GOLD)
     .text(label, { characterSpacing: 1.4 });
  doc.moveTo(54, doc.y + 2).lineTo(150, doc.y + 2).strokeColor(GOLD).lineWidth(1.2).stroke();
  doc.moveDown(0.5);
}

function bullet(doc, text) {
  const y = doc.y;
  doc.circle(60, y + 6, 2).fill(GOLD);
  doc.font('Helvetica').fontSize(12).fillColor(INK)
     .text(text, 70, y, { width: doc.page.width - 130, paragraphGap: 4 });
}
