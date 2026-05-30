import { useId } from 'react'

interface LogoProps {
  size?: number
  withName?: boolean
  className?: string
}

export default function Logo({ size = 32, withName = false, className = '' }: LogoProps) {
  const gradId = useId()

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="TutorsPad"
        role="img"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4338ca" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="112" fill={`url(#${gradId})`} />
        <rect x="96" y="248" width="320" height="36" rx="18" fill="white" />
        <rect x="128" y="284" width="36" height="120" rx="18" fill="white" />
        <rect x="348" y="284" width="36" height="120" rx="18" fill="white" />
        <path d="M168 136 Q200 128 256 148 L256 248 Q200 228 168 236 Z" fill="rgba(255,255,255,0.92)" />
        <path d="M344 136 Q312 128 256 148 L256 248 Q312 228 344 236 Z" fill="rgba(255,255,255,0.75)" />
        <line x1="256" y1="148" x2="256" y2="248" stroke="rgba(79,70,229,0.4)" strokeWidth="4" />
        <rect x="310" y="118" width="14" height="72" rx="7" fill="rgba(255,255,255,0.6)" transform="rotate(20 317 154)" />
        <polygon points="317,186 310,202 324,202" fill="rgba(255,255,255,0.5)" transform="rotate(20 317 154)" />
      </svg>

      {withName && (
        <span
          style={{ fontSize: size * 0.55, lineHeight: 1 }}
          className="font-bold tracking-tight text-gray-900"
        >
          Tutors<span className="text-indigo-600">Pad</span>
        </span>
      )}
    </span>
  )
}
