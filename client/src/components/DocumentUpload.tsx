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
import {
  CheckCircle2,
  CircleAlert,
  FileImage,
  FileText,
  Loader2,
  RefreshCw,
  UploadCloud,
} from "lucide-react";

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

function getDocumentFormatMeta(doc: DriverApplicationDocument) {
  return isPdfDocument(doc)
    ? {
        icon: FileText,
        chip: "bg-drio-violet/12 text-drio-violet",
        link: "View PDF ↗",
      }
    : {
        icon: FileImage,
        chip: "bg-drio-blue/12 text-drio-blue",
        link: "View document ↗",
      };
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

  const format = existing ? getDocumentFormatMeta(existing) : null;
  const FormatIcon = format?.icon;

  return (
    <div
      className={`rounded-xl border p-4 transition-colors duration-200 focus-within:border-primary/35 motion-reduce:transition-none ${
        existing
          ? "border-drio-success/25 bg-drio-success/5"
          : "border-border bg-card"
      }`}
    >
      {inputElement}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">
            {DRIVER_DOCUMENT_LABELS[documentType]}
          </p>
          {existing && format && FormatIcon ? (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${format.chip}`}
                >
                  <FormatIcon className="h-3 w-3" />
                </span>
                <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                  {existing.originalFilename ?? "Uploaded"}
                  {existing.uploadedAt
                    ? ` · ${formatUploadedAt(existing.uploadedAt)}`
                    : ""}
                </span>
              </div>
              <div className="pl-8">
                <a
                  href={existing.secureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md text-[12px] font-semibold text-primary transition-colors duration-150 hover:text-drio-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
                >
                  {format.link}
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">
              JPG, PNG, WEBP or PDF · max 5 MB
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1.5 text-[12px] break-words text-destructive [overflow-wrap:anywhere]"
            >
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {existing && (
            <span className="flex items-center gap-1 text-[10.5px] font-semibold text-drio-success">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Uploaded
            </span>
          )}
          <Button
            type="button"
            variant={existing ? "outline" : "default"}
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Uploading…
              </>
            ) : existing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Replace
              </>
            ) : (
              <>
                <UploadCloud className="h-3.5 w-3.5" aria-hidden />
                Upload
              </>
            )}
          </Button>
        </div>
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