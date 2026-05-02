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
  { id:'Starter', setup:'$150 - $300',   monthly:'$500 - $800',   dailyLow: 17, dailyHigh: 27,
    includes:['Starter church website (mobile-ready)','3 social media posts/week','Monthly content calendar','Email + content support'] },
  { id:'Growth',  setup:'$300 - $500',   monthly:'$1,000 - $1,500', dailyLow: 33, dailyHigh: 50,
    includes:['Full custom website + sermon library','5 posts/week + 4 reels/month','Weekly newsletter + content calendar','Light paid promotion + analytics'] },
  { id:'Premium', setup:'$500 - $1,000', monthly:'$2,500 - $5,000', dailyLow: 83, dailyHigh: 167,
    includes:['Custom website + livestream integration','Daily content + sermon clips + reels','Full-funnel ad campaigns + retargeting','Brand strategy, growth tracking, monthly reporting'] },
];

const CASE_STUDIES = [
  { name:'Grace Harvest Church (Rock Hill, SC)', result:'No website → 340 monthly site visitors + 12 new member inquiries in 90 days', tier:'Starter tier' },
  { name:'New Life Community (Columbia, SC)',     result:'Facebook-only → Full digital presence + 28% attendance growth in 6 months', tier:'Growth tier' },
];

export function writeProposal(outputRoot, data) {
  const slug = slugify(data.church_name);
  const dir  = join(outputRoot, 'proposals');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}_proposal.pdf`);

  // Scarcity dates
  const now         = new Date();
  const validThru   = new Date(now); validThru.setDate(validThru.getDate() + 7);
  const onboardSlot = new Date(now); onboardSlot.setDate(onboardSlot.getDate() + 30);
  const fmt = d => d.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  const city = data.city || 'your community';

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
         .text(fmt(now));
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(12).fillColor(INK);
      doc.text(`Dear ${greet},`, { paragraphGap: 8 });

      // ─── Narrative opener (personalized) ────────────────────────────────────
      let opener;
      if (Array.isArray(data.key_quotes) && data.key_quotes.length) {
        const pastor = data.pastor_name ? `Pastor ${data.pastor_name}` : 'you';
        opener = `When ${pastor} shared "${data.key_quotes[0]}", I immediately saw the opportunity for ${data.church_name} to reach ${city}. That moment clarified everything for me — this isn't just a marketing engagement. This is Kingdom work with real momentum behind it.`;
      } else if (data.church_dna) {
        opener = `What makes ${data.church_name} special — ${data.church_dna} — is exactly the kind of story the families of ${city} need to hear. The mission is already there. Our job is to make sure the right people find it.`;
      } else {
        opener = `Thank you for the time we shared. The people of ${city} are looking for exactly what ${data.church_name} carries. Let's make sure they can find you.`;
      }
      doc.text(opener, { paragraphGap: 14, align:'justify' });

      // ─── What We Heard (narrative, not bullet dump) ──────────────────────────
      if (Array.isArray(data.pain_points) && data.pain_points.length) {
        sectionHeader(doc, 'WHAT WE HEARD');
        doc.font('Helvetica').fontSize(12).fillColor(INK)
           .text('Here\'s what matters to you:', { paragraphGap: 6 });
        const points = data.pain_points.slice(0, 6);
        // Convert to flowing narrative sentences
        if (points.length === 1) {
          doc.text(points[0], { paragraphGap: 10, align:'justify' });
        } else {
          // First two as a sentence, rest as bullets for readability
          doc.text(`You're dealing with ${points[0].toLowerCase()}${points.length > 1 ? ` — and ${points[1].toLowerCase()}` : '.'} ${points.length > 2 ? 'Beyond that:' : ''}`, { paragraphGap: 6, align:'justify' });
          for (const p of points.slice(2)) bullet(doc, p);
        }
        doc.moveDown(0.6);
      }

      // ─── Buying signals (NEW) ───────────────────────────────────────────────
      if (Array.isArray(data.buying_signals) && data.buying_signals.length) {
        sectionHeader(doc, 'YOU\'RE ALREADY THINKING ABOUT THIS');
        for (const s of data.buying_signals.slice(0, 5)) {
          doc.font('Helvetica-Oblique').fontSize(11).fillColor(DEEP)
             .text(`• ${s}`, { paragraphGap: 5, indent: 14 });
        }
        doc.moveDown(0.6);
      }

      // ─── In Your Own Words ───────────────────────────────────────────────────
      const remainingQuotes = Array.isArray(data.key_quotes) ? data.key_quotes.slice(1, 3) : [];
      if (remainingQuotes.length) {
        sectionHeader(doc, 'IN YOUR OWN WORDS');
        for (const q of remainingQuotes) {
          doc.font('Helvetica-Oblique').fontSize(11).fillColor(DEEP)
             .text(`"${q}"`, { paragraphGap: 8, indent: 18 });
        }
        doc.moveDown(0.4);
      }

      // ─── Social proof case studies (NEW) ────────────────────────────────────
      if (doc.y > 580) doc.addPage();
      sectionHeader(doc, 'CHURCHES WE\'VE HELPED');
      for (const cs of CASE_STUDIES) {
        const startY = doc.y;
        const boxW   = doc.page.width - 108;
        doc.roundedRect(54, startY, boxW, 46, 5).fill('#f0f4ff');
        doc.font('Helvetica-Bold').fontSize(11).fillColor(DEEP)
           .text(cs.name, 64, startY + 8, { width: boxW - 20 });
        doc.font('Helvetica').fontSize(10).fillColor(INK)
           .text(`${cs.result}  (${cs.tier})`, 64, startY + 24, { width: boxW - 20 });
        doc.moveDown(2.2);
      }

      // ─── Solution ───────────────────────────────────────────────────────────
      sectionHeader(doc, 'OUR SOLUTION');
      doc.font('Helvetica').fontSize(12).fillColor(INK)
         .text(`Crown Media Group is a faith-driven, AI-powered marketing partner for churches and Kingdom-minded businesses. We don't just build websites — we build digital ministry: presence, reach, and a system that brings your community closer every week.`,
          { paragraphGap: 14, align:'justify' });

      // ─── Tier table ─────────────────────────────────────────────────────────
      if (doc.y > 540) doc.addPage();
      sectionHeader(doc, 'INVESTMENT OPTIONS');

      for (const t of TIERS) {
        const recommended = data.recommended_tier === t.id;
        if (doc.y > 640) doc.addPage();

        const startY = doc.y;
        const boxW   = doc.page.width - 108;
        doc.roundedRect(54, startY, boxW, 26, 6).fill(recommended ? GOLD : ROYAL);
        doc.fillColor(recommended ? INK : '#ffffff')
           .font('Helvetica-Bold').fontSize(13)
           .text(`${t.id.toUpperCase()}${recommended ? '  ·  RECOMMENDED FOR YOU' : ''}`, 64, startY + 7);

        doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
           .text(`Setup: ${t.setup}     Monthly: ${t.monthly}`, 64, startY + 36);

        // ROI math line
        doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTE)
           .text(`That's $${t.dailyLow}–$${t.dailyHigh}/day to reach ${city}'s unchurched families.`, 64, startY + 52);

        doc.font('Helvetica').fontSize(11).fillColor(INK);
        let y = startY + 70;
        for (const inc of t.includes) {
          doc.circle(72, y + 5, 2).fill(GOLD);
          doc.fillColor(INK).text(inc, 82, y, { width: boxW - 30 });
          y = doc.y + 4;
        }
        doc.moveDown(0.8);
      }

      // ─── 4-Week Timeline (NEW) ───────────────────────────────────────────────
      if (doc.y > 580) doc.addPage();
      sectionHeader(doc, 'YOUR FIRST 30 DAYS');
      const timeline = [
        ['Week 1',   'Strategy call + brand alignment. We learn your voice, your mission, your people.'],
        ['Week 2–3', 'Build phase: website, content library, social profiles, and first month of posts.'],
        ['Week 4',   'Launch. First campaign goes live. Community starts finding you.'],
      ];
      for (const [week, desc] of timeline) {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(ROYAL).text(week, 54, y, { width: 70, continued: false });
        doc.font('Helvetica').fontSize(11).fillColor(INK).text(desc, 130, y, { width: doc.page.width - 184 });
        doc.moveDown(0.5);
      }

      // ─── Objection handling (NEW — only if data has objections) ─────────────
      if (Array.isArray(data.objections) && data.objections.length) {
        if (doc.y > 560) doc.addPage();
        sectionHeader(doc, 'QUESTIONS YOU MIGHT HAVE');
        for (const obj of data.objections.slice(0, 4)) {
          doc.font('Helvetica-Bold').fontSize(11).fillColor(DEEP)
             .text(`Q: ${obj.question}`, { paragraphGap: 3 });
          doc.font('Helvetica').fontSize(11).fillColor(INK)
             .text(`A: ${obj.answer}`, { paragraphGap: 10, indent: 10 });
        }
        doc.moveDown(0.4);
      }

      // ─── Why it matters ─────────────────────────────────────────────────────
      if (doc.y > 620) doc.addPage();
      sectionHeader(doc, 'WHY THIS MATTERS');
      doc.font('Helvetica').fontSize(12).fillColor(INK)
         .text('Every church without an online presence is a Kingdom connection waiting to happen. Every family that finds your services online is a soul we get to reach together. This isn\'t marketing — this is ministry with momentum.',
          { paragraphGap: 14, align:'justify' });

      // ─── CTA ────────────────────────────────────────────────────────────────
      sectionHeader(doc, 'NEXT STEPS');
      doc.font('Helvetica').fontSize(12).fillColor(INK).text('Reply to this email or call to schedule:', { paragraphGap: 6 });
      bullet(doc, 'A 15-minute clarity call to lock in your tier');
      bullet(doc, 'A first-draft starter website (yours to keep, no obligation)');
      bullet(doc, 'A simple one-page agreement so we can start building this week');
      doc.moveDown(1);

      // ─── Scarcity block (NEW) ────────────────────────────────────────────────
      const scarcityY = doc.y;
      const scarcityW = doc.page.width - 108;
      doc.roundedRect(54, scarcityY, scarcityW, 48, 6).fill(GOLD);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(DEEP)
         .text(`This proposal is valid through ${fmt(validThru)}.`, 64, scarcityY + 10, { width: scarcityW - 20 });
      doc.font('Helvetica').fontSize(10).fillColor(INK)
         .text(`Our next available onboarding slot opens ${fmt(onboardSlot)}. Spots are first-come.`, 64, scarcityY + 28, { width: scarcityW - 20 });
      doc.moveDown(3.4);

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
