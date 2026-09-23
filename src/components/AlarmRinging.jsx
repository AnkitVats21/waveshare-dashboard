import React from 'react';
import { BellRing } from 'lucide-react';
import { Banner, Button } from './ui';
import { stopAlarm } from '../lib/api';
import { useToast } from './Toast';

export default function AlarmRinging() {
  const toast = useToast();
  const stop = async () => {
    try {
      await stopAlarm();
    } catch (err) {
      toast(`Couldn't stop the alarm: ${err.message}`, 'error');
    }
  };
  return (
    <Banner tone="warn" icon={BellRing} action={<Button variant="primary" onClick={stop}>Stop</Button>}>
      An alarm is ringing.
    </Banner>
  );
}
