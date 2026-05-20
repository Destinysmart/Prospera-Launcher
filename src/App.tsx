/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ResidencyFlow } from './components/ResidencyFlow';
import { LLCFlow } from './components/LLCFlow';
import { AgentWebhooks } from './components/AgentWebhooks';
import { Invoices } from './components/Invoices';
import { motion, AnimatePresence } from 'motion/react';
import { auth, signInWithGoogle } from './services/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { Lock, LogIn, LogOut, ArrowRight, Building2, Bitcoin, CreditCard } from 'lucide-react';

import { Settings } from './components/Settings';
import { Settings as SettingsIcon } from 'lucide-react';

type View = 'dashboard' | 'residency' | 'llc' | 'invoices' | 'webhooks' | 'settings';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [residentId, setResidentId] = useState<string | null>(localStorage.getItem('residentId'));
  const [llcId, setLlcId] = useState<string | null>(localStorage.getItem('llcId'));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      
      if (u) {
         const ref = localStorage.getItem('referralCode');
         if (ref && !localStorage.getItem('referralRedeemed')) {
             try {
                 const token = await u.getIdToken();
                 fetch('/api/referrals/redeem', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ code: ref, email: u.email })
                 }).then(() => {
                    localStorage.setItem('referralRedeemed', 'true');
                 });
             } catch(e) {}
         }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (residentId) localStorage.setItem('residentId', residentId);
    if (llcId) localStorage.setItem('llcId', llcId);
  }, [residentId, llcId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('referralCode', ref);
    }
  }, []);

  const renderView = () => {
    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center pt-8">
          <h2 className="text-4xl md:text-5xl font-bold uppercase mb-4 tracking-tighter leading-tight max-w-4xl mx-auto">
            You've stacked the sats. Now give them a legal home, a bank account, and a business structure — paid entirely in Bitcoin, incorporated in 48 hours.
          </h2>
          <p className="text-[#141414]/80 max-w-2xl mx-auto mb-12 font-mono text-sm uppercase leading-relaxed tracking-wide">
            Próspera ZEDE LLC registration. Blink corporate wallet. Bitcoin spending card. No bank. No credit check. No legacy system.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-5xl mx-auto text-left">
            <div className="p-6 border border-[#141414] bg-white">
               <Building2 className="mb-4" size={32} />
               <h3 className="font-bold uppercase tracking-widest mb-2 text-sm">Global LLC in 48 hours</h3>
               <p className="text-sm opacity-70 font-mono">Register a Próspera ZEDE LLC under Common Law, recognised internationally.</p>
            </div>
            <div className="p-6 border border-[#141414] bg-white">
               <Bitcoin className="mb-4" size={32} />
               <h3 className="font-bold uppercase tracking-widest mb-2 text-sm">Pay in Bitcoin via Blink</h3>
               <p className="text-sm opacity-70 font-mono">No credit card needed. Pay your incorporation fees in sats via Lightning.</p>
            </div>
            <div className="p-6 border border-[#141414] bg-white">
               <CreditCard className="mb-4" size={32} />
               <h3 className="font-bold uppercase tracking-widest mb-2 text-sm">Complete financial stack</h3>
               <p className="text-sm opacity-70 font-mono">Corporate wallet, invoice generator, and Bitcoin spending card — all from one app.</p>
            </div>
          </div>

          <button
            onClick={signInWithGoogle}
            className="flex items-center gap-3 bg-[#141414] text-[#E4E3E0] px-10 py-5 font-bold uppercase tracking-widest hover:bg-black transition-all"
          >
            Get Started with Your LLC <ArrowRight size={20} />
          </button>
        </div>
      );
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard residentId={residentId} llcId={llcId} user={user} />;
      case 'residency':
        return <ResidencyFlow user={user} onComplete={(id) => { setResidentId(id); }} />;
      case 'llc':
        return <LLCFlow user={user} onComplete={(id) => { setLlcId(id); setCurrentView('dashboard'); }} />;
      case 'invoices':
        return <Invoices user={user} llcId={llcId} />;
      case 'webhooks':
        return <AgentWebhooks user={user} />;
      case 'settings':
        return <Settings user={user} residentId={residentId} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#141414] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      <Layout currentView={currentView} setView={setCurrentView} user={user}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView + (user ? 'auth' : 'no-auth')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-4 md:p-8"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </Layout>
    </div>
  );
}

