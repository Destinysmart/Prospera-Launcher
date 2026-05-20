import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';
import * as admin from 'firebase-admin';
import firebaseConfig from './firebase-applet-config.json';
import { Webhook } from 'svix';

dotenv.config();

console.log("Starting server.ts...");

try {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
  console.log("Firebase Admin initialized");
} catch(e) {
  console.error("Firebase Admin initialization error:", e);
}

const app = express();
const allowedOrigins = ['http://localhost:3000'];
if (process.env.APP_URL) {
    allowedOrigins.push(process.env.APP_URL);
}
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

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



import PDFDocument from 'pdfkit';
app.post('/api/invoices/generate-pdf', requireAuth, async (req, res) => {
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
      const resp = await fetchFromProspera(`/legal_entity_applications/${applicationId}/checkout_session`, 'POST', {
          paymentProvider: "stripe",
          redirectUrl: `${process.env.APP_URL || 'http://localhost:3000'}/callback`
      });
      
      const dataObject = resp?.data || resp;
      const url = dataObject?.checkoutUrl || dataObject?.url || dataObject?.paymentRequest;
      
      if (url && typeof url === 'string') {
          return { status: 'pending_url', checkoutUrl: url };
      }
      
      throw new Error(`No checkout URL returned. Received: ${JSON.stringify(resp)}`);
  } catch (e: any) {
      console.error("Checkout session failed:", e.message);
      throw e;
  }
}

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/prospera/search-entity', requireAuth, async (req, res) => {
  try {
    const data = await fetchFromProspera('/registries/legal_entities/search', 'POST', req.body);
    res.json(data || { data: { matches: [] } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// LLC - Submit
app.post('/api/llc/submit', requireAuth, async (req, res) => {
  const { llcData, amount } = req.body;
  const uid = (req as any).user.uid;

  try {
    let principalOffice = { line1: "123 Main St", city: "Roatan", postalCode: "34101", country: "HN" };
    try {
        const residentDoc = await admin.firestore().collection('residents').doc(uid).get();
        if (residentDoc.exists) {
            const pData = residentDoc.data()?.prosperaData;
            if (pData?.address) {
                principalOffice = pData.address;
            }
        }
    } catch(e) {}

    const resp = await fetchFromProspera('/legal_entity_applications', 'POST', {
      applicationData: {
        residencyType: "e-Resident",
        entityType: "llc",
        name: llcData.companyName,
        extension: "LLC",
        principalOffice: principalOffice,
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

app.post('/api/llc/checkout', requireAuth, async (req, res) => {
   const { applicationId, entityId, email } = req.body;
   const uid = (req as any).user.uid;
   
   try {
     const checkoutSession = await handleProsperaPayment(applicationId);
     
     if (checkoutSession.invoiceId && entityId) {
         await admin.firestore().collection('invoices_history').doc(checkoutSession.invoiceId).set({
            id: checkoutSession.invoiceId,
            entityId: entityId,
            type: 'llc',
            amount: 150000,
            status: checkoutSession.status === 'paid' ? 'paid' : 'pending',
            paymentRequest: checkoutSession.bolt11 || null,
            email: email || null,
            ownerId: uid
         });
         
         await admin.firestore().collection('corporate_entities').doc(entityId).set({
            status: checkoutSession.status === 'paid' ? 'processing' : 'pending_payment',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
         }, { merge: true });
     }
     
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
app.get('/api/residents/:uid/prospera_status', requireAuth, async (req, res) => {
  try {
      const uid = req.params.uid;
      const data = await fetchFromProspera('/me/natural-person');
      const isActive = data !== null && !!data.residentPermitNumber;
      
      if (isActive) {
          try {
              await admin.firestore().collection('residents').doc(uid).set({
                  id: uid,
                  ownerId: uid,
                  status: 'active',
                  prosperaData: data || null,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
          } catch(e) {
              console.error("Failed to sync resident status to firestore from backend:", e);
          }
      }
      
      return res.json({ active: isActive, data });
  } catch (e: any) {
      return res.json({ active: false, data: null, message: e.message });
  }
});

// Email endpoint that clients can call
app.post('/api/email/send', requireAuth, async (req, res) => {
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
  
  if (!process.env.BLINK_WEBHOOK_SECRET) {
      console.warn("Webhook received but BLINK_WEBHOOK_SECRET is missing. Rejecting.");
      return res.status(400).json({ error: "Webhook secret not configured" });
  }
  
  const webhook = new Webhook(process.env.BLINK_WEBHOOK_SECRET);
  let evt: any;
  try {
     evt = webhook.verify(payloadString, svixHeaders as any);
  } catch (err) {
     console.error("Svix verification failed");
     return res.status(400).json({ error: "Invalid signature" });
  }

  console.log("Received Blink webhook event:", evt);

  if (evt.type === 'payment.received' || evt.type === 'receive.payment') {
      const data = evt.data || evt;
      const bolt11 = data.paymentRequest || data.bolt11 || data.invoice;
      if (bolt11) {
          try {
              const invoicesRef = admin.firestore().collection('invoices_history');
              const q = invoicesRef.where('paymentRequest', '==', bolt11).limit(1);
              const snapshot = await q.get();
              if (!snapshot.empty) {
                  const invoiceDoc = snapshot.docs[0];
                  await invoiceDoc.ref.update({ status: 'paid', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                  
                  const entityId = invoiceDoc.data().entityId;
                  if (entityId) {
                      await admin.firestore().collection('corporate_entities').doc(entityId).update({
                          status: 'processing',
                          updatedAt: admin.firestore.FieldValue.serverTimestamp()
                      });
                  }
              }
          } catch(e) {
              console.error("Webhook processing error:", e);
          }
      }
  }

  res.sendStatus(200);
});

// --- STUBBED ENDPOINTS (MISSING LEGAL) ---
app.post('/api/entities/:id/auto-approve', (req, res) => {
  if (!FEATURE_AUTO_APPROVAL) {
    return res.status(501).json({ error: 'Coming after legal review (Statute 6b)' });
  }
  res.json({ status: 'approved' });
});

app.post('/api/referrals/redeem', requireAuth, async (req, res) => {
  const { code, email } = req.body;
  const uid = (req as any).user.uid;
  try {
    const residentsSnapshot = await admin.firestore().collection('residents').get();
    let referrerId = null;
    for (const doc of residentsSnapshot.docs) {
       const resId = doc.id;
       if (`ZEDE-${resId.substring(0, 6).toUpperCase()}` === code) {
          referrerId = doc.data().ownerId;
          break;
       }
    }
    
    if (referrerId) {
       await admin.firestore().collection('referrals').add({
          referral_code: code,
          referred_user_email: email,
          referred_user_id: uid,
          referrer_id: referrerId,
          coupon_assigned: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
       });
       return res.json({ success: true });
    }
    return res.json({ success: false, reason: 'referrer_not_found' });
  } catch(e) {
    return res.status(500).json({ error: 'failed' });
  }
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

