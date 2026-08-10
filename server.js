import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_SHORTCODE = "174379",
  MPESA_PASSKEY,
  MPESA_CALLBACK_URL,
  MPESA_ENV = "sandbox",
  PORT = 3000,
} = process.env;

const baseUrl =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// Simple in-memory payment store for checking callback results
const payments = new Map();

function timestamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function stkPassword(shortcode, passkey, ts) {
  return Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
}

function normalizePhone(phone) {
  let p = String(phone || "").trim().replace(/[^\d+]/g, "");

  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = `254${p.slice(1)}`;
  if (p.startsWith("7") && p.length === 9) p = `254${p}`;

  if (!/^2547\d{8}$/.test(p)) {
    throw new Error("Phone must be a valid Kenyan Safaricom number like 2547XXXXXXXX or 07XXXXXXXX");
  }

  return p;
}

async function getAccessToken() {
  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    throw new Error("Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET");
  }

  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");

  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.errorMessage || "Unable to generate access token");
  }

  return data.access_token;
}

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/mpesa/stkpush", async (req, res) => {
  try {
    const { phone, amount, accountReference = "Goldbizna", description = "POS Payment" } = req.body || {};

    if (!MPESA_PASSKEY) {
      return res.status(400).json({
        success: false,
        message: "Missing MPESA_PASSKEY in .env",
      });
    }

    if (!MPESA_CALLBACK_URL) {
      return res.status(400).json({
        success: false,
        message: "Missing MPESA_CALLBACK_URL in .env",
      });
    }

    const normalizedPhone = normalizePhone(phone);
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number greater than 0",
      });
    }

    const token = await getAccessToken();
    const ts = timestamp();

    const payload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: stkPassword(MPESA_SHORTCODE, MPESA_PASSKEY, ts),
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(numericAmount),
      PartyA: normalizedPhone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: normalizedPhone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: String(accountReference).slice(0, 12),
      TransactionDesc: String(description).slice(0, 100),
    };

    const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: data.errorMessage || data.errorCode || "STK push request failed",
        data,
      });
    }

    const checkoutRequestID = data.CheckoutRequestID;
    if (checkoutRequestID) {
      payments.set(checkoutRequestID, {
        status: "PENDING",
        phone: normalizedPhone,
        amount: Math.round(numericAmount),
        accountReference,
        description,
        mpesaReceiptNumber: null,
        resultCode: null,
        resultDesc: null,
        raw: data,
        updatedAt: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      message: "STK push sent",
      checkoutRequestID,
      merchantRequestID: data.MerchantRequestID,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "STK push failed",
    });
  }
});

app.post("/api/mpesa/callback", (req, res) => {
  try {
    const stk = req.body?.Body?.stkCallback;
    if (!stk) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback" });
    }

    const checkoutRequestID = stk.CheckoutRequestID;
    const resultCode = stk.ResultCode;
    const resultDesc = stk.ResultDesc;

    const metadata = {};
    const items = stk.CallbackMetadata?.Item || [];
    for (const item of items) {
      if (item && item.Name) metadata[item.Name] = item.Value ?? true;
    }

    const previous = payments.get(checkoutRequestID) || {};
    const updatedRecord = {
      ...previous,
      status: resultCode === 0 ? "SUCCESS" : "FAILED",
      resultCode,
      resultDesc,
      mpesaReceiptNumber: metadata.MpesaReceiptNumber || null,
      phone: metadata.PhoneNumber || previous.phone || null,
      amount: metadata.Amount || previous.amount || null,
      transactionDate: metadata.TransactionDate || null,
      metadata,
      rawCallback: req.body,
      updatedAt: new Date().toISOString(),
    };

    payments.set(checkoutRequestID, updatedRecord);

    console.log("M-Pesa callback saved:", checkoutRequestID, updatedRecord);

    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("Callback error:", error);
    return res.status(500).json({ ResultCode: 1, ResultDesc: "Callback error" });
  }
});

app.get("/api/mpesa/status/:checkoutRequestID", (req, res) => {
  const record = payments.get(req.params.checkoutRequestID);

  if (!record) {
    return res.json({ found: false });
  }

  return res.json({
    found: true,
    record,
  });
});

app.listen(PORT, () => {
  console.log(`Goldbizna M-Pesa backend running on port ${PORT}`);
});
