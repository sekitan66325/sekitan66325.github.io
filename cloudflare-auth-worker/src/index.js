/**
 * Moka Railway - FIDO2 / WebAuthn Passkey Authentication Gateway
 * Cloudflare Worker with Native Web Crypto API & GitHub Direct Commit
 * 
 * Features:
 * - Enterprise-grade Passkey (WebAuthn) passwordless authentication (Face ID / Touch ID / Windows Hello)
 * - Zero external npm dependencies: runs purely on V8 Isolates & Web Standards
 * - Direct GitHub API integration using encrypted Cloudflare Secrets (protects GitHub PAT)
 * - Eliminates public Google Apps Script vulnerability for admin write operations
 * - Stateless HMAC-SHA256 signed JWT session tokens
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CORS Preflight & Headers
    const corsHeaders = getCorsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // 2. Health Check
      if (url.pathname === "/api/health") {
        return jsonResponse({
          status: "ok",
          service: "moka-auth-worker",
          timestamp: new Date().toISOString(),
          rpId: env.RP_ID || "sekitan66325.github.io"
        }, 200, corsHeaders);
      }

      // 3. WebAuthn Registration Options (Generate Challenge)
      if (url.pathname === "/api/auth/register-options" && request.method === "POST") {
        return await handleRegisterOptions(request, env, corsHeaders);
      }

      // 4. WebAuthn Registration Verify (Register Passkey)
      if (url.pathname === "/api/auth/register-verify" && request.method === "POST") {
        return await handleRegisterVerify(request, env, corsHeaders);
      }

      // 5. WebAuthn Login Options (Generate Challenge)
      if (url.pathname === "/api/auth/login-options" && request.method === "POST") {
        return await handleLoginOptions(request, env, corsHeaders);
      }

      // 6. WebAuthn Login Verify (Authenticate User)
      if (url.pathname === "/api/auth/login-verify" && request.method === "POST") {
        return await handleLoginVerify(request, env, corsHeaders);
      }

      // 7. Verify Existing Session Token
      if (url.pathname === "/api/auth/verify-token" && request.method === "POST") {
        return await handleVerifyToken(request, env, corsHeaders);
      }

      // 8. List Registered Passkey Devices (Requires Valid Admin JWT)
      if (url.pathname === "/api/admin/passkeys" && request.method === "GET") {
        return await handleListPasskeys(request, env, corsHeaders);
      }

      // 9. Delete Registered Passkey Device (Requires Valid Admin JWT)
      if (url.pathname.startsWith("/api/admin/passkeys/") && request.method === "DELETE") {
        const credId = url.pathname.replace("/api/admin/passkeys/", "");
        return await handleDeletePasskey(credId, request, env, corsHeaders);
      }

      // 10. Direct GitHub Save File (Requires Valid Admin JWT)
      if (url.pathname === "/api/admin/save-file" && request.method === "POST") {
        return await handleSaveFileToGitHub(request, env, corsHeaders);
      }

      return jsonResponse({ error: "Endpoint not found" }, 404, corsHeaders);
    } catch (err) {
      console.error("Worker Execution Error:", err);
      return jsonResponse({ error: err.message || "Internal server error" }, 500, corsHeaders);
    }
  }
};

/* ==========================================================================
   CORS & HTTP Utilities
   ========================================================================== */

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = [
    "https://sekitan66325.github.io",
    "http://localhost:8080",
    "http://localhost:8089",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8089",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];

  let allowOrigin = "https://sekitan66325.github.io";
  if (allowed.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

/* ==========================================================================
   KV Storage Wrapper (With graceful fallback for dev testing)
   ========================================================================== */

const memoryStore = new Map();

async function kvGet(env, key, type = "text") {
  if (env.PASSKEY_KV) {
    if (type === "json") return await env.PASSKEY_KV.get(key, "json");
    return await env.PASSKEY_KV.get(key);
  }
  const val = memoryStore.get(key);
  if (!val) return null;
  if (type === "json") return JSON.parse(val);
  return val;
}

async function kvPut(env, key, val, options = {}) {
  const str = typeof val === "string" ? val : JSON.stringify(val);
  if (env.PASSKEY_KV) {
    await env.PASSKEY_KV.put(key, str, options);
  } else {
    memoryStore.set(key, str);
  }
}

async function kvDelete(env, key) {
  if (env.PASSKEY_KV) {
    await env.PASSKEY_KV.delete(key);
  } else {
    memoryStore.delete(key);
  }
}

/* ==========================================================================
   WebAuthn Core Handlers
   ========================================================================== */

function getRpId(request, env) {
  const origin = request.headers.get("Origin") || "";
  const host = request.headers.get("Host") || "";
  if (origin.includes("localhost") || origin.includes("127.0.0.1") || host.includes("localhost") || host.includes("127.0.0.1")) {
    return "localhost";
  }
  return env.RP_ID || "sekitan66325.github.io";
}

/**
 * 1. Register Options: Generate Challenge for navigator.credentials.create
 */
async function handleRegisterOptions(request, env, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const setupKey = body.setupKey || "";
  const authHeader = request.headers.get("Authorization") || "";

  // Security Check:
  // If registered credentials already exist, registering an additional passkey requires an active admin session JWT.
  // If no credentials exist yet, registration requires ADMIN_SETUP_KEY (or allows initial dev setup).
  const credsList = (await kvGet(env, "passkey:credentials_list", "json")) || [];
  if (credsList.length > 0) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const verified = await verifyJwt(token, env);
    if (!verified) {
      return jsonResponse({ error: "新しいパスキーの追加登録には、既存の管理者権限（ログイン済みセッション）が必要です。" }, 401, corsHeaders);
    }
  } else {
    const requiredSetupKey = env.ADMIN_SETUP_KEY || "";
    if (requiredSetupKey && setupKey !== requiredSetupKey) {
      return jsonResponse({ error: "初期マスターパスキーの登録キー（ADMIN_SETUP_KEY）が一致しません。" }, 403, corsHeaders);
    }
  }

  const rpId = getRpId(request, env);
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = base64UrlEncode(challengeBytes);

  // Store challenge in KV with 120s TTL
  await kvPut(env, `challenge:reg:${challengeB64}`, "pending", { expirationTtl: 120 });

  const userId = base64UrlEncode(new TextEncoder().encode("moka-admin-user"));

  const options = {
    challenge: challengeB64,
    rp: {
      name: env.RP_NAME || "真岡鐵道 運行管理パネル",
      id: rpId
    },
    user: {
      id: userId,
      name: "admin@mokarailway.local",
      displayName: "真岡線 運行管理者"
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 } // ES256 (ECDSA P-256)
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred"
    },
    timeout: 60000,
    attestation: "none"
  };

  return jsonResponse(options, 200, corsHeaders);
}

/**
 * 2. Register Verify: Verify navigator.credentials.create and store Public Key
 */
async function handleRegisterVerify(request, env, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const { id, rawId, response, deviceName } = body;
  if (!response || !response.clientDataJSON || !response.attestationObject) {
    return jsonResponse({ error: "Invalid WebAuthn registration payload" }, 400, corsHeaders);
  }

  // Parse clientDataJSON
  const clientDataRaw = base64UrlDecode(response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataRaw));

  if (clientData.type !== "webauthn.create") {
    return jsonResponse({ error: "Invalid clientData type: expected webauthn.create" }, 400, corsHeaders);
  }

  // Verify challenge
  const challengeKey = `challenge:reg:${clientData.challenge}`;
  const challengeStatus = await kvGet(env, challengeKey);
  if (!challengeStatus) {
    return jsonResponse({ error: "Challenge expired or invalid" }, 400, corsHeaders);
  }
  await kvDelete(env, challengeKey); // Prevent replay

  // Parse attestationObject (CBOR)
  const attestationBytes = base64UrlDecode(response.attestationObject);
  const attestationMap = decodeCbor(attestationBytes);
  const authData = attestationMap.get("authData");
  if (!authData || !(authData instanceof Uint8Array)) {
    return jsonResponse({ error: "Invalid authData in attestationObject" }, 400, corsHeaders);
  }

  // Parse authData:
  // [0..32]: rpIdHash, [32]: flags, [33..37]: signCount, [37..53]: aaguid, [53..55]: credIdLen
  const flags = authData[32];
  const up = (flags & 0x01) !== 0; // User Present
  const at = (flags & 0x40) !== 0; // Attested Credential Data
  if (!up || !at) {
    return jsonResponse({ error: "Authenticator flags check failed: UP or AT missing" }, 400, corsHeaders);
  }

  const signCount = (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36];
  const credIdLen = (authData[53] << 8) | authData[54];
  const credentialIdBytes = authData.slice(55, 55 + credIdLen);
  const credentialId = base64UrlEncode(credentialIdBytes);

  const coseKeyBytes = authData.slice(55 + credIdLen);
  const coseKey = decodeCbor(coseKeyBytes);

  // COSE Key validation:
  // 1: kty (2 = EC2), 3: alg (-7 = ES256), -1: crv (1 = P-256), -2: x (32 bytes), -3: y (32 bytes)
  const kty = coseKey.get(1);
  const alg = coseKey.get(3);
  const crv = coseKey.get(-1);
  const x = coseKey.get(-2);
  const y = coseKey.get(-3);

  if (kty !== 2 || alg !== -7 || crv !== 1 || !x || !y || x.length !== 32 || y.length !== 32) {
    return jsonResponse({ error: "Unsupported key algorithm: only ES256 (P-256) is accepted" }, 400, corsHeaders);
  }

  // Raw uncompressed public key: 0x04 + x + y (65 bytes)
  const rawPubKey = new Uint8Array(65);
  rawPubKey[0] = 0x04;
  rawPubKey.set(x, 1);
  rawPubKey.set(y, 33);
  const rawPubKeyHex = bufToHex(rawPubKey);

  // Store credential record
  const credRecord = {
    id: credentialId,
    rawPubKeyHex,
    xHex: bufToHex(x),
    yHex: bufToHex(y),
    signCount,
    deviceName: (deviceName || "登録端末 (WebAuthn)").trim(),
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString()
  };

  await kvPut(env, `passkey:cred:${credentialId}`, credRecord);

  // Update credentials index list
  const credsList = (await kvGet(env, "passkey:credentials_list", "json")) || [];
  if (!credsList.includes(credentialId)) {
    credsList.push(credentialId);
    await kvPut(env, "passkey:credentials_list", credsList);
  }

  // Generate signed admin JWT session token
  const token = await createJwt({
    sub: "admin",
    role: "superadmin",
    credId: credentialId,
    deviceName: credRecord.deviceName
  }, env);

  return jsonResponse({
    status: "success",
    message: "パスキーが正常に登録されました。",
    token,
    credential: {
      id: credentialId,
      deviceName: credRecord.deviceName,
      createdAt: credRecord.createdAt
    }
  }, 200, corsHeaders);
}

/**
 * 3. Login Options: Generate Challenge for navigator.credentials.get
 */
async function handleLoginOptions(request, env, corsHeaders) {
  const rpId = getRpId(request, env);
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = base64UrlEncode(challengeBytes);

  await kvPut(env, `challenge:auth:${challengeB64}`, "pending", { expirationTtl: 120 });

  const credsList = (await kvGet(env, "passkey:credentials_list", "json")) || [];
  const allowCredentials = credsList.map(id => ({
    type: "public-key",
    id: id
  }));

  const options = {
    challenge: challengeB64,
    rpId: rpId,
    allowCredentials,
    userVerification: "preferred",
    timeout: 60000
  };

  return jsonResponse(options, 200, corsHeaders);
}

/**
 * 4. Login Verify: Authenticate user assertion signature
 */
async function handleLoginVerify(request, env, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const { id, response } = body;
  if (!id || !response || !response.clientDataJSON || !response.authenticatorData || !response.signature) {
    return jsonResponse({ error: "Invalid WebAuthn assertion payload" }, 400, corsHeaders);
  }

  // Fetch stored credential
  const credRecord = await kvGet(env, `passkey:cred:${id}`, "json");
  if (!credRecord) {
    return jsonResponse({ error: "登録されていないパスキーです。" }, 401, corsHeaders);
  }

  // Parse clientDataJSON
  const clientDataRaw = base64UrlDecode(response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataRaw));

  if (clientData.type !== "webauthn.get") {
    return jsonResponse({ error: "Invalid clientData type: expected webauthn.get" }, 400, corsHeaders);
  }

  // Verify challenge
  const challengeKey = `challenge:auth:${clientData.challenge}`;
  const challengeStatus = await kvGet(env, challengeKey);
  if (!challengeStatus) {
    return jsonResponse({ error: "Challenge expired or invalid" }, 400, corsHeaders);
  }
  await kvDelete(env, challengeKey);

  // Parse authenticatorData
  const authData = base64UrlDecode(response.authenticatorData);
  const flags = authData[32];
  const up = (flags & 0x01) !== 0; // User Present
  if (!up) {
    return jsonResponse({ error: "User presence verification failed" }, 400, corsHeaders);
  }

  const signCount = (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36];
  if (signCount > 0 && credRecord.signCount > 0 && signCount <= credRecord.signCount) {
    console.warn("Possible cloned authenticator detected: signCount <= stored count");
  }

  // Convert ASN.1 DER signature to IEEE P1363 (64 bytes: r + s)
  const derSignature = base64UrlDecode(response.signature);
  const p1363Sig = derToP1363(derSignature);

  // Compute signed payload: authData || SHA-256(clientDataJSON)
  const clientHash = await crypto.subtle.digest("SHA-256", clientDataRaw);
  const signedPayload = new Uint8Array(authData.length + clientHash.byteLength);
  signedPayload.set(authData, 0);
  signedPayload.set(new Uint8Array(clientHash), authData.length);

  // Import public key into Web Crypto
  const rawPubKey = hexToBuf(credRecord.rawPubKeyHex);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawPubKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  // Verify signature
  const isValid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    p1363Sig,
    signedPayload
  );

  if (!isValid) {
    return jsonResponse({ error: "生体認証署名の検証に失敗しました。" }, 401, corsHeaders);
  }

  // Update signCount and lastUsedAt
  credRecord.signCount = signCount;
  credRecord.lastUsedAt = new Date().toISOString();
  await kvPut(env, `passkey:cred:${id}`, credRecord);

  // Issue signed admin session JWT
  const token = await createJwt({
    sub: "admin",
    role: "superadmin",
    credId: id,
    deviceName: credRecord.deviceName
  }, env);

  return jsonResponse({
    status: "success",
    message: "パスキーによる認証に成功しました。",
    token,
    deviceName: credRecord.deviceName
  }, 200, corsHeaders);
}

/**
 * 5. Verify Token
 */
async function handleVerifyToken(request, env, corsHeaders) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = await verifyJwt(token, env);
  if (!payload) {
    return jsonResponse({ valid: false, message: "Token expired or invalid" }, 401, corsHeaders);
  }
  return jsonResponse({ valid: true, payload }, 200, corsHeaders);
}

/**
 * 6. List Passkeys
 */
async function handleListPasskeys(request, env, corsHeaders) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = await verifyJwt(token, env);
  if (!payload) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  const credsList = (await kvGet(env, "passkey:credentials_list", "json")) || [];
  const result = [];
  for (const credId of credsList) {
    const rec = await kvGet(env, `passkey:cred:${credId}`, "json");
    if (rec) {
      result.push({
        id: rec.id,
        deviceName: rec.deviceName,
        createdAt: rec.createdAt,
        lastUsedAt: rec.lastUsedAt
      });
    }
  }

  return jsonResponse({ status: "success", passkeys: result }, 200, corsHeaders);
}

/**
 * 7. Delete Passkey
 */
async function handleDeletePasskey(credId, request, env, corsHeaders) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = await verifyJwt(token, env);
  if (!payload) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  await kvDelete(env, `passkey:cred:${credId}`);
  let credsList = (await kvGet(env, "passkey:credentials_list", "json")) || [];
  credsList = credsList.filter(id => id !== credId);
  await kvPut(env, "passkey:credentials_list", credsList);

  return jsonResponse({ status: "success", message: "パスキーを削除しました。" }, 200, corsHeaders);
}

/**
 * 8. Save File directly to GitHub via GitHub REST API
 */
async function handleSaveFileToGitHub(request, env, corsHeaders) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = await verifyJwt(token, env);
  if (!payload) {
    return jsonResponse({ error: "認証が必要です。再ログインしてください。" }, 401, corsHeaders);
  }

  const pat = env.GITHUB_PAT;
  if (!pat) {
    return jsonResponse({ error: "GITHUB_PAT が Cloudflare Worker のシークレットに設定されていません。" }, 500, corsHeaders);
  }

  const body = await request.json().catch(() => ({}));
  const { path, content, message } = body;
  if (!path || content == null) {
    return jsonResponse({ error: "Missing path or content" }, 400, corsHeaders);
  }

  const owner = env.GITHUB_OWNER || "sekitan66325";
  const repo = env.GITHUB_REPO || "sekitan66325.github.io";
  const branch = env.GITHUB_BRANCH || "main";

  // 1. Get current file SHA from GitHub
  const getFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const getRes = await fetch(getFileUrl, {
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Moka-Auth-Worker"
    }
  });

  let sha = undefined;
  if (getRes.status === 200) {
    const existing = await getRes.json();
    sha = existing.sha;
  } else if (getRes.status !== 404) {
    const errText = await getRes.text();
    return jsonResponse({ error: `GitHub API error fetching file: ${errText}` }, 500, corsHeaders);
  }

  // 2. Commit file via PUT
  const commitUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const utf8Bytes = new TextEncoder().encode(typeof content === "string" ? content : JSON.stringify(content, null, 2));
  const base64Content = uint8ArrayToBase64(utf8Bytes);

  const putBody = {
    message: message || `Update ${path} via Admin Passkey`,
    content: base64Content,
    branch: branch,
    committer: {
      name: "Moka Admin (Passkey)",
      email: "admin@mokarailway.local"
    }
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(commitUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "Moka-Auth-Worker"
    },
    body: JSON.stringify(putBody)
  });

  const putResult = await putRes.json();
  if (putRes.status === 200 || putRes.status === 201) {
    return jsonResponse({
      status: "success",
      message: `${path} のGitHub直接反映に成功しました。`,
      commit: putResult.commit
    }, 200, corsHeaders);
  } else {
    return jsonResponse({
      error: `GitHubへのコミットに失敗しました: ${putResult.message || "Unknown error"}`
    }, 500, corsHeaders);
  }
}

/* ==========================================================================
   JWT Creation & Verification (HMAC-SHA256 via Web Crypto)
   ========================================================================== */

async function getJwtKey(env) {
  const secret = env.JWT_SECRET || "moka-default-development-jwt-secret-key-32bytes";
  const enc = new TextEncoder().encode(secret);
  return await crypto.subtle.importKey(
    "raw",
    enc,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createJwt(payload, env) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + 86400 * 7 // 7 days validity
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const dataToSign = `${headerB64}.${payloadB64}`;

  const key = await getJwtKey(env);
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dataToSign));
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBytes));

  return `${dataToSign}.${signatureB64}`;
}

async function verifyJwt(token, env) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const dataToVerify = `${headerB64}.${payloadB64}`;
  const sigBytes = base64UrlDecode(sigB64);

  const key = await getJwtKey(env);
  const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(dataToVerify));
  if (!isValid) return null;

  try {
    const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadStr);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/* ==========================================================================
   Binary & ASN.1 DER to IEEE P1363 Conversion
   ========================================================================== */

function derToP1363(der) {
  if (der[0] !== 0x30) throw new Error("Invalid ASN.1 DER: missing sequence header");
  let idx = 2;
  if (der[1] & 0x80) {
    idx += (der[1] & 0x7F);
  }

  // Parse r
  if (der[idx] !== 0x02) throw new Error("Invalid ASN.1 DER: expected INTEGER for r");
  const rLen = der[idx + 1];
  idx += 2;
  let r = der.slice(idx, idx + rLen);
  idx += rLen;
  if (r.length === 33 && r[0] === 0x00) r = r.slice(1);
  if (r.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(r, 32 - r.length);
    r = padded;
  }

  // Parse s
  if (der[idx] !== 0x02) throw new Error("Invalid ASN.1 DER: expected INTEGER for s");
  const sLen = der[idx + 1];
  idx += 2;
  let s = der.slice(idx, idx + sLen);
  if (s.length === 33 && s[0] === 0x00) s = s.slice(1);
  if (s.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(s, 32 - s.length);
    s = padded;
  }

  const p1363 = new Uint8Array(64);
  p1363.set(r, 0);
  p1363.set(s, 32);
  return p1363;
}

/* ==========================================================================
   CBOR Decoder (RFC 8949 Minimal WebAuthn Support)
   ========================================================================== */

function decodeCbor(bytes) {
  let offset = 0;

  function readUint8() {
    if (offset >= bytes.length) throw new Error("CBOR EOF");
    return bytes[offset++];
  }

  function readBytes(len) {
    if (offset + len > bytes.length) throw new Error("CBOR unexpected EOF");
    const slice = bytes.slice(offset, offset + len);
    offset += len;
    return slice;
  }

  function readLength(info) {
    if (info < 24) return info;
    if (info === 24) return readUint8();
    if (info === 25) {
      const b = readBytes(2);
      return (b[0] << 8) | b[1];
    }
    if (info === 26) {
      const b = readBytes(4);
      return ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
    }
    throw new Error(`Unsupported CBOR length indicator: ${info}`);
  }

  function decodeItem() {
    const byte = readUint8();
    const majorType = byte >> 5;
    const additionalInfo = byte & 0x1F;

    if (majorType === 0) {
      return readLength(additionalInfo);
    } else if (majorType === 1) {
      return -1 - readLength(additionalInfo);
    } else if (majorType === 2) {
      const len = readLength(additionalInfo);
      return readBytes(len);
    } else if (majorType === 3) {
      const len = readLength(additionalInfo);
      return new TextDecoder().decode(readBytes(len));
    } else if (majorType === 4) {
      const len = readLength(additionalInfo);
      const arr = [];
      for (let i = 0; i < len; i++) arr.push(decodeItem());
      return arr;
    } else if (majorType === 5) {
      const len = readLength(additionalInfo);
      const map = new Map();
      for (let i = 0; i < len; i++) {
        const k = decodeItem();
        const v = decodeItem();
        map.set(k, v);
      }
      return map;
    } else if (majorType === 6) {
      readLength(additionalInfo);
      return decodeItem();
    } else if (majorType === 7) {
      if (additionalInfo === 20) return false;
      if (additionalInfo === 21) return true;
      if (additionalInfo === 22) return null;
      if (additionalInfo === 23) return undefined;
      return null;
    }
    throw new Error(`Unknown CBOR major type: ${majorType}`);
  }

  return decodeItem();
}

/* ==========================================================================
   Base64URL & Hex Encoding Helpers
   ========================================================================== */

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bufToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

