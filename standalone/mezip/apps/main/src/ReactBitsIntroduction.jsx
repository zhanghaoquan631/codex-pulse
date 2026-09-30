/**
 * React Bits Pro Introduction — public document main content.
 * Source: https://pro.reactbits.dev/docs/introduction (2026-09-11)
 * Independently scoped adaptation of its publicly rendered HTML and styles.
 * No paid component implementation, account UI, or registry credential is included.
 */
import './ReactBitsIntroduction.css';

export default function ReactBitsIntroduction({ theme = 'light', className = '', style, id = 'reactbits-introduction' }) {
  return (
    <article id={id} className={`rbi-document ${className}`} data-rbi-theme={theme} style={style} aria-label="React Bits Pro introduction">
      <div className="rbi-content">
      <header className="rbi-header">
      <h1 className="rbi-title">Introduction</h1>
      <p className="rbi-lead">The interfaces people remember take weeks to build.<span className="rbi-muted"> React Bits Pro gives you the pieces, the tooling to assemble them, and the instructions your AI agent needs to do it for you.</span>
      </p>
      </header>
      <div className="rbi-shell rbi-stats">
      <div className="rbi-panel rbi-stat">
      <div className="rbi-stat-value">150</div>
      <div className="rbi-stat-label">Animated components</div>
      </div>
      <div className="rbi-panel rbi-stat">
      <div className="rbi-stat-value">280</div>
      <div className="rbi-stat-label">Marketing blocks</div>
      </div>
      <div className="rbi-panel rbi-stat">
      <div className="rbi-stat-value">300</div>
      <div className="rbi-stat-label">Application UI blocks</div>
      </div>
      <div className="rbi-panel rbi-stat">
      <div className="rbi-stat-value">15</div>
      <div className="rbi-stat-label">Full templates</div>
      </div>
      </div>
      <section className="rbi-section">
      <h2 className="rbi-section-title">The library</h2>
      <p className="rbi-section-subtitle">Four collections, one registry. Install any of them with a single command.</p>
      <div className="rbi-section-content">
      <div className="rbi-shell rbi-library">
      <a target="_blank" rel="noreferrer" className="rbi-panel rbi-library-card" href="https://pro.reactbits.dev/docs/components">
      <div className="rbi-card-top rbi-card-top-spread">
      <span className="rbi-icon-box rbi-icon-box-hover">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <path d="m18 16 4-4-4-4">
      </path>
      <path d="m6 8-4 4 4 4">
      </path>
      <path d="m14.5 4-5 16">
      </path>
      </svg>
      </span>
      <span className="rbi-plan">All plans</span>
      </div>
      <h3 className="rbi-card-title">Components<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon rbi-arrow" aria-hidden="true">
      <path d="M5 12h14">
      </path>
      <path d="m12 5 7 7-7 7">
      </path>
      </svg>
      </h3>
      <p className="rbi-description">150 animated primitives, text effects, backgrounds, WebGL. Tailwind or vanilla CSS, your pick.</p>
      </a>
      <a target="_blank" rel="noreferrer" className="rbi-panel rbi-library-card" href="https://pro.reactbits.dev/docs/blocks">
      <div className="rbi-card-top rbi-card-top-spread">
      <span className="rbi-icon-box rbi-icon-box-hover">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2">
      </path>
      <rect x="14" y="2" width="8" height="8" rx="1">
      </rect>
      </svg>
      </span>
      <span className="rbi-plan">Pro &amp; Ultimate</span>
      </div>
      <h3 className="rbi-card-title">Blocks<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon rbi-arrow" aria-hidden="true">
      <path d="M5 12h14">
      </path>
      <path d="m12 5 7 7-7 7">
      </path>
      </svg>
      </h3>
      <p className="rbi-description">280 marketing sections across 22 categories. Heroes, pricing, features, FAQ, footers.</p>
      </a>
      <a target="_blank" rel="noreferrer" className="rbi-panel rbi-library-card" href="https://pro.reactbits.dev/docs/app-ui">
      <div className="rbi-card-top rbi-card-top-spread">
      <span className="rbi-icon-box rbi-icon-box-hover">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <rect width="7" height="9" x="3" y="3" rx="1">
      </rect>
      <rect width="7" height="5" x="14" y="3" rx="1">
      </rect>
      <rect width="7" height="9" x="14" y="12" rx="1">
      </rect>
      <rect width="7" height="5" x="3" y="16" rx="1">
      </rect>
      </svg>
      </span>
      <span className="rbi-plan">Pro &amp; Ultimate</span>
      </div>
      <h3 className="rbi-card-title">Application UI<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon rbi-arrow" aria-hidden="true">
      <path d="M5 12h14">
      </path>
      <path d="m12 5 7 7-7 7">
      </path>
      </svg>
      </h3>
      <p className="rbi-description">300 blocks of real product chrome: app shells, data tables, dashboards, settings, AI surfaces.</p>
      </a>
      <a target="_blank" rel="noreferrer" className="rbi-panel rbi-library-card" href="https://pro.reactbits.dev/docs/templates">
      <div className="rbi-card-top rbi-card-top-spread">
      <span className="rbi-icon-box rbi-icon-box-hover">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <rect width="18" height="7" x="3" y="3" rx="1">
      </rect>
      <rect width="9" height="7" x="3" y="14" rx="1">
      </rect>
      <rect width="5" height="7" x="16" y="14" rx="1">
      </rect>
      </svg>
      </span>
      <span className="rbi-plan">Ultimate</span>
      </div>
      <h3 className="rbi-card-title">Templates<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon rbi-arrow" aria-hidden="true">
      <path d="M5 12h14">
      </path>
      <path d="m12 5 7 7-7 7">
      </path>
      </svg>
      </h3>
      <p className="rbi-description">15 complete landing pages, designed end to end and ready to deploy.</p>
      </a>
      </div>
      <p className="rbi-library-note">New drops every month, included with your license. The code is copied into your repo, so it is yours the moment it lands.</p>
      </div>
      </section>
      <section className="rbi-section">
      <h2 className="rbi-section-title">Two ways to skip the assembly</h2>
      <p className="rbi-section-subtitle">Having the pieces is half of it. These put the page together.</p>
      <div className="rbi-section-content">
      <div className="rbi-shell rbi-stack">
      <div className="rbi-panel rbi-tool-card">
      <div className="rbi-card-top">
      <span className="rbi-icon-box">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <path d="M12 8V4H8">
      </path>
      <rect width="16" height="12" x="4" y="8" rx="2">
      </rect>
      <path d="M2 14h2">
      </path>
      <path d="M20 14h2">
      </path>
      <path d="M15 13v2">
      </path>
      <path d="M9 13v2">
      </path>
      </svg>
      </span>
      <h3 className="rbi-medium">Agent Kit</h3>
      <span className="rbi-plan rbi-plan-end">Pro &amp; Ultimate</span>
      </div>
      <p className="rbi-description rbi-description-constrained">Your agent writes the page, you review it. Hand it a design skill for the look, a prompt for the vertical, and a recipe that names the exact blocks to assemble.</p>
      <ul className="rbi-bullets">
      <li className="rbi-bullet">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-bullet-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      <span>8 complete design skills files for your agent</span>
      </li>
      <li className="rbi-bullet">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-bullet-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      <span>8 detailed page prompts covering different niches</span>
      </li>
      <li className="rbi-bullet">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-bullet-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      <span>3 full-page recipes with a block-by-block build plan</span>
      </li>
      </ul>
      <a data-slot="button" className="rbi-button" href="https://pro.reactbits.dev/docs/agent-kit">Open Agent Kit<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      </a>
      </div>
      <div className="rbi-panel rbi-tool-card">
      <div className="rbi-card-top">
      <span className="rbi-icon-box">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <path d="M14 4.1 12 6">
      </path>
      <path d="m5.1 8-2.9-.8">
      </path>
      <path d="m6 12-1.9 2">
      </path>
      <path d="M7.2 2.2 8 5.1">
      </path>
      <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z">
      </path>
      </svg>
      </span>
      <h3 className="rbi-medium">Landing Builder (Beta)</h3>
      <span className="rbi-plan rbi-plan-end">Pro &amp; Ultimate</span>
      </div>
      <p className="rbi-description rbi-description-constrained">Compose the block library into a whole page by dragging, edit the copy inline, then take the code with you. What you see on the canvas is exactly what exports.</p>
      <ul className="rbi-bullets">
      <li className="rbi-bullet">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-bullet-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      <span>Drag, reorder and swap any marketing block</span>
      </li>
      <li className="rbi-bullet">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-bullet-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      <span>Click any text on the canvas to rewrite it</span>
      </li>
      <li className="rbi-bullet">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-bullet-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      <span>Export a Next.js project, loose files, or an agent prompt</span>
      </li>
      </ul>
      <a data-slot="button" className="rbi-button" href="https://pro.reactbits.dev/builder">Open the builder<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rbi-icon" aria-hidden="true">
      <path d="m9 18 6-6-6-6">
      </path>
      </svg>
      </a>
      </div>
      </div>
      </div>
      </section>
      <section className="rbi-section">
      <h2 className="rbi-section-title">Why teams pick React Bits Pro</h2>
      <div className="rbi-section-content">
      <div className="rbi-reasons">
      <p className="rbi-muted">
      <strong className="rbi-emphasis">The code lives in your repo.</strong> Not in node_modules. Read it, bend it, make it yours. Nothing breaks if you never update.</p>
      <p className="rbi-muted">
      <strong className="rbi-emphasis">It performs.</strong> Strict TypeScript, tested across devices, tuned for 60fps, and audited for portability before it ships.</p>
      <p className="rbi-muted">
      <strong className="rbi-emphasis">Your AI agent already knows it.</strong> Install the skill file once and Claude, Cursor or Copilot can install and compose the whole library on its own.</p>
      </div>
      </div>
      </section>
      <section className="rbi-section">
      <h2 className="rbi-section-title">Shipping in three steps</h2>
      <div className="rbi-section-content">
      <div className="rbi-shell rbi-stack">
      <div className="rbi-panel rbi-step">
      <span className="rbi-step-number">1</span>
      <div className="rbi-min-width">
      <p className="rbi-step-title">Grab a license</p>
      <p className="rbi-step-description">Starter, Pro, or Ultimate. Yearly or lifetime, your call.</p>
      </div>
      </div>
      <div className="rbi-panel rbi-step">
      <span className="rbi-step-number">2</span>
      <div className="rbi-min-width">
      <p className="rbi-step-title">Connect the registry</p>
      <p className="rbi-step-description">Drop your key in .env.local, point components.json at us.</p>
      </div>
      </div>
      <div className="rbi-panel rbi-step">
      <span className="rbi-step-number">3</span>
      <div className="rbi-min-width">
      <p className="rbi-step-title">Install anything</p>
      <p className="rbi-step-description">npx shadcn@latest add, or let your AI agent do it for you.</p>
      </div>
      </div>
      </div>
      </div>
      </section>
      </div>
    </article>
  );
}
