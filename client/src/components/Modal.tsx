export const cancelBtnStyle: React.CSSProperties = {
  width: "100%", padding: "12px",
  background: "none", border: "1px solid var(--color-border)",
  borderRadius: "99px", cursor: "pointer",
  color: "var(--color-text-muted)", fontWeight: 600,
  fontSize: "var(--text-sm)",
};

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "hsl(220 14% 13%)",
        border: "1px solid var(--color-border)",
        borderRadius: "20px",
        padding: "28px 24px",
        width: "100%",
        maxWidth: "360px",
      }}>
        {children}
      </div>
    </div>
  );
}
