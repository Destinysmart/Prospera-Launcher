import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { ArrowRight, CheckCircle2, Shield } from 'lucide-react';

export function ResidencyFlow({ onComplete, user }: { onComplete: (id: string) => void; user: User }) {
  const [step, setStep] = useState<'intro' | 'webview' | 'review' | 'approved'>('intro');
  const [residentId, setResidentId] = useState<string | null>(null);

  // Initial check on mount to see if they are already approved
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { getDoc, doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        const residentDoc = await getDoc(doc(db, 'residents', user.uid));
        
        if (residentDoc.exists() && residentDoc.data().status === 'active') {
          setResidentId(residentDoc.data().prosperaData?.residentPermitNumber || user.uid);
          setStep('approved');
          onComplete(user.uid);
          return;
        }

        const token = await user.getIdToken();
        const res = await fetch(`/api/residents/${user.uid}/prospera_status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.active) {
          try {
             // Only send email if we actually did the update (meaning it wasn't already active in DB)
             fetch(`/api/email/send`, {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${token}`
               },
               body: JSON.stringify({
                 to: user.email,
                 subject: 'Próspera e-Residency Approved!',
                 text: 'Your Próspera e-Residency application has been approved. You can now access the portal and initialize LLC formation.'
               })
             }).catch(console.error);
          } catch(err) {
             console.warn("Failed to update firestore from client (maybe rules?)", err);
          }
          setResidentId(data.data?.residentPermitNumber || user.uid);
          setStep('approved');
          onComplete(user.uid);
        } else {
          // ensure we stay in intro if not active
        }
      } catch (e) {
        console.error("Failed initial check", e);
      }
    };
    
    checkStatus();
  }, [user.uid, user.email, onComplete]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'review') {
      interval = setInterval(async () => {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`/api/residents/${user.uid}/prospera_status`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.active) {
            const { updateDoc, doc } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            try {
               fetch(`/api/email/send`, {
                 method: 'POST',
                 headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${token}`
                 },
                 body: JSON.stringify({
                   to: user.email,
                   subject: 'Próspera e-Residency Approved!',
                   text: 'Your Próspera e-Residency application has been approved. You can now access the portal and initialize LLC formation.'
                 })
               }).catch(console.error);
            } catch(err) {
               console.warn("Failed to update firestore from client", err);
            }
            setResidentId(data.data?.residentPermitNumber || user.uid);
            setStep('approved');
            onComplete(user.uid);
            clearInterval(interval);
          }
        } catch (e) {
          console.error("Failed to poll residency status", e);
        }
      }, 300000); // Polling every 5 minutes
    }
    return () => clearInterval(interval);
  }, [step, onComplete, user.uid, user.email]);

  return (
    <div className="max-w-4xl mx-auto">
      <AnimatePresence mode="wait">
        {step === 'intro' && (
           <motion.div
             key="intro"
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 1.05 }}
             className="border border-[#141414] bg-white p-8 text-center flex flex-col items-center"
           >
             <div className="p-4 bg-[#141414] text-white rounded-full mb-6">
                <Shield size={48} />
             </div>
             <h2 className="text-3xl font-bold uppercase mb-4 tracking-tighter">e-Residency Application</h2>
             <p className="text-[#141414]/80 max-w-md mx-auto uppercase text-sm font-mono tracking-wide mb-8 leading-relaxed">
               To begin your Próspera e-Residency, you need to complete a $130 application payment through the official portal. Your application review begins immediately after payment.
             </p>
             <button 
               onClick={() => setStep('webview')}
               className="bg-[#141414] text-white px-8 py-4 font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-black transition-colors"
             >
               Start Application — $130 <ArrowRight size={18} />
             </button>
           </motion.div>
        )}

        {step === 'webview' && (
           <motion.div
             key="webview"
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="border border-[#141414] bg-white p-8 text-center flex flex-col items-center"
           >
             <h2 className="text-3xl font-bold uppercase mb-2">Complete Payment</h2>
             <p className="text-[#141414]/60 max-w-sm mx-auto uppercase text-xs font-mono tracking-wide mb-6">
               Please complete your application and payment securely via the Próspera Portal below.
             </p>
             <div className="w-full mt-4 h-[700px] border border-gray-300 relative">
                <div className="absolute top-0 right-0 left-0 bg-gray-100 p-2 text-xs font-mono text-center mb-2 z-10 shadow-sm">
                  If WebView fails to load, <a href="https://portal.eprospera.com/en/residency" target="_blank" rel="noreferrer" className="underline text-blue-500">click here to open in a new tab</a>
                </div>
                <iframe src="https://portal.eprospera.com/en/residency" className="w-full h-full pt-10 relative z-0" />
             </div>
             
             <p className="mt-6 text-[#141414]/80 max-w-lg mx-auto uppercase text-sm font-mono tracking-wide leading-relaxed">
               Complete your application and payment on the Próspera portal above. Once done, click the button below.
             </p>
             
             <div className="mt-6 text-center">
                <button 
                  onClick={() => setStep('review')}
                  className="bg-[#141414] text-white px-8 py-4 font-bold uppercase tracking-widest flex items-center justify-center gap-2 mx-auto hover:bg-black transition-colors"
                >
                  I have completed my application <ArrowRight size={18} />
                </button>
             </div>
           </motion.div>
        )}

        {step === 'review' && (
           <motion.div
             key="review"
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="border border-[#141414] bg-[#141414] text-[#E4E3E0] p-12 text-center flex flex-col items-center"
           >
             <h2 className="text-3xl font-bold uppercase mb-4 tracking-tighter text-white">Application In Review</h2>
             <p className="opacity-80 max-w-md mx-auto uppercase text-sm font-mono tracking-wide mb-8 leading-relaxed">
               Your e-Residency application is under review. This typically takes a few business days. We will notify you when approved.
             </p>
             <div className="mt-6 flex items-center justify-center gap-4 text-xs font-mono uppercase opacity-50">
               <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
               <span>Checking your application status...</span>
             </div>
           </motion.div>
        )}
        {step === 'approved' && (
           <motion.div
             key="approved"
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="border border-[#141414] bg-white p-12 text-center flex flex-col items-center"
           >
             <div className="p-4 bg-green-500 text-white rounded-full mb-6">
                <CheckCircle2 size={48} />
             </div>
             <h2 className="text-3xl font-bold uppercase mb-4 tracking-tighter">Residency Approved</h2>
             <p className="text-[#141414]/80 max-w-md mx-auto uppercase text-sm font-mono tracking-wide mb-8 leading-relaxed">
               Your Próspera e-Residency is active. You are now officially recognized within the ZEDE and can proceed with corporate entities.
             </p>
             <div className="p-4 bg-gray-50 border border-gray-200 w-full mb-8">
                <div className="text-[10px] font-mono uppercase opacity-50 mb-1">Próspera Identification</div>
                <div className="font-mono text-lg font-bold tracking-widest">{residentId?.toUpperCase()}</div>
             </div>
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

