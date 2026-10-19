/**
 * Fixed full-screen atmosphere: drifting aurora blobs and a faded grid.
 */
export default function Backdrop() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-bg">
      <div
        className="absolute -top-[22%] -left-[12%] w-[62vw] h-[62vw] rounded-full blur-[110px] animate-drift"
        style={{ background: "rgb(var(--primary-600))", opacity: "var(--blob-a)" }}
      />
      <div
        className="absolute -bottom-[28%] -right-[10%] w-[58vw] h-[58vw] rounded-full blur-[120px] animate-drift [animation-delay:-8s]"
        style={{ background: "rgb(var(--secondary-500))", opacity: "calc(var(--blob-a) * .75)" }}
      />
      <div
        className="absolute top-[35%] left-[40%] w-[34vw] h-[34vw] rounded-full blur-[100px] animate-drift [animation-delay:-13s]"
        style={{ background: "rgb(var(--primary-800))", opacity: "calc(var(--blob-a) * .8)" }}
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--fg) / var(--grid-a)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--fg) / var(--grid-a)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 35%, #000 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 35%, #000 20%, transparent 75%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg/80" />
    </div>
  );
}
