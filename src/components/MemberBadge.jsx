import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ClubMemberIcon, { CLUB_MEMBER_LABEL } from './ClubMemberIcon';
import { useIsClubMember } from '../hooks/useClubMembers';
import './MemberBadge.css';

const TIP_VISIBLE_MS = 4000;
// Below this distance to the top of the viewport the tip opens downwards
// (header avatars).
const TIP_FLIP_TOP_PX = 64;
const TIP_HALF_WIDTH_PX = 120;

// Vereinsmitglied badge, bottom right on an avatar. Renders nothing for
// non-members. Needs a `position: relative` parent (like OnlineDot); use
// MemberBadgeFrame where the avatar has none. Hover shows the native title;
// a tap (touch) or click opens a small tip instead of following the link or
// button the avatar sits in. `interactive={false}`: purely decorative, taps go
// to the surrounding control (own avatar in the header opens the menu).
export default function MemberBadge({ uid, className = '', interactive = true }) {
  const isMember = useIsClubMember(uid);
  const ref = useRef(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    if (!tip) return undefined;
    const close = () => setTip(null);
    const timer = setTimeout(close, TIP_VISIBLE_MS);
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [tip]);

  if (!isMember) return null;

  const toggleTip = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (tip) {
      setTip(null);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const vw = window.innerWidth || 0;
    const center = rect.left + rect.width / 2;
    const x =
      vw > 2 * TIP_HALF_WIDTH_PX
        ? Math.min(Math.max(center, TIP_HALF_WIDTH_PX), vw - TIP_HALF_WIDTH_PX)
        : vw / 2;
    const below = rect.top < TIP_FLIP_TOP_PX;
    setTip({ x, y: below ? rect.bottom : rect.top, below });
  };

  return (
    <>
      <span
        ref={ref}
        className={`member-badge${interactive ? '' : ' member-badge--static'} ${className}`.trim()}
        role="img"
        aria-label={CLUB_MEMBER_LABEL}
        title={CLUB_MEMBER_LABEL}
        data-testid="member-badge"
        onClick={interactive ? toggleTip : undefined}
        // keep the document listener from closing the tip we are toggling
        onPointerDown={interactive ? (e) => e.stopPropagation() : undefined}
      >
        <ClubMemberIcon />
      </span>
      {tip &&
        createPortal(
          <span
            className={`member-badge-tip${tip.below ? ' member-badge-tip--below' : ''}`}
            style={{ left: tip.x, top: tip.y }}
            role="tooltip"
            data-testid="member-badge-tip"
          >
            {CLUB_MEMBER_LABEL}
          </span>,
          document.body
        )}
    </>
  );
}

// For avatars without a positioned wrapper (event organiser, chat, header):
// members get a small inline wrapper that carries the badge; for everyone else
// the avatar is returned unchanged, so their markup and layout stay as before.
export function MemberBadgeFrame({ uid, children, className = '', interactive = true }) {
  const isMember = useIsClubMember(uid);
  if (!isMember) return children;
  return (
    <span className={`member-badge-frame ${className}`.trim()}>
      {children}
      <MemberBadge uid={uid} interactive={interactive} />
    </span>
  );
}
