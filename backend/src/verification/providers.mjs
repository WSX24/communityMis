import crypto from "node:crypto";
import { HttpError } from "../http.mjs";

export async function sendSmsCode(config, input, code, options = {}) {
  const sms = config?.sms ?? {};
  if (!sms.accessKeyId || !sms.accessKeySecret || !sms.signName || !sms.templateCode) {
    throw new HttpError(503, "SMS_PROVIDER_NOT_CONFIGURED", "SMS provider is not configured.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new HttpError(503, "SMS_PROVIDER_NOT_CONFIGURED", "Fetch API is not available for SMS delivery.");
  }

  const params = {
    AccessKeyId: sms.accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: input.recipient,
    RegionId: sms.regionId ?? "cn-hangzhou",
    SignName: sms.signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    TemplateCode: sms.templateCode,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25"
  };
  params.Signature = aliyunSignature(params, sms.accessKeySecret);

  const response = await fetchImpl(`https://dysmsapi.aliyuncs.com/?${formEncode(params)}`, {
    method: "GET"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.Code !== "OK") {
    const error = new HttpError(502, "SMS_PROVIDER_ERROR", "SMS provider failed to send verification code.");
    error.providerError = payload.Message ?? response.statusText;
    throw error;
  }
  return {
    status: "sent",
    messageId: payload.BizId ?? payload.RequestId ?? null
  };
}

export async function sendEmailCode(config, input, code) {
  const smtp = config?.smtp ?? {};
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    throw new HttpError(503, "SMTP_NOT_CONFIGURED", "SMTP provider is not configured.");
  }
  ensureSmtpHeaderSafe(smtp.host, "SMTP host");
  ensureSmtpHeaderSafe(smtp.from, "SMTP from");
  ensureSmtpHeaderSafe(input.recipient, "Email recipient");

  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch (error) {
    const notConfigured = new HttpError(503, "SMTP_NOT_CONFIGURED", `nodemailer is required for SMTP delivery. ${error.message}`);
    throw notConfigured;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: Boolean(smtp.secure),
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  });
  try {
    const result = await transporter.sendMail({
      from: smtp.from,
      to: {
        address: input.recipient
      },
      subject: "邻帮注册验证码",
      text: `您的邻帮注册验证码是 ${code}，10 分钟内有效。`,
      html: `<p>您的邻帮注册验证码是 <strong>${escapeHtml(code)}</strong>，10 分钟内有效。</p>`
    });
    return {
      status: "sent",
      messageId: result.messageId ?? null
    };
  } catch (error) {
    const providerError = new HttpError(502, "SMTP_PROVIDER_ERROR", "SMTP provider failed to send verification code.");
    providerError.providerError = error.message;
    throw providerError;
  }
}

function ensureSmtpHeaderSafe(value, label) {
  if (/[\r\n]/.test(String(value ?? ""))) {
    throw new HttpError(400, "INVALID_SMTP_VALUE", `${label} contains invalid characters.`);
  }
}

function aliyunSignature(params, accessKeySecret) {
  const canonicalized = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `GET&%2F&${percentEncode(canonicalized)}`;
  return crypto
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");
}

function formEncode(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
