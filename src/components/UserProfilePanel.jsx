import { useState, useEffect, useRef } from "react";

const PERMISOS = {
  todos:       { label: "Todos los permisos",   bg: "#FFF0E0", fg: "#C2410C" },
  monitoreo:   { label: "Monitoreo",            bg: "#EFF6FF", fg: "#1D4ED8" },
  informes:    { label: "Informes",             bg: "#F5F3FF", fg: "#7C3AED" },
  biblioteca:  { label: "Biblioteca",           bg: "#ECFDF5", fg: "#059669" },
  visualizar:  { label: "Visualizar · ENTIDAD", bg: "#FFFBEB", fg: "#D97706" },
  restringido: { label: "Restringido",          bg: "#FEF2F2", fg: "#DC2626" },
};

export default function UserProfilePanel({
  open, onClose, user, onLogout,
  supabaseUrl, supabaseKey,
  avatarUrl, onAvatarChange,
}) {
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState(avatarUrl || null);
  const fileRef = useRef();

  useEffect(() => { setLocalAvatar(avatarUrl || null); }, [avatarUrl]);

  useEffect(() => {
    if (!open) return;
    fetch(`${supabaseUrl}/rest/v1/profiles?select=cargo,institucion,avatar_url,permisos&limit=1`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data[0]) {
          setProfile(data[0]);
          if (data[0].avatar_url) {
            setLocalAvatar(prev => {
              if (!prev) { onAvatarChange?.(data[0].avatar_url); return data[0].avatar_url; }
              return prev;
            });
          }
        }
      })
      .catch(() => {});
  }, [open, supabaseUrl, supabaseKey, onAvatarChange]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const filename = `avatar_${Date.now()}.${ext}`;
    try {
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/avatars/${filename}`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": file.type,
            "x-upsert": "true",
          },
          body: file,
        }
      );
      if (uploadRes.ok) {
        const url = `${supabaseUrl}/storage/v1/object/public/avatars/${filename}`;
        setLocalAvatar(url);
        onAvatarChange?.(url);
        // Persist to profiles table
        await fetch(`${supabaseUrl}/rest/v1/profiles?limit=1`, {
          method: "PATCH",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ avatar_url: url }),
        }).catch(() => {});
      }
    } catch {}
    setUploading(false);
    e.target.value = "";
  };

  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "MP";
  const permisoKeys = user?.isAdmin
    ? ["todos"]
    : (Array.isArray(profile?.permisos) ? profile.permisos : ["restringido"]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0,0,0,0.22)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.28s",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, zIndex: 1000,
          width: 240,
          background: "white",
          borderRadius: "0 18px 0 0",
          boxShadow: "6px -6px 40px rgba(108,63,160,0.2)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.4,0,0.2,1)",
          display: "flex", flexDirection: "column",
          maxHeight: "88vh", overflowY: "auto",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #6C3FA0 0%, #9B5FD4 100%)",
            padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderRadius: "0 18px 0 0",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "white", fontWeight: 700, fontSize: 14, letterSpacing: "0.02em" }}>
            Mi Perfil
          </span>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%",
              width: 26, height: 26, color: "white", fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1, flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "20px 16px 18px" }}>

          {/* Avatar */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              style={{ position: "relative", width: 76, height: 76, borderRadius: "50%", cursor: "pointer", flexShrink: 0 }}
              onMouseEnter={e => { const ov = e.currentTarget.querySelector(".av-ov"); if (ov) ov.style.opacity = "1"; }}
              onMouseLeave={e => { const ov = e.currentTarget.querySelector(".av-ov"); if (ov) ov.style.opacity = "0"; }}
            >
              {/* Ring */}
              <div style={{
                position: "absolute", inset: -3, borderRadius: "50%",
                background: "linear-gradient(135deg,#6C3FA0,#9B5FD4)",
                zIndex: 0,
              }}/>
              {localAvatar ? (
                <img
                  src={localAvatar} alt="avatar"
                  style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2.5px solid white" }}
                />
              ) : (
                <div style={{
                  position: "relative", zIndex: 1,
                  width: "100%", height: "100%", borderRadius: "50%",
                  background: "linear-gradient(135deg, #1B2F4E, #6C3FA0)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, fontWeight: 800, color: "white",
                  border: "2.5px solid white", boxSizing: "border-box",
                }}>{initials}</div>
              )}
              {/* Hover overlay */}
              <div className="av-ov" style={{
                position: "absolute", inset: 0, zIndex: 2, borderRadius: "50%",
                background: "rgba(108,63,160,0.75)",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: 0, transition: "opacity 0.18s",
                fontSize: 10, fontWeight: 800, color: "white", letterSpacing: "0.08em",
              }}>
                {uploading ? "⏳" : "CAMBIAR"}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
          </div>

          {/* Name & username */}
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1B2F4E", lineHeight: 1.3 }}>
              Mariam Pitti
            </div>
            <div style={{ fontSize: 12, color: "#8B9BB4", marginTop: 2 }}>@mpitti</div>
            {profile?.cargo && (
              <div style={{
                fontSize: 11, color: "#4A5568", marginTop: 8, fontWeight: 600,
                background: "#F7F8FA", borderRadius: 6, padding: "4px 10px", display: "inline-block",
              }}>
                {profile.cargo}
              </div>
            )}
            {profile?.institucion && (
              <div style={{ fontSize: 11, color: "#718096", marginTop: 4 }}>
                {profile.institucion}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#EEF2F8", margin: "0 -4px 14px" }} />

          {/* Permissions */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#A0AEC0",
              letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase",
            }}>
              Permisos
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {permisoKeys.map(key => {
                const p = PERMISOS[key];
                if (!p) return null;
                return (
                  <span
                    key={key}
                    style={{
                      padding: "3px 10px", borderRadius: 20,
                      background: p.bg, color: p.fg,
                      fontSize: 10, fontWeight: 700,
                      border: `1px solid ${p.fg}40`,
                    }}
                  >{p.label}</span>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#EEF2F8", margin: "0 -4px 14px" }} />

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              style={{
                padding: "9px 12px", border: "1.5px solid #6C3FA0", borderRadius: 8,
                background: "transparent", color: "#6C3FA0",
                fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#6C3FA0"; e.currentTarget.style.color = "white"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6C3FA0"; }}
            >
              ✏️ Editar perfil
            </button>
            <button
              onClick={() => { onClose(); onLogout(); }}
              style={{
                padding: "9px 12px", border: "1.5px solid #E53E3E", borderRadius: 8,
                background: "transparent", color: "#E53E3E",
                fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#E53E3E"; e.currentTarget.style.color = "white"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#E53E3E"; }}
            >
              → Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
