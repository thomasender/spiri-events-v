import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { attachmentUrl } from '../hooks/useLedger';

// One receipt as a small chip. The download URL is fetched on click, so nothing
// with an access token is kept in the page or in Firestore.
export default function LedgerAttachmentLink({ attachment }) {
  const [failed, setFailed] = useState(false);

  async function open() {
    setFailed(false);
    // Opened synchronously so the popup blocker lets it through.
    const tab = window.open('', '_blank');
    try {
      const url = await attachmentUrl(attachment);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      console.error('ledger attachment:', err);
      tab?.close();
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      className={`ledger-attachment${failed ? ' is-failed' : ''}`}
      onClick={open}
      title={failed ? 'Beleg konnte nicht geöffnet werden' : attachment.name}
      data-testid="ledger-attachment"
    >
      <Paperclip size={12} aria-hidden="true" />
      <span>{failed ? 'Fehler beim Öffnen' : attachment.name}</span>
    </button>
  );
}
