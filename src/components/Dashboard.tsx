import React, { useEffect, useState } from 'react';
import { ShieldCheck, Building2, Clock, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Bitcoin, Wallet, CreditCard, ChevronRight, Copy, Users } from 'lucide-react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

interface DashboardProps {
  residentId: string | null;
  llcId: string | null;
  user: User;
}

export function Dashboard({ residentId, llcId, user }: DashboardProps) {
  const [resident, setResident] = useState<any>(null);
  const [llc, setLlc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [walletsData, setWalletsData] = useState<any>({ wallets: [], personalWalletId: null, corporateWalletId: null });
  const [walletConnectInput, setWalletConnectInput] = useState('');
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [showActivateForm, setShowActivateForm] = useState(false);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    const qRes = query(collection(db, 'residents'), where('ownerId', '==', user.uid));
    const unsubRes = onSnapshot(qRes, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs.find(d => d.id === residentId)?.data() || snapshot.docs[0].data();
        setResident(data);
      }
      setLoading(false);
    });

    const qLlc = query(collection(db, 'corporate_entities'), where('ownerId', '==', user.uid));
    const unsubLlc = onSnapshot(qLlc, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs.find(d => d.id === llcId)?.data() || snapshot.docs[0].data();
        setLlc(data);
      }
      setLoading(false);
    });

    const qRef = query(collection(db, 'referrals'), where('referrer_id', '==', user.uid));
    const unsubRef = onSnapshot(qRef, (snapshot) => {
      setReferrals(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubRes();
      unsubLlc();
      unsubRef();
    };
  }, [user.uid, residentId, llcId]);

  const fetchWallets = async () => {
    try {
      const { getDoc, doc } = await import('firebase/firestore');
      const userDocSnap = await getDoc(doc(db, 'users', user.uid));
      const userData = userDocSnap.data();
      
      const apiKey = userData?.blink_api_key;
      if (!apiKey) return;

      const query = `
        query {
          me {
            defaultAccount {
              wallets {
                id
                walletCurrency
                balance
              }
            }
          }
        }
      `;

      const res = await fetch('https://api.blink.sv/graphql', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (res.ok) {
        const data = await res.json();
        const wallets = data?.data?.me?.defaultAccount?.wallets || [];
        setWalletsData({ wallets, connected: true });
      }
    } catch(e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchWallets();
    const int = setInterval(fetchWallets, 60000);
    return () => clearInterval(int);
  }, []);

  const handleConnectWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnectingWallet(true);
    try {
      const query = `
        query {
          me {
            defaultAccount {
              wallets {
                id
                walletCurrency
              }
            }
          }
        }
      `;

      const res = await fetch('https://api.blink.sv/graphql', {
        method: 'POST',
        headers: {
          'X-API-KEY': walletConnectInput,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (res.ok) {
        const data = await res.json();
        
        if (data?.errors) {
            alert(data.errors[0]?.message || 'Could not connect. Please check your Blink API key and try again.');
            setIsConnectingWallet(false);
            return;
        }

        const wallets = data?.data?.me?.defaultAccount?.wallets || [];
        const btcWallet = wallets.find((w: any) => w.walletCurrency === 'BTC');
        const usdWallet = wallets.find((w: any) => w.walletCurrency === 'USD');

        if (!btcWallet || !usdWallet) {
          alert('Could not find BTC and USD wallets for this API key.');
          setIsConnectingWallet(false);
          return;
        }

        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', user.uid), {
            blink_api_key: walletConnectInput,
            blink_btc_wallet_id: btcWallet.id,
            blink_usd_wallet_id: usdWallet.id,
            blink_connected: true,
            blink_connected_at: Date.now()
        });

        setWalletsData({ ...walletsData, corporateWalletId: 'connected', connected: true });
        setWalletConnectInput('');
        fetchWallets();
        alert("Corporate treasury activated. Your Blink wallet is now your LLC's financial account.");
      } else {
        alert('Could not connect. Please check your Blink API key and try again.');
      }
    } catch(e) {
      console.error(e);
      alert('Could not connect. Please check your Blink API key and try again.');
    }
    setIsConnectingWallet(false);
  };

  const handleDisconnectWallet = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Blink treasury?')) return;
    try {
      const { updateDoc, doc, deleteField } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', user.uid), {
          blink_api_key: deleteField(),
          blink_btc_wallet_id: deleteField(),
          blink_usd_wallet_id: deleteField(),
          blink_connected: deleteField(),
          blink_connected_at: deleteField()
      });
      setWalletsData({ wallets: [], personalWalletId: null, corporateWalletId: null, connected: false });
      fetchWallets();
    } catch(e) {
      console.error(e);
    }
  };

  const btcBalancePersonal = walletsData?.personalWallets?.find((w: any) => w.walletCurrency === 'BTC')?.balance || 0;
  
  const corpWallets = walletsData?.wallets || [];
  const btcBalanceCorp = corpWallets.find((w: any) => w.walletCurrency === 'BTC')?.balance || 0;
  const usdBalanceCorp = corpWallets.find((w: any) => w.walletCurrency === 'USD')?.balance || 0;

  const residentStatus = resident?.status;
  const llcStatus = llc?.status;
  const isLlcActive = !!llc;

  const referralCode = resident?.id ? `ZEDE-${resident.id.substring(0, 6).toUpperCase()}` : '';
  const referralLink = `https://prspera.com?ref=${referralCode}`;
  const whatsappShare = `I incorporated my business globally in 48 hours using Bitcoin. No bank, no credit card. Use my link to do the same: ${referralLink}`;
  const twitterShare = `Just registered my LLC in Próspera ZEDE — paid in sats via Blink. Here's how you can too: ${referralLink} #Bitcoin #ZEDE`;

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <header>
        <h2 className="text-4xl font-bold tracking-tight uppercase mb-2">Corporate Command</h2>
        <p className="text-[#141414]/60 font-mono text-sm uppercase italic">Operational overview for {user.email}</p>
      </header>

      {/* Wallet Display Section */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Personal Wallet */}
        <div className="border border-[#141414]/20 bg-gray-50 p-6 relative overflow-hidden text-gray-500">
          <div className="flex justify-between items-center mb-4">
             <div className="font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                <Wallet size={14} />
                Personal Wallet
             </div>
             <div className="flex items-center gap-1 text-[10px] uppercase font-mono bg-gray-200 px-2 py-0.5 rounded">
               <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> Live
             </div>
          </div>
          <div className="mb-2">
             <div className="text-3xl font-bold text-gray-800">{btcBalancePersonal.toLocaleString()} <span className="text-sm font-normal">SATS</span></div>
             <div className="text-xs font-mono uppercase mt-1">~ ${(btcBalancePersonal * 0.00065).toFixed(2)} USD</div>
          </div>
        </div>

        {/* Corporate Wallet */}
        <div className="border-2 border-[#D4AF37] bg-[#FFFAF0] p-6 relative overflow-hidden">
          <div className="flex justify-between items-center mb-4">
             <div className="font-bold uppercase tracking-widest text-xs flex items-center gap-2 text-[#D4AF37]">
                <Building2 size={14} />
                Corporate Treasury {llc?.companyName ? `— ${llc.companyName}` : ''}
             </div>
             <div className="flex items-center gap-1 text-[10px] uppercase font-mono bg-[#D4AF37]/20 text-[#D4AF37] px-2 py-0.5 rounded">
               <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse"></div> Live
             </div>
          </div>
          
          {walletsData.connected ? (
            <div className="grid grid-cols-2 gap-4">
               <div>
                 <div className="text-sm font-mono opacity-60 mb-1">Bitcoin</div>
                 <div className="text-2xl font-bold text-gray-900">{btcBalanceCorp.toLocaleString()} <span className="text-xs font-normal">SATS</span></div>
               </div>
               <div>
                  <div className="text-sm font-mono opacity-60 mb-1">Stablesats</div>
                  <div className="text-2xl font-bold text-gray-900">{usdBalanceCorp.toLocaleString()} <span className="text-xs font-normal">USD</span></div>
               </div>
               <div className="col-span-2 text-right mt-2">
                 <button onClick={handleDisconnectWallet} className="text-[10px] font-mono text-[#141414]/40 hover:text-[#141414] uppercase focus:outline-none transition-colors">Disconnect Treasury</button>
               </div>
            </div>
          ) : (
            <div className="flex flex-col justify-center h-full">
               <div className="text-xs font-mono uppercase text-[#D4AF37]/80 text-center">
                 {isLlcActive ? 'Connect your Blink API key to activate.' : 'Complete LLC formation to activate your corporate treasury.'}
               </div>
            </div>
          )}
        </div>
      </div>

      {isLlcActive && !walletsData.connected && (
        <div className="border border-[#141414] bg-white p-8">
           <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-[#D4AF37]/20 text-[#D4AF37] rounded-full">
               <Wallet size={24} />
             </div>
             <h3 className="text-2xl font-bold uppercase tracking-tighter">Activate Your Corporate Treasury</h3>
           </div>
           <p className="text-[#141414]/80 mb-6 font-mono text-sm uppercase leading-relaxed max-w-2xl">
              Connect your Blink wallet to view your Bitcoin and USD balances, generate Lightning invoices, and track corporate payments. 
           </p>
           {!showActivateForm ? (
             <button
               onClick={() => setShowActivateForm(true)}
               className="bg-[#141414] text-white px-6 py-3 font-bold uppercase tracking-widest hover:bg-black transition-colors"
             >
               Activate
             </button>
           ) : (
             <form onSubmit={handleConnectWallet} className="flex flex-col md:flex-row gap-4 mb-4">
                <input 
                  type="text" 
                  placeholder="Enter your Blink API key..." 
                  className="flex-1 p-3 border border-[#141414] font-mono text-sm bg-gray-50 focus:outline-none"
                  value={walletConnectInput}
                  onChange={(e) => setWalletConnectInput(e.target.value)}
                  required
                />
                <button 
                  type="submit" 
                  disabled={isConnectingWallet}
                  className="bg-[#141414] text-white px-6 py-3 font-bold uppercase tracking-widest hover:bg-black transition-colors shrink-0"
                >
                  {isConnectingWallet ? 'Activating...' : 'Activate Treasury'}
                </button>
             </form>
           )}
           {showActivateForm && (
             <a href="https://dashboard.blink.sv" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold uppercase text-blue-600 hover:text-blue-800 transition-colors mt-4">
                Get your API key at dashboard.blink.sv → API Keys <ExternalLink size={14} />
             </a>
           )}
        </div>
      )}

      {isLlcActive && (
        <div className="border border-[#141414] bg-white p-6 md:p-8">
           <h3 className="text-xl font-bold uppercase mb-2">Complete Your Stack</h3>
           <p className="text-[#141414]/60 mb-6 font-mono text-xs uppercase">Your LLC is registered. Now give it spending power.</p>
           
           <div className="space-y-4 mb-8">
              <div className="flex items-center gap-4 p-4 border border-[#141414]/20 bg-gray-50">
                 <CheckCircle2 className="text-green-600" size={24} />
                 <div>
                   <div className="font-bold uppercase tracking-widest text-sm">Próspera ZEDE LLC</div>
                   <div className="text-xs font-mono opacity-60">Registered under Common Law</div>
                 </div>
              </div>
              <div className="flex items-center gap-4 p-4 border border-[#141414]/20 bg-gray-50">
                 {walletsData.connected ? <CheckCircle2 className="text-green-600" size={24} /> : <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />}
                 <div>
                   <div className="font-bold uppercase tracking-widest text-sm">Blink Corporate Treasury</div>
                   <div className="text-xs font-mono opacity-60">{walletsData.connected ? 'Activated' : 'Pending activation'}</div>
                 </div>
              </div>
              <div className="flex items-center gap-4 p-4 border border-[#141414] bg-white shadow-sm">
                 <div className="w-6 h-6 border-2 border-[#141414] rounded-full flex items-center justify-center text-xs font-bold">3</div>
                 <div>
                   <div className="font-bold uppercase tracking-widest text-sm">Bitcoin Spending Card</div>
                   <div className="text-xs font-mono opacity-60">Pending selection</div>
                 </div>
              </div>
           </div>

           <div className="border-t border-[#141414]/10 pt-6">
              <h4 className="font-bold uppercase tracking-widest mb-4">Select your Card</h4>
              <div className="grid md:grid-cols-3 gap-4">
                 <a href="https://boltcard.org" target="_blank" rel="noreferrer" className="block p-4 border border-[#141414]/20 hover:border-[#141414] group transition-all">
                    <CreditCard className="mb-3 text-[#141414]/60 group-hover:text-[#141414] transition-colors" size={24} />
                    <div className="font-bold uppercase mb-2">Bolt Card</div>
                    <div className="text-[10px] font-mono opacity-70 mb-4 leading-relaxed">Lightning NFC card. Links directly to your Blink wallet. Tap to pay at Lightning merchants worldwide. The most Bitcoin-native option.</div>
                    <div className="flex items-center gap-1 text-xs font-bold text-blue-600">Get Card <ChevronRight size={14} /></div>
                 </a>
                 <a href="https://nexo.com/nexo-card" target="_blank" rel="noreferrer" className="block p-4 border border-[#141414]/20 hover:border-[#141414] group transition-all">
                    <CreditCard className="mb-3 text-[#141414]/60 group-hover:text-[#141414] transition-colors" size={24} />
                    <div className="font-bold uppercase mb-2">Nexo Card</div>
                    <div className="text-[10px] font-mono opacity-70 mb-4 leading-relaxed">Borrow against your Bitcoin. Spend USD without selling your sats. Your Bitcoin stays in cold storage and keeps growing.</div>
                    <div className="flex items-center gap-1 text-xs font-bold text-blue-600">Get Card <ChevronRight size={14} /></div>
                 </a>
                 <a href="https://lightspark.com/grid" target="_blank" rel="noreferrer" className="block p-4 border border-[#141414]/20 hover:border-[#141414] group transition-all">
                    <CreditCard className="mb-3 text-[#141414]/60 group-hover:text-[#141414] transition-colors" size={24} />
                    <div className="font-bold uppercase mb-2">Lightspark Grid</div>
                    <div className="text-[10px] font-mono opacity-70 mb-4 leading-relaxed">Bitcoin-settled dollar accounts with Visa debit card. Spend at 175 million merchants globally across 33 countries.</div>
                    <div className="flex items-center gap-1 text-xs font-bold text-blue-600">Get Card <ChevronRight size={14} /></div>
                 </a>
              </div>
              <div className="mt-6 bg-[#141414]/5 p-4 text-xs font-mono uppercase flex flex-col md:flex-row gap-4 items-center justify-between border border-[#141414]/10">
                 <div><span className="font-bold">Guide:</span> Do you want to spend Bitcoin directly or borrow against it? Do you prefer Lightning or Visa?</div>
              </div>
           </div>
        </div>
      )}

      {isLlcActive && (
        <div className="border border-[#141414] bg-[#141414] text-white p-6 md:p-8">
           <div className="flex items-center gap-3 mb-2">
             <Users size={24} />
             <h3 className="text-xl font-bold uppercase tracking-tighter">Refer & Earn</h3>
           </div>
           <p className="text-white/60 mb-6 font-mono text-xs uppercase leading-relaxed max-w-2xl">
             Share your sovereign business journey. Earn Próspera coupon codes for renewal discounts when your referrals incorporate.
           </p>

           <div className="bg-white/10 p-4 border border-white/20 flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
             <div>
               <div className="text-[10px] font-mono uppercase opacity-50 mb-1">Your Unique Referral Link</div>
               <div className="font-mono text-lg">{referralLink}</div>
             </div>
             <button 
               onClick={() => {
                 navigator.clipboard.writeText(referralLink);
                 setCopied(true);
                 setTimeout(() => setCopied(false), 2000);
               }}
               className="bg-white text-black px-4 py-2 font-bold uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-gray-200 transition-colors shrink-0"
             >
               {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
               {copied ? 'Copied!' : 'Copy Link'}
             </button>
           </div>

           <div className="grid grid-cols-2 gap-4 mb-8">
             <a href={`https://wa.me/?text=${encodeURIComponent(whatsappShare)}`} target="_blank" rel="noreferrer" className="block text-center p-3 border border-white/20 hover:bg-white/10 transition-colors text-xs font-bold uppercase tracking-widest">
               Share on WhatsApp
             </a>
             <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterShare)}`} target="_blank" rel="noreferrer" className="block text-center p-3 border border-white/20 hover:bg-white/10 transition-colors text-xs font-bold uppercase tracking-widest">
               Share on X
             </a>
           </div>

           <div>
             <h4 className="font-bold uppercase tracking-widest text-sm mb-4 border-b border-white/20 pb-2">Referral History</h4>
             {referrals.length === 0 ? (
               <div className="text-xs font-mono opacity-50 uppercase text-center py-4">No referrals yet</div>
             ) : (
               <div className="space-y-3">
                 {referrals.map(ref => (
                   <div key={ref.id} className="flex items-center justify-between border-b border-white/10 pb-2 text-sm font-mono">
                     <span className="opacity-80">{ref.referred_user_email}</span>
                     {ref.coupon_assigned ? (
                       <span className="text-green-400 font-bold uppercase text-[10px]">Coupon Ready</span>
                     ) : (
                       <span className="text-yellow-400 uppercase text-[10px]">Processing</span>
                     )}
                   </div>
                 ))}
               </div>
             )}
           </div>
        </div>
      )}


      <div className="grid md:grid-cols-2 gap-6">
        {/* Residency Card */}
        <div className="border border-[#141414] bg-white p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-[#141414] text-[#E4E3E0]">
              <ShieldCheck size={24} />
            </div>
            <StatusBadge status={resident?.status} />
          </div>
          <h3 className="text-xl font-bold uppercase mb-1">e-Residency Status</h3>
          <p className="text-sm text-[#141414]/60 mb-6">Legal standing for physical or digital presence in Próspera.</p>
          
          {resident ? (
            <div className="space-y-3 font-mono text-xs uppercase">
              <div className="flex justify-between border-b border-dotted border-[#141414]/20 pb-2">
                <span>Entity ID</span>
                <span className="font-bold">{resident.id.split('-')[0]}...</span>
              </div>
              <div className="flex justify-between border-b border-dotted border-[#141414]/20 pb-2">
                <span>Legal Name</span>
                <span className="font-bold">{resident.name || resident.email?.split('@')[0]}</span>
              </div>
              <div className="flex justify-between border-b border-dotted border-[#141414]/20 pb-2">
                <span>Tier</span>
                <span className="font-bold">E-RESIDENT</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center border-2 border-dashed border-[#141414]/10">
              <span className="text-xs font-mono opacity-40 uppercase">No active application</span>
            </div>
          )}
        </div>

        {/* LLC Card */}
        <div className="border border-[#141414] bg-white p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-[#141414] text-[#E4E3E0]">
              <Building2 size={24} />
            </div>
            <StatusBadge status={llc?.status} />
          </div>
          <h3 className="text-xl font-bold uppercase mb-1">LLC Jurisdiction</h3>
          <p className="text-sm text-[#141414]/60 mb-6">Corporate entity governing assets and liabilities under ZEDE law.</p>
          
          {llc ? (
            <div className="space-y-3 font-mono text-xs uppercase">
              <div className="flex justify-between border-b border-dotted border-[#141414]/20 pb-2">
                <span>Register ID</span>
                <span className="font-bold">{llc.id.split('-')[0]}...</span>
              </div>
              <div className="flex justify-between border-b border-dotted border-[#141414]/20 pb-2">
                <span>Company</span>
                <span className="font-bold">{llc.companyName}</span>
              </div>
              <div className="flex justify-between border-b border-dotted border-[#141414]/20 pb-2">
                <span>Framework</span>
                <span className="font-bold">{llc.framework}</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center border-2 border-dashed border-[#141414]/10">
              <span className="text-xs font-mono opacity-40 uppercase">No registered entities</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 py-4 px-6 border border-[#141414] bg-[#141414]/5 text-xs font-mono uppercase">
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        <span>Real-time persistence enabled via Firestore.</span>
      </div>

      {/* Próspera Portal Links */}
      <div className="pt-8">
        <h3 className="text-xl font-bold uppercase mb-4">Próspera Portal</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a href="https://portal.eprospera.com/en/tax" target="_blank" rel="noreferrer" className="p-4 border border-[#141414] bg-white hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors flex items-center justify-between group">
            <span className="font-bold uppercase tracking-widest text-sm">Tax</span>
            <ExternalLink size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
          </a>
          <a href="https://portal.eprospera.com/en/insurance" target="_blank" rel="noreferrer" className="p-4 border border-[#141414] bg-white hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors flex items-center justify-between group">
            <span className="font-bold uppercase tracking-widest text-sm">Insurance</span>
            <ExternalLink size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
          </a>
          <a href="https://portal.eprospera.com/en/documents" target="_blank" rel="noreferrer" className="p-4 border border-[#141414] bg-white hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors flex items-center justify-between group">
            <span className="font-bold uppercase tracking-widest text-sm">Docs</span>
            <ExternalLink size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
          </a>
          <a href="https://portal.eprospera.com/en/billing" target="_blank" rel="noreferrer" className="p-4 border border-[#141414] bg-white hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors flex items-center justify-between group">
            <span className="font-bold uppercase tracking-widest text-sm">Billing</span>
            <ExternalLink size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
          </a>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;

  const config: any = {
    pending_payment: { icon: Clock, label: 'PAYMENT PENDING', color: 'bg-yellow-100 text-yellow-800' },
    processing: { icon: RefreshCw, label: 'ZEDE REVIEW', color: 'bg-blue-100 text-blue-800' },
    active: { icon: CheckCircle2, label: 'ACTIVE / VERIFIED', color: 'bg-green-100 text-green-800' },
    rejected: { icon: AlertTriangle, label: 'REJECTED', color: 'bg-red-100 text-red-800' },
  };

  const { icon: Icon, label, color } = config[status] || config.pending_payment;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase ${color}`}>
      <Icon size={12} className={status === 'processing' || status === 'pending_signature' ? 'animate-spin' : ''} />
      <span>{label}</span>
    </div>
  );
}
