import { useEffect, useState } from 'react'

// Split in source coordinates, so fitting to any frame cannot mix the panels.
export default function CompleteSplitImage({ src, alt, className = '' }) {
  const [size, setSize] = useState(null)
  useEffect(() => {
    let disposed = false
    const image = new Image()
    image.onload = () => {
      if (!disposed) setSize([image.naturalWidth, image.naturalHeight])
    }
    image.src = src
    return () => { disposed = true }
  }, [src])
  const [width, height] = size || [1, 1]
  return <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={alt}>
    {size && <>
      <svg width={width} height={height / 2} viewBox={`0 0 ${width} ${height / 2}`} overflow="hidden">
        <image href={src} width={width} height={height} transform={`rotate(180 ${width / 2} ${height / 4})`} />
      </svg>
      <svg y={height / 2} width={width} height={height / 2} viewBox={`0 ${height / 2} ${width} ${height / 2}`} overflow="hidden">
        <image href={src} width={width} height={height} />
      </svg>
    </>}
  </svg>
}
