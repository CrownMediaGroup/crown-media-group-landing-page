/**
 * ping.mjs — Health check for Netlify functions
 * Hit /.netlify/functions/ping to confirm functions are deploying
 */
export const handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ status: 'ok', ts: Date.now() }),
  };
};
