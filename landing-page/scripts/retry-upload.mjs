import { uploadToYouTube } from './video/youtube-uploader.js';
import { loadVideoLog, saveVideoLog, VIDEO_OUT } from './video/utils.js';
import { join } from 'path';

const slug = 'seo-vs-geo-columbia-sc';
const videoPath = join(VIDEO_OUT, 'seo-vs-geo-columbia-sc-youtube.mp4');
const title = 'SEO vs GEO: What Columbia SC Business Owners Need to Know';
const tags = ['Columbia SC','SEO','GEO','AI Marketing','Local SEO','Small Business'];

const description = `How are AI-powered searches changing local SEO for Columbia SC businesses? In this video we break down the difference between SEO and GEO (Generative Engine Optimization) — and what you need to do right now to stay visible.

https://crownmediagroup.co/blog/seo-vs-geo-columbia-sc

TIMESTAMPS:
0:00 — Introduction
0:20 — What is Traditional SEO?
0:40 — What is GEO (Generative Engine Optimization)?
1:00 — How ChatGPT & Google AI find businesses
1:20 — The 3 shifts you need to make today
1:40 — How Crown Media Group helps you win

Columbia SC | SEO | GEO | AI Marketing | Local SEO | Small Business

#ColumbiaMarketing #SEO #GEO #AIMarketing #SmallBusiness #ColumbiaSC #DigitalMarketing #LocalMarketing`;

console.log('Retrying YouTube upload for seo-vs-geo...');
console.log('Video path:', videoPath);

const url = await uploadToYouTube({ videoPath, title, description, tags, unlisted: false });
console.log('Uploaded:', url);

const log = loadVideoLog();
log[slug].youtube = url;
saveVideoLog(log);
console.log('Video log updated.');
