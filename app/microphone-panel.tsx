"use client";
import { useState } from "react";
import { ExternalLink, Mic, Monitor, Smartphone, Square } from "lucide-react";
import { useMicrophone } from "@/hooks/use-microphone";
import { micYouAddress } from "@/lib/microphone-utils";
import { useMusic } from "./music-provider";
import { MicrophoneInputs, MicrophoneMeter, MicrophoneRecording, MicrophoneTone } from "./microphone-audio";
import MicrophoneReceiver from "./microphone-receiver";

function MicYouDesktop() {
  const [address, setAddress] = useState("https://localhost:8443/"), [error, setError] = useState("");
  const url = micYouAddress(address);
  return <div className="mic-native"><div className="mic-subheading"><h3>把手机用于会议、直播与 OBS</h3><a href="https://github.com/LanRhyme/MicYou/releases/latest" className="music-button" target="_blank" rel="noopener noreferrer">下载 MicYou<ExternalLink size={16}/></a></div>
    <ol><li>电脑安装 MicYou 桌面端，手机安装 Android 客户端，或使用它的 Web 模式。</li><li>手机与电脑连同一 Wi-Fi。在 MicYou 里选择 Wi-Fi 连接；Android 也可用 USB / ADB。</li><li>Windows 安装 VB-CABLE 后，MicYou 输出选择 <strong>CABLE Input</strong>，会议软件或本站输入选择 <strong>CABLE Output</strong>。</li></ol>
    <p className="mic-note">macOS 可使用 BlackHole；Linux 可使用 PipeWire 虚拟输入。音频路由需要在电脑上设置。</p>
    <form onSubmit={event => { event.preventDefault(); if (!url) { setError("请输入 MicYou 显示的本机或局域网 HTTPS 地址，例如 https://192.168.1.10:8443/。"); return; } setError(""); window.open(url, "_blank", "noopener,noreferrer"); }} className="mic-native-form"><label htmlFor="micyou-address">MicYou Web 地址<input id="micyou-address" type="url" value={address} onChange={event => { setAddress(event.target.value); setError(""); }} placeholder="https://192.168.1.10:8443/" autoComplete="off"/></label><button className="music-button" type="submit">打开原生 Web 客户端<ExternalLink size={16}/></button></form>
    {error && <p className="mic-error" role="alert">{error}</p>}
    <p className="mic-note">先在桌面端开启 Web 服务。手机上请填写电脑的局域网 IP；localhost 只用于电脑本机。首次打开时按 MicYou 的证书说明完成连接。</p>
    <p className="mic-note">MicYou 的 Web 客户端需要在它自己的地址里打开。连接成功后，回到“本机录音”，刷新设备并选择虚拟输入，就能在本站调音和录音。</p>
    <div className="mic-native-links"><a href="https://github.com/LanRhyme/MicYou" target="_blank" rel="noopener noreferrer">MicYou 使用说明</a><a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer">VB-CABLE 官方下载</a><a href="https://github.com/LanRhyme/MicYou/blob/master/LICENSE" target="_blank" rel="noopener noreferrer">开源许可</a></div>
  </div>;
}

export default function MicrophonePanel() {
  const mic = useMicrophone(), music = useMusic(), [mode, setMode] = useState("local");
  return <section className="mic-workspace" aria-labelledby="mic-heading"><div className="mic-heading"><span className="mic-heading-icon"><Mic size={23}/></span><div><h2 id="mic-heading">麦克风工作台</h2><p>录下声音，或把手机的麦克风接到这台电脑。</p></div></div>
    <div className="mic-mode-switch" role="group" aria-label="麦克风工作方式">{[{ id: "local", text: "本机录音", Icon: Mic }, { id: "phone", text: "手机传音", Icon: Smartphone }, { id: "native", text: "MicYou 桌面", Icon: Monitor }].map(({ id, text, Icon }) => <button className="music-button" key={id} disabled={mic.phase !== "idle" || mic.recording} aria-pressed={mode === id} onClick={() => { mic.setError(""); setMode(id); }}><Icon size={16}/>{text}</button>)}</div>
    {mode === "native" ? <MicYouDesktop/> : <>
      {mode === "local" ? <><MicrophoneInputs mic={mic}/><div className="mic-start-actions">{mic.phase === "idle" ? <button className="music-button music-primary" onClick={() => { music.pause(); void mic.start(); }}><Mic size={17}/>开启麦克风</button> : <button className="music-button" onClick={mic.stop}><Square size={16}/>{mic.phase === "requesting" ? "取消开启" : "停用麦克风"}</button>}<span role="status">{mic.phase === "requesting" ? "等待麦克风许可…" : mic.phase === "active" ? "正在采集音频" : "点击开启后，浏览器会请求麦克风许可"}</span></div></> : <MicrophoneReceiver mic={mic} beforeStart={music.pause}/>}
      {mic.error && <p className="mic-error" role="alert">{mic.error}</p>}
      <MicrophoneMeter mic={mic}/><MicrophoneTone mic={mic}/><MicrophoneRecording mic={mic} beforePlay={music.pause}/>
    </>}
    <p className="mic-credit">参考 <a href="https://github.com/LanRhyme/MicYou" target="_blank" rel="noopener noreferrer">MicYou</a> 的手机麦克风工作流。网页传音接收在本页面；会议软件的系统麦克风请使用“MicYou 桌面”。</p>
  </section>;
}
