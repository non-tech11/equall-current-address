import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AddressForm from './address/AddressForm';

/**
 * Dev harness for the address screen: `npm run dev` → /address-demo.html
 * Submitted payload and analytics events print to the console.
 */
function Demo() {
  const [saved, setSaved] = useState(null);

  if (saved) {
    return (
      <pre style={{ padding: 16, fontSize: 12, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(saved, null, 2)}
        {'\n\n'}
        <button onClick={() => setSaved(null)}>← back to form</button>
      </pre>
    );
  }

  return (
    <AddressForm
      title="Current address"
      onBack={() => console.log('back')}
      onEvent={(name, data) => console.log('[event]', name, data)}
      onSubmit={(payload) => {
        console.log('[submit]', payload);
        setSaved(payload);
      }}
    />
  );
}

createRoot(document.getElementById('address-root')).render(<Demo />);
