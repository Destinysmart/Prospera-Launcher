import React, { useState, useEffect } from 'react';
import { Building2, ArrowRight, CheckCircle2, Copy, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import QRCode from 'qrcode';

export function LLCFlow({ onComplete, user }: { onComplete: (id: string) => void; user: User }) {
  const [step, setStep] = useState<'form' | 'signature' | 'payment' | 'portal'>('form');
  const [formData, setFormData] = useState({ 
    companyName: '', 
    email: user.email || '', 
    framework: 'Common-Law', 
    purpose: '' 
  });
  
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [nameChecking, setNameChecking] = useState(false);
  
  const [invoice, setInvoice] = useState<any>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [residentStatus, setResidentStatus] = useState<string | null>('loading');

  useEffect(() => {
    const checkResidentStatus = async () => {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        const docSnap = await getDoc(doc(db, 'residents', user.uid));
        if (docSnap.exists()) {
           setResidentStatus(docSnap.data().status);
        } else {
           setResidentStatus('none');
        }
      } catch(e) {
        setResidentStatus('unknown');
      }
    };
    checkResidentStatus();
  }, [user.uid]);

  // Debounced search
  useEffect(() => {
    if (formData.companyName.length < 3) {
      setNameAvailable(null);
      return;
    }
    
    setNameChecking(true);
    const delay = setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/prospera/search-entity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ query: formData.companyName })
        });
        const data = await res.json();
        
        let taken = false;
        if (data && data.data && data.data.matches) {
          taken = data.data.matches.some((match: any) => match.name?.toLowerCase() === formData.companyName.toLowerCase() || match.legalName?.toLowerCase() === formData.companyName.toLowerCase());
        }
        setNameAvailable(!taken);
      } catch (e) {
        console.error("Name check failed", e);
        setNameAvailable(null);
      } finally {
        setNameChecking(false);
      }
    }, 500);

    return () => clearTimeout(delay);
  }, [formData.companyName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (nameAvailable === false) {
       setErrorMsg("This name is already registered in Próspera ZEDE. Please choose a different name.");
       return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/llc/submit', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ llcData: formData, amount: 150000 }),
      });
      const data = await res.json();
      
      if (!res.ok) {
         setErrorMsg(data.error || "Failed to submit application");
         return;
      }
      
      const newEntityId = crypto.randomUUID();
      setEntityId(newEntityId);
      setApplicationId(data.applicationId);
      
      const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../services/firebase');
      
      const entityData = {
        ...formData,
        id: newEntityId,
        status: data.signatureUrl ? 'pending_signature' : 'pending_payment',
        applicationId: data.applicationId || null,
        ownerId: user.uid,
        amount: 150000,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'corporate_entities', newEntityId), entityData);

      if (data.signatureUrl) {
         setSignatureUrl(data.signatureUrl);
         setStep('signature');
      } else {
         await handleCheckout(newEntityId, data.applicationId);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("An unexpected error occurred during submission.");
    }
  };

  const handleCheckout = async (id: string, appId?: string) => {
     setErrorMsg(null);
     try {
       const token = await user.getIdToken();
       const res = await fetch(`/api/llc/checkout`, { 
         method: 'POST',
         headers: { 
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${token}`
         },
         body: JSON.stringify({ applicationId: appId }),
       });
       const data = await res.json();
       
       if (!res.ok) {
         setErrorMsg(data.error || "Failed to create checkout");
         return;
       }
       
       setInvoice(data);
       
       if (data.checkoutUrl) {
           window.open(data.checkoutUrl, '_blank');
       } else if (data.bolt11 || data.invoice) {
           const invToUse = data.bolt11 || data.invoice;
           try {
             const qr = await QRCode.toDataURL(`lightning:${invToUse}`);
             setQrCodeDataUrl(qr);
           } catch(e) {}
       }
       
       if (data.invoiceId) {
         const { setDoc, updateDoc, doc } = await import('firebase/firestore');
         const { db } = await import('../services/firebase');
         await setDoc(doc(db, 'invoices_history', data.invoiceId), {
            id: data.invoiceId,
            entityId: id,
            type: 'llc',
            amount: 150000,
            status: data.checkoutStatus === 'paid' ? 'paid' : 'pending',
            paymentRequest: data.invoice || data.bolt11 || null,
            email: formData.email || null,
            ownerId: user.uid || null
         });
         
         await updateDoc(doc(db, 'corporate_entities', id), {
            status: data.checkoutStatus === 'paid' ? 'processing' : 'pending_payment'
         });
       }

       if (data.checkoutStatus === 'paid') {
          setStep('portal');
       } else {
          setStep('payment');
       }
     } catch (err) {
       console.error(err);
       setErrorMsg("An error occurred generating payment.");
     }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'payment' && invoice && invoice.invoiceId) {
      interval = setInterval(async () => {
        try {
          const { getDoc, doc } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');
          const docSnap = await getDoc(doc(db, 'invoices_history', invoice.invoiceId));
          if (docSnap.exists() && docSnap.data().status === 'paid') {
            setStep('portal');
            clearInterval(interval);
          }
        } catch(e) {}
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [step, invoice]);

  const stepIndicator = (current: string) => {
     const steps = ['form', 'signature', 'payment', 'portal'];
     const currentIndex = steps.indexOf(current);
     return (
        <div className="flex items-center justify-center gap-2 mb-8 mt-4">
           {steps.map((s, i) => (
             <React.Fragment key={s}>
               <div className={`w-3 h-3 rounded-full ${i <= currentIndex ? 'bg-[#141414]' : 'bg-gray-300'}`} />
               {i < steps.length - 1 && <div className={`w-8 h-[2px] ${i < currentIndex ? 'bg-[#141414]' : 'bg-gray-300'}`} />}
             </React.Fragment>
           ))}
        </div>
     );
  };

  if (residentStatus === 'loading') {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-[#141414]/50 font-mono uppercase text-sm">
        Checking e-Residency status...
      </div>
    );
  }

  if (residentStatus !== 'active') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="border border-[#141414] bg-white p-8 text-center flex flex-col items-center">
          <div className="p-4 bg-yellow-100 text-yellow-800 rounded-full mb-6">
            <Building2 size={32} />
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter mb-4">LLC Formation Locked</h2>
          <p className="text-[#141414]/80 max-w-md mx-auto font-mono text-sm leading-relaxed mb-6">
            Your e-Residency application is currently under review by Próspera. LLC formation will be available once your residency is approved. You will receive an email notification when this changes.
          </p>
          <button onClick={() => onComplete('')} className="text-xs uppercase font-bold tracking-widest text-[#141414]/50 hover:text-[#141414] transition-colors border-b border-transparent hover:border-[#141414]">
             Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {stepIndicator(step)}
      
      <AnimatePresence mode="wait">
        {step === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="border border-[#141414] bg-white p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <ClipboardList className="text-[#141414]" size={32} />
              <h2 className="text-3xl font-bold uppercase tracking-tighter">Register LLC</h2>
            </div>
            
            {errorMsg && (
                <div className="bg-red-50 text-red-600 p-4 mb-6 border border-red-200 text-sm font-medium">
                  {errorMsg}
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-mono uppercase opacity-50 mb-1">Company Name</label>
                  <input
                    required
                    type="text"
                    value={formData.companyName}
                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                    className={`w-full border-b py-2 focus:outline-none focus:border-b-2 font-medium ${nameAvailable === false ? 'border-red-500' : 'border-[#141414]'}`}
                    placeholder="Satoshi Labs LLC"
                  />
                  <div className="h-4 mt-1">
                     {nameChecking && <span className="text-xs text-gray-500">Checking availability...</span>}
                     {nameAvailable === true && <span className="text-xs text-green-600 font-medium">Name appears available.</span>}
                     {nameAvailable === false && <span className="text-xs text-red-600 font-medium">This name is already registered.</span>}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase opacity-50 mb-1">Legal Framework</label>
                  <select
                    value={formData.framework}
                    onChange={e => setFormData({ ...formData, framework: e.target.value })}
                    className="w-full border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-medium bg-transparent"
                  >
                    <option value="Common-Law">Common Law</option>
                    <option value="Fintech-Reg-A">Fintech Reg A</option>
                    <option value="Financial-Reg-A">Financial Reg A</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase opacity-50 mb-1">Registrant Email</label>
                <input
                  required
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-medium"
                  placeholder="contact@company.com"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase opacity-50 mb-1">Business Purpose</label>
                <textarea
                  required
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  className="w-full border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-medium"
                  placeholder="The purpose of this LLC is to..."
                  rows={2}
                />
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={nameAvailable === false}
                  className="w-full bg-[#141414] text-[#E4E3E0] py-4 uppercase font-bold tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm & Submit <ArrowRight size={18} />
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {step === 'signature' && signatureUrl && (
          <motion.div
            key="signature"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border border-[#141414] bg-white p-8 text-center flex flex-col items-center"
          >
            <h2 className="text-3xl font-bold uppercase mb-2">Terms & Conditions</h2>
            <p className="text-[#141414]/60 max-w-sm mx-auto uppercase text-xs font-mono tracking-wide mb-6">
              Please sign your LLC agreement in the portal above before proceeding to payment.
            </p>
            
            {errorMsg && (
                <div className="bg-red-50 text-red-600 p-4 mb-6 border border-red-200 text-sm font-medium w-full text-left">
                  {errorMsg}
                </div>
            )}
            
            <div className="w-full mt-4 h-[600px] border border-gray-300 relative">
              <div className="absolute top-0 right-0 left-0 bg-gray-100 p-2 text-xs font-mono text-center mb-2 z-10 shadow-sm">
                Document Signature. <a href={signatureUrl} target="_blank" rel="noreferrer" className="underline text-blue-500">Open in a new tab</a> if the frame fails to load.
              </div>
              <iframe src={signatureUrl} className="w-full h-full pt-10 relative z-0" />
            </div>
            
            <div className="mt-8 text-center w-full">
               <button onClick={() => entityId && handleCheckout(entityId, applicationId || undefined)} className="bg-[#141414] text-white px-8 py-4 uppercase tracking-widest text-sm font-bold flex items-center justify-center gap-2 mx-auto w-full hover:bg-black transition-colors">
                  I Have Signed the Agreement <ArrowRight size={18} />
               </button>
            </div>
          </motion.div>
        )}

        {step === 'payment' && (
          <motion.div
            key="payment"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="border border-[#141414] bg-white text-[#141414] p-8 text-center"
          >
             <div className="py-8">
                <h2 className="text-2xl font-bold uppercase tracking-tight mb-4">Complete Payment</h2>
                <div className="mb-6 opacity-80 text-sm font-mono max-w-sm mx-auto space-y-2">
                   <p>Please proceed to the secure Próspera checkout.</p>
                   <p className="text-xs">Payment options: Lightning, On-Chain Bitcoin, and Credit Card.</p>
                </div>
                
                {invoice?.checkoutUrl ? (
                  <a href={invoice.checkoutUrl} className="inline-block bg-[#141414] text-white px-6 py-4 font-bold uppercase tracking-widest hover:bg-black transition-colors" target="_blank" rel="noreferrer">
                     Open Checkout
                  </a>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-xs font-mono uppercase opacity-50">
                    <div className="animate-spin h-3 w-3 border-2 border-black border-t-transparent rounded-full"></div>
                    <span>Initializing checkout...</span>
                  </div>
                )}
             </div>
          </motion.div>
        )}

        {step === 'portal' && (
          <motion.div
            key="portal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border border-[#141414] bg-white p-8 text-center flex flex-col items-center"
          >
            <div className="inline-block p-4 bg-green-500 text-white rounded-full mb-6">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-bold uppercase mb-2">Registration Complete</h2>
            <p className="text-[#141414]/60 max-w-sm mx-auto uppercase text-xs font-mono tracking-wide mb-6">
              Payment received successfully. Your LLC is now active and recognized.
            </p>
            
            <div className="mt-6 text-center text-[#141414]/60 text-sm w-full">
               <button onClick={() => entityId && onComplete(entityId)} className="bg-[#141414] text-white px-8 py-4 uppercase tracking-widest text-sm font-bold w-full hover:bg-black transition-colors">
                  Finish and View Dashboard <ArrowRight size={18} className="inline ml-2" />
               </button>
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
