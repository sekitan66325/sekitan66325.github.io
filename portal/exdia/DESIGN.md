# ExDia Official Product Site — DESIGN.md (`https://sekitan.net/exdia/`)

> **Design Contract**: Solid-surface **Light Minimal** (`#FFFFFF` / `#F7F8FA`) harmonized with `portal/portal.css` (`sekitan.net`), paired with rotating 4-edition brand accents (`web` / `plus` / `pro` / `ultra`) on fixed `#FFFFFF` ground and an anodized **Matte Black** (`#141518`) flagship finish for ExDia Ultra.

---

## 1. Design Tokens (YAML)

```yaml
name: ExDia Official Product Site — Light Minimal (sekitan.net/exdia)
colors:
  bg-canvas: "#FFFFFF"          # Fixed pure white ground (including opening overlay)
  bg-subtle: "#F7F8FA"
  bg-control: "#F1F3F6"
  bg-header: "rgba(255, 255, 255, 0.88)"
  ink-primary: "#111318"        # 18.6:1 on white (AAA)
  ink-secondary: "#5F6672"      # 5.74:1 on white, 5.40:1 on #F7F8FA (AA)
  border-hairline: "rgba(17, 19, 24, 0.09)"
  border-control: "rgba(17, 19, 24, 0.16)"
  ultra-surface: "#141518"
  ultra-media-bg: "#1C1E24"
  ultra-ink: "#FFFFFF"
  ultra-ink-sub: "#D0D5DD"
  ultra-ink-muted: "#98A1AE"
  ultra-gold: "#D4AA3B"
  ultra-gold-hover: "#E2BC54"
  ultra-gold-hi: "#F3D27A"
  ultra-gold-light-text: "#7A5B0D"
  brand-web: "#2C6266"
  brand-web-hover: "#214A4D"
  brand-plus: "#821432"
  brand-pro: "#1D3984"
edition_palettes:
  web:   { rect: "#2C6266", diag: "#38BDF8", e: "#2C6266", x1: "#0284C7", x2: "#2C6266", dia: "#0F172A", dot: "#2C6266", accent: "#2C6266" }
  plus:  { rect: "#821432", diag: "#FDE68A", e: "#821432", x1: "#E11D48", x2: "#821432", dia: "#1E293B", dot: "#E11D48", accent: "#821432" }
  pro:   { rect: "#1D3984", diag: "#7DD3FC", e: "#1D3984", x1: "#2563EB", x2: "#1D3984", dia: "#0F172A", dot: "#1D3984", accent: "#1D3984" }
  ultra: { rect: "#18191B", diag: "#C99E32", e: "#18191B", x1: "#C99E32", x2: "#18191B", dia: "#18191B", dot: "#C99E32", accent: "#18191B" }
typography:
  font-sans: '"Noto Sans JP", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic UI", sans-serif'
  font-price: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif'
  price-num-size: "2.15rem"
  price-num-weight: "600"
motion:
  ease-out-expo: "cubic-bezier(0.16, 1, 0.3, 1)"
  ease-in-out-quart: "cubic-bezier(0.77, 0, 0.175, 1)"
  opening-intro: "min(460px, 76vw) desktop / min(320px, 82vw) mobile; 0ms..1840ms SVG draw + curtain wipe"
  mask-heading: "translateY(110%) skewY(2deg) -> none (620ms ease-out-expo)"
  curtain-wipe: "::after scaleX(0->1->0) rectangle wipe on media frames"
  stretch-rule: "scaleX(0->1) left-origin hairline rule (540ms ease-in-out-quart)"
  tab-clip-wipe: "clip-path: inset(0 100% 0 0) -> inset(0 0 0 0) (320ms ease-out-expo)"
  card-wave: "opacity + translateY(18px) scale(0.98) -> none staggered 0/70/140/210ms (520ms ease-out-expo)"
  reduced-motion: "Disabled via @media (prefers-reduced-motion: reduce)"
rounded:
  panel: "20px"
  card: "16px"
  md: "12px"
  btn: "8px"
  pill: "999px"
```

---

## 2. Negative Constraints (禁止ルール)

1. 背景の格子グリッド、斜め背景 SVG、紫グラデーション、ぼかし発光オーブ、絵文字アイコン、煽り文句（「一番人気！」等）、バウンスアニメーションの禁止。
2. HTML テキスト内の生 Markdown バッククォート（`` ` ``）残存、およびアナリティクス滞在時間表記・くどい説明口調リード文の禁止。
3. オープニングおよびページ全体の背景は 4 色ローテーション時も常に白 `#FFFFFF` を維持すること。
4. `prefers-reduced-motion: reduce` 時は全アニメーションを即静止表示すること。
