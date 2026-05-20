import React, { useState, useEffect } from 'react';
import { User, signOut } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Save, LogOut, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';

interface SettingsProps {
  user: User;
  residentId: string | null;
}

export function Settings({ user, residentId }: SettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Profile
  const [displayName, setDisplayName] = useState(user.displayName || '');
  
  // Wallet
  const [blinkConnected, setBlinkConnected] = useState(false);
  const [blinkApiKey, setBlinkApiKey] = useState(''); // Only used to display masked info or pass new key
  
  // Notifications
  const [notifyResidency, setNotifyResidency] = useState(true);
  const [notifyLLC, setNotifyLLC] = useState(true);
  const [notifyReferral, setNotifyReferral] = useState(true);
  const [notifyInvoice, setNotifyInvoice] = useState(true);

  // Referrals
  const [referralCount, setReferralCount] = useState(0);
  const [couponCount, setCouponCount] = useState(0);
  const [referralCode, setReferralCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDisplayName(data.displayName || user.displayName || '');
          setBlinkConnected(!!data.blink_connected);
          
          if (data.notifications) {
            setNotifyResidency(data.notifications.residency ?? true);
            setNotifyLLC(data.notifications.llc ?? true);
            setNotifyReferral(data.notifications.referral ?? true);
            setNotifyInvoice(data.notifications.invoice ?? true);
          }
        }

        // We can just use the resident string if we want to display full resident info
        if (residentId) {
             const refCode = `ZEDE-${residentId.substring(0, 6).toUpperCase()}`;
             setReferralCode(refCode);
        }
      } catch (err) {
        console.error("Failed to load user settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [user.uid, residentId]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        displayName
      });
      // Show subtle saved msg
      showSaved();
    } catch(e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        notifications: {
          residency: notifyResidency,
          llc: notifyLLC,
          referral: notifyReferral,
          invoice: notifyInvoice
        }
      });
      showSaved();
    } catch(e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDisconnectWallet = async () => {
    if (!window.confirm("Are you sure you want to disconnect your Blink treasury?")) return;
    try {
       await fetch('/api/wallets/disconnect-corporate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid })
       });
       
       const { updateDoc, doc, deleteField } = await import('firebase/firestore');
       const { db } = await import('../services/firebase');
       await updateDoc(doc(db, 'users', user.uid), {
          blink_api_key: deleteField(),
          blink_btc_wallet_id: deleteField(),
          blink_usd_wallet_id: deleteField(),
          blink_connected: false,
          blink_connected_at: deleteField()
       });

       setBlinkConnected(false);
       setBlinkApiKey('');
    } catch(err) {
       console.error(err);
    }
  };

  const handleConnectWallet = async () => {
    if (!blinkApiKey) return;
    setSaving(true);
    try {
      const res = await fetch('/api/wallets/connect-corporate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: blinkApiKey, userId: user.uid })
      });
      if (res.ok) {
        const { data } = await res.json();
        
        const { setDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        await setDoc(doc(db, 'users', user.uid), {
           ...data
        }, { merge: true });

        setBlinkConnected(true);
        setBlinkApiKey('');
        showSaved();
      } else {
        const err = await res.json();
        alert(err.error || 'Could not connect workspace wallet.');
      }
    } catch(e) {
      console.error(e);
      alert('Network error connecting wallet.');
    }
    setSaving(false);
  };

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return <div className="text-xs font-mono uppercase opacity-50">Loading Identity Configuration...</div>;
  }

  const initials = (displayName || user.email || 'S')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="max-w-3xl space-y-12 pb-20">
      <header className="flex justify-between items-end">
        <div>
           <h2 className="text-4xl font-bold tracking-tight uppercase mb-2">Identity & Configuration</h2>
           <p className="text-[#141414]/60 font-mono text-sm uppercase italic">Global Settings for {user.email}</p>
        </div>
        {saved && (
           <div className="flex items-center gap-2 text-green-700 font-bold uppercase tracking-widest text-xs animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 size={16} /> Saved
           </div>
        )}
      </header>

      {/* Profile Section */}
      <section className="border border-[#141414] bg-white p-6 md:p-8">
         <h3 className="text-xl font-bold uppercase mb-6 border-b border-[#141414]/10 pb-2">Profile</h3>
         <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-shrink-0">
               <div className="w-24 h-24 bg-[#141414] text-[#E4E3E0] flex items-center justify-center text-3xl font-bold uppercase">
                 {initials}
               </div>
            </div>
            <div className="flex-1 space-y-4">
               <div>
                 <label className="block text-[10px] font-mono uppercase opacity-70 mb-1">Display Name</label>
                 <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={displayName} 
                      onChange={e => setDisplayName(e.target.value)} 
                      className="flex-1 p-3 border border-[#141414]/20 focus:border-[#141414] focus:outline-none" 
                    />
                    <button onClick={handleSaveProfile} className="bg-[#141414] text-white px-6 font-bold uppercase tracking-widest text-xs hover:bg-black transition-colors">
                       Save
                    </button>
                 </div>
               </div>
               <div>
                 <label className="block text-[10px] font-mono uppercase opacity-70 mb-1">Email (Read Only)</label>
                 <input type="text" value={user.email || ''} readOnly className="w-full p-3 border border-[#141414]/10 bg-gray-50 opacity-70 cursor-not-allowed focus:outline-none" />
               </div>
               <div>
                 <label className="block text-[10px] font-mono uppercase opacity-70 mb-1">Próspera Permit Number</label>
                 <input type="text" value={residentId || 'Pending Formation'} readOnly className="w-full p-3 border border-[#141414]/10 bg-gray-50 opacity-70 font-mono text-sm cursor-not-allowed focus:outline-none" />
               </div>
            </div>
         </div>
      </section>

      {/* Wallet Section */}
      <section className="border border-[#141414] bg-white p-6 md:p-8">
         <h3 className="text-xl font-bold uppercase mb-6 border-b border-[#141414]/10 pb-2 flex items-center gap-2">
            Corporate Treasury Connection
         </h3>
         
         {blinkConnected ? (
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-green-700 font-bold uppercase text-xs tracking-widest mb-4">
                  <CheckCircle2 size={16} /> Blink Wallet Connected
               </div>
               
               <div>
                  <label className="block text-[10px] font-mono uppercase opacity-70 mb-1">Blink API Key</label>
                  <div className="flex gap-2">
                     <div className="flex-1 flex items-center justify-between p-3 border border-[#141414]/20 bg-gray-50">
                        <span className="font-mono text-sm">••••••••••••••••••••••••••••••••</span>
                        <div className="text-[10px] uppercase font-bold text-[#141414]/50">Encrypted</div>
                     </div>
                  </div>
                  <p className="text-[10px] font-mono uppercase opacity-60 mt-2">API key is securely encrypted at rest. If you need to change wallets, disconnect and reconnect.</p>
               </div>

               <div className="pt-4 mt-4 border-t border-[#141414]/10">
                  <button onClick={handleDisconnectWallet} className="text-red-600 font-bold uppercase text-xs tracking-widest hover:text-red-800 transition-colors">
                     Disconnect Wallet
                  </button>
               </div>
            </div>
         ) : (
            <div className="space-y-4">
               <div className="p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm font-mono uppercase">
                  No corporate treasury connected.
               </div>
               <div>
                  <label className="block text-[10px] font-mono uppercase opacity-70 mb-1">Connect Blink API Key</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                     <input 
                       type="text" 
                       value={blinkApiKey} 
                       onChange={e => setBlinkApiKey(e.target.value)} 
                       placeholder="Enter your Blink API key..."
                       className="flex-1 p-3 border border-[#141414]/20 focus:border-[#141414] focus:outline-none font-mono text-sm" 
                     />
                     <button onClick={handleConnectWallet} disabled={!blinkApiKey} className="bg-[#141414] text-white px-6 py-3 font-bold uppercase tracking-widest text-xs hover:bg-black transition-colors disabled:opacity-50">
                        Connect
                     </button>
                  </div>
               </div>
            </div>
         )}
      </section>

      {/* Notifications Section */}
      <section className="border border-[#141414] bg-white p-6 md:p-8">
         <div className="flex justify-between items-center mb-6 border-b border-[#141414]/10 pb-2">
            <h3 className="text-xl font-bold uppercase">Notifications</h3>
            <button onClick={handleSaveNotifications} className="bg-[#141414] text-white px-4 py-2 font-bold uppercase text-[10px] tracking-widest hover:bg-black transition-colors">
               Save Prefs
            </button>
         </div>

         <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group">
               <input type="checkbox" checked={notifyResidency} onChange={e => setNotifyResidency(e.target.checked)} className="w-5 h-5 accent-[#141414]" />
               <span className="font-bold uppercase text-sm group-hover:text-gray-600 transition-colors">Email me when residency is approved</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
               <input type="checkbox" checked={notifyLLC} onChange={e => setNotifyLLC(e.target.checked)} className="w-5 h-5 accent-[#141414]" />
               <span className="font-bold uppercase text-sm group-hover:text-gray-600 transition-colors">Email me when LLC formation is complete</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
               <input type="checkbox" checked={notifyReferral} onChange={e => setNotifyReferral(e.target.checked)} className="w-5 h-5 accent-[#141414]" />
               <span className="font-bold uppercase text-sm group-hover:text-gray-600 transition-colors">Email me when a referral incorporates</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
               <input type="checkbox" checked={notifyInvoice} onChange={e => setNotifyInvoice(e.target.checked)} className="w-5 h-5 accent-[#141414]" />
               <span className="font-bold uppercase text-sm group-hover:text-gray-600 transition-colors">Email me when an invoice is overdue</span>
            </label>
         </div>
      </section>

      {/* Referral Section */}
      <section className="border border-[#141414] bg-white p-6 md:p-8">
         <h3 className="text-xl font-bold uppercase mb-6 border-b border-[#141414]/10 pb-2">Partner Program</h3>
         <div className="grid md:grid-cols-2 gap-8">
            <div>
               <label className="block text-[10px] font-mono uppercase opacity-70 mb-1">Your Unique Referral Link</label>
               {referralCode ? (
                  <div className="flex gap-2">
                     <input type="text" value={`https://prspera.com?ref=${referralCode}`} readOnly className="flex-1 p-3 border border-[#141414]/20 bg-gray-50 font-mono text-xs focus:outline-none" />
                     <button 
                        onClick={() => {
                           navigator.clipboard.writeText(`https://prspera.com?ref=${referralCode}`);
                           setCopied(true);
                           setTimeout(() => setCopied(false), 2000);
                        }}
                        className="bg-[#141414] text-white px-4 font-bold uppercase tracking-widest text-[#10px] hover:bg-black transition-colors"
                     >
                        {copied ? 'Copied' : 'Copy'}
                     </button>
                  </div>
               ) : (
                  <div className="p-3 border border-[#141414]/20 bg-gray-50 text-[10px] font-mono uppercase opacity-60">
                     Complete Residency to unlock
                  </div>
               )}
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 border border-[#141414]/10 bg-gray-50">
                  <div className="text-[10px] font-mono uppercase opacity-70 mb-1">Referrals</div>
                  <div className="text-3xl font-bold uppercase">{referralCount}</div>
               </div>
               <div className="p-4 border border-[#141414]/10 bg-gray-50">
                  <div className="text-[10px] font-mono uppercase opacity-70 mb-1">Coupon Codes</div>
                  <div className="text-3xl font-bold uppercase text-green-700">{couponCount}</div>
               </div>
            </div>
         </div>
      </section>

      {/* Danger Zone */}
      <section className="p-6 md:p-8 border border-red-200 bg-red-50">
         <h3 className="text-xl font-bold uppercase mb-2 text-red-800 flex items-center gap-2">
            <AlertTriangle size={20} /> Danger Zone
         </h3>
         <p className="text-[10px] font-mono uppercase text-red-800/70 mb-6">Irreversible destructive actions and authentication revoking.</p>
         
         <button 
            onClick={() => {
               if(window.confirm('Are you sure you want to sign out and de-authorize?')) {
                  signOut(auth);
               }
            }}
            className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-800 px-6 py-3 font-bold uppercase text-sm tracking-widest border border-red-300 transition-colors"
         >
            <LogOut size={16} /> Sign Out & De-authorize
         </button>
      </section>
    </div>
  );
}
