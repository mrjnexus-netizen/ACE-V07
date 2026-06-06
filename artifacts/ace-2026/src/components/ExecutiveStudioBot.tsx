import { useState } from 'react';
import { useIdentity } from '../context/IdentityContext';

export default function ExecutiveStudioBot() {
  const { playlist, locale } = useIdentity();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-accent text-surface shadow-lg z-50 flex items-center justify-center text-2xl"
      >
        💬
      </button>
      {isOpen && (
        <div className="fixed bottom-32 right-6 w-80 h-96 bg-surface2 rounded-lg shadow-xl border border-border z-50 flex flex-col">
          <div className="p-3 border-b border-border font-mono text-sm">Studio Bot</div>
          <div className="flex-1 p-3 overflow-y-auto text-sm">
            {playlist.length === 0 ? 'No tracks yet.' : `${playlist.length} tracks available`}
          </div>
        </div>
      )}
    </>
  );
}