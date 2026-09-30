import React, { useCallback, useEffect, useRef, useState } from 'react';
import ProfileCard from '../ProfileCard/ProfileCard.jsx';
import './LanyardCard.css';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const CORNERS = [
  ['tl', '左上角'],
  ['tr', '右上角'],
  ['bl', '左下角'],
  ['br', '右下角']
];

const initialPose = () => ({ x: 0, y: 0, rotation: 0 });

/**
 * A DOM-card adaptation of the React Bits Lanyard interaction.
 *
 * The original Lanyard uses a rope simulation around a 3D card. Here the
 * user's real ProfileCard stays as DOM so its face, typography and hover tilt
 * remain intact. The rope, clip and four corner drag handles are kept in a
 * separate layer; dragging a handle temporarily hands the card to a small
 * spring/fling controller.
 */
export default function LanyardCard({ avatarUrl, iconUrl, grainUrl }) {
  const sceneRef = useRef(null);
  const stageRef = useRef(null);
  const ropeSvgRef = useRef(null);
  const ropeShadowRef = useRef(null);
  const ropeCoreRef = useRef(null);
  const ropeHighlightRef = useRef(null);
  const strapLeftRef = useRef(null);
  const strapRightRef = useRef(null);
  const animationRef = useRef(null);
  const poseRef = useRef(initialPose());
  const statusRef = useRef('hanging');
  const dragRef = useRef(null);
  const [status, setStatus] = useState('hanging');

  const setStatusSafe = useCallback(next => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const setStagePose = useCallback(pose => {
    poseRef.current = pose;
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty('--drag-x', `${pose.x}px`);
    stage.style.setProperty('--drag-y', `${pose.y}px`);
    stage.style.setProperty('--drag-rotation', `${pose.rotation}deg`);
  }, []);

  const toViewBox = useCallback((x, y, width, height) => {
    return [x * (1000 / Math.max(width, 1)), y * (1000 / Math.max(height, 1))];
  }, []);

  const updateRope = useCallback(() => {
    const scene = sceneRef.current;
    const stage = stageRef.current;
    if (!scene || !stage) return;

    const sceneRect = scene.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (!sceneRect.width || !sceneRect.height) return;

    const anchor = toViewBox(sceneRect.width / 2, 27, sceneRect.width, sceneRect.height);
    const cardTopCenter = toViewBox(
      stageRect.left + stageRect.width / 2 - sceneRect.left,
      stageRect.top - sceneRect.top + 5,
      sceneRect.width,
      sceneRect.height
    );
    const cardLeftTop = toViewBox(
      stageRect.left + stageRect.width * 0.22 - sceneRect.left,
      stageRect.top - sceneRect.top + 7,
      sceneRect.width,
      sceneRect.height
    );
    const cardRightTop = toViewBox(
      stageRect.left + stageRect.width * 0.78 - sceneRect.left,
      stageRect.top - sceneRect.top + 7,
      sceneRect.width,
      sceneRect.height
    );

    const [ax, ay] = anchor;
    const [cx, cy] = cardTopCenter;
    const dx = cx - ax;
    const sway = clamp(dx * 0.22, -110, 110);
    const midX = ax + dx * 0.52;
    const midY = ay + (cy - ay) * 0.54;
    const d = `M ${ax.toFixed(2)} ${ay.toFixed(2)} C ${(ax - 68 + sway).toFixed(2)} ${(ay + 92).toFixed(2)}, ${(midX + sway).toFixed(2)} ${(midY - 36).toFixed(2)}, ${cx.toFixed(2)} ${cy.toFixed(2)}`;
    const setPath = ref => ref.current?.setAttribute('d', d);
    setPath(ropeShadowRef);
    setPath(ropeCoreRef);
    setPath(ropeHighlightRef);

    const [lx, ly] = cardLeftTop;
    const [rx, ry] = cardRightTop;
    strapLeftRef.current?.setAttribute('d', `M ${cx.toFixed(2)} ${(cy + 1).toFixed(2)} L ${lx.toFixed(2)} ${ly.toFixed(2)}`);
    strapRightRef.current?.setAttribute('d', `M ${cx.toFixed(2)} ${(cy + 1).toFixed(2)} L ${rx.toFixed(2)} ${ry.toFixed(2)}`);
  }, [toViewBox]);

  const applyPoseAndRope = useCallback(
    pose => {
      setStagePose(pose);
      updateRope();
    },
    [setStagePose, updateRope]
  );

  const cancelAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const springBack = useCallback(() => {
    cancelAnimation();
    setStatusSafe('returning');
    const started = performance.now();
    const from = { ...poseRef.current };
    const duration = 560;
    const tick = now => {
      const t = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const pose = {
        x: from.x * (1 - eased),
        y: from.y * (1 - eased),
        rotation: from.rotation * (1 - eased)
      };
      applyPoseAndRope(pose);
      if (t < 1) animationRef.current = requestAnimationFrame(tick);
      else {
        animationRef.current = null;
        applyPoseAndRope(initialPose());
        setStatusSafe('hanging');
      }
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [applyPoseAndRope, cancelAnimation, setStatusSafe]);

  const fling = useCallback(
    (velocityX, velocityY, displacementX, displacementY) => {
      cancelAnimation();
      setStatusSafe('flung');
      const length = Math.hypot(velocityX, velocityY) || Math.hypot(displacementX, displacementY) || 1;
      const directionX = velocityX || displacementX;
      const directionY = velocityY || displacementY;
      const scale = Math.max(1, 760 / length);
      const velocity = {
        x: clamp(directionX * scale, -1250, 1250),
        y: clamp(directionY * scale, -1100, 1100),
        rotation: clamp((velocityX * 0.025 + velocityY * 0.012) || displacementX * 0.03, -18, 18)
      };
      let last = performance.now();
      const tick = now => {
        const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
        last = now;
        const current = poseRef.current;
        const next = {
          x: current.x + velocity.x * dt,
          y: current.y + velocity.y * dt,
          rotation: current.rotation + velocity.rotation * dt
        };
        velocity.x *= Math.pow(0.985, dt * 60);
        velocity.y = velocity.y * Math.pow(0.985, dt * 60) + 520 * dt;
        velocity.rotation *= Math.pow(0.97, dt * 60);
        applyPoseAndRope(next);

        const scene = sceneRef.current;
        const stage = stageRef.current;
        const sceneRect = scene?.getBoundingClientRect();
        const stageRect = stage?.getBoundingClientRect();
        const outside =
          sceneRect && stageRect &&
          (stageRect.right < sceneRect.left - 160 ||
            stageRect.left > sceneRect.right + 160 ||
            stageRect.bottom < sceneRect.top - 160 ||
            stageRect.top > sceneRect.bottom + 160);
        if (outside) {
          animationRef.current = null;
          setStatusSafe('gone');
          return;
        }
        animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);
    },
    [applyPoseAndRope, cancelAnimation, setStatusSafe]
  );

  const beginDrag = useCallback(
    (event, corner) => {
      if (statusRef.current === 'gone') return;
      event.preventDefault();
      event.stopPropagation();
      cancelAnimation();

      const scene = sceneRef.current;
      const stage = stageRef.current;
      if (!scene || !stage) return;
      const sceneRect = scene.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const pose = poseRef.current;
      const centerX = stageRect.left + stageRect.width / 2;
      const centerY = stageRect.top + stageRect.height / 2;
      dragRef.current = {
        pointerId: event.pointerId,
        corner,
        baseCenterX: centerX - pose.x,
        baseCenterY: centerY - pose.y,
        offsetX: event.clientX - centerX,
        offsetY: event.clientY - centerY,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        velocityX: 0,
        velocityY: 0,
        sceneRect
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      stage.classList.add('is-dragging');
      setStatusSafe('dragging');
    },
    [cancelAnimation, setStatusSafe]
  );

  const moveDrag = useCallback(
    event => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      const dt = Math.max(8, now - drag.lastTime);
      const rawVelocityX = ((event.clientX - drag.lastX) / dt) * 1000;
      const rawVelocityY = ((event.clientY - drag.lastY) / dt) * 1000;
      drag.velocityX = drag.velocityX * 0.72 + rawVelocityX * 0.28;
      drag.velocityY = drag.velocityY * 0.72 + rawVelocityY * 0.28;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastTime = now;

      const sceneRect = sceneRef.current?.getBoundingClientRect() || drag.sceneRect;
      const x = clamp(
        event.clientX - drag.offsetX - drag.baseCenterX,
        -sceneRect.width * 1.25,
        sceneRect.width * 1.25
      );
      const y = clamp(
        event.clientY - drag.offsetY - drag.baseCenterY,
        -sceneRect.height * 1.2,
        sceneRect.height * 1.2
      );
      const rotation = clamp(x * 0.055 + y * 0.012 + (drag.velocityX - drag.velocityY) * 0.008, -26, 26);
      applyPoseAndRope({ x, y, rotation });
    },
    [applyPoseAndRope]
  );

  const endDrag = useCallback(
    event => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const speed = Math.hypot(drag.velocityX, drag.velocityY);
      dragRef.current = null;
      stageRef.current?.classList.remove('is-dragging');
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      if (Math.hypot(dx, dy) > 95 || speed > 620) {
        fling(drag.velocityX, drag.velocityY, dx, dy);
      } else {
        springBack();
      }
    },
    [fling, springBack]
  );

  const resetCard = useCallback(() => {
    dragRef.current = null;
    stageRef.current?.classList.remove('is-dragging', 'is-gone');
    setStagePose(poseRef.current);
    springBack();
  }, [setStagePose, springBack]);

  useEffect(() => {
    const onResize = () => updateRope();
    window.addEventListener('resize', onResize);
    const observer = typeof ResizeObserver !== 'undefined' && sceneRef.current
      ? new ResizeObserver(onResize)
      : null;
    if (observer) observer.observe(sceneRef.current);
    const raf = requestAnimationFrame(updateRope);
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      cancelAnimationFrame(raf);
      cancelAnimation();
    };
  }, [cancelAnimation, updateRope]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key.toLowerCase() === 'r' || event.key === 'Escape') resetCard();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetCard]);

  const mark = `${import.meta.env.BASE_URL}assets/lanyard-mark.png`;

  return (
    <section className={`lanyard-scene scene-${status}`} ref={sceneRef} aria-label="弓弦影的挂绳资料卡">
      <svg ref={ropeSvgRef} className="lanyard-rope" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <path ref={ropeShadowRef} className="rope-shadow" />
        <path ref={ropeCoreRef} className="rope-core" />
        <path ref={ropeHighlightRef} className="rope-highlight" />
        <path ref={strapLeftRef} className="rope-strap" />
        <path ref={strapRightRef} className="rope-strap" />
      </svg>

      <div className="lanyard-anchor" aria-hidden="true">
        <span className="anchor-halo" />
        <span className="anchor-ring" />
        <img src={mark} alt="" />
      </div>

      <div className="lanyard-card-stage" ref={stageRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="lanyard-clip" aria-hidden="true">
          <span className="clip-loop" />
          <span className="clip-body" />
        </div>
        <div className="card-frame" aria-label="Alex 的 FDE 产品经理资料卡">
          <ProfileCard
            avatarUrl={avatarUrl}
            iconUrl={iconUrl}
            grainUrl={grainUrl}
            name="弓弦影"
            title="Alex · FDE产品经理"
            showUserInfo={false}
            enableTilt
            enableMobileTilt={false}
          />
        </div>

        <div className="corner-handles" aria-label="卡片四角拖拽区">
          {CORNERS.map(([corner, label]) => (
            <button
              key={corner}
              type="button"
              className={`corner-handle handle-${corner}`}
              aria-label={`从${label}拖出卡片`}
              onPointerDown={event => beginDrag(event, corner)}
            >
              <span className="handle-ring" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {status === 'hanging' && <div className="lanyard-caption" aria-hidden="true"><span>FDE / 01</span><i /></div>}
      {(status === 'gone' || status === 'flung') && (
        <button type="button" className="rehang-button" onClick={resetCard} aria-label="把资料卡重新挂回">
          <span>重新挂回</span>
          <b>↗</b>
        </button>
      )}
    </section>
  );
}
