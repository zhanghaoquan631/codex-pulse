import type { Metadata } from "next";
import MicrophoneSender from "../microphone-sender";
export const metadata: Metadata = { title: "手机麦克风 · Codex Pulse", description: "把手机声音传到电脑上的麦克风工作台。" };
export default function Page() { return <MicrophoneSender/>; }
