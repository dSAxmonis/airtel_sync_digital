// Mitu, the advisor's mascot: a round chat-bubble buddy with an antenna that sends out little signals.
// state: 'idle' (float and blink), 'greet' (wave and hop), 'thinking' (looks up, antenna pulses), 'happy' (bounce and sparkle).
import { useId } from 'react';

export default function Mitu({ state = 'idle', size = 40, className = '', title }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className={`mitu mitu-${state} ${className}`} style={{ width: size, height: size }} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="mitu-body">
        <defs>
          <linearGradient id={`mb${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff6b5c" />
            <stop offset=".55" stopColor="#e40000" />
            <stop offset="1" stopColor="#b30012" />
          </linearGradient>
        </defs>
        {/* antenna and its signals */}
        <g className="mitu-antenna">
          <path d="M60 26 V13" stroke="#b30012" strokeWidth="4" strokeLinecap="round" />
          <circle cx="60" cy="10" r="5.5" fill="#ff6b5c" stroke="#b30012" strokeWidth="2" />
          <g className="mitu-signal" fill="none" stroke="#e40000" strokeWidth="3" strokeLinecap="round">
            <path d="M49 6 Q45 10 49 15" className="mitu-s1" /><path d="M71 6 Q75 10 71 15" className="mitu-s1" />
            <path d="M43 2 Q37 10 43 19" className="mitu-s2" /><path d="M77 2 Q83 10 77 19" className="mitu-s2" />
          </g>
        </g>
        {/* waving hand (behind the body) */}
        <g className="mitu-hand"><ellipse cx="103" cy="62" rx="9" ry="11" fill={`url(#mb${id})`} /></g>
        {/* chat-bubble body with a small tail */}
        <path d="M34 88 L25 106 L52 92 Z" fill="#c4000f" />
        <rect x="16" y="24" width="88" height="72" rx="36" fill={`url(#mb${id})`} />
        <ellipse cx="42" cy="38" rx="17" ry="8" fill="#fff" opacity=".32" transform="rotate(-18 42 38)" />
        {/* face */}
        <g className="mitu-eyes">
          <ellipse cx="46" cy="58" rx="7.5" ry="9.5" fill="#2b0a0d" />
          <ellipse cx="74" cy="58" rx="7.5" ry="9.5" fill="#2b0a0d" />
          <circle cx="49" cy="54" r="3" fill="#fff" /><circle cx="77" cy="54" r="3" fill="#fff" />
          <circle cx="44" cy="62" r="1.4" fill="#fff" opacity=".8" /><circle cx="72" cy="62" r="1.4" fill="#fff" opacity=".8" />
        </g>
        <ellipse cx="33" cy="71" rx="7" ry="4.5" fill="#ffb3b8" opacity=".85" />
        <ellipse cx="87" cy="71" rx="7" ry="4.5" fill="#ffb3b8" opacity=".85" />
        <path className="mitu-smile" d="M52 72 Q60 80 68 72" fill="none" stroke="#2b0a0d" strokeWidth="3.4" strokeLinecap="round" />
        <path className="mitu-grin" d="M51 71 Q60 84 69 71 Z" fill="#2b0a0d" />
        {/* sparkles for the happy state */}
        <g className="mitu-sparkles" fill="#ffb300">
          <path d="M14 22 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
          <path d="M106 18 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" />
        </g>
      </svg>
    </span>
  );
}

// Three bouncing dots, used in the "thinking" chat bubble.
export function TypingDots() {
  return <span className="mitu-dots" aria-hidden="true"><i /><i /><i /></span>;
}
