"use client";

import { useCallback, useState } from "react";
import { Upload, File } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export function DropZone({ onUpload, isUploading }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onUpload(file);
    },
    [onUpload]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(file);
      e.target.value = "";
    },
    [onUpload]
  );

  return (
    <label
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all py-10 px-6",
        isDragging
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--border-2)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]",
        isUploading && "pointer-events-none opacity-60"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="sr-only"
        accept="image/*,video/*,audio/*,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.mkv,.mp3,.wav,.m4a"
        onChange={handleChange}
        disabled={isUploading}
      />
      {isUploading ? (
        <>
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <p className="text-sm text-[var(--text-2)]">กำลังอัปโหลด...</p>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-[var(--surface-3)] flex items-center justify-center">
            <Upload size={22} className="text-[var(--text-2)]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--text)]">วางหรืออัปโหลดไฟล์</p>
            <p className="text-xs text-[var(--text-3)] mt-1">JPG · PNG · MP4 · MOV · MP3 · WAV · สูงสุด 500 MB</p>
          </div>
        </>
      )}
    </label>
  );
}
