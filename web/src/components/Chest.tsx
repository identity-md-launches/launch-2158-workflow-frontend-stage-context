export function Chest({
  muted = false,
  small = false,
}: {
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <svg
      className={`chest ${muted ? "chest-muted" : ""} ${small ? "chest-small" : ""}`}
      viewBox="0 0 112 96"
      fill="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path fill="#080d0b" d="M16 78h80v6H16zM10 72h92v6H10z" />
      <g className="chest-sparkles" fill="#f4d989">
        <path d="M12 20h4v12h-4zM8 24h12v4H8zM92 8h4v12h-4zM88 12h12v4H88zM80 0h4v4h-4zM28 4h4v4h-4z" />
      </g>
      <path fill="#44311c" d="M20 36h72v38H20z" />
      <path fill="#b77b32" d="M24 42h64v28H24z" />
      <path fill="#71451e" d="M28 48h56v18H28z" />
      <path fill="#dba548" d="M24 44h8v26h-8zM80 44h8v26h-8zM32 66h48v4H32z" />
      <path fill="#f7d77f" d="M24 44h4v22h-4zM80 44h4v22h-4z" />
      <path fill="#251f16" d="M20 36h72v10H20z" />
      <path fill="#ffe9a3" d="M28 34h56v8H28z" />
      <g className="chest-lid">
        <path fill="#513c22" d="M20 24h8v-8h56v8h8v18H20z" />
        <path fill="#c38b36" d="M24 26h8v-6h48v6h8v12H24z" />
        <path
          fill="#f1c563"
          d="M32 20h48v4H32zM24 26h8v4h-8zM80 26h8v4h-8zM24 34h64v4H24z"
        />
        <path fill="#7d5024" d="M36 26h40v8H36z" />
        <path fill="#f7d77f" d="M28 24h8v14h-8zM76 24h8v14h-8z" />
      </g>
      <path fill="#e7af45" d="M46 40h20v20H46z" />
      <path fill="#ffe3a0" d="M46 40h20v4H46zM46 44h4v12h-4z" />
      <path fill="#49301a" d="M54 46h6v6h-6zM56 50h2v6h-2z" />
      <path
        fill="#dca342"
        d="M6 66h10v4H6zM8 62h8v4H8zM94 66h10v4H94zM90 70h16v4H90z"
      />
      <path fill="#ffe099" d="M8 62h6v2H8zM94 66h8v2h-8zM90 70h12v2H90z" />
    </svg>
  );
}
