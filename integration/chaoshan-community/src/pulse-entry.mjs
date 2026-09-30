import './opc-hub.mjs';
import './pulse-integration.css';
window.loadCommunityAtlas=()=>import(/* @vite-ignore */ document.body.dataset.atlasRuntime);
