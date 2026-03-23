import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';


const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Nano Banana Pro — Logo & Branding prompt formula
const LOGO_STYLES = ['minimalist', 'modern', 'classic', 'bold'];

const LOGO_PROMPTS = {
  minimalist: (name, industry) => `Minimalist professional logo for "${name}", ${industry} brand, clean geometric shapes, white background, negative space composition, Swiss design principles, vector style, no gradients, single color mark`,
  modern: (name, industry) => `Modern professional logo for "${name}", ${industry} company, bold sans-serif wordmark, dynamic geometric icon, contemporary design, flat vector style, white background, scalable mark`,
  classic: (name, industry) => `Classic timeless logo for "${name}", ${industry} brand, refined typography, elegant emblem or crest style, professional and trustworthy, traditional composition, white background, vector illustration`,
  bold: (name, industry) => `Bold impactful logo for "${name}", ${industry} brand, strong typography, high contrast design, powerful visual identity, confident mark, white background, vector style, memorable symbol`,
};

async function generateWithRecraft(prompt) {
  const res = await fetch('https://external.api.recraft.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RECRAFT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      style: 'vector_illustration',
      response_format: 'url',
      size: '1024x1024',
    }),
  });
  const result = await res.json();
  return result.data[0].url;
}

// Nano Banana Pro banner prompts — Google Gemini optimized
const BANNER_PROMPTS = {
  facebook:  (name, style, industry) => `Professional Facebook cover banner for "${name}", ${style} design style, ${industry} brand. Wide cinematic composition 820x312, bold typography, vibrant brand colors, photorealistic quality, marketing banner`,
  instagram: (name, style, industry) => `Professional Instagram post for "${name}", ${style} aesthetic, ${industry} brand. Square 1:1 composition, eye-catching design, modern social media visual, bold colors, clean layout`,
  linkedin:  (name, style, industry) => `Professional LinkedIn banner for "${name}", ${style} corporate style, ${industry} industry. Wide banner 1584x396, polished business aesthetic, authority and trust, clean typography`,
  twitter:   (name, style, industry) => `Professional Twitter/X header for "${name}", ${style} design, ${industry} brand. Wide banner 1500x500, dynamic composition, bold visual identity, modern social media design`,
};

// Banners use existing Gemini system — free, already set up
async function generateBanner(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  );
  const data = await res.json();
  for (const part of data.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
  }
  throw new Error('Gemini returned no image');
}

async function uploadToSupabase(orderId, filename, imageData, contentType) {
  let buffer;
  if (imageData.startsWith('data:')) {
    // Base64 data URL from Gemini
    const base64 = imageData.split(',')[1];
    buffer = Buffer.from(base64, 'base64');
  } else {
    // Remote URL from Recraft
    const res = await fetch(imageData);
    buffer = await res.arrayBuffer();
  }

  const storagePath = `orders/${orderId}/${filename}`;
  const { error } = await supabase.storage
    .from('ai-generated')
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (error) throw error;
  return storagePath;
}

export default async (req) => {
  const { orderId } = await req.json();

  const { data: order, error } = await supabase
    .from('ai_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    console.error('[GEN] Order not found:', orderId);
    return;
  }

  try {
    const assets = [];

    // ── LOGO GENERATION ─────────────────────────────────────────────────────
    if (order.product_type.startsWith('logo')) {
      const count = order.product_type === 'logo-premium' ? 8 : 4;
      for (let i = 0; i < count; i++) {
        const style = LOGO_STYLES[i % LOGO_STYLES.length];
        const prompt = LOGO_PROMPTS[style](order.business_name, order.industry);
        const imageUrl = await generateWithRecraft(prompt);
        const storagePath = await uploadToSupabase(orderId, `logo-${i + 1}.svg`, imageUrl, 'image/svg+xml');

        await supabase.from('ai_assets').insert({
          order_id: orderId,
          storage_path: storagePath,
          asset_type: 'logo',
          style,
          prompt_used: prompt,
          ai_model: 'recraft-v4',
        });
        assets.push(storagePath);
      }
    }

    // ── BANNER GENERATION ────────────────────────────────────────────────────
    if (order.product_type.startsWith('banner')) {
      const sizes = order.product_type === 'banner-pack'
        ? {
            facebook:  { w: 820,  h: 312  },
            instagram: { w: 1080, h: 1080 },
            linkedin:  { w: 1584, h: 396  },
            twitter:   { w: 1500, h: 500  },
          }
        : { instagram: { w: 1080, h: 1080 } };

      for (const [platform, { w, h }] of Object.entries(sizes)) {
        const prompt = BANNER_PROMPTS[platform](order.business_name, order.style, order.industry);
        const imageData = await generateBanner(prompt);
        const storagePath = await uploadToSupabase(orderId, `banner-${platform}.png`, imageData, 'image/png');

        await supabase.from('ai_assets').insert({
          order_id: orderId,
          storage_path: storagePath,
          asset_type: 'banner',
          platform,
          width: w,
          height: h,
          prompt_used: prompt,
          ai_model: 'gemini-2.0-flash',
        });
        assets.push(storagePath);
      }
    }

    await supabase.from('ai_orders').update({ status: 'completed' }).eq('id', orderId);
    console.log(`[GEN] Order ${orderId} complete — ${assets.length} assets generated`);

    // Send delivery email
    const deliveryUrl = `${process.env.URL || 'https://crownmediagroup.co'}/ai-tools.html?order_id=${orderId}`;
    const productLabel = order.product_type.startsWith('logo') ? 'AI Logo' : 'AI Banner Set';
    const amountDollars = ((order.amount || 0) / 100).toFixed(2);
    resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: 'king@crownmediagroup.co',
      subject: `Delivered: ${productLabel} — ${order.business_name}`,
      html: `<div style="font-family:sans-serif;max-width:480px;padding:32px;background:#0d0d14;color:#e8e8f0">
        <h2 style="color:#C9981A;margin-bottom:16px">Assets Delivered</h2>
        <p><strong>Product:</strong> ${productLabel}</p>
        <p><strong>Business:</strong> ${order.business_name}</p>
        <p><strong>Customer:</strong> ${order.email}</p>
        <p><strong>Assets:</strong> ${assets.length} files generated</p>
        <p style="color:#555;font-size:13px;margin-top:24px">Delivery email sent to client. Check <a href="https://crownmediagroup.co/admin" style="color:#C9981A">admin dashboard</a>.</p>
      </div>`,
    }).catch(console.error);

    await resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: order.email,
      subject: `Your AI files are ready — Crown Media Group`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
        <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
        <h1 style="font-size:24px;font-weight:800;margin-bottom:12px">Your files are ready, ${order.business_name}.</h1>
        <p style="color:#8888aa;margin-bottom:28px;line-height:1.7">Your AI-generated assets have been created and are ready to download. Links are active for 2 hours.</p>
        <a href="${deliveryUrl}" style="display:inline-block;background:#c9a84c;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px">Download Your Files</a>
        <p style="color:#555;font-size:13px">Questions? Reply to this email or reach us at king@crownmediagroup.co</p>
        <p style="color:#333;font-size:12px;margin-top:24px">Crown Media Group · Columbia, SC · crownmediagroup.co</p>
      </div>`,
    });

  } catch (err) {
    console.error('[GEN] Failed:', err.message);
    await supabase.from('ai_orders').update({ status: 'failed', error_msg: err.message }).eq('id', orderId);
  }
};

export const config = { path: '/api/generate-assets' };
