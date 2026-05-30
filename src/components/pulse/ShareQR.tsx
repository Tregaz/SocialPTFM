import { Check, Copy, QrCode, ScanLine } from "lucide-react";
import { useState } from "react";

interface Props {
  userId: string;
  eventId: string;
  zona: string;
  displayName: string;
}

export function ShareQR({ userId, eventId, zona, displayName }: Props) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}?invitedBy=${userId}&eventId=${eventId}&zona=${encodeURIComponent(zona)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <QrCode className="h-4 w-4" />
        Invita a un amigo
      </div>

      {/* QR code */}
      <div className="neon-border rounded-2xl bg-white p-3">
        <img
          src={qrUrl}
          alt="QR de invitación"
          className="h-56 w-56 rounded-xl"
          crossOrigin="anonymous"
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Escanea para unirte a <span className="font-bold text-foreground">{displayName}</span>{" "}
        en <span className="font-semibold neon-text">{zona}</span>
      </p>

      {/* Acciones */}
      <div className="flex w-full gap-3">
        <button
          onClick={handleCopy}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-2 py-3 text-sm font-semibold transition hover:bg-surface-2/80"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-[var(--neon-2)]" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copiar Link
            </>
          )}
        </button>

        <button
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--neon)] py-3 text-sm font-bold text-background transition active:scale-95"
        >
          <ScanLine className="h-4 w-4" /> Scan Friend
        </button>
      </div>
    </div>
  );
}