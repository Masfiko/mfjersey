import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ImageOff } from "lucide-react";

export default function JerseyImage({ path, alt, className }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    let blobUrl = null;
    if (!path) return;
    (async () => {
      try {
        const res = await api.get(`/files/${path}`, { responseType: "blob" });
        if (!active) return;
        blobUrl = URL.createObjectURL(res.data);
        setSrc(blobUrl);
      } catch {
        if (active) setErr(true);
      }
    })();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [path]);

  if (!path || err) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className || ""}`}>
        <ImageOff className="w-4 h-4" />
      </div>
    );
  }
  if (!src) {
    return <div className={`bg-gray-100 animate-pulse ${className || ""}`} />;
  }
  return <img src={src} alt={alt || ""} className={className} />;
}
