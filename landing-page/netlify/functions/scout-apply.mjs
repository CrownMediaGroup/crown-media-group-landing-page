export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  try {
    const crmRes = await fetch('https://crm.crownmediagroup.co/api/scouts/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await crmRes.json();
    return new Response(JSON.stringify(data), { status: crmRes.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not reach signup service. Try again.' }), { status: 502, headers });
  }
};
