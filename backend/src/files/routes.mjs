import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { HttpError, methodNotAllowed, sendJson } from "../http.mjs";

const FILE_DETAIL_RE = /^\/api\/files\/([^/]+)$/;
const FILE_SIGNATURES = [
  { extension: ".png", mimeType: "image/png", matches: (body) => body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { extension: ".jpg", mimeType: "image/jpeg", matches: (body) => body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff },
  { extension: ".jpeg", mimeType: "image/jpeg", matches: (body) => body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff },
  { extension: ".webp", mimeType: "image/webp", matches: (body) => body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP" },
  { extension: ".gif", mimeType: "image/gif", matches: (body) => ["GIF87a", "GIF89a"].includes(body.subarray(0, 6).toString("ascii")) },
  { extension: ".pdf", mimeType: "application/pdf", matches: (body) => body.subarray(0, 5).toString("ascii") === "%PDF-" },
  { extension: ".txt", mimeType: "text/plain", matches: (body) => isLikelyText(body) },
  { extension: ".doc", mimeType: "application/msword", matches: (body) => body.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) },
  { extension: ".docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", matches: (body) => body[0] === 0x50 && body[1] === 0x4b && body[2] === 0x03 && body[3] === 0x04 }
];

export async function handleFileRoutes({ request, response, url, authService, config }) {
  if (url.pathname === "/api/files") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user", "admin", "super_admin"]);
    const payload = await receiveMultipartFile(request, config);
    const asset = await saveAsset(authService.store, config, context.user.userId, payload);
    sendJson(response, 201, { file: fileDto(asset) });
    return true;
  }

  const match = url.pathname.match(FILE_DETAIL_RE);
  if (match) {
    allowOnly(request, response, ["GET", "HEAD"]);
    const asset = await findVisibleAsset(authService.store, match[1], request, authService);
    await streamAsset(response, request.method === "HEAD", asset);
    return true;
  }

  return false;
}

async function saveAsset(store, config, userId, payload) {
  if (typeof store.createFileAsset !== "function") {
    throw new HttpError(500, "FILE_STORE_UNAVAILABLE", "File persistence is not available.");
  }
  const fileId = crypto.randomUUID();
  const extension = safeExtension(payload.filename);
  const relativeDir = path.join(String(userId), new Date().toISOString().slice(0, 10));
  const targetDir = path.join(config.upload.root, relativeDir);
  await fs.mkdir(targetDir, { recursive: true });
  const storagePath = path.join(targetDir, `${fileId}${extension}`);
  await fs.writeFile(storagePath, payload.file);
  return store.createFileAsset({
    fileId,
    ownerId: userId,
    purpose: payload.fields.purpose ?? "general",
    businessType: payload.fields.businessType ?? null,
    businessId: payload.fields.businessId ?? null,
    visibility: normalizeVisibility(payload.fields.visibility, payload.fields.purpose),
    originalName: payload.filename,
    storagePath,
    mimeType: payload.mimeType,
    sizeBytes: payload.file.length
  });
}

async function findVisibleAsset(store, fileId, request, authService) {
  if (typeof store.findFileAssetById !== "function") {
    throw new HttpError(500, "FILE_STORE_UNAVAILABLE", "File persistence is not available.");
  }
  const asset = await store.findFileAssetById(fileId);
  if (!asset) {
    throw new HttpError(404, "FILE_NOT_FOUND", "File was not found.");
  }
  if (asset.visibility === "public") {
    return asset;
  }
  const context = await authService.authenticateRequest(request);
  if (["admin", "super_admin"].includes(context.user.role) || Number(asset.ownerId) === Number(context.user.userId)) {
    return asset;
  }
  throw new HttpError(403, "FILE_FORBIDDEN", "You do not have permission to access this file.");
}

async function streamAsset(response, isHead, asset) {
  const body = isHead ? null : await fs.readFile(asset.storagePath);
  const safeName = String(asset.originalName || "file").replace(/["\\]/g, "");
  const encodedName = encodeURIComponent(safeName);
  response.writeHead(200, {
    "content-type": asset.mimeType,
    "content-length": String(asset.sizeBytes),
    "cache-control": "private, no-store",
    "content-disposition": `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`
  });
  response.end(isHead ? undefined : body);
}

async function receiveMultipartFile(request, config) {
  const contentType = request.headers["content-type"] ?? "";
  const boundaryMatch = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new HttpError(400, "MULTIPART_REQUIRED", "File upload must use multipart/form-data.");
  }
  const raw = await readRaw(request, config.upload.maxBytes);
  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  const parsed = parseMultipart(raw, boundary);
  const filePart = parsed.files.get("file");
  if (!filePart) {
    throw new HttpError(400, "FILE_REQUIRED", "Multipart field file is required.");
  }
  validateFile(filePart, config);
  return {
    file: filePart.body,
    filename: filePart.filename,
    mimeType: filePart.contentType,
    fields: Object.fromEntries(parsed.fields)
  };
}

async function readRaw(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new HttpError(413, "FILE_TOO_LARGE", "Uploaded file is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = new Map();
  const files = new Map();
  let position = buffer.indexOf(delimiter);
  while (position !== -1) {
    position += delimiter.length;
    if (buffer.slice(position, position + 2).toString() === "--") {
      break;
    }
    if (buffer.slice(position, position + 2).toString() === "\r\n") {
      position += 2;
    }
    const next = buffer.indexOf(delimiter, position);
    if (next === -1) {
      break;
    }
    const part = trimTrailingCrlf(buffer.slice(position, next));
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = parsePartHeaders(part.slice(0, headerEnd).toString("utf8"));
      const body = part.slice(headerEnd + 4);
      const disposition = headers.get("content-disposition") ?? "";
      const name = /name="([^"]+)"/.exec(disposition)?.[1];
      const filename = /filename="([^"]*)"/.exec(disposition)?.[1];
      if (name && filename !== undefined) {
        files.set(name, {
          filename: path.basename(filename) || "upload.bin",
          contentType: headers.get("content-type") ?? "application/octet-stream",
          body
        });
      } else if (name) {
        fields.set(name, body.toString("utf8"));
      }
    }
    position = next;
  }
  return { fields, files };
}

function parsePartHeaders(text) {
  const headers = new Map();
  for (const line of text.split("\r\n")) {
    const index = line.indexOf(":");
    if (index > 0) {
      headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
    }
  }
  return headers;
}

function validateFile(file, config) {
  const extension = safeExtension(file.filename);
  if (!config.upload.allowedExtensions.includes(extension)) {
    throw new HttpError(400, "FILE_EXTENSION_NOT_ALLOWED", "This file extension is not allowed.");
  }
  if (!config.upload.allowedMimeTypes.includes(file.contentType)) {
    throw new HttpError(400, "FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.");
  }
  if (file.body.length > config.upload.maxBytes) {
    throw new HttpError(413, "FILE_TOO_LARGE", "Uploaded file is too large.");
  }
  const signature = FILE_SIGNATURES.find((item) => item.extension === extension);
  if (!signature || signature.mimeType !== file.contentType || !signature.matches(file.body)) {
    throw new HttpError(400, "FILE_SIGNATURE_MISMATCH", "File extension, MIME type, and content signature do not match.");
  }
}

function isLikelyText(body) {
  if (body.length === 0) {
    return true;
  }
  const sample = body.subarray(0, Math.min(body.length, 4096));
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
      return false;
    }
  }
  return true;
}

function safeExtension(filename) {
  const extension = path.extname(String(filename ?? "")).toLowerCase();
  return extension || ".bin";
}

function trimTrailingCrlf(buffer) {
  return buffer.slice(-2).toString() === "\r\n" ? buffer.slice(0, -2) : buffer;
}

function fileDto(asset) {
  return {
    fileId: asset.fileId,
    ownerId: asset.ownerId,
    purpose: asset.purpose,
    businessType: asset.businessType,
    businessId: asset.businessId,
    visibility: asset.visibility ?? "private",
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    url: `/api/files/${encodeURIComponent(asset.fileId)}`,
    createdAt: asset.createdAt
  };
}

function normalizeVisibility(value, purpose) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "public") {
    return "public";
  }
  if (text === "private") {
    return "private";
  }
  return ["avatar", "request-image", "post-image", "community-post-image", "message-image"].includes(String(purpose ?? "").trim().toLowerCase())
    ? "public"
    : "private";
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}
