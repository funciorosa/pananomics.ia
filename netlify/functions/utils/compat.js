/**
 * Crea objetos req/res compatibles con Vercel a partir de un Netlify event.
 * Uso: const { req, res, getResult } = createReqRes(event);
 *      await handler(req, res);
 *      return getResult();
 */
function createReqRes(event) {
  let statusCode = 200;
  let body = "";
  const headers = { "Content-Type": "application/json" };
  let resolved = false;

  const req = {
    method:  event.httpMethod,
    headers: event.headers || {},
    query:   event.queryStringParameters || {},
    body:    (() => {
      try { return JSON.parse(event.body || "{}"); } catch { return {}; }
    })(),
  };

  const res = {
    status(code)  { statusCode = code; return res; },
    setHeader(k, v) { headers[k] = v; return res; },
    json(data)    { body = JSON.stringify(data); resolved = true; return res; },
    send(data)    { body = typeof data === "string" ? data : JSON.stringify(data); resolved = true; return res; },
    end()         { resolved = true; return res; },
  };

  const getResult = () => ({ statusCode, headers, body });

  return { req, res, getResult };
}

module.exports = { createReqRes };
