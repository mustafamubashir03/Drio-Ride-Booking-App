import { useRef, useState, type ChangeEvent } from "react";
import {
  DRIVER_DOCUMENT_LABELS,
  DRIVER_DOCUMENT_MAX_SIZE,
  DRIVER_DOCUMENT_TYPES,
  uploadDriverDocument,
  type DriverApplicationDocument,
  type DriverDocumentType,
} from "@/lib/driver-api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, RefreshCw, UploadCloud, FileText } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function formatUploadedAt(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isPdfDocument(doc: DriverApplicationDocument): boolean {
  if (doc.secureUrl.toLowerCase().endsWith(".pdf")) return true;
  if (doc.originalFilename?.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

function getDocumentIcon(doc: DriverApplicationDocument) {
  return isPdfDocument(doc) ? FileText : CheckCircle2;
}

type SlotProps = {
  documentType: DriverDocumentType;
  existing: DriverApplicationDocument | undefined;
  disabled: boolean;
  onUploaded: (documents: DriverApplicationDocument[]) => void;
};

function DocumentSlot({ documentType, existing, disabled, onUploaded }: SlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);

    if (!ALLOWED_MIME.includes(file.type)) {
      setError("Unsupported file type. Only JPG, PNG, WEBP or PDF are accepted.");
      return;
    }
    if (file.size > DRIVER_DOCUMENT_MAX_SIZE) {
      setError("File is too large. Maximum allowed size is 5 MB.");
      return;
    }

    setUploading(true);
    uploadDriverDocument({ documentType, file })
      .then((result) => {
        const list = Array.isArray(result.documents) ? result.documents : [];
        onUploaded(list);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Could not upload your document. Please try again."
        );
      })
      .finally(() => {
        setUploading(false);
      });
  };

  const inputElement = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={handlePick}
    />
  );

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        existing
          ? "border-drio-success/30 bg-drio-success/5"
          : "border-border bg-card"
      }`}
    >
      {inputElement}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">
            {DRIVER_DOCUMENT_LABELS[documentType]}
          </p>
          {existing ? (
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-1.5">
                {(() => {
                  const Icon = getDocumentIcon(existing);
                  return <Icon className="h-3.5 w-3.5 text-drio-success shrink-0" />;
                })()}
                <span className="truncate text-[12px] text-muted-foreground">
                  {existing.originalFilename ?? "Uploaded"}
                  {existing.uploadedAt
                    ? ` · ${formatUploadedAt(existing.uploadedAt)}`
                    : ""}
                </span>
              </div>
              <div>
                <a
                  href={existing.secureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[12px] font-semibold text-primary hover:text-drio-accent-hover transition-colors"
                >
                  {isPdfDocument(existing) ? "View PDF ↗" : "View document ↗"}
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">
              JPG, PNG, WEBP or PDF · max 5 MB
            </p>
          )}
          {error && <p className="mt-1.5 text-[12px] text-destructive">{error}</p>}
        </div>

        <Button
          type="button"
          variant={existing ? "outline" : "default"}
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="shrink-0"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : existing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Replace
            </>
          ) : (
            <>
              <UploadCloud className="h-3.5 w-3.5" />
              Upload
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function DocumentUploadSection(props: {
  documents: DriverApplicationDocument[];
  disabled: boolean;
  onUploaded: (documents: DriverApplicationDocument[]) => void;
}) {
  return (
    <div className="space-y-3">
      {DRIVER_DOCUMENT_TYPES.map((type) => (
        <DocumentSlot
          key={type}
          documentType={type}
          existing={props.documents.find((doc) => doc.documentType === type)}
          disabled={props.disabled}
          onUploaded={props.onUploaded}
        />
      ))}
    </div>
  );
}