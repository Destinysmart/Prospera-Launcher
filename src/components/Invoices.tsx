import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, setDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { FileText, Download, CheckCircle2, Circle } from 'lucide-react';
import QRCode from 'qrcode';

interface InvoicesProps {
  user: User;
  llcId: string | null;
}

export function Invoices({ user, llcId }: InvoicesProps) {
  const [llc, setLlc] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  
  // Form State
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'SATS'>('USD');
  const [dueDate, setDueDate] = useState('');
  
  const [btcPrice, setBtcPrice] = useState<{ base: number, offset: number } | null>(null);
  const [lightningAddress, setLightningAddress] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!llcId) return;
    const fetchLlc = async () => {
      const docRef = doc(db, 'corporate_entities', llcId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setLlc(docSnap.data());
      }
    };
    fetchLlc();
    
    // Invoices History
    const qInv = query(collection(db, 'invoices_history'), where('llcId', '==', llcId));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
       const invData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
       setInvoices(invData.sort((a: any, b: any) => b.createdAt - a.createdAt));
    });
    
    // Btc Price & Corporate Wallet 
    const fetchContext = async () => {
        try {
            const resPrice = await fetch('/api/btc-price');
            const dataPrice = await resPrice.json();
            if (dataPrice.btcSatPrice) setBtcPrice(dataPrice.btcSatPrice);
            
            const userDocSnap = await getDoc(doc(db, 'users', user.uid));
            const userData = userDocSnap.data();
            const encryptedKey = userData?.blink_api_key ? `?encryptedKey=${encodeURIComponent(userData.blink_api_key)}` : '';
            
            const resWallet = await fetch(`/api/wallets/balances${encryptedKey}`);
            const walletData = await resWallet.json();
            if (walletData.connected) {
                // If it's connected, simulate LN address
                setLightningAddress('pay@blink.sv'); // You'd need a real LN address lookup
            }
        } catch(e) {}
    };
    fetchContext();

    return () => unsubInv();
  }, [llcId]);

  const convertedAmount = React.useMemo(() => {
     if (!amount || !btcPrice || isNaN(Number(amount))) return null;
     const satsPriceInUsd = btcPrice.base / Math.pow(10, btcPrice.offset); 
     const amtNum = Number(amount);
     
     if (currency === 'USD') {
        const sats = Math.floor(amtNum / satsPriceInUsd);
        return `${sats.toLocaleString()} SATS`;
     } else {
        const usd = (amtNum * satsPriceInUsd).toFixed(2);
        return `$${usd} USD`;
     }
  }, [amount, currency, btcPrice]);

  const handleGenerate = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!llc) return;
     setGenerating(true);
     
     const invoiceNumber = `LLC-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
     
     const payload = {
        clientName,
        clientEmail,
        description,
        amount,
        currency,
        dueDate,
        invoiceNumber,
        llcName: llc.companyName,
        regNumber: llc.id.split('-')[0],
        registrantEmail: user.email,
        lightningAddress
     };
     
     try {
       const response = await fetch('/api/invoices/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
       });
       
       if (response.ok) {
           const blob = await response.blob();
           const url = window.URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = `Invoice-${invoiceNumber}.pdf`;
           document.body.appendChild(a);
           a.click();
           a.remove();
           window.URL.revokeObjectURL(url);
           
           // Store history
           const histDoc = doc(collection(db, 'invoices_history'));
           await setDoc(histDoc, {
              id: histDoc.id,
              llcId,
              invoiceNumber,
              clientName,
              amount,
              currency,
              status: 'unpaid',
              createdAt: Date.now()
           });
           
           setClientName('');
           setClientEmail('');
           setDescription('');
           setAmount('');
           setDueDate('');
       }
     } catch(err) {
       console.error("PDF generation failed", err);
     }
     
     setGenerating(false);
  };

  const markPaid = async (id: string) => {
      await updateDoc(doc(db, 'invoices_history', id), {
          status: 'paid'
      });
  };

  if (!llcId) {
      return (
        <div className="max-w-4xl border-2 border-dashed border-[#141414]/20 p-12 text-center text-[#141414]/60 font-mono uppercase text-sm">
          Please complete LLC formation to access the Invoice Generator.
        </div>
      );
  }

  return (
     <div className="max-w-6xl flex flex-col md:flex-row gap-8 pb-12">
        <div className="flex-1 space-y-8">
           <header>
             <h2 className="text-4xl font-bold tracking-tight uppercase mb-2">Invoice Generator</h2>
             <p className="text-[#141414]/60 font-mono text-sm uppercase italic">Zero-dependency client invoicing</p>
           </header>
           
           <form onSubmit={handleGenerate} className="border border-[#141414] bg-white p-6 md:p-8">
               <h3 className="text-xl font-bold uppercase mb-6 border-b border-[#141414]/10 pb-2">Client Information</h3>
               
               <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-mono uppercase opacity-70 mb-1">Client Name</label>
                    <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} required className="w-full p-3 border border-[#141414]/20 focus:border-[#141414] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase opacity-70 mb-1">Client Email</label>
                    <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} required className="w-full p-3 border border-[#141414]/20 focus:border-[#141414] focus:outline-none" />
                  </div>
               </div>

               <h3 className="text-xl font-bold uppercase mb-6 border-b border-[#141414]/10 pb-2">Invoice Details</h3>
               
               <div className="mb-4">
                  <label className="block text-xs font-mono uppercase opacity-70 mb-1">Service Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={3} className="w-full p-3 border border-[#141414]/20 focus:border-[#141414] focus:outline-none"></textarea>
               </div>
               
               <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div>
                     <label className="block text-xs font-mono uppercase opacity-70 mb-1">Amount</label>
                     <div className="flex border border-[#141414]/20 focus-within:border-[#141414]">
                        <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} required className="flex-1 p-3 focus:outline-none" />
                        <select value={currency} onChange={e => setCurrency(e.target.value as any)} className="bg-gray-100 px-4 border-l border-[#141414]/20 focus:outline-none font-bold">
                           <option value="USD">USD</option>
                           <option value="SATS">SATS</option>
                        </select>
                     </div>
                     {convertedAmount && <div className="text-[10px] uppercase font-mono mt-1 opacity-60">≈ {convertedAmount}</div>}
                  </div>
                  <div>
                     <label className="block text-xs font-mono uppercase opacity-70 mb-1">Due Date</label>
                     <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required className="w-full p-3 border border-[#141414]/20 focus:border-[#141414] focus:outline-none" />
                  </div>
               </div>
               
               <div className="mb-8 p-4 bg-gray-50 border border-[#141414]/10 font-mono text-xs uppercase grid gap-2">
                  <div className="font-bold border-b border-[#141414]/10 pb-2 mb-1">Auto-Filled Context</div>
                  <div className="flex justify-between"><span>LLC Name</span> <span className="font-bold text-right">{llc?.companyName}</span></div>
                  <div className="flex justify-between"><span>Registry ID</span> <span className="font-bold text-right">{llcId.split('-')[0]}</span></div>
                  <div className="flex justify-between"><span>Lightning Address</span> <span className="font-bold text-right">{lightningAddress || 'None Connected'}</span></div>
               </div>
               
               <button 
                  type="submit" 
                  disabled={generating}
                  className="w-full bg-[#141414] text-white p-4 font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-colors"
               >
                  {generating ? 'Generating PDF...' : 'Download PDF Invoice'} <Download size={18} />
               </button>
           </form>
        </div>
        
        <div className="w-full md:w-80">
            <h3 className="font-bold uppercase tracking-widest text-sm mb-4 border-b border-[#141414]/20 pb-2">Invoice History</h3>
            {invoices.length === 0 ? (
               <div className="text-xs font-mono opacity-50 uppercase py-4">No past invoices</div>
            ) : (
               <div className="space-y-3">
                  {invoices.map(inv => (
                     <div key={inv.id} className="p-4 border border-[#141414] bg-white">
                        <div className="flex justify-between items-start mb-2">
                           <div className="font-bold font-mono text-xs">{inv.invoiceNumber}</div>
                           {inv.status === 'paid' ? (
                              <div className="flex items-center gap-1 text-[10px] text-green-600 font-bold uppercase"><CheckCircle2 size={12}/> Paid</div>
                           ) : (
                              <div className="flex items-center gap-1 text-[10px] text-yellow-600 font-bold uppercase"><Circle size={12}/> Unpaid</div>
                           )}
                        </div>
                        <div className="text-sm font-bold uppercase mb-1">{inv.clientName}</div>
                        <div className="text-xs font-mono opacity-70 mb-4">{inv.amount} {inv.currency}</div>
                        
                        {inv.status !== 'paid' && (
                           <button onClick={() => markPaid(inv.id)} className="w-full border border-[#141414] py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-[#141414] hover:text-white transition-colors">
                              Mark as Paid
                           </button>
                        )}
                     </div>
                  ))}
               </div>
            )}
        </div>
     </div>
  );
}
