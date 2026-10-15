'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { isSetupDone } from '@/lib/auth';
import { serverConfig } from '@/lib/serverConfig';

const SetupForm = dynamic(() => import('./SetupForm').then(mod => mod.SetupForm));

export function SetupGate({ children }: { children: React.ReactNode }) {
  const [need, setNeed] = useState<boolean | null>(null);
  useEffect(() => { setNeed(!serverConfig() && !isSetupDone()); }, []);
  if (need === null) return null;
  return need ? <SetupForm /> : <>{children}</>;
}
