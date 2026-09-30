import { useEffect, useMemo, useState } from 'react'

import './PersonalCardMarket.css'

const SAVED_IMAGES_KEY = 'rbp-free-image-saves-v1'

const readSavedImages = () => {
  if (typeof window === 'undefined') return []
  try {
    const stored = JSON.parse(window.localStorage.getItem(SAVED_IMAGES_KEY) || '[]')
    return Array.isArray(stored) ? stored.filter(value => typeof value === 'string') : []
  } catch {
    return []
  }
}

const fileExtension = image => {
  const match = String(image || '').match(/\.([a-z0-9]+)(?:[?#]|$)/i)
  return match?.[1] || 'jpg'
}

export default function PersonalCardMarket({ cards = [], initialCard = null }) {
  const [selectedId, setSelectedId] = useState(initialCard?.rewardUrl || cards[0]?.rewardUrl || '')
  const [filter, setFilter] = useState('')
  const [savedIds, setSavedIds] = useState(readSavedImages)
  const [message, setMessage] = useState('')
  const [cloudUser, setCloudUser] = useState(false)
  useEffect(() => {
    let cancelled=false
    fetch('/api/account/saves',{cache:'no-store'}).then(async response=>{
      if(response.ok){const data=await response.json();if(!cancelled){setCloudUser(true);setSavedIds(data.saved)}}
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[])

  useEffect(() => {
    if (initialCard?.rewardUrl) setSelectedId(initialCard.rewardUrl)
  }, [initialCard])

  const selectedCard = cards.find(card => card.rewardUrl === selectedId) || cards[0]
  const visibleCards = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return cards
    return cards.filter(card => card.title.toLowerCase().includes(query) || String(card.number).padStart(3, '0').includes(query))
  }, [cards, filter])
  const savedCards = useMemo(() => cards.filter(card => savedIds.includes(card.rewardUrl)), [cards, savedIds])

  const saveSelected = () => {
    if (!selectedCard) return
    const nextSavedIds = savedIds.includes(selectedCard.rewardUrl)
      ? savedIds
      : [...savedIds, selectedCard.rewardUrl]
    setSavedIds(nextSavedIds)
    window.localStorage.setItem(SAVED_IMAGES_KEY, JSON.stringify(nextSavedIds))

    const link = document.createElement('a')
    link.href = selectedCard.image
    link.download = `公开视觉档案-${String(selectedCard.number).padStart(3, '0')}.${fileExtension(selectedCard.image)}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setMessage(`已开始免费下载「${selectedCard.title}」。`)
    if(cloudUser)fetch('/api/account/saves',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:selectedCard.rewardUrl})})
      .then(response=>{if(!response.ok)throw new Error();setMessage('图片已下载，收藏记录已保存到账号。')})
      .catch(()=>setMessage('图片已下载；账号收藏暂未保存，请稍后再试。'))
  }

  return <section className="personal-card-market" id="card-market" data-market-count={cards.length} data-payment-mode="free" aria-labelledby="personal-card-market-title">
    <div className="personal-card-market-heading">
      <div>
        <p className="personal-drift-eyebrow">PUBLIC ARCHIVE · FREE DOWNLOAD</p>
        <h3 id="personal-card-market-title">选一张，免费保存下来。</h3>
        <p>全部图片均可公开浏览和免费下载。无需登录、无需积分，选择后直接保存到本地。</p>
      </div>
      <div className="personal-card-market-price" aria-label="免费保存">
        <span>全部公开</span>
        <strong>免费</strong>
        <small>{cards.length} 张可选 · ¥0</small>
      </div>
    </div>

    <div className="personal-card-market-layout">
      <div className="personal-card-market-picker">
        <div className="personal-card-market-toolbar">
          <label htmlFor="personal-card-market-filter">查找公开图片</label>
          <input id="personal-card-market-filter" type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="编号或名称" />
          <span>显示 {visibleCards.length} 张</span>
        </div>
        <div className="personal-card-market-list" role="listbox" aria-label="选择要免费保存的图片">
          {visibleCards.map(card => <button
            type="button"
            role="option"
            key={card.rewardUrl}
            aria-selected={card.rewardUrl === selectedCard?.rewardUrl}
            className={'personal-card-market-option' + (card.rewardUrl === selectedCard?.rewardUrl ? ' is-selected' : '')}
            data-card-id={card.rewardUrl}
            onClick={() => { setSelectedId(card.rewardUrl); setMessage('') }}
          >
            <span className="personal-card-market-option-number">{String(card.number).padStart(3, '0')}</span>
            <span className="personal-card-market-option-title">{card.title}</span>
            {savedIds.includes(card.rewardUrl) && <span className="personal-card-market-option-state">已保存</span>}
          </button>)}
        </div>
      </div>

      <div className="personal-card-market-detail">
        {selectedCard ? <div className="personal-card-market-art"><img src={selectedCard.image} alt={selectedCard.title} /><span>{String(selectedCard.number).padStart(3, '0')} / PUBLIC</span></div> : null}
        <div className="personal-card-market-detail-copy">
          <p className="personal-card-market-detail-kicker">YOUR SELECTION</p>
          <h4>{selectedCard?.title || '尚未选择'}</h4>
          <button className="personal-card-market-buy" type="button" disabled={!selectedCard} onClick={saveSelected}>免费保存所选图片 ↘</button>
          <p className="personal-card-market-note">不会扣除积分，也不需要支付；同一张图片可以反复保存。</p>
          {message && <p className="personal-card-market-message" role="status">{message}</p>}
        </div>
      </div>
    </div>

    <div className="personal-card-market-library">
      <div><p className="personal-card-market-detail-kicker">MY SAVED IMAGES</p><h4>已经免费保存的图片</h4></div>
      {savedCards.length ? <div className="personal-card-market-saved-list">{savedCards.map(card => <a className="personal-card-market-saved-item" href={card.image} download key={card.rewardUrl}><img src={card.image} alt="" /><span><strong>{card.title}</strong><small>再次保存到本地 ↘</small></span></a>)}</div> : <p className="personal-card-market-library-empty">选择任意图片并点击“免费保存”，记录会出现在这里。</p>}
    </div>
  </section>
}
