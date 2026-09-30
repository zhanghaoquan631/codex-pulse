"use client";
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { interfaceSoundEnabled, playClickSound, setInterfaceSound } from "@/lib/theme-sound";

export default function SoundToggle() {
  const [enabled,setEnabled] = useState(true);
  useEffect(() => {
    const read = () => setEnabled(interfaceSoundEnabled());
    read(); window.addEventListener("storage",read);
    return () => window.removeEventListener("storage",read);
  },[]);
  function toggle() {
    const next = !enabled;
    setInterfaceSound(next); setEnabled(next);
    if (next) playClickSound();
  }
  return <button type="button" className="pulse-sound-toggle" aria-label={enabled?"关闭互动音效":"开启互动音效"} title={enabled?"关闭互动音效":"开启互动音效"} aria-pressed={enabled} onClick={toggle}>{enabled?<Volume2 size={16}/>:<VolumeX size={16}/>}</button>;
}
