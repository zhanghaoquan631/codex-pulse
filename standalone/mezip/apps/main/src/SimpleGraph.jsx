import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import "./SimpleGraph.css";

/**
 * A small, dependency-free SVG line graph.
 *
 * Values are expressed in a fixed 800 x 400 viewBox so the graph stays crisp
 * while its wrapper remains responsive.
 */
export function SimpleGraph({
  data = [],
  lineColor = "#5227FF",
  dotColor = "#5227FF",
  width = "100%",
  height = 300,
  animationDuration = 2,
  showGrid = true,
  gridStyle = "solid",
  gridLines = "both",
  gridLineThickness = 1,
  showDots = true,
  dotSize = 6,
  dotHoverGlow = false,
  curved = true,
  gradientFade = false,
  graphLineThickness = 3,
  calculatePercentageDifference = false,
  animateOnScroll = false,
  animateOnce = true,
  className = "",
}) {
  const graphId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(null);
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 });
  const [hasEntered, setHasEntered] = useState(!animateOnScroll);
  const [animationCycle, setAnimationCycle] = useState(0);

  // Ignore malformed points rather than letting one NaN poison the whole SVG.
  const points = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data
      .map((point) => {
        const value = Number(point?.value);
        if (!Number.isFinite(value)) return null;
        return {
          value,
          label:
            point?.label === undefined || point?.label === null
              ? ""
              : String(point.label),
        };
      })
      .filter(Boolean);
  }, [data]);

  useEffect(() => {
    if (!animateOnScroll) {
      setHasEntered(true);
      return undefined;
    }

    const node = wrapperRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setHasEntered(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEntered(true);
          setAnimationCycle((cycle) => cycle + 1);
          if (animateOnce) observer.disconnect();
        } else if (!animateOnce) {
          setHasEntered(false);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [animateOnScroll, animateOnce]);

  const chart = useMemo(() => {
    if (!points.length) return { points: [], path: "", area: "" };

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || 1;
    const lower = min - spread * 0.1;
    const upper = max + spread * 0.1;
    const range = upper - lower || 1;

    const positioned = points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? 400 : 40 + (index / (points.length - 1)) * 720,
      y: 360 - ((point.value - lower) / range) * 320,
    }));

    const path = buildPath(positioned, curved);
    const area = gradientFade ? buildAreaPath(positioned, curved) : "";
    return { points: positioned, path, area };
  }, [points, curved, gradientFade]);

  const duration = Math.max(0, Number(animationDuration) || 0);
  const wrapperStyle = {
    width: typeof width === "number" ? `${width}px` : width,
    height: `${Math.max(0, Number(height) || 0)}px`,
    "--sg-duration": `${duration}s`,
    "--sg-line-color": lineColor,
    "--sg-dot-color": dotColor,
  };

  const activePoint =
    activeIndex === null ? null : chart.points[activeIndex] || null;
  const activeDifference =
    calculatePercentageDifference && activeIndex !== null
      ? percentageDifference(points, activeIndex)
      : null;

  const handleMove = (event, index) => {
    const svg = svgRef.current;
    const point = chart.points[index];
    if (!svg || !point) return;

    // Convert the pointer to viewBox coordinates so the tiny tooltip tilt is
    // stable at every responsive width.
    try {
      const screenPoint = svg.createSVGPoint();
      screenPoint.x = event.clientX;
      screenPoint.y = event.clientY;
      const matrix = svg.getScreenCTM();
      const local = matrix ? screenPoint.matrixTransform(matrix.inverse()) : null;
      if (local) {
        setPointerOffset({
          x: clamp((local.x - point.x) * 0.2, -15, 15),
          y: clamp((local.x - point.x) * 0.15, -20, 20),
        });
      }
    } catch {
      // Older SVG implementations may not expose getScreenCTM; the tooltip
      // still works without the subtle pointer-following offset.
    }
  };

  const handleEnter = (index) => {
    setActiveIndex(index);
    setPointerOffset({ x: 0, y: 0 });
  };

  const handleLeave = () => {
    setActiveIndex(null);
    setPointerOffset({ x: 0, y: 0 });
  };

  return (
    <div
      ref={wrapperRef}
      className={`sg-graph ${className}`.trim()}
      style={wrapperStyle}
      data-animate-state={hasEntered ? "visible" : "hidden"}
      aria-label="Line graph"
    >
      <svg
        ref={svgRef}
        className="sg-graph__svg"
        viewBox="0 0 800 400"
        role="img"
        aria-label="Animated line graph"
      >
        <defs>
          <linearGradient
            id={`sg-gradient-${graphId}`}
            x1="0"
            y1="40"
            x2="0"
            y2="360"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {showGrid && (
          <g className="sg-graph__grid" opacity="0.1" aria-hidden="true">
            {(gridLines === "horizontal" || gridLines === "both") &&
              [0, 1, 2, 3, 4].map((index) => (
                <line
                  key={`h-${index}`}
                  x1="40"
                  y1={40 + (320 * index) / 4}
                  x2="760"
                  y2={40 + (320 * index) / 4}
                  stroke="currentColor"
                  strokeWidth={gridLineThickness}
                  strokeDasharray={dashArray(gridStyle)}
                />
              ))}
            {(gridLines === "vertical" || gridLines === "both") &&
              chart.points.map((point, index) => (
                <line
                  key={`v-${index}`}
                  x1={point.x}
                  y1="40"
                  x2={point.x}
                  y2="360"
                  stroke="currentColor"
                  strokeWidth={gridLineThickness}
                  strokeDasharray={dashArray(gridStyle)}
                />
              ))}
          </g>
        )}

        {gradientFade && chart.area && (
          <path
            key={`area-${animationCycle}`}
            className="sg-graph__area"
            d={chart.area}
            fill={`url(#sg-gradient-${graphId})`}
            pathLength="1"
            aria-hidden="true"
          />
        )}

        {chart.path && (
          <path
            key={`line-${animationCycle}`}
            className="sg-graph__line"
            d={chart.path}
            fill="none"
            stroke={lineColor}
            strokeWidth={graphLineThickness}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
          />
        )}

        {showDots &&
          chart.points.map((point, index) => {
            const isActive = activeIndex === index;
            return (
              <g
                key={`point-${animationCycle}-${index}`}
                className={`sg-graph__point${isActive ? " is-active" : ""}`}
                onMouseEnter={() => handleEnter(index)}
                onMouseLeave={handleLeave}
                onMouseMove={(event) => handleMove(event, index)}
                onFocus={() => handleEnter(index)}
                onBlur={handleLeave}
                tabIndex={0}
                role="button"
                aria-label={`${point.label || `Point ${index + 1}`}: ${point.value}`}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="60"
                  fill="transparent"
                  className="sg-graph__hit-area"
                />
                {dotHoverGlow && isActive && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={Math.max(2, dotSize) * 2}
                    fill={dotColor}
                    className="sg-graph__glow"
                  />
                )}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={Math.max(0, Number(dotSize) || 0)}
                  fill={dotColor}
                  stroke="white"
                  strokeWidth="2"
                  className="sg-graph__dot"
                  style={{ animationDelay: `${index * 80}ms` }}
                />
              </g>
            );
          })}

        {activePoint && !(calculatePercentageDifference && activeIndex === 0) && (
          <foreignObject
            className="sg-graph__tooltip-anchor"
            x={activePoint.x - 75}
            y={activePoint.y - 84}
            width="150"
            height="84"
            aria-hidden="true"
          >
            <div
              className="sg-graph__tooltip-wrap"
              style={{
                transform: `translate(${pointerOffset.x}px, ${pointerOffset.y}px) rotate(${pointerOffset.x}deg)`,
              }}
            >
              <div className="sg-graph__tooltip">
                {activeDifference ? (
                  <div
                    className={`sg-graph__difference ${
                      activeDifference.isIncrease ? "is-up" : "is-down"
                    }`}
                  >
                    <span aria-hidden="true">
                      {activeDifference.isIncrease ? "↑" : "↓"}
                    </span>
                    <span>
                      {activeDifference.isIncrease ? "+" : "-"}
                      {activeDifference.percentage.toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <div className="sg-graph__value">
                    {activePoint.value.toFixed(2)}
                  </div>
                )}
                {activePoint.label && (
                  <div className="sg-graph__label">{activePoint.label}</div>
                )}
              </div>
              <span className="sg-graph__caret" />
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}

export default SimpleGraph;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dashArray(style) {
  if (style === "dashed") return "5,5";
  if (style === "dotted") return "1,3";
  return undefined;
}

function buildPath(points, curved) {
  if (!points.length) return "";
  if (!curved || points.length === 1) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" ");
  }

  let path = `M ${points[0].x},${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midpoint = current.x + (next.x - current.x) / 2;
    path += ` C ${midpoint},${current.y} ${midpoint},${next.y} ${next.x},${next.y}`;
  }
  return path;
}

function buildAreaPath(points, curved) {
  if (!points.length) return "";
  return `${buildPath(points, curved)} L ${points[points.length - 1].x},360 L ${points[0].x},360 Z`;
}

function percentageDifference(points, index) {
  if (index <= 0 || !points[index - 1]) return null;
  const current = points[index].value;
  const previous = points[index - 1].value;
  if (previous === 0) return null;
  const change = current - previous;
  return {
    percentage: Math.abs((change / Math.abs(previous)) * 100),
    isIncrease: change >= 0,
  };
}


