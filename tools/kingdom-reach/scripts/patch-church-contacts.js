// patch-church-contacts.js — applies researched addresses/phones to churches.json
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'churches.json');
const churches = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Normalize name for fuzzy matching — strip suffixes like "- Columbia SC", lowercase, collapse spaces
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/\s*[-–]\s*(columbia|west columbia|irmo|lexington|sc|29\d{3}).*$/i, '')
    .replace(/\s+/g, ' ').trim();
}

// All researched data consolidated from 8 parallel agents
const researched = [
  // Batch 1
  {"name":"Awaken Church","address":"171 Newland Road","zip":"29229","phone":"(803) 788-6635"},
  {"name":"Columbia Presbyterian Church","address":"2244 Sumter St","zip":"29201","phone":"(803) 931-3630"},
  {"name":"New Beginning Baptist Church","address":"9601 Caughman Road","zip":"29209","phone":"(803) 695-1195"},
  {"name":"Ebenezer Pentecostal Holiness Church","address":"501 Church St","zip":"29172","phone":"(803) 755-2883"},
  {"name":"Northeast Presbyterian Church","address":"601 Polo Rd","zip":"29223","phone":"(803) 788-5298"},
  {"name":"St. Andrews Presbyterian Church","address":"6952 St. Andrews Rd","zip":"29212","phone":"(803) 732-2273"},
  {"name":"Rose Hill Presbyterian Church","address":"229 S Saluda Ave","zip":"29205","phone":"(803) 771-6775"},
  {"name":"Sandol Presbyterian Church","address":"2401 Decker Blvd","zip":"29206","phone":"(803) 665-6762"},
  {"name":"Living Word Church Columbia","address":"9558 Two Notch Road","zip":"29223","phone":""},
  {"name":"New Life Church Columbia","address":"2825 Ashland Rd","zip":"29210","phone":"(803) 798-1082"},
  {"name":"Covenant Baptist Church","address":"3535 Delree St","zip":"29170","phone":"(803) 518-7789"},
  {"name":"Grace Baptist Church Columbia","address":"416 Denham Ave","zip":"29169","phone":"(803) 794-8237"},
  {"name":"Cornerstone Baptist Church","address":"100 Wayne Street","zip":"29201","phone":"(803) 256-4890"},
  // Batch 2
  {"name":"Trinity Baptist Church Columbia","address":"2521 Richland St","zip":"29204","phone":"(803) 254-7142"},
  {"name":"Grace Community Church","address":"2221 Rosewood Dr","zip":"29205","phone":"(803) 254-7587"},
  {"name":"Harvest Community Church","address":"508 Evelyn Drive","zip":"29210","phone":"(803) 454-2550"},
  {"name":"Restoration Church Columbia","address":"150 Stoneridge Drive","zip":"29210","phone":"(803) 200-1598"},
  {"name":"Destiny Church Columbia","address":"8610 Farrow Rd","zip":"29203","phone":"(803) 788-5454"},
  {"name":"Kingdom Builders Church","address":"5320 Fairfield Rd","zip":"29203","phone":""},
  {"name":"Victory Christian Center","address":"3608 Covenant Road","zip":"29204","phone":"(803) 787-6397"},
  {"name":"Killian Baptist Church","address":"503 Killian Rd","zip":"29203","phone":"(803) 754-0236"},
  {"name":"Sparkleberry Independent Baptist","address":"311 Sparkleberry Ln","zip":"29229","phone":"(803) 736-5055"},
  {"name":"Zion Baptist Church Columbia","address":"801 Washington St","zip":"29201","phone":"(803) 779-2809"},
  {"name":"Mount Olive Baptist Church","address":"216 Blue Ridge Terrace","zip":"29203","phone":""},
  // Batch 3
  {"name":"Macedonia Baptist Church Columbia","address":"612 Percival Rd","zip":"29206","phone":"(803) 730-3948"},
  {"name":"Calvary Baptist Church Columbia","address":"500 S Kilbourne Rd","zip":"29205","phone":"(803) 787-7275"},
  {"name":"New Hope Baptist Church Columbia","address":"3525 Lucius Rd","zip":"29201","phone":"(803) 779-0263"},
  {"name":"Canaan Baptist Church Columbia","address":"7820 Farrow Rd","zip":"29203","phone":"(803) 935-0132"},
  {"name":"St. Paul Lutheran Church Columbia","address":"1715 Bull St","zip":"29201","phone":"(803) 779-0030"},
  {"name":"Reformation Lutheran Columbia","address":"1118 Union St","zip":"29201","phone":"(803) 252-1507"},
  {"name":"Jerusalem Baptist Church","address":"1051 Clarkson Rd","zip":"29061","phone":"(803) 783-0651"},
  // Batch 4
  {"name":"Columbia AME Zion Church","address":"2400 Barhamville Road","zip":"29204","phone":"(803) 254-8786"},
  {"name":"New Jerusalem Apostolic Church","address":"1003 Colleton St","zip":"29203","phone":"(803) 542-7489"},
  {"name":"Spirit of Life Church Columbia","address":"1700 Decker Blvd Suite A","zip":"29206","phone":"(803) 477-0814"},
  {"name":"Kingdom Life Church Columbia","address":"200 Berkshire Dr","zip":"29223","phone":""},
  {"name":"Living Water Church Columbia","address":"2229 Decker Blvd Ste D","zip":"29223","phone":"(803) 699-9346"},
  {"name":"River of Life Church","address":"2501 Leaphart Road","zip":"29169","phone":"(803) 739-4414"},
  {"name":"Covenant of Grace Church","address":"227 Lincreek Drive","zip":"29212","phone":"(803) 781-7115"},
  {"name":"Grace Pentecostal Church","address":"2710 Harrison Road","zip":"29204","phone":"(803) 255-0120"},
  {"name":"True Life Church Columbia","address":"9105 Wilson Blvd","zip":"29203","phone":"(803) 888-7089"},
  // Batch 5
  {"name":"Hope Church Columbia SC","address":"2609 Seminole Rd","zip":"29210","phone":"(803) 798-4307"},
  {"name":"Purpose Church Columbia","address":"4026 Lamar Street","zip":"29230","phone":"(803) 271-0747"},
  {"name":"Abundant Life Church Columbia","address":"2301 Clemson Rd","zip":"29229","phone":"(803) 462-1653"},
  {"name":"Generation Church Columbia","address":"1051 Sparkleberry Lane Ext Ste C","zip":"29223","phone":""},
  {"name":"Greater Antioch Baptist Church","address":"5715 Koon Road","zip":"29203","phone":"(803) 786-0119"},
  // Batch 6
  {"name":"Second Nazareth Baptist Church","address":"2336 Elmwood Ave","zip":"29204","phone":"(803) 256-0088"},
  {"name":"Beulah Baptist Church Columbia","address":"9487 Garners Ferry Rd","zip":"29061","phone":"(803) 776-2188"},
  {"name":"Wesley United Methodist Columbia","address":"1725 Gervais St","zip":"29201","phone":"(803) 799-1426"},
  {"name":"College Place United Methodist","address":"4801 Colonial Dr","zip":"29203","phone":"(803) 754-5342"},
  {"name":"Shandon United Methodist Church","address":"3407 Devine St","zip":"29205","phone":"(803) 256-8383"},
  {"name":"First Presbyterian Church Columbia","address":"1324 Marion St","zip":"29201","phone":"(803) 799-9062"},
  {"name":"Lake Murray Presbyterian","address":"2721 Dutch Fork Road","zip":"29036","phone":"(803) 345-5140"},
  // Batch 7
  {"name":"Kilbourne Park Baptist","address":"4205 Kilbourne Rd","zip":"29206","phone":"(803) 787-3371"},
  {"name":"Pine Belt Road Baptist","address":"3639 Pine Belt Rd","zip":"29204","phone":"(803) 754-3100"},
  {"name":"W Beltline Baptist Church","address":"3404 W Beltline Blvd","zip":"29203","phone":"(803) 254-4170"},
  {"name":"Farrow Road Baptist Church","address":"5616 Farrow Rd","zip":"29203","phone":"(803) 754-1760"},
  {"name":"Wilson Blvd Baptist Church","address":"7831 Wilson Blvd","zip":"29203","phone":"(803) 754-3100"},
  {"name":"N Main Street Baptist","address":"4427 N Main St","zip":"29203","phone":"(803) 786-7769"},
  {"name":"House Street Church","address":"1237 House St","zip":"29204","phone":"(803) 799-8906"},
  {"name":"Greater Harvest Church","address":"936 S Stadium Rd","zip":"29201","phone":"(803) 252-9494"},
  {"name":"City of Refuge Columbia","address":"901 Mason Rd","zip":"29203","phone":"(803) 262-1246"},
  {"name":"Koinonia Fellowship Columbia","address":"4427 N Main St","zip":"29203","phone":"(803) 767-9580"},
  {"name":"Brookland United Methodist","address":"541 Meeting St","zip":"29169","phone":"(803) 791-1450"},
  {"name":"Lake Murray Church of God","address":"1001 Highway 378 W","zip":"29072","phone":"(803) 359-1556"},
  // Batch 8
  {"name":"Greater Columbia Church of God","address":"224 O'Neil Court","zip":"29223","phone":"(803) 741-5844"},
  {"name":"Columbia Church of God in Christ","address":"209 South Prospect Court Street","zip":"29205","phone":"(803) 790-6812"},
  {"name":"First Church of God Columbia","address":"2665 Covenant Road","zip":"29204","phone":"(803) 256-6858"},
  {"name":"Christ the King Catholic Church","address":"4300 Clemson Blvd","zip":"29229","phone":"(803) 318-6572"},
  {"name":"St. Martin de Porres Catholic","address":"2229 Hampton Street","zip":"29204","phone":"(803) 254-6862"},
  {"name":"Our Lady of the Hills Catholic","address":"120 Marydale Lane","zip":"29210","phone":"(803) 772-7400"},
  {"name":"Worship Center Columbia","address":"5616 Bluff Road","zip":"29209","phone":"(803) 238-4826"},
  {"name":"Central Church of Christ Columbia","address":"1049 Harbor Drive","zip":"29169","phone":"(803) 254-4934"},
  {"name":"Trenholm Park Baptist Church","address":"6515 N Trenholm Road","zip":"29206","phone":"(803) 787-2133"},
  {"name":"North Columbia Baptist Church","address":"8140 Gray Fox Blvd","zip":"29223","phone":"(803) 788-6053"},
  {"name":"Christcenter.org Church","address":"4615 Platt Springs Road","zip":"29170","phone":"(803) 955-0763"},
];

let updated = 0;
let skipped = 0;

for (const r of researched) {
  if (!r.address && !r.phone) { skipped++; continue; }
  const rNorm = norm(r.name);
  const church = churches.find(c => norm(c.name) === rNorm);
  if (!church) {
    console.warn('No match for:', r.name, '(normalized:', rNorm + ')');
    skipped++;
    continue;
  }
  let changed = false;
  if (r.address && !church.address) { church.address = r.address; changed = true; }
  if (r.zip && !church.zip)         { church.zip = r.zip;         changed = true; }
  if (r.phone && !church.phone)     { church.phone = r.phone;     changed = true; }
  if (changed) {
    updated++;
    console.log('Updated:', church.name);
  }
}

fs.writeFileSync(filePath, JSON.stringify(churches, null, 2));
console.log(`\nDone. Updated: ${updated} | Skipped/no match: ${skipped} | Total: ${churches.length}`);
