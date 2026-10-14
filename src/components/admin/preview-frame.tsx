"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

/** Shows the saved article in a frame at desktop or phone width, so the mobile layout can be checked on any screen. */
export function PreviewFrame({ src, title }: { src: string; title: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const button = (value: "desktop" | "mobile", label: string, Icon: typeof Monitor) => (
    <button type="button" aria-pressed={device === value} onClick={() => setDevice(value)} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-[0.86rem] font-bold ${device === value ? "bg-atlantic text-salt" : "text-overnight"}`}>
      <Icon aria-hidden className="size-4" /> {label}
    </button>
  );
  return (
    <div>
      <div className="mb-3 inline-flex overflow-hidden rounded-brand border border-line bg-salt" role="group" aria-label="Preview width">
        {button("desktop", "Desktop", Monitor)}
        {button("mobile", "Mobile (390 px)", Smartphone)}
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-line bg-ink-soft/10 p-2">
        <iframe src={src} title={title} data-testid="preview-frame" className="mx-auto block h-[75vh] rounded-brand border border-line bg-salt" style={{ width: device === "mobile" ? 390 : "100%" }} />
      </div>
    </div>
  );
}
