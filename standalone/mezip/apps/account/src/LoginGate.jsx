import { useRef, useState } from 'react'
import ShaderBackground from './ShaderBackground.jsx'
import RippleDistortion from './RippleDistortion.jsx'
import './login-gate.css'
import { chatGPTSignInPath } from './chatgpt-auth.mjs'

const LOGIN_URL = '/#login'
const DOCK_ICON = `${import.meta.env.BASE_URL}assets/nolan-dock-icon-v1.jpg`

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" className="login-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

function MeZipLogo() {
  return (
    <span className="login-react-bits-logo">
      <svg className="login-react-bits-symbol" width="26" height="24" viewBox="0 0 121 111" fill="none" aria-hidden="true">
        <path
          d="M33.0566 1.2334C37.9779 -1.27485 43.4695 0.403499 47.9893 3.04688L52.0088 5.39747L47.3066 13.4375L43.2871 11.0859C39.6122 8.93669 37.8643 9.23684 37.2852 9.53223L37.2822 9.53321C36.8061 9.77562 35.8378 10.6285 35.2676 13.4961C34.7104 16.2984 34.7155 20.2651 35.4668 25.252C35.8549 27.8274 36.4314 30.6045 37.1914 33.5391C40.2154 33.0912 43.3653 32.7285 46.6143 32.459C52.0524 23.67 57.8676 16.1928 63.4717 10.6729C67.4729 6.73169 71.559 3.59644 75.5029 1.77637C79.2644 0.040584 83.6303 -0.806932 87.6348 1.04102L88.0215 1.22754L88.0303 1.23243C90.9871 2.74423 92.8606 5.36312 93.9639 8.23243C95.0534 11.0665 95.4994 14.3884 95.5166 17.8984L95.5391 22.5557L86.2256 22.6016L86.2021 17.9443C86.1883 15.1033 85.8183 13.0004 85.2705 11.5752C84.7408 10.1976 84.1592 9.71715 83.7998 9.53028L83.7012 9.48438C83.16 9.25832 81.8961 9.08392 79.4053 10.2334C76.809 11.4316 73.6019 13.7685 70.0078 17.3086C66.1594 21.0992 62.0858 26.0511 58.0781 31.9092C58.8948 31.8977 59.7159 31.8916 60.54 31.8916C76.3309 31.8917 90.8223 34.0182 101.526 37.5859C106.854 39.3617 111.502 41.5795 114.913 44.2676C118.271 46.9143 121.079 50.5655 121.079 55.1758C121.079 59.149 118.974 62.4262 116.285 64.9121C113.597 67.3973 109.943 69.4733 105.781 71.1914L101.477 72.9678L97.9229 64.3594L102.228 62.582C105.827 61.0963 108.383 59.5329 109.963 58.0723C111.542 56.613 111.765 55.6359 111.766 55.1758C111.766 54.6422 111.445 53.3927 109.148 51.583C106.904 49.8141 103.366 48.0169 98.5811 46.4219C89.059 43.2481 75.6084 41.2051 60.54 41.2051C57.6647 41.2051 54.8478 41.2804 52.1064 41.4229C50.7354 43.7996 49.391 46.2745 48.0859 48.835C47.0022 50.9612 45.9819 53.0744 45.0273 55.165C45.7956 56.848 46.6059 58.5465 47.458 60.2539L48.0918 61.5107L48.0928 61.5127C54.9326 74.9435 62.8585 86.001 70.0088 93.044C73.6021 96.5832 76.8089 98.9194 79.4043 100.116C82.0551 101.338 83.3157 101.06 83.7949 100.817C84.2199 100.601 85.0268 99.9192 85.6123 97.708C86.1957 95.5045 86.389 92.3377 86 88.249C85.2254 80.1085 82.2468 69.3477 77.1582 57.668L75.2979 53.3994L83.8369 49.6787L85.6973 53.9482C91.0397 66.2106 94.3758 77.9532 95.2715 87.3672C95.7175 92.0554 95.5848 96.43 94.6152 100.092C93.6478 103.745 91.6743 107.255 88.0264 109.115L88.0234 109.116C83.9155 111.208 79.3878 110.365 75.5039 108.574C71.5596 106.755 67.4736 103.62 63.4727 99.6797C55.6256 91.9505 47.3654 80.3809 40.3086 66.7412C37.9003 73.4733 36.2726 79.7229 35.4639 85.0967C34.7133 90.0843 34.7088 94.0515 35.2666 96.8545C35.8019 99.5439 36.6867 100.462 37.1875 100.766L37.2822 100.818L37.2861 100.82C38.0214 101.195 40.4312 101.419 45.3291 97.9463L49.1279 95.2529L54.5146 102.851L50.7158 105.544C45.4568 109.273 38.8615 112.081 33.0518 109.116V109.115C28.9459 107.022 26.9663 102.865 26.1318 98.6719C25.2842 94.4119 25.4182 89.2633 26.2539 83.71C27.5099 75.3643 30.4464 65.4968 34.8477 55.166C33.2573 51.4327 31.8588 47.7593 30.6611 44.1973C27.7032 44.8524 24.9688 45.5987 22.499 46.4219C17.7136 48.0169 14.1765 49.814 11.9316 51.583C9.63478 53.3931 9.31455 54.6421 9.31445 55.1758C9.3148 56.0066 10.2169 58.2651 15.5332 61.0459L19.6602 63.2051L15.3428 71.458L11.2168 69.2988C5.49461 66.3058 0.000272404 61.6967 0 55.1758C9.44643e-05 50.5652 2.80826 46.9144 6.16699 44.2676C9.57834 41.5794 14.226 39.3617 19.5537 37.5859C22.1612 36.7169 24.9938 35.9342 28.0146 35.2461C27.2554 32.24 26.6666 29.3582 26.2568 26.6387C25.4203 21.0862 25.2858 15.9383 26.1328 11.6787C26.967 7.48424 28.9474 3.32558 33.0566 1.2334ZM40.3477 37.8252C37.5921 37.8252 35.3577 40.059 35.3574 42.8145C35.3574 45.5702 37.592 47.8047 40.3477 47.8047C43.1032 47.8045 45.3369 45.57 45.3369 42.8145C45.3367 40.0591 43.103 37.8254 40.3477 37.8252Z"
          fill="currentColor"
        />
      </svg>
      <span className="login-react-bits-word">ME·zip</span>
      <span className="login-pro-pill">Pro</span>
      <span className="sr-only">ME·zip Pro</span>
    </span>
  )
}

function LoginStudioDock() {
  return (
    <nav className="login-studio-dock" aria-label="ME·zip 快捷入口">
      <div className="login-studio-dock-shell">
        <span className="login-studio-dock-caption">QUICK LAUNCH</span>
        <a
          className="login-studio-dock-link"
          href={LOGIN_URL}
          aria-label="打开 ME·zip 登录页"
          title="打开 ME·zip 登录页"
          data-destination={LOGIN_URL}
        >
          <img className="login-studio-dock-photo" src={DOCK_ICON} alt="" draggable="false" />
          <span className="login-studio-dock-link-label">Login</span>
          <span className="login-studio-dock-link-arrow" aria-hidden="true">↗</span>
        </a>
      </div>
    </nav>
  )
}

function LoginHeader() {
  return (
    <div className="login-gate-header">
      <a className="login-brand-link" href="/playground/" aria-label="ME·zip Pro">
        <MeZipLogo />
      </a>
      <a className="login-back-link" href="/racing/" title="打开简笔画赛车">
        <ArrowLeftIcon />
        <span>简笔画</span>
      </a>
    </div>
  )
}

function LibraryPanel() {
  return (
    <div className="login-library-wrap" id="login-visual-panel">
      <div className="login-library-panel">
        <div className="login-library-gradient" aria-hidden="true" />
        <RippleDistortion
          src={`${import.meta.env.BASE_URL}media/ripple-flower.jpg`}
          className="login-library-ripple"
        />
        <div className="login-library-top-fade" aria-hidden="true" />
        <div className="login-library-bottom-fade" aria-hidden="true" />
        <div className="login-library-ring" aria-hidden="true" />
        <div className="login-library-content">
          <div>
            <h2>Discover extraordinary visuals, follow inspiring creators, and unlock work worth collecting</h2>
            <p>Sign in to browse the full library &amp; install components.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginGate({ error, onRetry, loading }) {
  const [split, setSplit] = useState(50)
  const shellRef = useRef(null)
  const splitDragRef = useRef(false)
  const leftPointerRef = useRef({ x: 0.5, y: 0.5, active: false })

  const moveSplit = event => {
    if (!splitDragRef.current) return
    const bounds = shellRef.current.getBoundingClientRect()
    setSplit(Math.max(35, Math.min(65, ((event.clientX - bounds.left) / bounds.width) * 100)))
  }

  const stopSplitDrag = event => {
    splitDragRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onSplitKeyDown = event => {
    const steps = { ArrowLeft: -2, ArrowRight: 2 }
    if (event.key in steps) {
      event.preventDefault()
      setSplit(value => Math.max(35, Math.min(65, value + steps[event.key])))
    } else if (['Home', 'End', 'Enter'].includes(event.key)) {
      event.preventDefault()
      setSplit(event.key === 'Home' ? 35 : event.key === 'End' ? 65 : 50)
    }
  }

  const handleLeftPointerMove = event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    leftPointerRef.current.x = x
    leftPointerRef.current.y = y
    leftPointerRef.current.active = true
    event.currentTarget.style.setProperty('--login-pointer-x', `${x * 100}%`)
    event.currentTarget.style.setProperty('--login-pointer-y', `${y * 100}%`)
  }

  const handleLeftPointerLeave = event => {
    leftPointerRef.current.active = false
    event.currentTarget.style.setProperty('--login-pointer-x', '50%')
    event.currentTarget.style.setProperty('--login-pointer-y', '50%')
  }

  return (
    <main ref={shellRef} className="login-gate-shell" style={{ '--login-split': `${split}%` }}>
      <section id="login-form-panel" className="login-form-column" onPointerMove={handleLeftPointerMove} onPointerLeave={handleLeftPointerLeave}>
        <ShaderBackground
          pointerRef={leftPointerRef}
          className="login-form-shader"
          backdrop="#0a0a0a"
          opacity={0.94}
        />
        <LoginHeader />
        <div className="login-form-center">
          <div className="login-form-wrap">
            <div className="login-form-heading">
              <h1>欢迎回来</h1>
              <p>登录后，收藏、照片和游戏进度会保存在你的账号中。</p>
            </div>
            <a className="login-primary-button login-chatgpt-button" href={chatGPTSignInPath()} target="_top">
              使用 ChatGPT 登录 <span aria-hidden="true">↗</span>
            </a>
            <p className="login-access-copy">需要 ChatGPT 账号。继续后会打开官方登录页面。</p>
            {loading && <p className="login-status" role="status">正在检查登录状态…</p>}
            {error && <div className="login-error" role="alert"><p>{error}</p><button className="login-outline-button" type="button" onClick={onRetry}>重新检查</button></div>}
            <a className="login-outline-button login-secondary-button login-chatgpt-button" href="/playground/">先逛逛作品和游戏</a>
          </div>
        </div>
        <div className="login-form-footer">
          <LoginStudioDock />
          <p className="login-terms">By signing in you agree to our <a href="/license">license terms</a> and <a href="/privacy">privacy policy</a>.</p>
        </div>
      </section>
      <div
        className="login-panel-divider"
        role="separator"
        tabIndex={0}
        aria-label="调整登录区与花朵图片区宽度"
        aria-orientation="vertical"
        aria-controls="login-form-panel login-visual-panel"
        aria-valuemin={35}
        aria-valuemax={65}
        aria-valuenow={Math.round(split)}
        title="拖动调整两侧宽度，双击恢复居中"
        onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          splitDragRef.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={moveSplit}
        onPointerUp={stopSplitDrag}
        onPointerCancel={stopSplitDrag}
        onLostPointerCapture={() => { splitDragRef.current = false }}
        onDoubleClick={() => setSplit(50)}
        onKeyDown={onSplitKeyDown}
      >
        <span className="login-panel-divider-handle" aria-hidden="true">‹ ›</span>
      </div>
      <LibraryPanel />
    </main>
  )
}
