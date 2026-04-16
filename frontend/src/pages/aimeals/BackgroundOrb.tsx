export type OrbMode = "centered" | "docked";

export function BackgroundOrb({ mode }: { mode: OrbMode }) {
  return (
    <>
      <div
        className="ai-aurora-layer"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, #fde8e2 0%, #fff7e6 25%, #f0e9fa 50%, #fef3c7 75%, #fde8e2 100%)",
          backgroundSize: "400% 400%",
          animation: "auroraShift 25s ease infinite",
          opacity: 0.35,
          maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        className="ai-orb-layer"
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--se-primary) 28%, transparent) 0%, transparent 70%)",
          filter: "blur(40px)",
          top: mode === "centered" ? "38%" : "auto",
          bottom: mode === "centered" ? "auto" : "8%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          animation: "aiOrbit 25s ease-in-out infinite",
          transition: "top 600ms ease, bottom 600ms ease",
          pointerEvents: "none",
          opacity: 0.7,
          zIndex: 0,
        }}
      />
    </>
  );
}
