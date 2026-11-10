/**
 * One payware request as a complete program in each supported language, and the JWT that signs it.
 *
 * The signing follows server/ config/security/OncePerRequestPaywareAuthorizationFilter and kb
 * tech/details/api-security: an RS256 JWT whose header is {"alg":"RS256","typ":"JWT"} and, for a request
 * with a body, "contentSha256", the standard (not URL-safe) Base64 of the SHA-256 of the exact body bytes
 * sent. The claims are "iss" (the partner id), "aud" (https://payware.eu; for an ISV acting for a
 * merchant, the merchant's partner id, with the merchant's OAuth2 token as "sub") and "iat", which must be
 * within the last five minutes. A multipart upload carries no hash. Every request sends Api-Version: 1.
 *
 * A request is described by a spec:
 *   name         operation name, snake_case
 *   description  one line for a comment
 *   method       GET, POST, PATCH, PUT or DELETE
 *   path         relative to the base URL, with {camelCase} parameters
 *   params       { name: sample } for the path parameters, in path order
 *   base         'api' (https://sandbox.payware.eu/api), 'production' (https://api.payware.eu/api) or
 *                'host' (the API URL without /api, where /oauth2 is served)
 *   body         an object sent as JSON, or null
 *   multipart    { field, param, sample }: a file upload in place of a JSON body
 *   onBehalf     true for an ISV call made for a merchant
 *
 * Every program reads PAYWARE_PARTNER_ID and PAYWARE_PRIVATE_KEY_PATH (a PKCS#8 PEM, as `openssl pkcs8
 * -topk8 -nocrypt` writes it), PAYWARE_BASE_URL optionally, and for an on-behalf call
 * PAYWARE_MERCHANT_PARTNER_ID and PAYWARE_OAUTH2_TOKEN.
 */

export const LANGUAGES = ['python', 'nodejs', 'php', 'java', 'csharp', 'curl'];

const DEFAULT_BASE = {
  api: 'https://sandbox.payware.eu/api',
  host: 'https://sandbox.payware.eu/api',
  production: 'https://api.payware.eu/api'
};

const camel = name => name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = name => camel(name).replace(/^./, c => c.toUpperCase());
const snake = name => name.replace(/([A-Z])/g, '_$1').toLowerCase();
const upper = name => snake(name).toUpperCase();

/** The path split into literal text and parameter names. */
function pathParts(path) {
  const parts = [];
  let last = 0;
  for (const match of path.matchAll(/\{(\w+)\}/g)) {
    if (match.index > last) parts.push({ text: path.slice(last, match.index) });
    parts.push({ param: match[1] });
    last = match.index + match[0].length;
  }
  if (last < path.length) parts.push({ text: path.slice(last) });
  return parts;
}

/** Every input the program takes: path parameters, then the file of an upload. */
function inputs(spec) {
  const list = Object.entries(spec.params || {}).map(([name, sample]) => ({ name, sample }));
  if (spec.multipart) list.push({ name: spec.multipart.param, sample: spec.multipart.sample });
  return list;
}

const compactJson = body => JSON.stringify(body);
const doubleQuoted = text => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const singleQuotedPhp = text => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const singleQuotedShell = text => `'${text.replace(/'/g, `'\\''`)}'`;

function pythonLiteral(value, indent = '') {
  const next = `${indent}    `;
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(v => pythonLiteral(v, next)).join(', ')}]`;
  const entries = Object.entries(value).map(([k, v]) => `${next}${JSON.stringify(k)}: ${pythonLiteral(v, next)},`);
  return `{\n${entries.join('\n')}\n${indent}}`;
}

function phpLiteral(value, indent = '') {
  const next = `${indent}    `;
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return singleQuotedPhp(value);
  if (Array.isArray(value)) return `[${value.map(v => phpLiteral(v, next)).join(', ')}]`;
  const entries = Object.entries(value).map(([k, v]) => `${next}${singleQuotedPhp(k)} => ${phpLiteral(v, next)},`);
  return `[\n${entries.join('\n')}\n${indent}]`;
}

const comment = (language, text) => (['python', 'curl'].includes(language) ? `# ${text}` : `// ${text}`);

/** Lines joined, with null entries (switched-off comments, absent parts) left out. */
const lines = (...items) => items.flat().filter(item => item !== null && item !== undefined && item !== false).join('\n');

// ---------------------------------------------------------------------------------------------------
// The JWT helper, per language. `isv` adds the optional on-behalf arguments.
// ---------------------------------------------------------------------------------------------------

function pythonJwt(isv, c) {
  return lines(
    `def create_jwt_token(body${isv ? ', merchant_partner_id=None, oauth2_token=None' : ''}):`,
    c && '    """RS256 JWT for one request. body is the exact string sent, or None for a request without one."""',
    '    header = {"typ": "JWT"}',
    '    if body is not None:',
    c && '        # Standard Base64, not URL-safe, of the SHA-256 of the bytes sent',
    '        header["contentSha256"] = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")',
    '    claims = {"iss": os.environ["PAYWARE_PARTNER_ID"], "aud": "https://payware.eu", "iat": int(time.time())}',
    isv && '    if merchant_partner_id:',
    isv && c && '        # On behalf of a merchant: aud is its partner id, sub its OAuth2 token',
    isv && '        claims["aud"] = merchant_partner_id',
    isv && '        claims["sub"] = oauth2_token',
    '    with open(os.environ["PAYWARE_PRIVATE_KEY_PATH"]) as key_file:',
    '        private_key = key_file.read()',
    '    return jwt.encode(claims, private_key, algorithm="RS256", headers=header)'
  );
}

function nodeJwt(isv, c) {
  return lines(
    `function createJwtToken(body${isv ? ', merchantPartnerId = null, oauth2Token = null' : ''}) {`,
    c && '  // RS256 JWT for one request. body is the exact string sent, or null for a request without one.',
    "  const header = { typ: 'JWT' };",
    '  if (body !== null) {',
    c && '    // Standard Base64, not URL-safe, of the SHA-256 of the bytes sent',
    "    header.contentSha256 = crypto.createHash('sha256').update(body, 'utf8').digest('base64');",
    '  }',
    "  const claims = { iss: process.env.PAYWARE_PARTNER_ID, aud: 'https://payware.eu', iat: Math.floor(Date.now() / 1000) };",
    isv && '  if (merchantPartnerId) {',
    isv && c && '    // On behalf of a merchant: aud is its partner id, sub its OAuth2 token',
    isv && '    claims.aud = merchantPartnerId;',
    isv && '    claims.sub = oauth2Token;',
    isv && '  }',
    "  const privateKey = fs.readFileSync(process.env.PAYWARE_PRIVATE_KEY_PATH, 'utf8');",
    "  return jwt.sign(claims, privateKey, { algorithm: 'RS256', header });",
    '}'
  );
}

function phpJwt(isv, c) {
  return lines(
    `function createJwtToken(?string $body${isv ? ', ?string $merchantPartnerId = null, ?string $oauth2Token = null' : ''}): string`,
    '{',
    c && '    // RS256 JWT for one request. $body is the exact string sent, or null for a request without one.',
    "    $header = ['typ' => 'JWT'];",
    '    if ($body !== null) {',
    c && '        // Standard Base64, not URL-safe, of the SHA-256 of the bytes sent',
    "        $header['contentSha256'] = base64_encode(hash('sha256', $body, true));",
    '    }',
    "    $claims = ['iss' => getenv('PAYWARE_PARTNER_ID'), 'aud' => 'https://payware.eu', 'iat' => time()];",
    isv && '    if ($merchantPartnerId !== null) {',
    isv && c && '        // On behalf of a merchant: aud is its partner id, sub its OAuth2 token',
    isv && "        $claims['aud'] = $merchantPartnerId;",
    isv && "        $claims['sub'] = $oauth2Token;",
    isv && '    }',
    "    $privateKey = file_get_contents(getenv('PAYWARE_PRIVATE_KEY_PATH'));",
    "    return JWT::encode($claims, $privateKey, 'RS256', null, $header);",
    '}'
  );
}

function javaJwt(isv, c) {
  return lines(
    `    static String createJwtToken(String body${isv ? ', String merchantPartnerId, String oauth2Token' : ''}) throws Exception {`,
    c && '        // RS256 JWT for one request. body is the exact string sent, or null for a request without one.',
    c && '        // The ids and the token are [0-9A-Za-z], so they need no JSON escaping.',
    '        Base64.Encoder base64Url = Base64.getUrlEncoder().withoutPadding();',
    String.raw`        String header = "{\"alg\":\"RS256\",\"typ\":\"JWT\"";`,
    '        if (body != null) {',
    c && '            // Standard Base64, not URL-safe, of the SHA-256 of the bytes sent',
    '            byte[] digest = MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8));',
    String.raw`            header += ",\"contentSha256\":\"" + Base64.getEncoder().encodeToString(digest) + "\"";`,
    '        }',
    '        header += "}";',
    isv
      ? String.raw`        String audience = merchantPartnerId != null ? merchantPartnerId : "https://payware.eu";`
      : '        String audience = "https://payware.eu";',
    String.raw`        String claims = "{\"iss\":\"" + System.getenv("PAYWARE_PARTNER_ID") + "\",\"aud\":\"" + audience + "\""`,
    isv && String.raw`            + (merchantPartnerId != null ? ",\"sub\":\"" + oauth2Token + "\"" : "")`,
    String.raw`            + ",\"iat\":" + (System.currentTimeMillis() / 1000) + "}";`,
    '        String signingInput = base64Url.encodeToString(header.getBytes(StandardCharsets.UTF_8)) + "."',
    '            + base64Url.encodeToString(claims.getBytes(StandardCharsets.UTF_8));',
    '        String pem = Files.readString(Path.of(System.getenv("PAYWARE_PRIVATE_KEY_PATH")));',
    '        byte[] der = Base64.getMimeDecoder().decode(pem.replaceAll("-----(BEGIN|END) PRIVATE KEY-----", ""));',
    '        Signature signer = Signature.getInstance("SHA256withRSA");',
    '        signer.initSign(KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der)));',
    '        signer.update(signingInput.getBytes(StandardCharsets.US_ASCII));',
    '        return signingInput + "." + base64Url.encodeToString(signer.sign());',
    '    }'
  );
}

function csharpJwt(isv, c) {
  return lines(
    `    static string CreateJwtToken(string body${isv ? ', string merchantPartnerId = null, string oauth2Token = null' : ''})`,
    '    {',
    c && '        // RS256 JWT for one request. body is the exact string sent, or null for a request without one.',
    c && '        // The ids and the token are [0-9A-Za-z], so they need no JSON escaping.',
    "        string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');",
    String.raw`        var header = "{\"alg\":\"RS256\",\"typ\":\"JWT\"";`,
    '        if (body != null)',
    '        {',
    c && '            // Standard Base64, not URL-safe, of the SHA-256 of the bytes sent',
    String.raw`            header += ",\"contentSha256\":\"" + Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(body))) + "\"";`,
    '        }',
    '        header += "}";',
    isv
      ? '        var audience = merchantPartnerId ?? "https://payware.eu";'
      : '        var audience = "https://payware.eu";',
    String.raw`        var claims = "{\"iss\":\"" + Environment.GetEnvironmentVariable("PAYWARE_PARTNER_ID") + "\",\"aud\":\"" + audience + "\""`,
    isv && String.raw`            + (merchantPartnerId != null ? ",\"sub\":\"" + oauth2Token + "\"" : "")`,
    String.raw`            + ",\"iat\":" + DateTimeOffset.UtcNow.ToUnixTimeSeconds() + "}";`,
    '        var signingInput = Base64Url(Encoding.UTF8.GetBytes(header)) + "." + Base64Url(Encoding.UTF8.GetBytes(claims));',
    '        using var rsa = RSA.Create();',
    '        rsa.ImportFromPem(File.ReadAllText(Environment.GetEnvironmentVariable("PAYWARE_PRIVATE_KEY_PATH")));',
    '        var signature = rsa.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);',
    '        return signingInput + "." + Base64Url(signature);',
    '    }'
  );
}

/** The bash lines that leave the token in $JWT. */
function curlJwt(spec, c) {
  const hashed = Boolean(spec.body);
  return lines(
    c && '# The JWT, built with openssl. contentSha256 is the standard Base64, not URL-safe, of the SHA-256',
    c && '# of the exact body sent; a request without a body, or a multipart upload, carries none.',
    "b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }",
    hashed && `CONTENT_SHA256=$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | openssl base64 -A)`,
    hashed
      ? `JWT_HEADER=$(printf '{"alg":"RS256","typ":"JWT","contentSha256":"%s"}' "$CONTENT_SHA256" | b64url)`
      : `JWT_HEADER=$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | b64url)`,
    spec.onBehalf
      ? lines(
        c && '# On behalf of a merchant: aud is its partner id, sub its OAuth2 token',
        `JWT_CLAIMS=$(printf '{"iss":"%s","aud":"%s","sub":"%s","iat":%s}' "$PAYWARE_PARTNER_ID" "$PAYWARE_MERCHANT_PARTNER_ID" "$PAYWARE_OAUTH2_TOKEN" "$(date +%s)" | b64url)`)
      : `JWT_CLAIMS=$(printf '{"iss":"%s","aud":"https://payware.eu","iat":%s}' "$PAYWARE_PARTNER_ID" "$(date +%s)" | b64url)`,
    `JWT_SIGNATURE=$(printf '%s.%s' "$JWT_HEADER" "$JWT_CLAIMS" | openssl dgst -sha256 -sign "$PAYWARE_PRIVATE_KEY_PATH" -binary | b64url)`,
    'JWT="$JWT_HEADER.$JWT_CLAIMS.$JWT_SIGNATURE"'
  );
}

// ---------------------------------------------------------------------------------------------------
// One request per language.
// ---------------------------------------------------------------------------------------------------

function pythonRequest(spec, partnerType, c, eh) {
  const base = spec.base === 'host' ? `{BASE_URL.removesuffix('/api')}` : '{BASE_URL}';
  const path = pathParts(spec.path).map(p => (p.text ?? `{${snake(p.param)}}`)).join('');
  const args = inputs(spec).map(i => `${snake(i.name)}=${JSON.stringify(i.sample)}`).join(', ');
  const tokenArgs = `${spec.body ? 'body' : 'None'}${spec.onBehalf ? ', MERCHANT_PARTNER_ID, OAUTH2_TOKEN' : ''}`;
  const method = spec.method.toLowerCase();
  const call = spec.multipart
    ? [`with open(${snake(spec.multipart.param)}, "rb") as upload:`,
      `    response = requests.post(url, headers=headers, files={${JSON.stringify(spec.multipart.field)}: upload})`]
    : [`response = requests.${method}(url, headers=headers${spec.body ? ', data=body.encode("utf-8")' : ''})`];
  const indent = (text, n) => text.map(l => ' '.repeat(n) + l);
  const result = 'return response.json() if "json" in response.headers.get("Content-Type", "") else response.text';

  return lines(
    c && `# ${spec.description} - Python`,
    c && '# pip install requests pyjwt cryptography',
    'import base64',
    'import hashlib',
    'import json',
    'import os',
    'import time',
    '',
    'import jwt',
    'import requests',
    '',
    `BASE_URL = os.getenv("PAYWARE_BASE_URL", "${DEFAULT_BASE[spec.base]}")`,
    spec.onBehalf && 'MERCHANT_PARTNER_ID = os.environ["PAYWARE_MERCHANT_PARTNER_ID"]',
    spec.onBehalf && 'OAUTH2_TOKEN = os.environ["PAYWARE_OAUTH2_TOKEN"]',
    '',
    '',
    pythonJwt(partnerType === 'isv', c),
    '',
    '',
    `def ${spec.name}(${args}):`,
    `    url = f"${base}${path}"`,
    spec.body && c && '    # The exact string that is hashed into the JWT and sent',
    spec.body && `    body = json.dumps(${pythonLiteral(spec.body, '    ')}, separators=(",", ":"))`,
    '    headers = {',
    `        "Authorization": "Bearer " + create_jwt_token(${tokenArgs}),`,
    spec.body && '        "Content-Type": "application/json",',
    '        "Api-Version": "1",',
    '    }',
    eh
      ? [
        '    try:',
        ...indent(call, 8),
        '    except requests.RequestException as error:',
        '        print(f"Network error: {error}")',
        '        return None',
        '    if not response.ok:',
        '        print(f"Request failed: {response.status_code} {response.text}")',
        '        return None',
        `    ${result}`
      ]
      : [...indent(call, 4), '    response.raise_for_status()', `    ${result}`],
    '',
    '',
    'if __name__ == "__main__":',
    `    print(${spec.name}())`
  );
}

function nodeRequest(spec, partnerType, c, eh) {
  const base = spec.base === 'host' ? "BASE_URL.replace(/\\/api$/, '')" : 'BASE_URL';
  const path = pathParts(spec.path).map(p => (p.text !== undefined ? `'${p.text}'` : camel(p.param))).join(' + ');
  const fn = camel(spec.name);
  const args = inputs(spec).map(i => `${camel(i.name)} = ${JSON.stringify(i.sample).replace(/"/g, "'")}`).join(', ');
  const tokenArgs = `${spec.body ? 'body' : 'null'}${spec.onBehalf ? ', MERCHANT_PARTNER_ID, OAUTH2_TOKEN' : ''}`;
  const method = spec.method.toLowerCase();
  let call;
  if (spec.multipart) {
    call = [
      '    const form = new FormData();',
      `    form.append('${spec.multipart.field}', new Blob([fs.readFileSync(${camel(spec.multipart.param)})]), path.basename(${camel(spec.multipart.param)}));`,
      '    const response = await axios.post(url, form, { headers });'
    ];
  } else if (spec.body) {
    call = [`    const response = await axios.${method}(url, body, { headers, transformRequest: [data => data] });`];
  } else if (['get', 'delete'].includes(method)) {
    call = [`    const response = await axios.${method}(url, { headers });`];
  } else {
    call = [`    const response = await axios.${method}(url, null, { headers });`];
  }

  return lines(
    c && `// ${spec.description} - Node.js 18 or later`,
    c && '// npm install axios jsonwebtoken',
    "const crypto = require('crypto');",
    "const fs = require('fs');",
    spec.multipart && "const path = require('path');",
    "const axios = require('axios');",
    "const jwt = require('jsonwebtoken');",
    '',
    `const BASE_URL = process.env.PAYWARE_BASE_URL || '${DEFAULT_BASE[spec.base]}';`,
    spec.onBehalf && 'const MERCHANT_PARTNER_ID = process.env.PAYWARE_MERCHANT_PARTNER_ID;',
    spec.onBehalf && 'const OAUTH2_TOKEN = process.env.PAYWARE_OAUTH2_TOKEN;',
    '',
    nodeJwt(partnerType === 'isv', c),
    '',
    `async function ${fn}(${args}) {`,
    `  const url = ${base} + ${path};`,
    spec.body && c && '  // The exact string that is hashed into the JWT and sent',
    spec.body && `  const body = JSON.stringify(${JSON.stringify(spec.body, null, 2).replace(/\n/g, '\n  ')});`,
    '  const headers = {',
    `    Authorization: 'Bearer ' + createJwtToken(${tokenArgs}),`,
    spec.body && "    'Content-Type': 'application/json',",
    "    'Api-Version': '1'",
    '  };',
    eh
      ? [
        '  try {',
        ...call,
        '    return response.data;',
        '  } catch (error) {',
        '    if (error.response) {',
        "      console.error('Request failed: ' + error.response.status, error.response.data);",
        '    } else {',
        "      console.error('Network error: ' + error.message);",
        '    }',
        '    return null;',
        '  }'
      ]
      : [...call.map(l => l.slice(2)), '  return response.data;'],
    '}',
    '',
    `${fn}().then(result => console.log(JSON.stringify(result, null, 2)));`
  );
}

function phpRequest(spec, partnerType, c, eh) {
  const base = spec.base === 'host' ? "preg_replace('#/api$#', '', PAYWARE_BASE_URL)" : 'PAYWARE_BASE_URL';
  const path = pathParts(spec.path).map(p => (p.text ?? `{$${camel(p.param)}}`)).join('');
  const fn = camel(spec.name);
  const args = inputs(spec).map(i => `string $${camel(i.name)} = ${singleQuotedPhp(String(i.sample))}`).join(', ');
  const tokenArgs = `${spec.body ? '$body' : 'null'}${spec.onBehalf ? ", getenv('PAYWARE_MERCHANT_PARTNER_ID'), getenv('PAYWARE_OAUTH2_TOKEN')" : ''}`;
  const fields = spec.multipart
    ? `        CURLOPT_POSTFIELDS => [${singleQuotedPhp(spec.multipart.field)} => new CURLFile($${camel(spec.multipart.param)})],`
    : spec.body ? '        CURLOPT_POSTFIELDS => $body,' : null;

  return lines(
    '<?php',
    c && `// ${spec.description} - PHP 8`,
    c && '// composer require firebase/php-jwt',
    "require __DIR__ . '/vendor/autoload.php';",
    '',
    'use Firebase\\JWT\\JWT;',
    '',
    `define('PAYWARE_BASE_URL', getenv('PAYWARE_BASE_URL') ?: '${DEFAULT_BASE[spec.base]}');`,
    '',
    phpJwt(partnerType === 'isv', c),
    '',
    `function ${fn}(${args})`,
    '{',
    `    $url = ${base} . "${path}";`,
    spec.body && c && '    // The exact string that is hashed into the JWT and sent',
    spec.body && `    $body = json_encode(${phpLiteral(spec.body, '    ')}, JSON_UNESCAPED_SLASHES);`,
    '    $headers = [',
    `        'Authorization: Bearer ' . createJwtToken(${tokenArgs}),`,
    spec.body && "        'Content-Type: application/json',",
    "        'Api-Version: 1',",
    '    ];',
    '    $curl = curl_init($url);',
    '    curl_setopt_array($curl, [',
    `        CURLOPT_CUSTOMREQUEST => '${spec.method}',`,
    '        CURLOPT_RETURNTRANSFER => true,',
    '        CURLOPT_HTTPHEADER => $headers,',
    fields,
    '    ]);',
    '    $response = curl_exec($curl);',
    '    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);',
    '    curl_close($curl);',
    eh && '    if ($response === false || $status < 200 || $status >= 300) {',
    eh && '        fwrite(STDERR, "Request failed: $status $response\\n");',
    eh && '        return null;',
    eh && '    }',
    '    return json_decode($response, true) ?? $response;',
    '}',
    '',
    `var_dump(${fn}());`
  );
}

function javaRequest(spec, partnerType, c, eh) {
  const cls = `${pascal(spec.name)}Example`;
  const base = spec.base === 'host' ? 'BASE_URL.replaceFirst("/api$", "")' : 'BASE_URL';
  const path = pathParts(spec.path).map(p => (p.text !== undefined ? doubleQuoted(p.text) : camel(p.param))).join(' + ');
  // Java has no default arguments: an ISV's own call (/oauth2) passes the two on-behalf ones as null.
  const onBehalfArgs = spec.onBehalf
    ? ', System.getenv("PAYWARE_MERCHANT_PARTNER_ID"), System.getenv("PAYWARE_OAUTH2_TOKEN")'
    : partnerType === 'isv' ? ', null, null' : '';
  const tokenArgs = `${spec.body ? 'body' : 'null'}${onBehalfArgs}`;
  let publisher;
  if (spec.multipart) {
    publisher = '            .header("Content-Type", "multipart/form-data; boundary=" + boundary)\n            .POST(HttpRequest.BodyPublishers.ofByteArray(multipart))';
  } else if (spec.body) {
    publisher = `            .method("${spec.method}", HttpRequest.BodyPublishers.ofString(body))`;
  } else if (spec.method === 'GET') {
    publisher = '            .GET()';
  } else if (spec.method === 'DELETE') {
    publisher = '            .DELETE()';
  } else {
    publisher = `            .method("${spec.method}", HttpRequest.BodyPublishers.noBody())`;
  }
  const field = spec.multipart && spec.multipart.field;
  const file = spec.multipart && camel(spec.multipart.param);

  return lines(
    c && `// ${spec.description} - Java 11 or later, no dependencies`,
    'import java.io.ByteArrayOutputStream;',
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    'import java.nio.charset.StandardCharsets;',
    'import java.nio.file.Files;',
    'import java.nio.file.Path;',
    'import java.security.KeyFactory;',
    'import java.security.MessageDigest;',
    'import java.security.Signature;',
    'import java.security.spec.PKCS8EncodedKeySpec;',
    'import java.util.Base64;',
    '',
    `public class ${cls} {`,
    `    static final String BASE_URL = System.getenv().getOrDefault("PAYWARE_BASE_URL", "${DEFAULT_BASE[spec.base]}");`,
    '',
    '    public static void main(String[] args) throws Exception {',
    ...inputs(spec).map(i => `        String ${camel(i.name)} = ${doubleQuoted(String(i.sample))};`),
    `        String url = ${base} + ${path};`,
    spec.body && c && '        // The exact string that is hashed into the JWT and sent',
    spec.body && `        String body = ${doubleQuoted(compactJson(spec.body))};`,
    spec.multipart && [
      '        String boundary = "payware" + System.nanoTime();',
      '        ByteArrayOutputStream parts = new ByteArrayOutputStream();',
      String.raw`        parts.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"` + field + String.raw`\"; filename=\""`,
      String.raw`            + Path.of(` + file + String.raw`).getFileName() + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));`,
      `        parts.write(Files.readAllBytes(Path.of(${file})));`,
      String.raw`        parts.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));`,
      '        byte[] multipart = parts.toByteArray();'
    ],
    '        HttpRequest request = HttpRequest.newBuilder(URI.create(url))',
    `            .header("Authorization", "Bearer " + createJwtToken(${tokenArgs}))`,
    spec.body && '            .header("Content-Type", "application/json")',
    '            .header("Api-Version", "1")',
    publisher,
    '            .build();',
    '        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());',
    eh && '        if (response.statusCode() < 200 || response.statusCode() >= 300) {',
    eh && '            System.err.println("Request failed: " + response.statusCode() + " " + response.body());',
    eh && '            System.exit(1);',
    eh && '        }',
    '        System.out.println(response.body());',
    '    }',
    '',
    javaJwt(partnerType === 'isv', c),
    '}'
  );
}

function csharpRequest(spec, partnerType, c, eh) {
  const cls = `${pascal(spec.name)}Example`;
  const base = spec.base === 'host' ? '(BaseUrl.EndsWith("/api") ? BaseUrl[..^4] : BaseUrl)' : 'BaseUrl';
  const path = pathParts(spec.path).map(p => (p.text ?? `{${camel(p.param)}}`)).join('');
  const tokenArgs = `${spec.body ? 'body' : 'null'}${spec.onBehalf ? ', Environment.GetEnvironmentVariable("PAYWARE_MERCHANT_PARTNER_ID"), Environment.GetEnvironmentVariable("PAYWARE_OAUTH2_TOKEN")' : ''}`;
  const file = spec.multipart && camel(spec.multipart.param);

  return lines(
    c && `// ${spec.description} - C# (.NET 6 or later), no dependencies`,
    'using System;',
    'using System.IO;',
    'using System.Net.Http;',
    'using System.Security.Cryptography;',
    'using System.Text;',
    'using System.Threading.Tasks;',
    '',
    `public static class ${cls}`,
    '{',
    '    static readonly string BaseUrl = Environment.GetEnvironmentVariable("PAYWARE_BASE_URL") ?? ' + doubleQuoted(DEFAULT_BASE[spec.base]) + ';',
    '    static readonly HttpClient Http = new HttpClient();',
    '',
    '    public static async Task Main()',
    '    {',
    ...inputs(spec).map(i => `        var ${camel(i.name)} = ${doubleQuoted(String(i.sample))};`),
    `        var url = ${base} + $"${path}";`,
    spec.body && c && '        // The exact string that is hashed into the JWT and sent',
    spec.body && `        var body = ${doubleQuoted(compactJson(spec.body))};`,
    `        using var request = new HttpRequestMessage(new HttpMethod("${spec.method}"), url);`,
    `        request.Headers.Add("Authorization", "Bearer " + CreateJwtToken(${tokenArgs}));`,
    '        request.Headers.Add("Api-Version", "1");',
    spec.body && '        request.Content = new StringContent(body, Encoding.UTF8, "application/json");',
    spec.multipart && [
      '        var form = new MultipartFormDataContent();',
      `        form.Add(new ByteArrayContent(File.ReadAllBytes(${file})), ${doubleQuoted(spec.multipart.field)}, Path.GetFileName(${file}));`,
      '        request.Content = form;'
    ],
    '        using var response = await Http.SendAsync(request);',
    '        var text = await response.Content.ReadAsStringAsync();',
    eh && '        if (!response.IsSuccessStatusCode)',
    eh && '        {',
    eh && '            Console.Error.WriteLine($"Request failed: {(int)response.StatusCode} {text}");',
    eh && '            Environment.Exit(1);',
    eh && '        }',
    '        Console.WriteLine(text);',
    '    }',
    '',
    csharpJwt(partnerType === 'isv', c),
    '}'
  );
}

function curlRequest(spec, partnerType, c, eh) {
  const base = spec.base === 'host' ? '${BASE_URL%/api}' : '$BASE_URL';
  const path = pathParts(spec.path).map(p => (p.text ?? `\${${upper(p.param)}}`)).join('');
  const method = spec.method === 'GET' ? '' : ` -X ${spec.method}`;

  return lines(
    '#!/bin/bash',
    c && `# ${spec.description} - curl and openssl`,
    'set -euo pipefail',
    '',
    `BASE_URL="\${PAYWARE_BASE_URL:-${DEFAULT_BASE[spec.base]}}"`,
    ...inputs(spec).map(i => `${upper(i.name)}="\${${upper(i.name)}:-${i.sample}}"`),
    spec.body && c && '# The exact string that is hashed into the JWT and sent',
    spec.body && `BODY=${singleQuotedShell(compactJson(spec.body))}`,
    '',
    curlJwt(spec, c),
    '',
    `curl -sS${method} "${base}${path}" \\`,
    '  -H "Authorization: Bearer $JWT" \\',
    spec.body && '  -H "Content-Type: application/json" \\',
    '  -H "Api-Version: 1" \\',
    spec.body && '  --data-binary "$BODY" \\',
    spec.multipart && `  -F "${spec.multipart.field}=@\${${upper(spec.multipart.param)}}" \\`,
    eh && '  --fail-with-body \\',
    "  -w '\\nHTTP status: %{http_code}\\n'"
  );
}

const RENDERERS = {
  python: pythonRequest,
  nodejs: nodeRequest,
  php: phpRequest,
  java: javaRequest,
  csharp: csharpRequest,
  curl: curlRequest
};

/** One request as a complete program. */
export function renderRequest(language, spec, partnerType, { includeComments = true, includeErrorHandling = true } = {}) {
  const render = RENDERERS[language];
  if (!render) throw new Error(`Unsupported language: ${language}`);
  return render(spec, partnerType, includeComments, includeErrorHandling);
}

/**
 * The authentication example: the JWT helper on its own, with what it reads and a line that uses it.
 * An ISV's helper also signs on behalf of a merchant.
 */
export function renderAuthentication(language, partnerType, { includeComments = true } = {}) {
  const c = includeComments;
  const isv = partnerType === 'isv';
  const env = lines(
    'PAYWARE_PARTNER_ID        your partner id',
    'PAYWARE_PRIVATE_KEY_PATH  your RSA private key, PKCS#8 PEM (openssl pkcs8 -topk8 -nocrypt)',
    'PAYWARE_BASE_URL          optional: https://sandbox.payware.eu/api (default) or https://api.payware.eu/api',
    isv && 'PAYWARE_MERCHANT_PARTNER_ID, PAYWARE_OAUTH2_TOKEN  for a call made on behalf of a merchant'
  ).split('\n').map(l => comment(language, l));
  const intro = c ? [comment(language, `payware JWT authentication - ${language}`), ...env, ''] : [];
  const usage = isv
    ? 'a token for a call on behalf of a merchant, and one for the ISV itself (the /oauth2 endpoints)'
    : 'a token for a request without a body, such as a GET';

  switch (language) {
    case 'python':
      return lines(
        ...intro.slice(0, 1), c && '# pip install pyjwt cryptography', ...intro.slice(1),
        'import base64', 'import hashlib', 'import os', 'import time', '', 'import jwt', '', '',
        pythonJwt(isv, c), '', '',
        'if __name__ == "__main__":',
        c && `    # ${usage}`,
        isv ? '    print(create_jwt_token(None, os.environ["PAYWARE_MERCHANT_PARTNER_ID"], os.environ["PAYWARE_OAUTH2_TOKEN"]))' : null,
        '    print(create_jwt_token(None))'
      );
    case 'nodejs':
      return lines(
        ...intro.slice(0, 1), c && '// npm install jsonwebtoken', ...intro.slice(1),
        "const crypto = require('crypto');", "const fs = require('fs');", "const jwt = require('jsonwebtoken');", '',
        nodeJwt(isv, c), '',
        c && `// ${usage}`,
        isv ? 'console.log(createJwtToken(null, process.env.PAYWARE_MERCHANT_PARTNER_ID, process.env.PAYWARE_OAUTH2_TOKEN));' : null,
        'console.log(createJwtToken(null));',
        '',
        'module.exports = { createJwtToken };'
      );
    case 'php':
      return lines(
        '<?php', ...intro.slice(0, 1), c && '// composer require firebase/php-jwt', ...intro.slice(1),
        "require __DIR__ . '/vendor/autoload.php';", '', 'use Firebase\\JWT\\JWT;', '',
        phpJwt(isv, c), '',
        c && `// ${usage}`,
        isv ? "echo createJwtToken(null, getenv('PAYWARE_MERCHANT_PARTNER_ID'), getenv('PAYWARE_OAUTH2_TOKEN')), PHP_EOL;" : null,
        'echo createJwtToken(null), PHP_EOL;'
      );
    case 'java':
      return lines(
        ...intro,
        'import java.nio.charset.StandardCharsets;', 'import java.nio.file.Files;', 'import java.nio.file.Path;',
        'import java.security.KeyFactory;', 'import java.security.MessageDigest;', 'import java.security.Signature;',
        'import java.security.spec.PKCS8EncodedKeySpec;', 'import java.util.Base64;', '',
        'public class PaywareJwt {',
        '    public static void main(String[] args) throws Exception {',
        c && `        // ${usage}`,
        isv ? '        System.out.println(createJwtToken(null, System.getenv("PAYWARE_MERCHANT_PARTNER_ID"), System.getenv("PAYWARE_OAUTH2_TOKEN")));' : null,
        `        System.out.println(createJwtToken(null${isv ? ', null, null' : ''}));`,
        '    }', '',
        javaJwt(isv, c),
        '}'
      );
    case 'csharp':
      return lines(
        ...intro,
        'using System;', 'using System.IO;', 'using System.Security.Cryptography;', 'using System.Text;', '',
        'public static class PaywareJwt',
        '{',
        '    public static void Main()',
        '    {',
        c && `        // ${usage}`,
        isv ? '        Console.WriteLine(CreateJwtToken(null, Environment.GetEnvironmentVariable("PAYWARE_MERCHANT_PARTNER_ID"), Environment.GetEnvironmentVariable("PAYWARE_OAUTH2_TOKEN")));' : null,
        '        Console.WriteLine(CreateJwtToken(null));',
        '    }', '',
        csharpJwt(isv, c),
        '}'
      );
    case 'curl':
      return lines(
        '#!/bin/bash', ...intro, 'set -euo pipefail', '',
        c && `# ${isv ? 'A token for a GET on behalf of a merchant' : 'A token for a request without a body, such as a GET'}`,
        curlJwt({ body: null, onBehalf: isv }, c),
        'echo "$JWT"'
      );
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}
