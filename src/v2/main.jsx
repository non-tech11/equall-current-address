import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AddressForm from '../address/AddressForm';
import PlaceSearch from '../address/PlaceSearch';

/**
 * v2 demo: the v1 screen plus a Google Places search that prefills the
 * structured fields. `npm run dev` → /v2.html (deployed: /current_address_v2).
 * Key comes from VITE_GOOGLE_MAPS_API_KEY (.env.local / Vercel env).
 */
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function Demo() {
  const [saved, setSaved] = useState(null);
  const onEvent = (name, data) => console.log('[event]', name, data);

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
      onEvent={onEvent}
      renderSearch={(props) => <PlaceSearch apiKey={API_KEY} {...props} />}
      onSubmit={(payload) => {
        console.log('[submit]', payload);
        setSaved(payload);
      }}
    />
  );
}

createRoot(document.getElementById('address-root')).render(<Demo />);
