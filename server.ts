import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

console.log("Starting server.ts...");

const app = express();
app.use(cors());
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const PORT = 3000;

// --- FEATURE FLAGS ---
const FEATURE_AUTO_APPROVAL = process.env.FEATURE_AUTO_APPROVAL === 'true';
const FEATURE_CORP_EVENTS = process.env.FEATURE_CORP_EVENTS === 'true';
const FEATURE_TAX_API = process.env.FEATURE_TAX_API === 'true';
const FEATURE_DISSOLUTION = process.env.FEATURE_DISSOLUTION === 'true';
const FEATURE_ONCHAIN = process.env.FEATURE_ONCHAIN === 'true';

// Blink is configured directly by user in browser

const isProsperaEnabled = !FEATURE_AUTO_APPROVAL && !!process.env.PROSPERA_API_KEY;
const PROSPERA_BASE_URL = 'https://staging-portal.eprospera.com/api/v1';

async function fetchFromProspera(endpoint: string, method: string = 'GET', body?: any) {
  if (!isProsperaEnabled) return null;
  const res = await fetch(`${PROSPERA_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PROSPERA_API_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
     if (res.status === 403) {
        throw new Error("To complete this action, please sign the Manifestation of Will on your Próspera portal under Settings → Developer.");
     }
     throw new Error(`Próspera API Error: ${res.statusText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// --- EMAIL SETUP ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'resend',
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmailNotification(to: string, subject: string, text: string) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}, Text: ${text}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.NOTIFICATION_EMAIL_FROM || '"Próspera Launcher" <noreply@prospera-launcher.com>',
      to,
      subject,
      text,
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

import { Webhook } from 'svix';

import PDFDocument from 'pdfkit';

// --- INVOICES GENERATOR --
app.post('/api/invoices/generate-pdf', async (req, res) => {
  try {
     const {
        clientName,
        clientEmail,
        description,
        amount,
        currency,
        dueDate,
        invoiceNumber,
        llcName,
        regNumber,
        registrantEmail,
        lightningAddress
     } = req.body;

     const doc = new PDFDocument({ margin: 50 });
     
     res.setHeader('Content-disposition', `attachment; filename=Invoice-${invoiceNumber}.pdf`);
     res.setHeader('Content-type', 'application/pdf');
     doc.pipe(res);

     // Header
     doc.fontSize(20).text('INVOICE', { align: 'right' });
     doc.moveDown();
     
     // LLC Info
     doc.fontSize(14).text(llcName || 'LLC Name', { align: 'left'});
     doc.fontSize(10).text(`Registration: ${regNumber || 'Pending'}`, { align: 'left'});
     doc.text(`Email: ${registrantEmail || ''}`, { align: 'left'});
     doc.moveDown();

     // Invoice details
     doc.text(`Invoice Number: ${invoiceNumber}`, { align: 'right' });
     doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
     doc.text(`Due Date: ${dueDate}`, { align: 'right' });
     doc.moveDown();

     // Client Info
     doc.fontSize(12).text('Bill To:', { underline: true });
     doc.fontSize(10).text(clientName || '');
     doc.text(clientEmail || '');
     doc.moveDown(2);

     // Table Header
     doc.rect(50, doc.y, 500, 20).fill('#f0f0f0');
     doc.fillColor('#000000');
     doc.text('Description', 60, doc.y - 15);
     doc.text('Amount', 450, doc.y - 15, { align: 'right' });
     doc.moveDown();

     // Table Row
     const rowY = doc.y + 10;
     doc.text(description || 'Service provided', 60, rowY);
     doc.text(`${amount} ${currency.toUpperCase()}`, 450, rowY, { align: 'right' });
     doc.moveDown(3);

     // Payment Instructions
     doc.fontSize(12).text('Payment Instructions', { underline: true });
     doc.fontSize(10).text('Please pay via Lightning Network to the following address:');
     doc.moveDown(0.5);
     doc.font('Helvetica-Bold').text(lightningAddress ? lightningAddress : 'No Lightning Address provided. Please contact for payment details.');
     doc.font('Helvetica').moveDown(2);

     // Footer
     doc.fontSize(8)
        .fillColor('gray')
        .text('Issued under Próspera ZEDE Common Law jurisdiction.', 50, 700, { align: 'center' });

     doc.end();
  } catch(e: any) {
     res.status(500).json({ error: e.message });
  }
});

// --- PRÓSPERA PAYMENT HANDLER ---
async function handleProsperaPayment(applicationId: string) {
  try {
      const checkoutResp = await fetchFromProspera(`/legal_entity_applications/${applicationId}/checkout_session`, 'POST', {
         paymentProvider: "lightning_blink",
         redirectUrl: `${process.env.APP_URL || 'http://localhost:3000'}/callback`
      });
      
      console.log("[DEBUG] checkoutResp from Próspera for lightning_blink:", checkoutResp);
      
      const dataObject = checkoutResp?.data || checkoutResp;
      const bolt11 = dataObject?.invoice || dataObject?.paymentRequest || dataObject?.bolt11 || dataObject?.checkoutUrl; 
      let actualBolt11 = bolt11;
      if (typeof bolt11 === 'string' && bolt11.startsWith('lightning:')) { actualBolt11 = bolt11.replace('lightning:', ''); }
      
      if (typeof actualBolt11 === 'string' && actualBolt11.toLowerCase().startsWith('lnbc')) {
          return { status: 'pending', bolt11: actualBolt11 };
      }
      
      if (typeof actualBolt11 === 'string' && actualBolt11.startsWith('http')) {
          return { status: 'pending_url', checkoutUrl: actualBolt11 };
      }
      
      throw new Error(`No BOLT11 returned from lightning_blink provider. Received: ${JSON.stringify(checkoutResp)}`);
  } catch (e: any) {
      console.error("Lightning checkout failed, falling back to Stripe:", e.message);
      const stripeResp = await fetchFromProspera(`/legal_entity_applications/${applicationId}/checkout_session`, 'POST', {
          paymentProvider: "stripe",
          redirectUrl: `${process.env.APP_URL || 'http://localhost:3000'}/callback`
      });
      
      const stripeData = stripeResp?.data || stripeResp;
      return { status: 'pending_stripe', checkoutUrl: stripeData?.checkoutUrl || stripeData?.url || stripeData?.paymentRequest };
  }
}

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/prospera/search-entity', async (req, res) => {
  try {
    const data = await fetchFromProspera('/registries/legal_entities/search', 'POST', req.body);
    res.json(data || { data: { matches: [] } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// LLC - Submit
app.post('/api/llc/submit', async (req, res) => {
  const { llcData, amount } = req.body;

  try {
    const resp = await fetchFromProspera('/legal_entity_applications', 'POST', {
      applicationData: {
        residencyType: "e-Resident",
        entityType: "llc",
        name: llcData.companyName,
        extension: "LLC",
        principalOffice: { line1: "123 Main St", city: "Roatan", postalCode: "34101", country: "HN" },
        contactEmail: llcData.email,
        registeredAgentProvider: "prospera_employment_solutions",
        registeredAgentDetails: null
      }
    });
    
    res.json({
      signatureUrl: resp?.nextSteps?.signature,
      applicationId: resp?.data?.id,
      amount
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/llc/checkout', async (req, res) => {
   const { applicationId } = req.body;
   
   try {
     const checkoutSession = await handleProsperaPayment(applicationId);
     
     res.json({
      invoiceId: checkoutSession.invoiceId || null,
      checkoutStatus: checkoutSession.status,
      checkoutUrl: checkoutSession.checkoutUrl,
      bolt11: checkoutSession.bolt11
     });
   } catch (e: any) {
     res.status(500).json({ error: e.message });
   }
});

// Residents Status - Polling Próspera API
app.get('/api/residents/:id/prospera_status', async (req, res) => {
  try {
      const data = await fetchFromProspera('/me/natural-person');
      const isActive = data !== null && !!data.residentPermitNumber;
      return res.json({ active: isActive, data });
  } catch (e: any) {
      return res.json({ active: false, data: null, message: e.message });
  }
});

// Email endpoint that clients can call
app.post('/api/email/send', async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !transporter) return res.json({ success: false });
  try {
      await transporter.sendMail({
          from: process.env.NOTIFICATION_EMAIL_FROM || 'noreply@prospera-launcher.com',
          to,
          subject,
          text
      });
      res.json({ success: true });
  } catch (e) {
      console.error("Failed to send email:", e);
      res.json({ success: false });
  }
});

// --- WEBHOOK HANDLERS ---

app.post('/api/webhooks/blink', async (req: any, res) => {
  const payloadString = req.rawBody;
  const svixHeaders = req.headers;
  
  const webhook = new Webhook(process.env.BLINK_WEBHOOK_SECRET || 'secret');
  let evt: any;
  try {
     evt = webhook.verify(payloadString, svixHeaders as any);
  } catch (err) {
     if (process.env.BLINK_WEBHOOK_SECRET) {
         console.error("Svix verification failed");
         return res.status(400).json({ error: "Invalid signature" });
     }
     console.warn("Svix verification bypassed for development mode (missing BLINK_WEBHOOK_SECRET)");
     evt = { data: req.body }; // fallback 
  }

  // Webhooks from Blink would be processed here and we'd usually use Admin SDK.
  // We're stubbing this out since we can no longer use Firebase Admin SDK per instructions.
  console.log("Received Blink webhook event:", evt);

  res.sendStatus(200);
});

// --- STUBBED ENDPOINTS (MISSING LEGAL) ---
app.post('/api/entities/:id/auto-approve', (req, res) => {
  if (!FEATURE_AUTO_APPROVAL) {
    return res.status(501).json({ error: 'Coming after legal review (Statute 6b)' });
  }
  res.json({ status: 'approved' });
});

app.get('/api/tax/periods', (req, res) => {
  if (!FEATURE_TAX_API) {
    return res.status(501).json({ error: 'Coming after legal review (Statute 7)' });
  }
  res.json({ periods: [] });
});

app.delete('/api/entities/:id', (req, res) => {
  if (!FEATURE_DISSOLUTION) {
    return res.status(501).json({ error: 'Coming after legal review (Statute 9)' });
  }
  res.json({ status: 'dissolved' });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Express unhandled error:", err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// --- VITE MIDDLEWARE ---

async function startServer() {
  if (!FEATURE_AUTO_APPROVAL) {
    if (!process.env.PROSPERA_API_KEY) {
      console.warn('WARNING: PROSPERA_API_KEY is recommended when FEATURE_AUTO_APPROVAL is false.');
    }
  }

  console.log("Blink: browser-side only");

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

